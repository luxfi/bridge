package main

import (
	"context"
	"crypto/ed25519"
	"encoding/hex"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/luxfi/bridge/internal/mchain"
	"github.com/luxfi/bridge/internal/txassembler"
)

// fakeTONKeygener simulates an mpcd that emits Ed25519 pubkeys + the
// correctly-derived v4r2 raw address for TON_* networks.
type fakeTONKeygener struct {
	calls atomic.Int64
}

func (k *fakeTONKeygener) KeygenForDeposit(_ context.Context, _ string) (*mchain.Wallet, error) {
	i := k.calls.Add(1)
	// Seed a deterministic pubkey per call so multiple-mint tests
	// see distinct entries.
	seed := make([]byte, ed25519.SeedSize)
	seed[0] = byte(i)
	priv := ed25519.NewKeyFromSeed(seed)
	pub := priv.Public().(ed25519.PublicKey)
	addr, err := txassembler.TONRawAddress(pub)
	if err != nil {
		return nil, err
	}
	return &mchain.Wallet{
		Name:        "ton-release-" + string(rune('0'+i)),
		Address:     addr,
		AddressType: mchain.AddressTypeTON,
		EDDSAPubKey: hex.EncodeToString(pub),
	}, nil
}

func TestReleasePool_TON_PreservesPubKeyAndAddress(t *testing.T) {
	store := NewInMemoryStore()
	pool := NewReleasePool(store, "TON_TESTNET", nil)
	kg := &fakeTONKeygener{}

	if err := pool.Bootstrap(context.Background(), kg, 3); err != nil {
		t.Fatalf("Bootstrap: %v", err)
	}
	if pool.Size() != 3 {
		t.Fatalf("size = %d, want 3", pool.Size())
	}

	entries := pool.Entries()
	for i, e := range entries {
		if e.AddressType != mchain.AddressTypeTON {
			t.Errorf("entry %d AddressType = %q, want %q", i, e.AddressType, mchain.AddressTypeTON)
		}
		if !strings.HasPrefix(e.Address, "0:") {
			t.Errorf("entry %d Address = %q, expected raw form starting with 0:", i, e.Address)
		}
		if e.EDDSAPubKey == "" {
			t.Errorf("entry %d EDDSAPubKey is empty", i)
		}
		// The stored address should match what we'd re-derive from the pubkey.
		pkBytes, err := hex.DecodeString(e.EDDSAPubKey)
		if err != nil {
			t.Fatalf("entry %d pubkey hex: %v", i, err)
		}
		want, _ := txassembler.TONRawAddress(pkBytes)
		if e.Address != want {
			t.Errorf("entry %d Address %q != re-derived %q", i, e.Address, want)
		}
	}
}

func TestReleasePool_TON_AcquireRoundRobinSurfacesAllFields(t *testing.T) {
	store := NewInMemoryStore()
	pool := NewReleasePool(store, "TON_TESTNET", nil)
	if err := pool.Bootstrap(context.Background(), &fakeTONKeygener{}, 2); err != nil {
		t.Fatal(err)
	}
	a, err := pool.Acquire(context.Background(), "TON_TESTNET")
	if err != nil {
		t.Fatal(err)
	}
	b, err := pool.Acquire(context.Background(), "TON_TESTNET")
	if err != nil {
		t.Fatal(err)
	}
	// Round-robin should hand out distinct wallets in 2 successive Acquire calls.
	if a.WalletID == b.WalletID {
		t.Errorf("expected distinct round-robin entries, both = %s", a.WalletID)
	}
	if a.EDDSAPubKey == "" || b.EDDSAPubKey == "" {
		t.Error("Acquire should surface EDDSAPubKey on TON entries")
	}
}

func TestReleasePoolEntry_JSONRoundtrip_PreservesNewFields(t *testing.T) {
	// Make sure the new fields actually serialize through the ZapStore
	// (via encodeEntry / decodeEntry round-trip helpers).
	want := ReleasePoolEntry{
		Index:       7,
		WalletID:    "ton-wallet-7",
		Address:     "0:" + strings.Repeat("a", 64),
		Network:     "TON_TESTNET",
		AddressType: mchain.AddressTypeTON,
		EDDSAPubKey: strings.Repeat("42", 32),
		ECDSAPubKey: strings.Repeat("00", 33),
	}
	b, err := encodeEntry(want)
	if err != nil {
		t.Fatalf("encode: %v", err)
	}
	got, err := decodeEntry(b)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.AddressType != want.AddressType {
		t.Errorf("AddressType lost: %q vs %q", got.AddressType, want.AddressType)
	}
	if got.EDDSAPubKey != want.EDDSAPubKey {
		t.Errorf("EDDSAPubKey lost: %q vs %q", got.EDDSAPubKey, want.EDDSAPubKey)
	}
	if got.ECDSAPubKey != want.ECDSAPubKey {
		t.Errorf("ECDSAPubKey lost: %q vs %q", got.ECDSAPubKey, want.ECDSAPubKey)
	}
}
