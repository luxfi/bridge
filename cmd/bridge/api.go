package main

import (
	"encoding/json"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
)

// API serves the bridge HTTP surface. Read paths (networks, tokens,
// exchanges, limits) are answered natively from Config — no Postgres
// hit. MPC-heavy paths (quote, rate, swaps, explorer) reverse-proxy to
// the legacy Node backend at backendURL until the native port lands.
type API struct {
	cfg     Config
	backend string
	proxy   *httputil.ReverseProxy
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
	return a
}

// Register mounts handlers on the given mux. The /v1/bridge prefix matches
// what the SPA fetches and what hanzo/ingress routes externally.
func (a *API) Register(mux *http.ServeMux) {
	mux.HandleFunc("/v1/bridge/networks", a.networks)
	mux.HandleFunc("/v1/bridge/tokens", a.tokens)
	mux.HandleFunc("/v1/bridge/exchanges", a.exchanges)
	mux.HandleFunc("/v1/bridge/limits", a.limits)

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
