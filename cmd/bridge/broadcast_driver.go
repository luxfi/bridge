package main

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	luxlog "github.com/luxfi/log"

	"github.com/luxfi/bridge/internal/broadcast"
)

// broadcast_driver.go: background goroutine that pushes signed swaps
// onto their destination chain and advances them to completion.
//
// Pipeline position (final stage of the swap state machine):
//
//   bridge_transfer_pending_broadcasting   ── BroadcastDriver (this) ──┐
//                                                                      ▼
//   completed                              (DestTxHash populated; SDK polls return final state)
//
// Inputs the driver needs on the Swap:
//   - DestinationNetwork  (routing the broadcast to the right RPC)
//   - DestRawTx           (the wire-ready signed raw transaction —
//                          populated by future chain-specific tx
//                          assembly code; see swap_store.go::Swap.DestRawTx)
//
// State transitions and idempotency:
//   - On tick start, lists swaps in SwapStatusBroadcasting.
//   - Skips swaps with empty DestRawTx (the tx assembler hasn't
//     filled it in yet). Logged at debug, not error — this is a
//     known gap in the architecture.
//   - For each candidate, calls broadcast.Broadcast on the
//     destination network's RPC. Idempotency note: re-broadcasting
//     the same raw tx is safe at the RPC layer (EVM nodes reject
//     "nonce already used" idempotently), so retries are cheap.
//   - On success: patches DestTxHash + status → SwapStatusCompleted.
//   - On failure: leaves status at SwapStatusBroadcasting for the
//     next tick to retry.
//
// As of 2026-05, broadcast/ only implements EVM. Non-EVM destination
// chains will return ErrFamilyNotImplemented and stay in
// SwapStatusBroadcasting indefinitely until that broadcaster lands.

// Broadcaster is the 1-method interface the driver consumes. Pulls
// the dependency for testability. *broadcast.Client satisfies it.
type Broadcaster interface {
	Broadcast(ctx context.Context, network, rawTxHex string) (*broadcast.BroadcastResult, error)
}

// BroadcastDriver polls SwapStatusBroadcasting swaps and pushes them
// to the destination chain. Concurrency-safe.
type BroadcastDriver struct {
	store     SwapStore
	bcaster   Broadcaster
	interval  time.Duration
	logger    luxlog.Logger

	// perBroadcastTimeout caps one push call. Destination chain RPCs
	// are typically fast (<500 ms) but congested testnets stretch
	// further; 15 s leaves room without holding the loop hostage.
	perBroadcastTimeout time.Duration

	// maxRebuilds caps how many times a single swap can be reset
	// back to bridge_transfer_pending due to transient destination-
	// chain errors (Solana blockhash expiry, future stale-nonce cases
	// for EVM). Past the cap the swap moves to refund_pending so the
	// deposit gets returned rather than looping indefinitely. Zero
	// disables the cap (legacy behaviour).
	maxRebuilds int

	running atomic.Bool

	ticks          atomic.Uint64
	attempts       atomic.Uint64
	successes      atomic.Uint64
	failures       atomic.Uint64
	skippedNoRawTx atomic.Uint64
	rebuilds       atomic.Uint64
	listErrors     atomic.Uint64

	stopOnce      sync.Once
	cancelRunning context.CancelFunc
}

// DefaultBroadcastInterval is the production tick cadence. Faster
// than the deposit watcher because once we're in broadcasting we
// only need to push one tx and confirm.
const DefaultBroadcastInterval = 5 * time.Second

// DefaultPerBroadcastTimeout caps each individual broadcast call.
const DefaultPerBroadcastTimeout = 15 * time.Second

// DefaultBroadcastMaxRebuilds caps reset cycles per swap.
// Solana's recent_blockhash expires after ~150 slots (60–90s) and
// is baked into the signed tx, so a tx that hits cluster congestion
// or queues behind us for too long gets dropped and must be re-signed
// with a fresh blockhash. 5 attempts × (signing interval 5s + broadcast
// interval 5s) ≈ 50s of headroom — well within blockhash lifetime
// under normal conditions, and a clear "destination cluster broken"
// signal if we still can't land a tx after that.
const DefaultBroadcastMaxRebuilds = 5

// NewBroadcastDriver constructs a driver with sensible defaults.
func NewBroadcastDriver(store SwapStore, bcaster Broadcaster, interval time.Duration, logger luxlog.Logger) *BroadcastDriver {
	if interval <= 0 {
		interval = DefaultBroadcastInterval
	}
	return &BroadcastDriver{
		store:               store,
		bcaster:             bcaster,
		interval:            interval,
		logger:              logger,
		perBroadcastTimeout: DefaultPerBroadcastTimeout,
		maxRebuilds:         DefaultBroadcastMaxRebuilds,
	}
}

// Running reports whether the driver loop is active.
func (d *BroadcastDriver) Running() bool { return d.running.Load() }

// BroadcastDriverStats is a point-in-time view of the driver's counters.
type BroadcastDriverStats struct {
	Ticks          uint64 `json:"ticks"`
	Attempts       uint64 `json:"attempts"`
	Successes      uint64 `json:"successes"`
	Failures       uint64 `json:"failures"`
	SkippedNoRawTx uint64 `json:"skipped_no_raw_tx"`
	Rebuilds       uint64 `json:"rebuilds"`
	ListErrors     uint64 `json:"list_errors"`
}

// Stats snapshots the counters. Safe for concurrent reads.
func (d *BroadcastDriver) Stats() BroadcastDriverStats {
	return BroadcastDriverStats{
		Ticks:          d.ticks.Load(),
		Attempts:       d.attempts.Load(),
		Successes:      d.successes.Load(),
		Failures:       d.failures.Load(),
		SkippedNoRawTx: d.skippedNoRawTx.Load(),
		Rebuilds:       d.rebuilds.Load(),
		ListErrors:     d.listErrors.Load(),
	}
}

// Run blocks until ctx is cancelled.
func (d *BroadcastDriver) Run(ctx context.Context) error {
	if !d.running.CompareAndSwap(false, true) {
		return nil
	}
	defer d.running.Store(false)

	ctx, cancel := context.WithCancel(ctx)
	d.cancelRunning = cancel
	defer cancel()

	if d.logger != nil {
		d.logger.Info("broadcast driver started",
			"interval", d.interval,
			"per_broadcast_timeout", d.perBroadcastTimeout,
		)
	}

	d.tick(ctx) // immediate first tick
	ticker := time.NewTicker(d.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			if d.logger != nil {
				d.logger.Info("broadcast driver stopped",
					"reason", ctx.Err(),
					"stats", d.Stats(),
				)
			}
			return ctx.Err()
		case <-ticker.C:
			d.tick(ctx)
		}
	}
}

// Stop signals shutdown. Idempotent.
func (d *BroadcastDriver) Stop() {
	d.stopOnce.Do(func() {
		if d.cancelRunning != nil {
			d.cancelRunning()
		}
	})
}

// Tick runs a single iteration. Exported for tests.
func (d *BroadcastDriver) Tick(ctx context.Context) { d.tick(ctx) }

func (d *BroadcastDriver) tick(ctx context.Context) {
	d.ticks.Add(1)
	swaps, err := d.store.List(ctx, SwapFilter{Status: SwapStatusBroadcasting})
	if err != nil {
		d.listErrors.Add(1)
		if d.logger != nil {
			d.logger.Warn("broadcast driver: list broadcasting swaps", "err", err)
		}
		return
	}
	if len(swaps) == 0 {
		return
	}
	if d.logger != nil {
		d.logger.Debug("broadcast driver tick", "broadcasting", len(swaps))
	}
	for _, sw := range swaps {
		if ctx.Err() != nil {
			return
		}
		d.broadcastOne(ctx, sw)
	}
}

func (d *BroadcastDriver) broadcastOne(ctx context.Context, sw *Swap) {
	if sw.DestRawTx == "" {
		// Tx-assembly hasn't populated the raw tx yet. Skip — this
		// is expected until chain-specific assemblers ship. Logged
		// at debug so it's visible without spamming production logs.
		d.skippedNoRawTx.Add(1)
		if d.logger != nil {
			d.logger.Debug("broadcast driver: skipping — DestRawTx empty (tx assembler pending)",
				"swap_id", sw.ID,
				"network", sw.DestinationNetwork,
			)
		}
		return
	}

	d.attempts.Add(1)
	pushCtx, cancel := context.WithTimeout(ctx, d.perBroadcastTimeout)
	defer cancel()

	res, err := d.bcaster.Broadcast(pushCtx, sw.DestinationNetwork, sw.DestRawTx)
	if err != nil {
		d.failures.Add(1)
		if d.logger != nil {
			d.logger.Warn("broadcast failed",
				"swap_id", sw.ID,
				"network", sw.DestinationNetwork,
				"err", err,
			)
		}

		// Solana blockhash expired — recent_blockhash is baked into the
		// signed tx and lives only ~150 slots (60–90s). A tx that sits
		// unbroadcast for too long (cluster congestion, queued retries,
		// fee market spike pushing us below the priority threshold) gets
		// dropped with "Blockhash not found". Retrying the SAME signed
		// tx is pointless — the blockhash will never come back.
		//
		// Reset the swap to bridge_transfer_pending so the signing driver
		// rebuilds with a fresh blockhash on its next tick. Cap with
		// maxRebuilds so a destination cluster that's genuinely broken
		// can't loop forever — past the cap, route to refund_pending so
		// the deposit gets returned.
		if isStaleSolanaBlockhash(err) {
			d.handleStaleBlockhash(ctx, sw)
			return
		}
		// TON equivalent: the wallet contract rejected the message with
		// exit code 33 (seqno mismatch). Happens when the bridge built
		// a message with a wrong seqno — typically because runGetMethod
		// against an uninitialized contract returned a garbage stack
		// instead of a clean zero. Reset for re-sign with the corrected
		// provider logic on the next tick.
		if isStaleTONSeqno(err) {
			d.handleStaleTONSeqno(ctx, sw)
			return
		}
		// XRP equivalent: the XRPL `submit` engine_result was
		// terPRE_SEQ (sequence too low — current account seq > tx seq,
		// retryable) or tefPAST_SEQ (sequence already used,
		// claim-failure). Both call for a rebuild with fresh sequence;
		// retrying the same blob is no-op or guaranteed reject.
		if isStaleXRPSequence(err) {
			d.handleStaleXRPSequence(ctx, sw)
			return
		}

		// Surface the error so the SDK/UI can show the user what's
		// blocking (e.g. "insufficient funds for gas" — the release
		// address needs LUX). The swap stays at SwapStatusBroadcasting
		// so the next tick retries; once the user funds the address
		// the next attempt succeeds and LastError is cleared below.
		//
		// LastErrorAt stamps the FIRST tick where LastError went
		// non-empty since last clear. The refund driver uses this to
		// decide when "stuck at broadcasting" has lasted long enough
		// to warrant sweeping the deposit back to the original sender.
		_, _ = d.store.Patch(ctx, sw.ID, func(s *Swap) {
			humanized := humanizeBroadcastErr(err)
			if s.LastError == "" {
				s.LastErrorAt = time.Now().UTC()
			}
			s.LastError = humanized
		})
		return
	}

	_, err = d.store.Patch(ctx, sw.ID, func(s *Swap) {
		if s.Status != SwapStatusBroadcasting {
			return
		}
		s.DestTxHash = res.TxHash
		s.Status = SwapStatusCompleted
		s.LastError = "" // clear: terminal success.
		s.LastErrorAt = time.Time{}
		s.BroadcastRebuilds = 0 // clear rebuild counter on success.
	})
	if err != nil {
		d.failures.Add(1)
		if d.logger != nil {
			d.logger.Warn("persist DestTxHash",
				"swap_id", sw.ID,
				"err", err,
			)
		}
		return
	}
	d.successes.Add(1)
	if d.logger != nil {
		d.logger.Info("broadcast confirmed → swap completed",
			"swap_id", sw.ID,
			"network", sw.DestinationNetwork,
			"tx_hash", res.TxHash,
		)
	}
}

// isStaleTONSeqno matches the toncenter rejection that surfaces when
// the wallet contract refuses an external message. The two we care
// about — exit 33 (msg_seqno != stored_seqno) and exit 36
// (valid_until <= now()) — both arrive wrapped in this envelope:
//
//	"LITE_SERVER_UNKNOWN: cannot apply external message ... External
//	 message was not accepted ... exitcode=33, steps=N, gas_used=N"
//
// In practice the broadcast.RPCError surface truncates the body
// before "exitcode=" is reached. We therefore match on the chain-
// stable prefix "external message was not accepted" — it's emitted
// by the validator for ANY wallet-contract refusal (stale seqno,
// expired valid_until, signature mismatch, init-data mismatch),
// every one of which calls for a rebuild rather than a retry of the
// same BoC. Broader than "exit 33 only", but the failure modes it
// catches all share the same remediation: re-sign with a fresh
// seqno + valid_until, retry.
func isStaleTONSeqno(err error) bool {
	if err == nil {
		return false
	}
	low := strings.ToLower(err.Error())
	return strings.Contains(low, "external message was not accepted")
}

// handleStaleTONSeqno mirrors handleStaleBlockhash for TON. Same
// rebuild ceiling, same observability — refunds the deposit if the
// destination keeps rejecting beyond maxRebuilds.
func (d *BroadcastDriver) handleStaleTONSeqno(ctx context.Context, sw *Swap) {
	patched, _ := d.store.Patch(ctx, sw.ID, func(s *Swap) {
		if s.Status != SwapStatusBroadcasting {
			return
		}
		s.BroadcastRebuilds++
		if d.maxRebuilds > 0 && s.BroadcastRebuilds >= d.maxRebuilds {
			s.Status = SwapStatusRefundPending
			s.LastError = fmt.Sprintf(
				"TON wallet contract rejected %d successive broadcasts (seqno mismatch / message expired) — routing to refund.",
				s.BroadcastRebuilds,
			)
			s.LastErrorAt = time.Now().UTC()
			return
		}
		s.Status = SwapStatusBridgeTransferPending
		s.DestRawTx = ""
		s.Signature = ""
		s.MPCSessionID = ""
		s.DestTxHash = ""
		s.LastError = "TON message rejected (seqno / valid_until stale) — rebuilding"
		s.LastErrorAt = time.Now().UTC()
	})
	d.rebuilds.Add(1)
	if d.logger != nil && patched != nil {
		if patched.Status == SwapStatusRefundPending {
			d.logger.Warn("ton broadcast rebuilds maxed out → refund_pending",
				"swap_id", sw.ID,
				"rebuilds", patched.BroadcastRebuilds,
				"max", d.maxRebuilds,
			)
		} else {
			d.logger.Info("broadcast: stale ton seqno → reset for re-sign",
				"swap_id", sw.ID,
				"rebuilds", patched.BroadcastRebuilds,
			)
		}
	}
}

// isStaleXRPSequence matches the XRPL engine_result codes the bridge
// gets when the signed Payment's Sequence field is no longer current:
//
//	terPRE_SEQ  — sequence > current account seq  (retryable; account
//	              caught up since PreSign read it. Rebuild + retry will
//	              succeed unless the account is stuck.)
//	tefPAST_SEQ — sequence already used (the broadcast actually went
//	              through earlier OR the sender used the seq from
//	              another tx; either way, retrying THIS blob is no-op.)
//	tefALREADY  — exact tx already in the ledger (retry no-op too).
//
// All three call for a clear-DestRawTx + re-sign with a fresh
// sequence. The broadcast.RPCError surface carries the upstream
// message (broadcast/xrp.go wraps engine_result + engine_result_message
// into RPCError.Message), so substring match is enough.
func isStaleXRPSequence(err error) bool {
	if err == nil {
		return false
	}
	low := strings.ToLower(err.Error())
	return strings.Contains(low, "terpre_seq") ||
		strings.Contains(low, "tefpast_seq") ||
		strings.Contains(low, "tefalready")
}

// handleStaleXRPSequence mirrors handleStaleTONSeqno for XRP. Resets
// DestRawTx and routes the swap back to bridge_transfer_pending so the
// signing driver picks it up next tick with a fresh sequence pulled
// from XRPL.AccountInfo.
func (d *BroadcastDriver) handleStaleXRPSequence(ctx context.Context, sw *Swap) {
	patched, _ := d.store.Patch(ctx, sw.ID, func(s *Swap) {
		if s.Status != SwapStatusBroadcasting {
			return
		}
		s.BroadcastRebuilds++
		if d.maxRebuilds > 0 && s.BroadcastRebuilds >= d.maxRebuilds {
			s.Status = SwapStatusRefundPending
			s.LastError = fmt.Sprintf(
				"XRPL rejected %d successive broadcasts (sequence stale) — routing to refund.",
				s.BroadcastRebuilds,
			)
			s.LastErrorAt = time.Now().UTC()
			return
		}
		s.Status = SwapStatusBridgeTransferPending
		s.DestRawTx = ""
		s.Signature = ""
		s.MPCSessionID = ""
		s.DestTxHash = ""
		s.LastError = "XRPL submit rejected (sequence stale) — rebuilding"
		s.LastErrorAt = time.Now().UTC()
	})
	d.rebuilds.Add(1)
	if d.logger != nil && patched != nil {
		if patched.Status == SwapStatusRefundPending {
			d.logger.Warn("xrp broadcast rebuilds maxed out → refund_pending",
				"swap_id", sw.ID,
				"rebuilds", patched.BroadcastRebuilds,
				"max", d.maxRebuilds,
			)
		} else {
			d.logger.Info("broadcast: stale xrp sequence → reset for re-sign",
				"swap_id", sw.ID,
				"rebuilds", patched.BroadcastRebuilds,
			)
		}
	}
}

// isStaleSolanaBlockhash matches the cluster's rejection of a signed
// tx whose recent_blockhash has expired. Solana's RPC returns code
// -32002 with a message containing "Blockhash not found" when the
// blockhash referenced by the tx is older than the cluster's
// max_processing_age window (~150 slots, 60–90 s of wall-clock).
//
// We match on the substring rather than just the code because -32002
// also covers preflight simulation failures for unrelated reasons
// (e.g. "insufficient funds for instruction"). The substring is
// chain-stable: Solana's validator source emits this exact phrasing
// when a stale blockhash is the cause, regardless of cluster version.
func isStaleSolanaBlockhash(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(strings.ToLower(err.Error()), "blockhash not found")
}

// handleStaleBlockhash resets a swap so the signing driver rebuilds
// the destination tx with a fresh blockhash. Caps consecutive rebuild
// cycles to maxRebuilds — beyond that, the destination cluster is
// likely genuinely broken (sustained congestion, fee-priority bug,
// validator partition) and we'd rather refund than spin forever.
func (d *BroadcastDriver) handleStaleBlockhash(ctx context.Context, sw *Swap) {
	patched, _ := d.store.Patch(ctx, sw.ID, func(s *Swap) {
		if s.Status != SwapStatusBroadcasting {
			return
		}
		s.BroadcastRebuilds++
		if d.maxRebuilds > 0 && s.BroadcastRebuilds >= d.maxRebuilds {
			// Persistent destination-side failure — route to refund
			// rather than retry forever. The refund driver picks up
			// SwapStatusRefundPending on its next tick.
			s.Status = SwapStatusRefundPending
			s.LastError = fmt.Sprintf(
				"Destination cluster rejected %d successive broadcasts with stale blockhash — routing to refund. Likely cluster congestion or RPC partition.",
				s.BroadcastRebuilds,
			)
			s.LastErrorAt = time.Now().UTC()
			return
		}
		// Clear the assembled tx + sign artifacts so the signing
		// driver re-runs cleanly. Matches the /admin/swaps/:id/reset
		// shape: those four fields constitute the "we have a built
		// and signed tx" claim that the broadcast driver consumes.
		s.Status = SwapStatusBridgeTransferPending
		s.DestRawTx = ""
		s.Signature = ""
		s.MPCSessionID = ""
		s.DestTxHash = ""
		s.LastError = "Solana blockhash expired — rebuilding with fresh blockhash"
		s.LastErrorAt = time.Now().UTC()
	})
	d.rebuilds.Add(1)
	if d.logger != nil && patched != nil {
		if patched.Status == SwapStatusRefundPending {
			d.logger.Warn("broadcast rebuilds maxed out → refund_pending",
				"swap_id", sw.ID,
				"rebuilds", patched.BroadcastRebuilds,
				"max", d.maxRebuilds,
			)
		} else {
			d.logger.Info("broadcast: stale blockhash → reset for re-sign",
				"swap_id", sw.ID,
				"rebuilds", patched.BroadcastRebuilds,
			)
		}
	}
}

// humanizeBroadcastErr normalizes the underlying broadcast error into
// a one-line surface for the SDK + UI. Goals:
//   - Common chain-side rejections get a short human label so the UI
//     can render "Insufficient funds in release address" instead of
//     pasting the full geth error string.
//   - HTTP / gateway flakes (502 from krakend, network drops) get a
//     generic "Destination RPC unreachable" so users don't see scary
//     internals for what's just a transient retry.
//   - Anything we don't recognize is forwarded verbatim (truncated)
//     so operator triage isn't blind.
func humanizeBroadcastErr(err error) string {
	if err == nil {
		return ""
	}
	msg := err.Error()
	low := strings.ToLower(msg)
	switch {
	case strings.Contains(low, "insufficient funds"),
		// Solana's "Attempt to debit an account but found no record of a
		// prior credit" is emitted when an account has 0 lamports AND
		// either never existed on chain or has been GC'd post-drain.
		// Equivalent semantics to EVM "insufficient funds" for our
		// purposes — release wallet is unfunded.
		strings.Contains(low, "no record of a prior credit"):
		return "Insufficient funds in release address — fund the MPC address with destination-chain gas tokens"
	case strings.Contains(low, "nonce too low"):
		return "Nonce stale — release address already has a tx with this nonce; bridge will catch up"
	case strings.Contains(low, "invalid sender"):
		return "Destination chain rejected the signature (invalid sender) — possible MPC pubkey mismatch"
	case strings.Contains(low, "http 502"), strings.Contains(low, "http 503"), strings.Contains(low, "http 504"):
		return "Destination RPC unreachable (gateway error) — retrying"
	case strings.Contains(low, "context deadline exceeded"), strings.Contains(low, "timeout"):
		return "Destination RPC timed out — retrying"
	}
	if len(msg) > 160 {
		return msg[:160] + "…"
	}
	return msg
}

// Compile-time check: *broadcast.Client satisfies Broadcaster.
var _ Broadcaster = (*broadcast.Client)(nil)
