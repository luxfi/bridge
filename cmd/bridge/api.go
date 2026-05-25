package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"

	"github.com/hanzoai/zip"
	"github.com/luxfi/bridge"
	"github.com/luxfi/bridge/internal/bchain"
	"github.com/luxfi/bridge/internal/depositcheck"
	"github.com/luxfi/bridge/internal/mchain"
)

// API serves the bridge HTTP surface. Read paths (networks, tokens,
// exchanges, limits, profile) are answered natively from Config — no
// Postgres hit. MPC-heavy paths (quote, rate, swaps, explorer) currently
// reverse-proxy to the legacy Node backend at backendURL; Phase 4.2 of
// the cmd/bridge migration replaces this proxy with a Go b-chain
// JSON-RPC client.
//
// The bridge profile (BridgeProfile) is the audit-visible label that
// names which classical primitives are gated under the current
// posture. It is exposed via:
//
//	GET  /v1/bridge/profile           — current bridge profile
//	POST /v1/bridge/rpc               — JSON-RPC: bridge_getProfile
//	GET  /metrics                      — Prometheus, including
//	                                     bridge_classical_compat_total
//
// Every deposit / withdrawal record SHOULD carry the BridgeProfile.ProfileID
// so an auditor can later distinguish a strict-PQ deposit from a
// classical-compat one.
type API struct {
	cfg      Config
	backend  string
	proxy    *httputil.ReverseProxy
	profile  *bridge.BridgeProfile
	bchain   *bchain.Client       // optional; when set, exposes /v1/bridge/info (LP-333 signer-set queries when those land)
	mchain   *mchain.Client       // optional; when set, swap creation with use_deposit_address=true mints an MPC address
	depcheck *depositcheck.Client // optional; powers the /v1/bridge/check-deposit diagnostic endpoint

	// Native swap CRUD. The Go binary owns these — BridgeVM is the
	// LP-333 signer-set manager, not a swap API (see
	// architecture_go_bridge_stack memory). When both store and
	// quote are non-nil the native handlers register and replace the
	// legacy reverse-proxy.
	store SwapStore
	quote *QuoteEngine
}

func NewAPI(
	cfg Config,
	backendURL string,
	bchainClient *bchain.Client,
	mchainClient *mchain.Client,
	depCheckClient *depositcheck.Client,
	store SwapStore,
	quote *QuoteEngine,
) *API {
	a := &API{
		cfg:      cfg,
		backend:  backendURL,
		bchain:   bchainClient,
		mchain:   mchainClient,
		depcheck: depCheckClient,
		store:    store,
		quote:    quote,
	}
	if backendURL != "" {
		u, err := url.Parse(backendURL)
		if err == nil {
			a.proxy = httputil.NewSingleHostReverseProxy(u)
			a.proxy.Director = stripPathPrefix(u, "/v1/bridge")
		}
	}
	// Default posture: classical-compat. cmd/bridge is the user-facing
	// bridge UI; the canonical destination-side proof verifier sits on
	// Z-Chain. Operators MAY pin LuxStrictPQBridgeProfile via the
	// BRIDGE_PROFILE env var (handled in main.go).
	p := bridge.BridgeClassicalCompat
	a.profile = &p
	return a
}

// SetProfile pins the bridge profile for this API instance. Called from
// main.go after config + flags are parsed; the default is
// BridgeClassicalCompat (the user-facing bridge UI talks to external
// L1s on classical primitives).
func (a *API) SetProfile(p *bridge.BridgeProfile) {
	if p != nil {
		a.profile = p
	}
}

// Register mounts handlers on the given zip.App. The /v1/bridge prefix
// matches what the SPA fetches and what hanzo/ingress routes externally.
func (a *API) Register(app *zip.App) {
	app.Get("/v1/bridge/networks", a.networks)
	app.Get("/v1/bridge/tokens", a.tokens)
	app.Get("/v1/bridge/exchanges", a.exchanges)
	app.Get("/v1/bridge/limits", a.limits)
	app.Get("/v1/bridge/profile", a.profileGET)

	// JSON-RPC surface for bridge_getProfile (and future bridge_* methods).
	app.Post("/v1/bridge/rpc", a.rpc)

	// Prometheus metrics including bridge_classical_compat_total.
	app.Get("/metrics", a.metrics)

	// Native swap CRUD takes precedence when a SwapStore + QuoteEngine
	// are configured. Falls back to the legacy reverse-proxy / 503
	// otherwise. Per LP-134 / LP-333 the native handlers DO NOT call
	// BridgeVM for swap-API methods — those don't exist on the chain.
	// BridgeVM is queried only for signer-set introspection via
	// /v1/bridge/info when a bchain client is wired in.
	proxied := a.proxied()
	if a.store != nil && a.quote != nil {
		app.Get("/v1/bridge/quote", a.quoteNative)
		app.Post("/v1/bridge/swaps", a.swapsCreateNative)
		app.Get("/v1/bridge/swaps", a.swapsListNative)
		app.Get("/v1/bridge/swaps/:id", a.swapsGetNative)
	} else {
		app.All("/v1/bridge/quote", proxied)
		app.All("/v1/bridge/swaps", proxied)
		app.All("/v1/bridge/swaps/*", proxied)
	}
	if a.bchain != nil {
		// /v1/bridge/info exposes signer-set info from BridgeVM (the
		// LP-333 chain). Currently passes through the speculative
		// bridge_getInfo method until we add the real
		// bridge_getSignerSetInfo client method.
		app.Get("/v1/bridge/info", a.infoNative)
	}

	// /v1/bridge/check-deposit is an ops-only diagnostic that polls
	// the source-chain RPC for the balance at a deposit address. Not
	// part of the SDK's happy path — BridgeVM owns deposit advancement
	// in the target architecture. Always-on when a depositcheck client
	// is configured (which is the default in main.go).
	if a.depcheck != nil {
		app.Post("/v1/bridge/check-deposit", a.checkDepositNative)
	}
	// Always proxied — rate / settings / explorer have no native impl yet.
	app.All("/v1/bridge/rate", proxied)
	app.All("/v1/bridge/settings", proxied)
	app.All("/v1/bridge/explorer/*", proxied)
}

func (a *API) networks(c *zip.Ctx) error {
	return c.JSON(http.StatusOK, a.cfg.Networks)
}

func (a *API) tokens(c *zip.Ctx) error {
	if net := c.Query("network"); net != "" {
		out := make([]Token, 0, len(a.cfg.Tokens))
		for _, t := range a.cfg.Tokens {
			if t.Network == net {
				out = append(out, t)
			}
		}
		return c.JSON(http.StatusOK, out)
	}
	return c.JSON(http.StatusOK, a.cfg.Tokens)
}

func (a *API) exchanges(c *zip.Ctx) error {
	return c.JSON(http.StatusOK, a.cfg.Exchanges)
}

func (a *API) limits(c *zip.Ctx) error {
	return c.JSON(http.StatusOK, a.cfg.Limits)
}

// profileGET answers GET /v1/bridge/profile with the active bridge
// profile metadata (REST mirror of the bridge_getProfile RPC).
func (a *API) profileGET(c *zip.Ctx) error {
	return c.JSON(http.StatusOK, a.profile.Metadata())
}

// infoNative answers GET /v1/bridge/info with bridge_getInfo from
// b-chain (node version, mpc readiness, threshold, supported chains).
// Registered only when a *bchain.Client is configured.
func (a *API) infoNative(c *zip.Ctx) error {
	info, err := a.bchain.GetBridgeInfo(c.Context())
	if err != nil {
		return rpcErrToHTTP(c, err, "getBridgeInfo")
	}
	return c.JSON(http.StatusOK, envelope{Data: info})
}

// jsonrpcReq is the request shape for /v1/bridge/rpc. Minimal JSON-RPC
// 2.0 — we only implement bridge_getProfile here; future bridge_*
// methods land in this switch.
type jsonrpcReq struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
}

// jsonrpcResp is the response shape. result xor error.
type jsonrpcResp struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Result  any             `json:"result,omitempty"`
	Error   *jsonrpcError   `json:"error,omitempty"`
}

type jsonrpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// rpc dispatches /v1/bridge/rpc calls. Currently:
//
//	bridge_getProfile — returns the active BridgeProfile.Metadata
func (a *API) rpc(c *zip.Ctx) error {
	var req jsonrpcReq
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusOK, jsonrpcResp{
			JSONRPC: "2.0",
			Error:   &jsonrpcError{Code: -32700, Message: "parse error"},
		})
	}
	switch req.Method {
	case "bridge_getProfile":
		return c.JSON(http.StatusOK, jsonrpcResp{
			JSONRPC: "2.0",
			ID:      req.ID,
			Result:  a.profile.Metadata(),
		})
	default:
		return c.JSON(http.StatusOK, jsonrpcResp{
			JSONRPC: "2.0",
			ID:      req.ID,
			Error:   &jsonrpcError{Code: -32601, Message: "method not found"},
		})
	}
}

// metrics serves Prometheus text exposition format. The bridge module
// surfaces bridge_classical_compat_total{primitive=...} so operators can
// alert on a classical-compat traversal spike.
func (a *API) metrics(c *zip.Ctx) error {
	var b strings.Builder
	totals := bridge.ClassicalCompatTotal()
	b.WriteString("# HELP bridge_classical_compat_total Count of classical-compat gate traversals broken down by primitive.\n")
	b.WriteString("# TYPE bridge_classical_compat_total counter\n")
	for _, prim := range []string{"admin", "bls_aggregate", "kzg", "groth16", "pairing"} {
		fmt.Fprintf(&b, "bridge_classical_compat_total{profile=%q,primitive=%q} %d\n",
			a.profile.Name, prim, totals[prim])
	}
	// Profile posture is observable as a label-only gauge so dashboards
	// can colour-code strict-PQ vs classical-compat.
	pq := 0
	if a.profile.IsPostQuantumEndToEnd() {
		pq = 1
	}
	b.WriteString("# HELP bridge_profile_post_quantum_end_to_end 1 iff the active bridge profile is labelled E2E-PQ.\n")
	b.WriteString("# TYPE bridge_profile_post_quantum_end_to_end gauge\n")
	fmt.Fprintf(&b, "bridge_profile_post_quantum_end_to_end{profile=%q} %d\n", a.profile.Name, pq)

	c.SetHeader("Content-Type", "text/plain; version=0.0.4")
	return c.String(http.StatusOK, b.String())
}

// proxied returns the zip handler for paths that reverse-proxy to the
// legacy Node backend. Adapted from httputil.ReverseProxy via
// zip.AdaptNetHTTP — costs ~5% perf vs native Fiber dispatch but
// avoids reimplementing the proxy under the framework. Phase 4.2
// replaces this with a Go b-chain JSON-RPC client (no proxy).
func (a *API) proxied() zip.Handler {
	if a.proxy == nil {
		return func(c *zip.Ctx) error {
			return c.JSON(http.StatusServiceUnavailable, map[string]string{
				"error":  "backend_unavailable",
				"detail": "set BRIDGE_BACKEND_URL to enable swap/quote/explorer routes (legacy path; replaced in Phase 4.2 by native b-chain RPC)",
			})
		}
	}
	return zip.AdaptNetHTTP(a.proxy)
}

// stripPathPrefix returns a Director that rewrites /v1/bridge/<x> to /<x>
// so requests reach the Node backend's existing route paths.
func stripPathPrefix(target *url.URL, prefix string) func(*http.Request) {
	return func(r *http.Request) {
		r.URL.Scheme = target.Scheme
		r.URL.Host = target.Host
		r.Host = target.Host
		r.URL.Path = strings.TrimPrefix(r.URL.Path, prefix)
		if r.URL.Path == "" {
			r.URL.Path = "/"
		}
	}
}
