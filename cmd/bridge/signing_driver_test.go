package main

import (
	"context"
	"encoding/hex"
	"errors"
	"math/big"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/luxfi/bridge/internal/mchain"
	"github.com/luxfi/bridge/internal/txassembler"
)

// =============================================================================
// Fake MPCSigner
// =============================================================================

// fakeSigner is a programmable MPCSigner for tests. Per walletID it
// returns either a SignResult (success path) or an error.
type fakeSigner struct {
	mu        sync.Mutex
	results   map[string]*mchain.SignResult
	errors    map[string]error
	calls     atomic.Int64
	lastReq   []signCall
	delay     time.Duration // optional artificial latency
}

type signCall struct {
	walletID, msg string
}

func newFakeSigner() *fakeSigner {
	return &fakeSigner{
		results: map[string]*mchain.SignResult{},
		errors:  map[string]error{},
	}
}

func (f *fakeSigner) ok(walletID, sig, sess string) {
	f.mu.Lock()
	f.results[walletID] = &mchain.SignResult{Signature: sig, SessionID: sess}
	f.mu.Unlock()
}

func (f *fakeSigner) fail(walletID string, err error) {
	f.mu.Lock()
	f.errors[walletID] = err
	f.mu.Unlock()
}

func (f *fakeSigner) SignForWallet(ctx context.Context, walletID, msgHex string) (*mchain.SignResult, error) {
	f.calls.Add(1)
	f.mu.Lock()
	f.lastReq = append(f.lastReq, signCall{walletID: walletID, msg: msgHex})
	delay := f.delay
	f.mu.Unlock()
	if delay > 0 {
		select {
		case <-time.After(delay):
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	if err, ok := f.errors[walletID]; ok {
		return nil, err
	}
	if res, ok := f.results[walletID]; ok {
		return res, nil
	}
	return nil, errors.New("fakeSigner: no result configured for " + walletID)
}

// =============================================================================
// Helpers
// =============================================================================

func seedBridgeTransferPendingSwap(t *testing.T, store SwapStore, walletID, sourceNet string) *Swap {
	t.Helper()
	sw := &Swap{
		Status:             SwapStatusBridgeTransferPending,
		Amount:             0.1,
		SourceNetwork:      sourceNet,
		SourceAsset:        "ETH",
		DestinationNetwork: "LUX_TESTNET",
		DestinationAsset:   "LUX",
		DestinationAddress: "0xrecipient",
		DepositAddress:     walletID + "###0xdepositaddr",
		UseDepositAddress:  true,
	}
	if err := store.Create(t.Context(), sw); err != nil {
		t.Fatalf("seed swap: %v", err)
	}
	return sw
}

// =============================================================================
// signOne + state transitions
// =============================================================================

func TestSigning_AdvancesOnSuccess(t *testing.T) {
	store := NewInMemoryStore()
	signer := newFakeSigner()
	sw := seedBridgeTransferPendingSwap(t, store, "bridge-wallet-1", "ETHEREUM_SEPOLIA")
	signer.ok("bridge-wallet-1", "0xsig", "sess_1")

	d := NewSigningDriver(store, signer, time.Hour, nil)
	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBroadcasting {
		t.Errorf("status = %q, want broadcasting", got.Status)
	}
	if got.Signature != "0xsig" || got.MPCSessionID != "sess_1" {
		t.Errorf("signature/session not persisted: %+v", got)
	}

	stats := d.Stats()
	if stats.Successes != 1 || stats.Attempts != 1 || stats.Failures != 0 {
		t.Errorf("unexpected stats: %+v", stats)
	}
}

func TestSigning_RollsBackOnFailure(t *testing.T) {
	store := NewInMemoryStore()
	signer := newFakeSigner()
	sw := seedBridgeTransferPendingSwap(t, store, "bridge-wallet-2", "ETHEREUM_SEPOLIA")
	signer.fail("bridge-wallet-2", errors.New("cluster timeout"))

	d := NewSigningDriver(store, signer, time.Hour, nil)
	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBridgeTransferPending {
		t.Errorf("status should roll back to bridge_transfer_pending on failure, got %q", got.Status)
	}
	if got.Signature != "" {
		t.Errorf("Signature should be empty on failure, got %q", got.Signature)
	}
	if d.Stats().Failures != 1 || d.Stats().Successes != 0 {
		t.Errorf("unexpected stats: %+v", d.Stats())
	}
}

func TestSigning_ClaimsSwapBeforeCallingSigner(t *testing.T) {
	// Verify a swap transitions through SwapStatusSigning during the
	// ceremony. Use a slow signer + concurrent inspection to observe.
	store := NewInMemoryStore()
	signer := newFakeSigner()
	signer.delay = 80 * time.Millisecond
	sw := seedBridgeTransferPendingSwap(t, store, "bridge-wallet-3", "ETHEREUM_SEPOLIA")
	signer.ok("bridge-wallet-3", "0xsig", "sess_3")

	d := NewSigningDriver(store, signer, time.Hour, nil)
	done := make(chan struct{})
	go func() {
		d.Tick(t.Context())
		close(done)
	}()
	// Mid-flight: status should be "signing".
	time.Sleep(30 * time.Millisecond)
	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusSigning {
		t.Errorf("mid-flight status = %q, want signing", got.Status)
	}
	<-done
	// Post-flight: should be broadcasting.
	got, _ = store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBroadcasting {
		t.Errorf("post-flight status = %q, want broadcasting", got.Status)
	}
}

func TestSigning_SkipsSwapsWithoutWalletID(t *testing.T) {
	store := NewInMemoryStore()
	signer := newFakeSigner()
	sw := &Swap{
		Status:             SwapStatusBridgeTransferPending,
		Amount:             1,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		DestinationNetwork: "LUX_TESTNET",
		DestinationAddress: "0xdest",
		DepositAddress:     "", // no envelope → no walletID
	}
	_ = store.Create(t.Context(), sw)
	d := NewSigningDriver(store, signer, time.Hour, nil)
	d.Tick(t.Context())

	if signer.calls.Load() != 0 {
		t.Errorf("signer should not have been called for empty deposit_address; got %d", signer.calls.Load())
	}
	// Swap remains at bridge_transfer_pending.
	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBridgeTransferPending {
		t.Errorf("status should be unchanged, got %q", got.Status)
	}
}

func TestSigning_OnlyTouchesBridgeTransferPending(t *testing.T) {
	store := NewInMemoryStore()
	signer := newFakeSigner()

	pending := seedBridgeTransferPendingSwap(t, store, "wallet-pending", "ETHEREUM_SEPOLIA")
	signer.ok("wallet-pending", "0xsig", "s1")

	completed := &Swap{
		Status:             SwapStatusCompleted,
		Amount:             1,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		DestinationNetwork: "LUX_TESTNET",
		DepositAddress:     "wallet-completed###0xaddr",
	}
	_ = store.Create(t.Context(), completed)

	d := NewSigningDriver(store, signer, time.Hour, nil)
	d.Tick(t.Context())

	if signer.calls.Load() != 1 {
		t.Errorf("expected 1 sign call (only the pending one), got %d", signer.calls.Load())
	}
	got, _ := store.Get(t.Context(), pending.ID)
	if got.Status != SwapStatusBroadcasting {
		t.Errorf("pending swap should advance, got %q", got.Status)
	}
	got, _ = store.Get(t.Context(), completed.ID)
	if got.Status != SwapStatusCompleted {
		t.Errorf("completed swap should not change, got %q", got.Status)
	}
}

func TestSigning_IdempotentAcrossTicks(t *testing.T) {
	store := NewInMemoryStore()
	signer := newFakeSigner()
	sw := seedBridgeTransferPendingSwap(t, store, "w", "ETHEREUM_SEPOLIA")
	signer.ok("w", "0xsig", "s")

	d := NewSigningDriver(store, signer, time.Hour, nil)
	d.Tick(t.Context())
	d.Tick(t.Context())
	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBroadcasting {
		t.Errorf("status = %q, want broadcasting", got.Status)
	}
	// Only first tick should have made a call — subsequent ticks see
	// the swap in SwapStatusBroadcasting, not bridge_transfer_pending.
	if signer.calls.Load() != 1 {
		t.Errorf("expected 1 signer call across 3 ticks, got %d", signer.calls.Load())
	}
}

// =============================================================================
// With txassembler — produces DestRawTx
// =============================================================================

func TestSigning_WithAssembler_PopulatesDestRawTx(t *testing.T) {
	store := NewInMemoryStore()
	signer := newFakeSigner()

	// Use a fully MPC-derived eth address style for the deposit address.
	mpcAddr := "0x3535353535353535353535353535353535353535"
	sw := &Swap{
		Status:             SwapStatusBridgeTransferPending,
		Amount:             0.1,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		SourceAsset:        "ETH",
		DestinationNetwork: "LUX_TESTNET",
		DestinationAsset:   "LUX",
		DestinationAddress: "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
		DepositAddress:     "wallet-asm-test###" + mpcAddr,
		UseDepositAddress:  true,
	}
	if err := store.Create(t.Context(), sw); err != nil {
		t.Fatal(err)
	}

	// Build an assembler with a static provider so the test is deterministic.
	prov := &txassembler.StaticProvider{
		Nonces: map[string]uint64{
			"LUX_TESTNET|3535353535353535353535353535353535353535": 0,
		},
		GasPrice: map[string]*big.Int{"LUX_TESTNET": big.NewInt(25_000_000_000)},
	}
	asm := txassembler.New(prov)
	asm.SetNetwork("LUX_TESTNET", txassembler.PerNetwork{
		ChainID:         big.NewInt(96368),
		DefaultGasLimit: 21000,
		NativeDecimals:  18,
	})

	// MPC returns a 65-byte signature (synthetic — recovery_id=0).
	sigHex := "0x" + strings.Repeat("01", 32) + strings.Repeat("02", 32) + "00"
	signer.ok("wallet-asm-test", sigHex, "sess-asm")

	d := NewSigningDriver(store, signer, time.Hour, nil)
	d.SetAssembler(asm)
	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBroadcasting {
		t.Fatalf("status = %q, want broadcasting", got.Status)
	}
	if got.Signature != sigHex {
		t.Errorf("signature = %q, want %q", got.Signature, sigHex)
	}
	if got.DestRawTx == "" {
		t.Fatal("DestRawTx should be populated by the assembler")
	}
	if !strings.HasPrefix(got.DestRawTx, "0x") {
		t.Errorf("DestRawTx should be 0x-prefixed, got %q", got.DestRawTx[:10])
	}
	// Should decode as hex (RLP body).
	if _, err := hex.DecodeString(strings.TrimPrefix(got.DestRawTx, "0x")); err != nil {
		t.Errorf("DestRawTx not valid hex: %v", err)
	}
}

func TestSigning_AssemblerError_RollsBack(t *testing.T) {
	store := NewInMemoryStore()
	signer := newFakeSigner()
	sw := seedBridgeTransferPendingSwap(t, store, "wallet-fail", "ETHEREUM_SEPOLIA")
	signer.ok("wallet-fail", "0x"+strings.Repeat("aa", 65), "sess")

	// Assembler with NO network config → PreSign fails with "no config".
	asm := txassembler.New(&txassembler.StaticProvider{})

	d := NewSigningDriver(store, signer, time.Hour, nil)
	d.SetAssembler(asm)
	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBridgeTransferPending {
		t.Errorf("status should roll back, got %q", got.Status)
	}
	if signer.calls.Load() != 0 {
		t.Errorf("signer should not be called when PreSign fails; got %d", signer.calls.Load())
	}
	if d.Stats().Failures != 1 {
		t.Errorf("expected 1 failure, got %d", d.Stats().Failures)
	}
}

func TestSigning_BadSignatureFromMPC_RollsBack(t *testing.T) {
	store := NewInMemoryStore()
	signer := newFakeSigner()
	sw := seedBridgeTransferPendingSwap(t, store, "wallet-badsig", "ETHEREUM_SEPOLIA")
	// MPC returns a malformed signature (too short).
	signer.ok("wallet-badsig", "0xabcd", "sess")

	prov := &txassembler.StaticProvider{
		GasPrice: map[string]*big.Int{"LUX_TESTNET": big.NewInt(1)},
	}
	asm := txassembler.New(prov)
	asm.SetNetwork("LUX_TESTNET", txassembler.PerNetwork{
		ChainID: big.NewInt(96368), DefaultGasLimit: 21000, NativeDecimals: 18,
	})

	d := NewSigningDriver(store, signer, time.Hour, nil)
	d.SetAssembler(asm)
	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBridgeTransferPending {
		t.Errorf("status should roll back on bad sig, got %q", got.Status)
	}
	if d.Stats().Failures != 1 {
		t.Errorf("expected 1 failure, got %d", d.Stats().Failures)
	}
}

// =============================================================================
// extractWalletID
// =============================================================================

func TestExtractWalletID(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"", ""},
		{"bridge-name-123###0xabc", "bridge-name-123"},
		{"no-envelope-marker", ""},
		{"###justaddr", ""}, // empty wallet name
		{"name-only###", "name-only"},
	}
	for _, tc := range cases {
		if got := extractWalletID(tc.in); got != tc.want {
			t.Errorf("extractWalletID(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

// =============================================================================
// buildSigningMessage
// =============================================================================

func TestBuildSigningMessage_DeterministicAndHexed(t *testing.T) {
	sw := &Swap{
		ID:                 "swap_abc",
		Amount:             0.5,
		DestinationAddress: "0xrecipient",
		DestinationNetwork: "LUX_TESTNET",
		DestinationAsset:   "LUX",
	}
	m1 := buildSigningMessage(sw)
	m2 := buildSigningMessage(sw)
	if m1 != m2 {
		t.Errorf("buildSigningMessage should be deterministic; got %q and %q", m1, m2)
	}
	if !strings.HasPrefix(m1, "0x") {
		t.Errorf("expected 0x prefix, got %q", m1)
	}
	if len(m1) != 66 { // "0x" + 64 hex chars = 32 bytes
		t.Errorf("expected 66 chars (sha256 hex), got %d (%q)", len(m1), m1)
	}
}

func TestBuildSigningMessage_DiffersByFields(t *testing.T) {
	a := &Swap{ID: "x", Amount: 1, DestinationAddress: "0xa", DestinationNetwork: "LUX_TESTNET", DestinationAsset: "LUX"}
	b := &Swap{ID: "x", Amount: 1, DestinationAddress: "0xb", DestinationNetwork: "LUX_TESTNET", DestinationAsset: "LUX"}
	if buildSigningMessage(a) == buildSigningMessage(b) {
		t.Error("messages with different recipients should differ")
	}
}

// =============================================================================
// Lifecycle
// =============================================================================

func TestSigningDriver_Run_StopsOnContextCancel(t *testing.T) {
	store := NewInMemoryStore()
	signer := newFakeSigner()
	d := NewSigningDriver(store, signer, 30*time.Millisecond, nil)

	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)
	go func() { done <- d.Run(ctx) }()

	time.Sleep(80 * time.Millisecond)
	if !d.Running() {
		t.Error("Running() should be true while loop is active")
	}
	cancel()
	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Errorf("expected context.Canceled, got %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("Run did not return after cancel")
	}
}

func TestSigningDriver_RefusesDoubleStart(t *testing.T) {
	store := NewInMemoryStore()
	d := NewSigningDriver(store, newFakeSigner(), 50*time.Millisecond, nil)

	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	go func() { _ = d.Run(ctx) }()
	time.Sleep(20 * time.Millisecond)
	if err := d.Run(ctx); err != nil {
		t.Errorf("second Run should return nil, got %v", err)
	}
}

func TestSigningDriver_Stop_Idempotent(t *testing.T) {
	d := NewSigningDriver(NewInMemoryStore(), newFakeSigner(), time.Second, nil)
	d.Stop()
	d.Stop()
}

func TestSigningDriverStats_StartsZero(t *testing.T) {
	d := NewSigningDriver(NewInMemoryStore(), newFakeSigner(), time.Second, nil)
	s := d.Stats()
	if s.Ticks != 0 || s.Attempts != 0 || s.Successes != 0 || s.Failures != 0 || s.ListErrors != 0 {
		t.Errorf("expected zero stats, got %+v", s)
	}
}
