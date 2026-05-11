package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"

	"github.com/luxfi/bridge"
)

// API serves the bridge HTTP surface. Read paths (networks, tokens,
// exchanges, limits, profile) are answered natively from Config — no
// Postgres hit. MPC-heavy paths (quote, rate, swaps, explorer)
// reverse-proxy to the legacy Node backend at backendURL until the
// native port lands.
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
	cfg     Config
	backend string
	proxy   *httputil.ReverseProxy
	profile *bridge.BridgeProfile
}

func NewAPI(cfg Config, backendURL string) *API {
	a := &API{cfg: cfg, backend: backendURL}
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

// Register mounts handlers on the given mux. The /v1/bridge prefix matches
// what the SPA fetches and what hanzo/ingress routes externally.
func (a *API) Register(mux *http.ServeMux) {
	mux.HandleFunc("/v1/bridge/networks", a.networks)
	mux.HandleFunc("/v1/bridge/tokens", a.tokens)
	mux.HandleFunc("/v1/bridge/exchanges", a.exchanges)
	mux.HandleFunc("/v1/bridge/limits", a.limits)
	mux.HandleFunc("/v1/bridge/profile", a.profileGET)

	// JSON-RPC surface for bridge_getProfile (and future bridge_* methods).
	mux.HandleFunc("/v1/bridge/rpc", a.rpc)

	// Prometheus metrics including bridge_classical_compat_total.
	mux.HandleFunc("/metrics", a.metrics)

	// Proxied (require Node backend). When backend is unset these 503
	// to make the missing dependency obvious instead of silently 404ing.
	mux.HandleFunc("/v1/bridge/quote", a.proxied)
	mux.HandleFunc("/v1/bridge/rate", a.proxied)
	mux.HandleFunc("/v1/bridge/settings", a.proxied)
	mux.HandleFunc("/v1/bridge/swaps", a.proxied)
	mux.HandleFunc("/v1/bridge/swaps/", a.proxied)
	mux.HandleFunc("/v1/bridge/explorer/", a.proxied)
}

func (a *API) networks(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, a.cfg.Networks)
}

func (a *API) tokens(w http.ResponseWriter, r *http.Request) {
	if net := r.URL.Query().Get("network"); net != "" {
		var out []Token
		for _, t := range a.cfg.Tokens {
			if t.Network == net {
				out = append(out, t)
			}
		}
		writeJSON(w, out)
		return
	}
	writeJSON(w, a.cfg.Tokens)
}

func (a *API) exchanges(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, a.cfg.Exchanges)
}

func (a *API) limits(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, a.cfg.Limits)
}

// profileGET answers GET /v1/bridge/profile with the active bridge
// profile metadata (REST mirror of the bridge_getProfile RPC).
func (a *API) profileGET(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, a.profile.Metadata())
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
func (a *API) rpc(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method_not_allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	var req jsonrpcReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, jsonrpcResp{JSONRPC: "2.0", Error: &jsonrpcError{Code: -32700, Message: "parse error"}})
		return
	}
	switch req.Method {
	case "bridge_getProfile":
		writeJSON(w, jsonrpcResp{JSONRPC: "2.0", ID: req.ID, Result: a.profile.Metadata()})
	default:
		writeJSON(w, jsonrpcResp{JSONRPC: "2.0", ID: req.ID, Error: &jsonrpcError{Code: -32601, Message: "method not found"}})
	}
}

// metrics serves Prometheus text exposition format. The bridge module
// surfaces bridge_classical_compat_total{primitive=...} so operators can
// alert on a classical-compat traversal spike.
func (a *API) metrics(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	totals := bridge.ClassicalCompatTotal()
	// HELP / TYPE lines first.
	_, _ = w.Write([]byte("# HELP bridge_classical_compat_total Count of classical-compat gate traversals broken down by primitive.\n"))
	_, _ = w.Write([]byte("# TYPE bridge_classical_compat_total counter\n"))
	for _, prim := range []string{"admin", "bls_aggregate", "kzg", "groth16", "pairing"} {
		fmt.Fprintf(w, "bridge_classical_compat_total{profile=%q,primitive=%q} %d\n",
			a.profile.Name, prim, totals[prim])
	}
	// Profile posture is observable as a label-only gauge so dashboards
	// can colour-code strict-PQ vs classical-compat.
	pq := 0
	if a.profile.IsPostQuantumEndToEnd() {
		pq = 1
	}
	_, _ = w.Write([]byte("# HELP bridge_profile_post_quantum_end_to_end 1 iff the active bridge profile is labelled E2E-PQ.\n"))
	_, _ = w.Write([]byte("# TYPE bridge_profile_post_quantum_end_to_end gauge\n"))
	fmt.Fprintf(w, "bridge_profile_post_quantum_end_to_end{profile=%q} %d\n", a.profile.Name, pq)
}

func (a *API) proxied(w http.ResponseWriter, r *http.Request) {
	if a.proxy == nil {
		http.Error(w, `{"error":"backend_unavailable","detail":"set BRIDGE_BACKEND_URL to enable swap/quote/explorer routes"}`, http.StatusServiceUnavailable)
		return
	}
	a.proxy.ServeHTTP(w, r)
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
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
