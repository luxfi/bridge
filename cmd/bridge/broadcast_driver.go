package main

import (
	"context"
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

	running atomic.Bool

	ticks          atomic.Uint64
	attempts       atomic.Uint64
	successes      atomic.Uint64
	failures       atomic.Uint64
	skippedNoRawTx atomic.Uint64
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
}

// Stats snapshots the counters. Safe for concurrent reads.
func (d *BroadcastDriver) Stats() BroadcastDriverStats {
	return BroadcastDriverStats{
		Ticks:          d.ticks.Load(),
		Attempts:       d.attempts.Load(),
		Successes:      d.successes.Load(),
		Failures:       d.failures.Load(),
		SkippedNoRawTx: d.skippedNoRawTx.Load(),
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
		// Leave at SwapStatusBroadcasting so the next tick retries.
		// The destination RPC's idempotency (nonce-already-used,
		// duplicate-tx-rejected) means re-pushing is safe.
		return
	}

	_, err = d.store.Patch(ctx, sw.ID, func(s *Swap) {
		if s.Status != SwapStatusBroadcasting {
			return
		}
		s.DestTxHash = res.TxHash
		s.Status = SwapStatusCompleted
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

// Compile-time check: *broadcast.Client satisfies Broadcaster.
var _ Broadcaster = (*broadcast.Client)(nil)
