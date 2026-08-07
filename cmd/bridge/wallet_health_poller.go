package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"github.com/luxfi/bridge/internal/mchain"
	luxlog "github.com/luxfi/log"
)

// wallet_health_poller.go: proactive signability check for every
// active release wallet, mirroring the BChainPoller pattern
// (bchain_poller.go) — a background loop caches a snapshot for
// /metrics; /metrics never blocks on RPC.
//
// Why this exists: the real threshold-MPC cluster (mpc-api-svc)
// stores persistent key shares per wallet. Those shares can silently
// desync on a long-lived wallet with no node restart and no config
// change — observed directly on 2026-06-11, when a ZOO release
// wallet went unsignable (sign request timed out) roughly 9 hours
// after keygen, while a freshly-minted wallet on the same cluster
// signed fine. Nothing upstream noticed until a real swap tried to
// pay out and stalled. This poller finds that failure mode before a
// user's swap does, by periodically exercising the exact signing
// call a real payout would make, against a throwaway message that
// commits nothing on-chain.
//
// mpcd-single (the launch custody for SOL/TON/XRP) is structurally
// immune to this class of failure — each wallet's key is re-derived
// on demand via HKDF from a seed, there's no persistent share state
// to desync — so probing it is a cheap extra check, not the primary
// motivation. The real 3-of-5 ECDSA cluster (EVM + BTC release
// wallets) is where this has actually fired.
//
// Trust model: the cache is a monitoring/alerting signal only, never
// consulted by the signing driver to decide whether to attempt a real
// release. A false "unsignable" reading here costs nothing but a log
// line; it does not block or divert a swap.
type WalletHealthPoller struct {
	client   *mchain.Client
	lister   mchain.ReleaseWalletLister
	interval time.Duration
	timeout  time.Duration
	logger   luxlog.Logger

	mu        sync.RWMutex
	snapshots map[string]WalletHealth // network -> last check result

	running  atomic.Bool
	stopOnce sync.Once
	cancel   context.CancelFunc
}

// WalletHealth is one release wallet's most recent canary-sign result.
type WalletHealth struct {
	Network       string
	WalletID      string
	Signable      bool
	LastCheckedAt time.Time
	LastError     string
	LatencyMS     int64
}

// DefaultWalletHealthPollInterval trades off "detect a stuck wallet
// before a real swap does" against "don't hammer the signing cluster
// with canary traffic on every wallet, every few seconds." 10 minutes
// catches the class of drift seen in practice (hours after keygen)
// with hours to spare, while keeping steady-state canary-sign volume
// low. Operators with more release wallets or a cluster known to be
// cheap to sign against can tighten this via --wallet-health-poll-interval.
const DefaultWalletHealthPollInterval = 10 * time.Minute

// DefaultWalletHealthPollTimeout bounds each canary sign call. Matches
// the order of magnitude of the incident that motivated this poller
// (a hung sign eventually times out rather than hanging the goroutine
// forever); shorter than SigningDriver's real perSignTimeout is fine —
// a health probe that itself takes minutes to fail isn't catching
// anything a real swap wouldn't also eventually hit.
const DefaultWalletHealthPollTimeout = 15 * time.Second

// NewWalletHealthPoller constructs a poller. client signs the canary
// message (pass the Private/treasury cluster client — the same one
// that signs real release txs); lister enumerates the wallets to
// check. Either nil disables the poller: Run returns immediately.
func NewWalletHealthPoller(client *mchain.Client, lister mchain.ReleaseWalletLister, interval time.Duration, logger luxlog.Logger) *WalletHealthPoller {
	if interval <= 0 {
		interval = DefaultWalletHealthPollInterval
	}
	return &WalletHealthPoller{
		client:    client,
		lister:    lister,
		interval:  interval,
		timeout:   DefaultWalletHealthPollTimeout,
		logger:    logger,
		snapshots: map[string]WalletHealth{},
	}
}

// Snapshot returns a copy of the most recent per-network health
// results. Cheap (read-lock + copy) — safe to call from the /metrics
// scrape path. Returns nil for a nil poller.
func (p *WalletHealthPoller) Snapshot() map[string]WalletHealth {
	if p == nil {
		return nil
	}
	p.mu.RLock()
	defer p.mu.RUnlock()
	out := make(map[string]WalletHealth, len(p.snapshots))
	for k, v := range p.snapshots {
		out[k] = v
	}
	return out
}

// Running reports whether the poller loop is active.
func (p *WalletHealthPoller) Running() bool {
	if p == nil {
		return false
	}
	return p.running.Load()
}

// Run blocks until ctx is cancelled, ticking every interval. Returns
// nil immediately (no-op loop) when client or lister is nil — lets
// callers unconditionally `go poller.Run(ctx)` without a nil check.
// Idempotent — a second Run on an active poller returns immediately.
func (p *WalletHealthPoller) Run(ctx context.Context) error {
	if p == nil || p.client == nil || p.lister == nil {
		return nil
	}
	if !p.running.CompareAndSwap(false, true) {
		return nil
	}
	defer p.running.Store(false)

	ctx, cancel := context.WithCancel(ctx)
	p.cancel = cancel
	defer cancel()

	// Check once immediately so /metrics has fresh data within the
	// first scrape interval rather than waiting a full poll cycle.
	p.checkAll(ctx)

	t := time.NewTicker(p.interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-t.C:
			p.checkAll(ctx)
		}
	}
}

// Stop cancels the loop (best-effort) and releases the run flag.
func (p *WalletHealthPoller) Stop() {
	p.stopOnce.Do(func() {
		if p.cancel != nil {
			p.cancel()
		}
	})
}

func (p *WalletHealthPoller) checkAll(ctx context.Context) {
	wallets := p.lister.ListReleaseWallets()
	for network, w := range wallets {
		if ctx.Err() != nil {
			return
		}
		p.checkOne(ctx, network, w)
	}
}

// checkOne requests a threshold signature over a canary digest for
// wallet w. The digest is a SHA-256 over network+wallet ID+the current
// hour, so every check is a genuinely fresh sign (nothing upstream can
// coalesce or cache it) without needing a counter. The resulting
// signature is discarded — this never builds or broadcasts a
// transaction, so it cannot move funds or collide with a real payout.
func (p *WalletHealthPoller) checkOne(ctx context.Context, network string, w mchain.Wallet) {
	checkCtx, cancel := context.WithTimeout(ctx, p.timeout)
	defer cancel()

	start := time.Now()
	digest := sha256.Sum256([]byte(fmt.Sprintf("bridge-wallet-healthcheck:%s:%s:%s",
		network, w.Name, start.Format("2006-01-02T15"))))
	msgHex := "0x" + hex.EncodeToString(digest[:])

	_, err := p.client.SignForWallet(checkCtx, w.Name, msgHex)
	elapsed := time.Since(start)

	health := WalletHealth{
		Network:       network,
		WalletID:      w.Name,
		Signable:      err == nil,
		LastCheckedAt: start,
		LatencyMS:     elapsed.Milliseconds(),
	}
	if err != nil {
		health.LastError = err.Error()
	}

	p.mu.Lock()
	p.snapshots[network] = health
	p.mu.Unlock()

	if err != nil && p.logger != nil {
		p.logger.Warn("release wallet failed canary sign — wallet may be unsignable, a real payout would stall here",
			"network", network,
			"wallet_id", w.Name,
			"err", err,
			"latency_ms", elapsed.Milliseconds(),
		)
	}
}
