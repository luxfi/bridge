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
	"flag"
	"fmt"
	"os"
	"os/signal"
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
		logger.Info("mpc keygen enabled",
			"api_url", mchainClient.APIURL,
			"org_id", mchainClient.OrgID,
			"auth", map[string]bool{"with_token": token != ""},
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

	// Signing driver: background goroutine that drives swaps in
	// bridge_transfer_pending through MPC threshold signing. Requires
	// an mchain client; without one the driver has nothing to call.
	var signer *SigningDriver
	signerCtx, signerCancel := context.WithCancel(context.Background())
	if !*disableSigningDriver && mchainClient != nil {
		signer = NewSigningDriver(swapStore, mchainClient, *signingInterval, logger)
		signer.SetAssembler(asm) // produces wire-correct EVM txs
		go func() {
			_ = signer.Run(signerCtx)
		}()
		logger.Info("signing driver started",
			"interval", *signingInterval,
			"assembler", "evm-eip155",
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
