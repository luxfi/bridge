package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/zap-proto/zip"
	middleware "github.com/zap-proto/zip/middleware"
	"github.com/luxfi/bridge"
)

// apiRig is a minimal API+App pair for exercising the read-only REST
// surface (tokens/exchanges/limits/profile) with controlled fixtures,
// separate from metricsRig's zero-value config.
type apiRig struct {
	app *zip.App
	api *API
}

func newAPIRig(t *testing.T, cfg Config) *apiRig {
	t.Helper()
	store := NewInMemoryStore()
	api := NewAPI(cfg, "", nil, nil, nil, store)
	app := zip.New(zip.Config{AppName: "lux-bridge-test-api", DisableStartupMessage: true})
	app.Use(middleware.Recover(), middleware.RequestID())
	api.Register(app)
	return &apiRig{app: app, api: api}
}

// =============================================================================
// GET /v1/bridge/tokens
// =============================================================================

func TestTokens_ReturnsAllWhenNoNetworkFilter(t *testing.T) {
	rig := newAPIRig(t, Config{Tokens: []Token{
		{Asset: "ETH", Network: "ETHEREUM_MAINNET"},
		{Asset: "SOL", Network: "SOLANA_MAINNET"},
	}})
	_, body := fireRequest(t, rig.app, "GET", "/v1/bridge/tokens", nil)
	var got []Token
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatalf("decode: %v (body=%s)", err, body)
	}
	if len(got) != 2 {
		t.Fatalf("len = %d, want 2 (unfiltered)", len(got))
	}
}

func TestTokens_FiltersByNetworkQueryParam(t *testing.T) {
	rig := newAPIRig(t, Config{Tokens: []Token{
		{Asset: "ETH", Network: "ETHEREUM_MAINNET"},
		{Asset: "USDC", Network: "ETHEREUM_MAINNET"},
		{Asset: "SOL", Network: "SOLANA_MAINNET"},
	}})
	_, body := fireRequest(t, rig.app, "GET", "/v1/bridge/tokens?network=ETHEREUM_MAINNET", nil)
	var got []Token
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatalf("decode: %v (body=%s)", err, body)
	}
	if len(got) != 2 {
		t.Fatalf("len = %d, want 2 (ETHEREUM_MAINNET only)", len(got))
	}
	for _, tok := range got {
		if tok.Network != "" {
			t.Errorf("Network should be json:\"-\" (server-side only), got %q in response", tok.Network)
		}
	}
}

func TestTokens_UnknownNetworkFilterReturnsEmptyNotAll(t *testing.T) {
	rig := newAPIRig(t, Config{Tokens: []Token{{Asset: "ETH", Network: "ETHEREUM_MAINNET"}}})
	_, body := fireRequest(t, rig.app, "GET", "/v1/bridge/tokens?network=NOPE", nil)
	var got []Token
	_ = json.Unmarshal(body, &got)
	if len(got) != 0 {
		t.Fatalf("len = %d, want 0 for an unknown network filter", len(got))
	}
}

// =============================================================================
// GET /v1/bridge/exchanges, /v1/bridge/limits, /v1/bridge/profile
// =============================================================================

func TestExchanges_ReturnsConfiguredList(t *testing.T) {
	rig := newAPIRig(t, Config{Exchanges: []Exchange{{InternalName: "coinbase", DisplayName: "Coinbase"}}})
	status, body := fireRequest(t, rig.app, "GET", "/v1/bridge/exchanges", nil)
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200", status)
	}
	var got []Exchange
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatalf("decode: %v (body=%s)", err, body)
	}
	if len(got) != 1 || got[0].DisplayName != "Coinbase" {
		t.Errorf("got %+v, want [{Coinbase}]", got)
	}
}

func TestLimits_ReturnsConfiguredLimits(t *testing.T) {
	rig := newAPIRig(t, Config{Limits: Limits{MinUSD: 10, MaxUSD: 100000}})
	status, body := fireRequest(t, rig.app, "GET", "/v1/bridge/limits", nil)
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200", status)
	}
	var got Limits
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatalf("decode: %v (body=%s)", err, body)
	}
	if got.MinUSD != 10 || got.MaxUSD != 100000 {
		t.Errorf("got %+v, want MinUSD=10 MaxUSD=100000", got)
	}
}

func TestProfileGET_ReturnsDefaultProfile(t *testing.T) {
	rig := newAPIRig(t, Config{})
	status, body := fireRequest(t, rig.app, "GET", "/v1/bridge/profile", nil)
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200", status)
	}
	if !strings.Contains(string(body), bridge.BridgeClassicalCompat.Name) {
		t.Errorf("body = %s, want it to mention the default profile %q", body, bridge.BridgeClassicalCompat.Name)
	}
}

func TestSetProfile_OverridesProfile(t *testing.T) {
	rig := newAPIRig(t, Config{})
	strict := bridge.LuxStrictPQBridgeProfile
	rig.api.SetProfile(&strict)

	_, body := fireRequest(t, rig.app, "GET", "/v1/bridge/profile", nil)
	if !strings.Contains(string(body), strict.Name) {
		t.Errorf("body = %s, want it to reflect the overridden profile %q", body, strict.Name)
	}
}

func TestSetProfile_NilIsNoOp(t *testing.T) {
	rig := newAPIRig(t, Config{})
	rig.api.SetProfile(nil)
	_, body := fireRequest(t, rig.app, "GET", "/v1/bridge/profile", nil)
	if !strings.Contains(string(body), bridge.BridgeClassicalCompat.Name) {
		t.Errorf("SetProfile(nil) should leave the default profile intact; body = %s", body)
	}
}

// =============================================================================
// stripPathPrefix — legacy Express-proxy Director.
// =============================================================================

func TestStripPathPrefix_RewritesPathAndHost(t *testing.T) {
	target, _ := url.Parse("http://backend.internal:5000")
	director := stripPathPrefix(target, "/v1/bridge")

	req := httptest.NewRequest(http.MethodGet, "https://bridge.lux.network/v1/bridge/swaps/123", nil)
	director(req)

	if req.URL.Scheme != "http" || req.URL.Host != "backend.internal:5000" {
		t.Errorf("scheme/host = %s/%s, want http/backend.internal:5000", req.URL.Scheme, req.URL.Host)
	}
	if req.Host != "backend.internal:5000" {
		t.Errorf("Host header = %q, want backend.internal:5000", req.Host)
	}
	if req.URL.Path != "/swaps/123" {
		t.Errorf("Path = %q, want /swaps/123", req.URL.Path)
	}
}

// A request to exactly the prefix (nothing left after trimming) must
// rewrite to "/", not an empty path — an empty URL.Path on an outbound
// proxied request is invalid and would 400 against most backends.
func TestStripPathPrefix_EmptyPathBecomesRoot(t *testing.T) {
	target, _ := url.Parse("http://backend.internal")
	director := stripPathPrefix(target, "/v1/bridge")

	req := httptest.NewRequest(http.MethodGet, "https://bridge.lux.network/v1/bridge", nil)
	director(req)

	if req.URL.Path != "/" {
		t.Errorf("Path = %q, want / for an exact-prefix match", req.URL.Path)
	}
}

