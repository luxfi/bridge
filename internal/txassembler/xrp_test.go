package txassembler

import (
	"context"
	"encoding/hex"
	"strings"
	"sync"
	"testing"

	"github.com/luxfi/bridge/internal/xrpl"
)

// =============================================================================
// fake XRPProvider
// =============================================================================

type fakeXRPProvider struct {
	mu              sync.Mutex
	seq             uint32
	validatedLedger uint32
	feeDrops        int64
	balanceDrops    int64
	err             error
}

func (f *fakeXRPProvider) AccountInfo(_ context.Context, _, _ string) (uint32, uint32, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.seq, f.validatedLedger, f.err
}
func (f *fakeXRPProvider) SuggestFeeDrops(_ context.Context, _ string) (int64, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.feeDrops <= 0 {
		return xrpl.XRPLBaseFeeDrops, f.err
	}
	return f.feeDrops, f.err
}
func (f *fakeXRPProvider) AccountBalanceDrops(_ context.Context, _, _ string) (int64, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.balanceDrops, f.err
}

// canonical 33-byte compressed-secp256k1 test pubkey + derived r-address.
const (
	testXRPPubHex   = "0330E7FC9D56BB25D6893BA3F317AE5BCF33B3291BD63DB32654A313222F7FD020"
	testXRPDestAddr = "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe"
)

func testAccount(t *testing.T) string {
	t.Helper()
	pub, _ := hex.DecodeString(testXRPPubHex)
	addr, err := xrpl.AddressFromPubKey(pub)
	if err != nil {
		t.Fatalf("AddressFromPubKey: %v", err)
	}
	return addr
}

// =============================================================================
// PreSignXRP + FinalizeXRP round-trip
// =============================================================================

func TestPreSignXRP_PopulatesSequenceFeeLastLedger(t *testing.T) {
	prov := &fakeXRPProvider{
		seq:             42,
		validatedLedger: 100_000,
		feeDrops:        12,
	}
	asm := New(nil)
	asm.XRP = prov
	asm.SetXRPNetwork("XRP_TESTNET", XRPNetwork{LastLedgerWindow: 20})

	u, err := asm.PreSignXRP(context.Background(), XRPSpec{
		Network:            "XRP_TESTNET",
		SenderAddress:      testAccount(t),
		SenderPubKeyHex:    testXRPPubHex,
		DestinationAddress: testXRPDestAddr,
		AmountXRP:          1.0,
	})
	if err != nil {
		t.Fatalf("PreSignXRP: %v", err)
	}
	if u.Sequence != 42 {
		t.Errorf("Sequence = %d, want 42", u.Sequence)
	}
	if u.FeeDrops != 12 {
		t.Errorf("FeeDrops = %d, want 12", u.FeeDrops)
	}
	if u.LastLedgerSeq != 100_020 {
		t.Errorf("LastLedgerSeq = %d, want 100020", u.LastLedgerSeq)
	}
	if u.AmountDrops != 1_000_000 {
		t.Errorf("AmountDrops = %d, want 1000000", u.AmountDrops)
	}
	if len(u.SigningPubKey) != 33 || u.SigningPubKey[0] != 0x03 {
		t.Errorf("SigningPubKey malformed; got %x", u.SigningPubKey)
	}
	// Signing payload must be exactly 32 bytes.
	var zero [32]byte
	if u.SigningPayload == zero {
		t.Error("SigningPayload all-zero — not computed")
	}
}

func TestPreSignXRP_PinsFeeWhenConfigured(t *testing.T) {
	prov := &fakeXRPProvider{seq: 1, validatedLedger: 1, feeDrops: 1}
	asm := New(nil)
	asm.XRP = prov
	asm.SetXRPNetwork("XRP_MAINNET", XRPNetwork{DefaultFeeDrops: 100})

	u, err := asm.PreSignXRP(context.Background(), XRPSpec{
		Network:            "XRP_MAINNET",
		SenderAddress:      testAccount(t),
		SenderPubKeyHex:    testXRPPubHex,
		DestinationAddress: testXRPDestAddr,
		AmountXRP:          0.001,
	})
	if err != nil {
		t.Fatal(err)
	}
	if u.FeeDrops != 100 {
		t.Errorf("FeeDrops should be pinned at 100; got %d", u.FeeDrops)
	}
}

func TestPreSignXRP_FloorsFeeAtBase(t *testing.T) {
	prov := &fakeXRPProvider{seq: 1, validatedLedger: 1, feeDrops: 1} // < base 10
	asm := New(nil)
	asm.XRP = prov
	u, err := asm.PreSignXRP(context.Background(), XRPSpec{
		Network:            "XRP_MAINNET",
		SenderAddress:      testAccount(t),
		SenderPubKeyHex:    testXRPPubHex,
		DestinationAddress: testXRPDestAddr,
		AmountXRP:          1.0,
	})
	if err != nil {
		t.Fatal(err)
	}
	if u.FeeDrops != xrpl.XRPLBaseFeeDrops {
		t.Errorf("FeeDrops should be floored at base %d; got %d", xrpl.XRPLBaseFeeDrops, u.FeeDrops)
	}
}

func TestPreSignXRP_RejectsBadInputs(t *testing.T) {
	prov := &fakeXRPProvider{seq: 1, validatedLedger: 1, feeDrops: 12}
	asm := New(nil)
	asm.XRP = prov
	addr := testAccount(t)
	good := XRPSpec{
		Network:            "XRP_MAINNET",
		SenderAddress:      addr,
		SenderPubKeyHex:    testXRPPubHex,
		DestinationAddress: testXRPDestAddr,
		AmountXRP:          0.5,
	}
	// Missing network.
	bad := good
	bad.Network = ""
	if _, err := asm.PreSignXRP(context.Background(), bad); err == nil {
		t.Error("expected error for empty Network")
	}
	// Negative amount.
	bad = good
	bad.AmountXRP = -0.5
	if _, err := asm.PreSignXRP(context.Background(), bad); err == nil {
		t.Error("expected error for negative amount")
	}
	// Bad pubkey hex.
	bad = good
	bad.SenderPubKeyHex = "not-hex"
	if _, err := asm.PreSignXRP(context.Background(), bad); err == nil {
		t.Error("expected error for malformed pubkey hex")
	}
	// Empty destination.
	bad = good
	bad.DestinationAddress = ""
	if _, err := asm.PreSignXRP(context.Background(), bad); err == nil {
		t.Error("expected error for empty destination")
	}
}

func TestPreSignXRP_RequiresXRPProvider(t *testing.T) {
	asm := New(nil)
	// asm.XRP intentionally left nil.
	_, err := asm.PreSignXRP(context.Background(), XRPSpec{
		Network:            "XRP_MAINNET",
		SenderAddress:      testAccount(t),
		SenderPubKeyHex:    testXRPPubHex,
		DestinationAddress: testXRPDestAddr,
		AmountXRP:          1,
	})
	if err == nil {
		t.Error("expected error when XRP provider not configured")
	}
}

func TestFinalizeXRP_RoundTrip(t *testing.T) {
	prov := &fakeXRPProvider{seq: 5, validatedLedger: 9, feeDrops: 12}
	asm := New(nil)
	asm.XRP = prov

	u, err := asm.PreSignXRP(context.Background(), XRPSpec{
		Network:            "XRP_TESTNET",
		SenderAddress:      testAccount(t),
		SenderPubKeyHex:    testXRPPubHex,
		DestinationAddress: testXRPDestAddr,
		AmountXRP:          0.5,
	})
	if err != nil {
		t.Fatal(err)
	}

	// Fake an MPC signature in r||s||v form (130 hex chars) — the v
	// byte is ignored on the XRP path.
	r := strings.Repeat("12", 32)
	s := strings.Repeat("34", 32)
	v := "00"
	sigHex := r + s + v
	rawHex, txHash, err := asm.FinalizeXRP(u, sigHex)
	if err != nil {
		t.Fatalf("FinalizeXRP: %v", err)
	}
	if rawHex == "" {
		t.Error("rawHex must be non-empty")
	}
	if len(txHash) != 64 {
		t.Errorf("txHash should be 32-byte hex (64 chars); got %d", len(txHash))
	}
	// Decode rawHex to verify it's valid hex.
	if _, err := hex.DecodeString(rawHex); err != nil {
		t.Errorf("rawHex must be valid hex; got error %v", err)
	}
}

func TestFinalizeXRP_RejectsBadSignature(t *testing.T) {
	prov := &fakeXRPProvider{seq: 1, validatedLedger: 1, feeDrops: 12}
	asm := New(nil)
	asm.XRP = prov
	u, err := asm.PreSignXRP(context.Background(), XRPSpec{
		Network:            "XRP_MAINNET",
		SenderAddress:      testAccount(t),
		SenderPubKeyHex:    testXRPPubHex,
		DestinationAddress: testXRPDestAddr,
		AmountXRP:          1,
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := asm.FinalizeXRP(u, ""); err == nil {
		t.Error("expected error for empty signature")
	}
	if _, _, err := asm.FinalizeXRP(u, "not-hex"); err == nil {
		t.Error("expected error for bad-shape signature")
	}
	if _, _, err := asm.FinalizeXRP(nil, "00"); err == nil {
		t.Error("expected error for nil XRPUnsigned")
	}
}

func TestXRPRequiredDrops(t *testing.T) {
	u := &XRPUnsigned{AmountDrops: 1_000_000, FeeDrops: 12}
	want := int64(1_000_000) + 12 + xrpl.XRPLBaseReserveDrops
	if got := u.XRPRequiredDrops(); got != want {
		t.Errorf("XRPRequiredDrops = %d, want %d", got, want)
	}
}

// =============================================================================
// xrpFloatToDrops
// =============================================================================

func TestXRPFloatToDrops(t *testing.T) {
	cases := []struct {
		in   float64
		want int64
	}{
		{1.0, 1_000_000},
		{0.000001, 1},
		{0.5, 500_000},
		{1.123456, 1_123_456},
		{100_000.0, 100_000_000_000},
	}
	for _, c := range cases {
		got, err := xrpFloatToDrops(c.in)
		if err != nil {
			t.Errorf("%v: unexpected err: %v", c.in, err)
		}
		if got != c.want {
			t.Errorf("%v: got %d, want %d", c.in, got, c.want)
		}
	}
}

func TestXRPFloatToDrops_Rejects(t *testing.T) {
	if _, err := xrpFloatToDrops(0); err == nil {
		t.Error("expected error for 0")
	}
	if _, err := xrpFloatToDrops(-1); err == nil {
		t.Error("expected error for negative")
	}
}
