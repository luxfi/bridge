package main

import (
	"context"
	"errors"
	"fmt"

	luxlog "github.com/luxfi/log"

	"github.com/luxfi/bridge/internal/mchain"
)

// release_pool_set.go: per-family routing wrapper around *ReleasePool.
//
// Why a wrapper rather than a per-family map inside *ReleasePool:
//   - Pool identity is family-scoped. An EVM pool wallet's eth_address
//     works on every EVM destination, but it does NOT work on Solana
//     — Solana needs an Ed25519 keygen with a base58 sol_address.
//     The two pools are independent in every meaningful way: different
//     keygen calls, different on-chain identifiers, different balance
//     units, different funding flows.
//   - Wrapping keeps the existing *ReleasePool code path unchanged
//     (zero risk to the EVM path). The wrapper merely picks which
//     *ReleasePool to call into based on the destination's family.
//   - Operators can independently configure pool sizes + thresholds
//     per family — Solana pools typically need 1 SOL per wallet to
//     cover fees + ATA rent, vs. 0.1 LUX for EVM pools.
//
// Persistence layout (ZapStore keys, see zap_store.go::keyPrefixReleasePool*):
//
//	releasepool:eth:NNNNNN  → ETH/EVM pool entries
//	releasepool:btc:NNNNNN  → BTC pool entries (placeholder; BTC PR ships keys)
//	releasepool:sol:NNNNNN  → SOL pool entries
//
// The bare "releasepool:NNNNNN" namespace (no family segment) remains
// the EVM default for backward compat with the pre-multi-family
// deployments — existing entries continue to work without migration.

// ReleasePoolSet is the per-family router. Holds one *ReleasePool per
// signing family + dispatches Acquire by family of the destination
// network. Concurrency-safe (delegates to each *ReleasePool's own
// locking).
type ReleasePoolSet struct {
	// EVM is the secp256k1 pool used for all eth-addressed destinations
	// (Ethereum, Lux, Base, Polygon, etc.). The existing single-pool
	// deployment shape sits here.
	EVM *ReleasePool

	// SOL is the Ed25519/FROST pool used for Solana destinations.
	// Wallets have base58 32-byte addresses; the keygen must request
	// CurveEd25519 (see mchain.CurveFor).
	SOL *ReleasePool

	// BTC is the secp256k1+taproot pool for Bitcoin destinations.
	// Populated by the BTC PR (z/bridgev2-btc-broadcast); SOL agent
	// leaves it nil so the wiring in main.go can compose both PRs
	// without conflict.
	BTC *ReleasePool

	logger luxlog.Logger
}

// NewReleasePoolSet constructs an empty set. Populate the per-family
// pointers individually before calling Bootstrap.
func NewReleasePoolSet(logger luxlog.Logger) *ReleasePoolSet {
	return &ReleasePoolSet{logger: logger}
}

// ErrNoPoolForFamily is returned when Acquire is called with a
// destination network whose family doesn't have a configured pool.
// Callers fall back to the legacy "deposit wallet doubles as release
// wallet" path on this error.
var ErrNoPoolForFamily = errors.New("release pool set: no pool configured for family")

// Acquire picks the next pool entry for the destination network's
// family. Returns ErrEmptyPool when the family pool exists but has no
// entries; ErrNoPoolForFamily when no pool is configured for that
// family.
//
// Round-robin selection happens per family (each *ReleasePool maintains
// its own cursor). The two families never share rotation state.
func (s *ReleasePoolSet) Acquire(ctx context.Context, destinationNetwork string) (*ReleasePoolEntry, error) {
	pool, err := s.poolFor(destinationNetwork)
	if err != nil {
		return nil, err
	}
	return pool.Acquire(ctx, destinationNetwork)
}

// poolFor returns the *ReleasePool registered for the network's family.
// Pure routing — no allocation, no I/O.
func (s *ReleasePoolSet) poolFor(network string) (*ReleasePool, error) {
	switch mchain.AddressTypeFor(network) {
	case mchain.AddressTypeETH:
		if s.EVM == nil {
			return nil, fmt.Errorf("%w: ETH", ErrNoPoolForFamily)
		}
		return s.EVM, nil
	case mchain.AddressTypeSOL:
		if s.SOL == nil {
			return nil, fmt.Errorf("%w: SOL", ErrNoPoolForFamily)
		}
		return s.SOL, nil
	case mchain.AddressTypeBTC:
		if s.BTC == nil {
			return nil, fmt.Errorf("%w: BTC", ErrNoPoolForFamily)
		}
		return s.BTC, nil
	default:
		return nil, fmt.Errorf("%w: %s", ErrNoPoolForFamily,
			mchain.AddressTypeFor(network))
	}
}

// PoolFor returns the per-family *ReleasePool, or nil if not configured.
// Exported for /health diagnostics + the signing driver's Acquire path.
// Distinct from poolFor (which returns an error) so callers don't have
// to translate "no pool" into a probe boolean.
func (s *ReleasePoolSet) PoolFor(network string) *ReleasePool {
	switch mchain.AddressTypeFor(network) {
	case mchain.AddressTypeETH:
		return s.EVM
	case mchain.AddressTypeSOL:
		return s.SOL
	case mchain.AddressTypeBTC:
		return s.BTC
	default:
		return nil
	}
}

// Size returns the total number of provisioned entries across all
// families. Zero ⇒ no pool can serve any swap; the signing driver
// should fall back to the legacy deposit-as-release semantics.
func (s *ReleasePoolSet) Size() int {
	total := 0
	if s.EVM != nil {
		total += s.EVM.Size()
	}
	if s.SOL != nil {
		total += s.SOL.Size()
	}
	if s.BTC != nil {
		total += s.BTC.Size()
	}
	return total
}

// FamilySizes returns a map of family → pool size for /health output.
// Empty for families with no pool configured.
func (s *ReleasePoolSet) FamilySizes() map[string]int {
	out := map[string]int{}
	if s.EVM != nil {
		out["eth"] = s.EVM.Size()
	}
	if s.SOL != nil {
		out["sol"] = s.SOL.Size()
	}
	if s.BTC != nil {
		out["btc"] = s.BTC.Size()
	}
	return out
}
