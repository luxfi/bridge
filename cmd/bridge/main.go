// Package main is the unified Lux bridge: a single Go binary that embeds
// the SPA, serves the bridge API natively for read paths (networks, tokens,
// quotes), and proxies MPC-heavy paths (swap orchestration, signer state)
// to the legacy Node backend during the migration to a fully native impl.
//
// Build: go build -o bridge ./cmd/bridge
// Run:   bridge --config /etc/bridge/networks.yaml
//
// Routes:
//
//	/                                       SPA (embedded; SPA-routing fallback)
//	/envs.js                                runtime config window.ENV = {...}
//	/icon.svg, /logo.svg                    per-host brand assets (disk override)
//	/health                                 service health
//	/v1/bridge/networks                     supported chains
//	/v1/bridge/tokens                       tokens per chain
//	/v1/bridge/quote                        price quote (proxied)
//	/v1/bridge/rate                         exchange rate (proxied)
//	/v1/bridge/limits                       swap limits (proxied)
//	/v1/bridge/swaps/*                      swap CRUD (proxied)
//	/v1/bridge/explorer/*                   tx lookup (proxied)
//
// HTTP framework: github.com/hanzoai/zip (Sinatra-style on Fiber v3 /
// fasthttp). Logging: github.com/luxfi/log. This is the canonical Hanzo
// Go stack; do NOT introduce stdlib net/http handlers, slog, or zap on
// new paths — use zip.Ctx + luxlog throughout.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"sort"
	"strings"
	"syscall"
	"time"

	"github.com/hanzoai/zip"
	"github.com/hanzoai/zip/middleware"
	"math/big"

	"github.com/luxfi/bridge"
	"github.com/luxfi/bridge/internal/bchain"
	"github.com/luxfi/bridge/internal/broadcast"
	"github.com/luxfi/bridge/internal/cosigners"
	"github.com/luxfi/bridge/internal/depositcheck"
	"github.com/luxfi/bridge/internal/mchain"
	"github.com/luxfi/bridge/internal/tokens"
	"github.com/luxfi/bridge/internal/txassembler"
	luxlog "github.com/luxfi/log"
)

// buildCosignerDispatcher constructs the layered-cosigner dispatcher
// for the signing driver. Returns nil when --disable-cosigners is set
// (the caller skips the SetCosignerDispatcher injection; swaps with
// cosigners[] are still validated + persisted but never gated on
// external approval — useful during the §13.6 cutover soak).
//
// SecretStore: EnvSecretStore reads UTILA_COSIGNER_PEM__<envSafe(org_id)>
// and FIREBLOCKS_COSIGNER_PEM__<envSafe(api_key)>. Production swap-in
// is a KMS-backed store keyed by the same public identifiers (Vault
// integration is the next README feature to wire).
//
// FamilyDispatcher selection:
//
//   - Default: StubFamilyDispatcher. Both Utila and Fireblocks intents
//     return StatusFailed with a "use app/server" reason → swap moves
//     to refund_pending. Closes the silent-drop regression that
//     previously let swaps reach broadcasting without any cosigner
//     attestation.
//   - With --enable-fireblocks-cosigner: FireblocksRESTFamily for the
//     Fireblocks half (real RAW-sign flow + JWT auth), UtilaDelegate
//     still the stub. Fireblocks intents go end-to-end; Utila intents
//     still fail with the stub reason. Timeout is read from
//     FIREBLOCKS_COSIGNER_TIMEOUT_MS (default 60000 ms, matches the
//     TS impl).
//
// Future: when the Utila Connect-RPC port lands, wire it as
// FireblocksRESTFamily.UtilaDelegate to get both families real.
func buildCosignerDispatcher(disabled bool, enableFireblocks bool, logger luxlog.Logger) cosigners.Dispatcher {
	if disabled {
		if logger != nil {
			logger.Info("cosigner gate disabled by --disable-cosigners; swaps with cosigners[] will advance to broadcasting on native MPC alone")
		}
		return nil
	}

	// CompositeFamilyDispatcher routes per-family calls to separately
	// configured runners. Today the Fireblocks half is opt-in real
	// (FireblocksRESTFamily) and the Utila half is always the
	// scaffold (UtilaConnectRPCFamily — currently returns
	// StatusFailed but reserves the wire shape). When the real Utila
	// Connect-RPC port lands, swap UtilaFamily to the real
	// UtilaConnectRPCFamily without changing main.go's wiring.
	composite := cosigners.CompositeFamilyDispatcher{
		UtilaFamily: cosigners.UtilaConnectRPCFamily{},
	}
	if enableFireblocks {
		timeout := envInt64("FIREBLOCKS_COSIGNER_TIMEOUT_MS", 60_000)
		composite.FireblocksFamily = cosigners.FireblocksRESTFamily{
			Timeout: time.Duration(timeout) * time.Millisecond,
		}
		if logger != nil {
			logger.Info("fireblocks cosigner REST client enabled",
				"timeout_ms", timeout,
			)
		}
	}
	return cosigners.NewDefault(cosigners.EnvSecretStore{}, composite)
}

// envInt64 reads a positive int64 from env, falling back to def on
// missing / unparseable. Used for FIREBLOCKS_COSIGNER_TIMEOUT_MS and
// any future integer-env knobs.
func envInt64(name string, def int64) int64 {
	raw := os.Getenv(name)
	if raw == "" {
		return def
	}
	var v int64
	if _, err := fmt.Sscanf(raw, "%d", &v); err != nil || v <= 0 {
		return def
	}
	return v
}

// parseRPCOverrides parses --source-rpc-overrides into a map.
// Format: NETWORK1=URL1,NETWORK2=URL2 — comma-separated, equals-delimited.
// Empty input returns nil. Whitespace around tokens is trimmed.
// Returns an error on malformed entries (no '=', empty network, empty URL).
func parseRPCOverrides(raw string) (map[string]string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	out := map[string]string{}
	for _, pair := range strings.Split(raw, ",") {
		pair = strings.TrimSpace(pair)
		if pair == "" {
			continue
		}
		eq := strings.Index(pair, "=")
		if eq <= 0 || eq == len(pair)-1 {
			return nil, fmt.Errorf("malformed override %q (want NETWORK=URL)", pair)
		}
		net := strings.TrimSpace(pair[:eq])
		url := strings.TrimSpace(pair[eq+1:])
		if net == "" || url == "" {
			return nil, fmt.Errorf("malformed override %q (empty network or URL)", pair)
		}
		out[net] = url
	}
	return out, nil
}

// resolveMPCToken returns either the explicit token, or — when token is
// empty and an identity file is provided — derives the bearer token
// deterministically via SHA-256(seed || "mpc-internal-api"). Empty
// token + empty identity file returns "" (works only against
// unauthenticated dev clusters). Errors only on file-read failure or
// malformed identity JSON.
func resolveMPCToken(token, identityFile, label string, logger luxlog.Logger) (string, error) {
	if token != "" {
		return token, nil
	}
	if identityFile == "" {
		return "", nil
	}
	identityJSON, err := os.ReadFile(identityFile)
	if err != nil {
		return "", fmt.Errorf("read %s mpc identity file %q: %w", label, identityFile, err)
	}
	derived, err := mchain.DeriveInternalKey(identityJSON)
	if err != nil {
		return "", fmt.Errorf("derive %s mpc internal key from %q: %w", label, identityFile, err)
	}
	logger.Info("derived mpc bearer token from identity file",
		"cluster", label,
		"path", identityFile,
		"token_prefix", derived[:8]+"…",
	)
	return derived, nil
}

// buildMPCPool assembles the layered MPC pool from the parsed flags.
//
// publicURL empty → returns nil, nil (MPC disabled, /v1/bridge/swaps
// with use_deposit_address=true will 503). Matches the legacy "no
// --mpc-url" behaviour.
//
// publicURL set, privateURL empty → single-cluster pool. Pool.Public
// == Pool.Private == the public client. Existing single-cluster
// deploys hit this path unchanged.
//
// publicURL set, privateURL set → split pool. Each cluster gets its
// own *mchain.Client. Private-side auth (token / identity file /
// org-id) falls back to the public-side values when the private
// flag is empty — minimizes per-cluster flag duplication when both
// clusters share an auth boundary.
func buildMPCPool(
	publicURL, publicToken, publicIdentityFile, publicOrgID string,
	privateURL, privateToken, privateIdentityFile, privateOrgID string,
	timeout time.Duration,
	logger luxlog.Logger,
) (*mchain.Pool, error) {
	if publicURL == "" {
		return nil, nil
	}

	pubToken, err := resolveMPCToken(publicToken, publicIdentityFile, "public", logger)
	if err != nil {
		return nil, err
	}
	publicClient := mchain.NewAuthed(publicURL, pubToken, publicOrgID, timeout)

	if privateURL == "" {
		logger.Info("mpc pool enabled",
			"split", false,
			"public_url", publicClient.APIURL,
			"org_id", publicClient.OrgID,
			"with_token", pubToken != "",
			"timeout", timeout,
		)
		return mchain.NewPool(publicClient), nil
	}

	// Private cluster gets its own client. Auth defaults to public
	// values when the private flag is empty.
	effPrivToken := privateToken
	effPrivIdentity := privateIdentityFile
	effPrivOrg := privateOrgID
	if effPrivToken == "" && effPrivIdentity == "" {
		// Both auth knobs empty → fall back to public token outright.
		// (We don't re-derive from publicIdentityFile here — it was
		// already resolved above and we have the literal token.)
		effPrivToken = pubToken
	}
	if effPrivOrg == "" {
		effPrivOrg = publicOrgID
	}
	privToken, err := resolveMPCToken(effPrivToken, effPrivIdentity, "private", logger)
	if err != nil {
		return nil, err
	}
	privateClient := mchain.NewAuthed(privateURL, privToken, effPrivOrg, timeout)

	pool := mchain.NewSplitPool(publicClient, privateClient)
	logger.Info("mpc pool enabled",
		"split", true,
		"public_url", publicClient.APIURL,
		"public_org_id", publicClient.OrgID,
		"public_with_token", pubToken != "",
		"private_url", privateClient.APIURL,
		"private_org_id", privateClient.OrgID,
		"private_with_token", privToken != "",
		"timeout", timeout,
	)
	return pool, nil
}

var version = "dev"

func main() {
	cfgPath := flag.String("config", envOr("BRIDGE_CONFIG", "/etc/bridge/networks.yaml"), "path to networks.yaml")
	addr := flag.String("addr", envOr("BRIDGE_ADDR", ":8080"), "listen address")
	backend := flag.String("backend", envOr("BRIDGE_BACKEND_URL", ""), "legacy Node backend URL for proxied routes (empty disables proxy)")
	bchainURL := flag.String("bchain-url", envOr("BRIDGE_BCHAIN_URL", ""),
		"BridgeVM (b-chain) JSON-RPC base URL, e.g. https://api.lux-test.network — empty disables native bchain handlers and falls back to the legacy backend proxy")
	bchainTimeout := flag.Duration("bchain-timeout", 10*time.Second, "per-request timeout for bchain RPC calls")
	bchainPollInterval := flag.Duration("bchain-poll-interval", DefaultBChainPollInterval,
		"how often the LP-333 background poller refreshes the b-chain signer-set + epoch snapshot for /metrics + /health. Zero uses the default (30s). The poller never blocks the scrape path — when b-chain hangs, the cache surfaces stale-but-believable values and bridge_bchain_reachable flips to 0.")
	// Same-origin Lux RPC proxy. The public Lux gateway's CORS allow-
	// list doesn't include bridge.lux.network, so the embedded SPA's
	// wagmi useBalance() stalls forever for LUX (browser blocks the
	// response). The bridge proxies POST /api/rpc/lux-{mainnet,testnet}
	// → upstream, same-origin, no CORS needed. Empty disables that
	// route; operators who fix the upstream allow-list can turn the
	// proxy off and have the SPA hit the gateway directly.
	luxRPCMainnetURL := flag.String("lux-rpc-mainnet-url", envOr("BRIDGE_LUX_RPC_MAINNET_URL", "https://api.lux.network/ext/bc/C/rpc"),
		"Upstream URL for the /api/rpc/lux-mainnet same-origin proxy. Default is the public Lux mainnet gateway. Empty disables the route (SPA must hit the gateway directly — only works when the gateway allow-list includes the bridge origin).")
	luxRPCTestnetURL := flag.String("lux-rpc-testnet-url", envOr("BRIDGE_LUX_RPC_TESTNET_URL", "https://api.lux-test.network/ext/bc/C/rpc"),
		"Upstream URL for the /api/rpc/lux-testnet same-origin proxy. Default is the public Lux testnet gateway. Empty disables the route.")
	luxRPCTimeout := flag.Duration("lux-rpc-timeout", DefaultRPCProxyTimeout,
		"per-request upstream timeout for the LUX RPC proxy. Default 12s — slow enough for a degraded gateway, fast enough that a hung upstream doesn't pin the browser tab's wagmi loop.")
	mpcURL := flag.String("mpc-url", envOr("BRIDGE_MPC_URL", ""),
		"MPC keygen service URL for the PUBLIC cluster (m-chain) — used for per-swap deposit-wallet keygen and refund signing. Required when SDK requests carry use_deposit_address=true; empty disables MPC keygen and those requests 503. Single-cluster deploys leave --mpc-private-url empty and this URL serves both roles (back-compat).")
	mpcTimeout := flag.Duration("mpc-timeout", 120*time.Second, "per-request timeout for MPC keygen calls (matches mpc-wallet.ts)")
	mpcToken := flag.String("mpc-token", envOr("BRIDGE_MPC_TOKEN", ""),
		"Bearer token for the MPC internal API (public cluster). The live mpcd daemon protects every endpoint except /health behind Authorization: Bearer <token>. Either pass an explicit token or derive one from --mpc-identity-file. Used for the private cluster too unless --mpc-private-token overrides it.")
	mpcIdentityFile := flag.String("mpc-identity-file", envOr("BRIDGE_MPC_IDENTITY_FILE", ""),
		"Path to a node identity JSON (e.g. data/mpc/node0/keys/node0_identity.json). When set and --mpc-token is empty, derives the bearer token deterministically via SHA-256(seed || \"mpc-internal-api\"). Convenience for local dev — prod should set --mpc-token explicitly. Applies to the public cluster (and the private cluster too unless --mpc-private-identity-file overrides).")
	mpcOrgID := flag.String("mpc-org-id", envOr("BRIDGE_MPC_ORG_ID", "bridge"),
		"Tenant identifier the MPC daemon multiplexes keygen by. Default \"bridge\". Applies to the public cluster (and the private cluster too unless --mpc-private-org-id overrides).")
	// Layered MPC: the SDK's BridgeMPCConfig declares both publicUrl
	// (m-chain user-facing MPC) and privateUrl (Lux treasury cluster).
	// When --mpc-private-url is unset, the bridge runs single-cluster
	// and both roles target --mpc-url (back-compat). When set, the
	// bridge routes per-swap deposit-wallet keygen + refund signing
	// to --mpc-url and release-wallet keygen + settlement signing to
	// --mpc-private-url. See REQUIREMENTS.md §6 + §13.4.
	mpcPrivateURL := flag.String("mpc-private-url", envOr("BRIDGE_MPC_PRIVATE_URL", ""),
		"MPC keygen service URL for the PRIVATE treasury cluster. When set, release-wallet keygen + settlement signing run here instead of --mpc-url. Smaller-quorum cluster holding operator-funded liquidity. Empty (default) = single-cluster mode: both roles use --mpc-url.")
	mpcPrivateToken := flag.String("mpc-private-token", envOr("BRIDGE_MPC_PRIVATE_TOKEN", ""),
		"Bearer token for the private (treasury) MPC cluster. Empty falls back to --mpc-token. Useful when the private cluster runs on a separate authentication boundary.")
	mpcPrivateIdentityFile := flag.String("mpc-private-identity-file", envOr("BRIDGE_MPC_PRIVATE_IDENTITY_FILE", ""),
		"Identity file for the private cluster (same derivation as --mpc-identity-file). Empty falls back to --mpc-identity-file.")
	mpcPrivateOrgID := flag.String("mpc-private-org-id", envOr("BRIDGE_MPC_PRIVATE_ORG_ID", ""),
		"Tenant identifier for the private cluster. Empty falls back to --mpc-org-id.")
	depCheckTimeout := flag.Duration("deposit-check-timeout", 10*time.Second,
		"per-request timeout for the /v1/bridge/check-deposit ops endpoint (source-chain RPC poll)")
	disableDepositCheck := flag.Bool("disable-deposit-check", false,
		"disable the /v1/bridge/check-deposit ops endpoint entirely (default: enabled)")
	sourceRPCOverrides := flag.String("source-rpc-overrides", envOr("BRIDGE_SOURCE_RPC_OVERRIDES", ""),
		"comma-separated overrides for source-chain RPCs used by the deposit watcher + /v1/bridge/check-deposit. "+
			"Format: NETWORK1=URL1,NETWORK2=URL2. Useful when the package defaults (rpc.sepolia.org etc.) are stale or rate-limited. "+
			"Example: ETHEREUM_SEPOLIA=https://ethereum-sepolia-rpc.publicnode.com,BITCOIN_TESTNET=https://mempool.space/testnet/api")
	depositWatcherInterval := flag.Duration("deposit-watcher-interval", DefaultWatcherInterval,
		"poll cadence for the deposit watcher (background loop that advances swaps from user_deposit_pending → bridge_transfer_pending). Set <= 0 to use the default 15s.")
	disableDepositWatcher := flag.Bool("disable-deposit-watcher", false,
		"disable the background deposit watcher entirely. Swaps will then never advance state automatically — useful for tests + manual operation.")
	depositExpireAfter := flag.Duration("deposit-expire-after", DefaultDepositExpireAfter,
		"max age of a user_deposit_pending swap before the deposit watcher auto-cancels it (the create-time deposit address was never funded). Default 24h. Zero disables — back-compat for legacy 'pending forever' behaviour. Closes the final hardening-matrix gap so the store can't fill up with abandoned swap intents.")
	signingInterval := flag.Duration("signing-interval", DefaultSigningInterval,
		"poll cadence for the MPC signing driver (background loop that drives swaps from bridge_transfer_pending through MPC signing → broadcasting).")
	quoteMaxAge := flag.Duration("quote-max-age", 30*time.Minute,
		"max age of a create-time quote before the signing driver refuses to sign. Stale swaps are kicked to the refund driver so the user gets their deposit back rather than executing at a drifted rate. Zero disables — only use for stablecoin-only deployments.")
	disableSigningDriver := flag.Bool("disable-signing-driver", false,
		"disable the background MPC signing driver. Swaps in bridge_transfer_pending will then stall — useful when no MPC cluster is reachable.")
	maxSigningAttempts := flag.Int("signing-max-attempts", DefaultMaxSigningAttempts,
		"max consecutive signing failures per swap before the signing driver moves it to refund_pending. Catches both transient destination-RPC outages and terminal cases like a destination chain with no tx assembler (BTC / SOL / TON today). Zero disables — legacy 'retry forever' behaviour.")
	disableCosigners := flag.Bool("disable-cosigners", false,
		"disable the layered-cosigner gate (Utila / Fireblocks). When false (default), swaps with a non-empty cosigners[] in the create body have each external custodian consulted after the native MPC sign and before broadcasting; any non-approved result moves the swap to refund_pending. When true, cosigner intents are still validated + persisted on the swap but NOT dispatched — useful during the §13.6 cutover soak when app/server is still the authoritative cosigner path.")
	enableFireblocksCosigner := flag.Bool("enable-fireblocks-cosigner", false,
		"opt into the real Fireblocks REST cosigner client (internal/cosigners.FireblocksRESTFamily). Default false leaves Fireblocks intents on the StubFamilyDispatcher path (StatusFailed with 'use app/server' reason) — same as today. Flip on once your Fireblocks tenant secret PEM is loadable via UTILA_COSIGNER_PEM__/FIREBLOCKS_COSIGNER_PEM__<envSafe(api_key)> (env-var fallback) and you've verified the JWT auth against your sandbox tenant. Tenant timeout overridable via FIREBLOCKS_COSIGNER_TIMEOUT_MS env (default 60000 ms).")
	broadcastInterval := flag.Duration("broadcast-interval", DefaultBroadcastInterval,
		"poll cadence for the broadcast driver (final stage: push signed raw destination txs onto the destination chain RPC, advance to completed).")
	disableBroadcastDriver := flag.Bool("disable-broadcast-driver", false,
		"disable the background broadcast driver. Swaps in broadcasting will then stall — useful when destination chains are unreachable.")
	broadcastTimeout := flag.Duration("broadcast-timeout", broadcast.DefaultTimeout,
		"per-request timeout for destination-chain RPC broadcasts (eth_sendRawTransaction etc.).")
	refundInterval := flag.Duration("refund-interval", DefaultRefundInterval,
		"poll cadence for the refund driver (background loop that sweeps a stuck deposit back to the original sender when destination broadcast can't land).")
	refundAfter := flag.Duration("refund-after", DefaultRefundAfter,
		"elapsed-since-last-error window before the refund driver auto-reverts a swap stuck at broadcasting with insufficient-funds errors. Default 90s — long enough for an operator to drip LUX to the release address via lux-faucet.sh.")
	maxRefundAttempts := flag.Int("refund-max-attempts", DefaultMaxRefundAttempts,
		"max consecutive refund-rollback iterations per swap before the refund driver gives up and moves the swap to SwapStatusFailed. Catches persistent mpcd failures (e.g. MPC sign returning 504 because the wallet's session state was lost on rotation) that would otherwise oscillate refunding ↔ broadcasting forever. Zero disables the ceiling — legacy 'retry forever' behaviour.")
	orphanRefundingAfter := flag.Duration("orphan-refunding-after", DefaultOrphanRefundingAfter,
		"how long a swap can sit in SwapStatusRefunding before the refund driver reclaims it as an orphan (rolls back to refund_pending so the next tick can retry). Orphans happen when the bridge process is killed mid-refund — without this recovery the swap is stuck forever since neither broadcast nor refund driver scans `refunding` on subsequent ticks. Default 5m; zero disables orphan recovery entirely.")
	disableRefundDriver := flag.Bool("disable-refund-driver", false,
		"disable the background refund driver entirely. Swaps stuck at broadcasting will then never auto-revert — useful when the source chain is unreachable or operators want manual control.")
	staticDir := flag.String("static", envOr("BRIDGE_STATIC_DIR", ""), "override embedded SPA from disk")
	dataDir := flag.String("data-dir", envOr("BRIDGE_DATA_DIR", ""),
		"persistent data directory for the swap store (zapdb). When empty, swaps are stored in-process and lost on restart — only use the in-memory mode for tests + first deploys. In prod, mount a PersistentVolume and point this at it (e.g. /var/lib/lux-bridge).")
	releaseFile := flag.String("release-wallets-file", envOr("BRIDGE_RELEASE_WALLETS_FILE", ""),
		"path to a JSON file that persists per-destination-network release wallets (the long-lived MPC addresses that pay out settlements). When set, the bridge mints a release wallet on first need and reuses it across restarts. When empty AND --data-dir is set, defaults to <data-dir>/release-wallets.json. When empty AND --data-dir is empty, runs in-memory — every restart re-mints and any liquidity at the old address is stranded. Required for prod.")
	profileFlag := flag.String("profile", envOr("BRIDGE_PROFILE", "classical-compat"),
		"bridge security profile: strict-pq | classical-compat")
	coingeckoEnabled := flag.Bool("coingecko", envBool("BRIDGE_COINGECKO", false),
		"enable CoinGecko HTTP price feed (wrapped over the static feed as a fallback for LUX/ZOO and outages). When disabled (default), the static feed is the sole source of prices.")
	coingeckoURL := flag.String("coingecko-url", envOr("BRIDGE_COINGECKO_URL", DefaultCoinGeckoBaseURL),
		"CoinGecko API base URL")
	coingeckoAPIKey := flag.String("coingecko-api-key", envOr("BRIDGE_COINGECKO_API_KEY", ""),
		"CoinGecko Pro API key (empty for the free tier)")
	coingeckoTTL := flag.Duration("coingecko-cache-ttl", DefaultCoinGeckoCacheTTL,
		"how long CoinGecko prices are cached before re-fetching. The fetch batches every configured symbol into one HTTP call.")
	coingeckoTimeout := flag.Duration("coingecko-timeout", DefaultCoinGeckoTimeout,
		"per-request HTTP timeout for CoinGecko calls")
	showVersion := flag.Bool("version", false, "print version and exit")
	flag.Parse()

	if *showVersion {
		fmt.Println(version)
		return
	}

	logger := luxlog.New("service", "lux-bridge")

	// Resolve the bridge profile. Default is classical-compat (the
	// user-facing UI talks to external L1s); operators pin
	// strict-pq for an internal Lux↔Lux bridge.
	profile, err := selectProfile(*profileFlag)
	if err != nil {
		logger.Error("bridge profile invalid", "err", err)
		os.Exit(1)
	}
	logger.Info("bridge profile",
		"name", profile.Name,
		"post_quantum_end_to_end", profile.IsPostQuantumEndToEnd(),
	)

	cfg, err := LoadConfig(*cfgPath)
	if err != nil {
		logger.Error("load config", "err", err, "path", *cfgPath)
		os.Exit(1)
	}

	frontend, err := NewFrontend(cfg, *staticDir)
	if err != nil {
		logger.Error("frontend init", "err", err)
		os.Exit(1)
	}

	// Construct the optional BridgeVM client. When --bchain-url is unset
	// the legacy reverse-proxy stays on the swap/quote routes; when set
	// the native handlers in swaps_handler.go run instead.
	var bchainClient *bchain.Client
	var bchainPoller *BChainPoller
	bchainPollerCtx, bchainPollerCancel := context.WithCancel(context.Background())
	if *bchainURL != "" {
		bchainClient = bchain.New(*bchainURL, *bchainTimeout)
		logger.Info("bchain RPC enabled",
			"bridge_rpc", bchainClient.BridgeRPCURL,
			"threshold_rpc", bchainClient.ThresholdRPCURL,
			"timeout", *bchainTimeout,
		)
		// LP-333 background poller — refreshes the cached signer-set +
		// epoch snapshot for /metrics + /health without blocking the
		// scrape path on RPC. The cache surfaces stale-but-believable
		// values when b-chain blips; bridge_bchain_reachable flips to 0.
		bchainPoller = NewBChainPoller(bchainClient, *bchainPollInterval, logger)
		go func() {
			_ = bchainPoller.Run(bchainPollerCtx)
		}()
		logger.Info("bchain LP-333 poller started",
			"interval", *bchainPollInterval,
		)
	}
	defer bchainPollerCancel()

	// Construct the optional MPC keygen client(s). Per REQUIREMENTS.md §6
	// the bridge supports a two-cluster layered model:
	//
	//   --mpc-url         → public cluster (m-chain). Per-swap deposit
	//                       keygen + refund signing route here. Wide,
	//                       permissionless quorum; single-swap blast
	//                       radius because every wallet is ephemeral.
	//
	//   --mpc-private-url → private treasury cluster. Release-wallet
	//                       keygen + settlement signing route here.
	//                       Smaller, tighter-access quorum because these
	//                       wallets hold operator liquidity.
	//
	// Single-cluster deploys leave --mpc-private-url unset; the pool
	// then runs Public == Private == the --mpc-url client (back-compat
	// for every existing deploy).
	mchainPool, err := buildMPCPool(
		*mpcURL, *mpcToken, *mpcIdentityFile, *mpcOrgID,
		*mpcPrivateURL, *mpcPrivateToken, *mpcPrivateIdentityFile, *mpcPrivateOrgID,
		*mpcTimeout,
		logger,
	)
	if err != nil {
		logger.Error("build mpc pool", "err", err)
		os.Exit(1)
	}

	// Parse --source-rpc-overrides once and reuse for both the
	// depositcheck client (source-side polling) and the broadcast
	// client (destination-side push) — the two layers commonly share
	// URLs (Lux Testnet RPC is BOTH a source and destination, etc.).
	overrides, err := parseRPCOverrides(*sourceRPCOverrides)
	if err != nil {
		logger.Error("invalid --source-rpc-overrides", "err", err, "value", *sourceRPCOverrides)
		os.Exit(1)
	}
	if len(overrides) > 0 {
		// Log the network names only (URL values may contain API keys).
		keys := make([]string, 0, len(overrides))
		for k := range overrides {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		logger.Info("source RPC overrides applied", "networks", keys)
	}

	// Token registry — drives ERC-20 deposit detection (eth_call
	// balanceOf) AND destination-side tx assembly (transfer() calldata
	// + per-asset decimals). DefaultRegistry seeds the common bridged
	// assets (USDC/USDT/DAI on Ethereum + Sepolia, USDC on Base/Polygon,
	// natives everywhere); operators add custom tokens via a future
	// config-file flag if needed.
	tokenRegistry := tokens.DefaultRegistry()
	logger.Info("token registry loaded",
		"size", tokenRegistry.Size(),
	)

	// Deposit-check client (ops diagnostic + deposit watcher backing).
	// Always-on by default; /v1/bridge/check-deposit is the user-facing
	// endpoint. Uses the package's RPC_URLs table for upstream URLs;
	// --source-rpc-overrides shadows specific networks with custom URLs.
	var depCheckClient *depositcheck.Client
	if !*disableDepositCheck {
		depCheckClient = depositcheck.New(*depCheckTimeout)
		if len(overrides) > 0 {
			depCheckClient.RPCURLOverrides = overrides
		}
		depCheckClient.Tokens = tokenRegistry
		logger.Info("deposit check endpoint enabled",
			"path", "/v1/bridge/check-deposit",
			"timeout", *depCheckTimeout,
		)
	}

	// Native swap CRUD: durable swap store + static price feed.
	// Replaces the legacy app/server Express+Prisma backend for the
	// /v1/bridge/{quote,swaps,swaps/:id,swaps} routes. Per LP-333 +
	// LP-134 the b-chain BridgeVM manages the MPC signer set, not the
	// swap API, so swap state owns its own persistence here.
	//
	// Store selection:
	//   --data-dir empty → InMemoryStore (lossy on restart; dev only)
	//   --data-dir set   → ZapStore on zapdb (Lux-flavored Badger v4)
	var (
		swapStore  SwapStore
		zapHandle  *ZapStore // for clean shutdown
		storeLabel string
	)
	if *dataDir == "" {
		swapStore = NewInMemoryStore()
		storeLabel = "in-memory"
		logger.Warn("swap store is in-memory — every restart drops in-flight swap state. Set --data-dir for durability.")
	} else {
		zs, err := NewZapStore(*dataDir)
		if err != nil {
			logger.Error("open swap store", "err", err, "path", *dataDir)
			os.Exit(1)
		}
		swapStore = zs
		zapHandle = zs
		storeLabel = "zapdb"
	}
	defer func() {
		if zapHandle != nil {
			if err := zapHandle.Close(); err != nil {
				logger.Error("swap store close", "err", err)
			}
		}
	}()
	// Static feed seeds the assets CoinGecko doesn't list (LUX, ZOO) and
	// serves as the fallback when CoinGecko is unreachable. Order-of-
	// magnitude values matching the TS app/server's getTokenPrice — the
	// CG-backed entries are overridden at runtime, the rest are the
	// permanent source for LUX/ZOO.
	staticFeed := NewStaticPriceFeed(map[string]float64{
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
	})

	var priceFeed PriceFeed = staticFeed
	feedLabel := "static"
	if *coingeckoEnabled {
		cg := NewCoinGeckoFeed(*coingeckoURL, *coingeckoAPIKey, nil)
		cg.CacheTTL = *coingeckoTTL
		cg.HTTPClient = &http.Client{Timeout: *coingeckoTimeout}
		priceFeed = &FallbackFeed{
			Primary:   cg,
			Secondary: staticFeed,
			OnFallback: func(asset string, err error) {
				if errors.Is(err, ErrPriceUnknown) {
					return // expected for LUX/ZOO — not worth a log line per quote
				}
				logger.Warn("coingecko price fallback", "asset", asset, "err", err)
			},
		}
		feedLabel = "coingecko+static"
	}

	quoteEngine := &QuoteEngine{Feed: priceFeed}
	logger.Info("native swap CRUD enabled",
		"store", storeLabel,
		"data_dir", *dataDir,
		"feed", feedLabel,
		"fee_rate", quoteEngine.FeeRate,
	)

	// API uses the PUBLIC client for per-swap deposit-wallet keygen
	// (swaps_handler.go:swapsCreateNative → mchain.KeygenForDeposit).
	// Per-swap deposit wallets are user-funded ephemeral addresses —
	// they belong on the wide public quorum, not the treasury cluster.
	var depositKeygenClient *mchain.Client
	if mchainPool != nil {
		depositKeygenClient = mchainPool.Public
	}
	api := NewAPI(cfg, *backend, bchainClient, depositKeygenClient, depCheckClient, swapStore, quoteEngine)
	api.SetProfile(profile)
	// MPC pool observable from /metrics so operators can confirm
	// --mpc-private-url actually applied after a config push.
	api.SetMPCPool(mchainPool)
	// LP-333 b-chain snapshot observable from /metrics. nil when
	// --bchain-url is unset — gauges then emit reachable=0 + zeros.
	api.SetBChainPoller(bchainPoller)
	// Lux RPC same-origin proxy URLs. The embedded SPA wagmi-config
	// posts to /api/rpc/lux-{mainnet,testnet} to avoid the upstream
	// gateway's CORS allow-list. Empty URL → the corresponding route
	// isn't registered.
	api.SetLuxRPCURLs(*luxRPCMainnetURL, *luxRPCTestnetURL, *luxRPCTimeout, logger)
	if *luxRPCMainnetURL != "" || *luxRPCTestnetURL != "" {
		logger.Info("lux rpc proxy enabled",
			"mainnet_url", *luxRPCMainnetURL,
			"testnet_url", *luxRPCTestnetURL,
			"timeout", *luxRPCTimeout,
		)
	}

	// Per-destination-network release wallets. One MPC wallet per
	// destination chain, minted lazily on first need and reused across
	// every swap to that chain. The operator pre-funds each release
	// wallet's destination-chain address with native gas + bridged
	// liquidity; the signing driver targets THIS wallet (not the
	// per-swap deposit wallet) when producing the release tx, because
	// only this wallet's destination-chain address holds the operator-
	// funded balance the payout needs.
	//
	// Path resolution:
	//   --release-wallets-file set        → use it verbatim
	//   --release-wallets-file unset AND
	//     --data-dir set                  → <data-dir>/release-wallets.json
	//   both unset                        → in-memory (lossy on restart)
	if mchainPool != nil {
		releasePath := *releaseFile
		if releasePath == "" && *dataDir != "" {
			releasePath = filepath.Join(*dataDir, "release-wallets.json")
		}
		// Release wallets are LONG-LIVED treasury wallets — they hold
		// operator-funded liquidity and must be minted on the private
		// cluster so the smaller-quorum threshold and tighter access
		// boundary apply. Single-cluster pool? mchainPool.Private ==
		// mchainPool.Public, so this routes to the same place as
		// before (back-compat).
		releaseStore, err := mchain.NewFileReleaseStore(mchainPool.Private, releasePath)
		if err != nil {
			logger.Error("release wallet store init", "err", err, "path", releasePath)
			os.Exit(1)
		}
		api.SetReleaseStore(releaseStore)
		if releasePath == "" {
			logger.Warn("release wallet store is in-memory — every restart re-mints per-network release wallets; set --release-wallets-file (or --data-dir) for durability")
		} else {
			logger.Info("release wallet store enabled",
				"path", releasePath,
			)
		}
	} else {
		logger.Info("release wallet store skipped — no --mpc-url configured")
	}

	// Deposit watcher: background goroutine that polls the source chains
	// for confirmed deposits and advances pending swaps. Only meaningful
	// when there's something to check against — disable when no
	// depositcheck client is configured.
	var watcher *DepositWatcher
	watcherCtx, watcherCancel := context.WithCancel(context.Background())
	if !*disableDepositWatcher && depCheckClient != nil {
		watcher = NewDepositWatcher(swapStore, depCheckClient, *depositWatcherInterval, logger)
		watcher.SetExpireAfter(*depositExpireAfter)
		api.SetDepositWatcher(watcher)
		go func() {
			_ = watcher.Run(watcherCtx)
		}()
		logger.Info("deposit watcher started",
			"interval", *depositWatcherInterval,
			"expire_after", *depositExpireAfter,
		)
	} else if *disableDepositWatcher {
		logger.Info("deposit watcher disabled by --disable-deposit-watcher")
	}
	defer watcherCancel()

	// Tx assembler: produces wire-correct EVM EIP-155 sighashes for
	// the signing driver to feed to the MPC cluster, then finalizes
	// the signed raw tx for the broadcaster to push.
	//
	// Provider: live JSON-RPC against the destination chain for nonce
	// + gas price. Falls back to txassembler.defaultEndpoints when no
	// override is configured. Operators can shadow specific networks
	// via --source-rpc-overrides (same flag the deposit watcher uses).
	//
	// Chain IDs sourced from app/server/src/domain/contracts/teleport.ts
	// and the LP-134 chain registry.
	asmProvider := txassembler.NewRPCProvider(overrides, 8*time.Second)
	asm := txassembler.New(asmProvider)
	asm.Tokens = tokenRegistry
	asm.SetNetwork("ETHEREUM_SEPOLIA", txassembler.PerNetwork{ChainID: big.NewInt(11155111), NativeDecimals: 18})
	asm.SetNetwork("ETHEREUM_MAINNET", txassembler.PerNetwork{ChainID: big.NewInt(1), NativeDecimals: 18})
	asm.SetNetwork("BASE_SEPOLIA", txassembler.PerNetwork{ChainID: big.NewInt(84532), NativeDecimals: 18})
	asm.SetNetwork("BASE_MAINNET", txassembler.PerNetwork{ChainID: big.NewInt(8453), NativeDecimals: 18})
	asm.SetNetwork("LUX_TESTNET", txassembler.PerNetwork{ChainID: big.NewInt(96368), NativeDecimals: 18})
	asm.SetNetwork("LUX_MAINNET", txassembler.PerNetwork{ChainID: big.NewInt(96369), NativeDecimals: 18})
	asm.SetNetwork("ZOO_TESTNET", txassembler.PerNetwork{ChainID: big.NewInt(200201), NativeDecimals: 18})
	asm.SetNetwork("ZOO_MAINNET", txassembler.PerNetwork{ChainID: big.NewInt(200200), NativeDecimals: 18})
	asm.SetNetwork("BSC_TESTNET", txassembler.PerNetwork{ChainID: big.NewInt(97), NativeDecimals: 18})
	asm.SetNetwork("BSC_MAINNET", txassembler.PerNetwork{ChainID: big.NewInt(56), NativeDecimals: 18})
	asm.SetNetwork("POLYGON_MAINNET", txassembler.PerNetwork{ChainID: big.NewInt(137), NativeDecimals: 18})
	asm.SetNetwork("HOLESKY_TESTNET", txassembler.PerNetwork{ChainID: big.NewInt(17000), NativeDecimals: 18})
	logger.Info("tx assembler configured",
		"networks", len(asm.Networks),
		"provider", "rpc",
		"mode", "pure_transfer",
	)

	// Signing driver: background goroutine that drives swaps in
	// bridge_transfer_pending through MPC threshold signing. Requires
	// an mchain client; without one the driver has nothing to call.
	var signer *SigningDriver
	signerCtx, signerCancel := context.WithCancel(context.Background())
	if !*disableSigningDriver && mchainPool != nil {
		// Settlement leg signs FROM the release wallet (treasury) on the
		// destination chain — route the SignForWallet call to the PRIVATE
		// cluster. Single-cluster pool: Private == Public, no behaviour
		// change for legacy deploys.
		signer = NewSigningDriver(swapStore, mchainPool.Private, *signingInterval, logger)
		signer.SetAssembler(asm) // produces wire-correct EVM txs
		signer.SetMaxQuoteAge(*quoteMaxAge)
		signer.SetMaxSigningAttempts(*maxSigningAttempts)

		// Layered-cosigner gate (Utila / Fireblocks). Defaults to ON so
		// swaps declaring cosigners[] in their POST body trigger an
		// external-custodian approval flow after the native MPC sign.
		//
		// Family runners are pluggable:
		//   - Utila: always the stub today (Connect-RPC client port
		//     pending). RunUtila returns StatusFailed with a
		//     "use app/server" reason.
		//   - Fireblocks: pass --enable-fireblocks-cosigner to swap in
		//     the real REST client (internal/cosigners.FireblocksRESTFamily).
		//     Default is the stub — flip on after verifying your
		//     tenant secret PEM loads cleanly via the env-var
		//     fallback and the JWT auth succeeds against your
		//     Fireblocks sandbox.
		//
		// --disable-cosigners bypasses the gate entirely (intents are
		// still validated + persisted on the swap, just not dispatched
		// — useful during the §13.6 cutover soak when app/server is
		// authoritative).
		cosignerDisp := buildCosignerDispatcher(*disableCosigners, *enableFireblocksCosigner, logger)
		if cosignerDisp != nil {
			signer.SetCosignerDispatcher(cosignerDisp)
		}
		api.SetSigningDriver(signer)

		go func() {
			_ = signer.Run(signerCtx)
		}()
		logger.Info("signing driver started",
			"interval", *signingInterval,
			"assembler", "evm-eip155",
			"quote_max_age", *quoteMaxAge,
			"max_attempts", *maxSigningAttempts,
			"cosigners_gate", cosignerDisp != nil,
		)
	} else if *disableSigningDriver {
		logger.Info("signing driver disabled by --disable-signing-driver")
	}
	defer signerCancel()

	// Broadcast driver: final stage of the swap pipeline. Pushes the
	// fully-signed destination-chain raw transaction onto the network's
	// RPC and marks the swap completed. Always-on by default; depends
	// on swap.DestRawTx being populated (which the tx-assembly code
	// will do in a future phase).
	bcastClient := broadcast.New(*broadcastTimeout)
	if len(overrides) > 0 {
		// Reuse the same --source-rpc-overrides for destination
		// broadcasts. Destination URLs typically overlap with source
		// URLs (same Lux testnet RPC is the source for LUX deposits
		// and the destination for LUX releases) so a single flag is
		// the right operator UX.
		bcastClient.RPCURLOverrides = overrides
	}
	var bcastDriver *BroadcastDriver
	bcastCtx, bcastCancel := context.WithCancel(context.Background())
	if !*disableBroadcastDriver {
		bcastDriver = NewBroadcastDriver(swapStore, bcastClient, *broadcastInterval, logger)
		api.SetBroadcastDriver(bcastDriver)
		go func() {
			_ = bcastDriver.Run(bcastCtx)
		}()
		logger.Info("broadcast driver started",
			"interval", *broadcastInterval,
			"timeout", *broadcastTimeout,
		)
	} else {
		logger.Info("broadcast driver disabled by --disable-broadcast-driver")
	}
	defer bcastCancel()

	// Refund driver: sweeps a stuck deposit back to the original
	// sender on the SOURCE chain when the destination broadcast leg
	// has been blocked by "insufficient funds" for longer than
	// --refund-after. Reuses the same MPC signer (same threshold key
	// signs both legs), the same assembler instance (Networks map
	// covers both source + destination), and the same broadcast
	// client (rpcURLs covers both directions).
	var refundDriver *RefundDriver
	refundCtx, refundCancel := context.WithCancel(context.Background())
	if !*disableRefundDriver && mchainPool != nil {
		// Refund leg signs FROM the per-swap deposit wallet (ephemeral,
		// user-funded) — route the SignForWallet call to the PUBLIC
		// cluster. Single-cluster pool: Public == Private, no behaviour
		// change for legacy deploys.
		refundDriver = NewRefundDriver(
			swapStore,
			mchainPool.Public,
			bcastClient,
			asm,
			*refundInterval,
			*refundAfter,
			overrides,
			logger,
		)
		refundDriver.SetMaxRefundAttempts(*maxRefundAttempts)
		refundDriver.SetOrphanRefundingAfter(*orphanRefundingAfter)
		api.SetRefundDriver(refundDriver)
		go func() {
			_ = refundDriver.Run(refundCtx)
		}()
		logger.Info("refund driver started",
			"interval", *refundInterval,
			"refund_after", *refundAfter,
			"max_attempts", *maxRefundAttempts,
			"orphan_after", *orphanRefundingAfter,
		)
	} else if *disableRefundDriver {
		logger.Info("refund driver disabled by --disable-refund-driver")
	} else {
		logger.Info("refund driver skipped (no MPC client configured)")
	}
	defer refundCancel()

	app := zip.New(zip.Config{
		AppName:               "lux-bridge",
		DisableStartupMessage: true,
	})
	app.Use(middleware.Recover(), middleware.RequestID())

	// Health endpoint stays at the root (matches the legacy probe path).
	app.Get("/health", func(c *zip.Ctx) error {
		body := map[string]any{
			"status":                  "ok",
			"version":                 version,
			"backend_proxy":           *backend != "",
			"bchain_rpc":              *bchainURL != "",
			"mpc_keygen":              mchainPool != nil,
			"mpc_pool_split":          mchainPool.IsSplit(),
			"deposit_check":           !*disableDepositCheck,
			"deposit_watcher":         watcher != nil && watcher.Running(),
			"signing_driver":          signer != nil && signer.Running(),
			"broadcast_driver":        bcastDriver != nil && bcastDriver.Running(),
			"refund_driver":           refundDriver != nil && refundDriver.Running(),
			"profile":                 profile.Name,
			"post_quantum_end_to_end": profile.IsPostQuantumEndToEnd(),
		}
		if watcher != nil {
			body["watcher_stats"] = watcher.Stats()
		}
		if signer != nil {
			body["signing_stats"] = signer.Stats()
		}
		if bcastDriver != nil {
			body["broadcast_stats"] = bcastDriver.Stats()
		}
		if refundDriver != nil {
			body["refund_stats"] = refundDriver.Stats()
		}
		return c.JSON(200, body)
	})

	// API routes (/v1/bridge/* + /metrics).
	api.Register(app)

	// SPA + brand assets — install the existing http.Handler as a
	// catch-all so explicit API routes above take precedence and
	// everything else falls through to the React Router fallback
	// inside Frontend. We register `/*` directly rather than
	// `app.Mount("/", frontend)` because Mount expands to `//*`
	// (prefix+"/*"), which Fiber refuses to match against single-
	// segment paths like /envs.js.
	app.All("/*", zip.AdaptNetHTTP(frontend))

	errCh := make(chan error, 1)
	go func() {
		logger.Info("lux-bridge listening",
			"addr", *addr,
			"backend", *backend,
			"networks", len(cfg.Networks),
			"version", version,
		)
		errCh <- app.Listen(*addr)
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	select {
	case sig := <-stop:
		logger.Info("shutdown signal received", "signal", sig.String())
	case err := <-errCh:
		if err != nil {
			logger.Error("listen failed", "err", err)
			os.Exit(1)
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := app.ShutdownWithContext(ctx); err != nil {
		logger.Error("shutdown", "err", err)
	}
	logger.Info("shutdown complete")
}

func envOr(k, fallback string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return fallback
}

func envBool(k string, fallback bool) bool {
	v := os.Getenv(k)
	if v == "" {
		return fallback
	}
	switch strings.ToLower(v) {
	case "1", "t", "true", "yes", "y", "on":
		return true
	case "0", "f", "false", "no", "n", "off":
		return false
	}
	return fallback
}

// selectProfile resolves the --profile flag value to a bridge profile
// pointer. Refuses an unknown value rather than silently defaulting:
// an operator who typos the profile name must see the error rather
// than ship under the wrong posture.
func selectProfile(name string) (*bridge.BridgeProfile, error) {
	switch name {
	case "strict-pq", "lux-strict-pq", "lux-strict-pq-bridge":
		p := bridge.LuxStrictPQBridgeProfile
		return &p, nil
	case "classical-compat", "bridge-classical-compat-unsafe":
		p := bridge.BridgeClassicalCompat
		return &p, nil
	default:
		return nil, fmt.Errorf("unknown bridge profile %q (valid: strict-pq, classical-compat)", name)
	}
}
