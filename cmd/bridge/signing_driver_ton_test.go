package main

import (
	"context"
	"crypto/ed25519"
	"encoding/hex"
	"math/big"
	"strings"
	"testing"
	"time"

	luxlog "github.com/luxfi/log"

	"github.com/luxfi/bridge/internal/mchain"
	"github.com/luxfi/bridge/internal/txassembler"
)

// =============================================================================
// tonAmountToNano
// =============================================================================

func TestTONAmountToNano(t *testing.T) {
	cases := []struct {
		name   string
		amount float64
		want   string // string-formatted nanoton
	}{
		{"zero", 0, "0"},
		{"one_ton", 1.0, "1000000000"},
		{"half_ton", 0.5, "500000000"},
		{"point_one_ton", 0.1, "100000000"},
		{"tiny", 0.001, "1000000"},
		{"big", 12345.6789, "12345678900000"},
		{"negative_clamps_to_zero", -1, "0"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := tonAmountToNano(tc.amount)
			if got.String() != tc.want {
				t.Errorf("tonAmountToNano(%v) = %s, want %s", tc.amount, got.String(), tc.want)
			}
		})
	}
}

// =============================================================================
// isTONNativeAsset
// =============================================================================

func TestIsTONNativeAsset(t *testing.T) {
	for _, in := range []string{"", "TON", "ton", "TONCOIN", " ton "} {
		if !isTONNativeAsset(in) {
			t.Errorf("isTONNativeAsset(%q) should be true", in)
		}
	}
	for _, in := range []string{"USDT", "usdt", "JETTON", "x"} {
		if isTONNativeAsset(in) {
			t.Errorf("isTONNativeAsset(%q) should be false", in)
		}
	}
}

// =============================================================================
// SigningDriver: TON dispatch
// =============================================================================

// helper to build a release-pool entry with a known Ed25519 pubkey.
func tonPoolEntry(walletID string) (entry ReleasePoolEntry, priv ed25519.PrivateKey, pub ed25519.PublicKey) {
	seed := make([]byte, ed25519.SeedSize)
	for i := range seed {
		seed[i] = 0x42
	}
	priv = ed25519.NewKeyFromSeed(seed)
	pub = priv.Public().(ed25519.PublicKey)
	addr, _ := txassembler.TONRawAddress(pub)
	entry = ReleasePoolEntry{
		Index:       0,
		WalletID:    walletID,
		Address:     addr,
		Network:     "TON_TESTNET",
		AddressType: mchain.AddressTypeTON,
		EDDSAPubKey: hex.EncodeToString(pub),
	}
	return entry, priv, pub
}

func TestSigningDriver_TON_HappyPath_AssemblesBOC(t *testing.T) {
	store := NewInMemoryStore()
	signer := newFakeSigner()

	entry, priv, _ := tonPoolEntry("bridge-ton_testnet-1")

	// Pre-seed the in-memory pool with our TON entry.
	if err := store.PutEntry(context.Background(), 0, entry); err != nil {
		t.Fatal(err)
	}
	pool := NewReleasePool(store, "TON_TESTNET", nil)
	if err := pool.Bootstrap(context.Background(), nil, 0); err != nil {
		t.Fatal(err)
	}
	if pool.Size() != 1 {
		t.Fatalf("pool size = %d, want 1", pool.Size())
	}

	// Insert a swap targeting TON.
	sw := &Swap{
		ID:                 "swap_ton",
		Status:             SwapStatusBridgeTransferPending,
		Amount:             0.1,
		DestinationNetwork: "TON_TESTNET",
		DestinationAsset:   "TON",
		DestinationAddress: entry.Address, // self-send for simplicity
		DepositAddress:     "ignored",
	}
	if err := store.Create(context.Background(), sw); err != nil {
		t.Fatal(err)
	}

	// Pre-sign by replaying the path the driver will take so we can
	// compute the matching signature for the fake signer to return.
	tonAsm := txassembler.NewTONAssembler()
	fixedNow := func() time.Time { return time.Date(2026, 5, 27, 12, 0, 0, 0, time.UTC) }
	tonAsm.Now = fixedNow

	spec := txassembler.TONSpec{
		Network:            sw.DestinationNetwork,
		SourcePubKey:       priv.Public().(ed25519.PublicKey),
		SourceAddress:      entry.Address,
		DestinationAddress: sw.DestinationAddress,
		Asset:              sw.DestinationAsset,
		AmountNano:         tonAmountToNano(sw.Amount),
	}
	u, err := tonAsm.PreSignTON(context.Background(), spec)
	if err != nil {
		t.Fatalf("offline PreSignTON: %v", err)
	}
	sig := ed25519.Sign(priv, u.SigHash[:])
	signer.ok(entry.WalletID, hex.EncodeToString(sig), "sess_ton")

	driver := NewSigningDriver(store, signer, 50*time.Millisecond, luxlog.NewNoOpLogger())
	driver.SetTONAssembler(tonAsm)
	driver.SetReleasePool(pool)

	// One tick — should sign, finalize, advance to broadcasting.
	driver.Tick(context.Background())

	got, err := store.Get(context.Background(), sw.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Status != SwapStatusBroadcasting {
		t.Errorf("status = %q, want %q", got.Status, SwapStatusBroadcasting)
	}
	if got.DestRawTx == "" {
		t.Error("DestRawTx should be populated with a BOC")
	}
	if got.Signature == "" {
		t.Error("Signature should be persisted")
	}
	if signer.calls.Load() != 1 {
		t.Errorf("signer calls = %d, want 1", signer.calls.Load())
	}
	// Verify the message was the SigHash hex.
	wantMsg := "0x" + hex.EncodeToString(u.SigHash[:])
	if len(signer.lastReq) == 0 || signer.lastReq[0].msg != wantMsg {
		t.Errorf("signed message mismatch: got %q want %q",
			signer.lastReq[0].msg, wantMsg)
	}
}

func TestSigningDriver_TON_MissingEdDSAPubKey_Rolls_Back(t *testing.T) {
	store := NewInMemoryStore()
	signer := newFakeSigner()

	// Pool entry with empty EDDSAPubKey.
	entry := ReleasePoolEntry{
		Index:       0,
		WalletID:    "bad-ton-entry",
		Address:     "0:" + strings.Repeat("a", 64),
		Network:     "TON_TESTNET",
		AddressType: mchain.AddressTypeTON,
		// EDDSAPubKey deliberately empty.
	}
	_ = store.PutEntry(context.Background(), 0, entry)
	pool := NewReleasePool(store, "TON_TESTNET", nil)
	_ = pool.Bootstrap(context.Background(), nil, 0)

	sw := &Swap{
		ID:                 "swap_ton_no_eddsa",
		Status:             SwapStatusBridgeTransferPending,
		Amount:             1,
		DestinationNetwork: "TON_TESTNET",
		DestinationAsset:   "TON",
		DestinationAddress: entry.Address,
		DepositAddress:     "ignored",
	}
	_ = store.Create(context.Background(), sw)

	driver := NewSigningDriver(store, signer, 50*time.Millisecond, luxlog.NewNoOpLogger())
	driver.SetTONAssembler(txassembler.NewTONAssembler())
	driver.SetReleasePool(pool)

	driver.Tick(context.Background())

	got, err := store.Get(context.Background(), sw.ID)
	if err != nil {
		t.Fatal(err)
	}
	// Should roll back to pending so a future tick can retry once
	// the operator re-keygens with Ed25519 hint enabled.
	if got.Status != SwapStatusBridgeTransferPending {
		t.Errorf("status = %q, want %q", got.Status, SwapStatusBridgeTransferPending)
	}
	if got.LastError == "" || !strings.Contains(got.LastError, "ed25519") {
		t.Errorf("expected ed25519-related error, got %q", got.LastError)
	}
	if signer.calls.Load() != 0 {
		t.Errorf("signer should not have been called; calls=%d", signer.calls.Load())
	}
}

// =============================================================================
// gasPrecheckTON
// =============================================================================

// stubBalanceProbe returns a fixed balance per (network, address) key.
type stubBalanceProbe struct {
	balances map[string]*big.Int
	err      error
}

func (s *stubBalanceProbe) BalanceAt(_ context.Context, network, addr string) (*big.Int, error) {
	if s.err != nil {
		return nil, s.err
	}
	return s.balances[network+"|"+addr], nil
}

func TestGasPrecheckTON_Sufficient(t *testing.T) {
	d := &SigningDriver{
		perBalanceTimeout: time.Second,
		gasProbe: &stubBalanceProbe{
			balances: map[string]*big.Int{
				"TON_TESTNET|0:abc": big.NewInt(200_000_000), // 0.2 TON
			},
		},
	}
	sw := &Swap{DestinationNetwork: "TON_TESTNET"}
	spec := txassembler.TONSpec{
		Network:    "TON_TESTNET",
		AmountNano: big.NewInt(100_000_000), // 0.1 TON
		Asset:      "TON",
	}
	reason, ok := d.gasPrecheckTON(context.Background(), sw, spec, "0:abc")
	if !ok {
		t.Errorf("balance 0.2 TON should cover 0.1 amount + 0.05 gas; reason=%q", reason)
	}
}

func TestGasPrecheckTON_Insufficient(t *testing.T) {
	d := &SigningDriver{
		perBalanceTimeout: time.Second,
		gasProbe: &stubBalanceProbe{
			balances: map[string]*big.Int{
				"TON_TESTNET|0:abc": big.NewInt(10_000_000), // 0.01 TON
			},
		},
	}
	sw := &Swap{DestinationNetwork: "TON_TESTNET"}
	spec := txassembler.TONSpec{
		Network:    "TON_TESTNET",
		AmountNano: big.NewInt(100_000_000), // 0.1 TON
		Asset:      "TON",
	}
	reason, ok := d.gasPrecheckTON(context.Background(), sw, spec, "0:abc")
	if ok {
		t.Errorf("balance 0.01 should NOT cover 0.1 amount + 0.05 gas")
	}
	if !strings.Contains(reason, "insufficient nanoton balance") {
		t.Errorf("reason wording: %q", reason)
	}
}

func TestGasPrecheckTON_JettonPathSkipsValueInCheck(t *testing.T) {
	// Jetton transfers don't move TON balance, only gas.
	// So a release wallet with just 0.2 TON should cover a 1000 USDT
	// jetton transfer (which only needs ~0.15 TON gas budget).
	d := &SigningDriver{
		perBalanceTimeout: time.Second,
		gasProbe: &stubBalanceProbe{
			balances: map[string]*big.Int{
				"TON_TESTNET|0:abc": big.NewInt(200_000_000), // 0.2 TON
			},
		},
	}
	sw := &Swap{DestinationNetwork: "TON_TESTNET"}
	spec := txassembler.TONSpec{
		Network:    "TON_TESTNET",
		AmountNano: big.NewInt(1_000_000_000), // 1000 USDT (6 decimals, big number)
		Asset:      "USDT",                    // jetton path
	}
	_, ok := d.gasPrecheckTON(context.Background(), sw, spec, "0:abc")
	if !ok {
		t.Error("jetton transfer should ignore the user value for the wallet's TON budget")
	}
}

func TestGasPrecheckTON_ProbeErrorIsNonFatal(t *testing.T) {
	d := &SigningDriver{
		perBalanceTimeout: time.Second,
		gasProbe: &stubBalanceProbe{
			err: context.DeadlineExceeded,
		},
	}
	sw := &Swap{DestinationNetwork: "TON_TESTNET"}
	spec := txassembler.TONSpec{
		Network:    "TON_TESTNET",
		AmountNano: big.NewInt(1),
		Asset:      "TON",
	}
	_, ok := d.gasPrecheckTON(context.Background(), sw, spec, "0:abc")
	if !ok {
		t.Error("probe failure should be non-fatal — we should NOT block the swap")
	}
}

// =============================================================================
// lookupPoolEntry
// =============================================================================

func TestLookupPoolEntry(t *testing.T) {
	store := NewInMemoryStore()
	entry := ReleasePoolEntry{Index: 0, WalletID: "abc", Address: "0:zzz"}
	_ = store.PutEntry(context.Background(), 0, entry)

	pool := NewReleasePool(store, "TON_TESTNET", nil)
	_ = pool.Bootstrap(context.Background(), nil, 0)

	d := &SigningDriver{pool: pool}
	got := d.lookupPoolEntry("abc")
	if got == nil || got.WalletID != "abc" {
		t.Errorf("lookupPoolEntry(abc) failed: %+v", got)
	}
	if d.lookupPoolEntry("missing") != nil {
		t.Error("lookupPoolEntry(missing) should return nil")
	}
}
