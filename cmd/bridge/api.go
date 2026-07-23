package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httputil"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/hanzoai/zip"
	luxlog "github.com/luxfi/log"

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

	// releaseStore is the per-destination-network release-wallet
	// registry. Optional: when set, swapsCreateNative stamps the new
	// swap with the long-lived MPC wallet that will pay out the
	// destination-chain settlement. When nil, the signing driver
	// falls back to the per-swap deposit wallet (the legacy path —
	// works only if the operator pre-funded each per-swap address,
	// which is impractical for testnet/prod and is the bug this
	// store fixes).
	releaseStore mchain.ReleaseWalletStore

	// Native swap CRUD. The Go binary owns these — BridgeVM is the
	// LP-333 signer-set manager, not a swap API (see
	// architecture_go_bridge_stack memory). When both store and
	// quote are non-nil the native handlers register and replace the
	// legacy reverse-proxy.
	store SwapStore
	quote *QuoteEngine

	// Observability sources — set via the corresponding Set* helpers
	// after main.go finishes wiring the drivers. Each is nil-safe; the
	// /metrics endpoint emits zeros for nil drivers so a partial
	// configuration (e.g. --disable-refund-driver) doesn't break
	// Prometheus scraping. Pool is similarly nil-safe.
	mpcPool         *mchain.Pool
	signingStats    func() SigningDriverStats
	signingRunning  func() bool
	broadcastStats  func() BroadcastDriverStats
	broadcastRunning func() bool
	refundStats     func() RefundDriverStats
	refundRunning   func() bool
	watcherStats    func() WatcherStats
	watcherRunning  func() bool

	// bchainSnapshot returns the cached LP-333 state from the
	// BChainPoller background loop. nil → /metrics emits zeros for
	// b-chain gauges + reachable=0. Set via SetBChainPoller.
	bchainSnapshot func() BChainSnapshot

	// walletHealthSnapshot returns the cached per-network release-wallet
	// canary-sign results from the WalletHealthPoller background loop.
	// nil → /metrics emits no bridge_release_wallet_signable series (not
	// zeros — there's no fixed label set to iterate, unlike the other
	// gauges, since the network set is whatever's been minted). Set via
	// SetWalletHealthPoller.
	walletHealthSnapshot func() map[string]WalletHealth
	walletHealthRunning  func() bool

	// luxRPCMainnetURL / luxRPCTestnetURL are the upstream Lux gateway
	// URLs the embedded SPA proxies through to dodge the gateway's
	// CORS allow-list (bridge.lux.network is not whitelisted upstream;
	// the proxy makes the call same-origin so the browser doesn't
	// require the CORS header). Empty disables the corresponding
	// /api/rpc/lux-{mainnet,testnet} route. Set via SetLuxRPCURLs.
	luxRPCMainnetURL string
	luxRPCTestnetURL string
	luxRPCTimeout    time.Duration
	luxRPCLogger     luxlog.Logger

	// zooRPCMainnetURL / zooRPCTestnetURL mirror the Lux pair for the
	// Zoo gateway — same CORS rationale, served at
	// /api/rpc/zoo-{mainnet,testnet}. Set via SetZooRPCURLs.
	zooRPCMainnetURL string
	zooRPCTestnetURL string
	zooRPCTimeout    time.Duration
	zooRPCLogger     luxlog.Logger
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

// SetReleaseStore wires the per-destination-network release-wallet
// registry. Called from main.go after the mchain client + persistence
// path are resolved. Kept as a setter (not a NewAPI parameter) so the
// 20+ existing test callers of NewAPI don't need to change signature
// when they don't exercise the release-wallet path.
func (a *API) SetReleaseStore(rs mchain.ReleaseWalletStore) {
	a.releaseStore = rs
}

// SetMPCPool wires the layered MPC pool for /metrics + /health
// reporting. Optional — when nil, the gauges report 0.
func (a *API) SetMPCPool(p *mchain.Pool) { a.mpcPool = p }

// SetSigningDriver wires the signing driver for /metrics. Setter
// (not constructor arg) so the 20+ existing NewAPI test callers
// don't need to change signature. Nil-safe: the metrics handler
// emits zeros when not set.
func (a *API) SetSigningDriver(d *SigningDriver) {
	if d == nil {
		a.signingStats, a.signingRunning = nil, nil
		return
	}
	a.signingStats = d.Stats
	a.signingRunning = d.Running
}

// SetBroadcastDriver mirrors SetSigningDriver.
func (a *API) SetBroadcastDriver(d *BroadcastDriver) {
	if d == nil {
		a.broadcastStats, a.broadcastRunning = nil, nil
		return
	}
	a.broadcastStats = d.Stats
	a.broadcastRunning = d.Running
}

// SetRefundDriver mirrors SetSigningDriver.
func (a *API) SetRefundDriver(d *RefundDriver) {
	if d == nil {
		a.refundStats, a.refundRunning = nil, nil
		return
	}
	a.refundStats = d.Stats
	a.refundRunning = d.Running
}

// SetDepositWatcher mirrors SetSigningDriver.
func (a *API) SetDepositWatcher(w *DepositWatcher) {
	if w == nil {
		a.watcherStats, a.watcherRunning = nil, nil
		return
	}
	a.watcherStats = w.Stats
	a.watcherRunning = w.Running
}

// SetBChainPoller wires the background b-chain LP-333 poller. The
// /metrics handler reads cached snapshots from this poller without
// blocking on RPC. nil clears any prior wiring (gauges emit zeros).
func (a *API) SetBChainPoller(p *BChainPoller) {
	if p == nil {
		a.bchainSnapshot = nil
		return
	}
	a.bchainSnapshot = p.Snapshot
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

// SetLuxRPCURLs configures the upstream Lux gateway URLs the embedded
// SPA proxies through to dodge the gateway's CORS allow-list. Either
// (or both) may be empty — the corresponding /api/rpc/lux-* route is
// then skipped at Register time. Logger may be nil; when set, upstream
// failures are logged at Warn.
func (a *API) SetLuxRPCURLs(mainnetURL, testnetURL string, timeout time.Duration, logger luxlog.Logger) {
	a.luxRPCMainnetURL = mainnetURL
	a.luxRPCTestnetURL = testnetURL
	a.luxRPCTimeout = timeout
	a.luxRPCLogger = logger
}

// SetZooRPCURLs configures the upstream Zoo gateway URLs for the
// /api/rpc/zoo-{mainnet,testnet} same-origin proxy — the Zoo gateway
// shares the Lux gateway's CORS posture, so the embedded SPA's wagmi
// transport for Zoo chains (200200/200201) routes through here. Either
// (or both) may be empty — the corresponding route is then skipped at
// Register time.
func (a *API) SetZooRPCURLs(mainnetURL, testnetURL string, timeout time.Duration, logger luxlog.Logger) {
	a.zooRPCMainnetURL = mainnetURL
	a.zooRPCTestnetURL = testnetURL
	a.zooRPCTimeout = timeout
	a.zooRPCLogger = logger
}

// Register mounts handlers on the given zip.App. The /v1/bridge prefix
// matches what the SPA fetches and what hanzo/ingress routes externally.
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

	// Prometheus metrics including bridge_classical_compat_total.
	app.Get("/metrics", a.metrics)

	// Native swap CRUD takes precedence when a SwapStore + QuoteEngine
	// are configured. Falls back to the legacy reverse-proxy / 503
	// otherwise. Per LP-134 / LP-333 the native handlers DO NOT call
	// BridgeVM for swap-API methods — those don't exist on the chain.
	// BridgeVM is queried only for signer-set introspection via
	// /v1/bridge/info when a bchain client is wired in.
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
	if a.store != nil && a.quote != nil {
		app.Get("/v1/bridge/quote", a.quoteNative)
		app.Post("/v1/bridge/swaps", a.swapsCreateNative)
		app.Get("/v1/bridge/swaps", a.swapsListNative)
		app.Get("/v1/bridge/swaps/:id", a.swapsGetNative)

		app.Get("/api/quote", a.quoteNative)
		app.Post("/api/swaps", a.swapsCreateNative)
		app.Get("/api/swaps", a.swapsListNative)
		app.Get("/api/swaps/:id", a.swapsGetNative)

		// Admin: force a swap to re-sign (used to recover after a
		// destination-chain reject of the previously-built raw tx).
		app.Post("/admin/swaps/:id/reset", a.swapsResetNative)
		// Admin: inject a caller-supplied DestRawTx so the broadcast
		// driver can push it on the next tick. Used when mpcd dedupes
		// a re-sign request but the operator already has a corrected
		// raw tx (e.g. low-s canonicalization of a prior signature).
		app.Post("/admin/swaps/:id/inject-raw-tx", a.swapsInjectRawTxNative)
	} else {
		app.All("/v1/bridge/quote", proxied)
		app.All("/v1/bridge/swaps", proxied)
		app.All("/v1/bridge/swaps/*", proxied)

		app.All("/api/quote", proxied)
		app.All("/api/swaps", proxied)
		app.All("/api/swaps/*", proxied)
	}
	if a.bchain != nil {
		// /v1/bridge/info exposes bridge_getInfo (node-level summary).
		app.Get("/v1/bridge/info", a.infoNative)
		// LP-333 surfaces. Both are read-only — the bridge is a
		// consumer of the b-chain signer-set + epoch state, not a
		// participant in rotations. When the upstream BridgeVM doesn't
		// implement LP-333 yet (-32601 method-not-found), the handlers
		// return HTTP 501 so operators can distinguish "not configured"
		// (b-chain unreachable) from "configured but not yet LP-333".
		app.Get("/v1/bridge/signer-set", a.signerSetNative)
		app.Get("/v1/bridge/epoch", a.epochNative)
	}

	// /api/rpc/lux-{mainnet,testnet} — same-origin JSON-RPC proxy for
	// the Lux gateway. Sidesteps the gateway's CORS allow-list so the
	// embedded SPA's wagmi useBalance() actually resolves for LUX, AND
	// allows MetaMask/Rabby/etc. extensions (which run from
	// chrome-extension:// origins) to point their custom-RPC URL at
	// this proxy instead of the gateway. See rpc_proxy.go.
	//
	// Browsers send an OPTIONS preflight before the JSON-RPC POST
	// (Content-Type: application/json is not a CORS-safe header). The
	// preflight handler echoes the headers needed for the POST to
	// proceed.
	preflight := func(c *zip.Ctx) error {
		c.SetHeader("Access-Control-Allow-Origin", "*")
		c.SetHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
		c.SetHeader("Access-Control-Allow-Headers", "Content-Type, Accept")
		c.SetHeader("Access-Control-Max-Age", "86400")
		return c.NoContent(http.StatusNoContent)
	}
	if h := rpcProxy(a.luxRPCMainnetURL, a.luxRPCTimeout, a.luxRPCLogger); h != nil {
		app.Post("/api/rpc/lux-mainnet", h)
		app.Options("/api/rpc/lux-mainnet", preflight)
	}
	if h := rpcProxy(a.luxRPCTestnetURL, a.luxRPCTimeout, a.luxRPCLogger); h != nil {
		app.Post("/api/rpc/lux-testnet", h)
		app.Options("/api/rpc/lux-testnet", preflight)
	}

	// /api/rpc/zoo-{mainnet,testnet} — same proxy pattern for the Zoo
	// gateway (Zoo Mainnet 200200 / Zoo Testnet 200201). The SPA's
	// wagmi transport for Zoo chains posts here.
	if h := rpcProxy(a.zooRPCMainnetURL, a.zooRPCTimeout, a.zooRPCLogger); h != nil {
		app.Post("/api/rpc/zoo-mainnet", h)
		app.Options("/api/rpc/zoo-mainnet", preflight)
	}
	if h := rpcProxy(a.zooRPCTestnetURL, a.zooRPCTimeout, a.zooRPCLogger); h != nil {
		app.Post("/api/rpc/zoo-testnet", h)
		app.Options("/api/rpc/zoo-testnet", preflight)
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

// signerSetNative answers GET /v1/bridge/signer-set with the LP-333
// signer-set snapshot from b-chain. Registered only when a *bchain.Client
// is configured. Returns HTTP 501 (via rpcErrToHTTP) when the upstream
// BridgeVM doesn't implement bridge_getSignerSetInfo yet.
func (a *API) signerSetNative(c *zip.Ctx) error {
	info, err := a.bchain.GetSignerSetInfo(c.Context())
	if err != nil {
		return rpcErrToHTTP(c, err, "getSignerSetInfo")
	}
	return c.JSON(http.StatusOK, envelope{Data: info})
}

// epochNative answers GET /v1/bridge/epoch with the LP-333 current
// epoch + signer-set hash. Cheap endpoint — meant for high-frequency
// polling without re-fetching the full signer-set roster.
func (a *API) epochNative(c *zip.Ctx) error {
	ep, err := a.bchain.GetCurrentEpoch(c.Context())
	if err != nil {
		return rpcErrToHTTP(c, err, "getCurrentEpoch")
	}
	return c.JSON(http.StatusOK, envelope{Data: ep})
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

// rpc dispatches /v1/bridge/rpc calls.
//
//	bridge_getProfile         — returns the active BridgeProfile.Metadata
//	bridge_getSignerSetInfo   — passthrough to b-chain (LP-333)
//	bridge_getCurrentEpoch    — passthrough to b-chain (LP-333)
//
// LP-333 methods are routed to the configured *bchain.Client. When no
// bchain client is wired (--bchain-url empty), they return -32601 just
// like an unknown method — the SDK then knows to fall back.
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
	case "bridge_getSignerSetInfo":
		if a.bchain == nil {
			return c.JSON(http.StatusOK, jsonrpcResp{
				JSONRPC: "2.0",
				ID:      req.ID,
				Error:   &jsonrpcError{Code: -32601, Message: "method not found (b-chain not configured)"},
			})
		}
		info, err := a.bchain.GetSignerSetInfo(c.Context())
		if err != nil {
			return c.JSON(http.StatusOK, rpcErrToJSONRPC(req.ID, err))
		}
		return c.JSON(http.StatusOK, jsonrpcResp{JSONRPC: "2.0", ID: req.ID, Result: info})
	case "bridge_getCurrentEpoch":
		if a.bchain == nil {
			return c.JSON(http.StatusOK, jsonrpcResp{
				JSONRPC: "2.0",
				ID:      req.ID,
				Error:   &jsonrpcError{Code: -32601, Message: "method not found (b-chain not configured)"},
			})
		}
		ep, err := a.bchain.GetCurrentEpoch(c.Context())
		if err != nil {
			return c.JSON(http.StatusOK, rpcErrToJSONRPC(req.ID, err))
		}
		return c.JSON(http.StatusOK, jsonrpcResp{JSONRPC: "2.0", ID: req.ID, Result: ep})
	default:
		return c.JSON(http.StatusOK, jsonrpcResp{
			JSONRPC: "2.0",
			ID:      req.ID,
			Error:   &jsonrpcError{Code: -32601, Message: "method not found"},
		})
	}
}

// rpcErrToJSONRPC maps a bchain RPC error to a JSON-RPC error envelope
// preserving the upstream code where possible. Wire-level errors fall
// back to -32603 (internal error).
func rpcErrToJSONRPC(id json.RawMessage, err error) jsonrpcResp {
	if rpcErr, ok := err.(*bchain.RPCError); ok {
		code := rpcErr.Code
		if code == 0 {
			code = -32603
		}
		return jsonrpcResp{
			JSONRPC: "2.0",
			ID:      id,
			Error:   &jsonrpcError{Code: code, Message: rpcErr.Message},
		}
	}
	return jsonrpcResp{
		JSONRPC: "2.0",
		ID:      id,
		Error:   &jsonrpcError{Code: -32603, Message: err.Error()},
	}
}

// metrics serves Prometheus text exposition format. Surfaces:
//
//   - bridge_classical_compat_total{primitive} — PQ-posture alerting
//   - bridge_profile_post_quantum_end_to_end{} — posture gauge
//   - bridge_<driver>_<event>_total — per-driver counters (signing,
//     broadcast, refund, deposit_watcher). These promote the hardening
//     counters (signing_max_attempts ceilings, refund_max_attempts
//     ceilings, orphan recoveries) to alertable signals — pre-this,
//     they only lived inside /health JSON.
//   - bridge_<driver>_running{} — driver-loop liveness gauges
//   - bridge_mpc_pool_split{} / bridge_mpc_keygen_enabled{} — MPC
//     pool state gauges
//
// Nil-safe: drivers that weren't started (e.g. --disable-refund-driver)
// emit zeros, not panics. Operators get a stable scrape contract even
// when components are disabled.
func (a *API) metrics(c *zip.Ctx) error {
	var b strings.Builder

	// Existing: classical-compat traversal counter (per primitive).
	totals := bridge.ClassicalCompatTotal()
	b.WriteString("# HELP bridge_classical_compat_total Count of classical-compat gate traversals broken down by primitive.\n")
	b.WriteString("# TYPE bridge_classical_compat_total counter\n")
	for _, prim := range []string{"admin", "bls_aggregate", "kzg", "groth16", "pairing"} {
		fmt.Fprintf(&b, "bridge_classical_compat_total{profile=%q,primitive=%q} %d\n",
			a.profile.Name, prim, totals[prim])
	}
	pq := 0
	if a.profile.IsPostQuantumEndToEnd() {
		pq = 1
	}
	b.WriteString("# HELP bridge_profile_post_quantum_end_to_end 1 iff the active bridge profile is labelled E2E-PQ.\n")
	b.WriteString("# TYPE bridge_profile_post_quantum_end_to_end gauge\n")
	fmt.Fprintf(&b, "bridge_profile_post_quantum_end_to_end{profile=%q} %d\n", a.profile.Name, pq)

	// Signing driver — counters + running gauge.
	var sigStats SigningDriverStats
	if a.signingStats != nil {
		sigStats = a.signingStats()
	}
	writeCounter(&b, "bridge_signing_ticks_total", "Signing driver loop iterations.", sigStats.Ticks)
	writeCounter(&b, "bridge_signing_attempts_total", "MPC sign attempts initiated.", sigStats.Attempts)
	writeCounter(&b, "bridge_signing_successes_total", "MPC signs that produced a valid signature + tx.", sigStats.Successes)
	writeCounter(&b, "bridge_signing_failures_total", "MPC signs that errored (rolled back via refund or ceiling).", sigStats.Failures)
	writeCounter(&b, "bridge_signing_list_errors_total", "Errors listing pending swaps during the signing loop.", sigStats.ListErrors)
	writeCounter(&b, "bridge_signing_stale_total", "Swaps moved to refund_pending because the create-time quote aged past --quote-max-age.", sigStats.Stale)
	writeGauge(&b, "bridge_signing_running", "1 iff the signing driver loop is active.", boolToGauge(a.signingRunning))

	// Broadcast driver.
	var bcStats BroadcastDriverStats
	if a.broadcastStats != nil {
		bcStats = a.broadcastStats()
	}
	writeCounter(&b, "bridge_broadcast_ticks_total", "Broadcast driver loop iterations.", bcStats.Ticks)
	writeCounter(&b, "bridge_broadcast_attempts_total", "Destination-chain raw-tx broadcasts attempted.", bcStats.Attempts)
	writeCounter(&b, "bridge_broadcast_successes_total", "Broadcasts the destination chain accepted.", bcStats.Successes)
	writeCounter(&b, "bridge_broadcast_failures_total", "Broadcasts the destination chain rejected (will retry / refund).", bcStats.Failures)
	writeCounter(&b, "bridge_broadcast_skipped_no_raw_tx_total", "Swaps skipped because DestRawTx is empty (placeholder mode or signing not yet finalized).", bcStats.SkippedNoRawTx)
	writeCounter(&b, "bridge_broadcast_rebuilds_total", "Times BroadcastDriver reset a signed payload + MPC session and routed back to pending so the swap could re-sign under fresh blockhash / seqno / sequence. Spikes signal upstream RPC slowness or a chain producing sequence races (XRPL stale-seq, TON stale-seqno, Solana blockhash expiry). Sustained growth → check destination RPC health.", bcStats.Rebuilds)
	writeCounter(&b, "bridge_broadcast_list_errors_total", "Errors listing broadcasting swaps.", bcStats.ListErrors)
	writeGauge(&b, "bridge_broadcast_running", "1 iff the broadcast driver loop is active.", boolToGauge(a.broadcastRunning))

	// Refund driver — including the new hardening counters.
	var rfStats RefundDriverStats
	if a.refundStats != nil {
		rfStats = a.refundStats()
	}
	writeCounter(&b, "bridge_refund_ticks_total", "Refund driver loop iterations.", rfStats.Ticks)
	writeCounter(&b, "bridge_refund_candidates_total", "Swaps the refund driver considered for rollback this run.", rfStats.Candidates)
	writeCounter(&b, "bridge_refund_successes_total", "Successful refund-leg broadcasts (deposit returned to user).", rfStats.Successes)
	writeCounter(&b, "bridge_refund_failures_total", "Refund-leg errors (sub-ceiling — will retry).", rfStats.Failures)
	writeCounter(&b, "bridge_refund_terminal_failures_total", "Swaps moved to terminal SwapStatusFailed because they were stuck broadcasting past the refund window AND were not auto-refundable (Sender / DepositAddress empty). Require operator intervention.", rfStats.TerminalFailures)
	writeCounter(&b, "bridge_refund_orphans_recovered_total", "Swaps reclaimed from SwapStatusRefunding by orphan-recovery. Non-zero on a healthy bridge means it was killed mid-refund at some point; a sustained rate is a smell (mpcd availability, persistent sign 504s).", rfStats.OrphansRecovered)
	writeCounter(&b, "bridge_refund_list_errors_total", "Errors listing refund candidates.", rfStats.ListErrors)
	writeGauge(&b, "bridge_refund_running", "1 iff the refund driver loop is active.", boolToGauge(a.refundRunning))

	// Deposit watcher.
	var wsStats WatcherStats
	if a.watcherStats != nil {
		wsStats = a.watcherStats()
	}
	writeCounter(&b, "bridge_deposit_watcher_ticks_total", "Deposit watcher loop iterations.", wsStats.Ticks)
	writeCounter(&b, "bridge_deposit_watcher_checks_total", "Source-chain balance checks performed.", wsStats.Checks)
	writeCounter(&b, "bridge_deposit_watcher_advances_total", "Swaps advanced from user_deposit_pending to bridge_transfer_pending by a confirmed deposit.", wsStats.Advances)
	writeCounter(&b, "bridge_deposit_watcher_check_errors_total", "Errors querying source-chain RPC for deposit balance.", wsStats.CheckErrors)
	writeCounter(&b, "bridge_deposit_watcher_list_errors_total", "Errors listing pending-deposit swaps.", wsStats.ListErrors)
	writeCounter(&b, "bridge_deposit_watcher_expired_total", "Swaps auto-cancelled from user_deposit_pending because the create-time deposit address was never funded within --deposit-expire-after. Closes the last hardening-matrix gap (every other pipeline stage already had a terminal escape). A sudden spike is a smell — UX regression on the deposit step or someone spamming /v1/bridge/swaps.", wsStats.Expired)
	writeGauge(&b, "bridge_deposit_watcher_running", "1 iff the deposit watcher loop is active.", boolToGauge(a.watcherRunning))

	// MPC pool — split / enabled gauges. Both are point-in-time so an
	// operator can confirm --mpc-private-url actually took effect after
	// a config push without exec'ing into the pod.
	mpcEnabled := 0
	mpcSplit := 0
	if a.mpcPool != nil {
		mpcEnabled = 1
		if a.mpcPool.IsSplit() {
			mpcSplit = 1
		}
	}
	writeGauge(&b, "bridge_mpc_keygen_enabled", "1 iff an MPC pool is configured (at least --mpc-url is set).", mpcEnabled)
	writeGauge(&b, "bridge_mpc_pool_split", "1 iff the MPC pool has distinct public + private clusters (--mpc-private-url set).", mpcSplit)

	// LP-333: b-chain signer-set + epoch coordination gauges. Reads
	// from the cached BChainPoller snapshot — never blocks on RPC.
	// Reachable=0 with the rest non-zero means the cluster snapshot
	// is stale but believable; operators alert on `Reachable=0 for
	// >5m` to catch real outages without firing on transient blips.
	var snap BChainSnapshot
	if a.bchainSnapshot != nil {
		snap = a.bchainSnapshot()
	}
	bchainReachable := 0
	if snap.Reachable {
		bchainReachable = 1
	}
	writeGauge(&b, "bridge_bchain_reachable", "1 iff the most recent LP-333 poll of b-chain succeeded. 0 means stale (the other gauges still report the last good values).", bchainReachable)
	writeGauge(&b, "bridge_bchain_current_epoch", "Current LP-333 epoch number from b-chain. Increments on every signer-set rotation; alert on unexpected change.", int(snap.Epoch))
	writeGauge(&b, "bridge_bchain_signer_set_threshold", "Active signer-set threshold (t in t-of-n). Alert on unexpected change.", snap.Threshold)
	writeGauge(&b, "bridge_bchain_signer_set_size", "Active signer-set cardinality (n in t-of-n). Alert on unexpected change.", snap.Total)

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
	writeGauge(&b, "bridge_wallet_health_poller_running", "1 iff the release-wallet canary-sign health poller loop is active.", boolToGauge(a.walletHealthRunning))

	// Per-status swap-count gauge — surfaces queue depth at each
	// pipeline stage. Spikes here are the earliest signal an upstream
	// dependency (mpcd, RPC, destination chain) is degraded.
	if a.store != nil {
		writeSwapStatusGauges(&b, a.store)
	}

	c.SetHeader("Content-Type", "text/plain; version=0.0.4")
	return c.String(http.StatusOK, b.String())
}

// writeCounter emits one Prometheus counter line + HELP/TYPE preamble.
func writeCounter(b *strings.Builder, name, help string, value uint64) {
	fmt.Fprintf(b, "# HELP %s %s\n", name, help)
	fmt.Fprintf(b, "# TYPE %s counter\n", name)
	fmt.Fprintf(b, "%s %d\n", name, value)
}

// writeGauge emits one Prometheus gauge line + HELP/TYPE preamble.
func writeGauge(b *strings.Builder, name, help string, value int) {
	fmt.Fprintf(b, "# HELP %s %s\n", name, help)
	fmt.Fprintf(b, "# TYPE %s gauge\n", name)
	fmt.Fprintf(b, "%s %d\n", name, value)
}

// boolToGauge dereferences a "is running" func into 0/1. Nil func →
// 0 (driver was never set, e.g. --disable-* flag).
func boolToGauge(fn func() bool) int {
	if fn == nil || !fn() {
		return 0
	}
	return 1
}

// allSwapStatuses is the fixed label set for the per-status gauge.
// Listed explicitly (not derived from store enumeration) so the metric
// surface stays stable even when no swaps are in a given state — a
// missing label is harder to alert on than an explicit zero.
var allSwapStatuses = []SwapStatus{
	SwapStatusUserDepositPending,
	SwapStatusBridgeTransferPending,
	SwapStatusSigning,
	SwapStatusBroadcasting,
	SwapStatusRefundPending,
	SwapStatusRefunding,
	SwapStatusCompleted,
	SwapStatusRefunded,
	SwapStatusFailed,
	SwapStatusCancelled,
}

// writeSwapStatusGauges emits bridge_swaps_by_status{status="..."} for
// every status. Uses a single List(empty) + group-by rather than N
// List(status=X) calls because the in-memory and zapdb stores both
// load swaps in O(n) regardless. Errors are silenced — /metrics must
// always return a body even when the store is degraded; an alert on
// `up` (scrape liveness) catches that case.
func writeSwapStatusGauges(b *strings.Builder, store SwapStore) {
	counts := map[SwapStatus]uint64{}
	for _, s := range allSwapStatuses {
		counts[s] = 0
	}
	swaps, err := store.List(context.Background(), SwapFilter{})
	if err == nil {
		for _, sw := range swaps {
			counts[sw.Status]++
		}
	}
	b.WriteString("# HELP bridge_swaps_by_status Current count of swaps in each pipeline status. Spikes signal upstream degradation (mpcd, RPC, destination chain).\n")
	b.WriteString("# TYPE bridge_swaps_by_status gauge\n")
	for _, s := range allSwapStatuses {
		fmt.Fprintf(b, "bridge_swaps_by_status{status=%q} %d\n", string(s), counts[s])
	}
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
