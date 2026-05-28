package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"sync"
	"sync/atomic"
	"time"

	luxlog "github.com/luxfi/log"

	"github.com/luxfi/bridge/internal/mchain"
)

// release_pool.go: static pool of MPC release wallets used by the
// signing driver to broadcast the destination-chain release tx.
//
// Why decouple deposit + release:
//   - Pre-pool, the bridge reused the same MPC wallet for deposit AND
//     release: the user deposited to wallet W on the source chain,
//     and the bridge expected W to also hold native gas on the
//     destination chain to broadcast the release tx. That's a chicken-
//     and-egg problem on every fresh swap.
//   - With a pool, release wallets are minted ONCE at bridge startup
//     and pre-funded by an operator (or the platform-faucet). Every
//     swap rotates through the pool, so a single under-funded wallet
//     doesn't block all subsequent swaps.
//
// Selection policy: round-robin via an atomic counter. Cheap, fair,
// no per-network rebalancing concerns at the small fleet sizes we
// expect (10 wallets is typical).
//
// Persistence: each entry is stored under a top-level zapdb key
// (releasepool:<index>) as JSON. On bridge restart the pool reloads
// from the same keys — no fresh keygens unless the operator grew the
// pool size. The InMemoryStore path keeps the same shape in a map
// so unit tests don't need a disk store.
//
// Brand: the pool is a Lux-network surface (the bridge itself ships
// in ~/work/lux/bridge). No mention of  / .

// =============================================================================
// Persistence interface
// =============================================================================

// ReleasePoolStore is the minimum persistence surface ReleasePool
// needs. Both InMemoryStore and ZapStore implement it.
//
// The contract:
//   - LoadEntries returns every persisted release-pool entry, in
//     index order (smallest-index-first). Empty slice on first boot.
//   - PutEntry persists one entry by index, overwriting any prior
//     entry at the same index. Used at pool-grow time.
//
// We deliberately do NOT model deletion here — operators grow the
// pool but never shrink mid-flight (a deleted wallet may still be
// referenced by an in-flight swap).
type ReleasePoolStore interface {
	LoadEntries(ctx context.Context) ([]ReleasePoolEntry, error)
	PutEntry(ctx context.Context, idx int, entry ReleasePoolEntry) error
}

// ReleasePoolStoreWithKeyspace is the multi-pool variant. Stores that
// implement it support an arbitrary keyspace prefix so a single bridge
// can run parallel pools (EVM-default + DOT-family + future SOL/TON).
// Optional — when the swap store satisfies this interface, the bridge
// passes through to LoadEntriesNS / PutEntryNS; otherwise it falls
// back to the legacy single-pool methods (DOT pool stays in-memory only).
type ReleasePoolStoreWithKeyspace interface {
	ReleasePoolStore
	LoadEntriesNS(ctx context.Context, keyspace string) ([]ReleasePoolEntry, error)
	PutEntryNS(ctx context.Context, keyspace string, idx int, entry ReleasePoolEntry) error
}

// ReleasePoolEntry is one wallet in the pool. JSON-serialized for
// storage. Network is captured at mint time so a multi-chain
// deployment can keep separate pools per destination chain in a
// future iteration; for now we mint pool entries with a single
// "primary" network (the bridge's main destination — LUX_TESTNET in
// dev, LUX_MAINNET in prod) and the EVM address works across all
// EVM chains because the MPC produces a deterministic eth_address.
type ReleasePoolEntry struct {
	Index    int       `json:"index"`
	WalletID string    `json:"wallet_id"`
	Address  string    `json:"address"`
	Network  string    `json:"network,omitempty"`
	MintedAt time.Time `json:"minted_at"`
	// ECDSAPubKey is the 33-byte compressed secp256k1 pubkey, hex-encoded.
	// Persisted so the DOT signing path can derive AccountId32 +
	// determine the ECDSA recovery byte without re-keygen'ing.
	// Optional for EVM-only deployments (the EIP-155 finalize path
	// derives the address from the signature recovery alone).
	ECDSAPubKey string `json:"ecdsa_pub_key,omitempty"`
}

// =============================================================================
// Keygen surface
// =============================================================================

// Keygener mints one MPC wallet. Pulled to an interface so the unit
// tests can drive ReleasePool without a live MPC cluster. The
// production implementation is *mchain.Client (KeygenForDeposit).
type Keygener interface {
	KeygenForDeposit(ctx context.Context, networkInternalName string) (*mchain.Wallet, error)
}

// Compile-time check: *mchain.Client satisfies Keygener.
var _ Keygener = (*mchain.Client)(nil)

// =============================================================================
// Balance probe surface (for the low-balance alerter)
// =============================================================================

// BalanceProbe queries a chain RPC for the wallet's native balance.
// Production implementation: a small JSON-RPC wrapper that reuses
// broadcast/depositcheck endpoint URLs. Pulled to an interface so
// tests can stub it.
type BalanceProbe interface {
	BalanceAt(ctx context.Context, network, address string) (*big.Int, error)
}

// =============================================================================
// ReleasePool
// =============================================================================

// ReleasePool is a fixed-size pool of MPC release wallets. Safe for
// concurrent use by the signing driver and the (single) pool-grow
// path at startup.
type ReleasePool struct {
	store ReleasePoolStore
	mu    sync.RWMutex
	// entries is the cached in-memory copy of the persisted pool, in
	// index order. Read access is mutex-protected; writes happen only
	// at startup-grow time so reads are heavily favored.
	entries []ReleasePoolEntry
	// cursor is the round-robin position; modulo len(entries) at
	// selection time.
	cursor atomic.Uint64

	// Default network used at mint time when an operator hasn't pinned
	// a specific destination. KeygenForDeposit needs SOME network to
	// pick an address type from; for EVM destinations the resulting
	// eth_address works on every EVM chain, so picking "LUX_TESTNET"
	// vs "LUX_MAINNET" doesn't affect downstream consumers.
	mintNetwork string

	// keyspace selects a sub-namespace in the persistence layer so a
	// single bridge can run multiple pools (default EVM pool +
	// DOT-family pool etc.). Empty ⇒ legacy single-pool path.
	keyspace string

	// BalanceThresholdWei is the floor below which Acquire logs a
	// WARN. The bridge does NOT auto-fund; this is purely a heads-up
	// for the operator. Optional — zero ⇒ alerter disabled.
	BalanceThresholdWei *big.Int
	// Probe is the balance query target. Optional — nil disables
	// the balance-threshold alerter (Acquire still picks a wallet).
	Probe BalanceProbe

	logger luxlog.Logger
}

// ErrEmptyPool indicates no entries are available. Callers must
// either grow the pool first (Bootstrap) or fall back to the legacy
// extractWalletID-from-deposit-address path.
var ErrEmptyPool = errors.New("release pool: empty (no entries provisioned)")

// NewReleasePool constructs a pool backed by store. Defers loading +
// growing until the caller calls Bootstrap.
func NewReleasePool(store ReleasePoolStore, mintNetwork string, logger luxlog.Logger) *ReleasePool {
	if mintNetwork == "" {
		mintNetwork = "LUX_TESTNET"
	}
	return &ReleasePool{
		store:       store,
		mintNetwork: mintNetwork,
		logger:      logger,
	}
}

// NewReleasePoolWithKey constructs a pool whose entries live under a
// distinct keyspace in the persistence layer. Used by the DOT pool
// to coexist with the default EVM pool without overlapping
// "releasepool:0", "releasepool:1", … keys.
//
// If the underlying store doesn't implement ReleasePoolStoreWithKeyspace,
// the pool falls back to the legacy single-namespace methods (entries
// stored in-memory for the lifetime of the process — fine for dev,
// not durable for a multi-pool prod deployment).
func NewReleasePoolWithKey(store ReleasePoolStore, mintNetwork, keyspace string, logger luxlog.Logger) *ReleasePool {
	p := NewReleasePool(store, mintNetwork, logger)
	p.keyspace = keyspace
	return p
}

// loadAll dispatches to the keyspace-aware loader when available,
// otherwise to the legacy single-pool loader.
func (p *ReleasePool) loadAll(ctx context.Context) ([]ReleasePoolEntry, error) {
	if p.keyspace == "" {
		return p.store.LoadEntries(ctx)
	}
	ns, ok := p.store.(ReleasePoolStoreWithKeyspace)
	if !ok {
		// Best-effort: namespace-aware store unavailable. The DOT pool
		// still works in-memory for this process; entries just aren't
		// persisted across restarts. Operator must accept this in dev.
		if p.logger != nil {
			p.logger.Warn("release pool: keyspace requested but store doesn't support it — entries will not persist",
				"keyspace", p.keyspace,
			)
		}
		return nil, nil
	}
	return ns.LoadEntriesNS(ctx, p.keyspace)
}

// putEntry dispatches to the keyspace-aware writer when available,
// otherwise to the legacy single-pool writer.
func (p *ReleasePool) putEntry(ctx context.Context, idx int, entry ReleasePoolEntry) error {
	if p.keyspace == "" {
		return p.store.PutEntry(ctx, idx, entry)
	}
	ns, ok := p.store.(ReleasePoolStoreWithKeyspace)
	if !ok {
		return nil // in-memory only; loadAll already warned.
	}
	return ns.PutEntryNS(ctx, p.keyspace, idx, entry)
}

// Size reports the current pool size.
func (p *ReleasePool) Size() int {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return len(p.entries)
}

// Entries returns a snapshot copy of the current entries. Useful for
// /health diagnostics — never expose the slice directly because
// callers might mutate.
func (p *ReleasePool) Entries() []ReleasePoolEntry {
	p.mu.RLock()
	defer p.mu.RUnlock()
	out := make([]ReleasePoolEntry, len(p.entries))
	copy(out, p.entries)
	return out
}

// PubKeyHex returns the persisted compressed-secp256k1 pubkey hex for
// the named wallet. Returns "" if the wallet isn't in the pool or
// wasn't minted with a pubkey (legacy entries).
func (p *ReleasePool) PubKeyHex(walletID string) string {
	p.mu.RLock()
	defer p.mu.RUnlock()
	for _, e := range p.entries {
		if e.WalletID == walletID {
			return e.ECDSAPubKey
		}
	}
	return ""
}

// Bootstrap loads existing entries from the store and, if needed,
// mints fresh ones up to the desired pool size.
//
// Idempotent: a re-Bootstrap with the same desiredSize never re-mints
// the existing entries. A re-Bootstrap with a smaller size never
// drops entries — once minted, an entry stays forever (operator
// must wipe the store to truly remove). A larger size mints exactly
// (desiredSize - existing) new entries.
//
// Calling Bootstrap with desiredSize <= 0 just loads the existing
// pool — useful for the "operator pre-loaded the pool, bridge just
// needs to discover" deployment shape.
func (p *ReleasePool) Bootstrap(ctx context.Context, kg Keygener, desiredSize int) error {
	existing, err := p.loadAll(ctx)
	if err != nil {
		return fmt.Errorf("release pool: load entries: %w", err)
	}
	p.mu.Lock()
	p.entries = existing
	p.mu.Unlock()
	if p.logger != nil {
		p.logger.Info("release pool loaded",
			"existing", len(existing),
			"desired", desiredSize,
		)
	}
	if desiredSize <= 0 || desiredSize <= len(existing) {
		return nil
	}
	if kg == nil {
		return fmt.Errorf("release pool: cannot grow %d→%d without Keygener (mpc client not configured)",
			len(existing), desiredSize)
	}
	// Mint the remaining slots, indexed from the next free position.
	startIdx := len(existing)
	for idx := startIdx; idx < desiredSize; idx++ {
		if err := ctx.Err(); err != nil {
			return err
		}
		w, err := kg.KeygenForDeposit(ctx, p.mintNetwork)
		if err != nil {
			return fmt.Errorf("release pool: keygen idx=%d: %w", idx, err)
		}
		entry := ReleasePoolEntry{
			Index:       idx,
			WalletID:    w.Name,
			Address:     w.Address,
			Network:     p.mintNetwork,
			MintedAt:    time.Now().UTC(),
			ECDSAPubKey: w.ECDSAPubKey,
		}
		if err := p.putEntry(ctx, idx, entry); err != nil {
			return fmt.Errorf("release pool: persist idx=%d: %w", idx, err)
		}
		p.mu.Lock()
		p.entries = append(p.entries, entry)
		p.mu.Unlock()
		if p.logger != nil {
			p.logger.Info("release pool minted entry",
				"idx", idx,
				"wallet_id", w.Name,
				"address", w.Address,
				"network", p.mintNetwork,
			)
		}
	}
	return nil
}

// Acquire picks the next pool entry in round-robin order. Returns
// ErrEmptyPool when no entries are provisioned.
//
// Side effect: if a Probe is configured and the chosen wallet's
// balance on `destinationNetwork` is below BalanceThresholdWei, a
// WARN line is logged. Balance probe errors are logged at debug —
// they're best-effort and must NOT block a swap from progressing.
func (p *ReleasePool) Acquire(ctx context.Context, destinationNetwork string) (*ReleasePoolEntry, error) {
	p.mu.RLock()
	n := len(p.entries)
	if n == 0 {
		p.mu.RUnlock()
		return nil, ErrEmptyPool
	}
	idx := int(p.cursor.Add(1)-1) % n
	if idx < 0 {
		idx = -idx % n
	}
	entry := p.entries[idx]
	p.mu.RUnlock()

	// Best-effort low-balance alert. We DON'T short-circuit the swap
	// here — the signing-driver gas pre-check does that with a
	// destination-specific calculation. This alerter is purely for
	// operator observability so a slowly-draining release wallet
	// surfaces in logs before it fails its first swap.
	if p.Probe != nil && p.BalanceThresholdWei != nil && p.BalanceThresholdWei.Sign() > 0 {
		p.checkBalance(ctx, &entry, destinationNetwork)
	}

	return &entry, nil
}

// checkBalance is the WARN alerter side of Acquire. Best-effort, never
// returns an error.
func (p *ReleasePool) checkBalance(ctx context.Context, entry *ReleasePoolEntry, destinationNetwork string) {
	bal, err := p.Probe.BalanceAt(ctx, destinationNetwork, entry.Address)
	if err != nil {
		if p.logger != nil {
			p.logger.Debug("release pool balance probe failed (non-fatal)",
				"wallet_id", entry.WalletID,
				"address", entry.Address,
				"network", destinationNetwork,
				"err", err,
			)
		}
		return
	}
	if bal.Cmp(p.BalanceThresholdWei) < 0 {
		if p.logger != nil {
			p.logger.Warn("release pool wallet below balance threshold",
				"wallet_id", entry.WalletID,
				"address", entry.Address,
				"network", destinationNetwork,
				"balance_wei", bal.String(),
				"threshold_wei", p.BalanceThresholdWei.String(),
				"action_required", "fund the address with destination-chain gas tokens",
			)
		}
	}
}

// =============================================================================
// InMemoryStore — release pool persistence (test/dev path)
// =============================================================================

// inMemoryReleasePool is the lossy-on-restart implementation. Lives
// inside *InMemoryStore so the SwapStore + ReleasePoolStore share
// one process-local home. Indexed by keyspace ("" = default EVM pool;
// "releasepool:dot" = the DOT-family pool; future families can pick
// their own).
type inMemoryReleasePool struct {
	mu      sync.Mutex
	entries map[string]map[int]ReleasePoolEntry // keyspace → idx → entry
}

// poolForKeyspace returns the map for the named keyspace, creating it lazily.
// Caller MUST hold p.mu. Empty keyspace = default pool.
func (p *inMemoryReleasePool) poolForKeyspace(keyspace string) map[int]ReleasePoolEntry {
	if p.entries == nil {
		p.entries = map[string]map[int]ReleasePoolEntry{}
	}
	if p.entries[keyspace] == nil {
		p.entries[keyspace] = map[int]ReleasePoolEntry{}
	}
	return p.entries[keyspace]
}

// LoadReleasePoolEntries implements ReleasePoolStore for the in-memory
// SwapStore. Returns the entries in ascending index order, using the
// default (legacy) keyspace.
func (s *InMemoryStore) LoadEntries(ctx context.Context) ([]ReleasePoolEntry, error) {
	return s.LoadEntriesNS(ctx, "")
}

// LoadEntriesNS is the keyspace-aware variant. Pass "" for the legacy
// pool, "releasepool:dot" for the DOT pool, etc.
func (s *InMemoryStore) LoadEntriesNS(_ context.Context, keyspace string) ([]ReleasePoolEntry, error) {
	s.poolOnce.Do(func() {
		s.pool = &inMemoryReleasePool{}
	})
	s.pool.mu.Lock()
	defer s.pool.mu.Unlock()
	src := s.pool.poolForKeyspace(keyspace)
	out := make([]ReleasePoolEntry, 0, len(src))
	maxIdx := -1
	for k := range src {
		if k > maxIdx {
			maxIdx = k
		}
	}
	for i := 0; i <= maxIdx; i++ {
		if e, ok := src[i]; ok {
			out = append(out, e)
		}
	}
	return out, nil
}

// PutEntry implements ReleasePoolStore for the in-memory SwapStore.
// Stores into the default keyspace.
func (s *InMemoryStore) PutEntry(ctx context.Context, idx int, entry ReleasePoolEntry) error {
	return s.PutEntryNS(ctx, "", idx, entry)
}

// PutEntryNS is the keyspace-aware variant.
func (s *InMemoryStore) PutEntryNS(_ context.Context, keyspace string, idx int, entry ReleasePoolEntry) error {
	s.poolOnce.Do(func() {
		s.pool = &inMemoryReleasePool{}
	})
	s.pool.mu.Lock()
	defer s.pool.mu.Unlock()
	dst := s.pool.poolForKeyspace(keyspace)
	entry.Index = idx
	dst[idx] = entry
	return nil
}

// =============================================================================
// JSONReleasePoolEntry encoding sanity
// =============================================================================

// MarshalJSON / UnmarshalJSON are implicit via the struct's json tags.
// Provide a typed assertion helper for tests + zap_store.go that need
// to round-trip an entry through a bytes layer.

// encodeEntry round-trips an entry through JSON. Helper for the
// ZapStore implementation.
func encodeEntry(e ReleasePoolEntry) ([]byte, error) { return json.Marshal(e) }

// decodeEntry round-trips a byte slice back into an entry.
func decodeEntry(b []byte) (ReleasePoolEntry, error) {
	var e ReleasePoolEntry
	err := json.Unmarshal(b, &e)
	return e, err
}
