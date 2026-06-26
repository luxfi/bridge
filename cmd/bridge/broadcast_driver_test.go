package main

import (
	"context"
	"errors"
	"math/big"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/luxfi/bridge/internal/broadcast"
	"github.com/luxfi/bridge/internal/txassembler"
)

// =============================================================================
// Fake Broadcaster
// =============================================================================

type fakeBroadcaster struct {
	mu      sync.Mutex
	results map[string]string // key = network|rawTx — value = txHash on success
	errors  map[string]error
	calls   atomic.Int64
	lastNet string
	lastRaw string
}

func newFakeBroadcaster() *fakeBroadcaster {
	return &fakeBroadcaster{
		results: map[string]string{},
		errors:  map[string]error{},
	}
}

func (f *fakeBroadcaster) okFor(network, rawTx, txHash string) {
	f.mu.Lock()
	f.results[network+"|"+rawTx] = txHash
	f.mu.Unlock()
}

func (f *fakeBroadcaster) failFor(network, rawTx string, err error) {
	f.mu.Lock()
	f.errors[network+"|"+rawTx] = err
	f.mu.Unlock()
}

func (f *fakeBroadcaster) Broadcast(_ context.Context, network, rawTxHex string) (*broadcast.BroadcastResult, error) {
	f.calls.Add(1)
	f.mu.Lock()
	defer f.mu.Unlock()
	f.lastNet = network
	f.lastRaw = rawTxHex
	key := network + "|" + rawTxHex
	if err, ok := f.errors[key]; ok {
		return nil, err
	}
	if hash, ok := f.results[key]; ok {
		return &broadcast.BroadcastResult{TxHash: hash}, nil
	}
	return nil, errors.New("fakeBroadcaster: no result configured for " + key)
}

// =============================================================================
// Helpers
// =============================================================================

func seedBroadcastingSwap(t *testing.T, store SwapStore, destNet, rawTx string) *Swap {
	t.Helper()
	sw := &Swap{
		Status:             SwapStatusBroadcasting,
		Amount:             0.1,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		SourceAsset:        "ETH",
		DestinationNetwork: destNet,
		DestinationAsset:   "LUX",
		DestinationAddress: "0xrecipient",
		Signature:          "0xsig",
		MPCSessionID:       "sess",
		DestRawTx:          rawTx,
	}
	if err := store.Create(t.Context(), sw); err != nil {
		t.Fatalf("seed swap: %v", err)
	}
	return sw
}

// =============================================================================
// broadcastOne + state transitions
// =============================================================================

// TestBroadcast_KillSwitchHoldsDisabledDestination: the in-flight half of the
// withdrawal kill-switch (red MEDIUM). An already-signed swap whose destination
// became withdrawal-disabled is HELD — never pushed — and resumes when the flag
// is flipped back. Without this, flipping isWithdrawalEnabled:false stopped new
// signings but not swaps already at broadcasting.
func TestBroadcast_KillSwitchHoldsDisabledDestination(t *testing.T) {
	store := NewInMemoryStore()
	bc := newFakeBroadcaster()
	sw := &Swap{
		Status:             SwapStatusBroadcasting,
		DestinationNetwork: "XRP_MAINNET",
		DestinationAsset:   "XRP",
		DestRawTx:          "0xrawtx",
		Signature:          "0xsig",
	}
	if err := store.Create(t.Context(), sw); err != nil {
		t.Fatalf("seed: %v", err)
	}
	bc.okFor("XRP_MAINNET", "0xrawtx", "0xhash") // would succeed if it ran

	no, yes := false, true
	d := NewBroadcastDriver(store, bc, time.Hour, nil)

	// Disabled destination -> HELD, not broadcast, status unchanged.
	d.WithdrawalEnabled = Config{Tokens: []Token{{Network: "XRP_MAINNET", Asset: "XRP", IsWithdrawalEnabled: &no}}}.WithdrawalEnabled
	d.Tick(t.Context())
	if bc.calls.Load() != 0 {
		t.Fatalf("disabled-destination swap must NOT be broadcast; got %d calls", bc.calls.Load())
	}
	if got, _ := store.Get(t.Context(), sw.ID); got.Status != SwapStatusBroadcasting {
		t.Fatalf("held swap must stay at broadcasting (resumable), got %q", got.Status)
	}

	// Re-enable -> resumes and pushes.
	d.WithdrawalEnabled = Config{Tokens: []Token{{Network: "XRP_MAINNET", Asset: "XRP", IsWithdrawalEnabled: &yes}}}.WithdrawalEnabled
	d.Tick(t.Context())
	if bc.calls.Load() != 1 {
		t.Fatalf("re-enabled destination must broadcast; got %d calls", bc.calls.Load())
	}
}

func TestBroadcast_AdvancesOnSuccess(t *testing.T) {
	store := NewInMemoryStore()
	bc := newFakeBroadcaster()
	sw := seedBroadcastingSwap(t, store, "LUX_TESTNET", "0xrawtx")
	bc.okFor("LUX_TESTNET", "0xrawtx", "0xfinaltxhash")

	d := NewBroadcastDriver(store, bc, time.Hour, nil)
	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusCompleted {
		t.Errorf("status = %q, want completed", got.Status)
	}
	if got.DestTxHash != "0xfinaltxhash" {
		t.Errorf("DestTxHash = %q, want 0xfinaltxhash", got.DestTxHash)
	}
	stats := d.Stats()
	if stats.Successes != 1 || stats.Failures != 0 || stats.SkippedNoRawTx != 0 {
		t.Errorf("unexpected stats: %+v", stats)
	}
}

func TestBroadcast_SkipsMissingRawTx(t *testing.T) {
	store := NewInMemoryStore()
	bc := newFakeBroadcaster()
	sw := &Swap{
		Status:             SwapStatusBroadcasting,
		DestinationNetwork: "LUX_TESTNET",
		Signature:          "0xsig",
		// DestRawTx deliberately empty
	}
	_ = store.Create(t.Context(), sw)

	d := NewBroadcastDriver(store, bc, time.Hour, nil)
	d.Tick(t.Context())

	if bc.calls.Load() != 0 {
		t.Errorf("broadcaster should not have been called; got %d", bc.calls.Load())
	}
	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBroadcasting {
		t.Errorf("status should be unchanged, got %q", got.Status)
	}
	if d.Stats().SkippedNoRawTx != 1 {
		t.Errorf("expected SkippedNoRawTx=1, got %d", d.Stats().SkippedNoRawTx)
	}
}

func TestBroadcast_LeavesAtBroadcastingOnFailure(t *testing.T) {
	store := NewInMemoryStore()
	bc := newFakeBroadcaster()
	sw := seedBroadcastingSwap(t, store, "LUX_TESTNET", "0xrawtx")
	bc.failFor("LUX_TESTNET", "0xrawtx", errors.New("nonce too low"))

	d := NewBroadcastDriver(store, bc, time.Hour, nil)
	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBroadcasting {
		t.Errorf("status should remain broadcasting on failure, got %q", got.Status)
	}
	if got.DestTxHash != "" {
		t.Errorf("DestTxHash should be empty on failure, got %q", got.DestTxHash)
	}
	if d.Stats().Failures != 1 || d.Stats().Successes != 0 {
		t.Errorf("unexpected stats: %+v", d.Stats())
	}
}

// TestBroadcast_SurfacesLastErrorOnInsufficientFunds pins the UX
// contract: when the destination chain rejects with "insufficient
// funds for gas * price + value", the swap stays at broadcasting
// (retryable — user just needs to fund the release address) AND
// LastError gets a clear human label so the SPA / UI can stop
// spinning blindly and tell the user what's wrong.
func TestBroadcast_SurfacesLastErrorOnInsufficientFunds(t *testing.T) {
	store := NewInMemoryStore()
	bc := newFakeBroadcaster()
	sw := seedBroadcastingSwap(t, store, "LUX_TESTNET", "0xrawtx")
	bc.failFor("LUX_TESTNET", "0xrawtx",
		errors.New("eth_sendRawTransaction rpc -32000: insufficient funds for gas * price + value: balance 0, tx cost 1525000000021000, overshot 1525000000021000"))

	d := NewBroadcastDriver(store, bc, time.Hour, nil)
	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBroadcasting {
		t.Errorf("status should remain broadcasting (recoverable), got %q", got.Status)
	}
	if got.LastError == "" {
		t.Fatal("expected LastError to be populated on insufficient-funds failure")
	}
	if !strings.Contains(strings.ToLower(got.LastError), "insufficient funds") {
		t.Errorf("LastError should label the cause as insufficient funds; got %q", got.LastError)
	}
	// Make sure we did NOT pass through the raw geth string — that's
	// internal noise; the SDK + UI render the human label.
	if strings.Contains(got.LastError, "tx cost 1525000000021000") {
		t.Errorf("LastError should be humanized, not the raw geth message; got %q", got.LastError)
	}
}

// TestBroadcast_ClearsLastErrorOnSuccess pins that after a previously-
// failing swap finally lands, the UI no longer shows the stale error.
func TestBroadcast_ClearsLastErrorOnSuccess(t *testing.T) {
	store := NewInMemoryStore()
	bc := newFakeBroadcaster()
	sw := seedBroadcastingSwap(t, store, "LUX_TESTNET", "0xrawtx")
	// Seed a prior LastError as though the previous tick failed.
	_, _ = store.Patch(t.Context(), sw.ID, func(s *Swap) {
		s.LastError = "Insufficient funds in release address — fund the MPC address"
	})
	bc.okFor("LUX_TESTNET", "0xrawtx", "0xok")

	d := NewBroadcastDriver(store, bc, time.Hour, nil)
	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusCompleted {
		t.Fatalf("status should be completed, got %q", got.Status)
	}
	if got.LastError != "" {
		t.Errorf("LastError must be cleared on success; got %q", got.LastError)
	}
}

// TestBroadcast_HumanizesGatewayFlake confirms a 502 from the krakend
// gateway becomes a generic transient-RPC label, not the raw HTTP
// status string. Users shouldn't see internals for what's just retry.
func TestBroadcast_HumanizesGatewayFlake(t *testing.T) {
	store := NewInMemoryStore()
	bc := newFakeBroadcaster()
	sw := seedBroadcastingSwap(t, store, "LUX_TESTNET", "0xrawtx")
	bc.failFor("LUX_TESTNET", "0xrawtx", errors.New("HTTP 502: gateway error"))

	d := NewBroadcastDriver(store, bc, time.Hour, nil)
	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if !strings.Contains(strings.ToLower(got.LastError), "unreachable") {
		t.Errorf("502 should humanize to 'unreachable / retrying'; got %q", got.LastError)
	}
}

func TestBroadcast_OnlyTouchesBroadcasting(t *testing.T) {
	store := NewInMemoryStore()
	bc := newFakeBroadcaster()

	good := seedBroadcastingSwap(t, store, "LUX_TESTNET", "0xraw1")
	bc.okFor("LUX_TESTNET", "0xraw1", "0xt1")

	// Seed swaps in other states with DestRawTx populated — they
	// must NOT be touched.
	pending := &Swap{
		Status:             SwapStatusBridgeTransferPending,
		DestinationNetwork: "LUX_TESTNET",
		DestRawTx:          "0xraw_pending",
	}
	_ = store.Create(t.Context(), pending)
	completed := &Swap{
		Status:             SwapStatusCompleted,
		DestinationNetwork: "LUX_TESTNET",
		DestRawTx:          "0xraw_completed",
		DestTxHash:         "0xtt",
	}
	_ = store.Create(t.Context(), completed)

	d := NewBroadcastDriver(store, bc, time.Hour, nil)
	d.Tick(t.Context())

	if bc.calls.Load() != 1 {
		t.Errorf("expected 1 broadcast call (only the SwapStatusBroadcasting one); got %d", bc.calls.Load())
	}
	got, _ := store.Get(t.Context(), good.ID)
	if got.Status != SwapStatusCompleted {
		t.Errorf("good swap should be completed, got %q", got.Status)
	}
	got, _ = store.Get(t.Context(), pending.ID)
	if got.Status != SwapStatusBridgeTransferPending {
		t.Errorf("pending swap should not be touched, got %q", got.Status)
	}
	got, _ = store.Get(t.Context(), completed.ID)
	if got.Status != SwapStatusCompleted {
		t.Errorf("completed swap should not be re-broadcast, got %q", got.Status)
	}
}

func TestBroadcast_RoutesByDestinationNetwork(t *testing.T) {
	store := NewInMemoryStore()
	bc := newFakeBroadcaster()

	luxSwap := seedBroadcastingSwap(t, store, "LUX_TESTNET", "0xluxrawtx")
	ethSwap := seedBroadcastingSwap(t, store, "ETHEREUM_SEPOLIA", "0xethrawtx")
	bc.okFor("LUX_TESTNET", "0xluxrawtx", "0xluxhash")
	bc.okFor("ETHEREUM_SEPOLIA", "0xethrawtx", "0xethhash")

	d := NewBroadcastDriver(store, bc, time.Hour, nil)
	d.Tick(t.Context())

	if bc.calls.Load() != 2 {
		t.Errorf("expected 2 broadcasts (one per swap), got %d", bc.calls.Load())
	}
	gotLux, _ := store.Get(t.Context(), luxSwap.ID)
	gotEth, _ := store.Get(t.Context(), ethSwap.ID)
	if gotLux.DestTxHash != "0xluxhash" {
		t.Errorf("LUX_TESTNET swap got %q, want 0xluxhash", gotLux.DestTxHash)
	}
	if gotEth.DestTxHash != "0xethhash" {
		t.Errorf("ETHEREUM_SEPOLIA swap got %q, want 0xethhash", gotEth.DestTxHash)
	}
}

func TestBroadcast_IdempotentAcrossTicks(t *testing.T) {
	store := NewInMemoryStore()
	bc := newFakeBroadcaster()
	sw := seedBroadcastingSwap(t, store, "LUX_TESTNET", "0xrawtx")
	bc.okFor("LUX_TESTNET", "0xrawtx", "0xfinal")

	d := NewBroadcastDriver(store, bc, time.Hour, nil)
	d.Tick(t.Context())
	d.Tick(t.Context())
	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusCompleted {
		t.Errorf("status = %q, want completed", got.Status)
	}
	if bc.calls.Load() != 1 {
		t.Errorf("expected 1 broadcast across 3 ticks (post-advance filtered); got %d", bc.calls.Load())
	}
}

// =============================================================================
// Lifecycle
// =============================================================================

func TestBroadcastDriver_Run_StopsOnContextCancel(t *testing.T) {
	d := NewBroadcastDriver(NewInMemoryStore(), newFakeBroadcaster(), 30*time.Millisecond, nil)
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)
	go func() { done <- d.Run(ctx) }()
	time.Sleep(80 * time.Millisecond)
	if !d.Running() {
		t.Error("Running() should be true")
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

func TestBroadcastDriver_RefusesDoubleStart(t *testing.T) {
	d := NewBroadcastDriver(NewInMemoryStore(), newFakeBroadcaster(), 50*time.Millisecond, nil)
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	go func() { _ = d.Run(ctx) }()
	time.Sleep(20 * time.Millisecond)
	if err := d.Run(ctx); err != nil {
		t.Errorf("second Run should return nil, got %v", err)
	}
}

func TestBroadcastDriver_Stop_Idempotent(t *testing.T) {
	d := NewBroadcastDriver(NewInMemoryStore(), newFakeBroadcaster(), time.Second, nil)
	d.Stop()
	d.Stop()
}

func TestBroadcastDriverStats_StartsZero(t *testing.T) {
	d := NewBroadcastDriver(NewInMemoryStore(), newFakeBroadcaster(), time.Second, nil)
	s := d.Stats()
	if s.Ticks != 0 || s.Attempts != 0 || s.Successes != 0 ||
		s.Failures != 0 || s.SkippedNoRawTx != 0 || s.ListErrors != 0 {
		t.Errorf("expected zero stats, got %+v", s)
	}
}

// =============================================================================
// End-to-end with txassembler — produces a wire-correct raw tx
// =============================================================================

// This is the canonical e2e: deposit watcher confirms funds, signing
// driver (WITH the assembler) builds the destination tx + asks MPC to
// sign it + finalizes the raw signed tx, broadcast driver pushes it.
// All chain boundaries use fakes; the assembler produces a real
// EIP-155 RLP-encoded tx (not a placeholder).
func TestEndToEnd_FullPipelineWithAssembler(t *testing.T) {
	store := NewInMemoryStore()
	depCheck := newFakeChecker()
	signer := newFakeSigner()
	bcaster := newFakeBroadcaster()

	mpcAddr := "0x3535353535353535353535353535353535353535"
	sw := &Swap{
		Status:             SwapStatusUserDepositPending,
		Amount:             0.1,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		SourceAsset:        "ETH",
		DestinationNetwork: "LUX_TESTNET",
		DestinationAsset:   "LUX",
		DestinationAddress: "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
		DepositAddress:     "wallet-e2e-asm###" + mpcAddr,
		UseDepositAddress:  true,
	}
	if err := store.Create(t.Context(), sw); err != nil {
		t.Fatal(err)
	}

	// Stage 1: deposit confirmed → bridge_transfer_pending.
	depCheck.setVerdict("ETHEREUM_SEPOLIA", mpcAddr, true)
	NewDepositWatcher(store, depCheck, time.Hour, nil).Tick(t.Context())
	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBridgeTransferPending {
		t.Fatalf("after deposit watcher: %q", got.Status)
	}

	// Stage 2: signing driver with assembler → broadcasting + DestRawTx.
	prov := &txassembler.StaticProvider{
		Nonces:   map[string]uint64{"LUX_TESTNET|3535353535353535353535353535353535353535": 0},
		GasPrice: map[string]*big.Int{"LUX_TESTNET": big.NewInt(25_000_000_000)},
	}
	asm := txassembler.New(prov)
	asm.SetNetwork("LUX_TESTNET", txassembler.PerNetwork{
		ChainID:         big.NewInt(96368),
		DefaultGasLimit: 21000,
		NativeDecimals:  18,
	})

	// Synthetic 65-byte signature with recoveryID=0.
	sigHex := "0x" + strings.Repeat("01", 32) + strings.Repeat("02", 32) + "00"
	signer.ok("wallet-e2e-asm", sigHex, "sess-e2e-asm")

	sd := NewSigningDriver(store, signer, time.Hour, nil)
	sd.SetAssembler(asm)
	sd.Tick(t.Context())

	got, _ = store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBroadcasting {
		t.Fatalf("after signing driver: %q", got.Status)
	}
	if got.DestRawTx == "" {
		t.Fatal("DestRawTx should be populated by the assembler — no manual patch needed")
	}
	// The raw tx should decode as RLP (broadcasts as eth_sendRawTransaction).
	if !strings.HasPrefix(got.DestRawTx, "0x") {
		t.Errorf("DestRawTx should be 0x-prefixed, got %q", got.DestRawTx[:10])
	}

	// Stage 3: broadcast driver pushes the assembler-produced raw tx.
	bcaster.okFor("LUX_TESTNET", got.DestRawTx, "0xfinal-e2e-asm-txhash")
	NewBroadcastDriver(store, bcaster, time.Hour, nil).Tick(t.Context())

	got, _ = store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusCompleted {
		t.Fatalf("after broadcast: %q, want completed", got.Status)
	}
	if got.DestTxHash != "0xfinal-e2e-asm-txhash" {
		t.Errorf("DestTxHash = %q", got.DestTxHash)
	}
}

// =============================================================================
// End-to-end: deposit → signing → broadcasting → completed (all drivers, no assembler)
// =============================================================================

func TestEndToEnd_AllDriversChained(t *testing.T) {
	// Compose all three drivers + their fakes into a single in-process
	// pipeline and run a swap from user_deposit_pending all the way
	// through to completed.
	store := NewInMemoryStore()

	// Fakes for each chain interaction.
	depCheck := newFakeChecker()
	signer := newFakeSigner()
	bcaster := newFakeBroadcaster()

	// Seed a swap as if the SDK + mchain.KeygenForDeposit had just run.
	sw := &Swap{
		Status:             SwapStatusUserDepositPending,
		Amount:             0.1,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		SourceAsset:        "ETH",
		DestinationNetwork: "LUX_TESTNET",
		DestinationAsset:   "LUX",
		DestinationAddress: "0xrecipient",
		DepositAddress:     "wallet-e2e###0xdepositaddr",
		UseDepositAddress:  true,
	}
	if err := store.Create(t.Context(), sw); err != nil {
		t.Fatal(err)
	}

	// Stage 1: deposit watcher confirms funds → bridge_transfer_pending.
	depCheck.setVerdict("ETHEREUM_SEPOLIA", "0xdepositaddr", true)
	wWatch := NewDepositWatcher(store, depCheck, time.Hour, nil)
	wWatch.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBridgeTransferPending {
		t.Fatalf("after deposit watcher: status = %q, want bridge_transfer_pending", got.Status)
	}

	// Stage 2: signing driver gets MPC signature → broadcasting.
	signer.ok("wallet-e2e", "0xsig-e2e", "sess-e2e")
	wSign := NewSigningDriver(store, signer, time.Hour, nil)
	wSign.Tick(t.Context())

	got, _ = store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBroadcasting {
		t.Fatalf("after signing driver: status = %q, want broadcasting", got.Status)
	}
	if got.Signature != "0xsig-e2e" {
		t.Errorf("Signature = %q, want 0xsig-e2e", got.Signature)
	}

	// Stage 3 SETUP: the tx assembler would populate DestRawTx between
	// signing and broadcasting. Until that lands, fake it here so the
	// broadcast driver has something to push.
	_, _ = store.Patch(t.Context(), sw.ID, func(s *Swap) {
		s.DestRawTx = "0xraw-tx-e2e"
	})
	bcaster.okFor("LUX_TESTNET", "0xraw-tx-e2e", "0xfinal-tx-hash-e2e")

	// Stage 3: broadcast driver pushes → completed.
	wBcast := NewBroadcastDriver(store, bcaster, time.Hour, nil)
	wBcast.Tick(t.Context())

	got, _ = store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusCompleted {
		t.Fatalf("after broadcast driver: status = %q, want completed", got.Status)
	}
	if got.DestTxHash != "0xfinal-tx-hash-e2e" {
		t.Errorf("DestTxHash = %q, want 0xfinal-tx-hash-e2e", got.DestTxHash)
	}
}

// =============================================================================
// humanizeBroadcastErr — XRP engine_result mapping
// =============================================================================

func TestHumanizeBroadcastErr_XRPEngineResults(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		// XRP-specific mappings.
		{"submit rpc 0: fatal engine_result=tecINSUFFICIENT_FUNDS: insufficient", "Insufficient funds in release address"},
		{"submit rpc 0: fatal engine_result=tecNO_DST: destination not found", "destination account is not activated"},
		{"submit rpc 0: fatal engine_result=tefPAST_SEQ: sequence already used", "sequence already used"},
		{"submit rpc 0: fatal engine_result=temBAD_AMOUNT: bad amount", "malformed"},
		{"submit rpc 0: retryable engine_result=telINSUF_FEE_P: fee too low", "fee too low for current load"},
		// Existing EVM behaviour preserved.
		{"insufficient funds for gas * price + value", "Insufficient funds in release address"},
		{"nonce too low", "Nonce stale"},
		{"HTTP 503: gateway", "Destination RPC unreachable"},
	}
	for _, c := range cases {
		got := humanizeBroadcastErr(stringErr(c.in))
		if !contains(got, c.want) {
			t.Errorf("humanizeBroadcastErr(%q) = %q\n want substring %q", c.in, got, c.want)
		}
	}
}

func contains(haystack, needle string) bool {
	return haystack != "" && (haystack == needle || (len(needle) > 0 && stringIndex(haystack, needle) >= 0))
}

func stringIndex(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}

type stringErr string

func (s stringErr) Error() string { return string(s) }
