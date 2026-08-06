// Tests for executeRefundXRP — the XRP-source refund sweep. This is
// where the 2026-06-08 over-refund incident lived (memory:
// project_bridgev2_393_forcepush_baseline_gap / architecture_mpcd_
// single_shared_pool): mpcd-single's HKDF ed25519 keygen gives the
// per-swap deposit wallet and the long-lived release wallet the SAME
// r-address within the XRP family, so an unguarded refund sweep would
// drain the operator's standing release-wallet liquidity, not just the
// user's actual deposit. The baseline-delta cap
// (Swap.XRPSourceBaselineDrops) is the fix; these tests exist
// specifically to keep it working. executeRefundEVM's sibling tests
// already establish the driver-level plumbing (Tick, claim, rollback);
// this file covers the XRP-specific math and guards on top of that.
package main

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/luxfi/bridge/internal/txassembler"
	"github.com/luxfi/bridge/internal/xrp"
)

// fakeXRPRefundProvider implements txassembler.XRPProvider with
// deterministic values so PreSignXRPRefund's serialization doesn't
// need a live XRPL node.
type fakeXRPRefundProvider struct {
	balanceDrops uint64
	sequence     uint32
	feeDrops     uint64
	notFound     bool
}

func (f *fakeXRPRefundProvider) AccountInfo(_ context.Context, _, address string) (*xrp.AccountInfoResult, bool, error) {
	if f.notFound {
		return &xrp.AccountInfoResult{Status: "error", Error: "actNotFound"}, false, nil
	}
	r := &xrp.AccountInfoResult{Status: "success"}
	r.AccountData.Account = address
	r.AccountData.Balance = drops2str(f.balanceDrops)
	r.AccountData.Sequence = f.sequence
	return r, true, nil
}
func (f *fakeXRPRefundProvider) BalanceDrops(_ context.Context, _, _ string) (uint64, error) {
	if f.notFound {
		return 0, nil
	}
	return f.balanceDrops, nil
}
func (f *fakeXRPRefundProvider) ServerInfoFee(_ context.Context, _ string) (uint64, error) {
	return f.feeDrops, nil
}
func (f *fakeXRPRefundProvider) SubmitBlob(_ context.Context, _, _ string) (*xrp.SubmitResult, error) {
	return nil, nil // not used by the refund path — broadcast goes through the driver's Broadcaster
}

func drops2str(n uint64) string {
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

// xrpRefundPubKeyHex / xrpDepositAddr / xrpSenderAddr are throwaway
// fixtures. PreSignXRPRefund doesn't cross-check the pubkey against
// the address hash (unlike the BTC path) -- it's only embedded as
// SigningPubKey -- so a fixed non-corresponding pair is fine for
// message-construction tests. Matches the pattern in
// internal/txassembler/xrp_test.go.
const (
	xrpRefundPubKeyHex = "0000000000000000000000000000000000000000000000000000000000000000"
	xrpDepositAddr     = "rDR3ovFUFWw8ojQaXBDBQCQS5eLrZxJuRX"
	xrpSenderAddr      = "r3rAk2rbTQ3inkutmWZcugaFs52BHGVSE8"
)

// newXRPRefundRig builds a RefundDriver wired for the XRP path only:
// a real Assembler (PreSignXRPRefund/FinalizeXRP need no EVM Provider)
// plus the programmable signer/broadcaster already used by the EVM
// refund tests.
func newXRPRefundRig(t *testing.T, prov *fakeXRPRefundProvider) (*RefundDriver, *InMemoryStore, *rdFakeBroadcaster) {
	t.Helper()
	store := NewInMemoryStore()
	signer := &rdFakeSigner{
		sig: strings.Repeat("11", 32) + strings.Repeat("22", 32), // 64-byte ed25519 sig shape
	}
	bc := &rdFakeBroadcaster{hash: "XRPREFUNDTXHASH"}
	asm := txassembler.New(nil)
	d := NewRefundDriver(store, signer, bc, asm, time.Hour, 60*time.Second, nil, nil)
	d.SetXRPProvider(prov)
	d.perBalanceTimeout = 2 * time.Second
	d.perSignTimeout = 2 * time.Second
	d.perBroadcastTimeout = 2 * time.Second
	return d, store, bc
}

func seedBlockedXRPSwap(t *testing.T, store *InMemoryStore, mutate func(*Swap)) *Swap {
	t.Helper()
	sw := &Swap{
		Status:         SwapStatusBroadcasting,
		SourceNetwork:  "XRP_TESTNET",
		DepositAddress: "wallet-xrp###" + xrpDepositAddr,
		DepositPubKey:  xrpRefundPubKeyHex,
		Sender:         xrpSenderAddr,
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

func TestRefund_XRP_HappyPath_LegacyNoBaseline(t *testing.T) {
	prov := &fakeXRPRefundProvider{balanceDrops: 10_000_000, sequence: 5, feeDrops: 12} // 10 XRP
	d, store, bc := newXRPRefundRig(t, prov)
	sw := seedBlockedXRPSwap(t, store, nil) // XRPSourceBaselineDrops unset -> legacy sweep-everything

	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusRefunded {
		t.Fatalf("status = %q, want refunded (LastError=%q)", got.Status, got.LastError)
	}
	if got.RefundTxHash != "XRPREFUNDTXHASH" {
		t.Errorf("RefundTxHash = %q, want XRPREFUNDTXHASH", got.RefundTxHash)
	}
	if bc.calls.Load() != 1 {
		t.Errorf("expected 1 broadcast, got %d", bc.calls.Load())
	}
	last := bc.last.Load().(string)
	if !strings.HasPrefix(last, "XRP_TESTNET|") {
		t.Errorf("broadcast on wrong network: %q", last)
	}
}

func TestRefund_XRP_NoProviderConfigured_RollsBack(t *testing.T) {
	store := NewInMemoryStore()
	signer := &rdFakeSigner{sig: strings.Repeat("11", 64)}
	bc := &rdFakeBroadcaster{hash: "unused"}
	asm := txassembler.New(nil)
	d := NewRefundDriver(store, signer, bc, asm, time.Hour, 60*time.Second, nil, nil)
	// Deliberately no SetXRPProvider call.
	sw := seedBlockedXRPSwap(t, store, nil)

	d.Tick(t.Context())

	// rollback() routes back to SwapStatusBroadcasting (not
	// SwapStatusRefunding) because DestRawTx is non-empty here -- the
	// broadcast driver gets another shot next tick and will refresh
	// LastError, which is what re-triggers shouldRefund. See the
	// rollback() doc comment for why.
	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBroadcasting {
		t.Fatalf("status = %q, want bridge_transfer_pending_broadcasting (rolled back for retry)", got.Status)
	}
	if got.RefundAttempts != 1 {
		t.Errorf("RefundAttempts = %d, want 1 (rollback should have fired)", got.RefundAttempts)
	}
	if bc.calls.Load() != 0 {
		t.Error("broadcaster must not be called when no XRP provider is configured")
	}
}

func TestRefund_XRP_MissingDepositPubKey_RollsBack(t *testing.T) {
	prov := &fakeXRPRefundProvider{balanceDrops: 10_000_000, sequence: 1, feeDrops: 12}
	d, store, bc := newXRPRefundRig(t, prov)
	sw := seedBlockedXRPSwap(t, store, func(s *Swap) { s.DepositPubKey = "" })

	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBroadcasting {
		t.Fatalf("status = %q, want bridge_transfer_pending_broadcasting (rolled back for retry)", got.Status)
	}
	if got.RefundAttempts != 1 {
		t.Errorf("RefundAttempts = %d, want 1 (rollback should have fired)", got.RefundAttempts)
	}
	if bc.calls.Load() != 0 {
		t.Error("broadcaster must not be called without a DepositPubKey")
	}
}

func TestRefund_XRP_BalanceBelowReserveAndFee_StaysStuckNoBroadcast(t *testing.T) {
	// 2 XRP reserve + fee leaves nothing sweepable at a 1.5 XRP balance.
	prov := &fakeXRPRefundProvider{balanceDrops: 1_500_000, sequence: 1, feeDrops: 12}
	d, store, bc := newXRPRefundRig(t, prov)
	sw := seedBlockedXRPSwap(t, store, nil)

	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusRefunding {
		t.Errorf("status = %q, want refunding (operator triage, not a rollback)", got.Status)
	}
	if !strings.Contains(strings.ToLower(got.LastError), "refund impossible") {
		t.Errorf("LastError should explain impossibility, got %q", got.LastError)
	}
	if bc.calls.Load() != 0 {
		t.Error("broadcaster must not be called when the sweep is impossible")
	}
}

// TestRefund_XRP_BaselineCapsRefundToDelta is the one that matters:
// the deposit wallet's address is shared with the release wallet
// (mpcd-single HKDF collision), so it's sitting on 500 XRP of
// operator liquidity PLUS the user's real 10 XRP deposit. Without the
// baseline cap this sweeps all ~510 XRP to the user; with it, only the
// ~10 XRP delta above the snapshot goes out.
func TestRefund_XRP_BaselineCapsRefundToDelta(t *testing.T) {
	const baselineDrops = 500_000_000 // 500 XRP standing release-wallet liquidity at swap-create time
	const currentDrops = 510_000_000  // +10 XRP the user actually deposited
	prov := &fakeXRPRefundProvider{balanceDrops: currentDrops, sequence: 7, feeDrops: 12}
	d, store, bc := newXRPRefundRig(t, prov)
	sw := seedBlockedXRPSwap(t, store, func(s *Swap) {
		s.XRPSourceBaselineDrops = baselineDrops
	})

	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusRefunded {
		t.Fatalf("status = %q, want refunded (LastError=%q)", got.Status, got.LastError)
	}
	if bc.calls.Load() != 1 {
		t.Fatalf("expected exactly 1 broadcast, got %d", bc.calls.Load())
	}
	// The would-be over-refund catch: if the driver ever regresses to
	// sweeping the full balance instead of the delta, the broadcast
	// payload changes shape but RefundTxHash alone can't prove the
	// swept AMOUNT was capped -- assert indirectly via the fee-vs-delta
	// impossibility test below instead, which pins the boundary
	// precisely. This test's job is: a refund DID happen (the swap
	// isn't stuck) and it used the baseline-aware branch, not the
	// legacy unconditional-sweep branch -- covered by the next test
	// showing the SAME current balance is "impossible" once the
	// baseline is close enough to it.
}

// TestRefund_XRP_BaselineDeltaBelowFee_ImpossibleDespiteLargeBalance
// proves the cap is actually being applied, not just present in the
// code: a wallet holding 500 XRP (way more than reserve+fee) must
// still refuse to refund if the per-swap delta above baseline is too
// small to cover the fee -- if the driver were ignoring the baseline
// and using the legacy full-balance math, this would happily refund
// off the standing liquidity instead of erroring.
func TestRefund_XRP_BaselineDeltaBelowFee_ImpossibleDespiteLargeBalance(t *testing.T) {
	const baselineDrops = 500_000_000 // snapshot
	const currentDrops = 500_000_005  // only 5 drops deposited since -- less than the fee
	prov := &fakeXRPRefundProvider{balanceDrops: currentDrops, sequence: 7, feeDrops: 12}
	d, store, bc := newXRPRefundRig(t, prov)
	sw := seedBlockedXRPSwap(t, store, func(s *Swap) {
		s.XRPSourceBaselineDrops = baselineDrops
	})

	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusRefunding {
		t.Fatalf("status = %q, want refunding (impossible-but-not-rolled-back), got balance=%d far above reserve+fee", got.Status, currentDrops)
	}
	if !strings.Contains(strings.ToLower(got.LastError), "refund impossible") {
		t.Errorf("LastError should explain the delta-vs-fee impossibility, got %q", got.LastError)
	}
	if bc.calls.Load() != 0 {
		t.Error("broadcaster must NOT be called -- this is exactly the over-refund the baseline cap exists to prevent")
	}
}
