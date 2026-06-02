package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"

	zapdb "github.com/luxfi/zapdb"
)

// zap_store.go: durable SwapStore implementation backed by luxfi/zapdb
// (the Lux-ecosystem fork of Badger v4). Replaces InMemoryStore for
// production deployments — a pod restart no longer drops in-flight
// swap state.
//
// Layout:
//
//	swap:<id>             → JSON-encoded Swap
//	idx:status:<s>:<id>   → empty value (per-status secondary index)
//	idx:src:<n>:<id>      → empty value (per-source-network index)
//
// The secondary indexes let List() avoid a full scan when filtering by
// Status / SourceNetwork — the watcher and signing drivers list by
// status on every tick, so a full scan would be O(all-swaps) per
// driver per tick.
//
// All mutating operations run inside db.Update — zapdb gives
// snapshot-isolated serializable transactions, so concurrent Patch
// callers are safe.

// ZapStore is the durable SwapStore. Open with NewZapStore(dir); close
// with Close(). One DB handle per process — zapdb takes a directory
// lock and refuses to open the same dir twice.
type ZapStore struct {
	db *zapdb.DB

	// idMaker + now are overridable in tests. We keep them on the
	// store rather than as package globals so tests can run in
	// parallel without leaking state.
	mu      sync.Mutex
	idMaker func() string
	now     func() time.Time
}

// NewZapStore opens (or creates) a zapdb database at dir.
//
// Production callers should pass a path on a PersistentVolume; dev/
// test callers can use t.TempDir().
//
// The returned store is safe for concurrent use. Caller must Close()
// before process exit so zapdb can flush its memtable.
func NewZapStore(dir string) (*ZapStore, error) {
	if dir == "" {
		return nil, errors.New("zap_store: dir is required")
	}
	opt := zapdb.DefaultOptions(dir).
		WithLogger(nil). // we don't want zapdb spam in our log stream
		WithSyncWrites(true)
	db, err := zapdb.Open(opt)
	if err != nil {
		return nil, fmt.Errorf("zap_store: open %s: %w", dir, err)
	}
	return &ZapStore{
		db:      db,
		idMaker: randSwapID,
		now:     time.Now,
	}, nil
}

// Close flushes and releases the database. Safe to call multiple
// times — zapdb itself is idempotent on Close.
func (s *ZapStore) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	return s.db.Close()
}

// =============================================================================
// SwapStore interface
// =============================================================================

// Key prefixes. All keys live under a single byte-prefix so iterators
// can scope by prefix without touching unrelated keyspace.
const (
	keyPrefixSwap        = "swap:"
	keyPrefixIdxStatus   = "idx:status:"
	keyPrefixIdxSrc      = "idx:src:"
	keyPrefixReleasePool = "releasepool:"
)

func swapKey(id string) []byte { return []byte(keyPrefixSwap + id) }
func idxStatusKey(status SwapStatus, id string) []byte {
	return []byte(keyPrefixIdxStatus + string(status) + ":" + id)
}
func idxSrcKey(net, id string) []byte { return []byte(keyPrefixIdxSrc + net + ":" + id) }

// releasePoolKey formats the persistence key for one pool entry.
// Index is zero-padded so iteration order matches sorted-by-index
// (which matches the round-robin slot ordering ReleasePool expects).
func releasePoolKey(idx int) []byte {
	return []byte(fmt.Sprintf("%s%06d", keyPrefixReleasePool, idx))
}

// Create persists a new swap. Sets ID + timestamps if missing. Returns
// an error if the id already exists.
//
// Wrapped in withConflictRetry — under heavy concurrent write load
// zapdb's MVCC can return ErrConflict, which from the caller's
// perspective is transient.
func (s *ZapStore) Create(ctx context.Context, swap *Swap) error {
	if swap == nil {
		return errors.New("zap_store: nil swap")
	}
	if err := ctx.Err(); err != nil {
		return err
	}

	// Assign id and timestamps before opening the txn so we don't
	// hold the write lock longer than needed.
	s.mu.Lock()
	if swap.ID == "" {
		swap.ID = s.idMaker()
	}
	now := s.now()
	if swap.CreatedAt.IsZero() {
		swap.CreatedAt = now
	}
	swap.UpdatedAt = now
	if swap.Status == "" {
		swap.Status = SwapStatusUserDepositPending
	}
	s.mu.Unlock()

	return s.withConflictRetry(ctx, func() error {
		return s.db.Update(func(txn *zapdb.Txn) error {
			key := swapKey(swap.ID)
			if _, err := txn.Get(key); err == nil {
				return fmt.Errorf("zap_store: duplicate id %s", swap.ID)
			} else if !errors.Is(err, zapdb.ErrKeyNotFound) {
				return err
			}
			val, err := json.Marshal(swap)
			if err != nil {
				return fmt.Errorf("zap_store: marshal: %w", err)
			}
			if err := txn.Set(key, val); err != nil {
				return err
			}
			if err := txn.Set(idxStatusKey(swap.Status, swap.ID), nil); err != nil {
				return err
			}
			if swap.SourceNetwork != "" {
				if err := txn.Set(idxSrcKey(swap.SourceNetwork, swap.ID), nil); err != nil {
					return err
				}
			}
			return nil
		})
	})
}

// Get returns a copy of the swap by id; ErrSwapNotFound if absent.
func (s *ZapStore) Get(ctx context.Context, id string) (*Swap, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	var out Swap
	err := s.db.View(func(txn *zapdb.Txn) error {
		item, err := txn.Get(swapKey(id))
		if err != nil {
			if errors.Is(err, zapdb.ErrKeyNotFound) {
				return ErrSwapNotFound
			}
			return err
		}
		return item.Value(func(val []byte) error {
			return json.Unmarshal(val, &out)
		})
	})
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// Patch atomically mutates a swap. fn is applied inside the txn; the
// returned snapshot is the persisted state.
//
// Implementation note: Patch needs to refresh secondary indexes when
// the patched swap changes Status or SourceNetwork — otherwise List()
// would return stale results. We compare the pre- and post-image and
// fix up the indexes inline.
func (s *ZapStore) Patch(ctx context.Context, id string, fn func(*Swap)) (*Swap, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	var out Swap
	err := s.withConflictRetry(ctx, func() error {
		return s.db.Update(func(txn *zapdb.Txn) error {
			key := swapKey(id)
			item, err := txn.Get(key)
			if err != nil {
				if errors.Is(err, zapdb.ErrKeyNotFound) {
					return ErrSwapNotFound
				}
				return err
			}
			var current Swap
			if err := item.Value(func(val []byte) error {
				return json.Unmarshal(val, &current)
			}); err != nil {
				return fmt.Errorf("zap_store: unmarshal current: %w", err)
			}
			oldStatus := current.Status
			oldSrc := current.SourceNetwork

			fn(&current)
			current.UpdatedAt = s.nowSafe()

			val, err := json.Marshal(&current)
			if err != nil {
				return fmt.Errorf("zap_store: marshal: %w", err)
			}
			if err := txn.Set(key, val); err != nil {
				return err
			}
			// Refresh secondary indexes when keys change. Tombstone the
			// old entry first, then write the new one.
			if oldStatus != current.Status {
				if err := txn.Delete(idxStatusKey(oldStatus, id)); err != nil {
					return err
				}
				if err := txn.Set(idxStatusKey(current.Status, id), nil); err != nil {
					return err
				}
			}
			if oldSrc != current.SourceNetwork {
				if oldSrc != "" {
					if err := txn.Delete(idxSrcKey(oldSrc, id)); err != nil {
						return err
					}
				}
				if current.SourceNetwork != "" {
					if err := txn.Set(idxSrcKey(current.SourceNetwork, id), nil); err != nil {
						return err
					}
				}
			}
			out = current
			return nil
		})
	})
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// List returns swaps matching filter, newest-first.
//
// Filter strategy: when Status (or SourceNetwork) is set, scan the
// matching secondary index — O(matches) — and fetch the swap blobs
// inline. With no filter, scan all swap blobs — O(all). Limit applies
// AFTER the newest-first sort because the iteration order is by key
// ascending, not by CreatedAt.
func (s *ZapStore) List(ctx context.Context, filter SwapFilter) ([]*Swap, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	out := make([]*Swap, 0)
	err := s.db.View(func(txn *zapdb.Txn) error {
		// Pick the most-selective scan prefix. Status is by far the
		// hottest filter (every driver lists by status on each tick).
		var idIter func(yield func(id string) error) error
		switch {
		case filter.Status != "":
			idIter = s.iterIndex(txn, keyPrefixIdxStatus+string(filter.Status)+":")
		case filter.SourceNetwork != "":
			idIter = s.iterIndex(txn, keyPrefixIdxSrc+filter.SourceNetwork+":")
		default:
			idIter = s.iterIndex(txn, keyPrefixSwap)
		}
		return idIter(func(id string) error {
			item, err := txn.Get(swapKey(id))
			if err != nil {
				if errors.Is(err, zapdb.ErrKeyNotFound) {
					// Index points to a swap that no longer exists.
					// Skip silently; a future compaction can clean up.
					return nil
				}
				return err
			}
			var sw Swap
			if err := item.Value(func(val []byte) error {
				return json.Unmarshal(val, &sw)
			}); err != nil {
				return fmt.Errorf("zap_store: unmarshal %s: %w", id, err)
			}
			// Apply the secondary filter (when scanning the primary
			// table, neither index narrowed the set).
			if filter.Status != "" && sw.Status != filter.Status {
				return nil
			}
			if filter.SourceNetwork != "" && sw.SourceNetwork != filter.SourceNetwork {
				return nil
			}
			out = append(out, &sw)
			return nil
		})
	})
	if err != nil {
		return nil, err
	}
	sortSwapsNewestFirst(out)
	if filter.Limit > 0 && len(out) > filter.Limit {
		out = out[:filter.Limit]
	}
	return out, nil
}

// iterIndex returns a closure that walks every key under the given
// prefix and yields the id (the suffix after the last ":"). The yield
// callback may halt iteration by returning a non-nil error.
//
// For the swap: prefix the id is the suffix after "swap:". For the
// idx:status:<s>: and idx:src:<n>: prefixes the id is the suffix after
// the final ":".
func (s *ZapStore) iterIndex(txn *zapdb.Txn, prefix string) func(yield func(id string) error) error {
	return func(yield func(id string) error) error {
		opt := zapdb.DefaultIteratorOptions
		opt.PrefetchValues = false
		it := txn.NewIterator(opt)
		defer it.Close()
		p := []byte(prefix)
		for it.Seek(p); it.ValidForPrefix(p); it.Next() {
			key := it.Item().Key()
			id := extractID(key, prefix)
			if id == "" {
				continue
			}
			if err := yield(id); err != nil {
				return err
			}
		}
		return nil
	}
}

// extractID strips the prefix and returns everything after the final
// ":" — or, if there's no further ":", the suffix as a whole. This
// handles both shapes:
//
//	"swap:abc"               → "abc"
//	"idx:status:done:abc"    → "abc" (prefix "idx:status:done:")
func extractID(key []byte, prefix string) string {
	suffix := string(key[len(prefix):])
	for i := len(suffix) - 1; i >= 0; i-- {
		if suffix[i] == ':' {
			return suffix[i+1:]
		}
	}
	return suffix
}

func (s *ZapStore) nowSafe() time.Time {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.now()
}

// =============================================================================
// Release-pool persistence (ReleasePoolStore interface)
// =============================================================================

// LoadEntries returns every persisted release-pool entry in index
// order. Empty slice on first boot. The key suffix is the index
// formatted as %06d, so a prefix-iterator naturally yields
// ascending-index order.
func (s *ZapStore) LoadEntries(ctx context.Context) ([]ReleasePoolEntry, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	out := make([]ReleasePoolEntry, 0)
	err := s.db.View(func(txn *zapdb.Txn) error {
		opt := zapdb.DefaultIteratorOptions
		opt.PrefetchValues = true
		it := txn.NewIterator(opt)
		defer it.Close()
		prefix := []byte(keyPrefixReleasePool)
		for it.Seek(prefix); it.ValidForPrefix(prefix); it.Next() {
			item := it.Item()
			var entry ReleasePoolEntry
			if err := item.Value(func(val []byte) error {
				return json.Unmarshal(val, &entry)
			}); err != nil {
				return fmt.Errorf("zap_store: unmarshal pool entry %s: %w", item.Key(), err)
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

// PutEntry persists one pool entry under releasepool:<index>. Used
// at startup pool-grow time and during operator-driven adjustments.
func (s *ZapStore) PutEntry(ctx context.Context, idx int, entry ReleasePoolEntry) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	entry.Index = idx
	val, err := json.Marshal(&entry)
	if err != nil {
		return fmt.Errorf("zap_store: marshal pool entry: %w", err)
	}
	return s.withConflictRetry(ctx, func() error {
		return s.db.Update(func(txn *zapdb.Txn) error {
			return txn.Set(releasePoolKey(idx), val)
		})
	})
}

// withConflictRetry runs op repeatedly until it either succeeds, returns
// a non-conflict error, or the context expires. zapdb's MVCC returns
// ErrConflict when two transactions read/write the same key around the
// same time — that's transient by definition, so the right call is to
// retry rather than propagate.
//
// Backoff is a tight short loop (the in-process MVCC oracle resolves
// fast); 1ms base growing to 32ms keeps the worst-case latency bounded
// while preventing CPU spin under high contention.
func (s *ZapStore) withConflictRetry(ctx context.Context, op func() error) error {
	const maxAttempts = 32
	delay := time.Millisecond
	for attempt := 0; attempt < maxAttempts; attempt++ {
		err := op()
		if err == nil {
			return nil
		}
		if !errors.Is(err, zapdb.ErrConflict) {
			return err
		}
		// Cap the backoff so we don't sleep ridiculously long after
		// many conflicts.
		if delay < 32*time.Millisecond {
			delay *= 2
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(delay):
		}
	}
	return fmt.Errorf("zap_store: gave up after %d ErrConflict retries", maxAttempts)
}
