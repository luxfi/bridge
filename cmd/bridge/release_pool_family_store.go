package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"

	zapdb "github.com/luxfi/zapdb"
)

// release_pool_family_store.go: per-family persistence adapter for
// *ReleasePool. The base ZapStore + InMemoryStore each implement
// ReleasePoolStore for the legacy single-namespace (releasepool:NNNNNN)
// layout — fine for the EVM-only deployment. With multiple families
// we need distinct keyspaces so an EVM pool entry never collides with
// a SOL entry at the same index.
//
// Strategy: a thin wrapper that adapts a "family code" + base store
// into a ReleasePoolStore that scopes keys to that family.
//
//	releasepool:NNNNNN          ← legacy EVM (continues to work)
//	releasepool:sol:NNNNNN      ← SOL family
//	releasepool:btc:NNNNNN      ← BTC family (populated by BTC PR)
//
// The wrapper holds a back-pointer to the base store + a code. For
// ZapStore it uses direct zapdb access. For InMemoryStore it uses a
// per-family map. Both shapes are kept side-by-side here rather than
// scattered across the two store implementations because the family-
// namespacing logic is small enough to fit in one file.

// FamilyCode is the short ASCII identifier embedded in persistence
// keys. Stable — changing the value breaks reload on existing pools.
type FamilyCode string

const (
	FamilyEVM FamilyCode = "eth" // matches mchain.AddressTypeETH
	FamilySOL FamilyCode = "sol" // matches mchain.AddressTypeSOL
	FamilyBTC FamilyCode = "btc" // matches mchain.AddressTypeBTC
)

// =============================================================================
// ZapStore family adapter
// =============================================================================

// ZapStoreFamily is a ReleasePoolStore that scopes its keys to one
// family inside a shared ZapStore. The base store still implements the
// legacy (releasepool:NNNNNN) layout used by the EVM pool; new
// families layer in via this adapter so the two key namespaces stay
// disjoint and operators can wipe/migrate one family without touching
// the other.
type ZapStoreFamily struct {
	base   *ZapStore
	family FamilyCode
}

// NewZapStoreFamily wraps the base store with a family code. Returns
// nil + an error if base is nil — defensive, since the wrapper is
// useless without backing storage.
func NewZapStoreFamily(base *ZapStore, family FamilyCode) (*ZapStoreFamily, error) {
	if base == nil {
		return nil, errors.New("zap_store_family: nil base")
	}
	if family == "" {
		return nil, errors.New("zap_store_family: empty family")
	}
	return &ZapStoreFamily{base: base, family: family}, nil
}

// familyKey formats the keyspace key for a family-scoped entry:
//
//	releasepool:<family>:NNNNNN
//
// Index is zero-padded so prefix iteration yields ascending order
// (matching the legacy releasepool:NNNNNN behaviour).
func (s *ZapStoreFamily) familyKey(idx int) []byte {
	return []byte(fmt.Sprintf("%s%s:%06d", keyPrefixReleasePool, s.family, idx))
}

// familyPrefix returns the prefix used to enumerate this family's entries.
func (s *ZapStoreFamily) familyPrefix() []byte {
	return []byte(fmt.Sprintf("%s%s:", keyPrefixReleasePool, s.family))
}

// LoadEntries implements ReleasePoolStore. Walks the family-scoped
// keyspace in ascending-index order.
func (s *ZapStoreFamily) LoadEntries(ctx context.Context) ([]ReleasePoolEntry, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	out := make([]ReleasePoolEntry, 0)
	err := s.base.db.View(func(txn *zapdb.Txn) error {
		opt := zapdb.DefaultIteratorOptions
		opt.PrefetchValues = true
		it := txn.NewIterator(opt)
		defer it.Close()
		prefix := s.familyPrefix()
		for it.Seek(prefix); it.ValidForPrefix(prefix); it.Next() {
			item := it.Item()
			var entry ReleasePoolEntry
			if err := item.Value(func(val []byte) error {
				return json.Unmarshal(val, &entry)
			}); err != nil {
				return fmt.Errorf("zap_store_family: unmarshal pool entry %s: %w", item.Key(), err)
			}
			out = append(out, entry)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// PutEntry implements ReleasePoolStore. Persists under the family-
// scoped key.
func (s *ZapStoreFamily) PutEntry(ctx context.Context, idx int, entry ReleasePoolEntry) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	entry.Index = idx
	val, err := json.Marshal(&entry)
	if err != nil {
		return fmt.Errorf("zap_store_family: marshal pool entry: %w", err)
	}
	return s.base.withConflictRetry(ctx, func() error {
		return s.base.db.Update(func(txn *zapdb.Txn) error {
			return txn.Set(s.familyKey(idx), val)
		})
	})
}

// =============================================================================
// InMemoryStore family adapter
// =============================================================================

// InMemoryStoreFamily is the in-memory counterpart. Each family gets
// its own sync.Map-backed slot. Lossy on restart — same semantics as
// the base in-memory store, since the dev path doesn't expect
// durability.
type InMemoryStoreFamily struct {
	base   *InMemoryStore
	family FamilyCode

	// initOnce gates lazy creation of the per-family entries map. The
	// base InMemoryStore.pool is one shared map; we route through
	// familyPools keyed by code instead so two families can coexist
	// in the same process.
	initOnce sync.Once
}

// NewInMemoryStoreFamily wraps a base in-memory store.
func NewInMemoryStoreFamily(base *InMemoryStore, family FamilyCode) (*InMemoryStoreFamily, error) {
	if base == nil {
		return nil, errors.New("inmem_store_family: nil base")
	}
	if family == "" {
		return nil, errors.New("inmem_store_family: empty family")
	}
	return &InMemoryStoreFamily{base: base, family: family}, nil
}

// familyPools is the per-family entries store. Keyed by FamilyCode →
// index → entry. Lives on *InMemoryStore so multiple
// InMemoryStoreFamily wrappers share state for the same code (e.g. if
// the operator wires both pool size + bootstrap).
//
// We thread it through the base store rather than holding a copy here
// so a "load → put → load" sequence across two wrapper instances of
// the same family sees its own writes.
func (s *InMemoryStore) familyPoolsLazyInit() {
	s.familyPoolsOnce.Do(func() {
		s.familyPools = map[FamilyCode]*inMemoryReleasePool{}
	})
}

func (s *InMemoryStore) familyPool(family FamilyCode) *inMemoryReleasePool {
	s.familyPoolsLazyInit()
	s.familyMu.Lock()
	defer s.familyMu.Unlock()
	if p, ok := s.familyPools[family]; ok {
		return p
	}
	p := &inMemoryReleasePool{entries: map[int]ReleasePoolEntry{}}
	s.familyPools[family] = p
	return p
}

// LoadEntries implements ReleasePoolStore.
func (s *InMemoryStoreFamily) LoadEntries(_ context.Context) ([]ReleasePoolEntry, error) {
	p := s.base.familyPool(s.family)
	p.mu.Lock()
	defer p.mu.Unlock()
	out := make([]ReleasePoolEntry, 0, len(p.entries))
	// Stable ascending-index iteration.
	maxIdx := -1
	for k := range p.entries {
		if k > maxIdx {
			maxIdx = k
		}
	}
	for i := 0; i <= maxIdx; i++ {
		if e, ok := p.entries[i]; ok {
			out = append(out, e)
		}
	}
	return out, nil
}

// PutEntry implements ReleasePoolStore.
func (s *InMemoryStoreFamily) PutEntry(_ context.Context, idx int, entry ReleasePoolEntry) error {
	p := s.base.familyPool(s.family)
	p.mu.Lock()
	defer p.mu.Unlock()
	entry.Index = idx
	p.entries[idx] = entry
	return nil
}
