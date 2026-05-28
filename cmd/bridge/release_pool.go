package main

import (
	"context"
	"encoding/hex"
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
//   - LoadEntries returns every persisted release-pool entry for the
//     given family, in index order (smallest-index-first). Empty
//     slice on first boot.
//   - PutEntry persists one entry by index for the given family,
//     overwriting any prior entry at the same index. Used at pool-
//     grow time.
//   - Family "" means "evm" — backward compat for stores that
//     persisted pre-family release-pool entries. New writes always
//     use an explicit non-empty family string.
//
// We deliberately do NOT model deletion here — operators grow the
// pool but never shrink mid-flight (a deleted wallet may still be
// referenced by an in-flight swap).
type ReleasePoolStore interface {
	LoadEntries(ctx context.Context, family string) ([]ReleasePoolEntry, error)
	PutEntry(ctx context.Context, family string, idx int, entry ReleasePoolEntry) error
}

// ReleasePoolEntry is one wallet in the pool. JSON-serialized for
// storage. Network is captured at mint time so a multi-chain
// deployment can keep separate pools per destination chain in a
// future iteration; for now we mint pool entries with a single
// "primary" network (the bridge's main destination — LUX_TESTNET in
// dev, LUX_MAINNET in prod) and the EVM address works across all
// EVM chains because the MPC produces a deterministic eth_address.
//
// Family is the canonical chain family the entry belongs to
// ("evm", "btc", "sol", "dot", "xrp"). For BTC, Address is the bech32
// P2WPKH and Pubkey carries the compressed secp256k1 pubkey the
// witness stack will include at Finalize time — without Pubkey, the
// BTC release flow can't sign. EVM entries leave Pubkey empty (the
// recovery id reconstructs the signer address from the signature).
//
// Empty Family in deserialized entries means "evm" — kept for
// backward compat with stores written before multi-family support.
type ReleasePoolEntry struct {
	Index    int    `json:"index"`
	Family   string `json:"family,omitempty"`
	WalletID string `json:"wallet_id"`
	Address  string `json:"address"`
	Network  string `json:"network,omitempty"`
	// Pubkey is the raw 33-byte compressed secp256k1 public key.
	// Required by:
	//   - BTC release: witness stack on Finalize includes it alongside
	//     the DER signature for P2WPKH spends.
	//   - XRP release: same ECDSA-derived family — embedded in the
	//     Payment's SigningPubKey field at Finalize time.
	// Empty for EVM-only deployments (the EIP-155 finalize path derives
	// the address from the signature recovery alone) and for Ed25519
	// families (SOL, TON).
	Pubkey   []byte    `json:"pubkey,omitempty"`
	MintedAt time.Time `json:"minted_at"`

	// AddressType captures the chain family this entry was minted
	// for. Empty ⇒ legacy assumption of AddressTypeETH (every entry
	// minted before this field was added). Family above is the
	// short-form code used in keyspace; AddressType is the long-form
	// mchain type used by signing paths that need to dispatch on it.
	AddressType mchain.AddressType `json:"address_type,omitempty"`

	// ECDSAPubKey is the hex-encoded compressed-secp256k1 public key
	// (33 bytes → 66 hex chars). Persisted by the DOT signing path so
	// the substrate assembler can derive AccountId32 + pick the ECDSA
	// recovery byte without re-keygen'ing. The XRP path also reads this
	// to populate SigningPubKey. Distinct from Pubkey (raw bytes); the
	// two fields hold equivalent data — populate whichever your release
	// path consumes.
	ECDSAPubKey string `json:"ecdsa_pub_key,omitempty"`

	// EDDSAPubKey is the hex-encoded 32-byte Ed25519 pubkey the MPC
	// quorum signs with when the wallet was keygen'd as a TON / SOL
	// family wallet. Required by the TON txassembler to reconstruct
	// the v4r2 state_init cell on first send.
	EDDSAPubKey string `json:"eddsa_pub_key,omitempty"`
}

// FamilyOrDefault returns Family or "evm" when the field is empty.
// Backward-compat helper for entries persisted before multi-family
// support.
func (e ReleasePoolEntry) FamilyOrDefault() string {
	if e.Family == "" {
		return FamilyEVM
	}
	return e.Family
}

// Canonical family names. Keep these as constants rather than enums
// so the JSON values match the operator-facing config and zapdb
// persistence keys cleanly.
const (
	FamilyEVM = "evm"
	FamilyBTC = "btc"
	FamilySOL = "sol"
	FamilyDOT = "dot"
	FamilyXRP = "xrp"
	FamilyTON = "ton"
)

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
//
// One pool per family — EVM-flavored wallets live in one pool, BTC-
// flavored wallets in another. The family identifier is persisted on
// every entry (via ReleasePoolEntry.Family) and threaded through the
// store interface (LoadEntries / PutEntry take a family arg).
//
// Use ReleasePools (plural) when the bridge runs multiple families
// side-by-side. That wrapper composes one *ReleasePool per family
// behind a family-keyed Acquire/Bootstrap interface.
type ReleasePool struct {
	store  ReleasePoolStore
	family string
	mu     sync.RWMutex
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
	// vs "LUX_MAINNET" doesn't affect downstream consumers. For BTC,
	// the network name matters because it selects mainnet vs testnet
	// bech32 hrp on the bridge-side address derivation.
	mintNetwork string

	// BalanceThresholdWei is the floor below which Acquire logs a
	// WARN. The bridge does NOT auto-fund; this is purely a heads-up
	// for the operator. Optional — zero ⇒ alerter disabled.
	//
	// For BTC pools, the "wei" naming is preserved for type-uniformity
	// but the actual unit is satoshis. The probe (Probe) interprets
	// the value in chain-native base units. Operators set BTC
	// thresholds in sat via main.go.
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
// growing until the caller calls Bootstrap. Defaults to the EVM
// family for backward compat with single-family callers.
func NewReleasePool(store ReleasePoolStore, mintNetwork string, logger luxlog.Logger) *ReleasePool {
	return NewReleasePoolForFamily(store, FamilyEVM, mintNetwork, logger)
}

// NewReleasePoolForFamily constructs a pool bound to a specific chain
// family. family is one of FamilyEVM / FamilyBTC; the value is
// persisted on every minted entry so reloads dispatch back to the
// right pool.
func NewReleasePoolForFamily(store ReleasePoolStore, family, mintNetwork string, logger luxlog.Logger) *ReleasePool {
	if family == "" {
		family = FamilyEVM
	}
	if mintNetwork == "" {
		mintNetwork = "LUX_TESTNET"
	}
	return &ReleasePool{
		store:       store,
		family:      family,
		mintNetwork: mintNetwork,
		logger:      logger,
	}
}

// Family returns the family identifier the pool is bound to.
func (p *ReleasePool) Family() string { return p.family }

// Size reports the current pool size.
func (p *ReleasePool) Size() int {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return len(p.entries)
}

// SizeByFamily returns the number of entries whose Family field
// equals `family`. Empty family ⇒ count all entries.
func (p *ReleasePool) SizeByFamily(family string) int {
	p.mu.RLock()
	defer p.mu.RUnlock()
	if family == "" {
		return len(p.entries)
	}
	n := 0
	for _, e := range p.entries {
		if e.Family == family {
			n++
		}
	}
	return n
}

// Reload re-reads the underlying store for THIS pool's family. Useful
// when a parallel helper has minted new entries directly into the
// store and the in-memory view of this pool needs to catch up.
func (p *ReleasePool) Reload(ctx context.Context) error {
	entries, err := p.store.LoadEntries(ctx, p.family)
	if err != nil {
		return err
	}
	p.mu.Lock()
	p.entries = entries
	p.mu.Unlock()
	return nil
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
	existing, err := p.store.LoadEntries(ctx, p.family)
	if err != nil {
		return fmt.Errorf("release pool [%s]: load entries: %w", p.family, err)
	}
	// Backfill family on legacy entries (pre-multi-family stores)
	// so downstream consumers see a non-empty Family on every entry.
	for i := range existing {
		if existing[i].Family == "" {
			existing[i].Family = p.family
		}
	}
	p.mu.Lock()
	p.entries = existing
	p.mu.Unlock()
	if p.logger != nil {
		p.logger.Info("release pool loaded",
			"family", p.family,
			"existing", len(existing),
			"desired", desiredSize,
		)
	}
	if desiredSize <= 0 || desiredSize <= len(existing) {
		return nil
	}
	if kg == nil {
		return fmt.Errorf("release pool [%s]: cannot grow %d→%d without Keygener (mpc client not configured)",
			p.family, len(existing), desiredSize)
	}
	// Mint the remaining slots, indexed from the next free position.
	startIdx := len(existing)
	for idx := startIdx; idx < desiredSize; idx++ {
		if err := ctx.Err(); err != nil {
			return err
		}
		w, err := kg.KeygenForDeposit(ctx, p.mintNetwork)
		if err != nil {
			return fmt.Errorf("release pool [%s]: keygen idx=%d: %w", p.family, idx, err)
		}
		entry := ReleasePoolEntry{
			Index:       idx,
			Family:      p.family,
			WalletID:    w.Name,
			Address:     w.Address,
			Network:     p.mintNetwork,
			Pubkey:      append([]byte(nil), w.ECDSAPubKey...),
			MintedAt:    time.Now().UTC(),
			AddressType: w.AddressType,
			ECDSAPubKey: hex.EncodeToString(w.ECDSAPubKey),
			EDDSAPubKey: w.EDDSAPubKeyHex,
		}
		if err := p.store.PutEntry(ctx, p.family, idx, entry); err != nil {
			return fmt.Errorf("release pool [%s]: persist idx=%d: %w", p.family, idx, err)
		}
		p.mu.Lock()
		p.entries = append(p.entries, entry)
		p.mu.Unlock()
		if p.logger != nil {
			p.logger.Info("release pool minted entry",
				"family", p.family,
				"idx", idx,
				"wallet_id", w.Name,
				"address", w.Address,
				"network", p.mintNetwork,
				"has_pubkey", len(w.ECDSAPubKey) > 0,
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
	return p.AcquireForFamily(ctx, destinationNetwork, "")
}

// AcquireForFamily is the family-aware variant of Acquire. When
// family != "", entries with Family != family are skipped. Useful
// for multi-family deployments (EVM pool + XRP pool sharing one
// ReleasePool instance) so a swap to an XRP network always gets an
// XRP-family wallet.
//
// Empty family ⇒ same behaviour as Acquire (round-robin across all
// entries). When NO entry of the requested family exists, returns
// ErrEmptyPool — caller should fall back to deposit-as-release.
func (p *ReleasePool) AcquireForFamily(ctx context.Context, destinationNetwork, family string) (*ReleasePoolEntry, error) {
	p.mu.RLock()
	n := len(p.entries)
	if n == 0 {
		p.mu.RUnlock()
		return nil, ErrEmptyPool
	}
	// Build a family-filtered view. Cheap — pools are 5-20 entries.
	var candidates []ReleasePoolEntry
	if family == "" {
		candidates = make([]ReleasePoolEntry, len(p.entries))
		copy(candidates, p.entries)
	} else {
		for _, e := range p.entries {
			if e.Family == family {
				candidates = append(candidates, e)
			}
		}
	}
	p.mu.RUnlock()
	if len(candidates) == 0 {
		return nil, ErrEmptyPool
	}
	idx := int(p.cursor.Add(1)-1) % len(candidates)
	if idx < 0 {
		idx = -idx % len(candidates)
	}
	entry := candidates[idx]

	// Best-effort low-balance alert. We DON'T short-circuit the swap
	// here — the signing-driver gas pre-check does that with a
	// destination-specific calculation. This alerter is purely for
	// operator observability so a slowly-draining release wallet
	// surfaces in logs before it fails its first swap.
	if p.Probe != nil && p.BalanceThresholdWei != nil && p.BalanceThresholdWei.Sign() > 0 {
		// Balance probe only meaningful for EVM today. XRP families
		// have their own pre-check in the signing driver.
		if family == "" || family == "eth" {
			p.checkBalance(ctx, &entry, destinationNetwork)
		}
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
// one process-local home.
//
// Multi-family: entries are keyed by (family, index) so EVM, BTC, SOL,
// DOT pools share storage without cross-contaminating. The empty-family
// bucket holds legacy entries from before family-awareness landed.
type inMemoryReleasePool struct {
	mu      sync.Mutex
	entries map[string]map[int]ReleasePoolEntry // family → idx → entry
}

func (s *InMemoryStore) initPool() {
	s.poolOnce.Do(func() {
		s.pool = &inMemoryReleasePool{
			entries: map[string]map[int]ReleasePoolEntry{},
		}
	})
}

func normalizeFamily(f string) string {
	if f == "" {
		return FamilyEVM
	}
	return f
}

// LoadEntries implements ReleasePoolStore for the in-memory SwapStore.
// Returns the entries for the family in ascending index order. Empty
// family is treated as FamilyEVM for back-compat with single-pool
// callers and pre-family persisted state.
func (s *InMemoryStore) LoadEntries(_ context.Context, family string) ([]ReleasePoolEntry, error) {
	s.initPool()
	family = normalizeFamily(family)
	s.pool.mu.Lock()
	defer s.pool.mu.Unlock()
	bucket := s.pool.entries[family]
	out := make([]ReleasePoolEntry, 0, len(bucket))
	maxIdx := -1
	for k := range bucket {
		if k > maxIdx {
			maxIdx = k
		}
	}
	for i := 0; i <= maxIdx; i++ {
		if e, ok := bucket[i]; ok {
			out = append(out, e)
		}
	}
	// Also drain the empty-family bucket the first time FamilyEVM is
	// requested — legacy entries persisted without a family attribute
	// should appear in the EVM pool by default. Merge by index,
	// preferring the family-tagged copy.
	if family == FamilyEVM {
		if legacy, ok := s.pool.entries[""]; ok && len(legacy) > 0 {
			seen := make(map[int]struct{}, len(out))
			for _, e := range out {
				seen[e.Index] = struct{}{}
			}
			extras := make([]ReleasePoolEntry, 0, len(legacy))
			for idx, e := range legacy {
				if _, dup := seen[idx]; dup {
					continue
				}
				if e.Family == "" {
					e.Family = FamilyEVM
				}
				extras = append(extras, e)
			}
			// Maintain index-ascending order across the merge.
			out = append(out, extras...)
			// Stable insertion sort — fine for small N.
			for i := 1; i < len(out); i++ {
				for j := i; j > 0 && out[j-1].Index > out[j].Index; j-- {
					out[j-1], out[j] = out[j], out[j-1]
				}
			}
		}
	}
	return out, nil
}

func (s *InMemoryStore) PutEntry(_ context.Context, family string, idx int, entry ReleasePoolEntry) error {
	s.initPool()
	family = normalizeFamily(family)
	s.pool.mu.Lock()
	defer s.pool.mu.Unlock()
	if s.pool.entries[family] == nil {
		s.pool.entries[family] = map[int]ReleasePoolEntry{}
	}
	entry.Index = idx
	if entry.Family == "" {
		entry.Family = family
	}
	s.pool.entries[family][idx] = entry
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
