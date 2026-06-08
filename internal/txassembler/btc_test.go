package txassembler

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/luxfi/bridge/internal/btc"
)

// ───────────────────────────────────────────────────────────────────
// Mock BTCProvider
// ───────────────────────────────────────────────────────────────────

type fakeBTCProvider struct {
	utxos    map[string][]btc.UTXO
	fees     *btc.FeeRates
	listErr  error
	feesErr  error
	bcastErr error
	bcastOut string
}

func (f *fakeBTCProvider) ListUTXOs(_ context.Context, _ string, addr string) ([]btc.UTXO, error) {
	if f.listErr != nil {
		return nil, f.listErr
	}
	return f.utxos[addr], nil
}

func (f *fakeBTCProvider) RecommendedFees(_ context.Context, _ string) (*btc.FeeRates, error) {
	if f.feesErr != nil {
		return nil, f.feesErr
	}
	return f.fees, nil
}

func (f *fakeBTCProvider) Broadcast(_ context.Context, _ string, _ string) (string, error) {
	if f.bcastErr != nil {
		return "", f.bcastErr
	}
	return f.bcastOut, nil
}

// ───────────────────────────────────────────────────────────────────
// Shared fixtures
// ───────────────────────────────────────────────────────────────────

// Deposit wallet fixture: the testnet P2PKH address whose pubkey we
// already verified (BTC release wallet `mqEJ…xr8` from the live smoke).
const (
	testDepositPubKeyHex = "03c89fcf91f43a4169a748151bd8b5d328c59844fc2416d564dfff1a6e773064d9"
	testDepositAddress   = "mqEJykWt9hchcFAzWA17usSuGWjuzahxr8"
	testRecipientAddr    = "tb1q20uepfp8mvj7tckntaajcrsuvsjwlealv9knsd"
)

func newTestAssembler() *Assembler {
	return &Assembler{}
}

func newProviderWith(utxos []btc.UTXO, halfHourFee uint64) *fakeBTCProvider {
	return &fakeBTCProvider{
		utxos: map[string][]btc.UTXO{
			testDepositAddress: utxos,
		},
		fees: &btc.FeeRates{HalfHour: halfHourFee},
	}
}

func confirmedUTXO(txid string, vout uint32, value uint64) btc.UTXO {
	u := btc.UTXO{TxID: txid, Vout: vout, Value: value}
	u.Status.Confirmed = true
	return u
}

// ───────────────────────────────────────────────────────────────────
// PreSignBTCRefund
// ───────────────────────────────────────────────────────────────────

func TestPreSignBTCRefund_NoUTXOs(t *testing.T) {
	a := newTestAssembler()
	p := newProviderWith(nil, 1)
	_, err := a.PreSignBTCRefund(context.Background(),
		"BITCOIN_TESTNET", testDepositPubKeyHex, testDepositAddress, testRecipientAddr, p)
	if err == nil || !strings.Contains(err.Error(), "no confirmed UTXOs") {
		t.Fatalf("expected no-UTXOs error, got %v", err)
	}
}

func TestPreSignBTCRefund_BelowDustPlusFee(t *testing.T) {
	a := newTestAssembler()
	// 700-sat UTXO: fee is min 250 sats, dust threshold 546 — 700 < 250+546.
	p := newProviderWith([]btc.UTXO{
		confirmedUTXO("0000000000000000000000000000000000000000000000000000000000000001", 0, 700),
	}, 1)
	_, err := a.PreSignBTCRefund(context.Background(),
		"BITCOIN_TESTNET", testDepositPubKeyHex, testDepositAddress, testRecipientAddr, p)
	if err == nil || !strings.Contains(err.Error(), "refund value would be dust") {
		t.Fatalf("expected dust error, got %v", err)
	}
}

func TestPreSignBTCRefund_SweepMath(t *testing.T) {
	a := newTestAssembler()
	// 10000-sat UTXO at fee rate 1 sat/vB → 200-byte tx → 200 sat fee
	// (but floor at 250). Sweep = 10000 - 250 = 9750.
	p := newProviderWith([]btc.UTXO{
		confirmedUTXO("aaaa000000000000000000000000000000000000000000000000000000000001", 7, 10_000),
	}, 1)
	u, err := a.PreSignBTCRefund(context.Background(),
		"BITCOIN_TESTNET", testDepositPubKeyHex, testDepositAddress, testRecipientAddr, p)
	if err != nil {
		t.Fatalf("PreSignBTCRefund: %v", err)
	}
	if u.FeeSats != 250 {
		t.Fatalf("FeeSats = %d, want 250 (min-relay floor)", u.FeeSats)
	}
	if u.RecipientSats != 10_000-250 {
		t.Fatalf("RecipientSats = %d, want %d", u.RecipientSats, 10_000-250)
	}
	if u.ChangeSats != 0 {
		t.Fatalf("ChangeSats = %d, want 0 (sweep, no change)", u.ChangeSats)
	}
	if u.Recipient != testRecipientAddr {
		t.Fatalf("Recipient = %q, want %q", u.Recipient, testRecipientAddr)
	}
	var zero [32]byte
	if u.SigHash == zero {
		t.Fatal("SigHash all zeros — preimage missing")
	}
}

func TestPreSignBTCRefund_FeeScalesWithRate(t *testing.T) {
	a := newTestAssembler()
	// 100_000-sat UTXO at 5 sat/vB → 200 * 5 = 1000 sat fee.
	p := newProviderWith([]btc.UTXO{
		confirmedUTXO("ee00000000000000000000000000000000000000000000000000000000000001", 0, 100_000),
	}, 5)
	u, err := a.PreSignBTCRefund(context.Background(),
		"BITCOIN_TESTNET", testDepositPubKeyHex, testDepositAddress, testRecipientAddr, p)
	if err != nil {
		t.Fatalf("PreSignBTCRefund: %v", err)
	}
	if u.FeeSats != 1000 {
		t.Fatalf("FeeSats = %d, want 1000 (200 vsize × 5 sat/vB)", u.FeeSats)
	}
	if u.RecipientSats != 99_000 {
		t.Fatalf("RecipientSats = %d, want 99000", u.RecipientSats)
	}
}

func TestPreSignBTCRefund_RejectsMismatchedPubkey(t *testing.T) {
	a := newTestAssembler()
	p := newProviderWith([]btc.UTXO{
		confirmedUTXO("aabb000000000000000000000000000000000000000000000000000000000001", 0, 10_000),
	}, 1)
	// A valid compressed pubkey, but NOT the one matching `mqEJ…xr8`.
	wrongPub := "03f5873b55b5da490d7fd4f4f4080a2d36c9d48f1f72ad7f82af809f1ff0795b51"
	_, err := a.PreSignBTCRefund(context.Background(),
		"BITCOIN_TESTNET", wrongPub, testDepositAddress, testRecipientAddr, p)
	if err == nil || !strings.Contains(err.Error(), "hash160 does not match") {
		t.Fatalf("expected hash160 mismatch error, got %v", err)
	}
}

func TestPreSignBTCRefund_NoProvider(t *testing.T) {
	a := newTestAssembler()
	_, err := a.PreSignBTCRefund(context.Background(),
		"BITCOIN_TESTNET", testDepositPubKeyHex, testDepositAddress, testRecipientAddr, nil)
	if err == nil || !strings.Contains(err.Error(), "provider required") {
		t.Fatalf("expected provider-required error, got %v", err)
	}
}

func TestPreSignBTCRefund_PropagatesListUTXOError(t *testing.T) {
	a := newTestAssembler()
	wantErr := errors.New("upstream 503")
	p := &fakeBTCProvider{listErr: wantErr, fees: &btc.FeeRates{HalfHour: 1}}
	_, err := a.PreSignBTCRefund(context.Background(),
		"BITCOIN_TESTNET", testDepositPubKeyHex, testDepositAddress, testRecipientAddr, p)
	if err == nil || !errors.Is(err, wantErr) {
		t.Fatalf("expected wrapped upstream error, got %v", err)
	}
}

func TestPreSignBTCRefund_UnknownNetwork(t *testing.T) {
	a := newTestAssembler()
	p := newProviderWith([]btc.UTXO{
		confirmedUTXO("0000000000000000000000000000000000000000000000000000000000000001", 0, 10_000),
	}, 1)
	_, err := a.PreSignBTCRefund(context.Background(),
		"MARS_MAINNET", testDepositPubKeyHex, testDepositAddress, testRecipientAddr, p)
	if err == nil || !strings.Contains(err.Error(), "unknown BTC network") {
		t.Fatalf("expected unknown-network error, got %v", err)
	}
}
