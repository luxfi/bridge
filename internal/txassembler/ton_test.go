package txassembler

import (
	"context"
	"crypto/ed25519"
	"encoding/hex"
	"strings"
	"testing"
	"time"

	"github.com/luxfi/bridge/internal/ton"
	"github.com/luxfi/bridge/internal/tokens"
	"github.com/xssnick/tonutils-go/ton/wallet"
)

// fakeTONProvider returns deterministic seqno/active values so
// PreSignTON tests don't need a live toncenter node.
type fakeTONProvider struct {
	active      bool
	seqno       uint32
	balanceNano uint64
	activeErr   error
	seqnoErr    error
}

func (f *fakeTONProvider) IsContractActive(_ context.Context, _ string) (bool, error) {
	if f.activeErr != nil {
		return false, f.activeErr
	}
	return f.active, nil
}
func (f *fakeTONProvider) GetSeqno(_ context.Context, _ string) (uint32, error) {
	if f.seqnoErr != nil {
		return 0, f.seqnoErr
	}
	return f.seqno, nil
}
func (f *fakeTONProvider) GetBalanceNano(_ context.Context, _ string) (uint64, error) {
	return f.balanceNano, nil
}
func (f *fakeTONProvider) BroadcastBoC(_ context.Context, _ []byte) (string, error) {
	return "", nil
}

var (
	tonTestPub, tonTestPriv, _ = ed25519.GenerateKey(nil)
	tonTestPubHex              = hex.EncodeToString(tonTestPub)
)

func tonTestRecipient() string {
	pub, _, err := ed25519.GenerateKey(nil)
	if err != nil {
		panic(err)
	}
	addr, err := wallet.AddressFromPubKey(pub, wallet.V4R2, wallet.DefaultSubwallet)
	if err != nil {
		panic(err)
	}
	return addr.String()
}

var tonTestRecipientAddr = tonTestRecipient()

// TestPreSignTON_BuildsCorrectMessage proves the SigningHash actually
// encodes the requested amount at the right decimal scale -- not just
// that PreSignTON returns without error. Reconstructs the expected
// hash via the real ton.BuildUnsignedTransfer (bracketing the
// hardcoded time.Now the same way refund_driver_ton_test.go does) and
// separately confirms a 10x-wrong amount (the shape a decimals-off-by-
// one bug would produce) does NOT match, so this test would actually
// fail if PreSignTON's decimal handling regressed.
func TestPreSignTON_BuildsCorrectMessage(t *testing.T) {
	a := &Assembler{}
	prov := &fakeTONProvider{active: true, seqno: 12}

	before := time.Now()
	got, err := a.PreSignTON(context.Background(), SwapIntent{
		DestinationNetwork: "TON_TESTNET",
		DestinationAsset:   "TON",
		DestinationAddress: tonTestRecipientAddr,
		SenderAddress:      "0QReleaseWalletPlaceholder",
		Amount:             1.5, // 1.5 TON
	}, prov, tonTestPubHex)
	after := time.Now()
	if err != nil {
		t.Fatalf("PreSignTON: %v", err)
	}

	if got.Recipient != tonTestRecipientAddr {
		t.Errorf("Recipient = %q, want %q", got.Recipient, tonTestRecipientAddr)
	}
	const wantAmount = 1_500_000_000 // 1.5 TON at 9 decimals
	if got.AmountNanoTON != wantAmount {
		t.Fatalf("AmountNanoTON = %d, want %d", got.AmountNanoTON, wantAmount)
	}
	if len(got.SigningHash) != 32 {
		t.Fatalf("SigningHash length = %d, want 32", len(got.SigningHash))
	}

	reconstruct := func(amountNano uint64, at time.Time) string {
		t.Helper()
		u, err := ton.BuildUnsignedTransfer(tonTestPub, 12, tonTestRecipientAddr, amountNano, "", true, func() time.Time { return at })
		if err != nil {
			t.Fatalf("reconstruct(%d): %v", amountNano, err)
		}
		return hex.EncodeToString(u.SigningHash)
	}
	actualHex := hex.EncodeToString(got.SigningHash)
	matchesAny := func(amountNano uint64) bool {
		return reconstruct(amountNano, before) == actualHex || reconstruct(amountNano, after) == actualHex
	}

	if !matchesAny(wantAmount) {
		t.Error("SigningHash doesn't match a reconstruction using the correct 1.5 TON amount at either bracketed timestamp")
	}
	// A decimals-off-by-one bug (e.g. treating TON as 8 decimals like
	// BTC, or 18 like EVM) would produce a 10x or 10^9x wrong amount.
	// Confirm neither of those plausible-bug shapes accidentally
	// matches (which would mean this test can't actually distinguish
	// correct from wrong).
	wrongOrderOfMagnitude := uint64(wantAmount) * 10
	if matchesAny(wrongOrderOfMagnitude) {
		t.Fatal("test fixture bug: a 10x-wrong amount produced the same hash as the correct amount")
	}
}

func TestPreSignTON_ActiveFlagControlsStateInit(t *testing.T) {
	a := &Assembler{}

	deployed, err := a.PreSignTON(context.Background(), SwapIntent{
		DestinationNetwork: "TON_TESTNET",
		DestinationAddress: tonTestRecipientAddr,
		SenderAddress:      "0QReleaseWalletPlaceholder",
		Amount:             1,
	}, &fakeTONProvider{active: true, seqno: 0}, tonTestPubHex)
	if err != nil {
		t.Fatalf("active=true: %v", err)
	}
	if deployed.Inner.StateInit != nil {
		t.Error("an already-deployed contract (active=true) should not carry StateInit")
	}

	fresh, err := a.PreSignTON(context.Background(), SwapIntent{
		DestinationNetwork: "TON_TESTNET",
		DestinationAddress: tonTestRecipientAddr,
		SenderAddress:      "0QReleaseWalletPlaceholder",
		Amount:             1,
	}, &fakeTONProvider{active: false, seqno: 0}, tonTestPubHex)
	if err != nil {
		t.Fatalf("active=false: %v", err)
	}
	if fresh.Inner.StateInit == nil {
		t.Error("an undeployed contract (active=false) must carry StateInit to deploy atomically with the send")
	}
}

func TestPreSignTON_NilProviderRejected(t *testing.T) {
	a := &Assembler{}
	_, err := a.PreSignTON(context.Background(), SwapIntent{DestinationAddress: tonTestRecipientAddr, Amount: 1}, nil, tonTestPubHex)
	if err == nil {
		t.Fatal("expected an error for a nil provider, got nil")
	}
}

func TestPreSignTON_RejectsBadPubKeyHex(t *testing.T) {
	a := &Assembler{}
	prov := &fakeTONProvider{active: true}
	_, err := a.PreSignTON(context.Background(), SwapIntent{
		DestinationAddress: tonTestRecipientAddr,
		Amount:             1,
	}, prov, "not-hex-and-wrong-length")
	if err == nil {
		t.Fatal("expected an error for a malformed pubkey hex, got nil")
	}
}

func TestPreSignTON_IsContractActiveErrorSurfaces(t *testing.T) {
	a := &Assembler{}
	prov := &fakeTONProvider{activeErr: context.DeadlineExceeded}
	_, err := a.PreSignTON(context.Background(), SwapIntent{
		DestinationAddress: tonTestRecipientAddr,
		SenderAddress:      "0QReleaseWalletPlaceholder",
		Amount:             1,
	}, prov, tonTestPubHex)
	if err == nil || !strings.Contains(err.Error(), "IsContractActive") {
		t.Errorf("err = %v, want it to name IsContractActive", err)
	}
}

func TestPreSignTON_GetSeqnoErrorSurfaces(t *testing.T) {
	a := &Assembler{}
	prov := &fakeTONProvider{active: true, seqnoErr: context.DeadlineExceeded}
	_, err := a.PreSignTON(context.Background(), SwapIntent{
		DestinationAddress: tonTestRecipientAddr,
		SenderAddress:      "0QReleaseWalletPlaceholder",
		Amount:             1,
	}, prov, tonTestPubHex)
	if err == nil || !strings.Contains(err.Error(), "GetSeqno") {
		t.Errorf("err = %v, want it to name GetSeqno", err)
	}
}

// TestPreSignTON_RejectsJettonAsset pins the silent-mis-route guard
// called out in ton.go's package doc: a non-native DestinationAsset
// must be rejected outright, not built as if it were a native
// transfer (which would send raw TON instead of the jetton, silently
// sending the wrong asset).
func TestPreSignTON_RejectsJettonAsset(t *testing.T) {
	registry := tokens.NewRegistry()
	if err := registry.Register(tokens.Info{
		Network:  "TON_TESTNET",
		Asset:    "USDT",
		Contract: "EQSomeJettonMasterContract",
		Decimals: 6,
	}); err != nil {
		t.Fatalf("register: %v", err)
	}
	a := &Assembler{Tokens: registry}
	prov := &fakeTONProvider{active: true}

	_, err := a.PreSignTON(context.Background(), SwapIntent{
		DestinationNetwork: "TON_TESTNET",
		DestinationAsset:   "USDT",
		DestinationAddress: tonTestRecipientAddr,
		SenderAddress:      "0QReleaseWalletPlaceholder",
		Amount:             1,
	}, prov, tonTestPubHex)
	if err == nil || !strings.Contains(strings.ToLower(err.Error()), "jetton") {
		t.Errorf("err = %v, want a jetton-not-implemented rejection", err)
	}
}

// TestPreSignTON_UsesRegistryDecimalsNotHardcodedDefault guards
// against the exact class of bug the amount-verification tests in
// cmd/bridge/refund_driver_*_test.go were added for: a wrong decimal
// scale silently sending 1000x too much or too little. TON's hardcoded
// default is 9 decimals; this proves a registry-supplied decimals
// value actually overrides it rather than being ignored.
func TestPreSignTON_UsesRegistryDecimalsNotHardcodedDefault(t *testing.T) {
	registry := tokens.NewRegistry()
	if err := registry.Register(tokens.Info{
		Network:  "TON_TESTNET",
		Asset:    "TON",
		Contract: "", // native
		Decimals: 6,  // deliberately NOT the real 9, to prove this path is read
	}); err != nil {
		t.Fatalf("register: %v", err)
	}
	a := &Assembler{Tokens: registry}
	prov := &fakeTONProvider{active: true, seqno: 3}

	got, err := a.PreSignTON(context.Background(), SwapIntent{
		DestinationNetwork: "TON_TESTNET",
		DestinationAsset:   "TON",
		DestinationAddress: tonTestRecipientAddr,
		SenderAddress:      "0QReleaseWalletPlaceholder",
		Amount:             1.5,
	}, prov, tonTestPubHex)
	if err != nil {
		t.Fatalf("PreSignTON: %v", err)
	}
	const want = 1_500_000 // 1.5 at 6 decimals, NOT 1_500_000_000 at 9
	if got.AmountNanoTON != want {
		t.Fatalf("AmountNanoTON = %d, want %d (registry decimals=6 should override the hardcoded 9)", got.AmountNanoTON, want)
	}
}

// TestFinalizeTON_RoundTrip is a light integration check that the
// assembler wires signing through to ton.FinalizeSignedExternalMessage
// correctly -- the cryptographic signature-verification behavior
// itself is already exhaustively covered in internal/ton/messaging_test.go.
func TestFinalizeTON_RoundTrip(t *testing.T) {
	a := &Assembler{}
	prov := &fakeTONProvider{active: true, seqno: 1}
	unsigned, err := a.PreSignTON(context.Background(), SwapIntent{
		DestinationNetwork: "TON_TESTNET",
		DestinationAddress: tonTestRecipientAddr,
		SenderAddress:      "0QReleaseWalletPlaceholder",
		Amount:             1,
	}, prov, tonTestPubHex)
	if err != nil {
		t.Fatalf("PreSignTON: %v", err)
	}

	sig := ed25519.Sign(tonTestPriv, unsigned.SigningHash)
	boc, err := a.FinalizeTON(unsigned, sig)
	if err != nil {
		t.Fatalf("FinalizeTON: %v", err)
	}
	if len(boc) == 0 {
		t.Error("expected a non-empty BoC")
	}
}

func TestFinalizeTON_RejectsSignatureFromWrongKey(t *testing.T) {
	a := &Assembler{}
	prov := &fakeTONProvider{active: true, seqno: 1}
	unsigned, err := a.PreSignTON(context.Background(), SwapIntent{
		DestinationNetwork: "TON_TESTNET",
		DestinationAddress: tonTestRecipientAddr,
		SenderAddress:      "0QReleaseWalletPlaceholder",
		Amount:             1,
	}, prov, tonTestPubHex)
	if err != nil {
		t.Fatalf("PreSignTON: %v", err)
	}

	_, wrongPriv, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatalf("generate wrong key: %v", err)
	}
	wrongSig := ed25519.Sign(wrongPriv, unsigned.SigningHash)

	_, err = a.FinalizeTON(unsigned, wrongSig)
	if err == nil {
		t.Fatal("expected a signature-verification error, got nil")
	}
}

func TestFinalizeTON_RejectsNilUnsigned(t *testing.T) {
	a := &Assembler{}
	_, err := a.FinalizeTON(nil, make([]byte, ed25519.SignatureSize))
	if err == nil {
		t.Fatal("expected an error for a nil TONUnsigned, got nil")
	}
}
