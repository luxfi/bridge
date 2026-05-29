package main

import (
	"context"
	"sync"
	"sync/atomic"
	"time"

	"github.com/luxfi/bridge/internal/bchain"
	luxlog "github.com/luxfi/log"
)

// BChainPoller is a small background loop that periodically refreshes
// the LP-333 signer-set + epoch state from b-chain and caches it for
// /metrics to read. /metrics must not block on RPC — if b-chain hangs,
// Prometheus scrapes would time out and the whole observability surface
// would go dark exactly when an operator needs it most.
//
// Trust model: the cached snapshot is a hint, not a settlement
// authority. The bridge does NOT consult this cache to decide whether
// to sign a swap — that's still the MPC cluster's call. The cache
// powers operator dashboards + alerting only.
//
// Stale-tolerance: when b-chain is unreachable, the cache keeps the
// last good snapshot indefinitely and surfaces `reachable=0` so an
// operator sees "we believe the signer set is X (from 4h ago)" rather
// than "we have no idea what the signer set is."
type BChainPoller struct {
	client   *bchain.Client
	interval time.Duration
	timeout  time.Duration
	logger   luxlog.Logger

	mu       sync.RWMutex
	snapshot BChainSnapshot

	running atomic.Bool

	stopOnce sync.Once
	cancel   context.CancelFunc
}

// BChainSnapshot is one point-in-time view of b-chain's LP-333 state.
// Empty fields mean "never successfully fetched yet" — distinguish from
// "fetched and is genuinely zero" by checking LastFetchedAt.
type BChainSnapshot struct {
	// Reachable is true iff the most recent fetch succeeded.
	Reachable bool
	// Epoch is the current LP-333 epoch number, or 0 when never fetched.
	Epoch uint64
	// Threshold is the t in t-of-n quorum, or 0 when never fetched.
	Threshold int
	// Total is the cardinality of the signer set, or 0 when never fetched.
	Total int
	// SignerSetHash fingerprint for diff detection. Empty when never fetched.
	SignerSetHash string
	// LastFetchedAt is the wall-clock time of the latest fetch attempt
	// (successful OR failed). Zero on first construction.
	LastFetchedAt time.Time
	// LastError surfaces the most recent fetch error (empty on success).
	// Operators alert on this transitioning non-empty in the bchain logs.
	LastError string
}

// DefaultBChainPollInterval is the cadence at which the poller
// re-queries b-chain. 30s is a reasonable trade-off: signer-set
// rotations are infrequent (hours / days), but operators want a
// detectable lag <1m on the gauge.
const DefaultBChainPollInterval = 30 * time.Second

// DefaultBChainPollTimeout bounds each fetch. 3s gives a slow but
// reachable b-chain time to respond without holding the loop hostage
// when the upstream is dead.
const DefaultBChainPollTimeout = 3 * time.Second

// NewBChainPoller constructs a poller. The poller is concurrency-safe
// and lazy — call Run in a goroutine to start the background loop;
// Snapshot is callable at any time and returns the zero value until
// the first fetch completes.
func NewBChainPoller(c *bchain.Client, interval time.Duration, logger luxlog.Logger) *BChainPoller {
	if interval <= 0 {
		interval = DefaultBChainPollInterval
	}
	return &BChainPoller{
		client:   c,
		interval: interval,
		timeout:  DefaultBChainPollTimeout,
		logger:   logger,
	}
}

// Snapshot returns the most recent cached b-chain state. Cheap (read-
// lock + copy) — safe to call from the /metrics scrape path.
func (p *BChainPoller) Snapshot() BChainSnapshot {
	if p == nil {
		return BChainSnapshot{}
	}
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.snapshot
}

// Running reports whether the poller loop is active.
func (p *BChainPoller) Running() bool {
	if p == nil {
		return false
	}
	return p.running.Load()
}

// Run blocks until ctx is cancelled, ticking every interval. Returns
// ctx.Err() on shutdown. Idempotent — a second Run on an active poller
// returns immediately with nil.
func (p *BChainPoller) Run(ctx context.Context) error {
	if !p.running.CompareAndSwap(false, true) {
		return nil
	}
	defer p.running.Store(false)

	ctx, cancel := context.WithCancel(ctx)
	p.cancel = cancel
	defer cancel()

	// Fetch once immediately so /metrics has fresh data within the
	// scrape interval rather than waiting a full poll cycle.
	p.fetchOnce(ctx)

	t := time.NewTicker(p.interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-t.C:
			p.fetchOnce(ctx)
		}
	}
}

// Stop cancels the loop (best-effort) and releases the run flag.
func (p *BChainPoller) Stop() {
	p.stopOnce.Do(func() {
		if p.cancel != nil {
			p.cancel()
		}
	})
}

func (p *BChainPoller) fetchOnce(ctx context.Context) {
	fetchCtx, cancel := context.WithTimeout(ctx, p.timeout)
	defer cancel()

	info, err := p.client.GetSignerSetInfo(fetchCtx)
	now := time.Now()
	if err != nil {
		// Preserve the prior snapshot's Epoch/Threshold/etc so the
		// last good state stays visible — operators see "stale but
		// believable" rather than "zeros across the board" when
		// b-chain blips. Only Reachable + LastError + LastFetchedAt
		// reflect this attempt.
		p.mu.Lock()
		prev := p.snapshot
		p.snapshot = BChainSnapshot{
			Reachable:     false,
			Epoch:         prev.Epoch,
			Threshold:     prev.Threshold,
			Total:         prev.Total,
			SignerSetHash: prev.SignerSetHash,
			LastFetchedAt: now,
			LastError:     err.Error(),
		}
		p.mu.Unlock()
		if p.logger != nil {
			p.logger.Warn("bchain poller fetch failed",
				"err", err,
				"stale_for", now.Sub(prev.LastFetchedAt),
			)
		}
		return
	}

	p.mu.Lock()
	p.snapshot = BChainSnapshot{
		Reachable:     true,
		Epoch:         info.Epoch,
		Threshold:     info.Threshold,
		Total:         info.Total,
		SignerSetHash: info.SignerSetHash,
		LastFetchedAt: now,
		LastError:     "",
	}
	p.mu.Unlock()
}
