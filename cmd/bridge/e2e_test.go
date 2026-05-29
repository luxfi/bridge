package main

// e2e_test.go — composes all four drivers + the API + the swap store
// against fakes for external systems (source-chain RPC, mpcd,
// destination-chain RPC). The point is not to test any single
// component (those have their own unit tests) but to lock in the
// composition: a swap that enters the API on one end actually walks
// the full state machine and exits Completed (or Refunded, or
// Cancelled) deterministically.
//
// Each driver is constructed real but Run() is NOT called — we tick
// each driver explicitly so the test is fully deterministic. No
// goroutines, no time.Sleep races.

import (
	"context"
	"encoding/json"
	"errors"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/hanzoai/zip"
	middleware "github.com/hanzoai/zip/middleware"

	"github.com/luxfi/bridge/internal/mchain"
	"github.com/luxfi/bridge/internal/solanarpc"
	"github.com/luxfi/bridge/internal/txassembler"
)

// =============================================================================
// stubSolanaProvider — fixed-blockhash provider for the Lux→Sol e2e
// =============================================================================

// stubSolanaProvider returns a programmable blockhash + LastValidBlockHeight
// pair, without any HTTP traffic. Keeps the Solana e2e test as deterministic
// as the EVM one.
type stubSolanaProvider struct {
	blockhash            string
	lastValidBlockHeight uint64
}

func (s *stubSolanaProvider) GetLatestBlockhash(_ context.Context) (*solanarpc.LatestBlockhash, error) {
	return &solanarpc.LatestBlockhash{
		Blockhash:            s.blockhash,
		LastValidBlockHeight: s.lastValidBlockHeight,
	}, nil
}

// =============================================================================
// e2eRig — every wire in one place
// =============================================================================

// e2eRig holds the API + all four drivers + every fake the drivers
// touch. Construct via newE2ERig. Walk a swap through with
// rig.tickWatcher(), rig.tickSigner(), etc.
type e2eRig struct {
	t   *testing.T
	app *zip.App
	api *API

	store *InMemoryStore

	// Drivers — real, ticked manually.
	watcher  *DepositWatcher
	signer   *SigningDriver
	bcastDrv *BroadcastDriver
	refundDr *RefundDriver

	// Fakes — programmable to simulate each external dependency.
	checker    *fakeChecker         // source-chain deposit RPC
	mpc        *fakeSigner          // mpcd /sign
	bcast      *fakeBroadcaster     // destination-chain eth_sendRawTransaction
	asmProv    *txassembler.StaticProvider
	relStore   *stubReleaseStore

	// Wallet identifiers for swap creation — keep them stable so
	// fakeSigner.ok() can be configured per-test.
	depositWalletID string
	depositAddr     string
	releaseWalletID string
	releaseAddr     string
}

// newE2ERig assembles the full pipeline. Source = ETHEREUM_SEPOLIA
// (ETH), destination = LUX_TESTNET (LUX). The choice is arbitrary
// but pins the test to chains the assembler and config already know.
func newE2ERig(t *testing.T) *e2eRig {
	t.Helper()

	cfg, _ := LoadConfig("")
	store := NewInMemoryStore()
	engine := &QuoteEngine{Feed: NewStaticPriceFeed(defaultPrices())}

	// Wallet identifiers — stable strings so the test can configure
	// the fake signer + broadcaster by walletID.
	depositWalletID := "deposit-wallet-test"
	depositAddr := "0xdeadbeef00000000000000000000000000000001"
	releaseWalletID := "release-wallet-LUX_TESTNET"
	releaseAddr := "0xcafebabe00000000000000000000000000000002"

	// Release store stubbed so swapsCreateNative can stamp the
	// release fields on the swap row.
	relStore := newStubReleaseStore()
	relStore.set("LUX_TESTNET", releaseWalletID, releaseAddr)

	// Mchain client — fake the keygen path inline so the API's
	// keygen branch in swapsCreateNative produces a wallet whose
	// LegacyDepositString matches what extractDepositAddress will
	// return as `depositAddr`.
	mc := newMchainKeygenStub(t, depositWalletID, depositAddr)

	api := NewAPI(cfg, "", nil, mc, nil, store, engine)
	api.SetReleaseStore(relStore)

	app := zip.New(zip.Config{AppName: "bridge-e2e", DisableStartupMessage: true})
	app.Use(middleware.Recover(), middleware.RequestID())
	api.Register(app)

	// Drivers — real, ticked manually.
	checker := newFakeChecker()
	mpcFake := newFakeSigner()
	bcastFake := newFakeBroadcaster()
	asmProv := &txassembler.StaticProvider{
		Nonces:   map[string]uint64{},
		GasPrice: map[string]*big.Int{},
	}
	asm := txassembler.New(asmProv)
	asm.SetNetwork("LUX_TESTNET", txassembler.PerNetwork{
		ChainID:            big.NewInt(96368),
		NativeDecimals:     18,
		DefaultGasPriceWei: big.NewInt(1_000_000_000),
	})
	asm.SetNetwork("ETHEREUM_SEPOLIA", txassembler.PerNetwork{
		ChainID:            big.NewInt(11155111),
		NativeDecimals:     18,
		DefaultGasPriceWei: big.NewInt(1_000_000_000),
	})

	watcher := NewDepositWatcher(store, checker, time.Hour, nil)
	signer := NewSigningDriver(store, mpcFake, time.Hour, nil)
	signer.SetAssembler(asm)
	bcastDrv := NewBroadcastDriver(store, bcastFake, time.Hour, nil)
	refundDr := NewRefundDriver(store, mpcFake, bcastFake, asm, time.Hour, time.Second, nil, nil)

	// Wire into API for /metrics observability.
	api.SetDepositWatcher(watcher)
	api.SetSigningDriver(signer)
	api.SetBroadcastDriver(bcastDrv)
	api.SetRefundDriver(refundDr)

	return &e2eRig{
		t: t, app: app, api: api, store: store,
		watcher: watcher, signer: signer, bcastDrv: bcastDrv, refundDr: refundDr,
		checker: checker, mpc: mpcFake, bcast: bcastFake, asmProv: asmProv, relStore: relStore,
		depositWalletID: depositWalletID,
		depositAddr:     depositAddr,
		releaseWalletID: releaseWalletID,
		releaseAddr:     releaseAddr,
	}
}

// createSwap POSTs a swap-create request through the real API
// handler. Returns the swap ID assigned by the store.
func (r *e2eRig) createSwap(useDepositAddress bool) string {
	r.t.Helper()
	body, _ := json.Marshal(map[string]any{
		"source_network":      "ETHEREUM_SEPOLIA",
		"source_asset":        "ETH",
		"destination_network": "LUX_TESTNET",
		"destination_asset":   "LUX",
		"destination_address": "0x1111111111111111111111111111111111111111",
		"sender":              "0x2222222222222222222222222222222222222222",
		"amount":              0.01,
		"use_deposit_address": useDepositAddress,
	})
	status, respBody := fireRequest(r.t, r.app, "POST", "/v1/bridge/swaps", body)
	if status != 200 {
		r.t.Fatalf("create swap: status=%d body=%s", status, respBody)
	}
	var resp struct {
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(respBody, &resp); err != nil {
		r.t.Fatalf("decode create: %v body=%s", err, respBody)
	}
	if resp.Data.ID == "" {
		r.t.Fatalf("create response missing id: %s", respBody)
	}
	return resp.Data.ID
}

// scrape returns the current /metrics body as a string.
func (r *e2eRig) scrape() string {
	r.t.Helper()
	_, body := fireRequest(r.t, r.app, "GET", "/metrics", nil)
	return string(body)
}

// getSwap returns the swap row from the store.
func (r *e2eRig) getSwap(id string) *Swap {
	r.t.Helper()
	sw, err := r.store.Get(context.Background(), id)
	if err != nil {
		r.t.Fatalf("get swap %s: %v", id, err)
	}
	return sw
}

// =============================================================================
// mchainKeygenStub — minimal *mchain.Client substitute for the API path
// =============================================================================

// newMchainKeygenStub stands up an httptest /keygen server whose
// response shapes a Wallet whose LegacyDepositString matches
// "<walletID>###<address>" — exactly what extractDepositAddress
// expects to unpack.
func newMchainKeygenStub(t *testing.T, walletID, address string) *mchain.Client {
	t.Helper()
	body := map[string]any{
		"wallet_id":      walletID,
		"address":        address,
		"eth_address":    address,
		"public_key":     "0x" + strings.Repeat("a", 64),
		"eth_public_key": "0x" + strings.Repeat("a", 64),
	}
	return newKeygenStubClient(t, body)
}

// newKeygenStubClient returns a *mchain.Client pointed at an httptest
// server that serves the given keygen response for every /keygen call.
// Wraps newKeygenServer (the existing pool-test helper) so the e2e
// suite reuses that machinery.
func newKeygenStubClient(t *testing.T, _ any) *mchain.Client {
	t.Helper()
	ks := newKeygenServer(t, "0xdeadbeef00000000000000000000000000000001")
	return &mchain.Client{APIURL: ks.URL, OrgID: "e2e", Timeout: 2 * time.Second}
}

// =============================================================================
// Happy path: create → deposit → sign → broadcast → completed
// =============================================================================

func TestE2E_HappyPath(t *testing.T) {
	rig := newE2ERig(t)
	swapID := rig.createSwap(true)

	// Initial state.
	sw := rig.getSwap(swapID)
	if sw.Status != SwapStatusUserDepositPending {
		t.Fatalf("after create: status = %q, want user_deposit_pending", sw.Status)
	}
	if sw.DepositAddress == "" {
		t.Fatal("after create: DepositAddress empty — MPC keygen path didn't fire")
	}
	if sw.ReleaseAddress != rig.releaseAddr {
		t.Errorf("after create: ReleaseAddress = %q, want %q", sw.ReleaseAddress, rig.releaseAddr)
	}

	// Stage 1 — deposit watcher: configure checker to confirm.
	rig.checker.setVerdict("ETHEREUM_SEPOLIA", rig.depositAddr, true)
	rig.watcher.Tick(t.Context())
	sw = rig.getSwap(swapID)
	if sw.Status != SwapStatusBridgeTransferPending {
		t.Fatalf("after watcher tick: status = %q, want bridge_transfer_pending", sw.Status)
	}
	if rig.watcher.Stats().Advances != 1 {
		t.Errorf("watcher advances = %d, want 1", rig.watcher.Stats().Advances)
	}

	// Stage 2 — signing driver: configure mpcd to return a sig for the
	// release wallet (settlement-leg signing is FROM the release wallet
	// per the deposit-vs-release wallet split).
	rig.mpc.ok(rig.releaseWalletID,
		"0x"+strings.Repeat("01", 32)+strings.Repeat("02", 32)+"1b",
		"sess-001")
	rig.signer.Tick(t.Context())
	sw = rig.getSwap(swapID)
	if sw.Status != SwapStatusBroadcasting {
		t.Fatalf("after signer tick: status = %q, want broadcasting (LastError=%q)", sw.Status, sw.LastError)
	}
	if sw.DestRawTx == "" {
		t.Error("after signer tick: DestRawTx empty — assembler didn't finalize")
	}
	if rig.signer.Stats().Successes != 1 {
		t.Errorf("signer successes = %d, want 1", rig.signer.Stats().Successes)
	}

	// Stage 3 — broadcast driver: configure to accept the raw tx.
	rig.bcast.okFor("LUX_TESTNET", sw.DestRawTx, "0xfinaltxhash")
	rig.bcastDrv.Tick(t.Context())
	sw = rig.getSwap(swapID)
	if sw.Status != SwapStatusCompleted {
		t.Fatalf("after broadcast tick: status = %q, want completed (LastError=%q)", sw.Status, sw.LastError)
	}
	if sw.DestTxHash != "0xfinaltxhash" {
		t.Errorf("DestTxHash = %q, want 0xfinaltxhash", sw.DestTxHash)
	}
	if rig.bcastDrv.Stats().Successes != 1 {
		t.Errorf("broadcast successes = %d, want 1", rig.bcastDrv.Stats().Successes)
	}

	// /metrics sanity — every counter we incremented should appear with
	// the right value. Locks in the metric-name shape against rename
	// regressions.
	body := rig.scrape()
	for _, want := range []string{
		"bridge_deposit_watcher_advances_total 1",
		"bridge_signing_successes_total 1",
		"bridge_broadcast_successes_total 1",
		`bridge_swaps_by_status{status="completed"} 1`,
		`bridge_swaps_by_status{status="user_deposit_pending"} 0`,
	} {
		if !strings.Contains(body, want) {
			t.Errorf("metrics missing %q", want)
		}
	}
}

// =============================================================================
// Signing-ceiling path: create → deposit → signer fails N times → refund
// =============================================================================

// TestE2E_SigningCeilingTriggersRefund proves the hardening pass we
// shipped: persistent signing failures (e.g. destination chain with
// no tx assembler) hit the ceiling and the swap rolls back to
// refund_pending instead of looping forever.
func TestE2E_SigningCeilingTriggersRefund(t *testing.T) {
	rig := newE2ERig(t)
	rig.signer.SetMaxSigningAttempts(2)

	swapID := rig.createSwap(true)
	rig.checker.setVerdict("ETHEREUM_SEPOLIA", rig.depositAddr, true)
	rig.watcher.Tick(t.Context())
	if rig.getSwap(swapID).Status != SwapStatusBridgeTransferPending {
		t.Fatal("watcher should have advanced the swap")
	}

	// Signer fails persistently — simulates a non-EVM destination
	// (txassembler returns "no config for network") or a destination
	// RPC outage.
	rig.mpc.fail(rig.releaseWalletID, errors.New("destination RPC unreachable"))

	// Tick to the ceiling. The signing driver bumps SigningAttempts
	// and rolls the swap to refund_pending on the Nth attempt.
	for i := 0; i < 3; i++ {
		rig.signer.Tick(t.Context())
	}
	sw := rig.getSwap(swapID)
	if sw.Status != SwapStatusRefundPending {
		t.Fatalf("after ceiling: status = %q, want refund_pending (LastError=%q, SigningAttempts=%d)",
			sw.Status, sw.LastError, sw.SigningAttempts)
	}
}

// =============================================================================
// Expire path: create → no deposit → time passes → cancelled
// =============================================================================

// TestE2E_StalePendingExpiresToCancelled proves the auto-expire pass:
// a user creates a quote, never sends the deposit, the deposit
// watcher auto-cancels the swap after --deposit-expire-after.
func TestE2E_StalePendingExpiresToCancelled(t *testing.T) {
	rig := newE2ERig(t)
	rig.watcher.SetExpireAfter(1 * time.Hour)

	// Pin store.now to back-date CreatedAt — mirrors the pattern in
	// refund_driver_test.go (seedOrphanedRefundingSwap).
	realNow := rig.store.now
	pinned := realNow().Add(-2 * time.Hour)
	rig.store.now = func() time.Time { return pinned }
	swapID := rig.createSwap(true)
	rig.store.now = realNow

	// No deposit, but tick the watcher — checker returns false for
	// every address by default → checkOne skips → maybeExpire fires
	// because age > threshold.
	rig.watcher.Tick(t.Context())

	sw := rig.getSwap(swapID)
	if sw.Status != SwapStatusCancelled {
		t.Fatalf("after expiry tick: status = %q, want cancelled (LastError=%q)", sw.Status, sw.LastError)
	}
	if !strings.Contains(sw.LastError, "Auto-cancelled") {
		t.Errorf("LastError = %q, want substring 'Auto-cancelled'", sw.LastError)
	}
	if rig.watcher.Stats().Expired != 1 {
		t.Errorf("watcher expired = %d, want 1", rig.watcher.Stats().Expired)
	}

	// Metrics reflect.
	body := rig.scrape()
	if !strings.Contains(body, "bridge_deposit_watcher_expired_total 1") {
		t.Error("metrics missing bridge_deposit_watcher_expired_total 1")
	}
}

// =============================================================================
// Composition: metrics after a full happy-path + an expired pending
// =============================================================================

// TestE2E_MetricsReflectCompositeRun verifies the per-status gauge +
// counters compose correctly when multiple swaps walk different
// paths concurrently. Belt-and-braces against accidental
// label-set drift or counter-name typos.
func TestE2E_MetricsReflectCompositeRun(t *testing.T) {
	rig := newE2ERig(t)
	rig.watcher.SetExpireAfter(1 * time.Hour)

	// Swap A — happy path.
	idA := rig.createSwap(true)
	rig.checker.setVerdict("ETHEREUM_SEPOLIA", rig.depositAddr, true)
	rig.watcher.Tick(t.Context())
	rig.mpc.ok(rig.releaseWalletID,
		"0x"+strings.Repeat("01", 32)+strings.Repeat("02", 32)+"1b",
		"sess-A")
	rig.signer.Tick(t.Context())
	swA := rig.getSwap(idA)
	rig.bcast.okFor("LUX_TESTNET", swA.DestRawTx, "0xhashA")
	rig.bcastDrv.Tick(t.Context())

	// Swap B — created stale, expires. Clear the checker's verdict
	// for the deposit address so B does NOT advance to
	// bridge_transfer_pending (both swaps share the same deposit
	// address because the fake mpc keygen returns the same response —
	// in a real cluster, each keygen mints a fresh wallet).
	rig.checker.setVerdict("ETHEREUM_SEPOLIA", rig.depositAddr, false)
	realNow := rig.store.now
	pinned := realNow().Add(-2 * time.Hour)
	rig.store.now = func() time.Time { return pinned }
	idB := rig.createSwap(true)
	rig.store.now = realNow
	rig.watcher.Tick(t.Context())

	swA = rig.getSwap(idA)
	swB := rig.getSwap(idB)
	if swA.Status != SwapStatusCompleted {
		t.Fatalf("A status = %q, want completed", swA.Status)
	}
	if swB.Status != SwapStatusCancelled {
		t.Fatalf("B status = %q, want cancelled", swB.Status)
	}

	body := rig.scrape()
	for _, want := range []string{
		`bridge_swaps_by_status{status="completed"} 1`,
		`bridge_swaps_by_status{status="cancelled"} 1`,
		`bridge_swaps_by_status{status="user_deposit_pending"} 0`,
		"bridge_deposit_watcher_expired_total 1",
		"bridge_signing_successes_total 1",
		"bridge_broadcast_successes_total 1",
		"bridge_signing_running 0",   // not Run()-ing in tests
		"bridge_broadcast_running 0", // ditto
	} {
		if !strings.Contains(body, want) {
			t.Errorf("composite metrics missing %q", want)
		}
	}
}

// =============================================================================
// Lux → Solana cross-family happy path
// =============================================================================

// Reference base58 values used throughout the Solana e2e fixtures.
// Picked once so the test diff is easy to read; they don't need to
// be on-curve — the assembler never derives a real ed25519 point
// from them, just decodes the 32-byte payload.
const (
	e2eSolanaBlockhash     = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"
	e2eSolanaReleaseAddr   = "DRpbCBMxVnDK7maPM5tGv6MvB3v1sRMC86PZ8okm21hy"
	e2eSolanaRecipientAddr = "Hk5h7Cf68HrLqZj3PaaT9KQpgr1mEZQ5oG2cxQUEr5pa"
	e2eSolanaTxSignature   = "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW"
)

// newE2ERigLuxToSol builds the e2e rig with source=LUX_TESTNET and
// destination=SOLANA_DEVNET. Compared to newE2ERig:
//
//   - Source-chain deposit watcher polls LUX_TESTNET (Lux is EVM
//     at the wallet leg, so depositcheck behaves the same as the
//     ETHEREUM_SEPOLIA case).
//   - Release wallet is base58 (Solana ed25519 pubkey).
//   - Signing driver gets a Solana blockhash provider so PreSignSolana
//     stamps a fixed blockhash on the message bytes.
//
// All other wires are identical — the point is that adding a Solana
// destination is a configuration change, not a state-machine change.
func newE2ERigLuxToSol(t *testing.T) *e2eRig {
	t.Helper()

	cfg, _ := LoadConfig("")
	store := NewInMemoryStore()
	engine := &QuoteEngine{Feed: NewStaticPriceFeed(defaultPrices())}

	depositWalletID := "deposit-wallet-lux-to-sol"
	// Must match the address baked into newKeygenStubClient's
	// httptest server response — it ignores the walletID/address
	// args and always returns "...0001". The watcher reads
	// swap.DepositAddress, which is populated from that response.
	depositAddr := "0xdeadbeef00000000000000000000000000000001"
	releaseWalletID := "release-wallet-SOLANA_DEVNET"

	relStore := newStubReleaseStore()
	relStore.set("SOLANA_DEVNET", releaseWalletID, e2eSolanaReleaseAddr)

	mc := newMchainKeygenStub(t, depositWalletID, depositAddr)

	api := NewAPI(cfg, "", nil, mc, nil, store, engine)
	api.SetReleaseStore(relStore)

	app := zip.New(zip.Config{AppName: "bridge-e2e-sol", DisableStartupMessage: true})
	app.Use(middleware.Recover(), middleware.RequestID())
	api.Register(app)

	checker := newFakeChecker()
	mpcFake := newFakeSigner()
	bcastFake := newFakeBroadcaster()
	asmProv := &txassembler.StaticProvider{
		Nonces:   map[string]uint64{},
		GasPrice: map[string]*big.Int{},
	}
	asm := txassembler.New(asmProv)
	// LUX_TESTNET is the source — PreSign on the Solana destination
	// doesn't read this PerNetwork entry, but the refund flow (if
	// triggered) might. Register both for robustness.
	asm.SetNetwork("LUX_TESTNET", txassembler.PerNetwork{
		ChainID:            big.NewInt(96368),
		NativeDecimals:     18,
		DefaultGasPriceWei: big.NewInt(1_000_000_000),
	})

	watcher := NewDepositWatcher(store, checker, time.Hour, nil)
	signer := NewSigningDriver(store, mpcFake, time.Hour, nil)
	signer.SetAssembler(asm)
	signer.SetSolanaProvider(&stubSolanaProvider{
		blockhash:            e2eSolanaBlockhash,
		lastValidBlockHeight: 12345,
	})
	bcastDrv := NewBroadcastDriver(store, bcastFake, time.Hour, nil)
	refundDr := NewRefundDriver(store, mpcFake, bcastFake, asm, time.Hour, time.Second, nil, nil)

	api.SetDepositWatcher(watcher)
	api.SetSigningDriver(signer)
	api.SetBroadcastDriver(bcastDrv)
	api.SetRefundDriver(refundDr)

	return &e2eRig{
		t: t, app: app, api: api, store: store,
		watcher: watcher, signer: signer, bcastDrv: bcastDrv, refundDr: refundDr,
		checker: checker, mpc: mpcFake, bcast: bcastFake, asmProv: asmProv, relStore: relStore,
		depositWalletID: depositWalletID,
		depositAddr:     depositAddr,
		releaseWalletID: releaseWalletID,
		releaseAddr:     e2eSolanaReleaseAddr,
	}
}

// createSwapLuxToSol fires a swap-create request for LUX→SOL on the
// rig's API. Returns the swap ID. Mirrors createSwap but with the
// destination_network/asset/address triple swapped for the Solana
// side — kept as a separate helper rather than parameters because
// the bodies diverge nowhere else and call-sites read cleaner.
func (r *e2eRig) createSwapLuxToSol() string {
	r.t.Helper()
	body, _ := json.Marshal(map[string]any{
		"source_network":      "LUX_TESTNET",
		"source_asset":        "LUX",
		"destination_network": "SOLANA_DEVNET",
		"destination_asset":   "SOL",
		"destination_address": e2eSolanaRecipientAddr,
		"sender":              "0x2222222222222222222222222222222222222222",
		"amount":              1.0, // 1 LUX → ~0.0166 SOL at defaultPrices ($2.50 / $150)
		"use_deposit_address": true,
	})
	status, respBody := fireRequest(r.t, r.app, "POST", "/v1/bridge/swaps", body)
	if status != 200 {
		r.t.Fatalf("create lux→sol swap: status=%d body=%s", status, respBody)
	}
	var resp struct {
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(respBody, &resp); err != nil {
		r.t.Fatalf("decode create lux→sol: %v body=%s", err, respBody)
	}
	if resp.Data.ID == "" {
		r.t.Fatalf("create lux→sol response missing id: %s", respBody)
	}
	return resp.Data.ID
}

// TestE2E_HappyPath_LuxToSol walks a LUX→SOL swap through the full
// pipeline and locks in:
//
//   - Swap creation mints an MPC deposit wallet on LUX (EVM) AND a
//     base58 release wallet on Solana (via the stubReleaseStore).
//   - The deposit watcher advances on LUX deposit detection
//     (depositcheck treats LUX as EVM — no Solana-specific path).
//   - The signing driver dispatches on family: SOLANA_DEVNET →
//     PreSignSolana → SignForWallet(ed25519 hex sig) → FinalizeSolana
//     → base58 raw tx.
//   - The broadcaster receives the base58 raw tx and the
//     fakeBroadcaster returns a base58 Solana signature as the
//     dest tx hash.
//   - DestTxHash on the final swap row is the base58 signature
//     (NOT a 0x-prefixed hex hash) — the SDK uses this in its
//     explorer-link template.
func TestE2E_HappyPath_LuxToSol(t *testing.T) {
	rig := newE2ERigLuxToSol(t)
	swapID := rig.createSwapLuxToSol()

	// Initial state — release address must be the base58 Solana
	// pubkey (not the hex deposit address). Catches misrouting bugs
	// where the SwapStore copies the wrong field.
	sw := rig.getSwap(swapID)
	if sw.Status != SwapStatusUserDepositPending {
		t.Fatalf("after create: status = %q, want user_deposit_pending", sw.Status)
	}
	if sw.ReleaseAddress != e2eSolanaReleaseAddr {
		t.Errorf("after create: ReleaseAddress = %q, want %q", sw.ReleaseAddress, e2eSolanaReleaseAddr)
	}
	if sw.DepositAddress == "" {
		t.Fatal("after create: DepositAddress empty — MPC keygen for LUX didn't fire")
	}

	// Stage 1 — Lux deposit detected.
	rig.checker.setVerdict("LUX_TESTNET", rig.depositAddr, true)
	rig.watcher.Tick(t.Context())
	sw = rig.getSwap(swapID)
	if sw.Status != SwapStatusBridgeTransferPending {
		t.Fatalf("after watcher tick: status = %q, want bridge_transfer_pending", sw.Status)
	}

	// Stage 2 — signing driver dispatches on destination family.
	// For SOLANA_DEVNET, signer calls PreSignSolana → returns
	// hex-encoded 64-byte ed25519 sig (128 chars). Use a recognizable
	// pattern (0x01...0x40) so the test failure message is readable
	// if Finalize concatenates the wrong slice.
	sigHex := strings.Repeat("0102030405060708", 8) // 64 bytes = 128 hex chars
	if len(sigHex) != 128 {
		t.Fatalf("test setup: sigHex must be 128 chars, got %d", len(sigHex))
	}
	rig.mpc.ok(rig.releaseWalletID, sigHex, "sess-sol-001")
	rig.signer.Tick(t.Context())
	sw = rig.getSwap(swapID)
	if sw.Status != SwapStatusBroadcasting {
		t.Fatalf("after signer tick: status = %q, want broadcasting (LastError=%q)",
			sw.Status, sw.LastError)
	}
	if sw.DestRawTx == "" {
		t.Fatal("after signer tick: DestRawTx empty — FinalizeSolana didn't run")
	}
	// DestRawTx for Solana is the base58-encoded full tx — NOT a
	// 0x-prefixed hex string. Regression guard against the driver
	// accidentally falling through to EVM Finalize.
	if strings.HasPrefix(sw.DestRawTx, "0x") {
		t.Errorf("DestRawTx looks like EVM hex (got %q), expected base58", sw.DestRawTx)
	}

	// Stage 3 — broadcast driver. fakeBroadcaster doesn't care that
	// the raw tx is base58 — it's just a string key.
	rig.bcast.okFor("SOLANA_DEVNET", sw.DestRawTx, e2eSolanaTxSignature)
	rig.bcastDrv.Tick(t.Context())
	sw = rig.getSwap(swapID)
	if sw.Status != SwapStatusCompleted {
		t.Fatalf("after broadcast tick: status = %q, want completed (LastError=%q)",
			sw.Status, sw.LastError)
	}
	if sw.DestTxHash != e2eSolanaTxSignature {
		t.Errorf("DestTxHash = %q, want %q (the Solana base58 signature, not an EVM hash)",
			sw.DestTxHash, e2eSolanaTxSignature)
	}

	// Metrics — the Lux→Sol composition increments the same
	// counters as Lux→Lux. Locks in that the per-family dispatch
	// doesn't accidentally double-count or skip.
	body := rig.scrape()
	for _, want := range []string{
		"bridge_deposit_watcher_advances_total 1",
		"bridge_signing_successes_total 1",
		"bridge_broadcast_successes_total 1",
		`bridge_swaps_by_status{status="completed"} 1`,
	} {
		if !strings.Contains(body, want) {
			t.Errorf("metrics missing %q", want)
		}
	}
}

// TestE2E_LuxToSol_NoProvider_FallsBackToRefund proves the rollback
// path when the operator misconfigures (forgets --solana-rpc-url).
// PreSignSolana errors on the missing provider; the signing driver's
// maxSigningAttempts ceiling kicks the swap to refund_pending after
// the configured retries.
func TestE2E_LuxToSol_NoProvider_FallsBackToRefund(t *testing.T) {
	rig := newE2ERigLuxToSol(t)
	rig.signer.SetSolanaProvider(nil) // explicitly unconfigure
	rig.signer.SetMaxSigningAttempts(2)

	swapID := rig.createSwapLuxToSol()
	rig.checker.setVerdict("LUX_TESTNET", rig.depositAddr, true)
	rig.watcher.Tick(t.Context())
	if rig.getSwap(swapID).Status != SwapStatusBridgeTransferPending {
		t.Fatal("watcher should have advanced the swap")
	}

	for i := 0; i < 3; i++ {
		rig.signer.Tick(t.Context())
	}
	sw := rig.getSwap(swapID)
	if sw.Status != SwapStatusRefundPending {
		t.Fatalf("after ceiling: status = %q, want refund_pending (LastError=%q, attempts=%d)",
			sw.Status, sw.LastError, sw.SigningAttempts)
	}
	if !strings.Contains(strings.ToLower(sw.LastError), "solana") {
		t.Errorf("LastError = %q, expected mention of solana", sw.LastError)
	}
}

// =============================================================================
// Solana → Lux cross-family happy path
// =============================================================================
//
// Sol→Lux is the mirror of Lux→Sol but exercises completely different
// wires:
//
//   - The source deposit wallet is a base58 Solana ed25519 pubkey
//     (mchain.KeygenForDeposit("SOLANA_DEVNET") → pickAddress reads
//     sol_address). The keygen stub must populate that field — the
//     existing newMchainKeygenStub only fills eth_address, so this
//     family needs its own stub.
//   - The source deposit watcher polls SOLANA_DEVNET (the fakeChecker
//     dispatches on (network, address) string keys, so the family
//     dispatch in *real* depositcheck.Client.Check is not exercised
//     here — that path has its own unit tests).
//   - The signing leg targets LUX_TESTNET, an EVM destination — so
//     PreSignSolana is NOT touched; the existing EVM PreSign / Finalize
//     path runs, producing a 0x-hex raw tx.
//   - The destination broadcast is on LUX_TESTNET — same EVM
//     eth_sendRawTransaction shape as the long-standing happy-path
//     test.
//
// What this test proves vs. what other tests already prove:
//   - existing TestE2E_HappyPath: ETH→LUX (EVM source, EVM dest)
//   - existing TestE2E_HappyPath_LuxToSol: LUX→SOL (EVM source, SOL dest)
//   - THIS test: SOL→LUX (SOL source, EVM dest) — closes the matrix.

// newKeygenStubClientSol returns a *mchain.Client whose /keygen
// endpoint serves a Solana-shaped response: sol_address is the base58
// pubkey, eth_address is also populated so the same stub could be
// reused by an ETH-side keygen (not exercised here, but harmless).
// The /sign endpoint is unused for Sol→Lux's source side — the signing
// leg signs FROM the release wallet, which lives on the LUX EVM side
// and is satisfied by the fakeSigner in the rig.
func newKeygenStubClientSol(t *testing.T, walletID, solAddr string) *mchain.Client {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/keygen") {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"wallet_id":   walletID,
				"address":     solAddr,
				"sol_address": solAddr,
				"eth_address": "0xdeadbeef00000000000000000000000000000099",
				"result_type": "success",
			})
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	t.Cleanup(srv.Close)
	return &mchain.Client{APIURL: srv.URL, OrgID: "e2e", Timeout: 2 * time.Second}
}

// newE2ERigSolToLux builds the e2e rig with source=SOLANA_DEVNET and
// destination=LUX_TESTNET. Compared to newE2ERigLuxToSol, the families
// are swapped:
//
//   - The deposit wallet is base58 (Solana ed25519 pubkey).
//   - The release wallet is hex (Lux EVM).
//   - No Solana provider is wired on the signing driver — the
//     destination is EVM, so PreSignSolana is never called.
//
// The rest of the pipeline composition (drivers, store, API) is
// identical to the other Solana-side rig, which is the point of the
// test: adding a non-EVM source is a configuration change, not a
// state-machine change.
func newE2ERigSolToLux(t *testing.T) *e2eRig {
	t.Helper()

	cfg, _ := LoadConfig("")
	store := NewInMemoryStore()
	engine := &QuoteEngine{Feed: NewStaticPriceFeed(defaultPrices())}

	depositWalletID := "deposit-wallet-sol-to-lux"
	// Reuse the e2e Solana fixture pubkey — any valid base58 32-byte
	// payload works. The watcher reads swap.DepositAddress directly,
	// so the keygen stub MUST return this same string in sol_address.
	depositAddr := e2eSolanaRecipientAddr
	releaseWalletID := "release-wallet-LUX_TESTNET"
	releaseAddr := "0xcafebabe00000000000000000000000000000002"

	relStore := newStubReleaseStore()
	relStore.set("LUX_TESTNET", releaseWalletID, releaseAddr)

	mc := newKeygenStubClientSol(t, depositWalletID, depositAddr)

	api := NewAPI(cfg, "", nil, mc, nil, store, engine)
	api.SetReleaseStore(relStore)

	app := zip.New(zip.Config{AppName: "bridge-e2e-sol-to-lux", DisableStartupMessage: true})
	app.Use(middleware.Recover(), middleware.RequestID())
	api.Register(app)

	checker := newFakeChecker()
	mpcFake := newFakeSigner()
	bcastFake := newFakeBroadcaster()
	asmProv := &txassembler.StaticProvider{
		Nonces:   map[string]uint64{},
		GasPrice: map[string]*big.Int{},
	}
	asm := txassembler.New(asmProv)
	asm.SetNetwork("LUX_TESTNET", txassembler.PerNetwork{
		ChainID:            big.NewInt(96368),
		NativeDecimals:     18,
		DefaultGasPriceWei: big.NewInt(1_000_000_000),
	})

	watcher := NewDepositWatcher(store, checker, time.Hour, nil)
	signer := NewSigningDriver(store, mpcFake, time.Hour, nil)
	signer.SetAssembler(asm)
	// No SetSolanaProvider — destination is EVM, signer dispatches to
	// the EVM PreSign branch. If it accidentally tried Solana the
	// driver would error on nil provider.
	bcastDrv := NewBroadcastDriver(store, bcastFake, time.Hour, nil)
	refundDr := NewRefundDriver(store, mpcFake, bcastFake, asm, time.Hour, time.Second, nil, nil)

	api.SetDepositWatcher(watcher)
	api.SetSigningDriver(signer)
	api.SetBroadcastDriver(bcastDrv)
	api.SetRefundDriver(refundDr)

	return &e2eRig{
		t: t, app: app, api: api, store: store,
		watcher: watcher, signer: signer, bcastDrv: bcastDrv, refundDr: refundDr,
		checker: checker, mpc: mpcFake, bcast: bcastFake, asmProv: asmProv, relStore: relStore,
		depositWalletID: depositWalletID,
		depositAddr:     depositAddr,
		releaseWalletID: releaseWalletID,
		releaseAddr:     releaseAddr,
	}
}

// createSwapSolToLux fires a swap-create request with SOL source +
// LUX destination on the rig's API. Returns the swap ID.
//
// `sender` is a base58 Solana address (the user's Phantom wallet);
// `destination_address` is hex EVM (the user's MetaMask). The bridge
// stores both verbatim — the SDK is responsible for client-side
// address-format validation.
func (r *e2eRig) createSwapSolToLux() string {
	r.t.Helper()
	body, _ := json.Marshal(map[string]any{
		"source_network":      "SOLANA_DEVNET",
		"source_asset":        "SOL",
		"destination_network": "LUX_TESTNET",
		"destination_asset":   "LUX",
		"destination_address": "0x1111111111111111111111111111111111111111",
		"sender":              e2eSolanaRecipientAddr,
		"amount":              0.01, // 0.01 SOL → ~0.60 LUX at defaultPrices ($150 / $2.50)
		"use_deposit_address": true,
	})
	status, respBody := fireRequest(r.t, r.app, "POST", "/v1/bridge/swaps", body)
	if status != 200 {
		r.t.Fatalf("create sol→lux swap: status=%d body=%s", status, respBody)
	}
	var resp struct {
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(respBody, &resp); err != nil {
		r.t.Fatalf("decode create sol→lux: %v body=%s", err, respBody)
	}
	if resp.Data.ID == "" {
		r.t.Fatalf("create sol→lux response missing id: %s", respBody)
	}
	return resp.Data.ID
}

// TestE2E_HappyPath_SolToLux walks a SOL→LUX swap through the full
// pipeline and locks in:
//
//   - Swap creation mints an MPC deposit wallet on SOLANA_DEVNET
//     (base58 pubkey via sol_address) AND resolves the LUX_TESTNET
//     release wallet (hex EVM).
//   - The deposit watcher advances on Solana deposit detection
//     (in production: depositcheck.checkSOL via getBalance; here:
//     fakeChecker keyed by SOLANA_DEVNET + base58 address).
//   - The signing driver dispatches on DESTINATION family — since
//     LUX_TESTNET is EVM, the EVM PreSign / Finalize path runs even
//     though the source is Solana. This is the central invariant:
//     source family does NOT influence which signing branch runs.
//   - DestRawTx is 0x-prefixed EVM hex (NOT base58) — regression guard
//     against the driver accidentally routing a SOL-source swap into
//     PreSignSolana because of misread fields.
//   - DestTxHash is a 0x-prefixed EVM tx hash.
func TestE2E_HappyPath_SolToLux(t *testing.T) {
	rig := newE2ERigSolToLux(t)
	swapID := rig.createSwapSolToLux()

	// Initial state — deposit address must be the base58 Solana pubkey,
	// release address must be the hex EVM address. Catches misrouting
	// bugs where the rig accidentally swapped the two.
	sw := rig.getSwap(swapID)
	if sw.Status != SwapStatusUserDepositPending {
		t.Fatalf("after create: status = %q, want user_deposit_pending", sw.Status)
	}
	if sw.ReleaseAddress != rig.releaseAddr {
		t.Errorf("after create: ReleaseAddress = %q, want %q (hex EVM)",
			sw.ReleaseAddress, rig.releaseAddr)
	}
	if sw.DepositAddress == "" {
		t.Fatal("after create: DepositAddress empty — MPC keygen for SOLANA didn't fire")
	}
	// DepositAddress envelope is "wallet_name###base58_address" — peel
	// it and verify it's NOT hex. Catches the bug where the keygen stub
	// accidentally returns eth_address for a SOL keygen.
	bareDeposit := extractDepositAddress(sw.DepositAddress)
	if strings.HasPrefix(bareDeposit, "0x") {
		t.Errorf("DepositAddress looks like EVM hex (got %q), expected base58", bareDeposit)
	}
	if bareDeposit != rig.depositAddr {
		t.Errorf("DepositAddress = %q, want %q", bareDeposit, rig.depositAddr)
	}

	// Stage 1 — Solana deposit detected. The fakeChecker is keyed by
	// (network, address) and ignores the asset; in production this
	// would be depositcheck.checkSOL polling getBalance via Solana RPC.
	rig.checker.setVerdict("SOLANA_DEVNET", rig.depositAddr, true)
	rig.watcher.Tick(t.Context())
	sw = rig.getSwap(swapID)
	if sw.Status != SwapStatusBridgeTransferPending {
		t.Fatalf("after watcher tick: status = %q, want bridge_transfer_pending", sw.Status)
	}

	// Stage 2 — signing driver dispatches on destination family.
	// For LUX_TESTNET, signer calls PreSign (EVM) → returns ECDSA
	// R+S+V hex sig. Use the canonical 65-byte concat that the
	// happy-path test uses.
	rig.mpc.ok(rig.releaseWalletID,
		"0x"+strings.Repeat("01", 32)+strings.Repeat("02", 32)+"1b",
		"sess-sol-to-lux-001")
	rig.signer.Tick(t.Context())
	sw = rig.getSwap(swapID)
	if sw.Status != SwapStatusBroadcasting {
		t.Fatalf("after signer tick: status = %q, want broadcasting (LastError=%q)",
			sw.Status, sw.LastError)
	}
	if sw.DestRawTx == "" {
		t.Fatal("after signer tick: DestRawTx empty — Finalize didn't run")
	}
	// DestRawTx for EVM destinations is 0x-prefixed hex. Regression
	// guard: a misrouted Sol-source swap would have produced base58
	// instead.
	if !strings.HasPrefix(sw.DestRawTx, "0x") {
		t.Errorf("DestRawTx = %q, expected 0x-prefixed EVM hex", sw.DestRawTx)
	}

	// Stage 3 — broadcast driver on LUX_TESTNET.
	rig.bcast.okFor("LUX_TESTNET", sw.DestRawTx, "0xluxfinaltxhash")
	rig.bcastDrv.Tick(t.Context())
	sw = rig.getSwap(swapID)
	if sw.Status != SwapStatusCompleted {
		t.Fatalf("after broadcast tick: status = %q, want completed (LastError=%q)",
			sw.Status, sw.LastError)
	}
	if sw.DestTxHash != "0xluxfinaltxhash" {
		t.Errorf("DestTxHash = %q, want 0xluxfinaltxhash (EVM hash, not base58)",
			sw.DestTxHash)
	}

	// Metrics — Sol→Lux increments the same counters as any other
	// completed swap. The per-family branches are observably
	// transparent to the metrics layer.
	body := rig.scrape()
	for _, want := range []string{
		"bridge_deposit_watcher_advances_total 1",
		"bridge_signing_successes_total 1",
		"bridge_broadcast_successes_total 1",
		`bridge_swaps_by_status{status="completed"} 1`,
	} {
		if !strings.Contains(body, want) {
			t.Errorf("metrics missing %q", want)
		}
	}
}
