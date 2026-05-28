package main

import (
	"bytes"
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/luxfi/bridge/internal/mchain"
)

// =============================================================================
// Fake Keygener — drives ReleasePool without a live MPC cluster.
// =============================================================================

type fakeKeygener struct {
	calls atomic.Int64
	// Optional: programmable error returned on the next call.
	mu      sync.Mutex
	nextErr error
}

func (k *fakeKeygener) KeygenForDeposit(_ context.Context, network string) (*mchain.Wallet, error) {
	k.mu.Lock()
	err := k.nextErr
	k.nextErr = nil
	k.mu.Unlock()
	if err != nil {
		return nil, err
	}
	i := k.calls.Add(1)
	// Family / address-shape comes from the network name so a single
	// fake keygener can drive both EVM + XRP pool tests.
	switch network {
	case "XRP_MAINNET", "XRP_TESTNET":
		// Hex-decoded pubkey for testing. The bridge persists the hex
		// form on ReleasePoolEntry.ECDSAPubKey; the raw bytes go into
		// Wallet.ECDSAPubKey.
		pub, _ := hex.DecodeString("0330E7FC9D56BB25D6893BA3F317AE5BCF33B3291BD63DB32654A313222F7FD020")
		return &mchain.Wallet{
			Name:        fmt.Sprintf("release-pool-xrp-%d", i),
			Address:     fmt.Sprintf("rFakeXRPWallet%dabc", i),
			AddressType: mchain.AddressTypeXRP,
			ECDSAPubKey: pub,
		}, nil
	default:
		return &mchain.Wallet{
			Name:        fmt.Sprintf("release-pool-wallet-%d", i),
			Address:     fmt.Sprintf("0xaddr%d", i),
			AddressType: mchain.AddressTypeETH,
		}, nil
	}
}

// =============================================================================
// Fake BalanceProbe
// =============================================================================

type fakeProbe struct {
	mu       sync.Mutex
	balances map[string]*big.Int
	err      error
	calls    atomic.Int64
}

func newFakeProbe() *fakeProbe { return &fakeProbe{balances: map[string]*big.Int{}} }

func (p *fakeProbe) set(addr string, wei int64) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.balances[addr] = big.NewInt(wei)
}

func (p *fakeProbe) BalanceAt(_ context.Context, _, address string) (*big.Int, error) {
	p.calls.Add(1)
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.err != nil {
		return nil, p.err
	}
	if b, ok := p.balances[address]; ok {
		return new(big.Int).Set(b), nil
	}
	return big.NewInt(0), nil
}

// =============================================================================
// Bootstrap
// =============================================================================

func TestReleasePool_BootstrapMintsToSize(t *testing.T) {
	store := NewInMemoryStore()
	pool := NewReleasePool(store, "LUX_TESTNET", nil)
	kg := &fakeKeygener{}

	if err := pool.Bootstrap(context.Background(), kg, 5); err != nil {
		t.Fatalf("Bootstrap: %v", err)
	}
	if pool.Size() != 5 {
		t.Errorf("Size = %d, want 5", pool.Size())
	}
	if got := kg.calls.Load(); got != 5 {
		t.Errorf("expected 5 keygen calls, got %d", got)
	}

	// Reload-from-store path: a second pool over the same store
	// should pick up the same 5 entries WITHOUT calling keygen.
	kg2 := &fakeKeygener{}
	pool2 := NewReleasePool(store, "LUX_TESTNET", nil)
	if err := pool2.Bootstrap(context.Background(), kg2, 5); err != nil {
		t.Fatalf("re-Bootstrap: %v", err)
	}
	if pool2.Size() != 5 {
		t.Errorf("after reload, size = %d, want 5", pool2.Size())
	}
	if kg2.calls.Load() != 0 {
		t.Errorf("expected zero keygen on reload, got %d", kg2.calls.Load())
	}
}

func TestReleasePool_BootstrapGrowsExisting(t *testing.T) {
	store := NewInMemoryStore()
	kg := &fakeKeygener{}

	pool := NewReleasePool(store, "LUX_TESTNET", nil)
	if err := pool.Bootstrap(context.Background(), kg, 3); err != nil {
		t.Fatalf("first Bootstrap: %v", err)
	}
	if pool.Size() != 3 {
		t.Fatalf("size after first Bootstrap: %d, want 3", pool.Size())
	}

	// Grow.
	if err := pool.Bootstrap(context.Background(), kg, 6); err != nil {
		t.Fatalf("grow Bootstrap: %v", err)
	}
	if pool.Size() != 6 {
		t.Errorf("size after grow: %d, want 6", pool.Size())
	}
	// 3 + 3 = 6 keygen calls total.
	if kg.calls.Load() != 6 {
		t.Errorf("expected 6 cumulative keygens, got %d", kg.calls.Load())
	}
}

func TestReleasePool_BootstrapKeygenFailureSurfaces(t *testing.T) {
	store := NewInMemoryStore()
	kg := &fakeKeygener{}
	kg.nextErr = errors.New("MPC cluster offline")
	pool := NewReleasePool(store, "LUX_TESTNET", nil)
	err := pool.Bootstrap(context.Background(), kg, 1)
	if err == nil {
		t.Fatal("expected error from failing keygen")
	}
	if pool.Size() != 0 {
		t.Errorf("Size = %d, want 0 after failed bootstrap", pool.Size())
	}
}

// =============================================================================
// Acquire — round-robin
// =============================================================================

func TestReleasePool_AcquireRoundRobins(t *testing.T) {
	store := NewInMemoryStore()
	pool := NewReleasePool(store, "LUX_TESTNET", nil)
	if err := pool.Bootstrap(context.Background(), &fakeKeygener{}, 3); err != nil {
		t.Fatal(err)
	}
	seen := map[string]int{}
	for i := 0; i < 9; i++ {
		e, err := pool.Acquire(context.Background(), "LUX_TESTNET")
		if err != nil {
			t.Fatalf("Acquire %d: %v", i, err)
		}
		seen[e.WalletID]++
	}
	if len(seen) != 3 {
		t.Errorf("expected 3 distinct wallets in rotation, got %d (seen=%v)", len(seen), seen)
	}
	for w, c := range seen {
		if c != 3 {
			t.Errorf("wallet %s used %d times, want 3 (uneven round-robin)", w, c)
		}
	}
}

func TestReleasePool_AcquireEmpty(t *testing.T) {
	store := NewInMemoryStore()
	pool := NewReleasePool(store, "LUX_TESTNET", nil)
	if _, err := pool.Acquire(context.Background(), "LUX_TESTNET"); !errors.Is(err, ErrEmptyPool) {
		t.Errorf("expected ErrEmptyPool, got %v", err)
	}
}

// =============================================================================
// Balance alerter
// =============================================================================

func TestReleasePool_AcquireProbesBalanceWhenThresholdSet(t *testing.T) {
	store := NewInMemoryStore()
	pool := NewReleasePool(store, "LUX_TESTNET", nil)
	if err := pool.Bootstrap(context.Background(), &fakeKeygener{}, 2); err != nil {
		t.Fatal(err)
	}
	probe := newFakeProbe()
	pool.Probe = probe
	pool.BalanceThresholdWei = big.NewInt(100)
	probe.set("0xaddr1", 50) // below threshold

	_, err := pool.Acquire(context.Background(), "LUX_TESTNET")
	if err != nil {
		t.Fatalf("Acquire: %v", err)
	}
	if probe.calls.Load() == 0 {
		t.Error("expected probe to be called when threshold is set")
	}
}

func TestReleasePool_AcquireSkipsBalanceProbeWhenNoThreshold(t *testing.T) {
	store := NewInMemoryStore()
	pool := NewReleasePool(store, "LUX_TESTNET", nil)
	if err := pool.Bootstrap(context.Background(), &fakeKeygener{}, 1); err != nil {
		t.Fatal(err)
	}
	probe := newFakeProbe()
	pool.Probe = probe
	// BalanceThresholdWei left nil.
	_, _ = pool.Acquire(context.Background(), "LUX_TESTNET")
	if probe.calls.Load() != 0 {
		t.Errorf("probe should not be called without a threshold; got %d calls", probe.calls.Load())
	}
}

// =============================================================================
// Entries snapshot
// =============================================================================

func TestReleasePool_EntriesCopyIsolated(t *testing.T) {
	store := NewInMemoryStore()
	pool := NewReleasePool(store, "LUX_TESTNET", nil)
	if err := pool.Bootstrap(context.Background(), &fakeKeygener{}, 2); err != nil {
		t.Fatal(err)
	}
	entries := pool.Entries()
	if len(entries) != 2 {
		t.Fatalf("Entries len = %d, want 2", len(entries))
	}
	// Mutate the copy — pool's internal state must not change.
	entries[0].WalletID = "mutated"
	roundTrip := pool.Entries()
	if roundTrip[0].WalletID == "mutated" {
		t.Error("Entries() returned a live reference, not a copy")
	}
}

// =============================================================================
// JSON encode/decode round-trip
// =============================================================================

func TestReleasePoolEntry_Roundtrip(t *testing.T) {
	in := ReleasePoolEntry{
		Index:    7,
		Family:   FamilyBTC,
		WalletID: "wid",
		Address:  "bc1qxxxx",
		Network:  "BITCOIN_MAINNET",
		Pubkey:   []byte{0x02, 0xab, 0xcd},
	}
	b, err := encodeEntry(in)
	if err != nil {
		t.Fatalf("encode: %v", err)
	}
	out, err := decodeEntry(b)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	// Struct contains a []byte so direct == comparison won't compile —
	// compare field-by-field. MintedAt is zero in both (we don't set
	// it), so reflect.DeepEqual would also work here.
	if out.Index != in.Index ||
		out.Family != in.Family ||
		out.WalletID != in.WalletID ||
		out.Address != in.Address ||
		out.Network != in.Network ||
		!bytes.Equal(out.Pubkey, in.Pubkey) {
		t.Errorf("roundtrip mismatch: in=%+v out=%+v", in, out)
	}
}

// =============================================================================
// Multi-family (ReleasePools) tests
// =============================================================================

// fakeBTCKeygener satisfies Keygener and returns deterministic
// BTC-family wallets. It tracks calls so tests can assert that BTC
// keygens hit the BTC pool only.
type fakeBTCKeygener struct {
	calls atomic.Int64
}

func (k *fakeBTCKeygener) KeygenForDeposit(_ context.Context, network string) (*mchain.Wallet, error) {
	i := k.calls.Add(1)
	return &mchain.Wallet{
		Name:        fmt.Sprintf("btc-wallet-%d", i),
		Address:     fmt.Sprintf("bc1qexample-%d", i),
		AddressType: mchain.AddressTypeBTC,
		ECDSAPubKey: []byte{0x02, byte(i)}, // truncated but unique per call
	}, nil
}

func TestReleasePool_BTCFamily_BootstrapAndAcquire(t *testing.T) {
	store := NewInMemoryStore()
	pool := NewReleasePoolForFamily(store, FamilyBTC, "BITCOIN_TESTNET", nil)
	kg := &fakeBTCKeygener{}
	if err := pool.Bootstrap(context.Background(), kg, 3); err != nil {
		t.Fatalf("Bootstrap: %v", err)
	}
	if pool.Size() != 3 {
		t.Errorf("Size = %d, want 3", pool.Size())
	}
	got, err := pool.Acquire(context.Background(), "BITCOIN_TESTNET")
	if err != nil {
		t.Fatal(err)
	}
	if got.Family != FamilyBTC {
		t.Errorf("Family = %q, want %q", got.Family, FamilyBTC)
	}
	if len(got.Pubkey) == 0 {
		t.Error("BTC pool entry should carry a non-empty pubkey from keygen")
	}
}

func TestReleasePools_NoCrossContamination(t *testing.T) {
	// One zapdb-equivalent backing store, two pools, two families.
	store := NewInMemoryStore()

	evmPool := NewReleasePoolForFamily(store, FamilyEVM, "LUX_TESTNET", nil)
	if err := evmPool.Bootstrap(context.Background(), &fakeKeygener{}, 4); err != nil {
		t.Fatalf("evm Bootstrap: %v", err)
	}
	btcPool := NewReleasePoolForFamily(store, FamilyBTC, "BITCOIN_TESTNET", nil)
	if err := btcPool.Bootstrap(context.Background(), &fakeBTCKeygener{}, 2); err != nil {
		t.Fatalf("btc Bootstrap: %v", err)
	}
	if evmPool.Size() != 4 {
		t.Errorf("EVM pool size = %d, want 4", evmPool.Size())
	}
	if btcPool.Size() != 2 {
		t.Errorf("BTC pool size = %d, want 2", btcPool.Size())
	}

	// ReleasePools dispatcher hands out the right family.
	pools := NewReleasePools(nil)
	pools.AddPool(evmPool)
	pools.AddPool(btcPool)

	// Acquire from each family. EVM should never produce a BTC entry,
	// and vice versa.
	for i := 0; i < 10; i++ {
		got, err := pools.Acquire(context.Background(), FamilyEVM, "LUX_TESTNET")
		if err != nil {
			t.Fatalf("acquire EVM #%d: %v", i, err)
		}
		if got.Family != FamilyEVM {
			t.Errorf("EVM acquire returned family=%q", got.Family)
		}
	}
	for i := 0; i < 10; i++ {
		got, err := pools.Acquire(context.Background(), FamilyBTC, "BITCOIN_TESTNET")
		if err != nil {
			t.Fatalf("acquire BTC #%d: %v", i, err)
		}
		if got.Family != FamilyBTC {
			t.Errorf("BTC acquire returned family=%q", got.Family)
		}
		if len(got.Pubkey) == 0 {
			t.Errorf("BTC entry should carry a pubkey")
		}
	}
}

func TestReleasePools_UnknownFamily(t *testing.T) {
	pools := NewReleasePools(nil)
	_, err := pools.Acquire(context.Background(), "sol", "SOLANA_MAINNET")
	if !errors.Is(err, ErrUnknownFamily) {
		t.Errorf("expected ErrUnknownFamily, got %v", err)
	}
}

func TestReleasePools_Snapshot(t *testing.T) {
	store := NewInMemoryStore()

	evmPool := NewReleasePoolForFamily(store, FamilyEVM, "LUX_TESTNET", nil)
	_ = evmPool.Bootstrap(context.Background(), &fakeKeygener{}, 2)
	btcPool := NewReleasePoolForFamily(store, FamilyBTC, "BITCOIN_TESTNET", nil)
	_ = btcPool.Bootstrap(context.Background(), &fakeBTCKeygener{}, 1)

	pools := NewReleasePools(nil)
	pools.AddPool(evmPool)
	pools.AddPool(btcPool)

	snap := pools.Snapshot()
	if got := snap[FamilyEVM]["size"]; got != 2 {
		t.Errorf("snapshot evm.size = %v, want 2", got)
	}
	if got := snap[FamilyBTC]["size"]; got != 1 {
		t.Errorf("snapshot btc.size = %v, want 1", got)
	}
	if got := snap[FamilyBTC]["mint_network"]; got != "BITCOIN_TESTNET" {
		t.Errorf("snapshot btc.mint_network = %v, want BITCOIN_TESTNET", got)
	}

	if total := pools.TotalSize(); total != 3 {
		t.Errorf("TotalSize = %d, want 3", total)
	}

	families := pools.Families()
	if len(families) != 2 || families[0] != FamilyBTC || families[1] != FamilyEVM {
		t.Errorf("Families = %v, want [btc evm]", families)
	}
}

func TestReleasePools_Reload_RestoresEntries(t *testing.T) {
	// Two pools backed by the same store; bootstrap once, then
	// reconstruct fresh pool instances and confirm entries reload
	// without re-keygenning.
	store := NewInMemoryStore()

	evm1 := NewReleasePoolForFamily(store, FamilyEVM, "LUX_TESTNET", nil)
	if err := evm1.Bootstrap(context.Background(), &fakeKeygener{}, 2); err != nil {
		t.Fatal(err)
	}
	btc1 := NewReleasePoolForFamily(store, FamilyBTC, "BITCOIN_MAINNET", nil)
	if err := btc1.Bootstrap(context.Background(), &fakeBTCKeygener{}, 2); err != nil {
		t.Fatal(err)
	}

	// Now reconstruct from the same backing store.
	evm2 := NewReleasePoolForFamily(store, FamilyEVM, "LUX_TESTNET", nil)
	kg2 := &fakeKeygener{} // should NOT be called on reload
	if err := evm2.Bootstrap(context.Background(), kg2, 2); err != nil {
		t.Fatal(err)
	}
	if evm2.Size() != 2 {
		t.Errorf("EVM reload size = %d, want 2", evm2.Size())
	}
	if kg2.calls.Load() != 0 {
		t.Errorf("expected zero EVM keygen on reload, got %d", kg2.calls.Load())
	}

	btc2 := NewReleasePoolForFamily(store, FamilyBTC, "BITCOIN_MAINNET", nil)
	btcKg2 := &fakeBTCKeygener{}
	if err := btc2.Bootstrap(context.Background(), btcKg2, 2); err != nil {
		t.Fatal(err)
	}
	if btc2.Size() != 2 {
		t.Errorf("BTC reload size = %d, want 2", btc2.Size())
	}
	if btcKg2.calls.Load() != 0 {
		t.Errorf("expected zero BTC keygen on reload, got %d", btcKg2.calls.Load())
	}
}

func TestReleasePools_LegacyEntriesMigrateToEVM(t *testing.T) {
	// Simulate a pre-multi-family persisted state: entries with no
	// Family field. They should surface under FamilyEVM on read.
	store := NewInMemoryStore()
	// Write under empty family — that's the legacy state.
	if err := store.PutEntry(context.Background(), "", 0, ReleasePoolEntry{
		Index:    0,
		WalletID: "legacy-0",
		Address:  "0xlegacy0",
		Network:  "LUX_TESTNET",
	}); err != nil {
		t.Fatal(err)
	}
	if err := store.PutEntry(context.Background(), "", 1, ReleasePoolEntry{
		Index:    1,
		WalletID: "legacy-1",
		Address:  "0xlegacy1",
		Network:  "LUX_TESTNET",
	}); err != nil {
		t.Fatal(err)
	}

	evmPool := NewReleasePoolForFamily(store, FamilyEVM, "LUX_TESTNET", nil)
	if err := evmPool.Bootstrap(context.Background(), nil, 0); err != nil {
		t.Fatalf("Bootstrap reload: %v", err)
	}
	if evmPool.Size() != 2 {
		t.Errorf("legacy entries should reload under EVM, got Size=%d", evmPool.Size())
	}

	// Verify BTC pool does NOT see those legacy entries.
	btcPool := NewReleasePoolForFamily(store, FamilyBTC, "BITCOIN_MAINNET", nil)
	if err := btcPool.Bootstrap(context.Background(), nil, 0); err != nil {
		t.Fatal(err)
	}
	if btcPool.Size() != 0 {
		t.Errorf("BTC pool should not inherit legacy EVM entries; got Size=%d", btcPool.Size())
	}
}

// TestReleasePool_XRPFamily_BootstrapAndAcquire — XRP-family equivalent
// of the BTC test: minted entries carry the ECDSA pubkey hex needed by
// the XRP signing driver to populate SigningPubKey.
func TestReleasePool_XRPFamily_BootstrapAndAcquire(t *testing.T) {
	store := NewInMemoryStore()
	pool := NewReleasePoolForFamily(store, FamilyXRP, "XRP_TESTNET", nil)
	// fakeXRPKeygener returns wallets tagged AddressTypeXRP plus a
	// non-empty ECDSAPubKey so the pool can fill ECDSAPubKey hex.
	kg := &fakeXRPKeygener{}
	if err := pool.Bootstrap(context.Background(), kg, 3); err != nil {
		t.Fatalf("Bootstrap: %v", err)
	}
	if pool.Size() != 3 {
		t.Errorf("Size = %d, want 3", pool.Size())
	}
	got, err := pool.Acquire(context.Background(), "XRP_TESTNET")
	if err != nil {
		t.Fatal(err)
	}
	if got.Family != FamilyXRP {
		t.Errorf("Family = %q, want %q", got.Family, FamilyXRP)
	}
	if got.ECDSAPubKey == "" {
		t.Error("XRP pool entry should carry a non-empty ECDSAPubKey hex from keygen (XRP SigningPubKey depends on it)")
	}
}

type fakeXRPKeygener struct {
	calls atomic.Int64
}

func (k *fakeXRPKeygener) KeygenForDeposit(_ context.Context, network string) (*mchain.Wallet, error) {
	i := k.calls.Add(1)
	return &mchain.Wallet{
		Name:        fmt.Sprintf("xrp-wallet-%d", i),
		Address:     fmt.Sprintf("rExample-%d", i),
		AddressType: mchain.AddressTypeXRP,
		ECDSAPubKey: []byte{0x02, byte(i), 0xAA, 0xBB}, // non-empty
	}, nil
}
