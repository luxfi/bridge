// Tests for the cmd/bridge HTTP layer.
//
// After the LP-333 architecture refocus, swap CRUD is native to
// cmd/bridge — backed by an in-memory SwapStore + QuoteEngine. The
// b-chain client (when set) is queried only for signer-set introspection
// via /v1/bridge/info; it does NOT host the quote / submit / status
// methods (those don't exist on real BridgeVM).

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/hanzoai/zip"
	"github.com/hanzoai/zip/middleware"
	"github.com/luxfi/bridge/internal/bchain"
	"github.com/luxfi/bridge/internal/depositcheck"
	"github.com/luxfi/bridge/internal/mchain"
)

// =============================================================================
// Helpers
// =============================================================================

// testRig bundles an app with its underlying store + price feed so
// individual tests can poke state directly when needed.
type testRig struct {
	app   *zip.App
	store *InMemoryStore
	feed  *StaticPriceFeed
	api   *API
}

// defaultPrices is the seeded price feed for all tests. Round numbers
// keep the float-comparison assertions readable.
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

// newRig assembles a fully-wired test app with optional bchain /
// mchain / depositcheck clients. Store + quote engine are always
// constructed locally; tests assert against rig.store directly when
// they need to verify persistence.
func newRig(t *testing.T, bclient *bchain.Client, mclient *mchain.Client, dc *depositcheck.Client) *testRig {
	t.Helper()
	cfg, _ := LoadConfig("")
	store := NewInMemoryStore()
	feed := NewStaticPriceFeed(defaultPrices())
	engine := &QuoteEngine{Feed: feed}
	api := NewAPI(cfg, "", bclient, mclient, dc, store, engine)
	app := zip.New(zip.Config{AppName: "lux-bridge-test", DisableStartupMessage: true})
	app.Use(middleware.Recover(), middleware.RequestID())
	api.Register(app)
	return &testRig{app: app, store: store, feed: feed, api: api}
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
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/keygen" || r.Method != http.MethodPost {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"wallet_id":   "bridge-mock-1718000000",
			"eth_address": eth,
			"btc_address": btc,
			"sol_address": sol,
			"result_type": "success",
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

func TestQuote_UnknownAsset503(t *testing.T) {
	rig := newRig(t, nil, nil, nil)
	status, body := fireRequest(t, rig.app, http.MethodGet,
		"/v1/bridge/quote?source_network=ETHEREUM_SEPOLIA&source_token=UNOBTAINIUM&destination_network=LUX_TESTNET&destination_token=LUX&amount=1",
		nil)
	if status != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503. body=%s", status, body)
	}
	if !strings.Contains(string(body), "price_unknown") {
		t.Errorf("expected price_unknown, got %s", body)
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

// TestSwapsCreate_SolSource_EvmSenderRejected guards the refund leg:
// for a cross-family swap (svm source, evm destination) the SPA MUST
// supply a base58 sender (the user's Phantom wallet) — silently falling
// back to the EVM destination_address would brick the refund driver
// with "preSign Solana refund: invalid base58 character '0'". Regression
// for the Sol→Lux smoke-test bug where missing solSenderAddress caused
// every refund attempt to fail and deposits to need manual recovery.
func TestSwapsCreate_SolSource_EvmSenderRejected(t *testing.T) {
	rig := newRig(t, nil, nil, nil)
	reqBody, _ := json.Marshal(createSwapReq{
		Amount:             0.1,
		SourceNetwork:      "SOLANA_DEVNET",
		SourceAsset:        "SOL",
		DestinationNetwork: "LUX_TESTNET",
		DestinationAsset:   "LUX",
		DestinationAddress: "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
		Sender:             "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473", // EVM hex on a Solana source
	})
	status, body := fireRequest(t, rig.app, http.MethodPost, "/v1/bridge/swaps", reqBody)
	if status != http.StatusBadRequest {
		t.Fatalf("expected 400 for EVM sender on Solana source, got status=%d body=%s", status, body)
	}
	if !strings.Contains(string(body), "sender_wrong_chain_family") {
		t.Errorf("expected sender_wrong_chain_family error, got %s", body)
	}
}

// TestSwapsCreate_SolSource_EmptySenderRejected complements the above:
// when the SPA fails to populate sender for a cross-family swap, the
// old behaviour silently fell back to req.DestinationAddress (which is
// in the destination family — e.g. EVM for Sol→Lux). Refuse instead.
func TestSwapsCreate_SolSource_EmptySenderRejected(t *testing.T) {
	rig := newRig(t, nil, nil, nil)
	reqBody, _ := json.Marshal(createSwapReq{
		Amount:             0.1,
		SourceNetwork:      "SOLANA_DEVNET",
		SourceAsset:        "SOL",
		DestinationNetwork: "LUX_TESTNET",
		DestinationAsset:   "LUX",
		DestinationAddress: "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
		// Sender omitted — used to fall back to destination_address.
	})
	status, body := fireRequest(t, rig.app, http.MethodPost, "/v1/bridge/swaps", reqBody)
	if status != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing sender on cross-family swap, got status=%d body=%s", status, body)
	}
	if !strings.Contains(string(body), "missing_source_chain_sender") {
		t.Errorf("expected missing_source_chain_sender error, got %s", body)
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
	if resp.Data.ID != sw.ID || resp.Data.Signature != "0xsig" {
		t.Errorf("returned swap mismatch: %+v", resp.Data)
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

	status, body := fireRequest(t, rig.app, http.MethodGet, "/v1/bridge/swaps", nil)
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

	status, body := fireRequest(t, rig.app, http.MethodGet, "/v1/bridge/swaps?status=completed", nil)
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

func TestSwapsCreate_DOTRequest_Returns501(t *testing.T) {
	mpc := mpcMock(t, "0xeth", "", "")
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
	if status != http.StatusNotImplemented {
		t.Fatalf("status = %d, want 501. body=%s", status, body)
	}
	if !strings.Contains(string(body), "unsupported_chain") {
		t.Errorf("expected unsupported_chain, got %s", body)
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
	status, body := fireRequest(t, rig.app, http.MethodPost, "/v1/bridge/check-deposit", reqBody)
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
	status, body := fireRequest(t, rig.app, http.MethodPost, "/v1/bridge/check-deposit", reqBody)
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
	status, body := fireRequest(t, rig.app, http.MethodPost, "/v1/bridge/check-deposit", reqBody)
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
	status, _ := fireRequest(t, rig.app, http.MethodPost, "/v1/bridge/check-deposit", reqBody)
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
// when the price feed can't quote (asset not in the feed), create
// fails at 503 rather than silently storing a 0 ReceiveAmount that
// would later get fed to the signing driver.
func TestSwapsCreate_PriceUnknown_Returns503(t *testing.T) {
	rig := newRig(t, nil, nil, nil)
	rig.feed.Set("ETH", 0)
	// Wipe a price by giving the feed a fresh map that omits ETH.
	rig.api.quote = &QuoteEngine{Feed: NewStaticPriceFeed(map[string]float64{"LUX": 2.5})}

	reqBody, _ := json.Marshal(createSwapReq{
		Amount:             0.01,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		SourceAsset:        "ETH", // not in feed
		DestinationNetwork: "LUX_TESTNET",
		DestinationAsset:   "LUX",
		DestinationAddress: "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
		UseDepositAddress:  false,
	})
	status, body := fireRequest(t, rig.app, http.MethodPost, "/v1/bridge/swaps", reqBody)
	if status != http.StatusServiceUnavailable {
		t.Fatalf("status=%d, want 503. body=%s", status, body)
	}
	if !strings.Contains(string(body), "price_unknown") {
		t.Errorf("expected price_unknown error, got %s", body)
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
