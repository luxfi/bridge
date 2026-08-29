package main

import (
	"context"
	"errors"
	"fmt"
	"sync/atomic"
	"testing"

	"github.com/luxfi/bridge/internal/mchain"
)

// =============================================================================
// Helpers — drive ReleasePoolSet without a live MPC cluster.
// =============================================================================

// fakeKeygenerFamily mints wallets and tags the returned AddressType
// based on the mint network so the wrapper's family-routing can be
// asserted end-to-end (the real *mchain.Client already does this; the
// fake replicates the convention for the unit test).
type fakeKeygenerFamily struct {
	calls atomic.Int64
}

func (k *fakeKeygenerFamily) KeygenForDeposit(_ context.Context, network string) (*mchain.Wallet, error) {
	i := k.calls.Add(1)
	t, _ := mchain.AddressTypeFor(network)
	addr := fmt.Sprintf("0x%dETH", i)
	if t == mchain.AddressTypeSOL {
		addr = fmt.Sprintf("SoLaNa%d", i)
	} else if t == mchain.AddressTypeBTC {
		addr = fmt.Sprintf("bc1q%d", i)
	}
	return &mchain.Wallet{
		Name:        fmt.Sprintf("pool-%s-%d", t, i),
		Address:     addr,
		AddressType: t,
	}, nil
}

// =============================================================================
// ReleasePoolSet — routing semantics
// =============================================================================

func TestReleasePoolSet_RoutesByFamily(t *testing.T) {
	store := NewInMemoryStore()

	evmPool := NewReleasePoolForFamily(store, FamilyEVM, "LUX_TESTNET", nil)
	solPool := NewReleasePoolForFamily(store, FamilySOL, "SOLANA_DEVNET", nil)

	kg := &fakeKeygenerFamily{}
	if err := evmPool.Bootstrap(context.Background(), kg, 2); err != nil {
		t.Fatalf("evm bootstrap: %v", err)
	}
	if err := solPool.Bootstrap(context.Background(), kg, 3); err != nil {
		t.Fatalf("sol bootstrap: %v", err)
	}

	set := NewReleasePoolSet(nil)
	set.EVM = evmPool
	set.SOL = solPool

	// EVM destination → must come from the EVM pool.
	got, err := set.Acquire(context.Background(), "LUX_TESTNET")
	if err != nil {
		t.Fatalf("acquire EVM: %v", err)
	}
	if got.Address[:2] != "0x" {
		t.Errorf("EVM destination got %q address (want 0x-prefix)", got.Address)
	}

	// SOL destination → must come from the SOL pool.
	got, err = set.Acquire(context.Background(), "SOLANA_DEVNET")
	if err != nil {
		t.Fatalf("acquire SOL: %v", err)
	}
	if got.Address[:6] != "SoLaNa" {
		t.Errorf("SOL destination got %q address (want SoLaNa-prefix)", got.Address)
	}

	// BTC destination → no pool configured → ErrNoPoolForFamily.
	if _, err := set.Acquire(context.Background(), "BITCOIN_MAINNET"); !errors.Is(err, ErrNoPoolForFamily) {
		t.Errorf("expected ErrNoPoolForFamily for BTC, got %v", err)
	}
}

func TestReleasePoolSet_RoundRobinPerFamily(t *testing.T) {
	// SOL pool with 3 entries — Acquire 9 times and expect every wallet
	// used exactly 3 times. Confirms per-family cursors don't share
	// rotation state with other families.
	store := NewInMemoryStore()
	solPool := NewReleasePoolForFamily(store, FamilySOL, "SOLANA_DEVNET", nil)
	if err := solPool.Bootstrap(context.Background(), &fakeKeygenerFamily{}, 3); err != nil {
		t.Fatalf("sol bootstrap: %v", err)
	}
	set := NewReleasePoolSet(nil)
	set.SOL = solPool

	seen := map[string]int{}
	for i := 0; i < 9; i++ {
		e, err := set.Acquire(context.Background(), "SOLANA_DEVNET")
		if err != nil {
			t.Fatalf("acquire %d: %v", i, err)
		}
		seen[e.WalletID]++
	}
	if len(seen) != 3 {
		t.Errorf("expected 3 distinct SOL wallets in rotation, got %d (seen=%v)", len(seen), seen)
	}
	for w, c := range seen {
		if c != 3 {
			t.Errorf("wallet %s used %d times, want 3 (uneven round-robin)", w, c)
		}
	}
}

func TestReleasePoolSet_SizeAndFamilySizes(t *testing.T) {
	store := NewInMemoryStore()

	evmPool := NewReleasePoolForFamily(store, FamilyEVM, "LUX_TESTNET", nil)
	solPool := NewReleasePoolForFamily(store, FamilySOL, "SOLANA_DEVNET", nil)
	if err := evmPool.Bootstrap(context.Background(), &fakeKeygenerFamily{}, 2); err != nil {
		t.Fatalf("evm bootstrap: %v", err)
	}
	if err := solPool.Bootstrap(context.Background(), &fakeKeygenerFamily{}, 3); err != nil {
		t.Fatalf("sol bootstrap: %v", err)
	}

	set := NewReleasePoolSet(nil)
	set.EVM = evmPool
	set.SOL = solPool

	if got := set.Size(); got != 5 {
		t.Errorf("Size = %d, want 5", got)
	}
	sizes := set.FamilySizes()
	if sizes["eth"] != 2 {
		t.Errorf("FamilySizes[eth] = %d, want 2", sizes["eth"])
	}
	if sizes["sol"] != 3 {
		t.Errorf("FamilySizes[sol] = %d, want 3", sizes["sol"])
	}
	if _, ok := sizes["btc"]; ok {
		t.Errorf("FamilySizes shouldn't include btc when BTC pool is nil")
	}
}

func TestReleasePoolSet_EmptyFamilyReturnsErrEmptyPool(t *testing.T) {
	store := NewInMemoryStore()
	solPool := NewReleasePoolForFamily(store, FamilySOL, "SOLANA_DEVNET", nil)
	// NB: no Bootstrap → size 0.
	set := NewReleasePoolSet(nil)
	set.SOL = solPool

	if _, err := set.Acquire(context.Background(), "SOLANA_DEVNET"); !errors.Is(err, ErrEmptyPool) {
		t.Errorf("expected ErrEmptyPool for empty SOL pool, got %v", err)
	}
}

// =============================================================================
// Family-scoped store correctness
// =============================================================================

func TestInMemoryStoreFamily_Isolation(t *testing.T) {
	base := NewInMemoryStore()

	_ = base.PutEntry(context.Background(), FamilyEVM, 0, ReleasePoolEntry{Index: 0, WalletID: "evm-0"})
	_ = base.PutEntry(context.Background(), FamilySOL, 0, ReleasePoolEntry{Index: 0, WalletID: "sol-0"})

	evmEntries, _ := base.LoadEntries(context.Background(), FamilyEVM)
	solEntries, _ := base.LoadEntries(context.Background(), FamilySOL)
	if len(evmEntries) != 1 || evmEntries[0].WalletID != "evm-0" {
		t.Errorf("evm namespace bled / corrupted: %+v", evmEntries)
	}
	if len(solEntries) != 1 || solEntries[0].WalletID != "sol-0" {
		t.Errorf("sol namespace bled / corrupted: %+v", solEntries)
	}
}

func TestInMemoryStoreFamily_AscendingOrder(t *testing.T) {
	base := NewInMemoryStore()
	// Insert out of order; ensure LoadEntries comes back in ascending
	// index order.
	for _, idx := range []int{2, 0, 1} {
		_ = base.PutEntry(context.Background(), FamilySOL, idx, ReleasePoolEntry{
			Index: idx, WalletID: fmt.Sprintf("w-%d", idx),
		})
	}
	got, _ := base.LoadEntries(context.Background(), FamilySOL)
	if len(got) != 3 {
		t.Fatalf("len = %d, want 3", len(got))
	}
	for i, e := range got {
		if e.Index != i {
			t.Errorf("entry[%d].Index = %d, want %d", i, e.Index, i)
		}
	}
}

func TestFamilyCode_Constants(t *testing.T) {
	// Pin the wire-stable constants so a refactor that renames them
	// produces a test failure rather than a silent broken upgrade
	// (existing pool entries in the store reference these codes).
	// Note: BTC PR settled on "evm" (not "eth") as the canonical EVM
	// family code; this test reflects the merged state.
	if FamilyEVM != "evm" {
		t.Errorf("FamilyEVM = %q, want \"evm\"", FamilyEVM)
	}
	if FamilySOL != "sol" {
		t.Errorf("FamilySOL = %q, want \"sol\"", FamilySOL)
	}
	if FamilyBTC != "btc" {
		t.Errorf("FamilyBTC = %q, want \"btc\"", FamilyBTC)
	}
}
