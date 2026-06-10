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

// Lux Local — full-stack sandbox network for local development.
// Avalanche-style primary network (P-Chain) is chain id 1337; the C-Chain
// EVM is 31337. Bridge swaps only ever touch the C-Chain side, so the
// wagmi config exposes 31337. RPC defaults to a vanilla local node
// listening on the standard avalanchego port; operators with a non-
// default port override via their own wagmi Config.
export const luxLocal = defineChain({
  id: 31337,
  name: 'Lux Local',
  nativeCurrency: { decimals: 18, name: 'Lux', symbol: 'LUX' },
  rpcUrls: { default: { http: ['http://localhost:9650/ext/bc/C/rpc'] } },
  testnet: true,
})

// Zoo chains — EVM subnets in the Lux network family (no viem/chains
// entry, same as Lux). Unlike Lux they carry plain family='evm' in the
// chain registry, so no teleporter special-casing — wagmi treats them
// like any other EVM chain. RPCs match the public Zoo gateways; the
// transport override below routes browsers through the bridge's
// same-origin /api/rpc/zoo-* proxy (same CORS posture as the Lux
// gateway).
export const zooMainnet = defineChain({
  id: 200200,
  name: 'Zoo',
  nativeCurrency: { decimals: 18, name: 'Zoo', symbol: 'ZOO' },
  rpcUrls: { default: { http: ['https://api.zoo.network/ext/bc/Z/rpc'] } },
  blockExplorers: {
    default: { name: 'Zoo Explorer', url: 'https://explore.zoo.network' },
  },
})

export const zooTestnet = defineChain({
  id: 200201,
  name: 'Zoo Testnet',
  nativeCurrency: { decimals: 18, name: 'Zoo', symbol: 'ZOO' },
  rpcUrls: { default: { http: ['https://api.zoo-test.network/ext/bc/Z/rpc'] } },
  blockExplorers: {
    default: { name: 'Zoo Testnet Explorer', url: 'https://explore.zoo-test.network' },
  },
  testnet: true,
})

// Zoo Local — local devnet sandbox for ZOO development. Same pattern
// as luxLocal but a distinct EVM chain id so a single local Lux node
// can host both subnets without ambiguity.
export const zooLocal = defineChain({
  id: 200203,
  name: 'Zoo Local',
  nativeCurrency: { decimals: 18, name: 'Zoo', symbol: 'ZOO' },
  rpcUrls: { default: { http: ['http://localhost:9650/ext/bc/C/rpc'] } },
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
  zooMainnet,
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
  zooTestnet,
  arbitrumSepolia,
  baseSepolia,
  optimismSepolia,
  polygonAmoy,
  holesky,
  bscTestnet,
  avalancheFuji,
]

// Local-env chains for full-stack sandbox testing against a local Lux
// node. Kept SEPARATE from TESTNET_EVM_CHAINS so a developer running
// `BRIDGE_ENV=local` doesn't see the public testnet chains they can't
// actually use, and so a tenant who locks supportedChainIds to local
// IDs doesn't accidentally enable a stray testnet at the same time.
const LOCAL_EVM_CHAINS: ViemChain[] = [
  luxLocal,
  zooLocal,
]

/**
 * EVM chains for a given env.
 *
 *   - `testnet` / `devnet` → TESTNET set (Sepolia + Lux Testnet etc.)
 *   - `local`              → LOCAL set (Lux Local 31337, Zoo Local 200203)
 *   - anything else        → MAINNET set
 *
 * `local` is intentionally distinct from testnet/devnet because the
 * local sandbox runs against a developer's own avalanchego instance
 * on localhost — pulling in public testnet chains would confuse the
 * picker with networks the local bridge can't actually serve.
 */
function chainsForEnv(env: string): ViemChain[] {
  if (env === 'local') return LOCAL_EVM_CHAINS
  if (env === 'testnet' || env === 'devnet') return TESTNET_EVM_CHAINS
  return MAINNET_EVM_CHAINS
}

/** Back-compat export — defaults to the mainnet set. */
const ALL_EVM_CHAINS: ViemChain[] = MAINNET_EVM_CHAINS

/** Lookup viem Chain by numeric chainId across mainnet + testnet + local sets. */
export function viemChainById(chainId: number): ViemChain | undefined {
  return (
    MAINNET_EVM_CHAINS.find((c) => c.id === chainId) ??
    TESTNET_EVM_CHAINS.find((c) => c.id === chainId) ??
    LOCAL_EVM_CHAINS.find((c) => c.id === chainId)
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
    ? [...MAINNET_EVM_CHAINS, ...TESTNET_EVM_CHAINS, ...LOCAL_EVM_CHAINS].filter((c) =>
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

  // Transports: most chains use viem's public HTTP. Several overrides:
  //
  //  1. Lux + Zoo chains route through the bridge backend's same-origin
  //     /api/rpc/{lux,zoo}-{mainnet,testnet} proxies because the
  //     upstream gateways' CORS allow-lists don't include bridge.*
  //     origins — the browser would block every response and
  //     useBalance() would stall on '…' forever. The proxy makes the
  //     call server-side (no CORS) and forwards the response unchanged.
  //
  //  2. Holesky's viem default (ethereum-holesky-rpc.publicnode.com)
  //     returns HTTP 403 — endpoint is rate-limited / blocking. We
  //     override to holesky.drpc.org which returns 200 with
  //     `Access-Control-Allow-Origin: *`. Without this override,
  //     useBalance() stalls on `…` forever for any Holesky asset.
  //
  //  3. Ethereum mainnet's viem default (eth.merkle.io) responds with
  //     no Access-Control-Allow-Origin header AND 429s aggressively
  //     under any sustained load. publicnode is CORS-permissive and
  //     has generous rate limits — same provider used by depositcheck
  //     server-side.
  //
  //  4. Sepolia's viem default (rpc.sepolia.org) has the same CORS
  //     problem. publicnode mirror works.
  //
  // Tenants with their own RPC endpoints (Alchemy / Infura / Tenderly
  // keys) override at the wagmi layer by composing their own Config.
  const transportFor = (chainId: number): ReturnType<typeof http> => {
    if (chainId === luxMainnet.id) return http('/api/rpc/lux-mainnet')
    if (chainId === luxTestnet.id) return http('/api/rpc/lux-testnet')
    if (chainId === zooMainnet.id) return http('/api/rpc/zoo-mainnet')
    if (chainId === zooTestnet.id) return http('/api/rpc/zoo-testnet')
    if (chainId === luxLocal.id) return http('http://localhost:9650/ext/bc/C/rpc')
    if (chainId === zooLocal.id) return http('http://localhost:9650/ext/bc/C/rpc')
    if (chainId === holesky.id) return http('https://holesky.drpc.org')
    if (chainId === mainnet.id) return http('https://ethereum-rpc.publicnode.com')
    if (chainId === sepolia.id) return http('https://ethereum-sepolia-rpc.publicnode.com')
    return http()
  }
  const transports = Object.fromEntries(
    chains.map((c) => [c.id, transportFor(c.id)]),
  ) as Record<number, ReturnType<typeof http>>

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
