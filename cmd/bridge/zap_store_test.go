package main

import (
	"context"
	"errors"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

// zap_store_test.go: durability + correctness tests for ZapStore.
//
// The most important test is TestZapStore_SurvivesRestart — the whole
// point of moving off InMemoryStore is to survive a pod restart, so
// we explicitly close + reopen the DB at a tempdir and verify the
// swap state round-trips.

// helper: open a fresh ZapStore at t.TempDir(); registers t.Cleanup.
func newTestZapStore(t *testing.T) *ZapStore {
	t.Helper()
	dir := t.TempDir()
	s, err := NewZapStore(dir)
	if err != nil {
		t.Fatalf("NewZapStore: %v", err)
	}
	t.Cleanup(func() { _ = s.Close() })
	return s
}

func newTestSwap(id string) *Swap {
	return &Swap{
		ID:                 id,
		Amount:             1.5,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		SourceAsset:        "ETH",
		DestinationNetwork: "LUX_TESTNET",
		DestinationAsset:   "LUX",
		DestinationAddress: "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
		UseDepositAddress:  true,
	}
}

func TestZapStore_CreateAndGet(t *testing.T) {
	s := newTestZapStore(t)
	ctx := context.Background()

	sw := newTestSwap("swap_abc")
	if err := s.Create(ctx, sw); err != nil {
		t.Fatalf("Create: %v", err)
	}

	got, err := s.Get(ctx, "swap_abc")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.ID != "swap_abc" || got.Amount != 1.5 ||
		got.SourceNetwork != "ETHEREUM_SEPOLIA" ||
		got.DestinationAddress != "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473" {
		t.Errorf("Get returned wrong swap: %+v", got)
	}
	// Status defaults to user_deposit_pending.
	if got.Status != SwapStatusUserDepositPending {
		t.Errorf("default status: got %q want %q", got.Status, SwapStatusUserDepositPending)
	}
	if got.CreatedAt.IsZero() || got.UpdatedAt.IsZero() {
		t.Errorf("timestamps not set: created=%v updated=%v", got.CreatedAt, got.UpdatedAt)
	}
}

func TestZapStore_CreateAutoAssignsID(t *testing.T) {
	s := newTestZapStore(t)
	sw := &Swap{Amount: 0.1, SourceNetwork: "X", SourceAsset: "X"}
	if err := s.Create(context.Background(), sw); err != nil {
		t.Fatalf("Create: %v", err)
	}
	if sw.ID == "" {
		t.Fatal("Create did not assign an id")
	}
}

func TestZapStore_CreateDuplicateID(t *testing.T) {
	s := newTestZapStore(t)
	ctx := context.Background()
	if err := s.Create(ctx, newTestSwap("dup_1")); err != nil {
		t.Fatalf("first Create: %v", err)
	}
	err := s.Create(ctx, newTestSwap("dup_1"))
	if err == nil {
		t.Fatal("expected duplicate-id error, got nil")
	}
}

func TestZapStore_GetMissing(t *testing.T) {
	s := newTestZapStore(t)
	_, err := s.Get(context.Background(), "nope")
	if !errors.Is(err, ErrSwapNotFound) {
		t.Errorf("expected ErrSwapNotFound, got %v", err)
	}
}

func TestZapStore_Patch(t *testing.T) {
	s := newTestZapStore(t)
	ctx := context.Background()
	sw := newTestSwap("swap_p1")
	if err := s.Create(ctx, sw); err != nil {
		t.Fatalf("Create: %v", err)
	}
	before, _ := s.Get(ctx, "swap_p1")

	// Sleep a hair so UpdatedAt advances past CreatedAt (test wall
	// clock is monotonic + 1ms granular, so this is reliable).
	time.Sleep(2 * time.Millisecond)

	patched, err := s.Patch(ctx, "swap_p1", func(p *Swap) {
		p.Status = SwapStatusBridgeTransferPending
		p.SourceTxHash = "0xdeadbeef"
		p.DepositedAmount = 1.5
	})
	if err != nil {
		t.Fatalf("Patch: %v", err)
	}
	if patched.Status != SwapStatusBridgeTransferPending {
		t.Errorf("patch did not apply: status %q", patched.Status)
	}
	if patched.SourceTxHash != "0xdeadbeef" {
		t.Errorf("patch did not apply: source_tx_hash %q", patched.SourceTxHash)
	}
	if !patched.UpdatedAt.After(before.UpdatedAt) {
		t.Errorf("UpdatedAt did not advance: before %v after %v", before.UpdatedAt, patched.UpdatedAt)
	}
	// Round-trip via Get to make sure the patch persisted.
	got, _ := s.Get(ctx, "swap_p1")
	if got.Status != SwapStatusBridgeTransferPending || got.SourceTxHash != "0xdeadbeef" {
		t.Errorf("patch did not persist: %+v", got)
	}
}

func TestZapStore_PatchMissing(t *testing.T) {
	s := newTestZapStore(t)
	_, err := s.Patch(context.Background(), "ghost", func(*Swap) {})
	if !errors.Is(err, ErrSwapNotFound) {
		t.Errorf("expected ErrSwapNotFound, got %v", err)
	}
}

func TestZapStore_ListByStatus(t *testing.T) {
	s := newTestZapStore(t)
	ctx := context.Background()
	// Seed: 3 pending, 2 signing, 1 completed.
	want := map[SwapStatus]int{
		SwapStatusUserDepositPending: 3,
		SwapStatusSigning:            2,
		SwapStatusCompleted:          1,
	}
	id := 0
	for status, n := range want {
		for i := 0; i < n; i++ {
			id++
			sw := newTestSwap(swapTestID(id))
			sw.Status = status
			if err := s.Create(ctx, sw); err != nil {
				t.Fatalf("seed Create: %v", err)
			}
		}
	}
	for status, n := range want {
		got, err := s.List(ctx, SwapFilter{Status: status})
		if err != nil {
			t.Fatalf("List(%s): %v", status, err)
		}
		if len(got) != n {
			t.Errorf("List(%s): got %d want %d", status, len(got), n)
		}
		for _, sw := range got {
			if sw.Status != status {
				t.Errorf("List(%s) returned wrong status %s", status, sw.Status)
			}
		}
	}
}

func TestZapStore_ListBySourceNetwork(t *testing.T) {
	s := newTestZapStore(t)
	ctx := context.Background()
	mk := func(id, net string) {
		sw := newTestSwap(id)
		sw.SourceNetwork = net
		if err := s.Create(ctx, sw); err != nil {
			t.Fatalf("Create %s: %v", id, err)
		}
	}
	mk("a1", "ETHEREUM_SEPOLIA")
	mk("a2", "ETHEREUM_SEPOLIA")
	mk("b1", "BASE_SEPOLIA")
	mk("c1", "LUX_TESTNET")

	got, err := s.List(ctx, SwapFilter{SourceNetwork: "ETHEREUM_SEPOLIA"})
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(got) != 2 {
		t.Errorf("got %d ETH swaps, want 2", len(got))
	}
}

func TestZapStore_ListAll(t *testing.T) {
	s := newTestZapStore(t)
	ctx := context.Background()
	for i := 0; i < 5; i++ {
		if err := s.Create(ctx, newTestSwap(swapTestID(i))); err != nil {
			t.Fatalf("Create: %v", err)
		}
	}
	got, err := s.List(ctx, SwapFilter{})
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(got) != 5 {
		t.Errorf("List(all): got %d want 5", len(got))
	}
}

func TestZapStore_ListNewestFirst(t *testing.T) {
	s := newTestZapStore(t)
	ctx := context.Background()
	for i := 0; i < 4; i++ {
		if err := s.Create(ctx, newTestSwap(swapTestID(i))); err != nil {
			t.Fatalf("Create: %v", err)
		}
		// Force monotonic timestamp separation. Without this two
		// inserts could share a CreatedAt and the sort would tie.
		time.Sleep(2 * time.Millisecond)
	}
	got, _ := s.List(ctx, SwapFilter{})
	if len(got) != 4 {
		t.Fatalf("got %d swaps", len(got))
	}
	for i := 1; i < len(got); i++ {
		if got[i].CreatedAt.After(got[i-1].CreatedAt) {
			t.Errorf("not newest-first: got[%d]=%v before got[%d]=%v",
				i-1, got[i-1].CreatedAt, i, got[i].CreatedAt)
		}
	}
}

func TestZapStore_ListLimit(t *testing.T) {
	s := newTestZapStore(t)
	ctx := context.Background()
	for i := 0; i < 10; i++ {
		if err := s.Create(ctx, newTestSwap(swapTestID(i))); err != nil {
			t.Fatalf("Create: %v", err)
		}
	}
	got, _ := s.List(ctx, SwapFilter{Limit: 3})
	if len(got) != 3 {
		t.Errorf("got %d swaps, want 3", len(got))
	}
}

// TestZapStore_SurvivesRestart is the load-bearing one: the entire
// reason for this store. Create swaps, close the DB, reopen at the
// same path, and verify everything is still there.
func TestZapStore_SurvivesRestart(t *testing.T) {
	dir := t.TempDir()

	// Phase 1: open, write a few swaps, close.
	{
		s, err := NewZapStore(dir)
		if err != nil {
			t.Fatalf("open #1: %v", err)
		}
		for _, sw := range []*Swap{
			newTestSwap("r_1"),
			newTestSwap("r_2"),
			newTestSwap("r_3"),
		} {
			if err := s.Create(context.Background(), sw); err != nil {
				t.Fatalf("Create %s: %v", sw.ID, err)
			}
		}
		// Patch r_2 forward so we cover indexed/state-transition data
		// surviving the restart.
		if _, err := s.Patch(context.Background(), "r_2", func(p *Swap) {
			p.Status = SwapStatusCompleted
			p.DestTxHash = "0xabc"
		}); err != nil {
			t.Fatalf("Patch r_2: %v", err)
		}
		if err := s.Close(); err != nil {
			t.Fatalf("Close: %v", err)
		}
	}

	// Phase 2: reopen, verify state.
	s2, err := NewZapStore(dir)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	t.Cleanup(func() { _ = s2.Close() })

	for _, id := range []string{"r_1", "r_2", "r_3"} {
		sw, err := s2.Get(context.Background(), id)
		if err != nil {
			t.Errorf("Get %s after restart: %v", id, err)
			continue
		}
		if sw.ID != id {
			t.Errorf("Get %s: returned id %s", id, sw.ID)
		}
	}

	// r_2 should still be Completed with its dest tx.
	r2, _ := s2.Get(context.Background(), "r_2")
	if r2.Status != SwapStatusCompleted || r2.DestTxHash != "0xabc" {
		t.Errorf("r_2 patch did not survive restart: %+v", r2)
	}

	// List-by-status should reflect the post-patch indexes (r_2 was
	// moved out of pending into completed).
	pending, _ := s2.List(context.Background(), SwapFilter{Status: SwapStatusUserDepositPending})
	if len(pending) != 2 {
		t.Errorf("pending after restart: got %d want 2", len(pending))
	}
	completed, _ := s2.List(context.Background(), SwapFilter{Status: SwapStatusCompleted})
	if len(completed) != 1 || completed[0].ID != "r_2" {
		t.Errorf("completed after restart: %+v", completed)
	}
}

// TestZapStore_PatchUpdatesIndexes ensures that when Patch changes
// Status, a subsequent List by *old* status no longer returns the
// swap, and a List by *new* status does.
func TestZapStore_PatchUpdatesIndexes(t *testing.T) {
	s := newTestZapStore(t)
	ctx := context.Background()
	if err := s.Create(ctx, newTestSwap("p_idx")); err != nil {
		t.Fatalf("Create: %v", err)
	}

	pending, _ := s.List(ctx, SwapFilter{Status: SwapStatusUserDepositPending})
	if len(pending) != 1 {
		t.Fatalf("pre-patch pending: got %d", len(pending))
	}

	if _, err := s.Patch(ctx, "p_idx", func(p *Swap) {
		p.Status = SwapStatusCompleted
	}); err != nil {
		t.Fatalf("Patch: %v", err)
	}

	pending, _ = s.List(ctx, SwapFilter{Status: SwapStatusUserDepositPending})
	if len(pending) != 0 {
		t.Errorf("post-patch pending: got %d want 0 (index not refreshed)", len(pending))
	}
	completed, _ := s.List(ctx, SwapFilter{Status: SwapStatusCompleted})
	if len(completed) != 1 || completed[0].ID != "p_idx" {
		t.Errorf("post-patch completed: %+v", completed)
	}
}

// TestZapStore_ConcurrentPatch — many goroutines patch the same swap
// in parallel. zapdb's MVCC must serialize them; the final state
// should reflect every patch (no lost updates) and there should be
// no deadlocks.
func TestZapStore_ConcurrentPatch(t *testing.T) {
	s := newTestZapStore(t)
	ctx := context.Background()
	sw := newTestSwap("conc")
	sw.DepositedAmount = 0
	if err := s.Create(ctx, sw); err != nil {
		t.Fatalf("Create: %v", err)
	}

	const N = 50
	var wg sync.WaitGroup
	wg.Add(N)
	for i := 0; i < N; i++ {
		go func() {
			defer wg.Done()
			for retries := 0; retries < 10; retries++ {
				_, err := s.Patch(ctx, "conc", func(p *Swap) {
					p.DepositedAmount += 1
				})
				if err == nil {
					return
				}
				// Conflict is allowed; back off and retry.
				time.Sleep(time.Millisecond)
			}
			t.Errorf("Patch never succeeded after retries")
		}()
	}
	wg.Wait()

	final, _ := s.Get(ctx, "conc")
	if final.DepositedAmount != float64(N) {
		t.Errorf("lost updates: final DepositedAmount=%v want %d", final.DepositedAmount, N)
	}
}

func TestZapStore_OpenLockingTwiceFails(t *testing.T) {
	dir := t.TempDir()
	s, err := NewZapStore(dir)
	if err != nil {
		t.Fatalf("first open: %v", err)
	}
	t.Cleanup(func() { _ = s.Close() })

	// Opening the same dir again should fail — zapdb takes a dir lock.
	if s2, err := NewZapStore(dir); err == nil {
		_ = s2.Close()
		t.Error("expected error opening dir twice, got nil")
	}
}

func TestZapStore_EmptyDirRejected(t *testing.T) {
	if _, err := NewZapStore(""); err == nil {
		t.Error("expected error for empty dir, got nil")
	}
}

func TestZapStore_NilSwapRejected(t *testing.T) {
	s := newTestZapStore(t)
	if err := s.Create(context.Background(), nil); err == nil {
		t.Error("expected error for nil swap, got nil")
	}
}

func TestZapStore_ContextCanceledRejected(t *testing.T) {
	s := newTestZapStore(t)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := s.Create(ctx, newTestSwap("x")); err == nil {
		t.Error("expected ctx error, got nil")
	}
}

func swapTestID(n int) string {
	// short readable id: "s00000001"
	id := "s"
	x := n
	if x == 0 {
		return id + "0"
	}
	digits := []byte{}
	for x > 0 {
		digits = append([]byte{byte('0' + x%10)}, digits...)
		x /= 10
	}
	return id + string(digits)
}

// =============================================================================
// Implementation sanity
// =============================================================================

// Compile-time check: ZapStore must satisfy SwapStore.
var _ SwapStore = (*ZapStore)(nil)

// silence unused-import lint when filepath ends up unused
var _ = filepath.Join
