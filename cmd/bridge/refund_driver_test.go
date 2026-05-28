package main

import (
	"context"
	"encoding/json"
	"errors"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/luxfi/bridge/internal/broadcast"
	"github.com/luxfi/bridge/internal/mchain"
	"github.com/luxfi/bridge/internal/txassembler"
)

// =============================================================================
// Helpers — fakes for the refund driver dependencies
// =============================================================================

// rdFakeSigner is a programmable MPCSigner for refund driver tests.
type rdFakeSigner struct {
	sig string
	err error
}

func (f *rdFakeSigner) SignForWallet(_ context.Context, _, _ string) (*mchain.SignResult, error) {
	if f.err != nil {
		return nil, f.err
	}
	return &mchain.SignResult{Signature: f.sig, SessionID: "rd-test-session"}, nil
}

// rdFakeBroadcaster is a programmable Broadcaster.
type rdFakeBroadcaster struct {
	hash  string
	err   error
	calls atomic.Uint64
	last  atomic.Value // last (network, rawTx)
}

func (f *rdFakeBroadcaster) Broadcast(_ context.Context, network, rawTxHex string) (*broadcast.BroadcastResult, error) {
	f.calls.Add(1)
	f.last.Store(network + "|" + rawTxHex)
	if f.err != nil {
		return nil, f.err
	}
	return &broadcast.BroadcastResult{TxHash: f.hash}, nil
}

// fakeBalanceRPC is an httptest server that responds to a single
// eth_getBalance call with a fixed hex value. Used to verify the
// refund driver queries source-chain balance correctly.
func fakeBalanceRPC(t *testing.T, balanceHex string) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Method string `json:"method"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0",
			"id":      1,
			"result":  balanceHex,
		})
	}))
	t.Cleanup(srv.Close)
	return srv
}

// newRefundRig assembles everything the refund driver needs against
// in-process fakes. Static provider supplies nonce + gas price so the
// assembler doesn't hit the network for the PreSign leg.
func newRefundRig(t *testing.T, balanceHex string) (*RefundDriver, *InMemoryStore, *rdFakeBroadcaster) {
	t.Helper()
	store := NewInMemoryStore()
	signer := &rdFakeSigner{
		// Valid 65-byte sig (deterministic test value). The assembler
		// canonicalizes high-s to low-s in ParseRSV.
		sig: "1111111111111111111111111111111111111111111111111111111111111111" +
			"2222222222222222222222222222222222222222222222222222222222222222" +
			"00",
	}
	bc := &rdFakeBroadcaster{hash: "0xrefundtxhash"}
	provider := &txassembler.StaticProvider{
		GasPrice: map[string]*big.Int{
			"ETHEREUM_SEPOLIA": big.NewInt(25_000_000_000), // 25 gwei
		},
	}
	asm := txassembler.New(provider)
	asm.SetNetwork("ETHEREUM_SEPOLIA", txassembler.PerNetwork{
		ChainID:        big.NewInt(11155111),
		NativeDecimals: 18,
	})

	balanceSrv := fakeBalanceRPC(t, balanceHex)
	d := NewRefundDriver(store, signer, bc, asm,
		time.Hour, 60*time.Second,
		map[string]string{"ETHEREUM_SEPOLIA": balanceSrv.URL},
		nil)
	// Shrink internal timeouts so tests don't wait.
	d.perBalanceTimeout = 2 * time.Second
	d.perSignTimeout = 2 * time.Second
	d.perBroadcastTimeout = 2 * time.Second
	return d, store, bc
}

// seedBlockedSwap creates a swap stuck at broadcasting with an
// "insufficient funds" LastError set elapsedAgo in the past. opts
// override individual fields when needed.
func seedBlockedSwap(t *testing.T, store *InMemoryStore, elapsedAgo time.Duration, mutate func(*Swap)) *Swap {
	t.Helper()
	sw := &Swap{
		Status:             SwapStatusBroadcasting,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		DestinationNetwork: "LUX_TESTNET",
		Sender:             "0xa28fae14eb42e7a5c36ad2d774a2b7eb293c4473",
		DepositAddress:     "wallet-x###0x9d6afe4e71184d8bd2972fc5a8b63ca257fb7383",
		LastError:          "Insufficient funds in release address — fund the MPC address with destination-chain gas tokens",
		LastErrorAt:        time.Now().UTC().Add(-elapsedAgo),
		DestRawTx:          "0xrawtx",
	}
	if mutate != nil {
		mutate(sw)
	}
	if err := store.Create(t.Context(), sw); err != nil {
		t.Fatalf("seed: %v", err)
	}
	return sw
}

// =============================================================================
// Trigger-policy tests (shouldRefund pure function)
// =============================================================================

func TestRefund_DoesNothingBeforeTimeout(t *testing.T) {
	d, store, bc := newRefundRig(t, "0x0")
	sw := seedBlockedSwap(t, store, 5*time.Second, nil) // well under 60s window

	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBroadcasting {
		t.Errorf("status changed prematurely: %q", got.Status)
	}
	if bc.calls.Load() != 0 {
		t.Errorf("broadcaster called before timeout elapsed")
	}
	if d.Stats().Candidates != 0 {
		t.Errorf("expected 0 candidates, got %d", d.Stats().Candidates)
	}
}

func TestRefund_DoesNothingWithoutInsufficientFundsError(t *testing.T) {
	d, store, bc := newRefundRig(t, "0x0")
	sw := seedBlockedSwap(t, store, 5*time.Minute, func(s *Swap) {
		// Different transient error class — gateway flake, not "insufficient funds".
		s.LastError = "Destination RPC unreachable — retrying"
	})

	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBroadcasting {
		t.Errorf("non-funds error should not trigger refund: %q", got.Status)
	}
	if bc.calls.Load() != 0 {
		t.Errorf("broadcaster called for wrong error class")
	}
}

func TestRefund_DoesNothingWithoutSender(t *testing.T) {
	d, store, _ := newRefundRig(t, "0x0")
	sw := seedBlockedSwap(t, store, 5*time.Minute, func(s *Swap) {
		s.Sender = ""
	})

	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBroadcasting {
		t.Errorf("missing sender should leave status untouched: %q", got.Status)
	}
}

// =============================================================================
// Happy path
// =============================================================================

func TestRefund_HappyPath(t *testing.T) {
	// 1 ETH balance at the deposit address: more than enough to cover
	// 21000 * 25 gwei = 525_000 gwei = 5.25e14 wei of gas.
	d, store, bc := newRefundRig(t, "0xDE0B6B3A7640000") // 1 ETH
	sw := seedBlockedSwap(t, store, 2*time.Minute, nil)

	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusRefunded {
		t.Fatalf("status = %q, want refunded", got.Status)
	}
	if got.RefundTxHash != "0xrefundtxhash" {
		t.Errorf("RefundTxHash = %q, want 0xrefundtxhash", got.RefundTxHash)
	}
	if got.LastError != "" || !got.LastErrorAt.IsZero() {
		t.Errorf("LastError fields should clear on refund success; got %q at %v", got.LastError, got.LastErrorAt)
	}
	if bc.calls.Load() != 1 {
		t.Errorf("expected 1 source-chain broadcast, got %d", bc.calls.Load())
	}
	// The broadcaster was asked to push on the SOURCE network.
	last := bc.last.Load().(string)
	if !strings.HasPrefix(last, "ETHEREUM_SEPOLIA|") {
		t.Errorf("broadcast on wrong network: %q", last)
	}
	if d.Stats().Successes != 1 {
		t.Errorf("expected 1 success, got %+v", d.Stats())
	}
}

// =============================================================================
// Failure-mode tests
// =============================================================================

func TestRefund_BalanceBelowGasCostKeepsStuck(t *testing.T) {
	// 1 wei balance — way below the 21000 * 25e9 = 5.25e14 wei gas cost.
	d, store, bc := newRefundRig(t, "0x1")
	sw := seedBlockedSwap(t, store, 2*time.Minute, nil)

	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusRefunding {
		t.Errorf("balance-below-gas swap should stay refunding (operator triage); got %q", got.Status)
	}
	if !strings.Contains(strings.ToLower(got.LastError), "refund impossible") {
		t.Errorf("expected LastError to explain refund impossibility; got %q", got.LastError)
	}
	if bc.calls.Load() != 0 {
		t.Errorf("broadcaster should NOT be called when refund value is negative")
	}
	if d.Stats().Failures != 1 {
		t.Errorf("expected 1 failure, got %+v", d.Stats())
	}
}

func TestRefund_RollsBackOnBroadcastFailure(t *testing.T) {
	d, store, bc := newRefundRig(t, "0xDE0B6B3A7640000")
	bc.err = errors.New("source RPC returned 500")
	sw := seedBlockedSwap(t, store, 2*time.Minute, nil)

	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBroadcasting {
		t.Errorf("broadcast failure should roll back to broadcasting; got %q", got.Status)
	}
	if !strings.Contains(strings.ToLower(got.LastError), "refund attempt failed") {
		t.Errorf("LastError should explain refund retry; got %q", got.LastError)
	}
	// LastErrorAt must NOT have been reset — rollback preserves the
	// original "stuck since" stamp so retry eligibility is unchanged.
	if got.LastErrorAt.IsZero() {
		t.Error("LastErrorAt should be preserved across rollback")
	}
	if d.Stats().Failures != 1 {
		t.Errorf("expected 1 failure, got %+v", d.Stats())
	}
}

func TestRefund_RollsBackOnSignFailure(t *testing.T) {
	d, store, bc := newRefundRig(t, "0xDE0B6B3A7640000")
	d.signer = &rdFakeSigner{err: errors.New("MPC cluster timeout")}
	sw := seedBlockedSwap(t, store, 2*time.Minute, nil)

	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBroadcasting {
		t.Errorf("MPC failure should roll back to broadcasting; got %q", got.Status)
	}
	if bc.calls.Load() != 0 {
		t.Errorf("broadcaster should NOT be called when sign fails")
	}
}

// =============================================================================
// Concurrency: claim/rollback semantics
// =============================================================================

func TestRefund_ClaimsAtomically_AvoidsDoubleFire(t *testing.T) {
	// Two ticks back-to-back; second should observe SwapStatusRefunding
	// (already claimed) and skip. End state: refunded, broadcaster
	// called exactly once.
	d, store, bc := newRefundRig(t, "0xDE0B6B3A7640000")
	sw := seedBlockedSwap(t, store, 2*time.Minute, nil)

	// First tick → refund happens.
	d.Tick(t.Context())
	// Second tick → swap is now SwapStatusRefunded; not eligible.
	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusRefunded {
		t.Errorf("status = %q, want refunded", got.Status)
	}
	if bc.calls.Load() != 1 {
		t.Errorf("broadcaster called %d times; want 1", bc.calls.Load())
	}
}

// =============================================================================
// Network-stub double-checks (the JSON-RPC balance helper)
// =============================================================================

func TestRefund_ParsesBalanceHexCorrectly(t *testing.T) {
	d, _, _ := newRefundRig(t, "0xabc123")
	bal, err := d.fetchBalance(t.Context(), "ETHEREUM_SEPOLIA",
		"0x9d6afe4e71184d8bd2972fc5a8b63ca257fb7383")
	if err != nil {
		t.Fatalf("fetchBalance: %v", err)
	}
	if bal.Cmp(big.NewInt(0xabc123)) != 0 {
		t.Errorf("balance = %s, want 0xabc123 (%d)", bal.String(), 0xabc123)
	}
}

// =============================================================================
// Stale-quote refund path (SwapStatusRefundPending)
// =============================================================================

// seedRefundPendingSwap creates a swap already tagged for stale-quote refund
// by the signing driver. No broadcasting state, no insufficient-funds error
// — the refund driver should sweep on the very next tick.
func seedRefundPendingSwap(t *testing.T, store *InMemoryStore, mutate func(*Swap)) *Swap {
	t.Helper()
	sw := &Swap{
		Status:             SwapStatusRefundPending,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		DestinationNetwork: "LUX_TESTNET",
		Sender:             "0xa28fae14eb42e7a5c36ad2d774a2b7eb293c4473",
		DepositAddress:     "wallet-x###0x9d6afe4e71184d8bd2972fc5a8b63ca257fb7383",
		LastError:          "quote_stale: created 2h0m0s ago, max age 30m0s",
		LastErrorAt:        time.Now().UTC(),
	}
	if mutate != nil {
		mutate(sw)
	}
	if err := store.Create(t.Context(), sw); err != nil {
		t.Fatalf("seed refund_pending: %v", err)
	}
	return sw
}

func TestRefund_StaleQuote_RefundsImmediately(t *testing.T) {
	d, store, bc := newRefundRig(t, "0xDE0B6B3A7640000") // 1 ETH
	sw := seedRefundPendingSwap(t, store, nil)

	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusRefunded {
		t.Fatalf("status = %q, want refunded", got.Status)
	}
	if got.RefundTxHash != "0xrefundtxhash" {
		t.Errorf("RefundTxHash = %q, want 0xrefundtxhash", got.RefundTxHash)
	}
	if bc.calls.Load() != 1 {
		t.Errorf("expected 1 broadcast, got %d", bc.calls.Load())
	}
	if d.Stats().Successes != 1 {
		t.Errorf("expected 1 success, got %+v", d.Stats())
	}
}

func TestRefund_StaleQuote_NoSender_Skips(t *testing.T) {
	d, store, bc := newRefundRig(t, "0xDE0B6B3A7640000")
	sw := seedRefundPendingSwap(t, store, func(s *Swap) {
		s.Sender = ""
	})

	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusRefundPending {
		t.Errorf("status should stay refund_pending without sender, got %q", got.Status)
	}
	if bc.calls.Load() != 0 {
		t.Errorf("broadcaster called despite missing sender")
	}
}

func TestRefund_StaleQuote_IdempotentAcrossTicks(t *testing.T) {
	d, store, bc := newRefundRig(t, "0xDE0B6B3A7640000")
	sw := seedRefundPendingSwap(t, store, nil)

	d.Tick(t.Context()) // refunds
	d.Tick(t.Context()) // refunded state — no further work

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusRefunded {
		t.Errorf("status = %q, want refunded", got.Status)
	}
	if bc.calls.Load() != 1 {
		t.Errorf("broadcaster called %d times across two ticks, want 1", bc.calls.Load())
	}
}

func TestRefund_StaleQuote_AndLegacy_BothProcessedInOneTick(t *testing.T) {
	// Cover that the refund driver still processes legacy broadcasting-
	// stuck swaps in the same tick that it processes stale-quote swaps.
	d, store, bc := newRefundRig(t, "0xDE0B6B3A7640000")

	staleSwap := seedRefundPendingSwap(t, store, func(s *Swap) {
		s.Sender = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
		s.DepositAddress = "wallet-a###0x1111111111111111111111111111111111111111"
	})
	legacySwap := seedBlockedSwap(t, store, 2*time.Minute, func(s *Swap) {
		s.Sender = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
		s.DepositAddress = "wallet-b###0x2222222222222222222222222222222222222222"
	})

	d.Tick(t.Context())

	for _, id := range []string{staleSwap.ID, legacySwap.ID} {
		got, _ := store.Get(t.Context(), id)
		if got.Status != SwapStatusRefunded {
			t.Errorf("swap %s status = %q, want refunded", id, got.Status)
		}
	}
	if bc.calls.Load() != 2 {
		t.Errorf("expected 2 source-chain broadcasts (one per swap), got %d", bc.calls.Load())
	}
}
