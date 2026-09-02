// Tests for the cmd/bridge HTTP layer.
//
// The bridge is permissionless and non-custodial: B-Chain
// (chains/bridgevm) owns authoritative quote + swap state. The daemon
// is a thin shim with a local UX cache. Tests therefore wire a
// minimal mock B-Chain RPC server that the daemon talks to for quote
// + status reconciliation.

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"math"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/luxfi/bridge/internal/bchain"
	"github.com/luxfi/bridge/internal/depositcheck"
	"github.com/luxfi/bridge/internal/mchain"
	"github.com/zap-proto/fiber/v3"
	"github.com/zap-proto/zip"
	"github.com/zap-proto/zip/middleware"
)

// =============================================================================
// Helpers
// =============================================================================

// testRig bundles an app with its underlying store so individual tests
// can poke state directly when needed.
// A rig holds both listeners the daemon opens: app is the public one the
// edge routes, admin is the operator one it does not (main.go --admin-addr).
// A test that reaches for admin is saying so out loud.
type testRig struct {
	app   *zip.App
	admin *zip.App
	store *InMemoryStore
	api   *API
}

// listeners builds the pair for an already-wired API.
// listeners builds the two apps main.go builds, in the order main.go builds
// them. The order is the point: routes match as registered, and main.go hangs a
// SPA catch-all at /* after everything else (main.go:1121). A rig without it
// answers 404 where production answers the SPA, so a test asserting == 404
// passes for a reason production does not share.
func listeners(api *API) (public, admin *zip.App) {
	public = zip.New(zip.Config{AppName: "lux-bridge-test", DisableStartupMessage: true})
	public.Use(middleware.Recover(), middleware.RequestID())
	api.Register(public)
	public.All("/*", func(c *zip.Ctx) error {
		return c.String(http.StatusOK, "<!doctype html><title>spa</title>")
	})
	admin = zip.New(zip.Config{AppName: "lux-bridge-test-admin", DisableStartupMessage: true})
	admin.Use(middleware.Recover(), middleware.RequestID())
	api.RegisterAdmin(admin)
	return public, admin
}

// defaultPrices is the unit-price table the mock B-Chain emits when
// answering bridge_estimateFee. Round numbers keep the
// float-comparison assertions readable.
func defaultPrices() map[string]float64 {
	return map[string]float64{
		"ETH":  3500.00,
		"LUX":  2.50,
		"ZOO":  0.05,
		"BTC":  65000.00,
		"SOL":  150.00,
		"TON":  6.00,
		"USDC": 1.00,
		"USDT": 1.00,
		"DAI":  1.00,
		"BNB":  600.00,
	}
}

// luxFamily mirrors the chain-side fee policy: 1% service fee when
// the source is Lux-family, zero otherwise. Kept local to the test
// rig because the daemon no longer encodes settlement math.
var luxFamily = map[string]bool{
	"LUX_MAINNET": true, "LUX_TESTNET": true, "LUX_DEVNET": true,
	"ZOO_MAINNET": true, "ZOO_TESTNET": true, "ZOO_DEVNET": true,
}

// newRig assembles a fully-wired test app with optional bchain /
// mchain / depositcheck clients. When bclient is nil we mount a
// canonical in-process bridge_estimateFee mock so quote-dependent
// tests can run end-to-end.
func newRig(t *testing.T, bclient *bchain.Client, mclient *mchain.Client, dc *depositcheck.Client) *testRig {
	t.Helper()
	if bclient == nil {
		bclient = newMockBChain(t, defaultPrices())
	}
	cfg, _ := LoadConfig("")
	// Wired NON-EVM families are default-DENY (config.go gatedFamily) — they
	// need an explicit enabled (network, asset) row, exactly as production does.
	// Enable the non-EVM pairs the newRig-based tests exercise so they reach the
	// downstream create logic (X-address/tag/r-address validation, SS58 keygen);
	// EVM pairs stay default-on with no row. Gate-behavior tests use newRigCfg.
	yes := true
	cfg.Tokens = append(cfg.Tokens,
		Token{Network: "XRP_TESTNET", Asset: "XRP", IsDepositEnabled: &yes, IsWithdrawalEnabled: &yes},
		Token{Network: "POLKADOT_MAINNET", Asset: "DAI", IsDepositEnabled: &yes, IsWithdrawalEnabled: &yes},
	)
	store := NewInMemoryStore()
	api := NewAPI(cfg, "", bclient, mclient, dc, store)
	app, admin := listeners(api)
	return &testRig{app: app, admin: admin, store: store, api: api}
}

// newRigCfg is newRig with an explicit Config — for gate-behavior tests that
// need explicit isDepositEnabled / isWithdrawalEnabled:false rows. (newRig
// enables the non-EVM pairs its own tests use; non-EVM families are otherwise
// default-DENY per config.go gatedFamily.)
func newRigCfg(t *testing.T, cfg Config, bclient *bchain.Client) *testRig {
	t.Helper()
	if bclient == nil {
		bclient = newMockBChain(t, defaultPrices())
	}
	store := NewInMemoryStore()
	api := NewAPI(cfg, "", bclient, nil, nil, store)
	// The /admin/swaps handlers are off unless asked for (see admin_routes_test.go).
	// Tests that exercise them ask here; without this the router answers 404 and a
	// test of the inject handler's withdrawal refusal would be reading the
	// router's answer rather than the handler's.
	api.EnableAdminRoutes()
	app, admin := listeners(api)
	return &testRig{app: app, admin: admin, store: store, api: api}
}

// newMockBChain spins up an in-process JSON-RPC server speaking the
// subset of the B-Chain bridge_* surface the daemon consumes
// (estimateFee, getStatus, health). Prices is the unit-price table the
// estimateFee implementation uses to compute net + fee.
func newMockBChain(t *testing.T, prices map[string]float64) *bchain.Client {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ID     any             `json:"id"`
			Method string          `json:"method"`
			Params json.RawMessage `json:"params"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		w.Header().Set("Content-Type", "application/json")
		switch req.Method {
		case "bridge_estimateFee":
			var p bchain.EstimateFeeParams
			_ = json.Unmarshal(req.Params, &p)
			amt, _ := strconv.ParseFloat(p.Amount, 64)
			src := prices[strings.ToUpper(p.SourceAsset)]
			dst := prices[strings.ToUpper(p.DestAsset)]
			if src == 0 {
				_ = json.NewEncoder(w).Encode(map[string]any{
					"jsonrpc": "2.0", "id": req.ID,
					"error": map[string]any{"code": -32000, "message": "price_unknown: " + p.SourceAsset},
				})
				return
			}
			if dst == 0 {
				_ = json.NewEncoder(w).Encode(map[string]any{
					"jsonrpc": "2.0", "id": req.ID,
					"error": map[string]any{"code": -32000, "message": "price_unknown: " + p.DestAsset},
				})
				return
			}
			gross := amt * src / dst
			feeRate := 0.0
			if luxFamily[p.SourceChain] {
				feeRate = 0.01
			}
			fee := gross * feeRate
			net := gross - fee
			_ = json.NewEncoder(w).Encode(map[string]any{
				"jsonrpc": "2.0", "id": req.ID,
				"result": bchain.FeeEstimate{
					FeeAmount:     strconv.FormatFloat(fee, 'f', -1, 64),
					NetAmount:     strconv.FormatFloat(net, 'f', -1, 64),
					EstimatedTime: 180,
				},
			})
		case "bridge_health":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"jsonrpc": "2.0", "id": req.ID,
				"result": bchain.Health{Status: "healthy", MPCReady: true},
			})
		default:
			_ = json.NewEncoder(w).Encode(map[string]any{
				"jsonrpc": "2.0", "id": req.ID,
				"error": map[string]any{"code": -32601, "message": "method not found: " + req.Method},
			})
		}
	}))
	t.Cleanup(srv.Close)
	return &bchain.Client{BridgeRPCURL: srv.URL, Timeout: 2 * time.Second}
}

// fireRequest sends one HTTP request through zip's in-process test
// transport and returns (status, body).
func fireRequest(t *testing.T, app *zip.App, method, target string, body []byte) (int, []byte) {
	t.Helper()
	var bodyReader io.Reader
	if body != nil {
		bodyReader = bytes.NewReader(body)
	}
	req := httptest.NewRequest(method, target, bodyReader)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := app.Fiber().Test(req, fiber.TestConfig{Timeout: 2 * time.Second})
	if err != nil {
		t.Fatalf("app.Test %s %s: %v", method, target, err)
	}
	defer resp.Body.Close()
	out, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, out
}

// =============================================================================
// Mock services for bchain / mchain
// =============================================================================

// mockBchain serves a tiny JSON-RPC endpoint that returns the
// registered method results. Used only by the /v1/bridge/info test —
// swap CRUD is native and never calls bchain.
func mockBchain(t *testing.T, on map[string]any) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ID, Method string
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		w.Header().Set("Content-Type", "application/json")
		result, ok := on[req.Method]
		if !ok {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"jsonrpc": "2.0", "id": req.ID,
				"error": map[string]any{"code": -32601, "message": "method not found: " + req.Method},
			})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "id": req.ID, "result": result})
	}))
	t.Cleanup(srv.Close)
	return srv
}

// stubReleaseStore is a deterministic in-memory ReleaseWalletStore for
// tests. Lets us assert that the create handler stamps the
// release-wallet fields onto the swap without spinning up a second
// mpcMock for the release-side keygen.
type stubReleaseStore struct {
	wallets map[string]*mchain.Wallet
	calls   map[string]int
}

func newStubReleaseStore() *stubReleaseStore {
	return &stubReleaseStore{
		wallets: map[string]*mchain.Wallet{},
		calls:   map[string]int{},
	}
}

// set programs the wallet returned for `network`.
func (s *stubReleaseStore) set(network, name, address string) {
	s.wallets[network] = &mchain.Wallet{Name: name, Address: address, AddressType: mchain.AddressTypeETH}
}

func (s *stubReleaseStore) GetOrCreate(_ context.Context, network string) (*mchain.Wallet, error) {
	s.calls[network]++
	w, ok := s.wallets[network]
	if !ok {
		return nil, errors.New("stubReleaseStore: no wallet programmed for " + network)
	}
	cp := *w
	return &cp, nil
}

// mpcMock serves a fake MPC /keygen endpoint.
func mpcMock(t *testing.T, eth, btc, sol string) *httptest.Server {
	return mpcMockFull(t, eth, btc, sol, "")
}

// mpcMockFull is mpcMock with an explicit ecdsa_pub_key — needed for
// substrate (DOT) tests where the bridge derives SS58 client-side.
func mpcMockFull(t *testing.T, eth, btc, sol, ecdsaPub string) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/keygen" || r.Method != http.MethodPost {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"wallet_id":     "bridge-mock-1718000000",
			"eth_address":   eth,
			"btc_address":   btc,
			"sol_address":   sol,
			"ecdsa_pub_key": ecdsaPub,
			"result_type":   "success",
		})
	}))
	t.Cleanup(srv.Close)
	return srv
}

// =============================================================================
// Quote (native, uses QuoteEngine — no bchain)
// =============================================================================

func TestQuote_ReturnsServerQuoteShape(t *testing.T) {
	rig := newRig(t, nil, nil, nil)

	status, body := fireRequest(t, rig.app, http.MethodGet,
		"/v1/bridge/quote?source_network=ETHEREUM_SEPOLIA&source_token=ETH&destination_network=LUX_TESTNET&destination_token=LUX&amount=1",
		nil)
	if status != http.StatusOK {
		t.Fatalf("status = %d, body=%s", status, body)
	}
	var resp struct {
		Data struct {
			Quote serverQuote `json:"quote"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatalf("decode: %v\n%s", err, body)
	}
	q := resp.Data.Quote
	// 1 ETH @ $3500 → LUX @ $2.50 → 1400 LUX gross.
	// No Lux-exit fee on this direction → receive = gross.
	if q.ReceiveAmount != 1400 {
		t.Errorf("ReceiveAmount = %v, want 1400", q.ReceiveAmount)
	}
	// min_receive = receive * (1 - 0.025) = 1365.
	if diff := q.MinReceiveAmount - 1365; diff > 0.001 || diff < -0.001 {
		t.Errorf("MinReceiveAmount = %v, want ~1365", q.MinReceiveAmount)
	}
	if q.ServiceFee != 0 {
		t.Errorf("ServiceFee should be 0 (non-Lux source), got %v", q.ServiceFee)
	}
	if q.Slippage != 0.025 {
		t.Errorf("Slippage = %v, want 0.025", q.Slippage)
	}
}

func TestQuote_LuxExitAppliesFee(t *testing.T) {
	// LUX → ETH = Lux exit, 1% fee applies.
	rig := newRig(t, nil, nil, nil)

	status, body := fireRequest(t, rig.app, http.MethodGet,
		"/v1/bridge/quote?source_network=LUX_TESTNET&source_token=LUX&destination_network=ETHEREUM_SEPOLIA&destination_token=ETH&amount=1000",
		nil)
	if status != http.StatusOK {
		t.Fatalf("status = %d, body=%s", status, body)
	}
	var resp struct {
		Data struct {
			Quote serverQuote `json:"quote"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatal(err)
	}
	// 1000 LUX @ $2.50 = $2500 / $3500/ETH = 0.7142857 ETH gross.
	// 1% fee on gross = 0.00714... ETH service fee.
	// net = gross - fee = 0.70714...
	if resp.Data.Quote.ServiceFee <= 0 {
		t.Errorf("Lux-source swap should have non-zero ServiceFee, got %v", resp.Data.Quote.ServiceFee)
	}
	if resp.Data.Quote.ReceiveAmount >= 0.7142858 {
		t.Errorf("ReceiveAmount should be < gross (0.7142857) due to fee, got %v", resp.Data.Quote.ReceiveAmount)
	}
}

func TestQuote_MissingParams400(t *testing.T) {
	rig := newRig(t, nil, nil, nil)
	status, body := fireRequest(t, rig.app, http.MethodGet, "/v1/bridge/quote?source_network=ETH", nil)
	if status != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400. body=%s", status, body)
	}
	if !strings.Contains(string(body), "missing_params") {
		t.Errorf("expected missing_params, got %s", body)
	}
}

func TestQuote_BadAmount400(t *testing.T) {
	rig := newRig(t, nil, nil, nil)
	status, body := fireRequest(t, rig.app, http.MethodGet,
		"/v1/bridge/quote?source_network=ETHEREUM_SEPOLIA&source_token=ETH&destination_network=LUX_TESTNET&destination_token=LUX&amount=not-a-number",
		nil)
	if status != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400. body=%s", status, body)
	}
	if !strings.Contains(string(body), "bad_amount") {
		t.Errorf("expected bad_amount, got %s", body)
	}
}

func TestQuote_UnknownAssetBubblesChainError(t *testing.T) {
	rig := newRig(t, nil, nil, nil)
	status, body := fireRequest(t, rig.app, http.MethodGet,
		"/v1/bridge/quote?source_network=ETHEREUM_SEPOLIA&source_token=ETH&destination_network=LUX_TESTNET&destination_token=UNOBTAINIUM&amount=1",
		nil)
	// Chain returns -32000; rpcErrToHTTP maps to 502 (B-Chain is a
	// remote dependency from the daemon's perspective). Either 502 or
	// the chain-mapped HTTP status is acceptable so long as the error
	// envelope identifies the upstream failure.
	if status == http.StatusOK {
		t.Fatalf("status=%d expected non-OK. body=%s", status, body)
	}
	if !strings.Contains(string(body), "price_unknown") &&
		!strings.Contains(string(body), "estimateFee_failed") {
		t.Errorf("expected price_unknown / estimateFee_failed, got %s", body)
	}
}

func TestQuote_NoBChainReturns503(t *testing.T) {
	// Daemon refuses to quote when --bchain-url unset (no fallback
	// price feed exists — that would be a centralization vector).
	cfg, _ := LoadConfig("")
	store := NewInMemoryStore()
	api := NewAPI(cfg, "", nil, nil, nil, store)
	app := zip.New(zip.Config{AppName: "lux-bridge-test", DisableStartupMessage: true})
	app.Use(middleware.Recover(), middleware.RequestID())
	api.Register(app)

	status, body := fireRequest(t, app, http.MethodGet,
		"/v1/bridge/quote?source_network=ETHEREUM_SEPOLIA&source_token=ETH&destination_network=LUX_TESTNET&destination_token=LUX&amount=1",
		nil)
	// Without bchain wired, /v1/bridge/quote is unregistered and
	// falls through to the legacy proxy path, which returns 503 with
	// backend_unavailable. Either route returns 503; the body
	// indicates the reason.
	if status != http.StatusServiceUnavailable {
		t.Fatalf("status=%d, want 503. body=%s", status, body)
	}
}

// =============================================================================
// Swap CRUD (native, uses SwapStore)
// =============================================================================

func TestSwapsCreate_PersistsToStore(t *testing.T) {
	rig := newRig(t, nil, nil, nil)

	reqBody, _ := json.Marshal(createSwapReq{
		Amount:             0.1,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		SourceAsset:        "ETH",
		DestinationNetwork: "LUX_TESTNET",
		DestinationAsset:   "LUX",
		DestinationAddress: "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
		UseDepositAddress:  false,
	})
	status, body := fireRequest(t, rig.app, http.MethodPost, "/v1/bridge/swaps", reqBody)
	if status != http.StatusOK {
		t.Fatalf("status = %d, body=%s", status, body)
	}
	var resp struct {
		Data serverSwap `json:"data"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(resp.Data.ID, "swap_") {
		t.Errorf("ID should start with swap_, got %q", resp.Data.ID)
	}
	if resp.Data.Status != string(SwapStatusUserDepositPending) {
		t.Errorf("Status = %q, want user_deposit_pending", resp.Data.Status)
	}
	// Verify it persisted by looking up directly in the store.
	stored, err := rig.store.Get(t.Context(), resp.Data.ID)
	if err != nil {
		t.Fatalf("store.Get: %v", err)
	}
	if stored.Amount != 0.1 || stored.SourceNetwork != "ETHEREUM_SEPOLIA" {
		t.Errorf("stored swap incorrect: %+v", stored)
	}
}

func TestSwapsCreate_MissingDestAddress400(t *testing.T) {
	rig := newRig(t, nil, nil, nil)
	reqBody, _ := json.Marshal(createSwapReq{
		Amount:             0.1,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		DestinationNetwork: "LUX_TESTNET",
		// DestinationAddress empty
	})
	status, body := fireRequest(t, rig.app, http.MethodPost, "/v1/bridge/swaps", reqBody)
	if status != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400. body=%s", status, body)
	}
	if !strings.Contains(string(body), "missing_params") {
		t.Errorf("expected missing_params, got %s", body)
	}
}

func TestSwapsCreate_NegativeAmount400(t *testing.T) {
	rig := newRig(t, nil, nil, nil)
	reqBody, _ := json.Marshal(createSwapReq{
		Amount:             -1,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		DestinationNetwork: "LUX_TESTNET",
		DestinationAddress: "0xabc",
	})
	status, body := fireRequest(t, rig.app, http.MethodPost, "/v1/bridge/swaps", reqBody)
	if status != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400. body=%s", status, body)
	}
	if !strings.Contains(string(body), "bad_amount") {
		t.Errorf("expected bad_amount, got %s", body)
	}
}

func TestSwapsGet_ReturnsStored(t *testing.T) {
	rig := newRig(t, nil, nil, nil)
	// Seed the store directly.
	sw := &Swap{
		Status:             SwapStatusBridgeTransferPending,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		DestinationNetwork: "LUX_TESTNET",
		SourceTxHash:       "0xsrctx",
		DestTxHash:         "0xdsttx",
		Signature:          "0xsig",
	}
	if err := rig.store.Create(t.Context(), sw); err != nil {
		t.Fatal(err)
	}

	status, body := fireRequest(t, rig.app, http.MethodGet, "/v1/bridge/swaps/"+sw.ID, nil)
	if status != http.StatusOK {
		t.Fatalf("status = %d, body=%s", status, body)
	}
	var resp struct {
		Data serverSwap `json:"data"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatal(err)
	}
	if resp.Data.ID != sw.ID || resp.Data.SourceTxHash != "0xsrctx" || resp.Data.DestTxHash != "0xdsttx" {
		t.Errorf("returned swap mismatch: %+v", resp.Data)
	}
	// The signature is operator material and rides the operator surface
	// instead (TestSwapListCarriesSignedMaterial in listener_test.go).
	if resp.Data.Signature != "" {
		t.Errorf("public swap read returned the MPC signature: %+v", resp.Data)
	}
}

func TestSwapsGet_NotFound404(t *testing.T) {
	rig := newRig(t, nil, nil, nil)
	status, body := fireRequest(t, rig.app, http.MethodGet, "/v1/bridge/swaps/swap_nonexistent", nil)
	if status != http.StatusNotFound {
		t.Fatalf("status = %d, want 404. body=%s", status, body)
	}
	if !strings.Contains(string(body), "not_found") {
		t.Errorf("expected not_found, got %s", body)
	}
}

func TestSwapsList_NewestFirst(t *testing.T) {
	rig := newRig(t, nil, nil, nil)
	for i := 0; i < 3; i++ {
		_ = rig.store.Create(t.Context(), &Swap{
			SourceNetwork:      "ETHEREUM_SEPOLIA",
			DestinationNetwork: "LUX_TESTNET",
			DestinationAddress: "0xabc",
			Amount:             float64(i + 1),
		})
		time.Sleep(2 * time.Millisecond) // ensure distinct CreatedAt
	}

	status, body := fireRequest(t, rig.admin, http.MethodGet, "/v1/bridge/swaps", nil)
	if status != http.StatusOK {
		t.Fatalf("status = %d, body=%s", status, body)
	}
	var resp struct {
		Data []serverSwap `json:"data"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Data) != 3 {
		t.Fatalf("expected 3 swaps, got %d", len(resp.Data))
	}
}

func TestSwapsList_FilterByStatus(t *testing.T) {
	rig := newRig(t, nil, nil, nil)
	_ = rig.store.Create(t.Context(), &Swap{Status: SwapStatusUserDepositPending})
	_ = rig.store.Create(t.Context(), &Swap{Status: SwapStatusCompleted})
	_ = rig.store.Create(t.Context(), &Swap{Status: SwapStatusCompleted})

	status, body := fireRequest(t, rig.admin, http.MethodGet, "/v1/bridge/swaps?status=completed", nil)
	if status != http.StatusOK {
		t.Fatalf("status = %d", status)
	}
	var resp struct {
		Data []serverSwap `json:"data"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Data) != 2 {
		t.Errorf("expected 2 completed swaps, got %d. body=%s", len(resp.Data), body)
	}
}

// =============================================================================
// XRP destination tag + X-address safety (swap-create boundary)
// =============================================================================
//
// XRP withdrawals are irreversible: a tag-less payout to an exchange's
// pooled deposit address is credited to nobody. These tests pin the
// create-time guards — X-address rejection, r-address validation, and
// destination_tag range validation — that make XRP withdrawal safe to
// enable.

// A canonical r-address used as a known-good XRP destination across the
// XRP create tests.
const testXRPClassicDest = "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe"

func TestSwapsCreate_XRP_RejectsXAddress(t *testing.T) {
	rig := newRig(t, nil, nil, nil)
	// Canonical XLS-5 testnet X-address — embeds a destination tag the
	// bridge can't honor through its separate DestinationTag field.
	reqBody, _ := json.Marshal(createSwapReq{
		Amount:             10,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		SourceAsset:        "ETH",
		DestinationNetwork: "XRP_TESTNET",
		DestinationAsset:   "XRP",
		DestinationAddress: "TVE26TYGhfLC7tQDno7G8dGtxSkYQn49b3qD26PK7FcGSKE",
	})
	status, body := fireRequest(t, rig.app, http.MethodPost, "/v1/bridge/swaps", reqBody)
	if status != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400. body=%s", status, body)
	}
	if !strings.Contains(string(body), "bad_destination") {
		t.Errorf("expected bad_destination, got %s", body)
	}
	if !strings.Contains(string(body), "X-address") {
		t.Errorf("error should name the X-address problem, got %s", body)
	}
}

func TestSwapsCreate_XRP_RejectsBadRAddress(t *testing.T) {
	rig := newRig(t, nil, nil, nil)
	reqBody, _ := json.Marshal(createSwapReq{
		Amount:             10,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		SourceAsset:        "ETH",
		DestinationNetwork: "XRP_TESTNET",
		DestinationAsset:   "XRP",
		DestinationAddress: "rNotAValidAddressXXXXXXXXXXXXXXXXXX",
	})
	status, body := fireRequest(t, rig.app, http.MethodPost, "/v1/bridge/swaps", reqBody)
	if status != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400. body=%s", status, body)
	}
	if !strings.Contains(string(body), "bad_destination") {
		t.Errorf("expected bad_destination, got %s", body)
	}
}

// "ppppp" panics rippledata.NewAccountFromAddress raw; the boundary must
// turn that into a clean 400, never a panic/500.
func TestSwapsCreate_XRP_DecoderPanicInput_CleanReject(t *testing.T) {
	rig := newRig(t, nil, nil, nil)
	reqBody, _ := json.Marshal(createSwapReq{
		Amount:             10,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		SourceAsset:        "ETH",
		DestinationNetwork: "XRP_TESTNET",
		DestinationAsset:   "XRP",
		DestinationAddress: "ppppp",
	})
	status, body := fireRequest(t, rig.app, http.MethodPost, "/v1/bridge/swaps", reqBody)
	if status != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 (clean reject, not panic). body=%s", status, body)
	}
	if !strings.Contains(string(body), "bad_destination") {
		t.Errorf("expected bad_destination, got %s", body)
	}
}

func TestSwapsCreate_XRP_RejectsTagOverUint32(t *testing.T) {
	rig := newRig(t, nil, nil, nil)
	overMax := int64(math.MaxUint32) + 1
	reqBody, _ := json.Marshal(createSwapReq{
		Amount:             10,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		SourceAsset:        "ETH",
		DestinationNetwork: "XRP_TESTNET",
		DestinationAsset:   "XRP",
		DestinationAddress: testXRPClassicDest,
		DestinationTag:     &overMax,
	})
	status, body := fireRequest(t, rig.app, http.MethodPost, "/v1/bridge/swaps", reqBody)
	if status != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400. body=%s", status, body)
	}
	if !strings.Contains(string(body), "bad_destination_tag") {
		t.Errorf("expected bad_destination_tag, got %s", body)
	}
}

func TestSwapsCreate_XRP_RejectsNegativeTag(t *testing.T) {
	rig := newRig(t, nil, nil, nil)
	neg := int64(-1)
	reqBody, _ := json.Marshal(createSwapReq{
		Amount:             10,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		SourceAsset:        "ETH",
		DestinationNetwork: "XRP_TESTNET",
		DestinationAsset:   "XRP",
		DestinationAddress: testXRPClassicDest,
		DestinationTag:     &neg,
	})
	status, body := fireRequest(t, rig.app, http.MethodPost, "/v1/bridge/swaps", reqBody)
	if status != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400. body=%s", status, body)
	}
	if !strings.Contains(string(body), "bad_destination_tag") {
		t.Errorf("expected bad_destination_tag, got %s", body)
	}
}

// Valid classic r-address + in-range tag → created, and the tag is
// persisted on the swap (read back from the store) so the XRP signing
// path can carry it onto the Payment.
func TestSwapsCreate_XRP_ValidClassicWithTag_Stored(t *testing.T) {
	bclient := newMockBChain(t, map[string]float64{"ETH": 3500, "XRP": 0.5})
	rig := newRig(t, bclient, nil, nil)

	tag := int64(1234567)
	reqBody, _ := json.Marshal(createSwapReq{
		Amount:             10,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		SourceAsset:        "ETH",
		DestinationNetwork: "XRP_TESTNET",
		DestinationAsset:   "XRP",
		DestinationAddress: testXRPClassicDest,
		DestinationTag:     &tag,
	})
	status, body := fireRequest(t, rig.app, http.MethodPost, "/v1/bridge/swaps", reqBody)
	if status != http.StatusOK {
		t.Fatalf("status = %d, body=%s", status, body)
	}
	var resp struct {
		Data serverSwap `json:"data"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatal(err)
	}
	stored, err := rig.store.Get(t.Context(), resp.Data.ID)
	if err != nil {
		t.Fatalf("store.Get: %v", err)
	}
	if stored.DestinationTag == nil || *stored.DestinationTag != uint32(tag) {
		t.Errorf("stored DestinationTag = %v, want %d", stored.DestinationTag, tag)
	}
	if stored.DestinationAddress != testXRPClassicDest {
		t.Errorf("stored DestinationAddress = %q, want %q", stored.DestinationAddress, testXRPClassicDest)
	}
}

// A classic r-address with NO tag is valid — personal wallets don't use
// tags. The swap is created and the stored tag stays nil.
func TestSwapsCreate_XRP_ValidClassicNoTag_StoredNil(t *testing.T) {
	bclient := newMockBChain(t, map[string]float64{"ETH": 3500, "XRP": 0.5})
	rig := newRig(t, bclient, nil, nil)

	reqBody, _ := json.Marshal(createSwapReq{
		Amount:             10,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		SourceAsset:        "ETH",
		DestinationNetwork: "XRP_TESTNET",
		DestinationAsset:   "XRP",
		DestinationAddress: testXRPClassicDest,
		// no DestinationTag
	})
	status, body := fireRequest(t, rig.app, http.MethodPost, "/v1/bridge/swaps", reqBody)
	if status != http.StatusOK {
		t.Fatalf("status = %d, body=%s", status, body)
	}
	var resp struct {
		Data serverSwap `json:"data"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatal(err)
	}
	stored, _ := rig.store.Get(t.Context(), resp.Data.ID)
	if stored.DestinationTag != nil {
		t.Errorf("stored DestinationTag = %d, want nil (no tag supplied)", *stored.DestinationTag)
	}
}

// =============================================================================
// MPC keygen wiring (use_deposit_address path)
// =============================================================================

func TestSwapsCreate_UseDepositAddressTrue_MintsMPCAddress(t *testing.T) {
	mpc := mpcMock(t, "0xMPC0000000000000000000000000000000000001", "", "")
	mc := &mchain.Client{APIURL: mpc.URL, OrgID: "test-org", Timeout: 2 * time.Second}
	rig := newRig(t, nil, mc, nil)

	reqBody, _ := json.Marshal(createSwapReq{
		Amount:             0.1,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		SourceAsset:        "ETH",
		DestinationNetwork: "LUX_TESTNET",
		DestinationAsset:   "LUX",
		DestinationAddress: "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
		UseDepositAddress:  true,
	})
	status, body := fireRequest(t, rig.app, http.MethodPost, "/v1/bridge/swaps", reqBody)
	if status != http.StatusOK {
		t.Fatalf("status = %d, body=%s", status, body)
	}
	var resp struct {
		Data serverSwap `json:"data"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(resp.Data.DepositAddress, "###0xMPC0000000000000000000000000000000000001") {
		t.Errorf("DepositAddress = %q, want suffix ###0xMPC0…", resp.Data.DepositAddress)
	}
	// Verify the address persisted to the store.
	stored, _ := rig.store.Get(t.Context(), resp.Data.ID)
	if stored.DepositAddress != resp.Data.DepositAddress {
		t.Errorf("stored DepositAddress mismatch: %q vs %q", stored.DepositAddress, resp.Data.DepositAddress)
	}
}

func TestSwapsCreate_UseDepositAddressFalse_SkipsMPC(t *testing.T) {
	// No mchain client at all — proves false path doesn't touch it.
	rig := newRig(t, nil, nil, nil)

	reqBody, _ := json.Marshal(createSwapReq{
		Amount:             0.1,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		SourceAsset:        "ETH",
		DestinationNetwork: "LUX_TESTNET",
		DestinationAsset:   "LUX",
		DestinationAddress: "0xabc",
		UseDepositAddress:  false,
	})
	status, body := fireRequest(t, rig.app, http.MethodPost, "/v1/bridge/swaps", reqBody)
	if status != http.StatusOK {
		t.Fatalf("status = %d, body=%s", status, body)
	}
	var resp struct {
		Data serverSwap `json:"data"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatal(err)
	}
	if resp.Data.DepositAddress != "" {
		t.Errorf("DepositAddress should be empty, got %q", resp.Data.DepositAddress)
	}
}

func TestSwapsCreate_UseDepositAddressTrue_NoMPC_Returns503(t *testing.T) {
	rig := newRig(t, nil, nil, nil) // mchain nil

	reqBody, _ := json.Marshal(createSwapReq{
		Amount:             0.1,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		SourceAsset:        "ETH",
		DestinationNetwork: "LUX_TESTNET",
		DestinationAsset:   "LUX",
		DestinationAddress: "0xabc",
		UseDepositAddress:  true,
	})
	status, body := fireRequest(t, rig.app, http.MethodPost, "/v1/bridge/swaps", reqBody)
	if status != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503. body=%s", status, body)
	}
	if !strings.Contains(string(body), "mpc_unavailable") {
		t.Errorf("expected mpc_unavailable, got %s", body)
	}
}

func TestSwapsCreate_DOTRequest_Succeeds(t *testing.T) {
	// As of the DOT integration, substrate keygens succeed: bridge derives
	// SS58 client-side from the cluster's ecdsa_pub_key. Verify the swap
	// is created with a Polkadot-style address.
	const pub = "02bf3e72a73be7a3a1b9b7872c7e3a7bf1c5e22f4e7f2a73be7a3a1b9b7872c7e3"
	mpc := mpcMockFull(t, "0xeth", "", "", pub)
	mc := &mchain.Client{APIURL: mpc.URL, OrgID: "test-org", Timeout: 2 * time.Second}
	rig := newRig(t, nil, mc, nil)

	reqBody, _ := json.Marshal(createSwapReq{
		Amount:             1,
		SourceNetwork:      "POLKADOT_MAINNET",
		SourceAsset:        "DAI", // price-feed-known; the request fails on the DOT keygen path, not pricing
		DestinationNetwork: "LUX_MAINNET",
		DestinationAsset:   "LUX",
		DestinationAddress: "0xfeed",
		UseDepositAddress:  true,
	})
	status, body := fireRequest(t, rig.app, http.MethodPost, "/v1/bridge/swaps", reqBody)
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200. body=%s", status, body)
	}
	if !strings.Contains(string(body), `"source_network":"POLKADOT_MAINNET"`) {
		t.Errorf("response missing source_network=POLKADOT_MAINNET: %s", body)
	}
	// Deposit address should be the SS58 string after the legacy ### separator.
	// For Polkadot mainnet, SS58 starts with '1'.
	if !strings.Contains(string(body), `###1`) {
		t.Errorf("expected SS58 deposit_address (starts with '1' after ###), got %s", body)
	}
}

func TestSwapsCreate_MPCKeygenFailure_Returns5xx(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"error":"keygen quorum down"}`))
	}))
	t.Cleanup(srv.Close)
	mc := &mchain.Client{APIURL: srv.URL, OrgID: "test-org", Timeout: time.Second}
	rig := newRig(t, nil, mc, nil)

	reqBody, _ := json.Marshal(createSwapReq{
		Amount:             0.1,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		SourceAsset:        "ETH",
		DestinationNetwork: "LUX_TESTNET",
		DestinationAsset:   "LUX",
		DestinationAddress: "0xabc",
		UseDepositAddress:  true,
	})
	status, body := fireRequest(t, rig.app, http.MethodPost, "/v1/bridge/swaps", reqBody)
	if status != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500. body=%s", status, body)
	}
	if !strings.Contains(string(body), "keygen_failed") {
		t.Errorf("expected keygen_failed, got %s", body)
	}
}

// =============================================================================
// /v1/bridge/info — pure bchain passthrough
// =============================================================================

func TestInfo_PassesBchainResult(t *testing.T) {
	bc := mockBchain(t, map[string]any{
		"bridge_getInfo": bchain.BridgeInfo{
			Version: "1.0", NodeID: "MOCK", MPCReady: true,
			Threshold: 3, TotalParties: 5,
		},
	})
	client := &bchain.Client{BridgeRPCURL: bc.URL, Timeout: 2 * time.Second}
	rig := newRig(t, client, nil, nil)

	status, body := fireRequest(t, rig.app, http.MethodGet, "/v1/bridge/info", nil)
	if status != http.StatusOK {
		t.Fatalf("status = %d, body=%s", status, body)
	}
	if !strings.Contains(string(body), `"mpcReady":true`) {
		t.Errorf("expected mpcReady:true, got %s", body)
	}
}

// =============================================================================
// /v1/bridge/check-deposit (ops diagnostic, uses depositcheck)
// =============================================================================

func TestCheckDeposit_Confirmed(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0", "id": 1, "result": "0xDE0B6B3A7640000", // 1 ETH
		})
	}))
	t.Cleanup(srv.Close)
	dc := &depositcheck.Client{
		Timeout:         2 * time.Second,
		RPCURLOverrides: map[string]string{"ETHEREUM_SEPOLIA": srv.URL},
	}
	rig := newRig(t, nil, nil, dc)

	reqBody, _ := json.Marshal(checkDepositReq{
		Network: "ETHEREUM_SEPOLIA",
		Address: "0xabc",
		Asset:   "ETH",
		Amount:  0.5,
	})
	status, body := fireRequest(t, rig.admin, http.MethodPost, "/v1/bridge/check-deposit", reqBody)
	if status != http.StatusOK {
		t.Fatalf("status = %d, body=%s", status, body)
	}
	if !strings.Contains(string(body), `"confirmed":true`) {
		t.Errorf("expected confirmed:true, got %s", body)
	}
}

func TestCheckDeposit_DOT_501(t *testing.T) {
	dc := &depositcheck.Client{Timeout: time.Second}
	rig := newRig(t, nil, nil, dc)

	reqBody, _ := json.Marshal(checkDepositReq{
		Network: "POLKADOT_MAINNET", Address: "1abc", Amount: 1,
	})
	status, body := fireRequest(t, rig.admin, http.MethodPost, "/v1/bridge/check-deposit", reqBody)
	if status != http.StatusNotImplemented {
		t.Fatalf("status = %d, want 501. body=%s", status, body)
	}
	if !strings.Contains(string(body), "substrate") {
		t.Errorf("expected substrate error, got %s", body)
	}
}

func TestCheckDeposit_MissingParams400(t *testing.T) {
	dc := &depositcheck.Client{Timeout: time.Second}
	rig := newRig(t, nil, nil, dc)

	reqBody, _ := json.Marshal(checkDepositReq{Amount: 1})
	status, body := fireRequest(t, rig.admin, http.MethodPost, "/v1/bridge/check-deposit", reqBody)
	if status != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400. body=%s", status, body)
	}
	if !strings.Contains(string(body), "missing_params") {
		t.Errorf("expected missing_params, got %s", body)
	}
}

func TestCheckDeposit_NotRegistered_WhenDisabled(t *testing.T) {
	// depcheck nil → handler not registered → 404 on POST.
	rig := newRig(t, nil, nil, nil)

	reqBody, _ := json.Marshal(checkDepositReq{Network: "ETHEREUM_SEPOLIA", Address: "0xabc", Amount: 1})
	status, _ := fireRequest(t, rig.admin, http.MethodPost, "/v1/bridge/check-deposit", reqBody)
	if status != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 (handler not registered when depcheck=nil)", status)
	}
}

// =============================================================================
// /api/* SDK aliases
// =============================================================================
//
// The TS SDK (pkg/bridge/src/app/lib/bridge-api.ts) calls
// /api/quote, /api/swaps and /api/swaps/:id — NOT the /v1/bridge/*
// paths the public docs advertise. cmd/bridge mounts the native
// handlers under both prefixes so the embedded SPA (same-origin
// apiHost = window.location.origin in dev) reaches them without
// dev-proxy gymnastics. These tests pin that contract.

func TestAPIAlias_QuoteParityWithV1(t *testing.T) {
	rig := newRig(t, nil, nil, nil)

	query := "source_network=ETHEREUM_SEPOLIA&source_token=ETH&destination_network=LUX_TESTNET&destination_token=LUX&amount=1"
	v1Status, v1Body := fireRequest(t, rig.app, http.MethodGet, "/v1/bridge/quote?"+query, nil)
	apiStatus, apiBody := fireRequest(t, rig.app, http.MethodGet, "/api/quote?"+query, nil)

	if v1Status != http.StatusOK || apiStatus != http.StatusOK {
		t.Fatalf("expected both 200, got v1=%d api=%d", v1Status, apiStatus)
	}
	if string(v1Body) != string(apiBody) {
		t.Fatalf("/api/quote body differs from /v1/bridge/quote\nv1:  %s\napi: %s", v1Body, apiBody)
	}
}

func TestAPIAlias_SwapsCreateGoesThroughNativeHandler(t *testing.T) {
	mpc := mpcMock(t, "0xabc", "tb1q", "Sol1111")
	mclient := &mchain.Client{APIURL: mpc.URL, OrgID: "test-org", Timeout: 2 * time.Second}
	rig := newRig(t, nil, mclient, nil)

	reqBody, _ := json.Marshal(createSwapReq{
		Amount:             0.1,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		SourceAsset:        "ETH",
		DestinationNetwork: "LUX_TESTNET",
		DestinationAsset:   "LUX",
		DestinationAddress: "0xdeadbeef",
		UseDepositAddress:  true,
	})
	status, body := fireRequest(t, rig.app, http.MethodPost, "/api/swaps", reqBody)
	if status != http.StatusOK {
		t.Fatalf("/api/swaps status = %d, body=%s", status, body)
	}
	var resp struct {
		Data serverSwap `json:"data"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatalf("decode: %v body=%s", err, body)
	}
	if resp.Data.ID == "" {
		t.Fatalf("expected swap id in /api/swaps response: %s", body)
	}
	// Must be persisted by the native store — proves we hit the
	// real handler, not the SPA fallback.
	if _, err := rig.store.Get(nil, resp.Data.ID); err != nil {
		t.Fatalf("swap not persisted by /api/swaps alias: %v", err)
	}
}

func TestAPIAlias_SwapsGetReturnsPersistedSwap(t *testing.T) {
	rig := newRig(t, nil, nil, nil)
	sw := &Swap{
		Status:             SwapStatusCompleted,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		DestinationNetwork: "LUX_TESTNET",
		DestinationAddress: "0xdeadbeef",
		Amount:             1,
	}
	if err := rig.store.Create(nil, sw); err != nil {
		t.Fatalf("seed: %v", err)
	}

	status, body := fireRequest(t, rig.app, http.MethodGet, "/api/swaps/"+sw.ID, nil)
	if status != http.StatusOK {
		t.Fatalf("status = %d body=%s", status, body)
	}
	var resp struct {
		Data serverSwap `json:"data"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatalf("decode: %v body=%s", err, body)
	}
	if resp.Data.ID != sw.ID {
		t.Fatalf("/api/swaps/:id returned id=%q want %q", resp.Data.ID, sw.ID)
	}
}

// =============================================================================
// Release-wallet wiring (the per-destination payout-treasury split)
// =============================================================================

// TestSwapsCreate_PopulatesReleaseWallet verifies that when the API
// has a release store wired, swap creation stamps the long-lived
// destination-network release wallet onto the swap row AND surfaces
// the address on the serverSwap envelope so the SDK/UI can display
// "paid from" diagnostics.
func TestSwapsCreate_PopulatesReleaseWallet(t *testing.T) {
	mpc := mpcMock(t, "0xDEP0sit0000000000000000000000000000000001", "", "")
	mc := &mchain.Client{APIURL: mpc.URL, OrgID: "test-org", Timeout: 2 * time.Second}
	rig := newRig(t, nil, mc, nil)

	releases := newStubReleaseStore()
	releases.set("LUX_TESTNET",
		"bridge-release-lux_testnet-1",
		"0xREL3ase0000000000000000000000000000000001",
	)
	rig.api.SetReleaseStore(releases)

	reqBody, _ := json.Marshal(createSwapReq{
		Amount:             0.01,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		SourceAsset:        "ETH",
		DestinationNetwork: "LUX_TESTNET",
		DestinationAsset:   "LUX",
		DestinationAddress: "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
		UseDepositAddress:  true,
	})
	status, body := fireRequest(t, rig.app, http.MethodPost, "/v1/bridge/swaps", reqBody)
	if status != http.StatusOK {
		t.Fatalf("status=%d body=%s", status, body)
	}
	var resp struct {
		Data serverSwap `json:"data"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatal(err)
	}
	if resp.Data.ReleaseAddress != "0xREL3ase0000000000000000000000000000000001" {
		t.Errorf("serverSwap.ReleaseAddress=%q, want stub address", resp.Data.ReleaseAddress)
	}
	stored, _ := rig.store.Get(t.Context(), resp.Data.ID)
	if stored.ReleaseWalletID != "bridge-release-lux_testnet-1" {
		t.Errorf("stored ReleaseWalletID=%q, want stub name", stored.ReleaseWalletID)
	}
	if stored.ReleaseAddress != "0xREL3ase0000000000000000000000000000000001" {
		t.Errorf("stored ReleaseAddress=%q, want stub address", stored.ReleaseAddress)
	}
	// Deposit and release are independent wallets — the deposit address
	// shouldn't accidentally overwrite the release one (or vice versa).
	if !strings.HasSuffix(stored.DepositAddress, "###0xDEP0sit0000000000000000000000000000000001") {
		t.Errorf("DepositAddress=%q does not carry the mpcMock eth address", stored.DepositAddress)
	}
	if stored.DepositAddress == stored.ReleaseAddress {
		t.Errorf("DepositAddress and ReleaseAddress collided — they MUST be distinct wallets")
	}
}

// TestSwapsCreate_ReleaseWalletReused proves a second swap to the same
// destination network reuses the same release wallet. This is the
// whole point of the long-lived release store — a single funded
// address pays out every swap to that chain.
func TestSwapsCreate_ReleaseWalletReused(t *testing.T) {
	mpc := mpcMock(t, "0xDEP0sit0000000000000000000000000000000001", "", "")
	mc := &mchain.Client{APIURL: mpc.URL, OrgID: "test-org", Timeout: 2 * time.Second}
	rig := newRig(t, nil, mc, nil)

	releases := newStubReleaseStore()
	releases.set("LUX_TESTNET", "release-lux-1", "0xREL3ase0000000000000000000000000000000001")
	rig.api.SetReleaseStore(releases)

	body, _ := json.Marshal(createSwapReq{
		Amount: 0.01, SourceNetwork: "ETHEREUM_SEPOLIA", SourceAsset: "ETH",
		DestinationNetwork: "LUX_TESTNET", DestinationAsset: "LUX",
		DestinationAddress: "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
		UseDepositAddress:  true,
	})
	for i := 0; i < 3; i++ {
		st, _ := fireRequest(t, rig.app, http.MethodPost, "/v1/bridge/swaps", body)
		if st != http.StatusOK {
			t.Fatalf("swap %d: status=%d", i, st)
		}
	}
	if got := releases.calls["LUX_TESTNET"]; got != 3 {
		t.Errorf("GetOrCreate called %d times, want 3 (once per swap)", got)
	}
}

// TestSwapsCreate_SnapshotsReceiveAmount proves the quote engine fires
// at create time and stamps the destination-asset receive amount onto
// the swap row + serverSwap envelope. Without this snapshot the
// signing driver would fall back to the raw input amount and the
// destination chain would receive 0.01-of-native instead of the
// quoted ~14 LUX.
func TestSwapsCreate_SnapshotsReceiveAmount(t *testing.T) {
	mpc := mpcMock(t, "0xDEP0sit0000000000000000000000000000000001", "", "")
	mc := &mchain.Client{APIURL: mpc.URL, OrgID: "test-org", Timeout: 2 * time.Second}
	rig := newRig(t, nil, mc, nil)

	reqBody, _ := json.Marshal(createSwapReq{
		Amount:             0.01, // 0.01 ETH @ $3500 ÷ $2.50 LUX = 14 LUX (no Lux-exit fee on Sepolia→Lux)
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		SourceAsset:        "ETH",
		DestinationNetwork: "LUX_TESTNET",
		DestinationAsset:   "LUX",
		DestinationAddress: "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
		UseDepositAddress:  true,
	})
	status, body := fireRequest(t, rig.app, http.MethodPost, "/v1/bridge/swaps", reqBody)
	if status != http.StatusOK {
		t.Fatalf("status=%d body=%s", status, body)
	}
	var resp struct {
		Data serverSwap `json:"data"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatal(err)
	}
	if resp.Data.ReceiveAmount != 14 {
		t.Errorf("serverSwap.ReceiveAmount=%v, want 14 (0.01 ETH @ $3500 / $2.50 LUX)", resp.Data.ReceiveAmount)
	}
	stored, _ := rig.store.Get(t.Context(), resp.Data.ID)
	if stored.ReceiveAmount != 14 {
		t.Errorf("stored ReceiveAmount=%v, want 14", stored.ReceiveAmount)
	}
	if stored.MinReceiveAmount != 14*(1-DefaultSlippage) {
		t.Errorf("stored MinReceiveAmount=%v, want %v", stored.MinReceiveAmount, 14*(1-DefaultSlippage))
	}
	// Sepolia→Lux has no exit-from-Lux fee (the source isn't Lux-family).
	if stored.ServiceFee != 0 {
		t.Errorf("stored ServiceFee=%v, want 0 for non-Lux-exit", stored.ServiceFee)
	}
}

// TestSwapsCreate_PriceUnknown_Returns503 covers the failure path:
// when the B-Chain RPC can't quote (asset unknown to the chain's
// quote engine), create fails at 502 rather than silently storing a
// 0 ReceiveAmount that would later get fed to the signing driver.
func TestSwapsCreate_PriceUnknown_Returns503(t *testing.T) {
	// Mock B-Chain with only LUX priced — ETH triggers price_unknown
	bclient := newMockBChain(t, map[string]float64{"LUX": 2.5})
	rig := newRig(t, bclient, nil, nil)

	reqBody, _ := json.Marshal(createSwapReq{
		Amount:             0.01,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		SourceAsset:        "ETH",
		DestinationNetwork: "LUX_TESTNET",
		DestinationAsset:   "LUX",
		DestinationAddress: "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
		UseDepositAddress:  false,
	})
	status, body := fireRequest(t, rig.app, http.MethodPost, "/v1/bridge/swaps", reqBody)
	// The chain returns a JSON-RPC error; rpcErrToHTTP maps that to
	// 502 (B-Chain is a remote dependency from the daemon's view).
	if status == http.StatusOK {
		t.Fatalf("status=%d, want non-OK. body=%s", status, body)
	}
	if !strings.Contains(string(body), "price_unknown") &&
		!strings.Contains(string(body), "estimateFee_failed") {
		t.Errorf("expected price_unknown / estimateFee_failed, got %s", body)
	}
}

// TestSwapsCreate_NoReleaseStore_LeavesFieldsBlank covers the legacy
// path: bridges running without --release-wallets-file (or without
// --mpc-url) shouldn't crash — the create handler just leaves the new
// fields empty and the signing driver's resolveReleaseSigning() falls
// back to the deposit-address envelope.
func TestSwapsCreate_NoReleaseStore_LeavesFieldsBlank(t *testing.T) {
	mpc := mpcMock(t, "0xDEP0sit0000000000000000000000000000000001", "", "")
	mc := &mchain.Client{APIURL: mpc.URL, OrgID: "test-org", Timeout: 2 * time.Second}
	rig := newRig(t, nil, mc, nil) // no SetReleaseStore call

	reqBody, _ := json.Marshal(createSwapReq{
		Amount: 0.01, SourceNetwork: "ETHEREUM_SEPOLIA", SourceAsset: "ETH",
		DestinationNetwork: "LUX_TESTNET", DestinationAsset: "LUX",
		DestinationAddress: "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
		UseDepositAddress:  true,
	})
	status, body := fireRequest(t, rig.app, http.MethodPost, "/v1/bridge/swaps", reqBody)
	if status != http.StatusOK {
		t.Fatalf("status=%d body=%s", status, body)
	}
	var resp struct {
		Data serverSwap `json:"data"`
	}
	_ = json.Unmarshal(body, &resp)
	if resp.Data.ReleaseAddress != "" {
		t.Errorf("ReleaseAddress=%q, want empty when no release store is wired", resp.Data.ReleaseAddress)
	}
	stored, _ := rig.store.Get(t.Context(), resp.Data.ID)
	if stored.ReleaseWalletID != "" || stored.ReleaseAddress != "" {
		t.Errorf("legacy create flow stamped release fields: id=%q addr=%q",
			stored.ReleaseWalletID, stored.ReleaseAddress)
	}
}

// =============================================================================
// Deposit / withdrawal gate (authoritative — the swap-create boundary)
// =============================================================================
//
// isWithdrawalEnabled / isDepositEnabled in networks.{env}.yaml MUST gate
// the actual swap pipeline, not merely shape the SPA's /currencies list.
// TestSwapsInject_GatedByWithdrawal: the operator inject-raw-tx admin path
// jumps straight to broadcasting, so it must ALSO honor the withdrawal gate —
// otherwise it bypasses the kill-switch (red MEDIUM). A disabled destination
// returns 403 and the swap is not advanced.
func TestSwapsInject_GatedByWithdrawal(t *testing.T) {
	no := false
	cfg := Config{Tokens: []Token{{Network: "XRP_MAINNET", Asset: "XRP", IsWithdrawalEnabled: &no}}}
	rig := newRigCfg(t, cfg, nil)
	sw := &Swap{
		Status:             SwapStatusBridgeTransferPending,
		DestinationNetwork: "XRP_MAINNET",
		DestinationAsset:   "XRP",
		DestinationAddress: testXRPClassicDest,
	}
	if err := rig.store.Create(t.Context(), sw); err != nil {
		t.Fatalf("seed: %v", err)
	}
	body, _ := json.Marshal(adminInjectRawTxReq{DestRawTx: "DEADBEEF"})
	status, respBody := fireRequest(t, rig.admin, http.MethodPost, "/admin/swaps/"+sw.ID+"/inject-raw-tx", body)
	if status != http.StatusForbidden {
		t.Fatalf("inject to a withdrawal-disabled destination must be 403, got %d: %s", status, respBody)
	}
	if !strings.Contains(string(respBody), "withdrawal_disabled") {
		t.Errorf("expected withdrawal_disabled, got %s", respBody)
	}
	if got, _ := rig.store.Get(t.Context(), sw.ID); got.Status != SwapStatusBridgeTransferPending {
		t.Errorf("gated inject must not advance the swap, got %q", got.Status)
	}
}

// A direct API caller (bypassing the SPA) must not be able to create a
// payout on a withdrawal-gated destination (XRP/BTC/SOL/TON on mainnet)
// or a deposit on a deposit-gated source. Rejection is BEFORE persist —
// no swap row, no minted deposit address.
func TestSwapsCreate_GatesDepositAndWithdrawal(t *testing.T) {
	no, yes := false, true
	cfg := Config{Tokens: []Token{
		// XRP mainnet: deposit-only, withdrawal gated (mirrors networks.mainnet.yaml).
		{Network: "XRP_MAINNET", Asset: "XRP", IsDepositEnabled: &yes, IsWithdrawalEnabled: &no},
		// SOL mainnet: both legs gated.
		{Network: "SOLANA_MAINNET", Asset: "SOL", IsDepositEnabled: &no, IsWithdrawalEnabled: &no},
		// LUX testnet: explicitly enabled (the happy path).
		{Network: "LUX_TESTNET", Asset: "LUX", IsDepositEnabled: &yes, IsWithdrawalEnabled: &yes},
	}}
	// Price ETH/LUX/XRP/SOL so the enabled row's quote snapshot succeeds.
	bclient := newMockBChain(t, map[string]float64{"ETH": 3500, "LUX": 2.5, "XRP": 0.5, "SOL": 150})

	cases := []struct {
		name       string
		req        createSwapReq
		wantStatus int
		wantErr    string // body substring on rejection; "" ⇒ expect a created swap
	}{
		{
			name: "withdrawal_disabled_destination_rejected",
			req: createSwapReq{
				Amount: 10, SourceNetwork: "ETHEREUM_SEPOLIA", SourceAsset: "ETH",
				DestinationNetwork: "XRP_MAINNET", DestinationAsset: "XRP",
				DestinationAddress: testXRPClassicDest,
			},
			wantStatus: http.StatusForbidden,
			wantErr:    "withdrawal_disabled",
		},
		{
			name: "deposit_disabled_source_rejected",
			req: createSwapReq{
				Amount: 1, SourceNetwork: "SOLANA_MAINNET", SourceAsset: "SOL",
				DestinationNetwork: "LUX_TESTNET", DestinationAsset: "LUX",
				DestinationAddress: "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
			},
			wantStatus: http.StatusForbidden,
			wantErr:    "deposit_disabled",
		},
		{
			name: "enabled_destination_accepted",
			req: createSwapReq{
				Amount: 0.1, SourceNetwork: "ETHEREUM_SEPOLIA", SourceAsset: "ETH",
				DestinationNetwork: "LUX_TESTNET", DestinationAsset: "LUX",
				DestinationAddress: "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
			},
			wantStatus: http.StatusOK,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rig := newRigCfg(t, cfg, bclient)
			body, _ := json.Marshal(tc.req)
			status, resp := fireRequest(t, rig.app, http.MethodPost, "/v1/bridge/swaps", body)
			if status != tc.wantStatus {
				t.Fatalf("status = %d, want %d. body=%s", status, tc.wantStatus, resp)
			}
			if tc.wantErr != "" {
				if !strings.Contains(string(resp), tc.wantErr) {
					t.Errorf("body should contain %q, got %s", tc.wantErr, resp)
				}
				// A rejected create must NOT have persisted a swap.
				list, _ := rig.store.List(t.Context(), SwapFilter{})
				if len(list) != 0 {
					t.Errorf("rejected create must not persist a swap; store has %d", len(list))
				}
				return
			}
			// Accepted: a swap row exists with a real id.
			var ok struct {
				Data serverSwap `json:"data"`
			}
			if err := json.Unmarshal(resp, &ok); err != nil {
				t.Fatalf("decode: %v body=%s", err, resp)
			}
			if !strings.HasPrefix(ok.Data.ID, "swap_") {
				t.Errorf("expected a created swap id, got %q", ok.Data.ID)
			}
		})
	}
}
