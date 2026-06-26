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
	"github.com/luxfi/bridge/internal/xrpl"
)

// =============================================================================
// Fake MPCSigner
// =============================================================================

// fakeSigner is a programmable MPCSigner for tests. Per walletID it
// returns either a SignResult (success path) or an error.
type fakeSigner struct {
	mu      sync.Mutex
	results map[string]*mchain.SignResult
	errors  map[string]error
	panics  map[string]bool
	calls   atomic.Int64
	lastReq []signCall
	delay   time.Duration // optional artificial latency
}

type signCall struct {
	walletID, msg string
}

func newFakeSigner() *fakeSigner {
	return &fakeSigner{
		results: map[string]*mchain.SignResult{},
		errors:  map[string]error{},
		panics:  map[string]bool{},
	}
}

// panicOn programs SignForWallet to panic for walletID — used to verify
// signOne's recover backstop keeps the poll loop alive when one swap's
// signing path blows up.
func (f *fakeSigner) panicOn(walletID string) {
	f.mu.Lock()
	f.panics[walletID] = true
	f.mu.Unlock()
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
	if f.panics[walletID] {
		panic("fakeSigner: injected panic for " + walletID)
	}
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

// TestSigning_SkipsWithdrawalDisabledDestination is the runtime
// kill-switch: a swap whose destination token has isWithdrawalEnabled
// flipped false is NEVER claimed/signed/broadcast — it stays pending so
// re-enabling the flag resumes it. Uses the SAME Config.WithdrawalEnabled
// accessor the create handler + normalizeCurrency use. The seed is the
// EVM LUX shape that TestSigning_AdvancesOnSuccess proves WOULD sign, so
// the gate is the only thing holding it.
func TestSigning_SkipsWithdrawalDisabledDestination(t *testing.T) {
	store := NewInMemoryStore()
	signer := newFakeSigner()
	sw := seedBridgeTransferPendingSwap(t, store, "bridge-wallet-gated", "ETHEREUM_SEPOLIA")
	signer.ok("bridge-wallet-gated", "0xsig", "sess_gated")

	no := false
	cfg := Config{Tokens: []Token{{
		Network: "LUX_TESTNET", Asset: "LUX", IsWithdrawalEnabled: &no,
	}}}
	d := NewSigningDriver(store, signer, time.Hour, nil)
	d.WithdrawalEnabled = cfg.WithdrawalEnabled
	d.Tick(t.Context())

	if signer.calls.Load() != 0 {
		t.Errorf("signer must NOT be called for a withdrawal-disabled destination; got %d", signer.calls.Load())
	}
	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBridgeTransferPending {
		t.Errorf("gated swap must stay pending (kill-switch), got %q", got.Status)
	}
	if got.Signature != "" || got.DestRawTx != "" {
		t.Errorf("gated swap must not be signed/broadcast: sig=%q rawtx=%q", got.Signature, got.DestRawTx)
	}

	// Re-enable: the SAME swap now signs on the next tick, proving the
	// gate (not some other precondition) was the sole blocker and that
	// the kill-switch is reversible.
	yes := true
	cfg.Tokens[0].IsWithdrawalEnabled = &yes
	d.WithdrawalEnabled = cfg.WithdrawalEnabled
	d.Tick(t.Context())
	got, _ = store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBroadcasting {
		t.Errorf("re-enabled swap should advance to broadcasting, got %q", got.Status)
	}
}

// TestSigning_SurvivesPanicInOneSwap proves the recover backstop at the
// top of signOne stops a panic in ONE swap's signing path from taking
// down the daemon's poll loop: a second, healthy swap still completes.
func TestSigning_SurvivesPanicInOneSwap(t *testing.T) {
	store := NewInMemoryStore()
	signer := newFakeSigner()
	swPanic := seedBridgeTransferPendingSwap(t, store, "wallet-panic", "ETHEREUM_SEPOLIA")
	swOK := seedBridgeTransferPendingSwap(t, store, "wallet-ok", "ETHEREUM_SEPOLIA")
	signer.panicOn("wallet-panic")
	signer.ok("wallet-ok", "0xsig", "sess_ok")

	d := NewSigningDriver(store, signer, time.Hour, nil)
	// A leaked panic here would crash the test goroutine and fail the
	// test — reaching the assertions proves signOne recovered.
	d.Tick(t.Context())

	gotOK, _ := store.Get(t.Context(), swOK.ID)
	if gotOK.Status != SwapStatusBroadcasting {
		t.Errorf("healthy swap should reach broadcasting despite a panic in another swap, got %q", gotOK.Status)
	}
	if d.Stats().Failures == 0 {
		t.Errorf("a recovered panic should be counted as a failure")
	}
	// The panicking swap was claimed (→ signing) before the panic fired,
	// so it is no longer pending and won't re-panic every tick; it just
	// must not have advanced to broadcasting.
	gotPanic, _ := store.Get(t.Context(), swPanic.ID)
	if gotPanic.Status == SwapStatusBroadcasting {
		t.Errorf("panicking swap must not have advanced to broadcasting, got %q", gotPanic.Status)
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
// releaseAmount — input-vs-output amount plumbing
// =============================================================================

func TestReleaseAmount_PrefersReceiveAmount(t *testing.T) {
	sw := &Swap{Amount: 0.01, ReceiveAmount: 14}
	if got := releaseAmount(sw); got != 14 {
		t.Errorf("releaseAmount=%v, want 14 (the destination-asset output)", got)
	}
}

func TestReleaseAmount_FallsBackToInputAmount(t *testing.T) {
	// Legacy row with no ReceiveAmount snapshot — fall back to the
	// raw input amount so in-flight pre-fix swaps don't ship a
	// zero-value release tx.
	sw := &Swap{Amount: 0.01}
	if got := releaseAmount(sw); got != 0.01 {
		t.Errorf("releaseAmount=%v, want 0.01 (input-amount fallback)", got)
	}
}

// TestSigning_SendsReceiveAmountToAssembler verifies the assembler is
// fed the destination-asset OUTPUT amount, not the input. This is the
// regression test for the "swap completed but I got 0.01 LUX instead
// of 14" bug — caught when the user's wallet balance didn't move as
// expected after the release-wallet split fix.
func TestSigning_SendsReceiveAmountToAssembler(t *testing.T) {
	store := NewInMemoryStore()
	signer := newFakeSigner()

	const (
		releaseWalletID = "wallet-release"
		releaseAddr     = "0x5050505050505050505050505050505050505050"
	)
	sw := &Swap{
		Status:             SwapStatusBridgeTransferPending,
		Amount:             0.01, // input ETH
		ReceiveAmount:      14,   // output LUX (the user-facing committed amount)
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		SourceAsset:        "ETH",
		DestinationNetwork: "LUX_TESTNET",
		DestinationAsset:   "LUX",
		DestinationAddress: "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
		ReleaseWalletID:    releaseWalletID,
		ReleaseAddress:     releaseAddr,
		UseDepositAddress:  true,
	}
	if err := store.Create(t.Context(), sw); err != nil {
		t.Fatal(err)
	}

	prov := &txassembler.StaticProvider{
		Nonces: map[string]uint64{
			"LUX_TESTNET|" + strings.ToLower(strings.TrimPrefix(releaseAddr, "0x")): 0,
		},
		GasPrice: map[string]*big.Int{"LUX_TESTNET": big.NewInt(25_000_000_000)},
	}
	asm := txassembler.New(prov)
	asm.SetNetwork("LUX_TESTNET", txassembler.PerNetwork{
		ChainID: big.NewInt(96368), DefaultGasLimit: 21000, NativeDecimals: 18,
	})

	sigHex := "0x" + strings.Repeat("01", 32) + strings.Repeat("02", 32) + "00"
	signer.ok(releaseWalletID, sigHex, "sess-amt")

	d := NewSigningDriver(store, signer, time.Hour, nil)
	d.SetAssembler(asm)
	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBroadcasting {
		t.Fatalf("status = %q, want broadcasting; last_error=%q", got.Status, got.LastError)
	}
	rawTx := strings.TrimPrefix(got.DestRawTx, "0x")
	if rawTx == "" {
		t.Fatal("DestRawTx empty")
	}
	// Decode the RLP and inspect the value field. 14 LUX with 18
	// decimals = 14 * 1e18 wei = 0xc249fdd327780000.
	rlpBytes, err := hex.DecodeString(rawTx)
	if err != nil {
		t.Fatalf("rawtx not hex: %v", err)
	}
	const wantValueHex = "c249fdd327780000" // 14 * 1e18 wei
	if !strings.Contains(strings.ToLower(hex.EncodeToString(rlpBytes)), wantValueHex) {
		t.Errorf("release tx does not carry 14 LUX (0x%s) — bridge sent the input amount instead.\nrlp=%s",
			wantValueHex, hex.EncodeToString(rlpBytes))
	}
}

// =============================================================================
// resolveReleaseSigning — the release-wallet vs deposit-wallet split
// =============================================================================

func TestResolveReleaseSigning_PrefersReleaseWallet(t *testing.T) {
	sw := &Swap{
		DepositAddress:  "wallet-deposit###0xDEP",
		ReleaseWalletID: "wallet-release",
		ReleaseAddress:  "0xREL",
	}
	id, addr := resolveReleaseSigning(sw)
	if id != "wallet-release" || addr != "0xREL" {
		t.Errorf("expected release wallet to win, got id=%q addr=%q", id, addr)
	}
}

func TestResolveReleaseSigning_FallsBackToDeposit(t *testing.T) {
	// Legacy swap row: ReleaseWalletID/Address empty. Must fall back
	// to the deposit-address envelope so in-flight pre-split swaps
	// still drain through the signing driver.
	sw := &Swap{DepositAddress: "wallet-legacy###0xLEGACY"}
	id, addr := resolveReleaseSigning(sw)
	if id != "wallet-legacy" || addr != "0xLEGACY" {
		t.Errorf("expected deposit fallback, got id=%q addr=%q", id, addr)
	}
}

func TestResolveReleaseSigning_PartialReleaseFallsBack(t *testing.T) {
	// Defensive: a swap with only one of the release fields populated
	// shouldn't half-sign with a half-set wallet. Fall back to the
	// deposit envelope.
	sw := &Swap{
		DepositAddress: "wallet-legacy###0xLEGACY",
		ReleaseAddress: "0xREL", // ReleaseWalletID missing
	}
	id, addr := resolveReleaseSigning(sw)
	if id != "wallet-legacy" || addr != "0xLEGACY" {
		t.Errorf("expected deposit fallback when ReleaseWalletID is empty, got id=%q addr=%q", id, addr)
	}
}

// TestSigning_AdvancesUsingReleaseWallet end-to-ends the signing driver
// against a swap row carrying the release-wallet fields. Proves the
// driver calls the signer with the RELEASE wallet ID (not the deposit
// one) and feeds the RELEASE address into the assembler as
// SenderAddress.
func TestSigning_AdvancesUsingReleaseWallet(t *testing.T) {
	store := NewInMemoryStore()
	signer := newFakeSigner()

	const (
		depositWalletID = "wallet-deposit"
		depositAddr     = "0x4040404040404040404040404040404040404040"
		releaseWalletID = "wallet-release"
		releaseAddr     = "0x5050505050505050505050505050505050505050"
	)
	sw := &Swap{
		Status:             SwapStatusBridgeTransferPending,
		Amount:             0.1,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		SourceAsset:        "ETH",
		DestinationNetwork: "LUX_TESTNET",
		DestinationAsset:   "LUX",
		DestinationAddress: "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
		DepositAddress:     depositWalletID + "###" + depositAddr,
		ReleaseWalletID:    releaseWalletID,
		ReleaseAddress:     releaseAddr,
		UseDepositAddress:  true,
	}
	if err := store.Create(t.Context(), sw); err != nil {
		t.Fatal(err)
	}

	// Provider keyed by RELEASE address (the driver should pass the
	// release address as SenderAddress to PendingNonce). If the driver
	// accidentally fed the deposit address instead, the lookup misses
	// and PreSign fails — making this an executable assertion.
	prov := &txassembler.StaticProvider{
		Nonces: map[string]uint64{
			"LUX_TESTNET|" + strings.ToLower(strings.TrimPrefix(releaseAddr, "0x")): 0,
		},
		GasPrice: map[string]*big.Int{"LUX_TESTNET": big.NewInt(25_000_000_000)},
	}
	asm := txassembler.New(prov)
	asm.SetNetwork("LUX_TESTNET", txassembler.PerNetwork{
		ChainID: big.NewInt(96368), DefaultGasLimit: 21000, NativeDecimals: 18,
	})

	sigHex := "0x" + strings.Repeat("01", 32) + strings.Repeat("02", 32) + "00"
	signer.ok(releaseWalletID, sigHex, "sess-release")

	d := NewSigningDriver(store, signer, time.Hour, nil)
	d.SetAssembler(asm)
	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBroadcasting {
		t.Fatalf("status = %q, want broadcasting (sign + finalize must succeed against release wallet)", got.Status)
	}
	if got.DestRawTx == "" {
		t.Fatal("DestRawTx empty — assembler did not produce a raw tx")
	}
	// Verify the signer was invoked with the RELEASE wallet ID, not
	// the deposit one.
	if signer.calls.Load() != 1 {
		t.Fatalf("signer should be called once, got %d", signer.calls.Load())
	}
	if signer.lastReq[0].walletID != releaseWalletID {
		t.Errorf("signer was called with walletID=%q, want %q (the release wallet)",
			signer.lastReq[0].walletID, releaseWalletID)
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

// =============================================================================
// XRP dispatch
// =============================================================================

// fakeXRPProv is a minimal XRPProvider stand-in for the signing-driver
// integration tests. Lives here (not in txassembler) because cmd/bridge
// is where the XRP wiring is exercised.
type fakeXRPProv struct {
	seq          uint32
	ledger       uint32
	feeDrops     int64
	balanceDrops int64
	calls        atomic.Int64
}

func (f *fakeXRPProv) AccountInfo(_ context.Context, _, _ string) (uint32, uint32, error) {
	f.calls.Add(1)
	return f.seq, f.ledger, nil
}
func (f *fakeXRPProv) SuggestFeeDrops(_ context.Context, _ string) (int64, error) {
	return f.feeDrops, nil
}
func (f *fakeXRPProv) AccountBalanceDrops(_ context.Context, _, _ string) (int64, error) {
	return f.balanceDrops, nil
}

// xrpAssemblerFor wires an Assembler with the fake XRP provider so
// the signing driver can exercise PreSignXRP / FinalizeXRP without a
// live rippled.
func xrpAssemblerFor(prov *fakeXRPProv) *txassembler.Assembler {
	asm := txassembler.New(&txassembler.StaticProvider{
		Nonces:   map[string]uint64{},
		GasPrice: map[string]*big.Int{},
	})
	asm.XRP = prov
	asm.SetXRPNetwork("XRP_TESTNET", txassembler.XRPNetwork{LastLedgerWindow: 20})
	return asm
}

// xrpPoolEntryWithPubKey seeds the InMemoryStore + a ReleasePool with
// one XRP-family wallet ready to release on XRP_TESTNET.
func xrpPoolEntryWithPubKey(t *testing.T, store *InMemoryStore, walletID, addr, pubHex string) *ReleasePool {
	t.Helper()
	pool := NewReleasePoolForFamily(store, FamilyXRP, "XRP_TESTNET", nil)
	if err := store.PutEntry(context.Background(), FamilyXRP, 0, ReleasePoolEntry{
		Index:       0,
		WalletID:    walletID,
		Address:     addr,
		Network:     "XRP_TESTNET",
		Family:      FamilyXRP,
		ECDSAPubKey: pubHex,
		MintedAt:    time.Now().UTC(),
	}); err != nil {
		t.Fatalf("seed xrp pool: %v", err)
	}
	if err := pool.Bootstrap(context.Background(), nil, 0); err != nil {
		t.Fatalf("bootstrap reload: %v", err)
	}
	return pool
}

// 130-hex-char (65-byte) MPC-style signature: 32B r + 32B s + 1B v.
const testMPCSigHex = "1a2b3c4d5e6f708192a3b4c5d6e7f80910111213141516171819202122232425" +
	"0b0c0d0e0f101112131415161718191a1b1c1d1e1f20212223242526272829ff" +
	"00"

const testXRPPubKeyHex = "0330E7FC9D56BB25D6893BA3F317AE5BCF33B3291BD63DB32654A313222F7FD020"

func TestSigningDriver_XRP_HappyPath(t *testing.T) {
	store := NewInMemoryStore()
	signer := newFakeSigner()
	prov := &fakeXRPProv{
		seq:          42,
		ledger:       100_000,
		feeDrops:     12,
		balanceDrops: 1_000_000_000, // 1000 XRP — plenty
	}
	asm := xrpAssemblerFor(prov)

	walletID := "wallet-xrp-1"
	// derive the canonical r-address from the test pubkey so it round-trips.
	releaseAddr := mustXRPAddr(t, testXRPPubKeyHex)
	pool := xrpPoolEntryWithPubKey(t, store, walletID, releaseAddr, testXRPPubKeyHex)

	signer.ok(walletID, testMPCSigHex, "session-xrp-1")

	sw := &Swap{
		Status:             SwapStatusBridgeTransferPending,
		Amount:             1.0, // 1 XRP
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		SourceAsset:        "ETH",
		DestinationNetwork: "XRP_TESTNET",
		DestinationAsset:   "XRP",
		DestinationAddress: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
		DepositAddress:     "deposit-w###0xDepositAddr",
		UseDepositAddress:  true,
	}
	if err := store.Create(context.Background(), sw); err != nil {
		t.Fatalf("create swap: %v", err)
	}

	d := NewSigningDriver(store, signer, time.Second, nil)
	d.SetAssembler(asm)
	d.SetReleasePool(pool)
	d.Tick(context.Background())

	got, _ := store.Get(context.Background(), sw.ID)
	if got.Status != SwapStatusBroadcasting {
		t.Errorf("Status = %q, want %q (LastError=%q)", got.Status, SwapStatusBroadcasting, got.LastError)
	}
	if got.DestRawTx == "" {
		t.Error("DestRawTx must be populated by FinalizeXRP")
	}
	if got.ReleaseWalletID != walletID {
		t.Errorf("ReleaseWalletID = %q, want %q", got.ReleaseWalletID, walletID)
	}
	if signer.calls.Load() != 1 {
		t.Errorf("expected exactly 1 MPC sign call, got %d", signer.calls.Load())
	}
}

func TestSigningDriver_XRP_InsufficientBalance_ShortCircuits(t *testing.T) {
	store := NewInMemoryStore()
	signer := newFakeSigner()
	prov := &fakeXRPProv{
		seq:          1,
		ledger:       100,
		feeDrops:     12,
		balanceDrops: 100, // way below reserve+value
	}
	asm := xrpAssemblerFor(prov)

	walletID := "wallet-xrp-broke"
	releaseAddr := mustXRPAddr(t, testXRPPubKeyHex)
	pool := xrpPoolEntryWithPubKey(t, store, walletID, releaseAddr, testXRPPubKeyHex)

	sw := &Swap{
		Status:             SwapStatusBridgeTransferPending,
		Amount:             1.0,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		SourceAsset:        "ETH",
		DestinationNetwork: "XRP_TESTNET",
		DestinationAsset:   "XRP",
		DestinationAddress: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
		DepositAddress:     "deposit-w###0xDepositAddr",
		UseDepositAddress:  true,
	}
	if err := store.Create(context.Background(), sw); err != nil {
		t.Fatal(err)
	}

	d := NewSigningDriver(store, signer, time.Second, nil)
	d.SetAssembler(asm)
	d.SetReleasePool(pool)
	d.Tick(context.Background())

	got, _ := store.Get(context.Background(), sw.ID)
	if got.Status != SwapStatusFailedInsufficientReleaseGas {
		t.Errorf("Status = %q, want failed_insufficient_release_gas (LastError=%q)", got.Status, got.LastError)
	}
	if signer.calls.Load() != 0 {
		t.Errorf("MPC must NOT be called on gas-precheck short-circuit; got %d calls", signer.calls.Load())
	}
}

func TestSigningDriver_XRP_PoolEntryMissingPubKey_RollsBack(t *testing.T) {
	store := NewInMemoryStore()
	signer := newFakeSigner()
	asm := xrpAssemblerFor(&fakeXRPProv{seq: 1, ledger: 1, feeDrops: 12, balanceDrops: 1_000_000_000})

	// Seed a pool entry that lacks ECDSAPubKey (simulates a legacy
	// pre-XRP-support pool re-used for an XRP destination).
	pool := NewReleasePoolForFamily(store, FamilyXRP, "XRP_TESTNET", nil)
	_ = store.PutEntry(context.Background(), FamilyXRP, 0, ReleasePoolEntry{
		Index:    0,
		WalletID: "legacy-w",
		Address:  "rLegacyNoPubKey",
		Family:   FamilyXRP,
		// ECDSAPubKey deliberately empty.
		Network:  "XRP_TESTNET",
		MintedAt: time.Now().UTC(),
	})
	_ = pool.Bootstrap(context.Background(), nil, 0)

	sw := &Swap{
		Status:             SwapStatusBridgeTransferPending,
		Amount:             0.1,
		DestinationNetwork: "XRP_TESTNET",
		DestinationAsset:   "XRP",
		DestinationAddress: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
		DepositAddress:     "d###0x0",
		UseDepositAddress:  true,
	}
	_ = store.Create(context.Background(), sw)

	d := NewSigningDriver(store, signer, time.Second, nil)
	d.SetAssembler(asm)
	d.SetReleasePool(pool)
	d.Tick(context.Background())

	got, _ := store.Get(context.Background(), sw.ID)
	if got.Status != SwapStatusBridgeTransferPending {
		t.Errorf("Status = %q, want rollback to bridge_transfer_pending", got.Status)
	}
	if got.LastError == "" {
		t.Error("LastError must explain the missing PubKeyHex")
	}
}

// mustXRPAddr derives the r-address from a hex-encoded compressed
// secp256k1 pubkey. Test helper — wraps internal/xrpl so tests don't
// import that path twice.
func mustXRPAddr(t *testing.T, pubHex string) string {
	t.Helper()
	pub, err := hex.DecodeString(pubHex)
	if err != nil {
		t.Fatal(err)
	}
	addr, err := xrpl.AddressFromPubKey(pub)
	if err != nil {
		t.Fatal(err)
	}
	return addr
}

// =============================================================================
// ProtocolFor dispatch (PR z/signing-driver-protocol)
// =============================================================================

// fakeProtocolSigner satisfies MPCSigner + CurveSigner + ProtocolSigner.
// Records which method was used so tests can assert dispatch routing.
type fakeProtocolSigner struct {
	plain    atomic.Int64
	curve    atomic.Int64
	proto    atomic.Int64
	lastP    atomic.Value // mchain.Protocol
	lastCurv atomic.Value // mchain.Curve
}

func (f *fakeProtocolSigner) SignForWallet(ctx context.Context, walletID, msgHex string) (*mchain.SignResult, error) {
	f.plain.Add(1)
	return &mchain.SignResult{Signature: "0xplain", SessionID: "s"}, nil
}

func (f *fakeProtocolSigner) SignForWalletOnCurve(ctx context.Context, walletID, msgHex string, curve mchain.Curve) (*mchain.SignResult, error) {
	f.curve.Add(1)
	f.lastCurv.Store(curve)
	return &mchain.SignResult{Signature: "0xcurve", SessionID: "s"}, nil
}

func (f *fakeProtocolSigner) SignForWalletOnProtocol(ctx context.Context, walletID, msgHex string, curve mchain.Curve, protocol mchain.Protocol) (*mchain.SignResult, error) {
	f.proto.Add(1)
	f.lastP.Store(protocol)
	f.lastCurv.Store(curve)
	return &mchain.SignResult{Signature: "0xproto", SessionID: "s"}, nil
}

// TestSigning_ProtocolFor_RoutesPQ asserts that when ProtocolFor returns
// a non-default Protocol AND the signer implements ProtocolSigner, the
// driver upgrades to SignForWalletOnProtocol on the wire.
func TestSigning_ProtocolFor_RoutesPQ(t *testing.T) {
	signer := &fakeProtocolSigner{}
	d := &SigningDriver{
		signer: signer,
		ProtocolFor: func(c mchain.Curve) mchain.Protocol {
			return mchain.ProtocolPulsarM65
		},
	}
	_, err := d.signOnCurve(t.Context(), "w", "0xab", mchain.CurveSecp256k1)
	if err != nil {
		t.Fatalf("signOnCurve: %v", err)
	}
	if signer.proto.Load() != 1 {
		t.Errorf("expected 1 SignForWalletOnProtocol call, got %d (curve=%d, plain=%d)",
			signer.proto.Load(), signer.curve.Load(), signer.plain.Load())
	}
	if got := signer.lastP.Load().(mchain.Protocol); got != mchain.ProtocolPulsarM65 {
		t.Errorf("expected ProtocolPulsarM65 on the wire, got %q", got)
	}
}

// TestSigning_ProtocolFor_DefaultFallsBackToCurve asserts that when
// ProtocolFor returns ProtocolDefault, the driver does NOT upgrade —
// the existing CurveSigner path runs and no "protocol" hint flows to
// the wire.
func TestSigning_ProtocolFor_DefaultFallsBackToCurve(t *testing.T) {
	signer := &fakeProtocolSigner{}
	d := &SigningDriver{
		signer: signer,
		ProtocolFor: func(c mchain.Curve) mchain.Protocol {
			return mchain.ProtocolDefault
		},
	}
	_, err := d.signOnCurve(t.Context(), "w", "0xab", mchain.CurveSecp256k1)
	if err != nil {
		t.Fatalf("signOnCurve: %v", err)
	}
	if signer.proto.Load() != 0 {
		t.Errorf("ProtocolDefault must NOT upgrade — got %d Protocol calls", signer.proto.Load())
	}
	if signer.curve.Load() != 1 {
		t.Errorf("expected 1 curve-path call, got %d", signer.curve.Load())
	}
}

// TestSigning_ProtocolFor_Nil_PreservesLegacyPath locks in that the
// pre-PR behavior is unchanged when no ProtocolFor is configured.
func TestSigning_ProtocolFor_Nil_PreservesLegacyPath(t *testing.T) {
	signer := &fakeProtocolSigner{}
	d := &SigningDriver{signer: signer}
	_, err := d.signOnCurve(t.Context(), "w", "0xab", mchain.CurveEd25519)
	if err != nil {
		t.Fatalf("signOnCurve: %v", err)
	}
	if signer.proto.Load() != 0 {
		t.Errorf("nil ProtocolFor must NOT call Protocol path; got %d", signer.proto.Load())
	}
	if signer.curve.Load() != 1 {
		t.Errorf("expected curve-path fallback, got %d (plain=%d)",
			signer.curve.Load(), signer.plain.Load())
	}
}
