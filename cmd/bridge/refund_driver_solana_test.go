// Tests for executeRefundSolana. Same baseline-collision shape as
// XRP/TON (see refund_driver_xrp_test.go's header) -- mpcd-single's
// Solana keygen reuses the release wallet's pubkey for the per-swap
// deposit wallet, so Swap.SOLSourceBaselineLamports caps the refund to
// the delta above the swap-create snapshot. fetchSolanaBalance itself
// already has dedicated tests in refund_driver_test.go; this file
// covers the pipeline built on top of it.
package main

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/luxfi/bridge/internal/solanarpc"
	"github.com/luxfi/bridge/internal/txassembler"
)

type fakeSolanaRefundProvider struct{}

func (f *fakeSolanaRefundProvider) GetLatestBlockhash(_ context.Context) (*solanarpc.LatestBlockhash, error) {
	return &solanarpc.LatestBlockhash{Blockhash: solRefundDepositAddr, LastValidBlockHeight: 1000}, nil
}

// solRefundDepositAddr / solRefundRecipientAddr: valid base58-encoded
// 32-byte pubkeys, copied by value from internal/txassembler/solana_test.go's
// releasePubkey/recipientPK (unexported there). decodePubkey doesn't
// cross-check these against anything else (unlike BTC's hash160
// match), so any valid base58 pair works.
const (
	solRefundDepositAddr   = "DRpbCBMxVnDK7maPM5tGv6MvB3v1sRMC86PZ8okm21hy"
	solRefundRecipientAddr = "Hk5h7Cf68HrLqZj3PaaT9KQpgr1mEZQ5oG2cxQUEr5pa"
)

func balanceRPCServer(t *testing.T, lamports uint64) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0", "id": 1,
			"result": map[string]any{"value": lamports},
		})
	}))
	t.Cleanup(srv.Close)
	return srv
}

func newSolanaRefundRig(t *testing.T, lamports uint64) (*RefundDriver, *InMemoryStore, *rdFakeBroadcaster) {
	t.Helper()
	store := NewInMemoryStore()
	signer := &rdFakeSigner{sig: strings.Repeat("11", 32) + strings.Repeat("22", 32)} // 64-byte ed25519 shape; FinalizeSolana doesn't verify
	bc := &rdFakeBroadcaster{hash: strings.Repeat("s", 44)}
	asm := txassembler.New(nil)
	balSrv := balanceRPCServer(t, lamports)
	d := NewRefundDriver(store, signer, bc, asm, time.Hour, 60*time.Second,
		map[string]string{"SOLANA_DEVNET": balSrv.URL}, nil)
	d.SetSolanaProvider(&fakeSolanaRefundProvider{})
	d.perBalanceTimeout = 2 * time.Second
	d.perSignTimeout = 2 * time.Second
	d.perBroadcastTimeout = 2 * time.Second
	return d, store, bc
}

func seedBlockedSolanaSwap(t *testing.T, store *InMemoryStore, mutate func(*Swap)) *Swap {
	t.Helper()
	sw := &Swap{
		Status:         SwapStatusBroadcasting,
		SourceNetwork:  "SOLANA_DEVNET",
		DepositAddress: "wallet-sol###" + solRefundDepositAddr,
		Sender:         solRefundRecipientAddr,
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

func TestRefund_Solana_HappyPath_LegacyNoBaseline(t *testing.T) {
	d, store, bc := newSolanaRefundRig(t, 2_000_000_000) // 2 SOL
	sw := seedBlockedSolanaSwap(t, store, nil)

	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusRefunded {
		t.Fatalf("status = %q, want refunded (LastError=%q)", got.Status, got.LastError)
	}
	if bc.calls.Load() != 1 {
		t.Errorf("expected 1 broadcast, got %d", bc.calls.Load())
	}
	last := bc.last.Load().(string)
	if !strings.HasPrefix(last, "SOLANA_DEVNET|") {
		t.Errorf("broadcast on wrong network: %q", last)
	}
}

func TestRefund_Solana_NoProviderConfigured_RollsBack(t *testing.T) {
	store := NewInMemoryStore()
	signer := &rdFakeSigner{sig: strings.Repeat("11", 64)}
	bc := &rdFakeBroadcaster{hash: "unused"}
	asm := txassembler.New(nil)
	balSrv := balanceRPCServer(t, 2_000_000_000)
	d := NewRefundDriver(store, signer, bc, asm, time.Hour, 60*time.Second,
		map[string]string{"SOLANA_DEVNET": balSrv.URL}, nil)
	sw := seedBlockedSolanaSwap(t, store, nil)

	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBroadcasting {
		t.Fatalf("status = %q, want bridge_transfer_pending_broadcasting (rolled back)", got.Status)
	}
	if bc.calls.Load() != 0 {
		t.Error("broadcaster must not be called when no Solana provider is configured")
	}
}

func TestRefund_Solana_BalanceBelowFee_StaysStuckNoBroadcast(t *testing.T) {
	d, store, bc := newSolanaRefundRig(t, 1000) // way below the signature fee
	sw := seedBlockedSolanaSwap(t, store, nil)

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

// TestRefund_Solana_BaselineDeltaBelowFee_ImpossibleDespiteLargeBalance
// mirrors the XRP/TON over-refund regression guards: a wallet holding
// 2 SOL (far more than the signature fee) must still refuse to refund
// if the per-swap delta above baseline can't cover the fee, proving
// the cap is actually applied.
func TestRefund_Solana_BaselineDeltaBelowFee_ImpossibleDespiteLargeBalance(t *testing.T) {
	const baselineLamports = 2_000_000_000
	const currentLamports = 2_000_000_100 // +100 lamports deposited -- far below the 5000-lamport fee
	d, store, bc := newSolanaRefundRig(t, currentLamports)
	sw := seedBlockedSolanaSwap(t, store, func(s *Swap) {
		s.SOLSourceBaselineLamports = baselineLamports
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

// TestRefund_Solana_BaselineCapsRefundToDelta proves the actual SWEPT
// AMOUNT is capped to the delta, not merely that a refund happened.
// Captures the exact message the driver asked to be signed and
// compares it against the real assembler's output for the correct
// (delta) amount vs. the wrong (legacy full-balance) amount -- mirrors
// TestRefund_XRP_BaselineCapsRefundToDelta's approach; see that test's
// comment for why a status/broadcast-count-only check isn't sufficient.
func TestRefund_Solana_BaselineCapsRefundToDelta(t *testing.T) {
	const baselineLamports = 2_000_000_000 // 2 SOL standing release-wallet liquidity
	const currentLamports = 2_100_000_000  // +0.1 SOL the user actually deposited

	store := NewInMemoryStore()
	signer := &rdFakeSigner{sig: strings.Repeat("11", 32) + strings.Repeat("22", 32)}
	bc := &rdFakeBroadcaster{hash: strings.Repeat("s", 44)}
	asm := txassembler.New(nil)
	balSrv := balanceRPCServer(t, currentLamports)
	d := NewRefundDriver(store, signer, bc, asm, time.Hour, 60*time.Second,
		map[string]string{"SOLANA_DEVNET": balSrv.URL}, nil)
	prov := &fakeSolanaRefundProvider{}
	d.SetSolanaProvider(prov)
	d.perBalanceTimeout = 2 * time.Second
	d.perSignTimeout = 2 * time.Second
	d.perBroadcastTimeout = 2 * time.Second

	sw := seedBlockedSolanaSwap(t, store, func(s *Swap) {
		s.SOLSourceBaselineLamports = baselineLamports
	})

	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusRefunded {
		t.Fatalf("status = %q, want refunded (LastError=%q)", got.Status, got.LastError)
	}
	if bc.calls.Load() != 1 {
		t.Fatalf("expected exactly 1 broadcast, got %d", bc.calls.Load())
	}

	actualMsgHex, _ := signer.lastMsgHex.Load().(string)
	if actualMsgHex == "" {
		t.Fatal("signer was never asked to sign anything")
	}

	reconstruct := func(lamports uint64) string {
		t.Helper()
		u, err := asm.PreSignSolanaRefund(t.Context(), "SOLANA_DEVNET", solRefundDepositAddr, solRefundRecipientAddr, lamports, prov)
		if err != nil {
			t.Fatalf("reconstruct PreSignSolanaRefund(%d): %v", lamports, err)
		}
		return hex.EncodeToString(u.Message)
	}

	correctDelta := (currentLamports - baselineLamports) - txassembler.SolanaSignatureFeeLamports
	buggyFullSweep := currentLamports - txassembler.SolanaSignatureFeeLamports

	wantHex := reconstruct(correctDelta)
	wrongHex := reconstruct(buggyFullSweep)
	if wantHex == wrongHex {
		t.Fatal("test fixture bug: correct-delta and buggy-full-sweep amounts produced the same signing bytes")
	}
	if actualMsgHex != wantHex {
		if actualMsgHex == wrongHex {
			t.Fatalf("driver signed the LEGACY FULL-SWEEP amount (%d lamports) instead of the baseline-capped delta (%d lamports) -- this is exactly the over-refund the cap exists to prevent",
				buggyFullSweep, correctDelta)
		}
		t.Fatalf("driver signed neither the expected delta amount nor the buggy full-sweep amount -- got a third, unaccounted-for value")
	}
}
