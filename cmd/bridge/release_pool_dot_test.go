// Tests for the DOT-flavoured (multi-family) release pool.

package main

import (
	"context"
	"testing"
)

// TestReleasePool_KeyspaceIsolation verifies the EVM and DOT pools
// don't see each other's entries.
func TestReleasePool_KeyspaceIsolation(t *testing.T) {
	store := NewInMemoryStore()
	ctx := context.Background()

	// EVM pool.
	evmPool := NewReleasePool(store, "LUX_TESTNET", nil)
	dotPool := NewReleasePoolForFamily(store, FamilyDOT, "POLKADOT_TESTNET", nil)

	// Put entries via the family-aware store path.
	_ = store.PutEntry(ctx, FamilyEVM, 0, ReleasePoolEntry{Index: 0, WalletID: "evm-0", Address: "0xevm"})
	_ = store.PutEntry(ctx, FamilyDOT, 0, ReleasePoolEntry{Index: 0, WalletID: "dot-0", Address: "5dot"})

	if err := evmPool.Bootstrap(ctx, nil, 0); err != nil {
		t.Fatal(err)
	}
	if err := dotPool.Bootstrap(ctx, nil, 0); err != nil {
		t.Fatal(err)
	}

	if evmPool.Size() != 1 {
		t.Errorf("evm pool size = %d, want 1", evmPool.Size())
	}
	if dotPool.Size() != 1 {
		t.Errorf("dot pool size = %d, want 1", dotPool.Size())
	}

	// Acquire from each — should NOT cross-contaminate.
	e1, err := evmPool.Acquire(ctx, "LUX_TESTNET")
	if err != nil {
		t.Fatal(err)
	}
	if e1.WalletID != "evm-0" {
		t.Errorf("evm acquire WalletID = %q, want evm-0", e1.WalletID)
	}
	e2, err := dotPool.Acquire(ctx, "POLKADOT_TESTNET")
	if err != nil {
		t.Fatal(err)
	}
	if e2.WalletID != "dot-0" {
		t.Errorf("dot acquire WalletID = %q, want dot-0", e2.WalletID)
	}
}

// TestReleasePool_PubKeyHexRoundtrip exercises the PubKeyHex
// lookup path the DOT signing driver relies on.
func TestReleasePool_PubKeyHexRoundtrip(t *testing.T) {
	store := NewInMemoryStore()
	ctx := context.Background()
	pool := NewReleasePoolForFamily(store, FamilyDOT, "POLKADOT_TESTNET", nil)
	const pub = "02bf3e72a73be7a3a1b9b7872c7e3a7bf1c5e22f4e7f2a73be7a3a1b9b7872c7e3"
	_ = store.PutEntry(ctx, FamilyDOT, 0, ReleasePoolEntry{
		WalletID:    "dot-w0",
		Address:     "5xxx",
		ECDSAPubKey: pub,
	})
	if err := pool.Bootstrap(ctx, nil, 0); err != nil {
		t.Fatal(err)
	}
	if got := pool.PubKeyHex("dot-w0"); got != pub {
		t.Errorf("PubKeyHex(dot-w0) = %q, want %q", got, pub)
	}
	if got := pool.PubKeyHex("missing"); got != "" {
		t.Errorf("PubKeyHex(missing) should be empty, got %q", got)
	}
}

// TestZapStore_NamespacedPool verifies the on-disk path also separates
// entries by family.
func TestZapStore_NamespacedPool(t *testing.T) {
	dir := t.TempDir()
	store, err := NewZapStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	ctx := context.Background()
	_ = store.PutEntry(ctx, FamilyEVM, 0, ReleasePoolEntry{Index: 0, WalletID: "evm-0", Address: "0x1"})
	_ = store.PutEntry(ctx, FamilyDOT, 0, ReleasePoolEntry{Index: 0, WalletID: "dot-0", Address: "5y"})

	evm, err := store.LoadEntries(ctx, FamilyEVM)
	if err != nil {
		t.Fatal(err)
	}
	if len(evm) != 1 || evm[0].WalletID != "evm-0" {
		t.Errorf("evm family LoadEntries = %+v, want [evm-0]", evm)
	}
	dot, err := store.LoadEntries(ctx, FamilyDOT)
	if err != nil {
		t.Fatal(err)
	}
	if len(dot) != 1 || dot[0].WalletID != "dot-0" {
		t.Errorf("dot family LoadEntries = %+v, want [dot-0]", dot)
	}
}
