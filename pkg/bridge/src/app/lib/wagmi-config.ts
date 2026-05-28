// Wagmi config builder for the inlined bridge UI.
//
// The bridge SDK owns its own wagmi Config so the SDK works inside any host —
// host React tree, mountBridge into a bare DOM node, or a tenant app that
// already has its own wagmi context. Nesting wagmi providers is supported in
// wagmi 2.x; each provider maintains an independent connector/account state.
//
// The connector set is intentionally minimal: injected (MetaMask, Rabby, etc.)
// + Coinbase Wallet + optional WalletConnect. Tenants supply their WC
// projectId via `BridgeConfig.wallet.walletConnectProjectId`; without it the
// WalletConnect connector is omitted (no "Project ID Not Configured" 403 on
// the Reown API, no console spam).
//
// PQ note: wagmi handles classical EVM transport (HTTPS + secp256k1
// signatures). Post-quantum signing happens in the MPC threshold layer
// (`@luxfi/threshold`) — wagmi is plumbing for the *user* leg, MPC is
// plumbing for the *bridge* leg.

import { defineChain } from 'viem'
import {
  arbitrum,
  arbitrumSepolia,
  avalanche,
  avalancheFuji,
  base,
  baseSepolia,
  bsc,
  bscTestnet,
  holesky,
  mainnet,
  optimism,
  optimismSepolia,
  polygon,
  polygonAmoy,
  sepolia,
} from 'viem/chains'
import type { Chain as ViemChain } from 'viem/chains'
import { createConfig, http, type Config, type CreateConnectorFn } from 'wagmi'
import { coinbaseWallet, injected, walletConnect } from 'wagmi/connectors'

import type { BridgeConfig } from '../../types'

// Lux native chains are EVM-compatible (Avalanche C-Chain fork) so the user
// wallet leg uses the same wagmi / viem stack as any other EVM chain. Defined
// inline because viem/chains doesn't ship a Lux entry. RPCs match the Lux
// public endpoints; tenants can override with their own httpTransport.
export const luxMainnet = defineChain({
  id: 96369,
  name: 'Lux',
  nativeCurrency: { decimals: 18, name: 'Lux', symbol: 'LUX' },
  rpcUrls: { default: { http: ['https://api.lux.network/ext/bc/C/rpc'] } },
  blockExplorers: {
    default: { name: 'Lux Explorer', url: 'https://explore.lux.network' },
  },
})

export const luxTestnet = defineChain({
  id: 96368,
  name: 'Lux Testnet',
  nativeCurrency: { decimals: 18, name: 'Lux', symbol: 'LUX' },
  rpcUrls: { default: { http: ['https://api.lux-test.network/ext/bc/C/rpc'] } },
  blockExplorers: {
    default: { name: 'Lux Testnet Explorer', url: 'https://explore.lux-test.network' },
  },
  testnet: true,
})

/**
 * EVM chains the bridge can talk to out of the box, partitioned by env.
 *
 * `mainnet` env builds get production chains; `testnet` env builds get the
 * testnet/devnet equivalents. The bridge backend's `?version=testnet` filter
 * gates the chain registry server-side; wagmi must also be configured for
 * those chains or `switchChain(11155111)` rejects with "chain not configured."
 *
 * Tenants narrow either set via `BridgeConfig.wallet.supportedChainIds`;
 * chains outside the allow-list are dropped from the wagmi config. Lux
 * mainnet + testnet are present here because the user wallet signs the
 * deposit leg when Lux is the source chain (the destination leg uses MPC).
 * Non-EVM chains (Solana, Bitcoin, TON, XRP) don't appear here — both
 * legs of those route through the MPC threshold layer, not the user wallet.
 */
const MAINNET_EVM_CHAINS: ViemChain[] = [
  mainnet,
  luxMainnet,
  arbitrum,
  base,
  polygon,
  optimism,
  bsc,
  avalanche,
]
const TESTNET_EVM_CHAINS: ViemChain[] = [
  sepolia,
  luxTestnet,
  arbitrumSepolia,
  baseSepolia,
  optimismSepolia,
  polygonAmoy,
  holesky,
  bscTestnet,
  avalancheFuji,
]

/**
 * EVM chains for a given env. `testnet` and `devnet` both use the testnet
 * set (devnet currently rides Sepolia / Holesky for EVM legs too).
 */
function chainsForEnv(env: string): ViemChain[] {
  return env === 'testnet' || env === 'devnet'
    ? TESTNET_EVM_CHAINS
    : MAINNET_EVM_CHAINS
}

/** Back-compat export — defaults to the mainnet set. */
const ALL_EVM_CHAINS: ViemChain[] = MAINNET_EVM_CHAINS

/** Lookup viem Chain by numeric chainId across both mainnet + testnet sets. */
export function viemChainById(chainId: number): ViemChain | undefined {
  return (
    MAINNET_EVM_CHAINS.find((c) => c.id === chainId) ??
    TESTNET_EVM_CHAINS.find((c) => c.id === chainId)
  )
}

/**
 * Build a wagmi Config from the bridge SDK config.
 *
 * Pure function — called once per `BridgeApp` mount. The config is stable
 * for the lifetime of the SDK instance; supportedChainIds changes require
 * an unmount/remount cycle (same constraint wagmi imposes on its consumers).
 */
export function buildWagmiConfig(cfg: BridgeConfig): Config {
  const wallet = cfg.wallet
  const supported = wallet?.supportedChainIds
  const envChains = chainsForEnv(cfg.env)

  // Filter to the tenant's allow-list when present; otherwise expose all
  // chains appropriate for the current env. The allow-list may legitimately
  // span both sets (a tenant could allow [1, 11155111] to switch between
  // mainnet+sepolia for cross-env testing), so we filter the union.
  //
  // Crucially: always materialize a fresh array. The hoist step below uses
  // splice(), which would otherwise mutate the shared MAINNET_/TESTNET_EVM_CHAINS
  // constants and silently corrupt subsequent buildWagmiConfig() calls in
  // the same process (this hit the wagmi-config.test.ts suite when default-
  // chain hoisting reordered the shared array).
  const chains: ViemChain[] = supported && supported.length > 0
    ? [...MAINNET_EVM_CHAINS, ...TESTNET_EVM_CHAINS].filter((c) =>
        supported.includes(c.id),
      )
    : [...envChains]

  if (chains.length === 0) {
    // Defensive: if the tenant's allow-list excludes every supported chain,
    // fall back to env-appropriate chains[0] so wagmi createConfig() doesn't
    // reject. For testnet env that's sepolia; for mainnet env that's mainnet.
    const fallback = envChains[0] ?? mainnet
    chains.push(fallback)
  }

  // Order chains so wallet.defaultChainId (when provided + allowed) is first.
  // wagmi treats chains[0] as the default for the unconnected state.
  const defaultId = wallet?.defaultChainId
  if (defaultId) {
    const idx = chains.findIndex((c) => c.id === defaultId)
    if (idx > 0) {
      const [hoist] = chains.splice(idx, 1)
      if (hoist) chains.unshift(hoist)
    }
  }

  const wcProjectId = wallet?.walletConnectProjectId
  const brandName = cfg.brand?.name ?? 'Bridge'
  const brandIcon = cfg.brand?.logoUrl ? [cfg.brand.logoUrl] : []

  const connectors: CreateConnectorFn[] = [
    injected(),
    coinbaseWallet({
      appName: brandName,
      ...(cfg.brand?.logoUrl ? { appLogoUrl: cfg.brand.logoUrl } : {}),
    }),
    ...(wcProjectId
      ? [
          walletConnect({
            projectId: wcProjectId,
            metadata: {
              name: brandName,
              description: `${brandName} cross-chain bridge`,
              url: typeof window !== 'undefined' ? window.location.origin : 'https://bridge.lux.network',
              icons: brandIcon,
            },
            showQrModal: true,
          }),
        ]
      : []),
  ]

  // Transports: default to viem's public HTTP for each chain. Tenants that
  // need custom RPC endpoints will compose their own wagmi config and use
  // the underlying hooks directly (this builder targets the common case).
  const transports = Object.fromEntries(chains.map((c) => [c.id, http()])) as Record<number, ReturnType<typeof http>>

  return createConfig({
    chains: chains as [ViemChain, ...ViemChain[]],
    connectors,
    transports,
  })
}

/**
 * Map a bridge-internal chain ID (`evm:1`, `lux:96369`, `svm:101`) to the
 * numeric wagmi/viem chainId. Both `evm:` and `lux:` are EVM-signed by the
 * user wallet so both resolve to a wagmi chainId. Returns null for non-EVM
 * families (svm, btc, ton, xrp, …) which route through MPC instead.
 */
export function bridgeIdToWagmiChainId(bridgeId: string): number | null {
  const [family, idStr] = bridgeId.split(':')
  if (family !== 'evm' && family !== 'lux') return null
  const n = Number(idStr)
  return Number.isFinite(n) ? n : null
}

/** Inverse of bridgeIdToWagmiChainId for EVM chains. */
export function wagmiChainIdToBridgeId(chainId: number): string {
  return `evm:${chainId}`
}
