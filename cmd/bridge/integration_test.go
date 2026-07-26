// integration_test.go drives the full swap pipeline end-to-end against
// in-process fakes. It complements the per-driver unit tests by
// exercising the WIRING — every state transition runs through the
// same handlers, drivers, and shared SwapStore that production uses.
//
// Fakes spun up:
//
//   - sourceRPCStub      — fake source-chain JSON-RPC. Returns a
//                          balance ≥ requiredAmount on eth_getBalance
//                          so the deposit watcher confirms instantly.
//
//   - mpcDaemonStub      — fake MPC daemon. /keygen mints a wallet
//                          (`bridge-it-…` + a deterministic eth
//                          address); /sign returns a fixed 65-byte
//                          r||s||v signature.
//
//   - destRPCStub        — fake destination-chain JSON-RPC. Returns
//                          a fixed nonce + gas price, accepts any
//                          eth_sendRawTransaction with a hardcoded
//                          tx hash.
//
// Tick driving is deterministic: each driver exposes Tick(ctx) which
// runs exactly one iteration. We never sleep waiting for tickers.
// The whole happy-path test completes in <100 ms.
//
// Why not real testnet? Because the live lux-mpc daemon doesn't yet
// expose /sign on its internal API port — only /keygen does. Until
// that endpoint ships, the only way to validate the WIRING of the
// signing leg is through this in-process harness. The fake's wire
// shape mirrors what mchain.SignForWallet expects, so the day /sign
// lands on the cluster, we can point --mpc-url at it and the same
// pipeline runs against production.

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/zap-proto/fiber/v3"
	"github.com/zap-proto/zip"
	"github.com/zap-proto/zip/middleware"
	"github.com/luxfi/bridge/internal/broadcast"
	"github.com/luxfi/bridge/internal/depositcheck"
	"github.com/luxfi/bridge/internal/mchain"
	"github.com/luxfi/bridge/internal/tokens"
	"github.com/luxfi/bridge/internal/txassembler"
)

// =============================================================================
// integrationRig — the full pipeline assembled against in-process fakes
// =============================================================================

// integrationRig owns every moving part of a swap-pipeline run. Tests
// drive it by:
//  1. Posting to rig.app to create a swap.
//  2. Calling rig.depositWatcher.Tick / rig.signingDriver.Tick /
//     rig.broadcastDriver.Tick to step the state machine.
//  3. Inspecting rig.store directly to assert state transitions.
type integrationRig struct {
	app       *zip.App
	store     *InMemoryStore
	api       *API
	mpcClient *mchain.Client

	depositWatcher  *DepositWatcher
	signingDriver   *SigningDriver
	broadcastDriver *BroadcastDriver

	// Fakes — exposed so individual tests can poke their state
	// (e.g. flip the source RPC to "no balance" before the next tick).
	sourceRPC *sourceRPCStub
	mpc       *mpcDaemonStub
	destRPC   *destRPCStub
}

// newIntegrationRig wires up the whole pipeline against fresh fakes.
// `t.Cleanup` tears every server down — callers don't need to defer.
func newIntegrationRig(t *testing.T) *integrationRig {
	t.Helper()

	src := newSourceRPCStub(t)
	mpc := newMPCDaemonStub(t)
	dst := newDestRPCStub(t)

	cfg, _ := LoadConfig("")
	store := NewInMemoryStore()
	// Integration tests use a canonical in-process B-Chain mock so the
	// daemon registers /v1/bridge/swaps natively. The signing driver
	// receives a real (mock-derived) quote snapshot at create time.
	bclient := newMockBChain(t, defaultPrices())

	mpcClient := &mchain.Client{
		APIURL:  mpc.URL(),
		OrgID:   "integration-test",
		Timeout: 2 * time.Second,
	}

	// depositcheck.Client speaks the same JSON-RPC shape the source
	// RPC stub serves. Override ETHEREUM_SEPOLIA so eth_getBalance
	// hits the fake instead of rpc.sepolia.org.
	dcClient := &depositcheck.Client{
		Timeout:         2 * time.Second,
		RPCURLOverrides: map[string]string{"ETHEREUM_SEPOLIA": src.URL()},
		Tokens:          tokens.DefaultRegistry(),
	}

	api := NewAPI(cfg, "", bclient, mpcClient, dcClient, store)
	app := zip.New(zip.Config{AppName: "lux-bridge-it", DisableStartupMessage: true})
	app.Use(middleware.Recover(), middleware.RequestID())
	api.Register(app)

	// Drivers — instantiated but NOT started. Tests drive them via Tick().
	dw := NewDepositWatcher(store, dcClient, 50*time.Millisecond, nil)
	sd := NewSigningDriver(store, mpcClient, 50*time.Millisecond, nil)
	bd := NewBroadcastDriver(store, &broadcast.Client{
		Timeout:         2 * time.Second,
		RPCURLOverrides: map[string]string{"LUX_TESTNET": dst.URL()},
	}, 50*time.Millisecond, nil)

	// Assembler — points at the destination stub for nonce/gas price.
	asm := txassembler.New(&txassembler.RPCProvider{
		Endpoints: map[string]string{"LUX_TESTNET": dst.URL()},
		Timeout:   2 * time.Second,
	})
	asm.Tokens = tokens.DefaultRegistry()
	asm.SetNetwork("LUX_TESTNET", txassembler.PerNetwork{
		ChainID:        big.NewInt(96368),
		NativeDecimals: 18,
	})
	sd.SetAssembler(asm)

	return &integrationRig{
		app:             app,
		store:           store,
		api:             api,
		mpcClient:       mpcClient,
		depositWatcher:  dw,
		signingDriver:   sd,
		broadcastDriver: bd,
		sourceRPC:       src,
		mpc:             mpc,
		destRPC:         dst,
	}
}

// fire sends one HTTP request through the rig's app.
func (r *integrationRig) fire(t *testing.T, method, target string, body []byte) (int, []byte) {
	t.Helper()
	var br io.Reader
	if body != nil {
		br = bytes.NewReader(body)
	}
	req := httptest.NewRequest(method, target, br)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := r.app.Fiber().Test(req, fiber.TestConfig{Timeout: 2 * time.Second})
	if err != nil {
		t.Fatalf("app.Test %s %s: %v", method, target, err)
	}
	defer resp.Body.Close()
	out, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, out
}

// createSwap drives POST /api/swaps and returns the created swap id.
// Verifies the response shape and the persisted swap is in
// user_deposit_pending with a deposit address minted.
func (r *integrationRig) createSwap(t *testing.T, amount float64) string {
	t.Helper()
	reqBody, _ := json.Marshal(createSwapReq{
		Amount:             amount,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		SourceAsset:        "ETH",
		DestinationNetwork: "LUX_TESTNET",
		DestinationAsset:   "LUX",
		DestinationAddress: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045", // vitalik.eth
		UseDepositAddress:  true,
	})
	status, body := r.fire(t, http.MethodPost, "/api/swaps", reqBody)
	if status != http.StatusOK {
		t.Fatalf("createSwap: status=%d body=%s", status, body)
	}
	var resp struct {
		Data serverSwap `json:"data"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatalf("decode createSwap: %v body=%s", err, body)
	}
	if resp.Data.ID == "" {
		t.Fatalf("createSwap: missing id in %s", body)
	}
	sw, err := r.store.Get(context.Background(), resp.Data.ID)
	if err != nil {
		t.Fatalf("createSwap: store.Get: %v", err)
	}
	if sw.Status != SwapStatusUserDepositPending {
		t.Fatalf("createSwap: status=%s want user_deposit_pending", sw.Status)
	}
	if sw.DepositAddress == "" {
		t.Fatalf("createSwap: empty deposit address — MPC keygen leg broken")
	}
	if extractDepositAddress(sw.DepositAddress) == "" {
		t.Fatalf("createSwap: deposit address missing envelope marker: %q", sw.DepositAddress)
	}
	return sw.ID
}

// mustSwap reads a swap from the store; fails the test if absent.
func (r *integrationRig) mustSwap(t *testing.T, id string) *Swap {
	t.Helper()
	sw, err := r.store.Get(context.Background(), id)
	if err != nil {
		t.Fatalf("store.Get(%s): %v", id, err)
	}
	return sw
}

// =============================================================================
// Fakes
// =============================================================================

// jsonRPCReq is the canonical JSON-RPC 2.0 request shape the stubs
// decode. Result and error shapes are emitted directly with
// json.NewEncoder so we don't need a wrapping struct.
type jsonRPCReq struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Method  string          `json:"method"`
	Params  []any           `json:"params"`
}

func writeRPCResult(w http.ResponseWriter, id json.RawMessage, result any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"jsonrpc": "2.0",
		"id":      id,
		"result":  result,
	})
}

func writeRPCError(w http.ResponseWriter, id json.RawMessage, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"jsonrpc": "2.0",
		"id":      id,
		"error":   map[string]any{"code": code, "message": msg},
	})
}

// -----------------------------------------------------------------------------
// sourceRPCStub
// -----------------------------------------------------------------------------

// sourceRPCStub speaks just enough JSON-RPC for depositcheck.Client to
// confirm a deposit. Tests can toggle `Confirmed` to simulate "funds
// haven't landed yet."
type sourceRPCStub struct {
	server    *httptest.Server
	confirmed atomic.Bool
	// balanceHex is the eth_getBalance result returned when Confirmed
	// is true. 0xDE0B6B3A7640000 = 1e18 wei = 1 ETH.
	balanceHex string
	calls      atomic.Uint64
}

func newSourceRPCStub(t *testing.T) *sourceRPCStub {
	s := &sourceRPCStub{balanceHex: "0xDE0B6B3A7640000"}
	s.confirmed.Store(true) // default to "deposit present"
	s.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s.calls.Add(1)
		var req jsonRPCReq
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeRPCError(w, nil, -32700, "parse error: "+err.Error())
			return
		}
		switch req.Method {
		case "eth_getBalance":
			if s.confirmed.Load() {
				writeRPCResult(w, req.ID, s.balanceHex)
			} else {
				writeRPCResult(w, req.ID, "0x0")
			}
		default:
			writeRPCError(w, req.ID, -32601, "method not found: "+req.Method)
		}
	}))
	t.Cleanup(s.server.Close)
	return s
}

func (s *sourceRPCStub) URL() string         { return s.server.URL }
func (s *sourceRPCStub) SetConfirmed(v bool) { s.confirmed.Store(v) }
func (s *sourceRPCStub) Calls() uint64       { return s.calls.Load() }

// -----------------------------------------------------------------------------
// mpcDaemonStub
// -----------------------------------------------------------------------------

// mpcDaemonStub serves the two endpoints the bridge calls:
//
//   - POST /keygen → returns wallet_id + chain-appropriate addresses
//   - POST /sign   → returns a fixed 65-byte r||s||v signature
//
// Tests can flip `signFails` to exercise the signing-driver rollback path.
type mpcDaemonStub struct {
	server    *httptest.Server
	signFails atomic.Bool
	// fixedEthAddr is a deterministic 20-byte eth address surfaced
	// from /keygen. Real keygen would return a fresh MPC-derived
	// address; the harness only cares that it's well-formed.
	fixedEthAddr string
	// fixedSig is a 65-byte hex signature (r||s||v) returned from /sign.
	// r and s are arbitrary nonzero values; v=0 → EIP-155 recoveryID=0.
	fixedSig    string
	walletCount atomic.Uint64
	signCalls   atomic.Uint64
}

func newMPCDaemonStub(t *testing.T) *mpcDaemonStub {
	s := &mpcDaemonStub{
		fixedEthAddr: "0x1111222233334444555566667777888899990000",
		fixedSig: "0x" +
			"1111111111111111111111111111111111111111111111111111111111111111" +
			"2222222222222222222222222222222222222222222222222222222222222222" +
			"00",
	}
	s.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/keygen":
			n := s.walletCount.Add(1)
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"wallet_id":   fmt.Sprintf("bridge-it-%d", n),
				"eth_address": s.fixedEthAddr,
				"btc_address": "tb1qintegration",
				"sol_address": "SolIntegration111",
				"result_type": "success",
			})
		case "/sign":
			s.signCalls.Add(1)
			if s.signFails.Load() {
				w.WriteHeader(http.StatusInternalServerError)
				_, _ = w.Write([]byte(`{"error":"simulated sign failure","result_type":"error"}`))
				return
			}
			// Echo wallet_id so logs are searchable — but ignore the
			// posted body's message; the test asserts on the resulting
			// signature, not on what was signed.
			var req struct {
				WalletID string `json:"wallet_id"`
			}
			_ = json.NewDecoder(r.Body).Decode(&req)
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"wallet_id":   req.WalletID,
				"signature":   s.fixedSig,
				"session_id":  fmt.Sprintf("session-%d", s.signCalls.Load()),
				"result_type": "success",
			})
		default:
			http.Error(w, "not found: "+r.URL.Path, http.StatusNotFound)
		}
	}))
	t.Cleanup(s.server.Close)
	return s
}

func (s *mpcDaemonStub) URL() string         { return s.server.URL }
func (s *mpcDaemonStub) SetSignFails(v bool) { s.signFails.Store(v) }
func (s *mpcDaemonStub) SignCalls() uint64   { return s.signCalls.Load() }

// -----------------------------------------------------------------------------
// destRPCStub
// -----------------------------------------------------------------------------

// destRPCStub serves the three EVM JSON-RPC methods the assembler +
// broadcaster need: eth_getTransactionCount, eth_gasPrice, and
// eth_sendRawTransaction. Tests can flip `broadcastFails` to exercise
// the broadcast retry path.
type destRPCStub struct {
	server         *httptest.Server
	broadcastFails atomic.Bool
	gasPriceHex    string // 0x4A817C800 = 20 gwei
	txHash         string
	rawTxSeen      atomic.Value // last raw tx (string)
	sendCalls      atomic.Uint64
}

func newDestRPCStub(t *testing.T) *destRPCStub {
	s := &destRPCStub{
		gasPriceHex: "0x4A817C800", // 20 gwei
		txHash:      "0xabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabc1",
	}
	s.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req jsonRPCReq
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeRPCError(w, nil, -32700, "parse error: "+err.Error())
			return
		}
		switch req.Method {
		case "eth_getTransactionCount":
			writeRPCResult(w, req.ID, "0x0")
		case "eth_gasPrice":
			writeRPCResult(w, req.ID, s.gasPriceHex)
		case "eth_sendRawTransaction":
			s.sendCalls.Add(1)
			if s.broadcastFails.Load() {
				writeRPCError(w, req.ID, -32000, "simulated broadcast failure")
				return
			}
			if len(req.Params) > 0 {
				if raw, ok := req.Params[0].(string); ok {
					s.rawTxSeen.Store(raw)
				}
			}
			writeRPCResult(w, req.ID, s.txHash)
		default:
			writeRPCError(w, req.ID, -32601, "method not found: "+req.Method)
		}
	}))
	t.Cleanup(s.server.Close)
	return s
}

func (s *destRPCStub) URL() string              { return s.server.URL }
func (s *destRPCStub) SetBroadcastFails(v bool) { s.broadcastFails.Store(v) }
func (s *destRPCStub) SendCalls() uint64        { return s.sendCalls.Load() }
func (s *destRPCStub) LastRawTx() string {
	if v := s.rawTxSeen.Load(); v != nil {
		return v.(string)
	}
	return ""
}

// =============================================================================
// Happy path
// =============================================================================

// TestIntegration_SwapHappyPath drives one swap from POST /api/swaps
// to terminal "completed" state, asserting every transition.
//
// Pipeline: user_deposit_pending → bridge_transfer_pending →
//
//	bridge_transfer_pending_signing → bridge_transfer_pending_broadcasting → completed.
func TestIntegration_SwapHappyPath(t *testing.T) {
	rig := newIntegrationRig(t)
	ctx := context.Background()

	// 1. Create swap. Asserts user_deposit_pending + deposit address.
	id := rig.createSwap(t, 0.5)

	// 2. Deposit watcher tick — source RPC reports balance ≥ 0.5 → advances.
	rig.depositWatcher.Tick(ctx)
	sw := rig.mustSwap(t, id)
	if sw.Status != SwapStatusBridgeTransferPending {
		t.Fatalf("after deposit tick: status=%s want bridge_transfer_pending", sw.Status)
	}
	if sw.DepositedAmount != 0.5 {
		t.Fatalf("after deposit tick: deposited_amount=%v want 0.5", sw.DepositedAmount)
	}

	// 3. Signing driver tick — assembles unsigned EVM tx, MPC signs,
	//    finalizes raw tx → advances to broadcasting.
	rig.signingDriver.Tick(ctx)
	sw = rig.mustSwap(t, id)
	if sw.Status != SwapStatusBroadcasting {
		t.Fatalf("after signing tick: status=%s want broadcasting (sig=%q)", sw.Status, sw.Signature)
	}
	if sw.Signature == "" {
		t.Fatal("after signing tick: empty Signature — MPC sign leg broken")
	}
	if sw.MPCSessionID == "" {
		t.Fatal("after signing tick: empty MPCSessionID — wire shape mismatch")
	}
	if sw.DestRawTx == "" {
		t.Fatal("after signing tick: empty DestRawTx — assembler.Finalize didn't fire")
	}
	if !strings.HasPrefix(sw.DestRawTx, "0x") {
		t.Errorf("DestRawTx must be 0x-prefixed; got %q", sw.DestRawTx[:min(20, len(sw.DestRawTx))])
	}
	if rig.mpc.SignCalls() != 1 {
		t.Errorf("expected exactly 1 /sign call, got %d", rig.mpc.SignCalls())
	}

	// 4. Broadcast driver tick — pushes raw tx → completed.
	rig.broadcastDriver.Tick(ctx)
	sw = rig.mustSwap(t, id)
	if sw.Status != SwapStatusCompleted {
		t.Fatalf("after broadcast tick: status=%s want completed", sw.Status)
	}
	if sw.DestTxHash != rig.destRPC.txHash {
		t.Errorf("DestTxHash=%q want %q", sw.DestTxHash, rig.destRPC.txHash)
	}
	if got := rig.destRPC.LastRawTx(); got != sw.DestRawTx {
		t.Errorf("broadcaster saw raw tx %q but swap stores %q", got, sw.DestRawTx)
	}

	// 5. /api/swaps/:id surfaces the terminal state to the SDK.
	status, body := rig.fire(t, http.MethodGet, "/api/swaps/"+id, nil)
	if status != http.StatusOK {
		t.Fatalf("GET /api/swaps/:id: status=%d body=%s", status, body)
	}
	var resp struct {
		Data serverSwap `json:"data"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatalf("decode get: %v body=%s", err, body)
	}
	if resp.Data.Status != string(SwapStatusCompleted) {
		t.Errorf("SDK-facing status=%q want completed", resp.Data.Status)
	}
	if resp.Data.DestTxHash != rig.destRPC.txHash {
		t.Errorf("SDK-facing dest_tx_hash=%q want %q", resp.Data.DestTxHash, rig.destRPC.txHash)
	}
}

// =============================================================================
// Failure / retry paths
// =============================================================================

// TestIntegration_DepositWatcherWaitsForFunds confirms a swap stays in
// user_deposit_pending until the source RPC reports a sufficient balance.
func TestIntegration_DepositWatcherWaitsForFunds(t *testing.T) {
	rig := newIntegrationRig(t)
	ctx := context.Background()
	rig.sourceRPC.SetConfirmed(false) // no balance yet

	id := rig.createSwap(t, 1.0)

	rig.depositWatcher.Tick(ctx)
	sw := rig.mustSwap(t, id)
	if sw.Status != SwapStatusUserDepositPending {
		t.Fatalf("status advanced without confirmation: %s", sw.Status)
	}

	// Now flip the stub — the next tick must advance.
	rig.sourceRPC.SetConfirmed(true)
	rig.depositWatcher.Tick(ctx)
	sw = rig.mustSwap(t, id)
	if sw.Status != SwapStatusBridgeTransferPending {
		t.Fatalf("after balance landed: status=%s want bridge_transfer_pending", sw.Status)
	}
}

// TestIntegration_SigningRollbackOnMPCFailure confirms a failed /sign
// call rolls the swap back to bridge_transfer_pending so the next tick
// retries. This is the regression test for the "ceremony fails →
// stuck in signing forever" hazard.
func TestIntegration_SigningRollbackOnMPCFailure(t *testing.T) {
	rig := newIntegrationRig(t)
	ctx := context.Background()

	id := rig.createSwap(t, 0.5)
	rig.depositWatcher.Tick(ctx)
	if sw := rig.mustSwap(t, id); sw.Status != SwapStatusBridgeTransferPending {
		t.Fatalf("setup: expected bridge_transfer_pending got %s", sw.Status)
	}

	// Make MPC /sign fail on the first attempt.
	rig.mpc.SetSignFails(true)
	rig.signingDriver.Tick(ctx)
	sw := rig.mustSwap(t, id)
	if sw.Status != SwapStatusBridgeTransferPending {
		t.Fatalf("after /sign failure: status=%s want rollback to bridge_transfer_pending", sw.Status)
	}
	if sw.Signature != "" {
		t.Errorf("after /sign failure: Signature should be empty, got %q", sw.Signature)
	}
	if rig.signingDriver.Stats().Failures != 1 {
		t.Errorf("expected 1 failure counted, got %d", rig.signingDriver.Stats().Failures)
	}

	// Flip MPC back to working — next tick must succeed.
	rig.mpc.SetSignFails(false)
	rig.signingDriver.Tick(ctx)
	sw = rig.mustSwap(t, id)
	if sw.Status != SwapStatusBroadcasting {
		t.Fatalf("after retry: status=%s want broadcasting", sw.Status)
	}
	if sw.Signature == "" {
		t.Error("after retry: Signature still empty")
	}
}

// TestIntegration_BroadcastRetriesUntilDestRPCRecovers confirms a
// failed eth_sendRawTransaction leaves the swap at broadcasting (not
// failed) so it retries on the next tick.
func TestIntegration_BroadcastRetriesUntilDestRPCRecovers(t *testing.T) {
	rig := newIntegrationRig(t)
	ctx := context.Background()

	id := rig.createSwap(t, 0.25)
	rig.depositWatcher.Tick(ctx)
	rig.signingDriver.Tick(ctx)
	if sw := rig.mustSwap(t, id); sw.Status != SwapStatusBroadcasting {
		t.Fatalf("setup: expected broadcasting, got %s", sw.Status)
	}

	rig.destRPC.SetBroadcastFails(true)
	rig.broadcastDriver.Tick(ctx)
	sw := rig.mustSwap(t, id)
	if sw.Status != SwapStatusBroadcasting {
		t.Fatalf("after broadcast failure: status=%s want broadcasting (retry)", sw.Status)
	}
	if sw.DestTxHash != "" {
		t.Errorf("after broadcast failure: DestTxHash should be empty, got %q", sw.DestTxHash)
	}
	if rig.broadcastDriver.Stats().Failures != 1 {
		t.Errorf("expected 1 broadcast failure counted, got %d", rig.broadcastDriver.Stats().Failures)
	}

	rig.destRPC.SetBroadcastFails(false)
	rig.broadcastDriver.Tick(ctx)
	sw = rig.mustSwap(t, id)
	if sw.Status != SwapStatusCompleted {
		t.Fatalf("after recovery: status=%s want completed", sw.Status)
	}
}

// =============================================================================
// Concurrent swaps
// =============================================================================

// TestIntegration_ConcurrentSwapsDoNotInterfere creates several swaps,
// drives them through a single round of ticks, and confirms all of
// them reach completed. This pins the contract that the InMemoryStore
// and drivers are concurrency-safe across multiple in-flight swaps.
func TestIntegration_ConcurrentSwapsDoNotInterfere(t *testing.T) {
	rig := newIntegrationRig(t)
	ctx := context.Background()

	const N = 5
	ids := make([]string, 0, N)
	for i := 0; i < N; i++ {
		ids = append(ids, rig.createSwap(t, 0.1))
	}

	rig.depositWatcher.Tick(ctx)
	rig.signingDriver.Tick(ctx)
	rig.broadcastDriver.Tick(ctx)

	for _, id := range ids {
		sw := rig.mustSwap(t, id)
		if sw.Status != SwapStatusCompleted {
			t.Errorf("swap %s status=%s want completed", id, sw.Status)
		}
		if sw.DestTxHash == "" {
			t.Errorf("swap %s missing DestTxHash", id)
		}
	}
	if rig.mpc.SignCalls() != N {
		t.Errorf("expected %d /sign calls (one per swap), got %d", N, rig.mpc.SignCalls())
	}
	if rig.destRPC.SendCalls() != N {
		t.Errorf("expected %d eth_sendRawTransaction calls, got %d", N, rig.destRPC.SendCalls())
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
