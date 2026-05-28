package main

import (
	"context"
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
	return &mchain.Wallet{
		Name:        fmt.Sprintf("release-pool-wallet-%d", i),
		Address:     fmt.Sprintf("0xaddr%d", i),
		AddressType: mchain.AddressTypeETH,
	}, nil
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
		WalletID: "wid",
		Address:  "0xabc",
		Network:  "LUX_TESTNET",
	}
	b, err := encodeEntry(in)
	if err != nil {
		t.Fatalf("encode: %v", err)
	}
	out, err := decodeEntry(b)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out != in {
		// Comparing time.Time would require special handling; we don't
		// set MintedAt above so the zero value should round-trip.
		t.Errorf("roundtrip mismatch: in=%+v out=%+v", in, out)
	}
}
