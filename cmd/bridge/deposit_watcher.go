package main

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	luxlog "github.com/luxfi/log"

	"github.com/luxfi/bridge/internal/depositcheck"
)

// deposit_watcher.go: background goroutine that advances swap state
// from user_deposit_pending → bridge_transfer_pending when the user's
// deposit lands on the source chain.
//
// Tick cadence is fixed (default 15 s testnet, 30 s mainnet). On each
// tick the watcher:
//   1. Lists swaps in SwapStatusUserDepositPending from the SwapStore.
//   2. For each swap with a `wallet_name###address` deposit_address,
//      extracts the address and asks DepositChecker if the source
//      chain has >= swap.Amount of swap.SourceAsset there.
//   3. On confirmation, patches the swap to
//      SwapStatusBridgeTransferPending and records DepositedAmount.
//
// Idempotent by construction: only user_deposit_pending swaps are
// considered; a swap that's already advanced won't be re-checked.
// The MPC ceremony driver (Phase 4.6) is what picks up
// bridge_transfer_pending swaps from here.
//
// Trust model (IMPORTANT — load-bearing): this watcher is the sole
// automated forward producer of bridge_transfer_pending for deposit-address
// swaps, and that state directly drives a release-pool payout. So the single
// upstream RPC that depositcheck.Check consults IS trusted at runtime: an RPC
// that lies about a balance triggers a payout for a deposit that never landed.
// There is no runtime BridgeVM gate today (--resync-swaps is a one-shot boot
// reconciliation). Hardening this to a multi-RPC quorum / on-chain proof is a
// platform-wide follow-up; until then, operators MUST point depositcheck at
// trusted endpoints only.

// DepositChecker is the 1-method interface the watcher needs. Pulls
// the dependency to an interface so tests can swap in a fake without
// running a Sepolia mock. *depositcheck.Client satisfies it natively.
type DepositChecker interface {
	Check(ctx context.Context, p depositcheck.CheckParams) (bool, error)
}

// DepositWatcher polls the source chain for confirmed deposits on
// pending swaps and advances their state. Construct with NewDepositWatcher.
type DepositWatcher struct {
	store    SwapStore
	checker  DepositChecker
	interval time.Duration
	logger   luxlog.Logger

	// perCheckTimeout bounds each individual depositcheck call so a
	// slow upstream RPC can't stall the whole tick.
	perCheckTimeout time.Duration

	// expireAfter is the age (since CreatedAt) at which a
	// user_deposit_pending swap is auto-cancelled because the user
	// never sent the deposit. Closes the final hardening-matrix gap:
	// every other pipeline stage has a terminal escape, but
	// user_deposit_pending used to grow without bound. Zero ⇒ disabled
	// (legacy "keep pending forever" behaviour, preserved for back-compat).
	expireAfter time.Duration

	// running flips to true on Run + back to false on context cancel.
	// Exported via Running() so /health and tests can observe.
	running atomic.Bool

	// metrics — increment-only counters, read via Stats().
	ticks         atomic.Uint64
	checks        atomic.Uint64
	advances      atomic.Uint64
	checkErrors   atomic.Uint64
	listErrors    atomic.Uint64
	expired       atomic.Uint64
	stopOnce      sync.Once
	cancelRunning context.CancelFunc
}

// NewDepositWatcher builds a watcher with sensible defaults. interval
// of 0 means DefaultWatcherInterval. logger may be the zero-value
// luxlog.Logger (calls become no-ops if so, by luxlog's nil-check
// contract).
func NewDepositWatcher(store SwapStore, checker DepositChecker, interval time.Duration, logger luxlog.Logger) *DepositWatcher {
	if interval <= 0 {
		interval = DefaultWatcherInterval
	}
	return &DepositWatcher{
		store:           store,
		checker:         checker,
		interval:        interval,
		logger:          logger,
		perCheckTimeout: DefaultPerCheckTimeout,
	}
}

// DefaultWatcherInterval is the production-suitable tick cadence.
// 15s balances "user expectation of fast confirmation" against
// "public RPC rate limits."
const DefaultWatcherInterval = 15 * time.Second

// DefaultPerCheckTimeout caps each individual depositcheck.Check call.
const DefaultPerCheckTimeout = 8 * time.Second

// DefaultDepositExpireAfter is the cap on how long a swap can sit in
// user_deposit_pending before the watcher auto-cancels it. 24h is
// generous enough to never accidentally cancel a real user (even
// slow-to-act humans send deposits in minutes-to-hours) while bounding
// the store growth from abandoned swap intents.
const DefaultDepositExpireAfter = 24 * time.Hour

// SetExpireAfter configures the auto-cancel threshold for stale
// user_deposit_pending swaps. After this age (since CreatedAt) a
// swap is moved to SwapStatusCancelled with an operator-actionable
// LastError. Zero disables (legacy: keep forever). Negative values
// are clamped to zero.
func (w *DepositWatcher) SetExpireAfter(d time.Duration) {
	if d < 0 {
		d = 0
	}
	w.expireAfter = d
}

// Running reports whether the watcher loop is active.
func (w *DepositWatcher) Running() bool { return w.running.Load() }

// WatcherStats is a point-in-time view of the watcher's counters.
// Each field is monotonic from program start; reset implicitly when
// the process restarts.
type WatcherStats struct {
	Ticks       uint64 `json:"ticks"`
	Checks      uint64 `json:"checks"`
	Advances    uint64 `json:"advances"`
	CheckErrors uint64 `json:"check_errors"`
	ListErrors  uint64 `json:"list_errors"`
	// Expired counts user_deposit_pending swaps that were auto-
	// cancelled because their age exceeded --deposit-expire-after.
	// Non-zero on a healthy bridge means real users abandoned their
	// quotes (or someone is spamming the create endpoint); a sudden
	// spike is a smell (UX regression on the deposit step?).
	Expired uint64 `json:"expired"`
}

// Stats snapshots the current counters. Safe for concurrent reads.
func (w *DepositWatcher) Stats() WatcherStats {
	return WatcherStats{
		Ticks:       w.ticks.Load(),
		Checks:      w.checks.Load(),
		Advances:    w.advances.Load(),
		CheckErrors: w.checkErrors.Load(),
		ListErrors:  w.listErrors.Load(),
		Expired:     w.expired.Load(),
	}
}

// Run blocks until ctx is cancelled, ticking every interval. Returns
// ctx.Err() on shutdown. Call this from a goroutine spawned by the
// program's lifecycle owner.
func (w *DepositWatcher) Run(ctx context.Context) error {
	if !w.running.CompareAndSwap(false, true) {
		// Already running. Refuse a second loop to avoid double-advances.
		return nil
	}
	defer w.running.Store(false)

	ctx, cancel := context.WithCancel(ctx)
	w.cancelRunning = cancel
	defer cancel()

	if w.logger != nil {
		w.logger.Info("deposit watcher started",
			"interval", w.interval,
			"per_check_timeout", w.perCheckTimeout,
		)
	}

	// First tick fires immediately so a swap created before the
	// watcher started doesn't have to wait a full interval. Subsequent
	// ticks follow the cadence.
	w.tick(ctx)

	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			if w.logger != nil {
				w.logger.Info("deposit watcher stopped",
					"reason", ctx.Err(),
					"stats", w.Stats(),
				)
			}
			return ctx.Err()
		case <-ticker.C:
			w.tick(ctx)
		}
	}
}

// Stop signals the watcher to shut down. Safe to call multiple times.
// Idempotent — secondary calls are no-ops.
func (w *DepositWatcher) Stop() {
	w.stopOnce.Do(func() {
		if w.cancelRunning != nil {
			w.cancelRunning()
		}
	})
}

// Tick runs a single watcher iteration. Exported so tests can drive
// the loop deterministically without waiting for the timer.
func (w *DepositWatcher) Tick(ctx context.Context) { w.tick(ctx) }

// tick lists the pending swaps and checks each one's deposit address.
func (w *DepositWatcher) tick(ctx context.Context) {
	w.ticks.Add(1)
	swaps, err := w.store.List(ctx, SwapFilter{Status: SwapStatusUserDepositPending})
	if err != nil {
		w.listErrors.Add(1)
		if w.logger != nil {
			w.logger.Warn("deposit watcher: list pending swaps", "err", err)
		}
		return
	}
	if len(swaps) == 0 {
		return
	}
	if w.logger != nil {
		w.logger.Debug("deposit watcher tick", "pending", len(swaps))
	}
	now := time.Now().UTC()
	for _, sw := range swaps {
		if ctx.Err() != nil {
			return
		}
		// Deposit check first — a deposit that just landed should
		// advance the swap even when it's right at the edge of
		// expireAfter. checkOne is no-op-idempotent: if it advances,
		// maybeExpire's status guard prevents the cancel.
		w.checkOne(ctx, sw)
		w.maybeExpire(ctx, sw, now)
	}
}

// maybeExpire auto-cancels a stale user_deposit_pending swap whose
// CreatedAt is older than expireAfter. The status-guard inside Patch
// keeps this safe against the race where checkOne just advanced the
// swap on the same tick — only swaps still in user_deposit_pending
// after the guard get cancelled.
//
// Disabled when expireAfter == 0 (back-compat: legacy "pending forever").
func (w *DepositWatcher) maybeExpire(ctx context.Context, sw *Swap, now time.Time) {
	if w.expireAfter <= 0 {
		return
	}
	if sw.Status != SwapStatusUserDepositPending {
		// Already advanced (or cancelled by a prior tick) — nothing to do.
		return
	}
	if sw.CreatedAt.IsZero() {
		// Defensive: no birth timestamp ⇒ cannot compute age.
		// Skip rather than auto-cancel something we can't reason about.
		return
	}
	age := now.Sub(sw.CreatedAt)
	if age < w.expireAfter {
		return
	}

	patched, err := w.store.Patch(ctx, sw.ID, func(s *Swap) {
		// Status guard inside the lock: don't expire a swap that
		// another tick (or a concurrent admin reset) just advanced.
		if s.Status != SwapStatusUserDepositPending {
			return
		}
		s.Status = SwapStatusCancelled
		s.LastError = fmt.Sprintf(
			"Auto-cancelled after %s of no deposit (threshold: %s) — the create-time deposit address was never funded. Create a new quote to retry.",
			age.Round(time.Second), w.expireAfter,
		)
		s.LastErrorAt = now
	})
	if err != nil {
		// Store error during expiry — log but don't count it under
		// expired/. The next tick will retry.
		if w.logger != nil {
			w.logger.Warn("expire swap",
				"swap_id", sw.ID,
				"err", err,
			)
		}
		return
	}
	if patched != nil && patched.Status == SwapStatusCancelled {
		w.expired.Add(1)
		if w.logger != nil {
			w.logger.Info("expired stale user_deposit_pending swap",
				"swap_id", sw.ID,
				"age", age.Round(time.Second),
				"threshold", w.expireAfter,
			)
		}
	}
}

// checkOne probes the source chain for a single swap's deposit
// address and advances state on confirmation. Errors are logged
// at debug level — they're often transient (rate limits, peering)
// and the next tick will retry.
func (w *DepositWatcher) checkOne(ctx context.Context, sw *Swap) {
	addr := extractDepositAddress(sw.DepositAddress)
	if addr == "" {
		// No deposit address minted (e.g. use_deposit_address=false).
		// Nothing to check — that swap follows a different settlement
		// path that isn't the watcher's job to drive.
		return
	}
	if sw.SourceNetwork == "" || sw.SourceAsset == "" || sw.Amount <= 0 {
		// Defensive: malformed swap. Skip rather than spam the upstream.
		return
	}

	w.checks.Add(1)
	checkCtx, cancel := context.WithTimeout(ctx, w.perCheckTimeout)
	defer cancel()

	confirmed, err := w.checker.Check(checkCtx, depositcheck.CheckParams{
		NetworkInternalName: sw.SourceNetwork,
		Address:             addr,
		Asset:               sw.SourceAsset,
		RequiredAmount:      sw.Amount,
	})
	if err != nil {
		w.checkErrors.Add(1)
		if w.logger != nil {
			w.logger.Debug("deposit check failed",
				"swap_id", sw.ID,
				"network", sw.SourceNetwork,
				"address", addr,
				"err", err,
			)
		}
		return
	}
	if !confirmed {
		return
	}

	// Advance state. Patch is atomic under the store's lock.
	advanced, err := w.store.Patch(ctx, sw.ID, func(s *Swap) {
		// Defensive re-check inside the lock: don't double-advance if
		// another tick raced us. (InMemoryStore serializes Patch so
		// in practice we won't race, but future durable stores might.)
		if s.Status != SwapStatusUserDepositPending {
			return
		}
		s.Status = SwapStatusBridgeTransferPending
		s.DepositedAmount = sw.Amount
		// Clear any error left from a previous (admin-reset) attempt
		// so the UI doesn't display a stale "Insufficient funds" while
		// the new signing leg is in progress.
		s.LastError = ""
		s.LastErrorAt = time.Time{}
	})
	if err != nil {
		if w.logger != nil {
			w.logger.Warn("advance swap state",
				"swap_id", sw.ID,
				"err", err,
			)
		}
		return
	}
	if advanced != nil && advanced.Status == SwapStatusBridgeTransferPending {
		w.advances.Add(1)
		if w.logger != nil {
			w.logger.Info("deposit confirmed → advanced",
				"swap_id", sw.ID,
				"network", sw.SourceNetwork,
				"asset", sw.SourceAsset,
				"amount", sw.Amount,
			)
		}
	}
}

// extractDepositAddress pulls the on-chain address out of the legacy
// "wallet_name###address" envelope mchain returns. Returns "" when
// the input is empty or no envelope marker is present.
func extractDepositAddress(s string) string {
	if s == "" {
		return ""
	}
	if i := strings.Index(s, "###"); i >= 0 {
		return s[i+3:]
	}
	// Caller stored a bare address — accept it.
	return s
}
