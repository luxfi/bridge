package main

import (
	"context"
	"errors"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/luxfi/bridge/internal/depositcheck"
)

// =============================================================================
// Fake DepositChecker
// =============================================================================

// fakeChecker is a programmable DepositChecker for tests. Per (network,
// address) it returns a configurable verdict + optional error.
type fakeChecker struct {
	mu         sync.Mutex
	verdicts   map[string]bool   // key = network|address — true ⇒ confirmed
	errors     map[string]error  // override the bool with an error
	calls      atomic.Int64
	lastParams []depositcheck.CheckParams
}

func newFakeChecker() *fakeChecker {
	return &fakeChecker{
		verdicts: map[string]bool{},
		errors:   map[string]error{},
	}
}

func (f *fakeChecker) setVerdict(network, address string, confirmed bool) {
	f.mu.Lock()
	f.verdicts[network+"|"+address] = confirmed
	f.mu.Unlock()
}

func (f *fakeChecker) setError(network, address string, err error) {
	f.mu.Lock()
	f.errors[network+"|"+address] = err
	f.mu.Unlock()
}

func (f *fakeChecker) Check(_ context.Context, p depositcheck.CheckParams) (bool, error) {
	f.calls.Add(1)
	f.mu.Lock()
	f.lastParams = append(f.lastParams, p)
	defer f.mu.Unlock()
	key := p.NetworkInternalName + "|" + p.Address
	if err, ok := f.errors[key]; ok {
		return false, err
	}
	return f.verdicts[key], nil
}

// =============================================================================
// Helpers
// =============================================================================

func seedPendingSwap(t *testing.T, store SwapStore, sourceNet, asset, addr string, amount float64) *Swap {
	t.Helper()
	sw := &Swap{
		Status:             SwapStatusUserDepositPending,
		Amount:             amount,
		SourceNetwork:      sourceNet,
		SourceAsset:        asset,
		DestinationNetwork: "LUX_TESTNET",
		DestinationAsset:   "LUX",
		DestinationAddress: "0xdest",
		DepositAddress:     "bridge-test-wallet###" + addr,
		UseDepositAddress:  true,
	}
	if err := store.Create(t.Context(), sw); err != nil {
		t.Fatalf("seed swap: %v", err)
	}
	return sw
}

// =============================================================================
// Single tick semantics
// =============================================================================

func TestWatcher_Tick_AdvancesConfirmedSwap(t *testing.T) {
	store := NewInMemoryStore()
	checker := newFakeChecker()

	sw := seedPendingSwap(t, store, "ETHEREUM_SEPOLIA", "ETH", "0xabc", 0.5)
	checker.setVerdict("ETHEREUM_SEPOLIA", "0xabc", true)

	w := NewDepositWatcher(store, checker, time.Hour, nil) // long interval; we drive Tick directly
	w.Tick(t.Context())

	got, err := store.Get(t.Context(), sw.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Status != SwapStatusBridgeTransferPending {
		t.Errorf("status = %q, want %q", got.Status, SwapStatusBridgeTransferPending)
	}
	if got.DepositedAmount != 0.5 {
		t.Errorf("DepositedAmount = %v, want 0.5", got.DepositedAmount)
	}

	stats := w.Stats()
	if stats.Ticks != 1 || stats.Checks != 1 || stats.Advances != 1 || stats.CheckErrors != 0 {
		t.Errorf("unexpected stats: %+v", stats)
	}
}

func TestWatcher_Tick_LeavesUnconfirmedSwap(t *testing.T) {
	store := NewInMemoryStore()
	checker := newFakeChecker()

	sw := seedPendingSwap(t, store, "ETHEREUM_SEPOLIA", "ETH", "0xabc", 0.5)
	// Don't set a verdict ⇒ checker returns false.

	w := NewDepositWatcher(store, checker, time.Hour, nil)
	w.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusUserDepositPending {
		t.Errorf("status = %q, want still pending", got.Status)
	}
	if w.Stats().Advances != 0 {
		t.Errorf("expected 0 advances, got %d", w.Stats().Advances)
	}
}

func TestWatcher_Tick_HandlesCheckerError(t *testing.T) {
	store := NewInMemoryStore()
	checker := newFakeChecker()

	seedPendingSwap(t, store, "ETHEREUM_SEPOLIA", "ETH", "0xabc", 0.1)
	checker.setError("ETHEREUM_SEPOLIA", "0xabc", errors.New("rpc 429"))

	w := NewDepositWatcher(store, checker, time.Hour, nil)
	w.Tick(t.Context())

	// Should record the error and skip; no advance.
	if w.Stats().CheckErrors != 1 {
		t.Errorf("CheckErrors = %d, want 1", w.Stats().CheckErrors)
	}
	if w.Stats().Advances != 0 {
		t.Errorf("Advances = %d, want 0", w.Stats().Advances)
	}
}

func TestWatcher_Tick_SkipsSwapsWithoutDepositAddress(t *testing.T) {
	store := NewInMemoryStore()
	checker := newFakeChecker()
	// Seed a swap with empty DepositAddress (use_deposit_address=false path).
	sw := &Swap{
		Status:             SwapStatusUserDepositPending,
		Amount:             0.1,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		SourceAsset:        "ETH",
		DestinationNetwork: "LUX_TESTNET",
		DepositAddress:     "", // no address
	}
	_ = store.Create(t.Context(), sw)

	w := NewDepositWatcher(store, checker, time.Hour, nil)
	w.Tick(t.Context())

	if checker.calls.Load() != 0 {
		t.Errorf("checker should not have been called for empty address; got %d calls", checker.calls.Load())
	}
}

func TestWatcher_Tick_SkipsMalformedSwap(t *testing.T) {
	store := NewInMemoryStore()
	checker := newFakeChecker()
	// Missing SourceAsset → skip.
	sw := &Swap{
		Status:         SwapStatusUserDepositPending,
		Amount:         0.1,
		SourceNetwork:  "ETHEREUM_SEPOLIA",
		DepositAddress: "name###0xaddr",
	}
	_ = store.Create(t.Context(), sw)

	w := NewDepositWatcher(store, checker, time.Hour, nil)
	w.Tick(t.Context())

	if checker.calls.Load() != 0 {
		t.Errorf("checker should not have been called for malformed swap")
	}
}

func TestWatcher_Tick_OnlyTouchesPendingSwaps(t *testing.T) {
	store := NewInMemoryStore()
	checker := newFakeChecker()

	pending := seedPendingSwap(t, store, "ETHEREUM_SEPOLIA", "ETH", "0xpending", 0.1)
	checker.setVerdict("ETHEREUM_SEPOLIA", "0xpending", true)

	// Seed one swap already in the completed state.
	completed := &Swap{
		Status:         SwapStatusCompleted,
		Amount:         1,
		SourceNetwork:  "ETHEREUM_SEPOLIA",
		SourceAsset:    "ETH",
		DepositAddress: "name###0xcompleted",
	}
	_ = store.Create(t.Context(), completed)
	checker.setVerdict("ETHEREUM_SEPOLIA", "0xcompleted", true)

	w := NewDepositWatcher(store, checker, time.Hour, nil)
	w.Tick(t.Context())

	if checker.calls.Load() != 1 {
		t.Errorf("expected 1 check (only pending), got %d", checker.calls.Load())
	}
	got, _ := store.Get(t.Context(), pending.ID)
	if got.Status != SwapStatusBridgeTransferPending {
		t.Errorf("pending swap should advance, got %q", got.Status)
	}
	got, _ = store.Get(t.Context(), completed.ID)
	if got.Status != SwapStatusCompleted {
		t.Errorf("completed swap should not change, got %q", got.Status)
	}
}

func TestWatcher_Tick_IsIdempotent(t *testing.T) {
	store := NewInMemoryStore()
	checker := newFakeChecker()
	sw := seedPendingSwap(t, store, "ETHEREUM_SEPOLIA", "ETH", "0xabc", 0.1)
	checker.setVerdict("ETHEREUM_SEPOLIA", "0xabc", true)

	w := NewDepositWatcher(store, checker, time.Hour, nil)
	w.Tick(t.Context())
	w.Tick(t.Context())
	w.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBridgeTransferPending {
		t.Errorf("status = %q, want bridge_transfer_pending", got.Status)
	}
	// Only the first tick should have actually checked (since after
	// advancing the swap is no longer in user_deposit_pending).
	if checker.calls.Load() != 1 {
		t.Errorf("expected 1 check across 3 ticks (post-advance is filtered out); got %d", checker.calls.Load())
	}
	if w.Stats().Advances != 1 {
		t.Errorf("expected 1 advance across 3 ticks; got %d", w.Stats().Advances)
	}
}

// =============================================================================
// extractDepositAddress
// =============================================================================

func TestExtractDepositAddress(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"", ""},
		{"bridge-name-123###0xabc", "0xabc"},
		{"0xbare", "0xbare"}, // no envelope marker — treat as the address itself
		{"###tail", "tail"},
		{"prefix###", ""},
	}
	for _, tc := range cases {
		if got := extractDepositAddress(tc.in); got != tc.want {
			t.Errorf("extractDepositAddress(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

// =============================================================================
// Run lifecycle
// =============================================================================

func TestWatcher_Run_StopsOnContextCancel(t *testing.T) {
	store := NewInMemoryStore()
	checker := newFakeChecker()
	w := NewDepositWatcher(store, checker, 50*time.Millisecond, nil)

	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)
	go func() { done <- w.Run(ctx) }()

	// Let a couple of ticks fire.
	time.Sleep(120 * time.Millisecond)
	if !w.Running() {
		t.Error("Running() should be true while loop is active")
	}

	cancel()
	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Errorf("expected context.Canceled, got %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("Run did not return within 1s after cancel")
	}
	if w.Running() {
		t.Error("Running() should be false after Run returns")
	}
}

func TestWatcher_Run_RefusesDoubleStart(t *testing.T) {
	store := NewInMemoryStore()
	checker := newFakeChecker()
	w := NewDepositWatcher(store, checker, 50*time.Millisecond, nil)

	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()

	go func() { _ = w.Run(ctx) }()
	time.Sleep(20 * time.Millisecond)
	if !w.Running() {
		t.Fatal("Running() should be true")
	}

	// Second call must return immediately without starting a second loop.
	err := w.Run(ctx)
	if err != nil {
		t.Errorf("second Run should return nil, got %v", err)
	}
}

func TestWatcher_FirstTickFiresImmediately(t *testing.T) {
	store := NewInMemoryStore()
	checker := newFakeChecker()
	sw := seedPendingSwap(t, store, "ETHEREUM_SEPOLIA", "ETH", "0xabc", 0.1)
	checker.setVerdict("ETHEREUM_SEPOLIA", "0xabc", true)

	// Use a long interval so only the immediate first tick can advance.
	w := NewDepositWatcher(store, checker, 10*time.Hour, nil)

	ctx, cancel := context.WithCancel(t.Context())
	go func() { _ = w.Run(ctx) }()

	// Wait briefly for the immediate tick to land.
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		got, _ := store.Get(t.Context(), sw.ID)
		if got.Status == SwapStatusBridgeTransferPending {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	cancel()

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBridgeTransferPending {
		t.Errorf("first tick should have advanced; status = %q", got.Status)
	}
}

func TestWatcher_Stop_Idempotent(t *testing.T) {
	store := NewInMemoryStore()
	w := NewDepositWatcher(store, newFakeChecker(), time.Second, nil)
	// Calling Stop before Run shouldn't panic.
	w.Stop()
	w.Stop()
}

// =============================================================================
// Sanity checks on Stats() shape
// =============================================================================

func TestWatcherStats_StartsZero(t *testing.T) {
	w := NewDepositWatcher(NewInMemoryStore(), newFakeChecker(), time.Second, nil)
	s := w.Stats()
	if s.Ticks != 0 || s.Checks != 0 || s.Advances != 0 || s.CheckErrors != 0 || s.ListErrors != 0 {
		t.Errorf("expected zero stats, got %+v", s)
	}
}

// Helper for verifying lastParams content from tests that care about
// what we send to the checker (kept here so other tests can reuse).
func paramsString(p depositcheck.CheckParams) string {
	return strings.Join([]string{
		p.NetworkInternalName, p.Address, p.Asset,
	}, "|")
}

var _ = paramsString // referenced by future tests; kept to avoid an unused-fn warning
