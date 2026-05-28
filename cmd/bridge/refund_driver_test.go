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

// TestRefund_MissingSender_BeforeWindow_LeavesUntouched verifies the
// grace window still applies when Sender is empty — we don't want
// every stale-error swap to be terminally failed on a brief flap.
// Pre-window, both refund AND fail-terminal must wait.
func TestRefund_MissingSender_BeforeWindow_LeavesUntouched(t *testing.T) {
	d, store, _ := newRefundRig(t, "0x0")
	sw := seedBlockedSwap(t, store, 10*time.Second, func(s *Swap) {
		s.Sender = ""
	})

	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBroadcasting {
		t.Errorf("before refundAfter window, swap should stay broadcasting; got %q", got.Status)
	}
	if d.Stats().TerminalFailures != 0 {
		t.Errorf("no terminal failure should fire pre-window, got %d", d.Stats().TerminalFailures)
	}
}

// TestRefund_MissingSender_PastWindow_TerminalFails verifies the
// hardening fix: once the refund window has elapsed and the swap is
// stuck broadcasting but can't be auto-refunded (Sender empty), it
// moves to SwapStatusFailed instead of looping forever. Reason
// carries the operator-actionable detail.
func TestRefund_MissingSender_PastWindow_TerminalFails(t *testing.T) {
	d, store, _ := newRefundRig(t, "0x0")
	sw := seedBlockedSwap(t, store, 5*time.Minute, func(s *Swap) {
		s.Sender = ""
	})

	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusFailed {
		t.Fatalf("stuck-unrefundable swap should be SwapStatusFailed, got %q", got.Status)
	}
	if d.Stats().TerminalFailures != 1 {
		t.Errorf("TerminalFailures counter should be 1, got %d", d.Stats().TerminalFailures)
	}
	if !strings.Contains(got.LastError, "stuck broadcasting") {
		t.Errorf("LastError should explain the failure mode, got %q", got.LastError)
	}
	if !strings.Contains(got.LastError, "sender_empty=true") {
		t.Errorf("LastError should flag the empty-sender case, got %q", got.LastError)
	}
	if !strings.Contains(got.LastError, "manual") {
		t.Errorf("LastError should tell the operator manual sweep is required, got %q", got.LastError)
	}
}

// TestRefund_MissingDepositAddress_PastWindow_TerminalFails covers the
// other unrefundable case: DepositAddress empty means we don't know
// what address to sweep, so even with a Sender we can't refund.
func TestRefund_MissingDepositAddress_PastWindow_TerminalFails(t *testing.T) {
	d, store, _ := newRefundRig(t, "0x0")
	_ = seedBlockedSwap(t, store, 5*time.Minute, func(s *Swap) {
		s.DepositAddress = ""
	})

	d.Tick(t.Context())

	gotStats := d.Stats()
	if gotStats.TerminalFailures != 1 {
		t.Errorf("DepositAddress empty + past window should fail-terminal once, got %d", gotStats.TerminalFailures)
	}
}

// TestRefund_LegacyZeroTimestamp_MissingSender_TerminalFails covers
// the empirical case that motivated this hardening: swap_5010a8…1391
// persisted with LastError set but LastErrorAt zero (an older code
// path didn't always populate the timestamp). The grace-window gate
// treats zero LastErrorAt as past-window so legacy state doesn't
// loop forever.
func TestRefund_LegacyZeroTimestamp_MissingSender_TerminalFails(t *testing.T) {
	d, store, _ := newRefundRig(t, "0x0")
	_ = seedBlockedSwap(t, store, 0, func(s *Swap) {
		s.Sender = ""
		s.LastErrorAt = time.Time{} // legacy zero value
	})

	d.Tick(t.Context())

	if d.Stats().TerminalFailures != 1 {
		t.Errorf("zero-timestamp unrefundable swap should fail-terminal, got counter=%d", d.Stats().TerminalFailures)
	}
}

// TestRefund_LegacyZeroTimestamp_RefundsWhenPossible covers the
// parallel case for shouldRefund: a refundable legacy swap (Sender +
// DepositAddress set) with zero LastErrorAt should refund, not stay
// stuck.
func TestRefund_LegacyZeroTimestamp_RefundsWhenPossible(t *testing.T) {
	d, store, _ := newRefundRig(t, "0xDE0B6B3A7640000") // 1 ETH
	sw := seedBlockedSwap(t, store, 0, func(s *Swap) {
		s.LastErrorAt = time.Time{} // legacy zero value
	})

	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusRefunded {
		t.Errorf("legacy zero-timestamp refundable swap should refund, got status=%q", got.Status)
	}
}

// TestRefund_TerminalFail_Idempotent confirms the patch's status
// guard: a second tick on the same already-failed swap shouldn't
// double-fire the counter.
func TestRefund_TerminalFail_Idempotent(t *testing.T) {
	d, store, _ := newRefundRig(t, "0x0")
	_ = seedBlockedSwap(t, store, 5*time.Minute, func(s *Swap) {
		s.Sender = ""
	})

	d.Tick(t.Context())
	if d.Stats().TerminalFailures != 1 {
		t.Fatalf("first tick should fail-terminal once, got %d", d.Stats().TerminalFailures)
	}
	d.Tick(t.Context()) // second tick: swap is now SwapStatusFailed, not Broadcasting
	if d.Stats().TerminalFailures != 1 {
		t.Errorf("second tick should NOT re-fail (status no longer broadcasting), got counter=%d", d.Stats().TerminalFailures)
	}
}

// =============================================================================
// Persistent-failure ceiling — refund-max-attempts
// =============================================================================

// TestRefund_MaxAttempts_RollbackIncrementsCounter shows that each
// rollback bumps Swap.RefundAttempts and surfaces it in LastError.
// Below the ceiling, the swap stays in the broadcasting ↔ refunding
// oscillation as before — only the counter is new.
func TestRefund_MaxAttempts_RollbackIncrementsCounter(t *testing.T) {
	d, _, _ := newRefundRig(t, "0x0")
	// Force a sign failure so we hit the rollback path with a non-zero balance.
	d.signer = &rdFakeSigner{err: errors.New("simulated mpcd 504")}
	d.maxRefundAttempts = 5

	// Seed at 1-ETH balance so the balance check passes and the flow
	// hits the sign step. With sign returning an error, rollback fires.
	store2 := NewInMemoryStore()
	d.store = store2
	balanceSrv := fakeBalanceRPC(t, "0xDE0B6B3A7640000")
	d.rpcOverrides = map[string]string{"ETHEREUM_SEPOLIA": balanceSrv.URL}
	sw := seedBlockedSwap(t, store2, 5*time.Minute, nil)

	d.Tick(t.Context())

	got, _ := store2.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBroadcasting {
		t.Fatalf("under-ceiling rollback should return to broadcasting, got %q", got.Status)
	}
	if got.RefundAttempts != 1 {
		t.Errorf("RefundAttempts should be 1 after 1 rollback, got %d", got.RefundAttempts)
	}
	// LastError is intentionally left unchanged below the ceiling so
	// shouldRefund still matches on the seeded "insufficient funds"
	// string in subsequent ticks (the broadcast driver overwrites it
	// in production; in tests we rely on it being preserved).
	if !strings.Contains(got.LastError, "Insufficient funds") {
		t.Errorf("LastError should be preserved as the seeded insufficient-funds message, got %q", got.LastError)
	}
}

// TestRefund_MaxAttempts_HitsCeilingTerminalFails verifies the
// persistent-failure short-circuit: once RefundAttempts reaches
// maxRefundAttempts, the swap moves to SwapStatusFailed with a clear
// "upstream mpcd / RPC issue" reason.
func TestRefund_MaxAttempts_HitsCeilingTerminalFails(t *testing.T) {
	d, _, _ := newRefundRig(t, "0xDE0B6B3A7640000") // 1 ETH (balance check passes)
	d.signer = &rdFakeSigner{err: errors.New("mchain: sign HTTP 504: sign timed out after 60s")}
	d.maxRefundAttempts = 3 // small ceiling for fast test

	store := NewInMemoryStore()
	d.store = store
	balanceSrv := fakeBalanceRPC(t, "0xDE0B6B3A7640000")
	d.rpcOverrides = map[string]string{"ETHEREUM_SEPOLIA": balanceSrv.URL}
	sw := seedBlockedSwap(t, store, 5*time.Minute, nil)

	// Three ticks → three rollbacks → ceiling hit on the third.
	d.Tick(t.Context())
	d.Tick(t.Context())
	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusFailed {
		t.Fatalf("hitting ceiling should move to SwapStatusFailed, got %q", got.Status)
	}
	if got.RefundAttempts != 3 {
		t.Errorf("RefundAttempts should be exactly the ceiling (3), got %d", got.RefundAttempts)
	}
	if !strings.Contains(got.LastError, "Refund failed 3 times") {
		t.Errorf("LastError should explain the ceiling hit, got %q", got.LastError)
	}
	if !strings.Contains(got.LastError, "manual recovery required") {
		t.Errorf("LastError should tell the operator to recover manually, got %q", got.LastError)
	}
	if d.Stats().TerminalFailures != 1 {
		t.Errorf("ceiling-hit should bump TerminalFailures once, got %d", d.Stats().TerminalFailures)
	}
}

// TestRefund_MaxAttempts_ZeroDisablesCeiling confirms the legacy
// behaviour is preserved when an operator sets --refund-max-attempts=0.
// Under unbounded retries the swap stays in the oscillation regardless
// of how many failures accumulate.
func TestRefund_MaxAttempts_ZeroDisablesCeiling(t *testing.T) {
	d, _, _ := newRefundRig(t, "0xDE0B6B3A7640000")
	d.signer = &rdFakeSigner{err: errors.New("simulated mpcd 504")}
	d.maxRefundAttempts = 0 // legacy: retry forever

	store := NewInMemoryStore()
	d.store = store
	balanceSrv := fakeBalanceRPC(t, "0xDE0B6B3A7640000")
	d.rpcOverrides = map[string]string{"ETHEREUM_SEPOLIA": balanceSrv.URL}
	sw := seedBlockedSwap(t, store, 5*time.Minute, nil)

	for i := 0; i < 10; i++ {
		d.Tick(t.Context())
	}

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBroadcasting {
		t.Errorf("with ceiling disabled, swap should oscillate (still broadcasting), got %q", got.Status)
	}
	if got.RefundAttempts != 10 {
		t.Errorf("RefundAttempts should still count past the would-be-ceiling, got %d", got.RefundAttempts)
	}
	if d.Stats().TerminalFailures != 0 {
		t.Errorf("ceiling disabled — TerminalFailures should be 0, got %d", d.Stats().TerminalFailures)
	}
}

// TestRefund_MaxAttempts_SuccessResets confirms a successful refund
// clears RefundAttempts so a future swap reusing the same ID (or a
// re-entry of the same swap after operator manual recovery) starts
// from a clean counter.
func TestRefund_MaxAttempts_SuccessResets(t *testing.T) {
	d, store, _ := newRefundRig(t, "0xDE0B6B3A7640000")
	d.maxRefundAttempts = 5
	sw := seedBlockedSwap(t, store, 2*time.Minute, func(s *Swap) {
		// Pre-seed a non-zero attempt count to simulate prior failures.
		s.RefundAttempts = 3
	})

	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusRefunded {
		t.Fatalf("expected refunded, got %q reason=%q", got.Status, got.LastError)
	}
	if got.RefundAttempts != 0 {
		t.Errorf("RefundAttempts should be cleared on success, got %d", got.RefundAttempts)
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
	// LastError is preserved as the seeded "insufficient funds" string
	// below the persistent-failure ceiling — the broadcast driver
	// overwrites it on its next attempt in production, but we want
	// shouldRefund's "insufficient funds" matcher to keep finding the
	// swap between refund ticks. See refund_driver.go rollback().
	if !strings.Contains(strings.ToLower(got.LastError), "insufficient funds") {
		t.Errorf("LastError should be preserved as the seeded insufficient-funds message; got %q", got.LastError)
	}
	// LastErrorAt must NOT have been reset — rollback preserves the
	// original "stuck since" stamp so retry eligibility is unchanged.
	if got.LastErrorAt.IsZero() {
		t.Error("LastErrorAt should be preserved across rollback")
	}
	if got.RefundAttempts != 1 {
		t.Errorf("RefundAttempts should be 1 after one rollback; got %d", got.RefundAttempts)
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

// =============================================================================
// Orphan-refunding recovery — bridge killed mid-refund
// =============================================================================

// seedOrphanedRefundingSwap creates a swap in SwapStatusRefunding with a
// controlled UpdatedAt by temporarily pinning the InMemoryStore's
// `now` function. Restores the real clock before returning so other
// tests sharing this helper see normal time.
func seedOrphanedRefundingSwap(t *testing.T, store *InMemoryStore, staleFor time.Duration, mutate func(*Swap)) *Swap {
	t.Helper()
	realNow := store.now
	pinned := realNow().Add(-staleFor)
	store.now = func() time.Time { return pinned }
	t.Cleanup(func() { store.now = realNow })

	sw := &Swap{
		Status:             SwapStatusRefunding,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		DestinationNetwork: "LUX_TESTNET",
		Sender:             "0xa28fae14eb42e7a5c36ad2d774a2b7eb293c4473",
		DepositAddress:     "wallet-x###0x9d6afe4e71184d8bd2972fc5a8b63ca257fb7383",
		LastError:          "MPC sign hung — refund driver was killed",
		LastErrorAt:        realNow().UTC().Add(-staleFor),
		DestRawTx:          "0xrawtx",
	}
	if mutate != nil {
		mutate(sw)
	}
	if err := store.Create(t.Context(), sw); err != nil {
		t.Fatalf("seed orphaned refunding swap: %v", err)
	}
	// Restore the real clock so the orphan-recovery path sees the
	// pinned-in-the-past UpdatedAt against a current `now`.
	store.now = realNow
	return sw
}

// TestRefund_Orphan_RecoversAfterTimeout shows the basic case: a swap
// in SwapStatusRefunding with UpdatedAt past the orphan threshold is
// rolled back to SwapStatusRefundPending, RefundAttempts is bumped,
// and the orphans-recovered counter ticks.
func TestRefund_Orphan_RecoversAfterTimeout(t *testing.T) {
	d, store, _ := newRefundRig(t, "0x0")
	d.SetOrphanRefundingAfter(2 * time.Minute)
	sw := seedOrphanedRefundingSwap(t, store, 10*time.Minute, nil)

	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusRefundPending {
		t.Errorf("orphan should be recovered to refund_pending, got %q", got.Status)
	}
	if got.RefundAttempts != 1 {
		t.Errorf("RefundAttempts should bump on recovery, got %d", got.RefundAttempts)
	}
	if !strings.Contains(got.LastError, "orphaned refund") {
		t.Errorf("LastError should explain the recovery, got %q", got.LastError)
	}
	if d.Stats().OrphansRecovered != 1 {
		t.Errorf("OrphansRecovered counter should bump, got %d", d.Stats().OrphansRecovered)
	}
}

// TestRefund_Orphan_LeavesRecentAlone verifies that a swap whose
// refund leg is still in progress (UpdatedAt is recent) is left
// untouched. Without this guard, an in-flight refund's MPC sign
// would race against an orphan-recovery rollback.
func TestRefund_Orphan_LeavesRecentAlone(t *testing.T) {
	d, store, _ := newRefundRig(t, "0x0")
	d.SetOrphanRefundingAfter(2 * time.Minute)
	sw := seedOrphanedRefundingSwap(t, store, 30*time.Second, nil) // well under the 2 m threshold

	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusRefunding {
		t.Errorf("recent refunding swap should stay refunding, got %q", got.Status)
	}
	if d.Stats().OrphansRecovered != 0 {
		t.Errorf("OrphansRecovered should stay zero pre-threshold, got %d", d.Stats().OrphansRecovered)
	}
}

// TestRefund_Orphan_ZeroDisablesRecovery confirms that
// --orphan-refunding-after=0 leaves orphans untouched (operator
// opted out — manual sweep only).
func TestRefund_Orphan_ZeroDisablesRecovery(t *testing.T) {
	d, store, _ := newRefundRig(t, "0x0")
	d.SetOrphanRefundingAfter(0) // disabled
	sw := seedOrphanedRefundingSwap(t, store, 24*time.Hour, nil)

	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusRefunding {
		t.Errorf("with recovery disabled, orphan should stay refunding, got %q", got.Status)
	}
	if d.Stats().OrphansRecovered != 0 {
		t.Errorf("OrphansRecovered should be 0 when disabled, got %d", d.Stats().OrphansRecovered)
	}
}

// TestRefund_Orphan_LegacyZeroUpdatedAt_Recovered covers swaps
// persisted by older code that didn't populate UpdatedAt — treat as
// definitely orphaned, recover loudly.
func TestRefund_Orphan_LegacyZeroUpdatedAt_Recovered(t *testing.T) {
	d, store, _ := newRefundRig(t, "0x0")
	d.SetOrphanRefundingAfter(2 * time.Minute)

	sw := &Swap{
		Status:             SwapStatusRefunding,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		DestinationNetwork: "LUX_TESTNET",
		Sender:             "0xa28fae14eb42e7a5c36ad2d774a2b7eb293c4473",
		DepositAddress:     "wallet-x###0x9d6afe4e71184d8bd2972fc5a8b63ca257fb7383",
		LastError:          "Insufficient funds in release address — fund the MPC address with destination-chain gas tokens",
	}
	if err := store.Create(t.Context(), sw); err != nil {
		t.Fatalf("seed: %v", err)
	}
	// Force UpdatedAt to the zero value AFTER Create (which set it to now).
	_, _ = store.Patch(t.Context(), sw.ID, func(s *Swap) {
		s.UpdatedAt = time.Time{}
	})
	// Patch itself resets UpdatedAt to now via the store's `now` field —
	// override the store's now to return the zero value once to leak
	// it through.
	store.now = func() time.Time { return time.Time{} }
	_, _ = store.Patch(t.Context(), sw.ID, func(s *Swap) { s.LastError = sw.LastError })
	store.now = time.Now

	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusRefundPending {
		t.Errorf("zero-UpdatedAt orphan should recover, got %q", got.Status)
	}
}

// TestRefund_Orphan_BumpsAttemptsAcrossCrashCycles shows that the
// persistent-failure ceiling still applies even when the failure mode
// is repeated crashes mid-refund. Each orphan recovery bumps
// RefundAttempts; once the ceiling is hit, the next normal refund
// rollback will move the swap to SwapStatusFailed (covered by the
// existing TestRefund_MaxAttempts_HitsCeilingTerminalFails).
func TestRefund_Orphan_BumpsAttemptsAcrossCrashCycles(t *testing.T) {
	d, store, _ := newRefundRig(t, "0x0")
	d.SetOrphanRefundingAfter(2 * time.Minute)

	sw := seedOrphanedRefundingSwap(t, store, 10*time.Minute, nil)
	d.Tick(t.Context())
	got, _ := store.Get(t.Context(), sw.ID)
	if got.RefundAttempts != 1 {
		t.Fatalf("after first recovery, RefundAttempts should be 1; got %d", got.RefundAttempts)
	}

	// Simulate the bridge crashing again mid-refund: roll status back
	// to refunding manually with a stale UpdatedAt.
	store.now = func() time.Time { return time.Now().UTC().Add(-10 * time.Minute) }
	_, _ = store.Patch(t.Context(), sw.ID, func(s *Swap) {
		s.Status = SwapStatusRefunding
	})
	store.now = time.Now

	d.Tick(t.Context())
	got, _ = store.Get(t.Context(), sw.ID)
	if got.RefundAttempts != 2 {
		t.Errorf("second recovery should bump RefundAttempts to 2; got %d", got.RefundAttempts)
	}
	if d.Stats().OrphansRecovered != 2 {
		t.Errorf("OrphansRecovered should be 2 after two recoveries; got %d", d.Stats().OrphansRecovered)
	}
}
