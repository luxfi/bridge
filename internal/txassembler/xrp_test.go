package txassembler

import (
	"context"
	"encoding/hex"
	"strings"
	"testing"

	"github.com/luxfi/bridge/internal/xrp"
)

// fakeXRPProvider returns deterministic AccountInfo / fee values so
// PreSignXRP / PreSignXRPRefund tests can pin the serialized output
// without an HTTPS roundtrip to xrplcluster.com.
type fakeXRPProvider struct {
	balanceDrops uint64
	sequence     uint32
	feeDrops     uint64
	notFound     bool
	submitErr    error
	submitHash   string
}

func (f *fakeXRPProvider) AccountInfo(_ context.Context, _, address string) (*xrp.AccountInfoResult, bool, error) {
	if f.notFound {
		return &xrp.AccountInfoResult{Status: "error", Error: "actNotFound"}, false, nil
	}
	r := &xrp.AccountInfoResult{Status: "success"}
	r.AccountData.Account = address
	r.AccountData.Balance = sprintDrops(f.balanceDrops)
	r.AccountData.Sequence = f.sequence
	return r, true, nil
}
func (f *fakeXRPProvider) BalanceDrops(_ context.Context, _, _ string) (uint64, error) {
	if f.notFound {
		return 0, nil
	}
	return f.balanceDrops, nil
}
func (f *fakeXRPProvider) ServerInfoFee(_ context.Context, _ string) (uint64, error) {
	return f.feeDrops, nil
}
func (f *fakeXRPProvider) SubmitBlob(_ context.Context, _, _ string) (*xrp.SubmitResult, error) {
	if f.submitErr != nil {
		return nil, f.submitErr
	}
	out := &xrp.SubmitResult{EngineResult: "tesSUCCESS", Status: "success"}
	out.TxJSON.Hash = f.submitHash
	return out, nil
}

// sprintDrops formats a uint64 as a decimal string the way XRPL's
// account_info returns "Balance". Avoids strconv to keep the test
// helper standalone.
func sprintDrops(n uint64) string {
	if n == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[i:])
}

// pubkeyHex32 is a deterministic 32-byte ed25519 pubkey for the tests.
// Not on-curve, doesn't matter for message-construction tests; the MPC
// cluster would produce a real one in prod.
const pubkeyHex32 = "0000000000000000000000000000000000000000000000000000000000000000"

// Known r-addresses from internal/mchain/xrp_address_test.go vectors.
// First addr derives from pubkey 0x00..0x1F (a different test vector
// from `pubkeyHex32` above — they don't need to relate for unit tests).
const (
	xrpSenderAddr    = "rDR3ovFUFWw8ojQaXBDBQCQS5eLrZxJuRX"
	xrpRecipientAddr = "r3rAk2rbTQ3inkutmWZcugaFs52BHGVSE8"
)

func TestPreSignXRP_BuildsCorrectPayment(t *testing.T) {
	a := &Assembler{}
	prov := &fakeXRPProvider{
		balanceDrops: 10_000_000, // 10 XRP
		sequence:     42,
		feeDrops:     12,
	}

	got, err := a.PreSignXRP(context.Background(), SwapIntent{
		DestinationNetwork: "XRP_TESTNET",
		DestinationAsset:   "XRP",
		DestinationAddress: xrpRecipientAddr,
		Amount:             1.5, // 1.5 XRP → 1_500_000 drops
		SenderAddress:      xrpSenderAddr,
	}, prov, pubkeyHex32)
	if err != nil {
		t.Fatalf("PreSignXRP: %v", err)
	}
	if got.Network != "XRP_TESTNET" {
		t.Errorf("Network = %q want XRP_TESTNET", got.Network)
	}
	if got.AmountDrops != 1_500_000 {
		t.Errorf("AmountDrops = %d want 1500000", got.AmountDrops)
	}
	if got.FeeDrops != 12 {
		t.Errorf("FeeDrops = %d want 12", got.FeeDrops)
	}
	if got.Sequence != 42 {
		t.Errorf("Sequence = %d want 42", got.Sequence)
	}
	if got.Recipient != xrpRecipientAddr {
		t.Errorf("Recipient = %q want %q", got.Recipient, xrpRecipientAddr)
	}

	// Signing bytes must start with the "STX\0" prefix.
	if !bytesHasPrefix(got.SigningBytes, []byte{0x53, 0x54, 0x58, 0x00}) {
		t.Errorf("SigningBytes missing STX prefix; got % x", got.SigningBytes[:4])
	}
	// First field after prefix is TransactionType (field id 0x12, value 0x0000 for Payment).
	if got.SigningBytes[4] != 0x12 {
		t.Errorf("SigningBytes[4] = 0x%02x want 0x12 (TransactionType field id)", got.SigningBytes[4])
	}

	// SigningPubKey must be 33 bytes: 0xED prefix + 32-byte raw pubkey.
	if len(got.Inner.SigningPubKey) != 33 {
		t.Errorf("SigningPubKey len = %d want 33", len(got.Inner.SigningPubKey))
	}
	if got.Inner.SigningPubKey[0] != 0xED {
		t.Errorf("SigningPubKey[0] = 0x%02x want 0xED", got.Inner.SigningPubKey[0])
	}
}

func TestPreSignXRP_RejectsUnfundedSender(t *testing.T) {
	a := &Assembler{}
	prov := &fakeXRPProvider{notFound: true}
	_, err := a.PreSignXRP(context.Background(), SwapIntent{
		DestinationNetwork: "XRP_TESTNET",
		DestinationAddress: xrpRecipientAddr,
		Amount:             1.0,
		SenderAddress:      xrpSenderAddr,
	}, prov, pubkeyHex32)
	if err == nil {
		t.Fatal("expected error for actNotFound sender, got nil")
	}
	if !strings.Contains(err.Error(), "not funded") {
		t.Errorf("error %q should mention 'not funded'", err.Error())
	}
}

func TestPreSignXRP_RejectsMissingProvider(t *testing.T) {
	a := &Assembler{}
	_, err := a.PreSignXRP(context.Background(), SwapIntent{
		DestinationNetwork: "XRP_TESTNET",
		DestinationAddress: xrpRecipientAddr,
		Amount:             1.0,
		SenderAddress:      xrpSenderAddr,
	}, nil, pubkeyHex32)
	if err == nil {
		t.Fatal("expected error when provider is nil")
	}
}

func TestPreSignXRP_RejectsBadPubKey(t *testing.T) {
	a := &Assembler{}
	prov := &fakeXRPProvider{balanceDrops: 10_000_000, sequence: 1, feeDrops: 12}
	_, err := a.PreSignXRP(context.Background(), SwapIntent{
		DestinationNetwork: "XRP_TESTNET",
		DestinationAddress: xrpRecipientAddr,
		Amount:             1.0,
		SenderAddress:      xrpSenderAddr,
	}, prov, "not-hex")
	if err == nil {
		t.Fatal("expected error for malformed pubkey hex")
	}
}

func TestPreSignXRP_AcceptsEDPrefixedPubKey(t *testing.T) {
	a := &Assembler{}
	prov := &fakeXRPProvider{balanceDrops: 10_000_000, sequence: 1, feeDrops: 12}
	// 0xED prefix + 32 zero bytes = 66 hex chars
	preprefixed := "ED" + pubkeyHex32
	got, err := a.PreSignXRP(context.Background(), SwapIntent{
		DestinationNetwork: "XRP_TESTNET",
		DestinationAddress: xrpRecipientAddr,
		Amount:             1.0,
		SenderAddress:      xrpSenderAddr,
	}, prov, preprefixed)
	if err != nil {
		t.Fatalf("PreSignXRP with 0xED-prefixed key: %v", err)
	}
	if got.Inner.SigningPubKey[0] != 0xED {
		t.Errorf("SigningPubKey[0] = 0x%02x want 0xED", got.Inner.SigningPubKey[0])
	}
}

func TestFinalizeXRP_AttachesSignatureAndReturnsHexBlob(t *testing.T) {
	a := &Assembler{}
	prov := &fakeXRPProvider{balanceDrops: 10_000_000, sequence: 7, feeDrops: 12}
	unsigned, err := a.PreSignXRP(context.Background(), SwapIntent{
		DestinationNetwork: "XRP_TESTNET",
		DestinationAddress: xrpRecipientAddr,
		Amount:             0.5,
		SenderAddress:      xrpSenderAddr,
	}, prov, pubkeyHex32)
	if err != nil {
		t.Fatalf("PreSignXRP: %v", err)
	}

	sig := make([]byte, 64)
	for i := range sig {
		sig[i] = byte(0xAA)
	}

	blob, err := a.FinalizeXRP(unsigned, sig)
	if err != nil {
		t.Fatalf("FinalizeXRP: %v", err)
	}
	// Blob should be uppercase hex.
	if strings.ToUpper(blob) != blob {
		t.Errorf("FinalizeXRP returned non-uppercase hex: %q", blob[:32])
	}
	// Must contain the signature bytes (uppercase hex of 0xAA × 64).
	wantSig := strings.Repeat("AA", 64)
	if !strings.Contains(blob, wantSig) {
		t.Errorf("blob does not contain signature %s", wantSig)
	}
	// Must decode to valid bytes.
	if _, err := hex.DecodeString(blob); err != nil {
		t.Errorf("blob is not valid hex: %v", err)
	}
}

func TestFinalizeXRP_RejectsBadSignatureLength(t *testing.T) {
	a := &Assembler{}
	u := &XRPUnsigned{Inner: &xrp.Payment{}}
	if _, err := a.FinalizeXRP(u, make([]byte, 32)); err == nil {
		t.Fatal("expected error for 32-byte signature")
	}
}

func TestFinalizeXRP_RejectsNilUnsigned(t *testing.T) {
	a := &Assembler{}
	if _, err := a.FinalizeXRP(nil, make([]byte, 64)); err == nil {
		t.Fatal("expected error for nil unsigned")
	}
}

func TestPreSignXRPRefund_BuildsAndRespectsReserve(t *testing.T) {
	a := &Assembler{}
	// Balance: 10 XRP. Sweep: 7 XRP. Fee: 12 drops. Reserve: 2 XRP.
	// Post-tx remaining = 10 - 7 - 0.000012 ≈ 3 XRP > 2 XRP → OK.
	prov := &fakeXRPProvider{
		balanceDrops: 10_000_000,
		sequence:     5,
		feeDrops:     12,
	}
	got, err := a.PreSignXRPRefund(
		context.Background(),
		"XRP_TESTNET",
		pubkeyHex32,
		xrpSenderAddr,
		xrpRecipientAddr,
		7_000_000, // 7 XRP sweep
		prov,
	)
	if err != nil {
		t.Fatalf("PreSignXRPRefund: %v", err)
	}
	if got.AmountDrops != 7_000_000 {
		t.Errorf("AmountDrops = %d want 7000000", got.AmountDrops)
	}
	if got.Sequence != 5 {
		t.Errorf("Sequence = %d want 5", got.Sequence)
	}
	if got.Network != "XRP_TESTNET" {
		t.Errorf("Network = %q want XRP_TESTNET", got.Network)
	}
}

func TestPreSignXRPRefund_RejectsSweepThatBreaksReserve(t *testing.T) {
	a := &Assembler{}
	// Balance: 3 XRP. Sweep: 1.5 XRP. Reserve: 2 XRP.
	// Post-tx remaining = 3 - 1.5 - tiny = 1.5 XRP < 2 XRP → reject.
	prov := &fakeXRPProvider{
		balanceDrops: 3_000_000,
		sequence:     1,
		feeDrops:     12,
	}
	_, err := a.PreSignXRPRefund(
		context.Background(),
		"XRP_TESTNET",
		pubkeyHex32,
		xrpSenderAddr,
		xrpRecipientAddr,
		1_500_000,
		prov,
	)
	if err == nil {
		t.Fatal("expected reserve-protection error, got nil")
	}
	if !strings.Contains(err.Error(), "reserve") {
		t.Errorf("error %q should mention 'reserve'", err.Error())
	}
}

func TestPreSignXRPRefund_RejectsZeroAmount(t *testing.T) {
	a := &Assembler{}
	_, err := a.PreSignXRPRefund(
		context.Background(),
		"XRP_TESTNET",
		pubkeyHex32,
		xrpSenderAddr,
		xrpRecipientAddr,
		0,
		&fakeXRPProvider{balanceDrops: 10_000_000},
	)
	if err == nil {
		t.Fatal("expected error for zero sweep amount")
	}
}

func TestDecodeEd25519XRP_Variants(t *testing.T) {
	// 32-byte hex (raw)
	out, err := decodeEd25519XRP(pubkeyHex32)
	if err != nil {
		t.Fatalf("32-byte: %v", err)
	}
	if len(out) != 33 || out[0] != 0xED {
		t.Errorf("32-byte path produced wrong shape: len=%d head=0x%02x", len(out), out[0])
	}

	// 0x prefix accepted
	if _, err := decodeEd25519XRP("0x" + pubkeyHex32); err != nil {
		t.Errorf("0x-prefixed should work: %v", err)
	}

	// 33-byte 0xED-prefixed
	if _, err := decodeEd25519XRP("ED" + pubkeyHex32); err != nil {
		t.Errorf("33-byte 0xED-prefixed should work: %v", err)
	}

	// 33-byte without 0xED → rejected
	if _, err := decodeEd25519XRP("AA" + pubkeyHex32); err == nil {
		t.Error("33-byte non-0xED should be rejected")
	}

	// Wrong length
	if _, err := decodeEd25519XRP("00ff"); err == nil {
		t.Error("4-byte input should be rejected")
	}

	// Empty
	if _, err := decodeEd25519XRP(""); err == nil {
		t.Error("empty input should be rejected")
	}
}

func TestParseDrops(t *testing.T) {
	cases := []struct {
		in      string
		want    uint64
		wantErr bool
	}{
		{"0", 0, false},
		{"12", 12, false},
		{"2000000", 2_000_000, false},
		{"18446744073709551615", 18446744073709551615, false}, // MaxUint64
		{"18446744073709551616", 0, true},                     // overflow
		{"1.5", 0, true},                                      // non-digit
		{"abc", 0, true},
		{"", 0, false}, // empty → 0; matches conservative parser
	}
	for _, tc := range cases {
		got, err := parseDrops(tc.in)
		if tc.wantErr {
			if err == nil {
				t.Errorf("parseDrops(%q) want error, got nil", tc.in)
			}
			continue
		}
		if err != nil {
			t.Errorf("parseDrops(%q) unexpected error: %v", tc.in, err)
			continue
		}
		if got != tc.want {
			t.Errorf("parseDrops(%q) = %d, want %d", tc.in, got, tc.want)
		}
	}
}

func bytesHasPrefix(b, p []byte) bool {
	if len(b) < len(p) {
		return false
	}
	for i, v := range p {
		if b[i] != v {
			return false
		}
	}
	return true
}
