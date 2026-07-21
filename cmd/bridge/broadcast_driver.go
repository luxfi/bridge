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
	"github.com/luxfi/bridge/internal/mchain"
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

// ConfirmationChecker reports whether a destination tx has been mined.
// Only the BTC release path uses it: Bitcoin's "broadcast accepted"
// (mempool admission) is not final, so a BTC swap parks in
// SwapStatusAwaitingConfirmation until this says confirmed (or the
// rebuild timeout fires). *btc.Provider's GetTxStatus is adapted to
// this in main.go. nil ⇒ the driver keeps the legacy behaviour of
// marking every broadcast Completed immediately (no BTC confirmation
// gate), so a deploy without a BTC confirmer never strands swaps.
type ConfirmationChecker interface {
	ConfirmationStatus(ctx context.Context, network, txid string) (confirmed bool, err error)
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

	// confirmer gates the BTC release path: a BTC tx parks in
	// SwapStatusAwaitingConfirmation and is promoted to Completed only
	// when this reports it mined. nil ⇒ legacy immediate-Completed for
	// every family (no BTC confirmation gate). Wired in main.go from the
	// BTC provider; left nil in non-BTC deploys and most unit tests.
	confirmer ConfirmationChecker

	// btcConfirmTimeout is how long a BTC release may sit unconfirmed in
	// the mempool before the watcher rebuilds it with a higher (RBF)
	// feerate. Measured from Swap.BroadcastAt and reset on each rebuild.
	btcConfirmTimeout time.Duration

	running atomic.Bool

	ticks           atomic.Uint64
	attempts        atomic.Uint64
	successes       atomic.Uint64
	failures        atomic.Uint64
	skippedNoRawTx  atomic.Uint64
	rebuilds        atomic.Uint64
	listErrors      atomic.Uint64
	confirmChecks   atomic.Uint64
	confirmTimeouts atomic.Uint64

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

// DefaultBTCConfirmationTimeout is how long a BTC release tx may sit
// unconfirmed in the mempool before the watcher rebuilds it at a higher
// (RBF) feerate. 30 min ≈ 3 expected blocks: long enough that a tx with
// a sane fee confirms normally, short enough to react before a user
// gives up. Each rebuild bumps the feerate and restarts this clock; the
// shared maxRebuilds cap eventually routes a persistently stuck swap to
// refund rather than spinning forever.
const DefaultBTCConfirmationTimeout = 30 * time.Minute

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
		btcConfirmTimeout:   DefaultBTCConfirmationTimeout,
	}
}

// SetConfirmer attaches the BTC confirmation checker. When set, BTC
// releases gate through SwapStatusAwaitingConfirmation instead of
// completing the instant the mempool accepts them. No-op for other
// families. Wired in main.go from the BTC provider.
func (d *BroadcastDriver) SetConfirmer(c ConfirmationChecker) { d.confirmer = c }

// SetBTCConfirmTimeout overrides the unconfirmed-mempool timeout before
// an RBF rebuild. Primarily for tests; production uses the default.
func (d *BroadcastDriver) SetBTCConfirmTimeout(t time.Duration) {
	if t > 0 {
		d.btcConfirmTimeout = t
	}
}

// Running reports whether the driver loop is active.
func (d *BroadcastDriver) Running() bool { return d.running.Load() }

// BroadcastDriverStats is a point-in-time view of the driver's counters.
type BroadcastDriverStats struct {
	Ticks           uint64 `json:"ticks"`
	Attempts        uint64 `json:"attempts"`
	Successes       uint64 `json:"successes"`
	Failures        uint64 `json:"failures"`
	SkippedNoRawTx  uint64 `json:"skipped_no_raw_tx"`
	Rebuilds        uint64 `json:"rebuilds"`
	ListErrors      uint64 `json:"list_errors"`
	ConfirmChecks   uint64 `json:"confirm_checks"`
	ConfirmTimeouts uint64 `json:"confirm_timeouts"`
}

// Stats snapshots the counters. Safe for concurrent reads.
func (d *BroadcastDriver) Stats() BroadcastDriverStats {
	return BroadcastDriverStats{
		Ticks:           d.ticks.Load(),
		Attempts:        d.attempts.Load(),
		Successes:       d.successes.Load(),
		Failures:        d.failures.Load(),
		SkippedNoRawTx:  d.skippedNoRawTx.Load(),
		Rebuilds:        d.rebuilds.Load(),
		ListErrors:      d.listErrors.Load(),
		ConfirmChecks:   d.confirmChecks.Load(),
		ConfirmTimeouts: d.confirmTimeouts.Load(),
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
		// Don't return — the broadcasting list failing shouldn't starve
		// the confirmation pass below (independent state, independent RPC).
	} else {
		if len(swaps) > 0 && d.logger != nil {
			d.logger.Debug("broadcast driver tick", "broadcasting", len(swaps))
		}
		for _, sw := range swaps {
			if ctx.Err() != nil {
				return
			}
			d.broadcastOne(ctx, sw)
		}
	}

	// Second pass: BTC releases parked awaiting on-chain confirmation.
	// Only the BTC path ever produces this state, and only when a
	// confirmer is wired — skip the list query entirely otherwise.
	if d.confirmer == nil {
		return
	}
	pending, err := d.store.List(ctx, SwapFilter{Status: SwapStatusAwaitingConfirmation})
	if err != nil {
		d.listErrors.Add(1)
		if d.logger != nil {
			d.logger.Warn("broadcast driver: list awaiting-confirmation swaps", "err", err)
		}
		return
	}
	for _, sw := range pending {
		if ctx.Err() != nil {
			return
		}
		d.confirmOne(ctx, sw)
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
		// BTC equivalent: bitcoind / mempool.space rejected the release tx
		// because its feerate is below the relay or mempool floor (or an
		// RBF bump didn't beat the tx it replaces). The fee is baked into
		// the signed tx, so retrying the same blob is rejected identically
		// forever — reset so PreSignBTC re-quotes a fresh, higher feerate
		// and re-signs. RBF (nSequence=0xfffffffd, internal/btc/payment.go)
		// makes the replacement a valid BIP-125 substitution.
		if isStaleBTCFee(err) {
			d.handleStaleBTCFee(ctx, sw)
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

	// BTC is the one family where mempool admission is NOT final: a
	// low-fee tx is accepted then may never confirm (fee market rises or
	// the tx is evicted). Park it in awaiting_confirmation and let the
	// watcher promote it to Completed once it's mined — but only when a
	// confirmer is wired, otherwise fall through to immediate-Completed
	// so the swap can't strand. Every other family completes on accept.
	if d.confirmer != nil && destIsBTC(sw.DestinationNetwork) {
		patched, perr := d.store.Patch(ctx, sw.ID, func(s *Swap) {
			if s.Status != SwapStatusBroadcasting {
				return
			}
			s.DestTxHash = res.TxHash
			s.Status = SwapStatusAwaitingConfirmation
			s.BroadcastAt = time.Now().UTC()
			s.LastError = "" // clear: tx accepted, now awaiting a block.
			s.LastErrorAt = time.Time{}
		})
		if perr != nil {
			d.failures.Add(1)
			if d.logger != nil {
				d.logger.Warn("persist DestTxHash (btc awaiting confirmation)",
					"swap_id", sw.ID, "err", perr)
			}
			return
		}
		if d.logger != nil && patched != nil {
			d.logger.Info("btc release accepted → awaiting confirmation",
				"swap_id", sw.ID,
				"network", sw.DestinationNetwork,
				"tx_hash", res.TxHash,
			)
		}
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

// isStaleBTCFee matches the bitcoind / mempool.space rejections that mean
// the release tx's fee is too low for the node to accept it right now:
//
//	"min relay fee not met, A < B"   — below the node's static minrelaytxfee
//	"mempool min fee not met, A < B" — below the dynamic mempool floor (mempool full)
//	"insufficient fee, rejecting replacement …" — an RBF fee-bump that didn't
//	                                   beat the tx it replaces by enough (BIP-125)
//
// Unlike Solana / TON / XRP, a too-low BTC fee is usually ACCEPTED into the
// mempool (no error — the tx just sits unconfirmed); these strings are the
// subset of fee problems the node rejects at submit time. The feerate is baked
// into the signed tx, so retrying the SAME DestRawTx is futile — it gets
// rejected identically forever. Resetting for re-assembly fixes it: PreSignBTC
// re-quotes mempool.space's current recommended feerate and re-selects the
// still-unconfirmed UTXO, so the rebuilt tx carries a fresh, higher fee. RBF is
// always signalled (nSequence = 0xfffffffd, internal/btc/payment.go) so the
// replacement is a valid BIP-125 substitution of the prior attempt.
//
// "insufficient funds" (an unfunded release wallet) is deliberately NOT matched
// here — humanizeBroadcastErr handles that, keeping the swap at broadcasting and
// telling the operator to fund the address. Rebuilding can't help, and the geth
// phrase "insufficient funds" never contains the substring "insufficient fee".
func isStaleBTCFee(err error) bool {
	if err == nil {
		return false
	}
	low := strings.ToLower(err.Error())
	return strings.Contains(low, "min relay fee not met") ||
		strings.Contains(low, "mempool min fee not met") ||
		strings.Contains(low, "insufficient fee")
}

// handleStaleBTCFee mirrors handleStaleXRPSequence for Bitcoin. Same rebuild
// ceiling + refund fallback: if the node keeps rejecting our feerate past
// maxRebuilds — a persistently overfull mempool, or a release wallet whose only
// confirmed UTXO is too small to carry a relayable fee — route to refund rather
// than spin forever. Otherwise reset to bridge_transfer_pending and clear the
// assembled tx + sign artifacts so the signing driver re-quotes the fee and
// re-signs on its next tick.
func (d *BroadcastDriver) handleStaleBTCFee(ctx context.Context, sw *Swap) {
	patched, _ := d.store.Patch(ctx, sw.ID, func(s *Swap) {
		if s.Status != SwapStatusBroadcasting {
			return
		}
		s.BroadcastRebuilds++
		if d.maxRebuilds > 0 && s.BroadcastRebuilds >= d.maxRebuilds {
			s.Status = SwapStatusRefundPending
			s.LastError = fmt.Sprintf(
				"Bitcoin node rejected %d successive broadcasts (fee below relay / mempool floor) — routing to refund.",
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
		s.LastError = "Bitcoin fee below relay floor — rebuilding with a fresh feerate"
		s.LastErrorAt = time.Now().UTC()
	})
	d.rebuilds.Add(1)
	if d.logger != nil && patched != nil {
		if patched.Status == SwapStatusRefundPending {
			d.logger.Warn("btc broadcast rebuilds maxed out → refund_pending",
				"swap_id", sw.ID,
				"rebuilds", patched.BroadcastRebuilds,
				"max", d.maxRebuilds,
			)
		} else {
			d.logger.Info("broadcast: stale btc fee → reset for re-sign",
				"swap_id", sw.ID,
				"rebuilds", patched.BroadcastRebuilds,
			)
		}
	}
}

// confirmOne polls the destination chain for a BTC release parked in
// SwapStatusAwaitingConfirmation and either promotes it to Completed
// (mined) or — once btcConfirmTimeout has elapsed since BroadcastAt —
// rebuilds it at a higher RBF feerate. A confirmer RPC error is treated
// as transient: log and leave the swap parked for the next tick.
func (d *BroadcastDriver) confirmOne(ctx context.Context, sw *Swap) {
	if sw.DestTxHash == "" {
		// We only park swaps after recording the txid, so this is a
		// can't-happen guard — nothing to poll, leave for operator triage.
		return
	}
	d.confirmChecks.Add(1)
	checkCtx, cancel := context.WithTimeout(ctx, d.perBroadcastTimeout)
	defer cancel()

	confirmed, err := d.confirmer.ConfirmationStatus(checkCtx, sw.DestinationNetwork, sw.DestTxHash)
	if err != nil {
		// Transient RPC error — don't disturb the swap, retry next tick.
		if d.logger != nil {
			d.logger.Debug("btc confirmation check failed (will retry)",
				"swap_id", sw.ID, "tx_hash", sw.DestTxHash, "err", err)
		}
		return
	}
	if confirmed {
		patched, _ := d.store.Patch(ctx, sw.ID, func(s *Swap) {
			if s.Status != SwapStatusAwaitingConfirmation {
				return
			}
			s.Status = SwapStatusCompleted
			s.LastError = ""
			s.LastErrorAt = time.Time{}
			s.BroadcastRebuilds = 0 // clear: terminal success.
		})
		if patched != nil && patched.Status == SwapStatusCompleted {
			d.successes.Add(1)
			if d.logger != nil {
				d.logger.Info("btc release confirmed → swap completed",
					"swap_id", sw.ID, "tx_hash", sw.DestTxHash)
			}
		}
		return
	}

	// Not yet mined. If it's been parked past the timeout, the feerate
	// is likely too low for current conditions (or the tx was evicted)
	// — rebuild with a higher RBF fee. Otherwise give the block time.
	if d.btcConfirmTimeout > 0 && !sw.BroadcastAt.IsZero() &&
		time.Since(sw.BroadcastAt) >= d.btcConfirmTimeout {
		d.handleBTCConfirmTimeout(ctx, sw)
	}
}

// handleBTCConfirmTimeout rebuilds a BTC release that sat unconfirmed
// past btcConfirmTimeout. Same rebuild ceiling as the submit-reject
// path (handleStaleBTCFee): past maxRebuilds the swap routes to refund
// rather than bumping the fee forever. The reset deliberately KEEPS
// LastFeeRate so the signing driver's next PreSignBTC (via
// bumpBTCFeeRate) bids strictly above the stuck tx — a valid BIP-125
// replacement that RBF (nSequence=0xfffffffd) lets evict the original.
func (d *BroadcastDriver) handleBTCConfirmTimeout(ctx context.Context, sw *Swap) {
	patched, _ := d.store.Patch(ctx, sw.ID, func(s *Swap) {
		if s.Status != SwapStatusAwaitingConfirmation {
			return
		}
		s.BroadcastRebuilds++
		if d.maxRebuilds > 0 && s.BroadcastRebuilds >= d.maxRebuilds {
			s.Status = SwapStatusRefundPending
			s.LastError = fmt.Sprintf(
				"Bitcoin release tx unconfirmed after %d rebuild attempts (feerate too low for the current mempool) — routing to refund.",
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
		// KEEP LastFeeRate — the next PreSignBTC bumps strictly above it.
		s.LastError = "Bitcoin release unconfirmed — rebuilding with a higher RBF feerate"
		s.LastErrorAt = time.Now().UTC()
	})
	d.rebuilds.Add(1)
	d.confirmTimeouts.Add(1)
	if d.logger != nil && patched != nil {
		if patched.Status == SwapStatusRefundPending {
			d.logger.Warn("btc confirmation rebuilds maxed out → refund_pending",
				"swap_id", sw.ID, "rebuilds", patched.BroadcastRebuilds, "max", d.maxRebuilds)
		} else {
			d.logger.Info("broadcast: btc unconfirmed → reset for higher-fee re-sign",
				"swap_id", sw.ID, "rebuilds", patched.BroadcastRebuilds,
				"prev_fee_rate", sw.LastFeeRate)
		}
	}
}

// bumpBTCFeeRate returns the sat/vB floor for an RBF replacement of a
// tx that paid prev. Zero in ⇒ zero out (first attempt: no prior tx to
// beat, so PreSignBTC just uses the live mempool estimate). Otherwise
// +25% +1, so the replacement strictly out-bids the prior fee even for
// tiny rates where integer truncation would otherwise tie — BIP-125
// requires a higher absolute fee, not merely equal.
func bumpBTCFeeRate(prev uint64) uint64 {
	if prev == 0 {
		return 0
	}
	return prev + prev/4 + 1
}

// destIsBTC reports whether the destination network releases over the
// Bitcoin family (BITCOIN_MAINNET / BITCOIN_TESTNET), the one family
// whose mempool admission isn't final and needs a confirmation gate.
func destIsBTC(network string) bool {
	return mchain.AddressTypeFor(network) == mchain.AddressTypeBTC
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
