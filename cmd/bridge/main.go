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
// HTTP framework: github.com/zap-proto/zip (Sinatra-style on Fiber v3 /
// fasthttp). Logging: github.com/luxfi/log. This is the canonical Hanzo
// Go stack; do NOT introduce stdlib net/http handlers, slog, or zap on
// new paths — use zip.Ctx + luxlog throughout.
package main

import (
	"context"
	"flag"
	"fmt"
	"math/big"
	"os"
	"os/signal"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/zap-proto/zip"
	"github.com/zap-proto/zip/middleware"

	"github.com/luxfi/bridge"
	"github.com/luxfi/bridge/internal/bchain"
	"github.com/luxfi/bridge/internal/broadcast"
	"github.com/luxfi/bridge/internal/depositcheck"
	"github.com/luxfi/bridge/internal/mchain"
	"github.com/luxfi/bridge/internal/tokens"
	"github.com/luxfi/bridge/internal/txassembler"
	luxlog "github.com/luxfi/log"
)

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

var version = "dev"

func main() {
	cfgPath := flag.String("config", envOr("BRIDGE_CONFIG", "/etc/bridge/networks.yaml"), "path to networks.yaml")
	addr := flag.String("addr", envOr("BRIDGE_ADDR", ":8080"), "listen address")
	backend := flag.String("backend", envOr("BRIDGE_BACKEND_URL", ""), "legacy Node backend URL for proxied routes (empty disables proxy)")
	bchainURL := flag.String("bchain-url", envOr("BRIDGE_BCHAIN_URL", ""),
		"BridgeVM (b-chain) JSON-RPC base URL, e.g. https://api.lux-test.network — empty disables native bchain handlers and falls back to the legacy backend proxy")
	bchainTimeout := flag.Duration("bchain-timeout", 10*time.Second, "per-request timeout for bchain RPC calls")
	mpcURL := flag.String("mpc-url", envOr("BRIDGE_MPC_URL", ""),
		"MPC keygen service URL (e.g. http://mpc-node-0.mpc-node-headless.lux-mpc.svc:9800) — required when SDK requests carry use_deposit_address=true; empty disables MPC keygen and those requests 503")
	mpcTimeout := flag.Duration("mpc-timeout", 120*time.Second, "per-request timeout for MPC keygen calls (matches mpc-wallet.ts)")
	mpcToken := flag.String("mpc-token", envOr("BRIDGE_MPC_TOKEN", ""),
		"Bearer token for the MPC internal API. The live mpcd daemon protects every endpoint except /health behind Authorization: Bearer <token>. Either pass an explicit token or derive one from --mpc-identity-file.")
	mpcIdentityFile := flag.String("mpc-identity-file", envOr("BRIDGE_MPC_IDENTITY_FILE", ""),
		"Path to a node identity JSON (e.g. data/mpc/node0/keys/node0_identity.json). When set and --mpc-token is empty, derives the bearer token deterministically via SHA-256(seed || \"mpc-internal-api\"). Convenience for local dev — prod should set --mpc-token explicitly.")
	mpcOrgID := flag.String("mpc-org-id", envOr("BRIDGE_MPC_ORG_ID", "bridge"),
		"Tenant identifier the MPC daemon multiplexes keygen by. Default \"bridge\".")
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
	signingInterval := flag.Duration("signing-interval", DefaultSigningInterval,
		"poll cadence for the MPC signing driver (background loop that drives swaps from bridge_transfer_pending through MPC signing → broadcasting).")
	disableSigningDriver := flag.Bool("disable-signing-driver", false,
		"disable the background MPC signing driver. Swaps in bridge_transfer_pending will then stall — useful when no MPC cluster is reachable.")
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
	disableRefundDriver := flag.Bool("disable-refund-driver", false,
		"disable the background refund driver entirely. Swaps stuck at broadcasting will then never auto-revert — useful when the source chain is unreachable or operators want manual control.")
	releasePoolSize := flag.Int("release-pool-size", envOrInt("BRIDGE_RELEASE_POOL_SIZE", 10),
		"size of the static MPC release-wallet pool. The signing driver rotates these wallets per swap so a single under-funded wallet doesn't block all subsequent swaps. Default 10. Set 0 to disable (deposit wallet doubles as release wallet — v1 semantics).")
	releasePoolMintNetwork := flag.String("release-pool-mint-network", envOr("BRIDGE_RELEASE_POOL_MINT_NETWORK", "LUX_TESTNET"),
		"network used for keygen of release-pool wallets. The MPC produces a deterministic eth_address that works across every EVM destination, so this only picks the address slot in the keygen response. Use LUX_MAINNET in prod.")
	releaseBalanceThresholdWei := flag.String("release-balance-threshold-wei", envOr("BRIDGE_RELEASE_BALANCE_THRESHOLD_WEI", "100000000000000000"),
		"native-token balance threshold below which the release pool logs a WARN at Acquire time. Default 0.1 native (1e17 wei). Set to 0 to disable the alerter; the gas pre-check in the signing driver still runs and short-circuits swaps that would actually fail.")
	disableGasPrecheck := flag.Bool("disable-gas-precheck", false,
		"disable the signing-driver gas pre-check (eth_getBalance against the release wallet before signing). When enabled, swaps that can't cover destination-chain gas + value short-circuit to failed_insufficient_release_gas BEFORE consuming the 75s MPC ceremony.")
	btcReleasePoolSize := flag.Int("btc-release-pool-size", envOrInt("BRIDGE_BTC_RELEASE_POOL_SIZE", 0),
		"size of the static MPC BTC release-wallet pool. The signing driver rotates these wallets per BTC swap. Default 0 (BTC release disabled). Set to 5+ in prod once BTC swaps are wanted.")
	btcReleasePoolMintNetwork := flag.String("btc-release-pool-mint-network", envOr("BRIDGE_BTC_RELEASE_POOL_MINT_NETWORK", "BITCOIN_MAINNET"),
		"network used for keygen of BTC release-pool wallets. Controls the bech32 hrp (mainnet=bc, testnet=tb) on the locally-derived P2WPKH address.")
	btcReleaseBalanceThresholdSat := flag.Int64("btc-release-balance-threshold-sat", envOrInt64("BRIDGE_BTC_RELEASE_BALANCE_THRESHOLD_SAT", 100_000),
		"BTC release wallet balance threshold below which the alerter logs a WARN at Acquire time (sat). Default 100_000 sat (0.001 BTC).")
	btcMempoolMainnetURL := flag.String("btc-mempool-mainnet-url", envOr("BRIDGE_BTC_MEMPOOL_MAINNET_URL", ""),
		"override the mempool.space mainnet base URL (e.g. an operator-hosted mempool.space mirror or btc.lux.network). Empty uses the public default.")
	btcMempoolTestnetURL := flag.String("btc-mempool-testnet-url", envOr("BRIDGE_BTC_MEMPOOL_TESTNET_URL", ""),
		"override the mempool.space testnet base URL. Empty uses the public default.")
	mpcDashboardURL := flag.String("mpc-dashboard-url", envOr("BRIDGE_MPC_DASHBOARD_URL", ""),
		"MPC dashboard API base URL (e.g. http://mpc-dashboard.lux-mpc.svc:8081). When set, SignForWallet routes through POST /v1/mpc/sign there. Required for live signing — the legacy ${MPC_URL}/sign path is NOT served by the live mpcd v2026-05 daemon.")
	mpcDashboardToken := flag.String("mpc-dashboard-token", envOr("BRIDGE_MPC_DASHBOARD_TOKEN", ""),
		"JWT for the MPC dashboard API. Mutually exclusive with --mpc-dashboard-api-key (Bearer wins).")
	mpcDashboardAPIKey := flag.String("mpc-dashboard-api-key", envOr("BRIDGE_MPC_DASHBOARD_API_KEY", ""),
		"X-API-Key value for the MPC dashboard API. Used when no JWT is available (operator pre-mints an API key with sign permission on the dashboard).")
	staticDir := flag.String("static", envOr("BRIDGE_STATIC_DIR", ""), "override embedded SPA from disk")
	dataDir := flag.String("data-dir", envOr("BRIDGE_DATA_DIR", ""),
		"persistent data directory for the swap store (zapdb). When empty, swaps are stored in-process and lost on restart — only use the in-memory mode for tests + first deploys. In prod, mount a PersistentVolume and point this at it (e.g. /var/lib/lux-bridge).")
	profileFlag := flag.String("profile", envOr("BRIDGE_PROFILE", "classical-compat"),
		"bridge security profile: strict-pq | classical-compat")
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
	if *bchainURL != "" {
		bchainClient = bchain.New(*bchainURL, *bchainTimeout)
		logger.Info("bchain RPC enabled",
			"bridge_rpc", bchainClient.BridgeRPCURL,
			"threshold_rpc", bchainClient.ThresholdRPCURL,
			"timeout", *bchainTimeout,
		)
	}

	// Construct the optional MPC keygen client. When --mpc-url is set,
	// swap creates with use_deposit_address=true mint a chain-appropriate
	// deposit address before forwarding to b-chain. When unset, those
	// requests 503 — surface the missing dep clearly.
	var mchainClient *mchain.Client
	if *mpcURL != "" {
		// Resolve the bearer token: explicit --mpc-token wins; otherwise
		// derive it from the identity file if --mpc-identity-file is set;
		// otherwise leave empty (works only against unauthenticated dev clusters).
		token := *mpcToken
		if token == "" && *mpcIdentityFile != "" {
			identityJSON, err := os.ReadFile(*mpcIdentityFile)
			if err != nil {
				logger.Error("read mpc identity file", "err", err, "path", *mpcIdentityFile)
				os.Exit(1)
			}
			derived, err := mchain.DeriveInternalKey(identityJSON)
			if err != nil {
				logger.Error("derive mpc internal key", "err", err, "path", *mpcIdentityFile)
				os.Exit(1)
			}
			token = derived
			logger.Info("derived mpc bearer token from identity file",
				"path", *mpcIdentityFile,
				"token_prefix", token[:8]+"…",
			)
		}
		mchainClient = mchain.NewAuthed(*mpcURL, token, *mpcOrgID, *mpcTimeout)
		// Dashboard signing — populates the new fields independently
		// of the internal keygen path. Both endpoints can be reached
		// from the same Client; the production deployment will set
		// both, dev-against-mock setups set only one.
		mchainClient.DashboardURL = *mpcDashboardURL
		mchainClient.DashboardToken = *mpcDashboardToken
		mchainClient.DashboardAPIKey = *mpcDashboardAPIKey
		logger.Info("mpc keygen enabled",
			"api_url", mchainClient.APIURL,
			"org_id", mchainClient.OrgID,
			"auth", map[string]bool{"with_token": token != ""},
			"dashboard_url", mchainClient.DashboardURL,
			"dashboard_auth", map[string]bool{
				"bearer":  mchainClient.DashboardToken != "",
				"api_key": mchainClient.DashboardAPIKey != "",
			},
			"timeout", *mpcTimeout,
		)
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
	// Seed the static price feed with the values used in dev / first
	// deploys. Real production wiring should swap in a CoinGecko / Pyth
	// PriceFeed implementation. These match the order-of-magnitude
	// prices the TS app/server queries via getTokenPrice.
	priceFeed := NewStaticPriceFeed(map[string]float64{
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
	quoteEngine := &QuoteEngine{Feed: priceFeed}
	logger.Info("native swap CRUD enabled",
		"store", storeLabel,
		"data_dir", *dataDir,
		"feed", "static",
		"fee_rate", quoteEngine.FeeRate,
	)

	api := NewAPI(cfg, *backend, bchainClient, mchainClient, depCheckClient, swapStore, quoteEngine)
	api.SetProfile(profile)

	// Deposit watcher: background goroutine that polls the source chains
	// for confirmed deposits and advances pending swaps. Only meaningful
	// when there's something to check against — disable when no
	// depositcheck client is configured.
	var watcher *DepositWatcher
	watcherCtx, watcherCancel := context.WithCancel(context.Background())
	if !*disableDepositWatcher && depCheckClient != nil {
		watcher = NewDepositWatcher(swapStore, depCheckClient, *depositWatcherInterval, logger)
		go func() {
			_ = watcher.Run(watcherCtx)
		}()
		logger.Info("deposit watcher started",
			"interval", *depositWatcherInterval,
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

	// Balance probe: shared by the release-pool low-balance alerter
	// and the signing-driver gas pre-check. One http.Client per
	// process is plenty.
	balanceProbe := NewBalanceProbe(overrides, 8*time.Second)

	// Release pool: static set of MPC release wallets the signing
	// driver rotates through, so a single under-funded wallet can't
	// block every subsequent swap. The pool persists across restarts
	// via the SwapStore (zapdb in prod, in-memory in dev).
	//
	// Bootstrap is synchronous on startup — minting a fresh wallet
	// is a ~10s MPC operation, so a pool of 10 takes ~100s at first
	// boot. Subsequent restarts reuse the same wallets and Bootstrap
	// returns immediately. Pool size 0 disables the pool entirely.
	var releasePool *ReleasePool
	if poolStore, ok := swapStore.(ReleasePoolStore); ok && *releasePoolSize > 0 {
		thresholdWei := new(big.Int)
		if _, parseOK := thresholdWei.SetString(*releaseBalanceThresholdWei, 10); !parseOK {
			logger.Error("invalid --release-balance-threshold-wei",
				"value", *releaseBalanceThresholdWei,
			)
			os.Exit(1)
		}
		releasePool = NewReleasePool(poolStore, *releasePoolMintNetwork, logger)
		if thresholdWei.Sign() > 0 {
			releasePool.BalanceThresholdWei = thresholdWei
			releasePool.Probe = balanceProbe
		}
		bootstrapCtx, bootstrapCancel := context.WithTimeout(context.Background(), 5*time.Minute)
		if err := releasePool.Bootstrap(bootstrapCtx, mchainClient, *releasePoolSize); err != nil {
			bootstrapCancel()
			logger.Error("release pool bootstrap failed", "err", err, "desired_size", *releasePoolSize)
			os.Exit(1)
		}
		bootstrapCancel()
		logger.Info("release pool ready",
			"size", releasePool.Size(),
			"mint_network", *releasePoolMintNetwork,
			"balance_threshold_wei", thresholdWei.String(),
		)
	} else if *releasePoolSize > 0 {
		logger.Warn("release pool requested but swap store does not implement ReleasePoolStore",
			"size_requested", *releasePoolSize,
		)
	}

	// BTC release pool. Same shape as the EVM pool but keyed on the
	// BTC family — wallets here are P2WPKH bech32, derived locally
	// from the keygen's ECDSAPubKey. Optional — set
	// --btc-release-pool-size > 0 to enable.
	var btcReleasePool *ReleasePool
	var btcMempoolClient *txassembler.MempoolSpaceClient
	if *btcReleasePoolSize > 0 {
		btcMempoolClient = &txassembler.MempoolSpaceClient{
			MainnetURL: *btcMempoolMainnetURL,
			TestnetURL: *btcMempoolTestnetURL,
			Timeout:    10 * time.Second,
		}
		if poolStore, ok := swapStore.(ReleasePoolStore); ok && mchainClient != nil {
			btcReleasePool = NewReleasePoolForFamily(poolStore, FamilyBTC, *btcReleasePoolMintNetwork, logger)
			if *btcReleaseBalanceThresholdSat > 0 {
				btcReleasePool.BalanceThresholdWei = big.NewInt(*btcReleaseBalanceThresholdSat)
				btcReleasePool.Probe = &BTCBalanceProbeFn{
					Network: *btcReleasePoolMintNetwork,
					Fn: func(ctx context.Context, addr string) (int64, error) {
						return btcMempoolClient.BalanceSat(ctx,
							btcNetworkFromInternalName(*btcReleasePoolMintNetwork), addr)
					},
				}
			}
			bootstrapCtx, bootstrapCancel := context.WithTimeout(context.Background(), 5*time.Minute)
			if err := btcReleasePool.Bootstrap(bootstrapCtx, mchainClient, *btcReleasePoolSize); err != nil {
				bootstrapCancel()
				logger.Error("BTC release pool bootstrap failed", "err", err, "desired_size", *btcReleasePoolSize)
				os.Exit(1)
			}
			bootstrapCancel()
			logger.Info("BTC release pool ready",
				"size", btcReleasePool.Size(),
				"mint_network", *btcReleasePoolMintNetwork,
				"balance_threshold_sat", *btcReleaseBalanceThresholdSat,
			)
		} else {
			logger.Warn("BTC release pool requested but store/mchain unconfigured",
				"size_requested", *btcReleasePoolSize,
				"have_store", swapStore != nil,
				"have_mchain", mchainClient != nil,
			)
		}
	}

	// BTC tx assembler — built unconditionally when BTC release pool
	// is configured, since the signing driver dispatches by family.
	var btcAssembler *txassembler.BTCAssembler
	if btcReleasePool != nil && btcMempoolClient != nil {
		btcAssembler = txassembler.NewBTCAssembler(
			btcNetworkFromInternalName(*btcReleasePoolMintNetwork),
			btcMempoolClient,
			btcMempoolClient,
		)
	}

	// Signing driver: background goroutine that drives swaps in
	// bridge_transfer_pending through MPC threshold signing. Requires
	// an mchain client; without one the driver has nothing to call.
	var signer *SigningDriver
	signerCtx, signerCancel := context.WithCancel(context.Background())
	if !*disableSigningDriver && mchainClient != nil {
		signer = NewSigningDriver(swapStore, mchainClient, *signingInterval, logger)
		signer.SetAssembler(asm) // produces wire-correct EVM txs
		if releasePool != nil && releasePool.Size() > 0 {
			signer.SetReleasePool(releasePool)
		}
		if !*disableGasPrecheck {
			signer.SetGasProbe(balanceProbe)
		}
		if btcReleasePool != nil && btcReleasePool.Size() > 0 {
			signer.SetBTCReleasePool(btcReleasePool)
		}
		if btcAssembler != nil {
			signer.SetBTCAssembler(btcAssembler)
		}
		if btcMempoolClient != nil && !*disableGasPrecheck {
			signer.SetBTCBalanceProbe(btcMempoolClient)
		}
		go func() {
			_ = signer.Run(signerCtx)
		}()
		logger.Info("signing driver started",
			"interval", *signingInterval,
			"assembler", "evm-eip155",
			"release_pool", releasePool != nil && releasePool.Size() > 0,
			"btc_release_pool", btcReleasePool != nil && btcReleasePool.Size() > 0,
			"btc_assembler", btcAssembler != nil,
			"gas_precheck", !*disableGasPrecheck,
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
	if !*disableRefundDriver && mchainClient != nil {
		refundDriver = NewRefundDriver(
			swapStore,
			mchainClient,
			bcastClient,
			asm,
			*refundInterval,
			*refundAfter,
			overrides,
			logger,
		)
		go func() {
			_ = refundDriver.Run(refundCtx)
		}()
		logger.Info("refund driver started",
			"interval", *refundInterval,
			"refund_after", *refundAfter,
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
			"mpc_keygen":              *mpcURL != "",
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
		if releasePool != nil {
			body["release_pool"] = map[string]any{
				"size":                  releasePool.Size(),
				"mint_network":          *releasePoolMintNetwork,
				"balance_threshold_wei": *releaseBalanceThresholdWei,
			}
		}
		if btcReleasePool != nil {
			body["btc_release_pool"] = map[string]any{
				"size":                  btcReleasePool.Size(),
				"mint_network":          *btcReleasePoolMintNetwork,
				"balance_threshold_sat": *btcReleaseBalanceThresholdSat,
				"assembler":             btcAssembler != nil,
			}
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

// envOrInt parses an int env var with a fallback. Useful for sizes
// (e.g. --release-pool-size) where 0 is a meaningful value (disabled)
// so we don't want to use envOr-with-strconv-Atoi inline.
func envOrInt(k string, fallback int) int {
	v := os.Getenv(k)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}

// envOrInt64 is envOrInt for int64. Used for BTC sat values that
// exceed the 32-bit range on common amounts (1 BTC = 1e8 sat fits,
// but multi-BTC reserve thresholds need int64).
func envOrInt64(k string, fallback int64) int64 {
	v := os.Getenv(k)
	if v == "" {
		return fallback
	}
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil {
		return fallback
	}
	return n
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
