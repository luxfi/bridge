// Tests for executeRefundBTC. Unlike the XRP/TON refund paths, BTC's
// PreSignBTCRefund cross-checks the deposit pubkey's hash160 against
// the deposit address (btcHash160Match) -- so this file reuses the
// exact known-good pubkey/address pair already established in
// internal/txassembler/btc_test.go rather than inventing a new one
// that would fail that check. BTC also has no per-swap baseline-cap
// guard (unlike XRP/TON): BTC deposit and release wallets don't share
// an address under mpcd's ECDSA keygen, so the collision this class of
// bug comes from doesn't apply here -- see architecture_mpcd_single_
// shared_pool memory.
package main

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/luxfi/bridge/internal/btc"
	"github.com/luxfi/bridge/internal/txassembler"
)

// Known-good matching pubkey/P2PKH-address pair, copied verbatim from
// internal/txassembler/btc_test.go's testDepositPubKeyHex/
// testDepositAddress (unexported there, so duplicated by value rather
// than imported).
const (
	btcRefundDepositPubKeyHex = "03c89fcf91f43a4169a748151bd8b5d328c59844fc2416d564dfff1a6e773064d9"
	btcRefundDepositAddr      = "mqEJykWt9hchcFAzWA17usSuGWjuzahxr8"
	btcRefundRecipientAddr    = "tb1q20uepfp8mvj7tckntaajcrsuvsjwlealv9knsd"
)

type fakeBTCRefundProvider struct {
	utxos []btc.UTXO
	fee   uint64
}

func (f *fakeBTCRefundProvider) ListUTXOs(_ context.Context, _, _ string) ([]btc.UTXO, error) {
	return f.utxos, nil
}
func (f *fakeBTCRefundProvider) RecommendedFees(_ context.Context, _ string) (*btc.FeeRates, error) {
	return &btc.FeeRates{HalfHour: f.fee}, nil
}
func (f *fakeBTCRefundProvider) Broadcast(_ context.Context, _, _ string) (string, error) {
	return "", nil // unused -- the refund driver broadcasts via its own Broadcaster
}

func confirmedBTCUTXO(txid string, vout uint32, value uint64) btc.UTXO {
	u := btc.UTXO{TxID: txid, Vout: vout, Value: value}
	u.Status.Confirmed = true
	return u
}

// btcFixedSig65 is a syntactically-valid (65-byte r||s||v hex) but not
// cryptographically real signature. Unlike TON's FinalizeTON, BTC's
// Finalize does not verify the signature (see
// internal/btc/payment_test.go's TestPayment_FinalizeNonEmpty) -- it
// only wires r||s into a DER container -- so a fixed value is fine
// here the same way it was for the XRP refund tests.
const btcFixedSig65 = "1111111111111111111111111111111111111111111111111111111111111111" +
	"2222222222222222222222222222222222222222222222222222222222222222" +
	"00"

func newBTCRefundRig(t *testing.T, prov *fakeBTCRefundProvider) (*RefundDriver, *InMemoryStore, *rdFakeBroadcaster) {
	t.Helper()
	store := NewInMemoryStore()
	signer := &rdFakeSigner{sig: btcFixedSig65}
	bc := &rdFakeBroadcaster{hash: strings.Repeat("ab", 32)}
	asm := txassembler.New(nil)
	d := NewRefundDriver(store, signer, bc, asm, time.Hour, 60*time.Second, nil, nil)
	d.SetBTCProvider(prov)
	d.perBalanceTimeout = 2 * time.Second
	d.perSignTimeout = 2 * time.Second
	d.perBroadcastTimeout = 2 * time.Second
	return d, store, bc
}

func seedBlockedBTCSwap(t *testing.T, store *InMemoryStore, mutate func(*Swap)) *Swap {
	t.Helper()
	sw := &Swap{
		Status:         SwapStatusBroadcasting,
		SourceNetwork:  "BITCOIN_TESTNET",
		DepositAddress: "wallet-btc###" + btcRefundDepositAddr,
		DepositPubKey:  btcRefundDepositPubKeyHex,
		Sender:         btcRefundRecipientAddr,
		LastError:      "Insufficient funds in release address — fund the MPC address with destination-chain gas tokens",
		LastErrorAt:    time.Now().UTC().Add(-2 * time.Minute),
		DestRawTx:      "rawtx-placeholder",
	}
	if mutate != nil {
		mutate(sw)
	}
	if err := store.Create(t.Context(), sw); err != nil {
		t.Fatalf("seed: %v", err)
	}
	return sw
}

func TestRefund_BTC_HappyPath(t *testing.T) {
	prov := &fakeBTCRefundProvider{
		utxos: []btc.UTXO{confirmedBTCUTXO(strings.Repeat("aa", 32), 0, 50_000)},
		fee:   1,
	}
	d, store, bc := newBTCRefundRig(t, prov)
	sw := seedBlockedBTCSwap(t, store, nil)

	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusRefunded {
		t.Fatalf("status = %q, want refunded (LastError=%q)", got.Status, got.LastError)
	}
	if bc.calls.Load() != 1 {
		t.Errorf("expected 1 broadcast, got %d", bc.calls.Load())
	}
	last := bc.last.Load().(string)
	if !strings.HasPrefix(last, "BITCOIN_TESTNET|") {
		t.Errorf("broadcast on wrong network: %q", last)
	}
}

func TestRefund_BTC_NoProviderConfigured_RollsBack(t *testing.T) {
	store := NewInMemoryStore()
	signer := &rdFakeSigner{sig: btcFixedSig65}
	bc := &rdFakeBroadcaster{hash: "unused"}
	asm := txassembler.New(nil)
	d := NewRefundDriver(store, signer, bc, asm, time.Hour, 60*time.Second, nil, nil)
	sw := seedBlockedBTCSwap(t, store, nil)

	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBroadcasting {
		t.Fatalf("status = %q, want bridge_transfer_pending_broadcasting (rolled back)", got.Status)
	}
	if bc.calls.Load() != 0 {
		t.Error("broadcaster must not be called when no BTC provider is configured")
	}
}

func TestRefund_BTC_MissingDepositPubKey_RollsBack(t *testing.T) {
	prov := &fakeBTCRefundProvider{utxos: []btc.UTXO{confirmedBTCUTXO(strings.Repeat("aa", 32), 0, 50_000)}, fee: 1}
	d, store, bc := newBTCRefundRig(t, prov)
	sw := seedBlockedBTCSwap(t, store, func(s *Swap) { s.DepositPubKey = "" })

	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBroadcasting {
		t.Fatalf("status = %q, want bridge_transfer_pending_broadcasting (rolled back)", got.Status)
	}
	if bc.calls.Load() != 0 {
		t.Error("broadcaster must not be called without a DepositPubKey")
	}
}

// TestRefund_BTC_PubKeyMismatchRejected pins the check BTC's refund
// path has that XRP/TON's don't: the deposit pubkey's hash160 must
// match the deposit address, or PreSignBTCRefund refuses outright.
// A wrong pubkey here (e.g. wired from the wrong wallet record) must
// fail loudly, not build a tx that could never actually spend the
// UTXO it claims to.
func TestRefund_BTC_PubKeyMismatchRejected(t *testing.T) {
	prov := &fakeBTCRefundProvider{utxos: []btc.UTXO{confirmedBTCUTXO(strings.Repeat("aa", 32), 0, 50_000)}, fee: 1}
	d, store, bc := newBTCRefundRig(t, prov)
	// A syntactically valid but non-matching compressed pubkey.
	sw := seedBlockedBTCSwap(t, store, func(s *Swap) {
		s.DepositPubKey = "02" + strings.Repeat("11", 32)
	})

	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBroadcasting {
		t.Fatalf("status = %q, want bridge_transfer_pending_broadcasting (rolled back on pubkey/address mismatch)", got.Status)
	}
	if bc.calls.Load() != 0 {
		t.Error("broadcaster must not be called when the pubkey doesn't match the deposit address")
	}
}

func TestRefund_BTC_NoUTXOs_StaysStuckNoBroadcast(t *testing.T) {
	prov := &fakeBTCRefundProvider{utxos: nil, fee: 1}
	d, store, bc := newBTCRefundRig(t, prov)
	sw := seedBlockedBTCSwap(t, store, nil)

	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBroadcasting {
		t.Fatalf("status = %q, want bridge_transfer_pending_broadcasting (rolled back -- PreSignBTCRefund itself errors)", got.Status)
	}
	if bc.calls.Load() != 0 {
		t.Error("broadcaster must not be called with no UTXOs")
	}
}
