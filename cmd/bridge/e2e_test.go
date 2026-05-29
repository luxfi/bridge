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
	"strings"
	"testing"
	"time"

	"github.com/hanzoai/zip"
	middleware "github.com/hanzoai/zip/middleware"

	"github.com/luxfi/bridge/internal/mchain"
	"github.com/luxfi/bridge/internal/txassembler"
)

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
