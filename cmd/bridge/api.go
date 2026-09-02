package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httputil"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/luxfi/bridge"
	"github.com/luxfi/bridge/internal/bchain"
	"github.com/luxfi/bridge/internal/depositcheck"
	"github.com/luxfi/bridge/internal/mchain"
	"github.com/zap-proto/zip"
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

	// adminRoutes mounts the /admin/swaps handlers on the operator surface.
	// Off unless BRIDGE_ADMIN_ROUTES is set, because they take any swap id
	// and no proof.
	adminRoutes bool

	// releaseStore is the per-destination-network release-wallet
	// registry. Optional: when set, swapsCreateNative stamps the new
	// swap with the long-lived MPC wallet that will pay out the
	// destination-chain settlement. When nil, the signing driver
	// falls back to the per-swap deposit wallet (the legacy path —
	// works only if the operator pre-funded each per-swap address,
	// which is impractical for testnet/prod and is the bug this
	// store fixes).
	releaseStore mchain.ReleaseWalletStore

	// Native swap CRUD. The B-Chain VM owns authoritative settlement;
	// this store is a UX cache (see swap_store.go). When store and
	// bchain are both non-nil the native handlers register and replace
	// the legacy reverse-proxy.
	store SwapStore

	// walletHealthSnapshot returns the cached per-network release-wallet
	// canary-sign results from the WalletHealthPoller background loop.
	// nil → /metrics emits no bridge_release_wallet_signable series (not
	// zeros — there's no fixed label set to iterate, unlike the other
	// gauges, since the network set is whatever's been minted). Set via
	// SetWalletHealthPoller.
	walletHealthSnapshot func() map[string]WalletHealth
	walletHealthRunning  func() bool

	// broadcastStats snapshots the broadcast driver's counters for
	// /metrics — the BTC confirmation-gate series live there. nil (no
	// driver wired) ⇒ the series are omitted, not zero-faked.
	broadcastStats func() BroadcastDriverStats
}

// SetBroadcastDriver wires the broadcast driver whose counters /metrics
// surfaces (BTC confirm checks / timeouts / rebuilds). nil clears.
func (a *API) SetBroadcastDriver(d *BroadcastDriver) {
	if d == nil {
		a.broadcastStats = nil
		return
	}
	a.broadcastStats = d.Stats
}

// SetWalletHealthPoller wires the background release-wallet canary-sign
// poller. The /metrics handler reads cached snapshots from this poller
// without blocking on an MPC sign call. nil clears any prior wiring
// (no bridge_release_wallet_signable series emitted).
func (a *API) SetWalletHealthPoller(p *WalletHealthPoller) {
	if p == nil {
		a.walletHealthSnapshot, a.walletHealthRunning = nil, nil
		return
	}
	a.walletHealthSnapshot = p.Snapshot
	a.walletHealthRunning = p.Running
}

func NewAPI(
	cfg Config,
	backendURL string,
	bchainClient *bchain.Client,
	mchainClient *mchain.Client,
	depCheckClient *depositcheck.Client,
	store SwapStore,
) *API {
	a := &API{
		cfg:      cfg,
		backend:  backendURL,
		bchain:   bchainClient,
		mchain:   mchainClient,
		depcheck: depCheckClient,
		store:    store,
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
// EnableAdminRoutes adds the swap mutators to the operator surface
// (RegisterAdmin). They authenticate nobody, so this is a decision to make
// once, deliberately — never a default.
func (a *API) EnableAdminRoutes() { a.adminRoutes = true }

func (a *API) SetProfile(p *bridge.BridgeProfile) {
	if p != nil {
		a.profile = p
	}
}

// SetReleaseStore wires the per-destination-network release-wallet
// registry. Called from main.go after the mchain client + persistence
// path are resolved. Kept as a setter (not a NewAPI parameter) so the
// 20+ existing test callers of NewAPI don't need to change signature
// when they don't exercise the release-wallet path.
func (a *API) SetReleaseStore(rs mchain.ReleaseWalletStore) {
	a.releaseStore = rs
}

// Register mounts the public surface: config reads, quote, swap create,
// and swap read by id. The /v1/bridge prefix matches what the SPA fetches
// and what hanzo/ingress routes externally.
//
// Everything an operator needs and a visitor does not — the swap list, the
// swap mutators, /metrics, and the deposit poll — is on RegisterAdmin, for a
// listener the edge does not route.
func (a *API) Register(app *zip.App) {
	app.Get("/v1/bridge/networks", a.networks)
	app.Get("/v1/bridge/tokens", a.tokens)
	app.Get("/v1/bridge/exchanges", a.exchanges)
	app.Get("/v1/bridge/limits", a.limits)
	app.Get("/v1/bridge/profile", a.profileGET)

	// /api/* read-side aliases — the embedded SPA's useNetworks /
	// useAssets / useExchanges all hit /api/<x>, mirroring the
	// legacy app/server route layout. The /v1/bridge/<x> routes
	// above remain for external consumers (ingress + docs).
	app.Get("/api/networks", a.networks)
	app.Get("/api/tokens", a.tokens)
	app.Get("/api/exchanges", a.exchanges)
	app.Get("/api/limits", a.limits)

	// JSON-RPC surface for bridge_getProfile (and future bridge_* methods).
	app.Post("/v1/bridge/rpc", a.rpc)

	// Native swap CRUD takes precedence when a SwapStore + bchain
	// client are configured. Falls back to the legacy reverse-proxy /
	// 503 otherwise. The B-Chain VM (chains/bridgevm) owns
	// authoritative quote + settlement; native handlers cache locally
	// and refresh from chain on demand.
	//
	// We mount each handler at TWO prefixes:
	//   - /v1/bridge/* — the externally-routed path (ingress, public docs).
	//   - /api/*       — the path the embedded SPA's TS SDK
	//                    (pkg/bridge/src/app/lib/bridge-api.ts) actually
	//                    calls. Same-origin requests from the SPA in
	//                    cmd/bridge land here directly; without these
	//                    aliases the SPA's /api/quote and /api/swaps
	//                    requests would fall through to the SPA catch-all
	//                    and return HTML instead of JSON.
	proxied := a.proxied()
	if a.store != nil && a.bchain != nil {
		app.Get("/v1/bridge/quote", a.quoteNative)
		app.Post("/v1/bridge/swaps", a.swapsCreateNative)
		app.Get("/v1/bridge/swaps/:id", a.swapsGetNative)

		app.Get("/api/quote", a.quoteNative)
		app.Post("/api/swaps", a.swapsCreateNative)
		app.Get("/api/swaps/:id", a.swapsGetNative)
	} else {
		app.All("/v1/bridge/quote", proxied)
		app.Post("/v1/bridge/swaps", proxied)

		app.All("/api/quote", proxied)
		app.Post("/api/swaps", proxied)
		// The SDK's per-swap legs (transfer, payout, mpcsign, getsig)
		// live under this prefix on the backend and are forwarded
		// unchanged. `+` and not `*`: `*` matches the empty remainder,
		// so it forwards GET /api/swaps as well and hands back the list
		// this route split is here to withhold.
		//
		// There is no /v1/bridge twin: the Director strips /v1/bridge,
		// and the backend mounts its swap router at /api/swaps
		// (app/server/src/server.ts), so a /v1/bridge/swaps/… request
		// arrives at /swaps/… — a path space with no routes on it,
		// whatever the sub-path spells.
		app.All("/api/swaps/+", proxied)
	}
	if a.bchain != nil {
		// /v1/bridge/info exposes signer-set info from BridgeVM (the
		// LP-333 chain). Currently passes through the speculative
		// bridge_getInfo method until we add the real
		// bridge_getSignerSetInfo client method.
		app.Get("/v1/bridge/info", a.infoNative)
	}

	// Always proxied — rate / settings / explorer have no native impl yet.
	app.All("/v1/bridge/rate", proxied)
	app.All("/v1/bridge/settings", proxied)
	app.All("/v1/bridge/explorer/*", proxied)
}

// RegisterAdmin mounts the operator surface. Nothing here identifies its
// caller, so it goes on the listener main.go opens for --admin-addr, which
// the ingress does not route — the only place these can be reached from is
// the place an operator is.
//
// Three kinds of thing live here. The swap list carries every id plus the
// signature and signed destination tx minted for it. /metrics names the MPC
// release wallets and says which of them cannot sign right now. The deposit
// poll turns one request into a source-chain RPC call with caller-chosen
// arguments. Each is worth having and none is worth answering anonymously.
func (a *API) RegisterAdmin(app *zip.App) {
	// Prometheus metrics including bridge_classical_compat_total.
	app.Get("/metrics", a.metrics)

	if a.store != nil && a.bchain != nil {
		app.Get("/v1/bridge/swaps", a.swapsListNative)
		app.Get("/api/swaps", a.swapsListNative)

		// Force a swap to re-sign, to recover after a destination-chain
		// reject of the previously-built raw tx; or write a raw tx the
		// operator derived out of band (mpcd dedupes a re-sign request,
		// but a low-s canonicalization of the prior signature is already
		// in hand) so the broadcast driver pushes it on the next tick.
		//
		// Both take any swap id and no proof, so they stay off unless an
		// operator asks for them: two decisions, not one, before an
		// arbitrary caller can rewind a swap.
		if a.adminRoutes {
			app.Post("/admin/swaps/:id/reset", a.swapsResetNative)
			app.Post("/admin/swaps/:id/inject-raw-tx", a.swapsInjectRawTxNative)
		}
	} else {
		app.Get("/api/swaps", a.proxied())
	}

	// The deposit poll reads the source-chain balance at an address. Not
	// part of the SDK's happy path — BridgeVM owns deposit advancement in
	// the target architecture.
	if a.depcheck != nil {
		app.Post("/v1/bridge/check-deposit", a.checkDepositNative)
	}
}

// apiNetwork is the on-wire response shape — Network plus a nested
// currencies array. The SPA's network-mapper.ts expects this exact
// snake_case shape (display_name, internal_name, is_testnet,
// transaction_explorer_template, currencies[…]). Building it by
// composition keeps the YAML config flat (one Token entry per
// (asset, network) pair) while the API still emits the nested
// per-chain envelope the SPA was written against.
type apiNetwork struct {
	Network
	Currencies []apiCurrency `json:"currencies"`
}

// apiCurrency is Token in the wire shape, with the deposit/withdrawal
// flags forced non-null (Token's *bool fields default-on at marshal
// time — see normalizeCurrency below).
type apiCurrency struct {
	Asset               string `json:"asset"`
	Name                string `json:"name"`
	Logo                string `json:"logo,omitempty"`
	Decimals            int    `json:"decimals"`
	ContractAddress     string `json:"contract_address,omitempty"`
	Status              string `json:"status"`
	IsDepositEnabled    bool   `json:"is_deposit_enabled"`
	IsWithdrawalEnabled bool   `json:"is_withdrawal_enabled"`
	IsRefuelEnabled     bool   `json:"is_refuel_enabled"`
}

// networks answers GET /api/networks (and the /v1/bridge/networks
// alias) with the {data: [...]} envelope the SPA's useNetworks hook
// consumes.
//
// Query params:
//
//	?version=<env>   When set to "testnet" / "devnet", only testnet
//	                 entries are returned; "mainnet" (or empty) returns
//	                 mainnet entries. The SPA passes cfg.env here so a
//	                 BRIDGE_ENV=testnet build sees only testnet rows.
//
// The handler joins each Network to its tokens (matched by
// Token.Network == Network.InternalName) and defaults Status to
// "active" and the deposit/withdrawal flags to true when YAML omits
// them — without these defaults the SPA's transformNetworks() filter
// (status !== "active" || (!is_deposit_enabled && !is_withdrawal_enabled))
// silently drops every row.
func (a *API) networks(c *zip.Ctx) error {
	version := strings.ToLower(c.Query("version"))
	wantTestnet := version == "testnet" || version == "devnet"
	// Empty / unknown / "mainnet" → mainnet rows. We intentionally do
	// NOT return both — mixing mainnet + testnet in one response
	// confuses the SPA's chain picker.
	filterByVersion := version != ""

	out := make([]apiNetwork, 0, len(a.cfg.Networks))
	for _, net := range a.cfg.Networks {
		if filterByVersion && net.IsTestnet != wantTestnet {
			continue
		}
		// Default Status="active" so YAML configs that omit it still
		// surface in the UI.
		if net.Status == "" {
			net.Status = "active"
		}
		// Initialize as empty slice (not nil) so JSON marshals as
		// `[]` rather than `null` when a network has no tokens —
		// keeps the wire shape stable for any consumer that iterates
		// currencies without a null guard.
		entry := apiNetwork{Network: net, Currencies: []apiCurrency{}}
		for _, tok := range a.cfg.Tokens {
			if tok.Network != net.InternalName {
				continue
			}
			entry.Currencies = append(entry.Currencies, normalizeCurrency(tok))
		}
		out = append(out, entry)
	}
	return c.JSON(http.StatusOK, envelope{Data: out})
}

// normalizeCurrency applies the default-on policy for the deposit /
// withdrawal / refuel flags. A YAML Token that doesn't set
// isDepositEnabled is treated as deposit-enabled (Token zero value
// false would make the SPA drop the asset). isRefuelEnabled defaults
// off — refuel is opt-in (operator must explicitly enable gas
// top-ups).
func normalizeCurrency(t Token) apiCurrency {
	status := t.Status
	if status == "" {
		status = "active"
	}
	deposit := true
	if t.IsDepositEnabled != nil {
		deposit = *t.IsDepositEnabled
	}
	withdrawal := true
	if t.IsWithdrawalEnabled != nil {
		withdrawal = *t.IsWithdrawalEnabled
	}
	refuel := false
	if t.IsRefuelEnabled != nil {
		refuel = *t.IsRefuelEnabled
	}
	return apiCurrency{
		Asset:               t.Asset,
		Name:                t.Name,
		Logo:                t.Logo,
		Decimals:            t.Decimals,
		ContractAddress:     t.Contract,
		Status:              status,
		IsDepositEnabled:    deposit,
		IsWithdrawalEnabled: withdrawal,
		IsRefuelEnabled:     refuel,
	}
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

	// Release-wallet canary-sign health. Reads the cached
	// WalletHealthPoller snapshot — never blocks on an MPC sign call.
	// bridge_release_wallet_signable=0 means the wallet's last canary
	// sign failed or timed out; a real payout on that network would
	// stall the exact same way (see wallet_health_poller.go for the
	// incident that motivated this). Only networks the poller has
	// actually checked at least once appear — an un-minted or
	// not-yet-checked network is absent, not falsely reported as 0.
	if a.walletHealthSnapshot != nil {
		snap := a.walletHealthSnapshot()
		networks := make([]string, 0, len(snap))
		for network := range snap {
			networks = append(networks, network)
		}
		sort.Strings(networks)

		b.WriteString("# HELP bridge_release_wallet_signable 1 iff the release wallet's most recent canary sign succeeded; 0 means it failed or timed out and a real payout would stall the same way.\n")
		b.WriteString("# TYPE bridge_release_wallet_signable gauge\n")
		for _, network := range networks {
			h := snap[network]
			signable := 0
			if h.Signable {
				signable = 1
			}
			fmt.Fprintf(&b, "bridge_release_wallet_signable{network=%q,wallet_id=%q} %d\n", network, h.WalletID, signable)
		}

		b.WriteString("# HELP bridge_release_wallet_sign_latency_ms Milliseconds the last canary sign took, success or failure.\n")
		b.WriteString("# TYPE bridge_release_wallet_sign_latency_ms gauge\n")
		for _, network := range networks {
			fmt.Fprintf(&b, "bridge_release_wallet_sign_latency_ms{network=%q,wallet_id=%q} %d\n", network, snap[network].WalletID, snap[network].LatencyMS)
		}

		b.WriteString("# HELP bridge_release_wallet_last_check_age_seconds Seconds since the last canary-sign attempt for this wallet. Large + poller running means checks for this network have stalled.\n")
		b.WriteString("# TYPE bridge_release_wallet_last_check_age_seconds gauge\n")
		for _, network := range networks {
			h := snap[network]
			age := 0
			if !h.LastCheckedAt.IsZero() {
				age = int(time.Since(h.LastCheckedAt).Seconds())
			}
			fmt.Fprintf(&b, "bridge_release_wallet_last_check_age_seconds{network=%q,wallet_id=%q} %d\n", network, h.WalletID, age)
		}
	}
	running := 0
	if a.walletHealthRunning != nil && a.walletHealthRunning() {
		running = 1
	}
	b.WriteString("# HELP bridge_wallet_health_poller_running 1 iff the release-wallet canary-sign health poller loop is active.\n")
	b.WriteString("# TYPE bridge_wallet_health_poller_running gauge\n")
	fmt.Fprintf(&b, "bridge_wallet_health_poller_running %d\n", running)

	// BTC confirmation-gate counters. A BTC release parks in
	// bridge_transfer_pending_confirmation until mined; these expose how
	// often the watcher polls and how often a release sat unconfirmed
	// past the timeout and was rebuilt at a bumped RBF feerate.
	// Sustained confirm-timeout growth means BTC network fees are
	// outpacing the bump rate, or a specific release wallet's tx is
	// stuck (low-fee UTXO, mempool congestion).
	if a.broadcastStats != nil {
		bs := a.broadcastStats()
		b.WriteString("# HELP bridge_btc_confirm_checks_total Times the broadcast driver polled a parked BTC release for confirmation. Zero on a deploy with no BTC destinations — not an error state.\n")
		b.WriteString("# TYPE bridge_btc_confirm_checks_total counter\n")
		fmt.Fprintf(&b, "bridge_btc_confirm_checks_total %d\n", bs.ConfirmChecks)
		b.WriteString("# HELP bridge_btc_confirm_timeouts_total Times a parked BTC release sat unconfirmed past the confirmation timeout and was rebuilt at a bumped RBF feerate.\n")
		b.WriteString("# TYPE bridge_btc_confirm_timeouts_total counter\n")
		fmt.Fprintf(&b, "bridge_btc_confirm_timeouts_total %d\n", bs.ConfirmTimeouts)
		b.WriteString("# HELP bridge_broadcast_rebuilds_total Broadcast→re-sign resets (BTC fee rebuilds: submit rejects + confirmation timeouts).\n")
		b.WriteString("# TYPE bridge_broadcast_rebuilds_total counter\n")
		fmt.Fprintf(&b, "bridge_broadcast_rebuilds_total %d\n", bs.Rebuilds)
	}

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
