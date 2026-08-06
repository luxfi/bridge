// Tests for executeRefundTON — same baseline-collision shape as XRP
// (see refund_driver_xrp_test.go's header): mpcd-single's TON keygen
// reuses the long-lived release wallet's V4R2 contract for the
// per-swap deposit wallet, so Swap.TONSourceBaselineNanotons caps a
// refund to the delta above the swap-create snapshot instead of
// sweeping the operator's standing liquidity.
package main

import (
	"context"
	"crypto/ed25519"
	"encoding/hex"
	"strings"
	"testing"
	"time"

	"github.com/luxfi/bridge/internal/mchain"
	"github.com/luxfi/bridge/internal/txassembler"
	"github.com/xssnick/tonutils-go/ton/wallet"
)

// tonRealSigner produces an actual ed25519 signature over whatever hex
// message it's asked to sign, using the deposit wallet's real private
// key. Required (unlike the fixed-string rdFakeSigner used for EVM/BTC/
// XRP refund tests) because FinalizeTON -> ton.FinalizeSignedExternalMessage
// cryptographically verifies the signature against the deposit pubkey +
// cell hash before accepting it -- a fixed dummy signature is rejected,
// not silently accepted.
type tonRealSigner struct {
	priv ed25519.PrivateKey
}

func (s *tonRealSigner) SignForWallet(_ context.Context, _, msgHex string) (*mchain.SignResult, error) {
	msg, err := hex.DecodeString(msgHex)
	if err != nil {
		return nil, err
	}
	sig := ed25519.Sign(s.priv, msg)
	return &mchain.SignResult{Signature: hex.EncodeToString(sig), SessionID: "ton-refund-test"}, nil
}

type fakeTONRefundProvider struct {
	active       bool
	seqno        uint32
	balanceNano  uint64
}

func (f *fakeTONRefundProvider) IsContractActive(_ context.Context, _ string) (bool, error) {
	return f.active, nil
}
func (f *fakeTONRefundProvider) GetSeqno(_ context.Context, _ string) (uint32, error) {
	return f.seqno, nil
}
func (f *fakeTONRefundProvider) GetBalanceNano(_ context.Context, _ string) (uint64, error) {
	return f.balanceNano, nil
}
func (f *fakeTONRefundProvider) BroadcastBoC(_ context.Context, _ []byte) (string, error) {
	return "", nil // unused -- broadcast goes through the driver's Broadcaster, not the provider
}

// tonRefundPubKeyHex / tonDepositAddr / tonSenderAddr: a real ed25519
// pubkey (BuildUnsignedTransfer validates the length) and real V4R2
// addresses (address.ParseAddr must accept them) derived the same way
// internal/ton/messaging_test.go does. depositAddr itself is only used
// as an opaque provider-lookup key -- BuildUnsignedTransfer derives
// the actual wallet address from the pubkey, not this string.
var (
	tonRefundPubKey, tonRefundPrivKey, _ = ed25519.GenerateKey(nil)
	tonRefundPubKeyHex                   = hex.EncodeToString(tonRefundPubKey)
	tonDepositAddr                       = "0QDepositWalletPlaceholder"
	tonSenderAddr                        = mustTONAddr()
)

func mustTONAddr() string {
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

func newTONRefundRig(t *testing.T, prov *fakeTONRefundProvider) (*RefundDriver, *InMemoryStore, *rdFakeBroadcaster) {
	t.Helper()
	store := NewInMemoryStore()
	signer := &tonRealSigner{priv: tonRefundPrivKey}
	bc := &rdFakeBroadcaster{hash: "TONREFUNDTXHASH"}
	asm := txassembler.New(nil)
	d := NewRefundDriver(store, signer, bc, asm, time.Hour, 60*time.Second, nil, nil)
	d.SetTONProvider(prov)
	d.perBalanceTimeout = 2 * time.Second
	d.perSignTimeout = 2 * time.Second
	d.perBroadcastTimeout = 2 * time.Second
	return d, store, bc
}

func seedBlockedTONSwap(t *testing.T, store *InMemoryStore, mutate func(*Swap)) *Swap {
	t.Helper()
	sw := &Swap{
		Status:         SwapStatusBroadcasting,
		SourceNetwork:  "TON_TESTNET",
		DepositAddress: "wallet-ton###" + tonDepositAddr,
		DepositPubKey:  tonRefundPubKeyHex,
		Sender:         tonSenderAddr,
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

func TestRefund_TON_HappyPath_LegacyNoBaseline(t *testing.T) {
	prov := &fakeTONRefundProvider{active: true, seqno: 3, balanceNano: 5_000_000_000} // 5 TON
	d, store, bc := newTONRefundRig(t, prov)
	sw := seedBlockedTONSwap(t, store, nil)

	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusRefunded {
		t.Fatalf("status = %q, want refunded (LastError=%q)", got.Status, got.LastError)
	}
	if got.RefundTxHash != "TONREFUNDTXHASH" {
		t.Errorf("RefundTxHash = %q, want TONREFUNDTXHASH", got.RefundTxHash)
	}
	if bc.calls.Load() != 1 {
		t.Errorf("expected 1 broadcast, got %d", bc.calls.Load())
	}
	last := bc.last.Load().(string)
	if !strings.HasPrefix(last, "TON_TESTNET|") {
		t.Errorf("broadcast on wrong network: %q", last)
	}
}

func TestRefund_TON_NoProviderConfigured_RollsBack(t *testing.T) {
	store := NewInMemoryStore()
	signer := &rdFakeSigner{sig: strings.Repeat("11", 64)}
	bc := &rdFakeBroadcaster{hash: "unused"}
	asm := txassembler.New(nil)
	d := NewRefundDriver(store, signer, bc, asm, time.Hour, 60*time.Second, nil, nil)
	sw := seedBlockedTONSwap(t, store, nil)

	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBroadcasting {
		t.Fatalf("status = %q, want bridge_transfer_pending_broadcasting (rolled back)", got.Status)
	}
	if bc.calls.Load() != 0 {
		t.Error("broadcaster must not be called when no TON provider is configured")
	}
}

func TestRefund_TON_MissingDepositPubKey_RollsBack(t *testing.T) {
	prov := &fakeTONRefundProvider{active: true, seqno: 1, balanceNano: 5_000_000_000}
	d, store, bc := newTONRefundRig(t, prov)
	sw := seedBlockedTONSwap(t, store, func(s *Swap) { s.DepositPubKey = "" })

	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBroadcasting {
		t.Fatalf("status = %q, want bridge_transfer_pending_broadcasting (rolled back)", got.Status)
	}
	if bc.calls.Load() != 0 {
		t.Error("broadcaster must not be called without a DepositPubKey")
	}
}

func TestRefund_TON_BalanceBelowReserve_StaysStuckNoBroadcast(t *testing.T) {
	prov := &fakeTONRefundProvider{active: true, seqno: 1, balanceNano: 1000} // way below the fee reserve
	d, store, bc := newTONRefundRig(t, prov)
	sw := seedBlockedTONSwap(t, store, nil)

	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusRefunding {
		t.Errorf("status = %q, want refunding (operator triage)", got.Status)
	}
	if !strings.Contains(strings.ToLower(got.LastError), "refund impossible") {
		t.Errorf("LastError should explain impossibility, got %q", got.LastError)
	}
	if bc.calls.Load() != 0 {
		t.Error("broadcaster must not be called when the sweep is impossible")
	}
}

// TestRefund_TON_BaselineDeltaBelowReserve_ImpossibleDespiteLargeBalance
// mirrors the XRP over-refund regression guard: a wallet holding 5 TON
// (far more than the fee reserve) must still refuse to refund if the
// per-swap delta above baseline is too small -- proving the cap is
// actually applied, not merely present in the code.
func TestRefund_TON_BaselineDeltaBelowReserve_ImpossibleDespiteLargeBalance(t *testing.T) {
	const baselineNano = 5_000_000_000 // 5 TON standing release-wallet liquidity
	const currentNano = 5_000_000_500  // +500 nanoTON deposited -- far below the fee reserve
	prov := &fakeTONRefundProvider{active: true, seqno: 1, balanceNano: currentNano}
	d, store, bc := newTONRefundRig(t, prov)
	sw := seedBlockedTONSwap(t, store, func(s *Swap) {
		s.TONSourceBaselineNanotons = baselineNano
	})

	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusRefunding {
		t.Fatalf("status = %q, want refunding (impossible-but-not-rolled-back)", got.Status)
	}
	if bc.calls.Load() != 0 {
		t.Error("broadcaster must NOT be called -- this is exactly the over-refund the baseline cap exists to prevent")
	}
}

func TestRefund_TON_BaselineCapsRefundToDelta(t *testing.T) {
	const baselineNano = 5_000_000_000  // 5 TON standing liquidity
	const currentNano = 5_500_000_000   // +0.5 TON the user actually deposited
	prov := &fakeTONRefundProvider{active: true, seqno: 9, balanceNano: currentNano}
	d, store, bc := newTONRefundRig(t, prov)
	sw := seedBlockedTONSwap(t, store, func(s *Swap) {
		s.TONSourceBaselineNanotons = baselineNano
	})

	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusRefunded {
		t.Fatalf("status = %q, want refunded (LastError=%q)", got.Status, got.LastError)
	}
	if bc.calls.Load() != 1 {
		t.Fatalf("expected exactly 1 broadcast, got %d", bc.calls.Load())
	}
}
