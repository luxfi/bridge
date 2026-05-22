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
  base,
  mainnet,
  optimism,
  polygon,
} from 'viem/chains'
import type { Chain as ViemChain } from 'viem/chains'
import { createConfig, http, type Config, type CreateConnectorFn } from 'wagmi'
import { coinbaseWallet, injected, walletConnect } from 'wagmi/connectors'

import type { BridgeConfig } from '../../types'

/**
 * EVM chains the bridge can talk to out of the box.
 *
 * Tenants narrow this via `BridgeConfig.wallet.supportedChainIds`; chains
 * outside the allow-list are dropped from the wagmi config. Non-EVM chains
 * (Lux native, Solana, Bitcoin) don't appear here — they're signed via the
 * MPC threshold layer, not the user wallet.
 */
const ALL_EVM_CHAINS: ViemChain[] = [mainnet, arbitrum, base, polygon, optimism]

/** Lookup viem Chain by numeric chainId. */
export function viemChainById(chainId: number): ViemChain | undefined {
  return ALL_EVM_CHAINS.find((c) => c.id === chainId)
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

  // Filter to the tenant's allow-list when present; otherwise expose all.
  const chains = supported && supported.length > 0
    ? ALL_EVM_CHAINS.filter((c) => supported.includes(c.id))
    : ALL_EVM_CHAINS

  if (chains.length === 0) {
    // Defensive: if the tenant's allow-list excludes every supported chain,
    // fall back to mainnet so the wagmi createConfig() doesn't reject.
    chains.push(mainnet)
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
