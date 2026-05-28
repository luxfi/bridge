// Tests for the DOT-flavoured (multi-keyspace) release pool.

package main

import (
	"context"
	"testing"
)

// TestReleasePool_KeyspaceIsolation verifies the default and DOT pools
// don't see each other's entries.
func TestReleasePool_KeyspaceIsolation(t *testing.T) {
	store := NewInMemoryStore()
	ctx := context.Background()

	// Default pool.
	defPool := NewReleasePool(store, "LUX_TESTNET", nil)
	dotPool := NewReleasePoolWithKey(store, "POLKADOT_TESTNET", "releasepool:dot", nil)

	// Put entries via the namespaced store path.
	_ = store.PutEntryNS(ctx, "", 0, ReleasePoolEntry{Index: 0, WalletID: "evm-0", Address: "0xevm"})
	_ = store.PutEntryNS(ctx, "releasepool:dot", 0, ReleasePoolEntry{Index: 0, WalletID: "dot-0", Address: "5dot"})

	if err := defPool.Bootstrap(ctx, nil, 0); err != nil {
		t.Fatal(err)
	}
	if err := dotPool.Bootstrap(ctx, nil, 0); err != nil {
		t.Fatal(err)
	}

	if defPool.Size() != 1 {
		t.Errorf("def pool size = %d, want 1", defPool.Size())
	}
	if dotPool.Size() != 1 {
		t.Errorf("dot pool size = %d, want 1", dotPool.Size())
	}

	// Acquire from each — should NOT cross-contaminate.
	e1, err := defPool.Acquire(ctx, "LUX_TESTNET")
	if err != nil {
		t.Fatal(err)
	}
	if e1.WalletID != "evm-0" {
		t.Errorf("def acquire WalletID = %q, want evm-0", e1.WalletID)
	}
	e2, err := dotPool.Acquire(ctx, "POLKADOT_TESTNET")
	if err != nil {
		t.Fatal(err)
	}
	if e2.WalletID != "dot-0" {
		t.Errorf("dot acquire WalletID = %q, want dot-0", e2.WalletID)
	}
}

// TestReleasePool_PubKeyHexRoundtrip exercises the new PubKeyHex
// lookup path the DOT signing driver relies on.
func TestReleasePool_PubKeyHexRoundtrip(t *testing.T) {
	store := NewInMemoryStore()
	ctx := context.Background()
	pool := NewReleasePoolWithKey(store, "POLKADOT_TESTNET", "releasepool:dot", nil)
	const pub = "02bf3e72a73be7a3a1b9b7872c7e3a7bf1c5e22f4e7f2a73be7a3a1b9b7872c7e3"
	_ = store.PutEntryNS(ctx, "releasepool:dot", 0, ReleasePoolEntry{
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
// entries by keyspace.
func TestZapStore_NamespacedPool(t *testing.T) {
	dir := t.TempDir()
	store, err := NewZapStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	ctx := context.Background()
	_ = store.PutEntryNS(ctx, "", 0, ReleasePoolEntry{Index: 0, WalletID: "evm-0", Address: "0x1"})
	_ = store.PutEntryNS(ctx, "releasepool:dot", 0, ReleasePoolEntry{Index: 0, WalletID: "dot-0", Address: "5y"})

	def, err := store.LoadEntriesNS(ctx, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(def) != 1 || def[0].WalletID != "evm-0" {
		t.Errorf("default ns LoadEntriesNS = %+v, want [evm-0]", def)
	}
	dot, err := store.LoadEntriesNS(ctx, "releasepool:dot")
	if err != nil {
		t.Fatal(err)
	}
	if len(dot) != 1 || dot[0].WalletID != "dot-0" {
		t.Errorf("dot ns LoadEntriesNS = %+v, want [dot-0]", dot)
	}
}
