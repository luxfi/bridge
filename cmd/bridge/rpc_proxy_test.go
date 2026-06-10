package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/hanzoai/zip"
	middleware "github.com/hanzoai/zip/middleware"
)

// rpcProxyRig stands up an API with a single LUX proxy wired to a
// httptest upstream so we can assert the proxy preserves body, method,
// status, and content-type without ever needing CORS.
type rpcProxyRig struct {
	app      *zip.App
	upstream *httptest.Server
	hits     atomic.Int64
	lastBody atomic.Value // []byte
}

func newRPCProxyRig(t *testing.T) *rpcProxyRig {
	t.Helper()
	rig := &rpcProxyRig{}
	rig.upstream = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rig.hits.Add(1)
		body, _ := io.ReadAll(r.Body)
		rig.lastBody.Store(body)
		// Mirror the request method header to prove the proxy POSTs.
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Echo-Method", r.Method)
		_, _ = w.Write([]byte(`{"jsonrpc":"2.0","id":1,"result":"0x17871"}`))
	}))
	t.Cleanup(rig.upstream.Close)

	cfg, _ := LoadConfig("")
	store := NewInMemoryStore()
	engine := &QuoteEngine{Feed: NewStaticPriceFeed(defaultPrices())}
	api := NewAPI(cfg, "", nil, nil, nil, store, engine)
	api.SetLuxRPCURLs(rig.upstream.URL, "", time.Second, nil)
	app := zip.New(zip.Config{AppName: "lux-bridge-test-rpc-proxy", DisableStartupMessage: true})
	app.Use(middleware.Recover(), middleware.RequestID())
	api.Register(app)
	rig.app = app
	return rig
}

// TestRPCProxy_ForwardsBodyAndReturnsResponse covers the central
// claim: POST body in → upstream gets verbatim copy, response back
// reaches the SPA unchanged.
func TestRPCProxy_ForwardsBodyAndReturnsResponse(t *testing.T) {
	rig := newRPCProxyRig(t)

	reqBody := []byte(`{"jsonrpc":"2.0","id":42,"method":"eth_chainId","params":[]}`)
	status, body := fireRequest(t, rig.app, "POST", "/api/rpc/lux-mainnet", reqBody)
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", status, body)
	}
	if !strings.Contains(string(body), `"result":"0x17871"`) {
		t.Errorf("response body mismatch: %s", body)
	}
	if rig.hits.Load() != 1 {
		t.Errorf("upstream hits = %d, want 1", rig.hits.Load())
	}
	got := rig.lastBody.Load().([]byte)
	if string(got) != string(reqBody) {
		t.Errorf("upstream body mismatch: got %s, want %s", got, reqBody)
	}
}

// TestRPCProxy_DisabledRouteReturns404 covers the "operator did not
// configure the proxy" branch: when the mainnet URL is empty, the
// route is not registered and the SPA gets a 404.
func TestRPCProxy_DisabledRouteReturns404(t *testing.T) {
	cfg, _ := LoadConfig("")
	store := NewInMemoryStore()
	engine := &QuoteEngine{Feed: NewStaticPriceFeed(defaultPrices())}
	api := NewAPI(cfg, "", nil, nil, nil, store, engine)
	// Both URLs empty → no routes registered.
	api.SetLuxRPCURLs("", "", time.Second, nil)
	app := zip.New(zip.Config{AppName: "lux-bridge-test-rpc-proxy-off", DisableStartupMessage: true})
	app.Use(middleware.Recover(), middleware.RequestID())
	api.Register(app)

	status, _ := fireRequest(t, app, "POST", "/api/rpc/lux-mainnet", []byte(`{}`))
	if status != http.StatusNotFound {
		t.Errorf("status = %d, want 404 (route not registered)", status)
	}
}

// TestRPCProxy_UpstreamErrorSurfacesAsBadGateway covers the fail-loud
// contract: when the upstream is dead, the proxy returns 502 with
// an actionable JSON body so the SPA's wagmi can transition out of
// loading instead of staying on '…' forever.
func TestRPCProxy_UpstreamErrorSurfacesAsBadGateway(t *testing.T) {
	cfg, _ := LoadConfig("")
	store := NewInMemoryStore()
	engine := &QuoteEngine{Feed: NewStaticPriceFeed(defaultPrices())}
	api := NewAPI(cfg, "", nil, nil, nil, store, engine)
	// Point at an unbindable port so the upstream call fails.
	api.SetLuxRPCURLs("http://127.0.0.1:1", "", 200*time.Millisecond, nil)
	app := zip.New(zip.Config{AppName: "lux-bridge-test-rpc-proxy-dead", DisableStartupMessage: true})
	app.Use(middleware.Recover(), middleware.RequestID())
	api.Register(app)

	status, body := fireRequest(t, app, "POST", "/api/rpc/lux-mainnet", []byte(`{"jsonrpc":"2.0"}`))
	if status != http.StatusBadGateway {
		t.Errorf("status = %d, want 502; body=%s", status, body)
	}
	if !strings.Contains(string(body), "rpc_proxy_upstream_unreachable") {
		t.Errorf("error envelope missing 'rpc_proxy_upstream_unreachable': %s", body)
	}
}

// TestRPCProxy_PreservesUpstreamStatus covers the "upstream returned a
// JSON-RPC error" case — the proxy must surface the upstream status
// code (often 200 with a body-level error envelope, but tested here
// with a non-200 to prove the status is forwarded).
func TestRPCProxy_PreservesUpstreamStatus(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`{"jsonrpc":"2.0","id":1,"error":{"code":-32005,"message":"rate limited"}}`))
	}))
	t.Cleanup(upstream.Close)

	cfg, _ := LoadConfig("")
	store := NewInMemoryStore()
	engine := &QuoteEngine{Feed: NewStaticPriceFeed(defaultPrices())}
	api := NewAPI(cfg, "", nil, nil, nil, store, engine)
	api.SetLuxRPCURLs(upstream.URL, "", time.Second, nil)
	app := zip.New(zip.Config{AppName: "lux-bridge-test-rpc-proxy-429", DisableStartupMessage: true})
	app.Use(middleware.Recover(), middleware.RequestID())
	api.Register(app)

	status, body := fireRequest(t, app, "POST", "/api/rpc/lux-mainnet", []byte(`{}`))
	if status != http.StatusTooManyRequests {
		t.Errorf("status = %d, want 429 (preserved from upstream)", status)
	}
	if !strings.Contains(string(body), "rate limited") {
		t.Errorf("upstream body not preserved: %s", body)
	}
}

// TestRPCProxy_BothNetworksConcurrentlyMounted covers the case where
// an operator configures BOTH mainnet + testnet URLs. Each route
// targets its own upstream independently.
func TestRPCProxy_BothNetworksConcurrentlyMounted(t *testing.T) {
	var mainHits, testHits atomic.Int64
	main := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		mainHits.Add(1)
		_, _ = w.Write([]byte(`{"result":"mainnet"}`))
	}))
	t.Cleanup(main.Close)
	test := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		testHits.Add(1)
		_, _ = w.Write([]byte(`{"result":"testnet"}`))
	}))
	t.Cleanup(test.Close)

	cfg, _ := LoadConfig("")
	store := NewInMemoryStore()
	engine := &QuoteEngine{Feed: NewStaticPriceFeed(defaultPrices())}
	api := NewAPI(cfg, "", nil, nil, nil, store, engine)
	api.SetLuxRPCURLs(main.URL, test.URL, time.Second, nil)
	app := zip.New(zip.Config{AppName: "lux-bridge-test-rpc-proxy-both", DisableStartupMessage: true})
	app.Use(middleware.Recover(), middleware.RequestID())
	api.Register(app)

	if _, _ = fireRequest(t, app, "POST", "/api/rpc/lux-mainnet", []byte(`{}`)); mainHits.Load() != 1 {
		t.Errorf("mainnet hits = %d, want 1", mainHits.Load())
	}
	if testHits.Load() != 0 {
		t.Errorf("testnet hits = %d, want 0 after mainnet call", testHits.Load())
	}
	if _, _ = fireRequest(t, app, "POST", "/api/rpc/lux-testnet", []byte(`{}`)); testHits.Load() != 1 {
		t.Errorf("testnet hits = %d, want 1", testHits.Load())
	}
}

// TestRPCProxy_ZooRoutesMountedIndependently covers the Zoo proxy pair:
// /api/rpc/zoo-{mainnet,testnet} mount via SetZooRPCURLs, target their
// own upstreams, and don't require the LUX proxy to be configured.
func TestRPCProxy_ZooRoutesMountedIndependently(t *testing.T) {
	var mainHits, testHits atomic.Int64
	main := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		mainHits.Add(1)
		_, _ = w.Write([]byte(`{"result":"zoo-mainnet"}`))
	}))
	t.Cleanup(main.Close)
	test := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		testHits.Add(1)
		_, _ = w.Write([]byte(`{"result":"zoo-testnet"}`))
	}))
	t.Cleanup(test.Close)

	cfg, _ := LoadConfig("")
	store := NewInMemoryStore()
	engine := &QuoteEngine{Feed: NewStaticPriceFeed(defaultPrices())}
	api := NewAPI(cfg, "", nil, nil, nil, store, engine)
	// LUX proxy deliberately unset — zoo routes must mount on their own.
	api.SetZooRPCURLs(main.URL, test.URL, time.Second, nil)
	app := zip.New(zip.Config{AppName: "lux-bridge-test-rpc-proxy-zoo", DisableStartupMessage: true})
	app.Use(middleware.Recover(), middleware.RequestID())
	api.Register(app)

	status, body := fireRequest(t, app, "POST", "/api/rpc/zoo-mainnet", []byte(`{}`))
	if status != http.StatusOK || !strings.Contains(string(body), "zoo-mainnet") {
		t.Errorf("zoo-mainnet: status=%d body=%s, want 200 + zoo-mainnet result", status, body)
	}
	if _, _ = fireRequest(t, app, "POST", "/api/rpc/zoo-testnet", []byte(`{}`)); testHits.Load() != 1 {
		t.Errorf("zoo testnet hits = %d, want 1", testHits.Load())
	}
	if mainHits.Load() != 1 {
		t.Errorf("zoo mainnet hits = %d, want 1", mainHits.Load())
	}
	// LUX routes stay unregistered when only the Zoo proxy is configured.
	if status, _ := fireRequest(t, app, "POST", "/api/rpc/lux-mainnet", []byte(`{}`)); status != http.StatusNotFound {
		t.Errorf("lux-mainnet status = %d, want 404 (not configured)", status)
	}
}
