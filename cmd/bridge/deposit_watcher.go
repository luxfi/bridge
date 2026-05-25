package main

import (
	"context"
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
// Trust model: depositcheck queries public source-chain RPCs. The
// result is best-effort. BridgeVM's own auditor (when deployed) is
// the authority for slashing; this layer is for UI / SDK polling.

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

	// running flips to true on Run + back to false on context cancel.
	// Exported via Running() so /health and tests can observe.
	running atomic.Bool

	// metrics — increment-only counters, read via Stats().
	ticks         atomic.Uint64
	checks        atomic.Uint64
	advances      atomic.Uint64
	checkErrors   atomic.Uint64
	listErrors    atomic.Uint64
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
}

// Stats snapshots the current counters. Safe for concurrent reads.
func (w *DepositWatcher) Stats() WatcherStats {
	return WatcherStats{
		Ticks:       w.ticks.Load(),
		Checks:      w.checks.Load(),
		Advances:    w.advances.Load(),
		CheckErrors: w.checkErrors.Load(),
		ListErrors:  w.listErrors.Load(),
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
	for _, sw := range swaps {
		if ctx.Err() != nil {
			return
		}
		w.checkOne(ctx, sw)
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
