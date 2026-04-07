// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

// teleport-watcher bridges deposit events from any registered source chain
// to the Teleporter contract on Lux C-Chain.
//
// Supports 30+ chains via plugin architecture:
//   - EVM chains (Ethereum, Base, Arbitrum, etc.) use the generic EVMPlugin
//   - Non-EVM chains (OP_NET, Solana, TON, Sui, etc.) use dedicated plugins
//
// Usage:
//
//	teleport-watcher --chain=opnet    --source-rpc=... --source-addr=... ...
//	teleport-watcher --chain=ethereum --source-rpc=... --source-addr=... ...
//	teleport-watcher --chain=solana   --source-rpc=... --source-addr=... ...
//
// It watches the source-chain bridge contract for deposit events, signs proofs,
// and submits them to Teleporter.mintDeposit on Lux. It also periodically
// attests the total backing locked on the source chain.
package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/luxfi/bridge/opnet-watcher/plugins"
	"github.com/luxfi/crypto/threshold"
)

func main() {
	cfg := DefaultConfig()

	var (
		chainName string
		tenantDir string
		chainDir  string
		apiAddr   string
	)
	flag.StringVar(&chainName, "chain", "opnet", "Source chain plugin")
	flag.StringVar(&tenantDir, "tenant-dir", envOrDefault("BRIDGE_TENANT_DIR", ""), "Directory containing tenant manifests")
	flag.StringVar(&chainDir, "chain-dir", envOrDefault("BRIDGE_CHAIN_DIR", ""), "Directory containing chain manifests")
	flag.StringVar(&apiAddr, "api-addr", ":8090", "Listen address for the tenant API server")
	flag.StringVar(&cfg.SourceRPCURL, "source-rpc", "", "Source chain RPC/API URL")
	flag.StringVar(&cfg.LuxRPCURL, "lux-rpc", cfg.LuxRPCURL, "Lux C-Chain JSON-RPC URL")
	flag.StringVar(&cfg.TeleporterAddr, "teleporter-addr", "", "Teleporter contract address (0x-prefixed)")
	flag.StringVar(&cfg.SourceBridgeAddr, "source-addr", "", "Source chain bridge contract/program address")
	flag.StringVar(&cfg.SignerKeyPath, "signer-key-path", "", "Path to hex-encoded signer private key")
	flag.StringVar(&cfg.TxKeyPath, "tx-key-path", "", "Path to hex-encoded tx hot wallet key (required with --threshold)")
	flag.DurationVar(&cfg.BlockPollInterval, "poll-interval", cfg.BlockPollInterval, "Block poll interval")
	flag.DurationVar(&cfg.BackingInterval, "backing-interval", cfg.BackingInterval, "Backing attestation interval")
	flag.Uint64Var(&cfg.StartBlock, "start-block", 0, "Block/slot height to start indexing from (0 = latest)")
	flag.Uint64Var(&cfg.ConfirmationDepth, "confirmation-depth", cfg.ConfirmationDepth, "Required block confirmations before processing (default 6)")
	flag.BoolVar(&cfg.Threshold, "threshold", false, "Use threshold signing (CGGMP21) — required for production")
	flag.StringVar(&cfg.KMSEndpoint, "kms-endpoint", "", "KMS endpoint for key share retrieval (required with --threshold)")
	flag.StringVar(&cfg.KMSKeyPath, "kms-key-path", "", "KMS secret path for key share (required with --threshold)")
	flag.Uint64Var(&cfg.MaxBackingChangePct, "max-backing-change-pct", cfg.MaxBackingChangePct, "Max backing change per attestation in percent (default 100)")
	flag.Uint64Var(&cfg.LuxChainIDOverride, "lux-chain-id", cfg.LuxChainIDOverride, "Lux C-Chain ID for EIP-155 signing")
	flag.StringVar(&cfg.SolanaVaultAddr, "solana-vault-addr", "", "Solana bridge config PDA address (required with --chain=solana)")
	flag.StringVar(&cfg.CheckpointPath, "checkpoint-path", cfg.CheckpointPath, "Path to checkpoint file for deposit deduplication")

	// Legacy OP_NET flags (backwards compatibility).
	flag.StringVar(&cfg.SourceRPCURL, "opnet-rpc", "", "OP_NET node JSON-RPC URL (legacy, use --source-rpc)")
	flag.StringVar(&cfg.SourceBridgeAddr, "opnet-bridge-addr", "", "OP_NET bridge address (legacy, use --source-addr)")

	flag.Parse()

	if err := cfg.Validate(); err != nil {
		log.Fatalf("invalid config: %v", err)
	}

	// Select chain plugin.
	plugin := selectPlugin(chainName, cfg)

	var signer *Signer
	var txSigner *Signer // Hot wallet for tx submission
	if cfg.Threshold {
		shareBytes, groupKeyBytes, err := LoadKeyShareFromKMS(cfg.KMSEndpoint, cfg.KMSKeyPath)
		if err != nil {
			log.Fatalf("load key share from KMS: %v", err)
		}
		signer, err = NewThresholdSigner(threshold.SchemeCMP, shareBytes, groupKeyBytes)
		if err != nil {
			log.Fatalf("create threshold signer: %v", err)
		}
		// NEW-02: Threshold mode requires a separate hot wallet for tx submission.
		txKeyBytes, err := LoadSignerKey(cfg.TxKeyPath)
		if err != nil {
			log.Fatalf("load tx key: %v (--tx-key-path required with --threshold)", err)
		}
		txSigner, err = NewSigner(txKeyBytes)
		if err != nil {
			log.Fatalf("create tx signer: %v", err)
		}
		log.Printf("chain=%s chain_id=%d signer=0x%x tx=0x%x mode=threshold",
			plugin.Name(), plugin.ChainID(), signer.Address(), txSigner.Address())
	} else {
		log.Println("WARNING: running in single-key mode — DEVELOPMENT ONLY, not safe for production")
		keyBytes, err := LoadSignerKey(cfg.SignerKeyPath)
		if err != nil {
			log.Fatalf("load signer key: %v", err)
		}
		signer, err = NewSigner(keyBytes)
		if err != nil {
			log.Fatalf("create signer: %v", err)
		}
		txSigner = signer // Single-key mode: same key for proofs and txs
		log.Printf("chain=%s chain_id=%d signer=0x%x mode=single-key-DEV-ONLY", plugin.Name(), plugin.ChainID(), signer.Address())
	}

	relay := NewRelay(cfg.LuxRPCURL, cfg.TeleporterAddr, signer, txSigner, cfg.LuxChainIDOverride)
	watcher := NewWatcher(cfg, plugin, signer, relay)

	// Graceful shutdown on SIGINT/SIGTERM.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		sig := <-sigCh
		log.Printf("received signal %v, shutting down", sig)
		cancel()
	}()

	// Start tenant API server if manifests are configured.
	if tenantDir != "" && chainDir != "" {
		registry := NewTenantRegistry(chainDir)
		if err := registry.Load(tenantDir); err != nil {
			log.Fatalf("load tenant manifests: %v", err)
		}
		for _, t := range registry.AllTenants() {
			log.Printf("tenant: id=%s home=%d hosts=%v chains=%d",
				t.ID, t.HomeChainID, t.Hostnames, len(t.SupportedChains))
		}
		api := NewAPI(registry)
		srv := &http.Server{Addr: apiAddr, Handler: api}
		go func() {
			log.Printf("api: listening on %s", apiAddr)
			if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				log.Fatalf("api server: %v", err)
			}
		}()
		go func() {
			<-ctx.Done()
			shutCtx, shutCancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer shutCancel()
			_ = srv.Shutdown(shutCtx)
		}()
	}

	if err := watcher.Run(ctx); err != nil && err != context.Canceled {
		log.Fatalf("watcher exited with error: %v", err)
	}

	// Give goroutines a moment to drain.
	time.Sleep(100 * time.Millisecond)
	log.Printf("teleport-watcher stopped (chain=%s)", plugin.Name())
}

func envOrDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// evmChains maps chain names to their Teleporter chain IDs.
// All use the generic EVMPlugin (eth_getLogs + eth_call).
var evmChains = map[string]uint64{
	"ethereum":    1,
	"base":        8453,
	"avalanche":   43114,
	"arbitrum":    42161,
	"optimism":    10,
	"polygon":     137,
	"bsc":         56,
	"tron":        728126,
	"hyperliquid": 999,
	"filecoin":    314,
	"lux-c":       96369,
	"lux-zoo":     200200,
	"lux-hanzo":   36963,
	"lux-pars":    494949,
	"lux-spc":     36911,
}

func selectPlugin(name string, cfg Config) plugins.ChainPlugin {
	// EVM chains — generic plugin.
	if chainID, ok := evmChains[name]; ok {
		return plugins.NewEVMPlugin(name, chainID, cfg.SourceRPCURL, cfg.SourceBridgeAddr)
	}

	// Non-EVM chains — dedicated plugins.
	switch name {
	case "opnet":
		return plugins.NewOPNETPlugin(cfg.SourceRPCURL, cfg.SourceBridgeAddr)
	case "solana":
		return plugins.NewSolanaPlugin(cfg.SourceRPCURL, cfg.SourceBridgeAddr, cfg.SolanaVaultAddr)
	case "ton":
		return plugins.NewTONPlugin(cfg.SourceRPCURL, cfg.SourceBridgeAddr)
	case "sui":
		return plugins.NewSuiPlugin(cfg.SourceRPCURL, cfg.SourceBridgeAddr)
	case "near":
		return plugins.NewNEARPlugin(cfg.SourceRPCURL, cfg.SourceBridgeAddr)
	case "cosmos":
		return plugins.NewCosmosPlugin(cfg.SourceRPCURL, cfg.SourceBridgeAddr)
	case "xrpl":
		return plugins.NewXRPLPlugin(cfg.SourceRPCURL, cfg.SourceBridgeAddr)
	case "stellar":
		return plugins.NewStellarPlugin(cfg.SourceRPCURL, cfg.SourceBridgeAddr)
	case "cardano":
		return plugins.NewCardanoPlugin(cfg.SourceRPCURL, cfg.SourceBridgeAddr, envOrDefault("CHAIN_API_KEY", ""))
	case "algorand":
		return plugins.NewAlgorandPlugin(cfg.SourceRPCURL, cfg.SourceBridgeAddr, envOrDefault("CHAIN_API_KEY", ""))
	case "icp":
		return plugins.NewICPPlugin(cfg.SourceRPCURL, cfg.SourceBridgeAddr)
	case "polkadot":
		return plugins.NewPolkadotPlugin(cfg.SourceRPCURL, cfg.SourceBridgeAddr)
	case "aptos":
		return plugins.NewAptosPlugin(cfg.SourceRPCURL, cfg.SourceBridgeAddr)
	case "starknet":
		return plugins.NewStarkNetPlugin(cfg.SourceRPCURL, cfg.SourceBridgeAddr)
	case "stacks":
		return plugins.NewStacksPlugin(cfg.SourceRPCURL, cfg.SourceBridgeAddr)
	case "fuel":
		return plugins.NewFuelPlugin(cfg.SourceRPCURL, cfg.SourceBridgeAddr)
	case "tezos":
		return plugins.NewTezosPlugin(cfg.SourceRPCURL, cfg.SourceBridgeAddr)
	case "lux":
		return plugins.NewLuxPlugin(cfg.SourceRPCURL, cfg.SourceBridgeAddr)
	default:
		log.Fatalf("unknown chain: %s", name)
		return nil
	}
}
