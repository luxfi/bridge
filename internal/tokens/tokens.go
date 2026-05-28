// Package tokens is the per-(network, asset) token registry.
//
// Bridges have to know two things about each asset on each chain:
//   1. The on-chain contract address (or "" for native gas tokens).
//   2. The decimal place — wei-scaling for native tokens (18 for EVM),
//      base-unit scaling for ERC-20s (6 for USDC, 18 for DAI, etc.).
//
// Both `internal/depositcheck` (to decide eth_getBalance vs eth_call
// balanceOf) and `internal/txassembler` (to scale the human amount
// correctly when building destination txs) consume this registry.
//
// The defaults cover the most common bridged assets — USDC, USDT,
// DAI, WETH on Ethereum + Sepolia, USDC on Base/Polygon/BSC, native
// gas tokens on every supported chain. Operators extend via
// Register() for custom tokens (liquid Lux tokens, bespoke
// stablecoins, etc.).
package tokens

import (
	"fmt"
	"strings"
	"sync"
)

// Info describes one bridged asset on one chain.
//
// IsNative() is true when Contract == "" — that signals the
// chain's native gas token (ETH on Ethereum, LUX on Lux, BNB on BSC,
// etc.). Native tokens use eth_getBalance for detection and pure
// value transfers for release; ERC-20s use eth_call balanceOf and
// transfer() for release.
type Info struct {
	Network  string // internal_name e.g. ETHEREUM_SEPOLIA, LUX_TESTNET
	Asset    string // ticker e.g. ETH, USDC, LUX
	Contract string // 0x-prefixed hex for ERC-20; "" for native
	Decimals int    // 18 for ETH/LUX/DAI; 6 for USDC/USDT; 8 for BTC; 9 for SOL/TON
}

// IsNative reports whether this asset is the chain's native gas token.
func (i *Info) IsNative() bool { return i == nil || i.Contract == "" }

// =============================================================================
// Registry
// =============================================================================

// Registry is the thread-safe lookup table. Construct via NewRegistry
// (empty) or DefaultRegistry (pre-populated with common bridged assets).
type Registry struct {
	mu     sync.RWMutex
	tokens map[string]Info // key = "NETWORK|ASSET" — case-insensitive
}

// NewRegistry returns an empty registry.
func NewRegistry() *Registry { return &Registry{tokens: map[string]Info{}} }

// key normalizes the (network, asset) pair to a case-insensitive key.
func key(network, asset string) string {
	return strings.ToUpper(network) + "|" + strings.ToUpper(asset)
}

// Register inserts or replaces a token. Returns an error on
// malformed input. Safe for concurrent calls.
func (r *Registry) Register(info Info) error {
	if r == nil {
		return fmt.Errorf("tokens: Register on nil Registry")
	}
	if info.Network == "" || info.Asset == "" {
		return fmt.Errorf("tokens: Network and Asset required")
	}
	if info.Decimals < 0 || info.Decimals > 30 {
		return fmt.Errorf("tokens: Decimals must be 0..30, got %d", info.Decimals)
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.tokens[key(info.Network, info.Asset)] = info
	return nil
}

// Lookup returns the token info for (network, asset). Second return
// is false when the pair isn't registered.
func (r *Registry) Lookup(network, asset string) (*Info, bool) {
	if r == nil {
		return nil, false
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	info, ok := r.tokens[key(network, asset)]
	if !ok {
		return nil, false
	}
	return &info, true
}

// ForNetwork returns every registered asset on the given network.
// Order is undefined.
func (r *Registry) ForNetwork(network string) []Info {
	if r == nil {
		return nil
	}
	prefix := strings.ToUpper(network) + "|"
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]Info, 0)
	for k, v := range r.tokens {
		if strings.HasPrefix(k, prefix) {
			out = append(out, v)
		}
	}
	return out
}

// Size returns the number of registered tokens. Useful for /health
// + startup logging.
func (r *Registry) Size() int {
	if r == nil {
		return 0
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.tokens)
}

// =============================================================================
// Defaults — the seed registry main.go populates at boot
// =============================================================================

// DefaultRegistry returns a registry pre-populated with the most
// common bridged assets. Operators extend via Register() in main.go
// for custom tokens. Token contract addresses verified against:
//   - Circle's published USDC contracts (https://developers.circle.com/stablecoins/docs/usdc-on-test-networks)
//   - Etherscan-verified canonical contracts for USDT / DAI / WETH
//   - The TS SDK's pkg/settings/src/{mainnet,testnet}/networks.json
//     (cross-checked on the live API earlier in development).
func DefaultRegistry() *Registry {
	r := NewRegistry()
	for _, info := range defaultTokens {
		_ = r.Register(info)
	}
	return r
}

// defaultTokens — seed list. Keep alphabetically organized by network
// + asset within each chain so diffs stay readable.
var defaultTokens = []Info{
	// Ethereum Mainnet
	{Network: "ETHEREUM_MAINNET", Asset: "ETH", Decimals: 18},
	{Network: "ETHEREUM_MAINNET", Asset: "USDC", Contract: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", Decimals: 6},
	{Network: "ETHEREUM_MAINNET", Asset: "USDT", Contract: "0xdAC17F958D2ee523a2206206994597C13D831ec7", Decimals: 6},
	{Network: "ETHEREUM_MAINNET", Asset: "DAI", Contract: "0x6B175474E89094C44Da98b954EedeAC495271d0F", Decimals: 18},
	{Network: "ETHEREUM_MAINNET", Asset: "WETH", Contract: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", Decimals: 18},

	// Ethereum Sepolia — Circle's canonical testnet USDC + WETH9
	{Network: "ETHEREUM_SEPOLIA", Asset: "ETH", Decimals: 18},
	{Network: "ETHEREUM_SEPOLIA", Asset: "USDC", Contract: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", Decimals: 6},
	{Network: "ETHEREUM_SEPOLIA", Asset: "WETH", Contract: "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9", Decimals: 18},

	// Holesky
	{Network: "HOLESKY_TESTNET", Asset: "ETH", Decimals: 18},

	// Arbitrum Sepolia — Circle's canonical USDC testnet contract
	{Network: "ARBITRUM_SEPOLIA", Asset: "ETH", Decimals: 18},
	{Network: "ARBITRUM_SEPOLIA", Asset: "USDC", Contract: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d", Decimals: 6},

	// Optimism Sepolia — Circle's canonical USDC testnet contract
	{Network: "OPTIMISM_SEPOLIA", Asset: "ETH", Decimals: 18},
	{Network: "OPTIMISM_SEPOLIA", Asset: "USDC", Contract: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7", Decimals: 6},

	// Polygon Amoy — Circle's canonical USDC testnet contract. Native is POL
	// (Polygon's rebranded native token, ex-MATIC).
	{Network: "POLYGON_AMOY", Asset: "POL", Decimals: 18},
	{Network: "POLYGON_AMOY", Asset: "USDC", Contract: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582", Decimals: 6},

	// Avalanche Fuji — Circle's canonical USDC testnet contract.
	{Network: "AVALANCHE_FUJI", Asset: "AVAX", Decimals: 18},
	{Network: "AVALANCHE_FUJI", Asset: "USDC", Contract: "0x5425890298aed601595a70AB815c96711a31Bc65", Decimals: 6},

	// Lux — native only at v1; liquid tokens (LBTC, LETH, LUSD, etc.)
	// get added when the per-asset contract list firms up in pkg/settings.
	{Network: "LUX_MAINNET", Asset: "LUX", Decimals: 18},
	{Network: "LUX_TESTNET", Asset: "LUX", Decimals: 18},

	// Zoo — native only
	{Network: "ZOO_MAINNET", Asset: "ZOO", Decimals: 18},
	{Network: "ZOO_TESTNET", Asset: "ZOO", Decimals: 18},

	// Base — Circle's canonical USDC addresses
	{Network: "BASE_MAINNET", Asset: "ETH", Decimals: 18},
	{Network: "BASE_MAINNET", Asset: "USDC", Contract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", Decimals: 6},
	{Network: "BASE_SEPOLIA", Asset: "ETH", Decimals: 18},
	{Network: "BASE_SEPOLIA", Asset: "USDC", Contract: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", Decimals: 6},

	// BSC — note: USDC/USDT on BSC are 18 decimals, NOT 6 (BSC convention)
	{Network: "BSC_MAINNET", Asset: "BNB", Decimals: 18},
	{Network: "BSC_MAINNET", Asset: "USDC", Contract: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", Decimals: 18},
	{Network: "BSC_MAINNET", Asset: "USDT", Contract: "0x55d398326f99059fF775485246999027B3197955", Decimals: 18},
	{Network: "BSC_TESTNET", Asset: "BNB", Decimals: 18},

	// Polygon — native is MATIC; bridged USDC/USDT use 6 decimals here
	{Network: "POLYGON_MAINNET", Asset: "MATIC", Decimals: 18},
	{Network: "POLYGON_MAINNET", Asset: "USDC", Contract: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", Decimals: 6},
	{Network: "POLYGON_MAINNET", Asset: "USDT", Contract: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", Decimals: 6},

	// Arbitrum / Optimism / Avalanche — natives + bridged USDC
	{Network: "ARBITRUM_MAINNET", Asset: "ETH", Decimals: 18},
	{Network: "ARBITRUM_MAINNET", Asset: "USDC", Contract: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", Decimals: 6},
	{Network: "OPTIMISM_MAINNET", Asset: "ETH", Decimals: 18},
	{Network: "OPTIMISM_MAINNET", Asset: "USDC", Contract: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", Decimals: 6},
	{Network: "AVAX_MAINNET", Asset: "AVAX", Decimals: 18},
	{Network: "AVAX_MAINNET", Asset: "USDC", Contract: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", Decimals: 6},

	// Non-EVM natives (kept here for completeness even though
	// depositcheck only handles BTC/SOL/TON balance queries today —
	// having decimals registered means downstream code that scales
	// amounts can do so without hardcoded fallbacks).
	{Network: "BITCOIN_MAINNET", Asset: "BTC", Decimals: 8},
	{Network: "BITCOIN_TESTNET", Asset: "BTC", Decimals: 8},
	{Network: "SOLANA_MAINNET", Asset: "SOL", Decimals: 9},
	{Network: "SOLANA_DEVNET", Asset: "SOL", Decimals: 9},
	{Network: "TON_MAINNET", Asset: "TON", Decimals: 9},
	{Network: "TON_TESTNET", Asset: "TON", Decimals: 9},
	{Network: "XRP_MAINNET", Asset: "XRP", Decimals: 6},
	{Network: "XRP_TESTNET", Asset: "XRP", Decimals: 6},
}
