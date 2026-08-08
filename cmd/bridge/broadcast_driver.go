package main

import (
	"context"
	"errors"
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

// ConfirmationChecker reports whether a destination-chain tx has been
// mined. Only the BTC release path consumes it — mempool admission
// isn't finality there. *broadcast.Client satisfies it.
type ConfirmationChecker interface {
	ConfirmationStatus(ctx context.Context, network, txid string) (confirmed bool, err error)
}

// BroadcastDriver polls SwapStatusBroadcasting swaps and pushes them
// to the destination chain. Concurrency-safe.
type BroadcastDriver struct {
	store    SwapStore
	bcaster  Broadcaster
	interval time.Duration
	logger   luxlog.Logger

	// perBroadcastTimeout caps one push call. Destination chain RPCs
	// are typically fast (<500 ms) but congested testnets stretch
	// further; 15 s leaves room without holding the loop hostage.
	perBroadcastTimeout time.Duration

	// WithdrawalEnabled, when set, is the in-flight half of the kill-switch:
	// a swap whose destination (network, asset) became withdrawal-disabled
	// AFTER it was signed is HELD here (never pushed), so flipping
	// isWithdrawalEnabled:false stops already-signed swaps too, not just new
	// signings. nil ⇒ no gate (tests / back-compat). Same Config source as the
	// signing driver's gate — one authoritative control.
	WithdrawalEnabled func(network, asset string) bool

	// confirmer gates the BTC release path: a BTC tx parks in
	// SwapStatusAwaitingConfirmation and is promoted to Completed only
	// when this reports it mined. nil ⇒ legacy immediate-Completed for
	// every family (no BTC confirmation gate). Wired in main.go from the
	// broadcast client; left nil in non-BTC deploys and most unit tests.
	confirmer ConfirmationChecker

	// btcConfirmTimeout is how long a BTC release may sit unconfirmed in
	// the mempool before the watcher rebuilds it with a higher (RBF)
	// feerate. Measured from Swap.BroadcastAt and reset on each rebuild.
	btcConfirmTimeout time.Duration

	// maxRebuilds caps how many times a single swap can be reset back to
	// bridge_transfer_pending by the BTC rebuild paths (submit-reject +
	// confirmation timeout share the ceiling via Swap.BroadcastRebuilds).
	// Past the cap the swap moves to SwapStatusFailed rather than bumping
	// the fee forever against a broken destination. Zero disables the cap.
	maxRebuilds int

	running atomic.Bool

	ticks           atomic.Uint64
	attempts        atomic.Uint64
	successes       atomic.Uint64
	failures        atomic.Uint64
	skippedNoRawTx  atomic.Uint64
	listErrors      atomic.Uint64
	rebuilds        atomic.Uint64
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

// DefaultBroadcastMaxRebuilds caps BTC rebuild cycles per swap (submit
// rejects + confirmation timeouts share the ceiling). Five compounding
// +25% bumps ≈ 3× the original feerate — past that the fee market has
// moved beyond what the release should pay, and the swap fails loudly.
const DefaultBroadcastMaxRebuilds = 5

// DefaultBTCConfirmationTimeout is how long a BTC release may sit in
// the mempool unconfirmed before the watcher rebuilds it at a higher
// RBF feerate. ~3 target blocks: long enough that a normal-fee tx
// usually mines, short enough that a stuck payout recovers within the
// hour instead of sitting forever (the failure this gate exists for).
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
		btcConfirmTimeout:   DefaultBTCConfirmationTimeout,
		maxRebuilds:         DefaultBroadcastMaxRebuilds,
	}
}

// SetConfirmer wires the BTC confirmation checker. nil leaves the
// legacy immediate-Completed behaviour for every family.
func (d *BroadcastDriver) SetConfirmer(c ConfirmationChecker) { d.confirmer = c }

// SetBTCConfirmTimeout overrides how long a BTC release may sit
// unconfirmed before an RBF rebuild. Non-positive keeps the default.
func (d *BroadcastDriver) SetBTCConfirmTimeout(t time.Duration) {
	if t > 0 {
		d.btcConfirmTimeout = t
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
	ListErrors     uint64 `json:"list_errors"`
	// Rebuilds counts broadcast→re-sign resets (BTC fee rebuilds).
	Rebuilds uint64 `json:"rebuilds"`
	// ConfirmChecks counts polls of a parked BTC release for confirmation.
	ConfirmChecks uint64 `json:"confirm_checks"`
	// ConfirmTimeouts counts parked BTC releases that sat unconfirmed
	// past the timeout and were rebuilt at a bumped RBF feerate.
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
		ListErrors:      d.listErrors.Load(),
		Rebuilds:        d.rebuilds.Load(),
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

	// Kill-switch (in-flight half): a destination that became withdrawal-disabled
	// after this swap was signed is HELD — never broadcast. It stays in its
	// current state and resumes if the flag is flipped back. Pairs with the
	// signing driver's create/sign gate so the control covers the whole pipeline.
	if d.WithdrawalEnabled != nil && !d.WithdrawalEnabled(sw.DestinationNetwork, sw.DestinationAsset) {
		if d.logger != nil {
			d.logger.Warn("broadcast driver: HELD — destination withdrawal disabled (kill-switch)",
				"swap_id", sw.ID,
				"network", sw.DestinationNetwork,
				"asset", sw.DestinationAsset,
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
		// BTC fee-below-floor rejects (min relay fee / mempool min fee)
		// mean this exact raw tx can never enter the mempool at current
		// conditions — retrying it verbatim loops forever. Reset for a
		// re-sign at a fresh (floored) feerate instead.
		if isStaleBTCFee(err) && isBTCNetwork(sw.DestinationNetwork) {
			d.handleStaleBTCFee(ctx, sw)
			return
		}
		// BTC fatal errors (mempool-conflict, dust, missing inputs)
		// can never broadcast in their current shape — advance the
		// swap to SwapStatusFailed instead of looping forever. The
		// refund driver will sweep the deposit back to the sender.
		var btcErr *broadcast.BTCBroadcastError
		fatalBTC := errors.As(err, &btcErr) && !btcErr.Retryable
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
			if fatalBTC {
				s.Status = SwapStatusFailed
			}
		})
		return
	}

	// BTC parks in awaiting_confirmation when a confirmer is wired:
	// mempool admission isn't finality there — a low-fee tx can sit
	// forever or get evicted. Every other family (and BTC without a
	// confirmer) completes on acceptance as before.
	gateBTC := d.confirmer != nil && isBTCNetwork(sw.DestinationNetwork)
	_, err = d.store.Patch(ctx, sw.ID, func(s *Swap) {
		if s.Status != SwapStatusBroadcasting {
			return
		}
		s.DestTxHash = res.TxHash
		if gateBTC {
			s.Status = SwapStatusAwaitingConfirmation
			s.BroadcastAt = time.Now().UTC()
		} else {
			s.Status = SwapStatusCompleted
			s.BroadcastRebuilds = 0
		}
		s.LastError = "" // clear: accepted by the destination chain.
		s.LastErrorAt = time.Time{}
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
	if gateBTC {
		if d.logger != nil {
			d.logger.Info("btc release in mempool → awaiting confirmation",
				"swap_id", sw.ID,
				"tx_hash", res.TxHash,
			)
		}
		return // successes counts on confirmation, not admission.
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
//
// BTC-specific rejections (txn-already-known, txn-mempool-conflict,
// etc.) are typed as *broadcast.BTCBroadcastError upstream. The
// retryable flag is preserved through the error chain. The driver
// can call errors.As against BTCBroadcastError to inspect Retryable
// directly when deciding between "leave at broadcasting" vs "advance
// to a terminal state".
func humanizeBroadcastErr(err error) string {
	if err == nil {
		return ""
	}
	msg := err.Error()
	low := strings.ToLower(msg)
	switch {
	// BTC-specific rejections.
	case strings.Contains(low, "txn-mempool-conflict"),
		strings.Contains(low, "bad-txns-inputs-missingorspent"),
		strings.Contains(low, "missing inputs"):
		return "BTC inputs are spent / double-spent — release pool wallet UTXOs changed under us, swap must re-assemble"
	case strings.Contains(low, "txn-already-known"),
		strings.Contains(low, "already in mempool"),
		strings.Contains(low, "transaction already in block chain"):
		return "BTC tx already broadcast (recovering txid)"
	case strings.Contains(low, "bad-txns-in-belowout"), strings.Contains(low, "dust"):
		return "BTC tx output is dust — value too small to be economically spendable"
	// EVM + XRP insufficient-funds rejections.
	case strings.Contains(low, "insufficient funds"),
		strings.Contains(msg, "tecINSUFFICIENT_FUNDS"),
		strings.Contains(msg, "tecUNFUNDED"):
		return "Insufficient funds in release address — fund the MPC address with destination-chain gas tokens"
	case strings.Contains(low, "nonce too low"):
		return "Nonce stale — release address already has a tx with this nonce; bridge will catch up"
	case strings.Contains(low, "invalid sender"):
		return "Destination chain rejected the signature (invalid sender) — possible MPC pubkey mismatch"
	case strings.Contains(msg, "tecNO_DST"):
		return "XRP destination account is not activated — recipient must hold ≥10 XRP reserve"
	case strings.Contains(msg, "tefPAST_SEQ"):
		return "XRP sequence already used — bridge will requery account_info and retry"
	case strings.Contains(msg, "temBAD_AMOUNT"), strings.Contains(msg, "tem"):
		return "XRP transaction was malformed — bridge will retry with a fresh build"
	case strings.Contains(msg, "telINSUF_FEE_P"):
		return "XRP network fee too low for current load — bridge will retry with a higher fee"
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

// Compile-time check: *broadcast.Client satisfies ConfirmationChecker.
var _ ConfirmationChecker = (*broadcast.Client)(nil)

// isStaleBTCFee matches the Bitcoin node's rejection of a tx whose
// feerate no longer clears the relay / mempool floor — the fee market
// moved between fee estimation and broadcast, or the mempool is full.
// The raw tx is unfixable as-is (the fee is baked in); the swap must
// re-sign at a fresh rate.
func isStaleBTCFee(err error) bool {
	if err == nil {
		return false
	}
	low := strings.ToLower(err.Error())
	return strings.Contains(low, "min relay fee not met") ||
		strings.Contains(low, "mempool min fee not met") ||
		strings.Contains(low, "insufficient fee")
}

// handleStaleBTCFee resets a fee-rejected BTC release for a re-sign at
// a fresh (floored) feerate. Shares the rebuild ceiling with the
// confirmation-timeout path via Swap.BroadcastRebuilds: past
// maxRebuilds — a persistently overfull mempool, or a release wallet
// whose only confirmed UTXO is too small to carry a relayable fee —
// the swap fails loudly rather than spinning forever.
func (d *BroadcastDriver) handleStaleBTCFee(ctx context.Context, sw *Swap) {
	patched, _ := d.store.Patch(ctx, sw.ID, func(s *Swap) {
		if s.Status != SwapStatusBroadcasting {
			return
		}
		s.BroadcastRebuilds++
		if d.maxRebuilds > 0 && s.BroadcastRebuilds >= d.maxRebuilds {
			s.Status = SwapStatusFailed
			s.LastError = fmt.Sprintf(
				"Bitcoin node rejected %d successive broadcasts (fee below relay / mempool floor) — swap failed; deposit needs a sweep.",
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
		if patched.Status == SwapStatusFailed {
			d.logger.Warn("btc broadcast rebuilds maxed out → failed",
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
// path (handleStaleBTCFee): past maxRebuilds the swap fails loudly
// rather than bumping the fee forever. The reset deliberately KEEPS
// LastFeeRate so the signing driver's next PreSign (via
// bumpBTCFeeRate) bids strictly above the stuck tx — a valid BIP-125
// replacement that RBF lets evict the original.
func (d *BroadcastDriver) handleBTCConfirmTimeout(ctx context.Context, sw *Swap) {
	patched, _ := d.store.Patch(ctx, sw.ID, func(s *Swap) {
		if s.Status != SwapStatusAwaitingConfirmation {
			return
		}
		s.BroadcastRebuilds++
		if d.maxRebuilds > 0 && s.BroadcastRebuilds >= d.maxRebuilds {
			s.Status = SwapStatusFailed
			s.LastError = fmt.Sprintf(
				"Bitcoin release tx unconfirmed after %d rebuild attempts (feerate too low for the current mempool) — swap failed; deposit needs a sweep.",
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
		// KEEP LastFeeRate — the next PreSign bumps strictly above it.
		s.LastError = "Bitcoin release unconfirmed — rebuilding with a higher RBF feerate"
		s.LastErrorAt = time.Now().UTC()
	})
	d.rebuilds.Add(1)
	d.confirmTimeouts.Add(1)
	if d.logger != nil && patched != nil {
		if patched.Status == SwapStatusFailed {
			d.logger.Warn("btc confirmation rebuilds maxed out → failed",
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
// beat, so PreSign just uses the live mempool estimate). Otherwise
// +25% +1, so the replacement strictly out-bids the prior fee even for
// tiny rates where integer truncation would otherwise tie — BIP-125
// requires a higher absolute fee, not merely equal.
func bumpBTCFeeRate(prev int64) int64 {
	if prev <= 0 {
		return 0
	}
	return prev + prev/4 + 1
}
