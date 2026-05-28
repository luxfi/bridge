package main

import (
	"context"
	"errors"
	"fmt"
	"math/big"
	"sync"

	luxlog "github.com/luxfi/log"
)

// release_pools.go: multi-family wrapper around ReleasePool.
//
// The bridge runs at least one pool per chain family it bridges TO
// (the SOURCE chain doesn't matter for release wallets — they're the
// destination signer). Today that's EVM + BTC; tomorrow it will also
// be SOL / TON / XRP.
//
// Why this exists as a separate type:
//   - ReleasePool itself stays single-family + simple. The "what
//     family does this pool belong to" decision is captured at
//     construction time and persisted on every entry.
//   - ReleasePools (plural) is a thin orchestrator: it owns a map of
//     family-keyed pools, dispatches Acquire/Bootstrap by family,
//     and provides the snapshot view for /health.
//   - Tests can drive each pool directly (no ReleasePools needed) or
//     compose them via ReleasePools (multi-family integration tests).
//
// Concurrency: ReleasePools is safe for concurrent use. The internal
// map is read-only after construction (pools are added via AddPool
// only at startup); each *ReleasePool handles its own locking.

// ReleasePools is the multi-family aggregator. One *ReleasePool per
// family the bridge supports.
type ReleasePools struct {
	mu     sync.RWMutex
	byFam  map[string]*ReleasePool
	logger luxlog.Logger
}

// NewReleasePools constructs an empty multi-family aggregator. Call
// AddPool for each family the bridge serves.
func NewReleasePools(logger luxlog.Logger) *ReleasePools {
	return &ReleasePools{
		byFam:  make(map[string]*ReleasePool),
		logger: logger,
	}
}

// AddPool registers a per-family pool. Idempotent on the (family,
// pool) pair; an existing family entry is replaced (and logged).
func (ps *ReleasePools) AddPool(p *ReleasePool) {
	if p == nil {
		return
	}
	ps.mu.Lock()
	defer ps.mu.Unlock()
	if ps.byFam == nil {
		ps.byFam = make(map[string]*ReleasePool)
	}
	if existing := ps.byFam[p.family]; existing != nil && ps.logger != nil {
		ps.logger.Warn("release pools: replacing existing pool",
			"family", p.family,
			"existing_size", existing.Size(),
			"new_size", p.Size(),
		)
	}
	ps.byFam[p.family] = p
}

// Pool returns the *ReleasePool for the given family, or nil when
// the family hasn't been registered.
func (ps *ReleasePools) Pool(family string) *ReleasePool {
	ps.mu.RLock()
	defer ps.mu.RUnlock()
	return ps.byFam[family]
}

// Families returns the list of registered family identifiers, sorted
// alphabetically for stable output.
func (ps *ReleasePools) Families() []string {
	ps.mu.RLock()
	defer ps.mu.RUnlock()
	out := make([]string, 0, len(ps.byFam))
	for f := range ps.byFam {
		out = append(out, f)
	}
	// Stable lex order — small enough that a manual sort is fine
	// without importing sort.
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && out[j-1] > out[j]; j-- {
			out[j-1], out[j] = out[j], out[j-1]
		}
	}
	return out
}

// ErrUnknownFamily indicates the caller requested a family that
// wasn't registered with AddPool.
var ErrUnknownFamily = errors.New("release pools: unknown family (no pool registered)")

// Acquire dispatches to the family's pool. Returns ErrUnknownFamily
// when the family isn't registered, ErrEmptyPool when it is but
// has no entries yet.
func (ps *ReleasePools) Acquire(ctx context.Context, family, destinationNetwork string) (*ReleasePoolEntry, error) {
	pool := ps.Pool(family)
	if pool == nil {
		return nil, fmt.Errorf("%w: %s", ErrUnknownFamily, family)
	}
	return pool.Acquire(ctx, destinationNetwork)
}

// TotalSize sums the sizes of every registered pool — useful for
// /health output.
func (ps *ReleasePools) TotalSize() int {
	ps.mu.RLock()
	defer ps.mu.RUnlock()
	n := 0
	for _, p := range ps.byFam {
		n += p.Size()
	}
	return n
}

// Snapshot returns a per-family map of {size, mint_network, balance_threshold}
// suitable for direct JSON emission on /health. The output is a fresh
// map; callers can mutate without affecting internal state.
func (ps *ReleasePools) Snapshot() map[string]map[string]any {
	ps.mu.RLock()
	defer ps.mu.RUnlock()
	out := make(map[string]map[string]any, len(ps.byFam))
	for fam, p := range ps.byFam {
		entry := map[string]any{
			"size":         p.Size(),
			"mint_network": p.mintNetwork,
		}
		if p.BalanceThresholdWei != nil {
			entry["balance_threshold"] = p.BalanceThresholdWei.String()
		}
		out[fam] = entry
	}
	return out
}

// =============================================================================
// BTC balance probe adapter
// =============================================================================

// BTCBalanceProbeFn wraps a function (likely
// *txassembler.MempoolSpaceClient.BalanceSat) into the BalanceProbe
// interface that ReleasePool consumes. The adapter ignores the
// network argument (BTC pools mint a single network identity at
// construction).
type BTCBalanceProbeFn struct {
	Network string
	// Fn returns balance in satoshis. The release-pool API uses
	// *big.Int for type-uniformity with EVM wei; the value here is
	// the satoshi count packed into a *big.Int.
	Fn func(ctx context.Context, address string) (int64, error)
}

// BalanceAt implements BalanceProbe.
func (b *BTCBalanceProbeFn) BalanceAt(ctx context.Context, _ /*network*/, address string) (*big.Int, error) {
	sat, err := b.Fn(ctx, address)
	if err != nil {
		return nil, err
	}
	return big.NewInt(sat), nil
}
