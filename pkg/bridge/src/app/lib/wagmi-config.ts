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

import {
  arbitrum,
  arbitrumSepolia,
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

/**
 * EVM chains the bridge can talk to out of the box, partitioned by env.
 *
 * `mainnet` env builds get production chains; `testnet` env builds get the
 * testnet/devnet equivalents. The bridge backend's `?version=testnet` filter
 * gates the chain registry server-side; wagmi must also be configured for
 * those chains or `switchChain(11155111)` rejects with "chain not configured."
 *
 * Tenants narrow either set via `BridgeConfig.wallet.supportedChainIds`;
 * chains outside the allow-list are dropped from the wagmi config. Non-EVM
 * chains (Lux native, Solana, Bitcoin) don't appear here — they're signed
 * via the MPC threshold layer, not the user wallet.
 */
const MAINNET_EVM_CHAINS: ViemChain[] = [mainnet, arbitrum, base, polygon, optimism, bsc]
const TESTNET_EVM_CHAINS: ViemChain[] = [
  sepolia,
  arbitrumSepolia,
  baseSepolia,
  optimismSepolia,
  polygonAmoy,
  holesky,
  bscTestnet,
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
 * numeric wagmi/viem chainId. Returns null for non-EVM chains — those are
 * not signed by the user wallet but by the MPC threshold layer.
 */
export function bridgeIdToWagmiChainId(bridgeId: string): number | null {
  const [family, idStr] = bridgeId.split(':')
  if (family !== 'evm') return null
  const n = Number(idStr)
  return Number.isFinite(n) ? n : null
}

/** Inverse of bridgeIdToWagmiChainId for EVM chains. */
export function wagmiChainIdToBridgeId(chainId: number): string {
  return `evm:${chainId}`
}
