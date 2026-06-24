// Bridge chain registry — derived from @luxwallet/chains.
//
// @luxwallet/chains is the canonical, native-shared (Kotlin/Swift via
// chains.json) source of truth for every Lux-ecosystem chain. This module is
// the ONE adapter that projects that registry into the bridge UI's `Chain`
// shape, so the source/destination selectors show exactly the chains the
// registry declares — no second hardcoded list to drift.
//
// Why an adapter at all (rather than consuming ChainEntry directly):
//   1. id format — the bridge uses stable namespaced ids (`evm:1`,
//      `svm:101`) that the MPC backend and `network-mapper` already key on;
//      the registry uses human ids (`ethereum`, `lux-c-mainnet`). We map.
//   2. family vocabulary — the registry's VM families (`utxo`/`platform`/
//      `zk`/`pqevm`/`solana`/...) are finer-grained than the bridge's signer
//      families (`evm`/`lux`/`svm`/`btc`/`ton`/`xrp`/`substrate`). We fold.
//   3. internalName — the backend's `/api/networks` enum (`ETHEREUM_MAINNET`)
//      is not in the registry; the bridge owns that mapping.
//
// The registry stays the source of WHICH chains exist + their metadata
// (name/symbol/decimals/evmChainId/testnet). The bridge owns only the
// projection. Adding a chain to @luxwallet/chains surfaces it here on the
// next install — provided it is in BRIDGE_SUPPORTED (the bridge backend must
// actually settle to it before it appears in the picker).

import { allChains, type ChainEntry } from '@luxwallet/chains'

import type { Chain, ChainFamily } from './chains'
import { CHAIN_LOGOS } from './logos'

/**
 * Registry ids the bridge actually settles to today. The bridge backend's
 * `/api/networks` is the runtime source of truth (see useNetworks); this set
 * is the *static fallback* shown before the API responds and when it fails.
 * Keep it to chains the backend currently quotes.
 */
const BRIDGE_SUPPORTED: ReadonlySet<string> = new Set([
  'lux-c-mainnet',
  'ethereum',
  'arbitrum',
  'base',
  'polygon',
  'optimism',
  'avalanche',
  'bitcoin',
  'solana',
  'ton',
  'xrp',
  'polkadot',
])

/** Fold a registry VM family into the bridge's signer-family vocabulary. */
function toBridgeFamily(entry: ChainEntry): ChainFamily {
  // Lux C-Chain is EVM but the bridge tags it `lux` for teleporter routing.
  if (entry.id === 'lux-c-mainnet' || entry.id === 'lux-c-testnet') return 'lux'
  switch (entry.family) {
    case 'evm':
    case 'pqevm': // Q-Chain — EVM-compatible signer model
      return 'evm'
    case 'solana':
      return 'svm'
    case 'ton':
      return 'ton'
    case 'xrp':
      return 'xrp'
    case 'substrate':
      return 'substrate'
    case 'utxo':
      // Bitcoin (utxo) → btc. Lux X-Chain is also utxo but not bridge-listed,
      // so it never reaches here via BRIDGE_SUPPORTED.
      return 'btc'
    case 'platform':
    case 'zk':
    default:
      // Not user-wallet-connectable in the bridge today; treat as evm so the
      // selector still renders. BRIDGE_SUPPORTED excludes these anyway.
      return 'evm'
  }
}

/**
 * Project a registry entry to the bridge's stable namespaced id. EVM chains
 * key on EIP-155 chainId (`evm:1`); non-EVM chains use their canonical
 * `<family>:mainnet` form so network-mapper's runtime ids line up.
 */
function toBridgeId(entry: ChainEntry, family: ChainFamily): string {
  if (entry.id === 'lux-c-mainnet') return 'lux:96369'
  if (family === 'evm' || family === 'lux') {
    return entry.evmChainId !== undefined ? `evm:${entry.evmChainId}` : entry.id
  }
  switch (family) {
    case 'svm':
      return 'svm:101'
    case 'btc':
      return 'btc:mainnet'
    case 'ton':
      return 'ton:mainnet'
    case 'xrp':
      return 'xrp:mainnet'
    case 'substrate':
      return 'polkadot:mainnet'
    default:
      return entry.id
  }
}

/**
 * Backend `internal_name` for a bridge id. The `/api/networks` response keys
 * on this; the static fallback must match so a selection survives the API
 * resolving (network-mapper.deriveChainId mirrors this).
 */
const INTERNAL_NAME: Record<string, string> = {
  'lux:96369': 'LUX_MAINNET',
  'evm:1': 'ETHEREUM_MAINNET',
  'evm:42161': 'ARBITRUM_MAINNET',
  'evm:8453': 'BASE_MAINNET',
  'evm:137': 'POLYGON_MAINNET',
  'evm:10': 'OPTIMISM_MAINNET',
  'evm:43114': 'AVALANCHE_MAINNET',
  'btc:mainnet': 'BITCOIN_MAINNET',
  'svm:101': 'SOLANA_MAINNET',
  'ton:mainnet': 'TON_MAINNET',
  'xrp:mainnet': 'XRP_MAINNET',
  'polkadot:mainnet': 'POLKADOT_MAINNET',
}

/** Convert one registry entry to a bridge Chain. */
function toBridgeChain(entry: ChainEntry): Chain {
  const family = toBridgeFamily(entry)
  const id = toBridgeId(entry, family)
  const logoUrl = CHAIN_LOGOS[id]
  return {
    id,
    internalName: INTERNAL_NAME[id] ?? entry.id.toUpperCase().replace(/-/g, '_'),
    name: entry.name,
    symbol: entry.nativeAsset.symbol,
    decimals: entry.nativeAsset.decimals,
    family,
    isTestnet: entry.testnet,
    isFeatured: true,
    ...(entry.evmChainId !== undefined ? { evmChainId: entry.evmChainId } : {}),
    ...(logoUrl ? { logoUrl } : {}),
  }
}

/**
 * The bridge's static chain set, derived from @luxwallet/chains. Built once at
 * module load. Mainnet only — the API (useNetworks) serves the env-specific
 * set at runtime; this is the pre-API fallback.
 *
 * Ordered: Lux first (featured home chain), then the rest in registry order.
 */
export function buildDefaultChains(): Chain[] {
  const chains = allChains()
    .filter((c) => c.mainnet && BRIDGE_SUPPORTED.has(c.id))
    .map(toBridgeChain)

  // Lux first.
  chains.sort((a, b) => {
    if (a.family === 'lux') return -1
    if (b.family === 'lux') return 1
    return 0
  })
  return chains
}
