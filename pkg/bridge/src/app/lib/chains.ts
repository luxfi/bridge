// Supported chain registry for the inlined bridge UI.
//
// This is a minimal static registry sufficient to wire the swap form. The
// real bridge backend resolves the full chain set from the API host at
// runtime — Phase 3 R2 swaps this for an API-driven `useChains()` hook.
//
// Permissionless-by-design: chains are referenced by namespaced ID
// (`evm:1`, `lux:96369`) — no central authority maps names to chain IDs
// and any consumer can extend the list at the SDK boundary.

import { CHAIN_LOGOS } from './logos'

/**
 * Chain family — drives signer adaptor selection (wagmi for evm/lux,
 * @luxfi/threshold for non-EVM) and is shown as secondary text in the
 * chain selector. `lux` is a sub-classification of `evm` (the Lux native
 * network is an EVM chain) but is kept distinct so teleporter-vs-vault
 * routing in `useTransfers` can branch on it without parsing internal_name.
 */
export type ChainFamily =
  | 'evm'
  | 'lux'
  | 'svm'
  | 'btc'
  | 'ton'
  | 'xrp'
  | 'cardano'
  | 'substrate'

export interface Chain {
  /**
   * Stable namespaced ID. Survives backend renames (the legacy
   * `CHAIN_ID_TO_INTERNAL_NAME` map is gone; `internalName` is now a field
   * on the chain).
   *
   * - EVM:     `evm:1`, `evm:42161`, ...
   * - Lux:     `lux:96369` (mainnet), `lux:96368` (testnet)
   * - Solana:  `svm:101` (mainnet-beta), `svm:devnet`
   * - Bitcoin: `btc:mainnet`, `btc:testnet`
   * - TON:     `ton:mainnet`, `ton:testnet`
   * - XRP:     `xrp:mainnet`, `xrp:testnet`
   * - Cardano: `cardano:mainnet`, `cardano:preview`
   * - Substrate (Polkadot): `polkadot:mainnet`, `polkadot:westend`
   */
  id: string
  /**
   * Server-side internal_name (`ETHEREUM_MAINNET`, `LUX_MAINNET`, ...). Used
   * verbatim in bridge-api / bridge-rpc calls — no lookup table needed.
   */
  internalName: string
  /** Display name shown in the selector. */
  name: string
  /** Short symbol, e.g. `ETH`, `LUX`. */
  symbol: string
  /** Decimals for the native token. */
  decimals: number
  /** Chain family — drives signer + RPC adaptor selection. */
  family: ChainFamily
  /** Numeric EVM chainId (for `evm` / `lux` families only). */
  evmChainId?: number
  /** True for testnet entries. UI filters by `cfg.env === 'testnet'`. */
  isTestnet?: boolean
  /** Featured-on-homepage hint from the backend. Optional. */
  isFeatured?: boolean
  /** Optional human-readable description. */
  description?: string
  /** Optional brand mark (data URL or http(s)). Falls back to first letter. */
  logoUrl?: string
}

export const DEFAULT_CHAINS: Chain[] = [
  {
    id: 'lux:96369',
    internalName: 'LUX_MAINNET',
    name: 'Lux Network',
    symbol: 'LUX',
    decimals: 18,
    family: 'lux',
    evmChainId: 96369,
    isTestnet: false,
    isFeatured: true,
    description: 'Lux primary network — leaderless Quasar consensus',
    logoUrl: CHAIN_LOGOS['lux:96369'],
  },
  {
    id: 'evm:1',
    internalName: 'ETHEREUM_MAINNET',
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18,
    family: 'evm',
    evmChainId: 1,
    isTestnet: false,
    isFeatured: true,
    logoUrl: CHAIN_LOGOS['evm:1'],
  },
  {
    id: 'evm:42161',
    internalName: 'ARBITRUM_MAINNET',
    name: 'Arbitrum One',
    symbol: 'ETH',
    decimals: 18,
    family: 'evm',
    evmChainId: 42161,
    isTestnet: false,
    isFeatured: true,
    logoUrl: CHAIN_LOGOS['evm:42161'],
  },
  {
    id: 'evm:8453',
    internalName: 'BASE_MAINNET',
    name: 'Base',
    symbol: 'ETH',
    decimals: 18,
    family: 'evm',
    evmChainId: 8453,
    isTestnet: false,
    isFeatured: true,
    logoUrl: CHAIN_LOGOS['evm:8453'],
  },
  {
    id: 'evm:137',
    internalName: 'POLYGON_MAINNET',
    name: 'Polygon',
    symbol: 'MATIC',
    decimals: 18,
    family: 'evm',
    evmChainId: 137,
    isTestnet: false,
    isFeatured: true,
    logoUrl: CHAIN_LOGOS['evm:137'],
  },
  {
    id: 'evm:10',
    internalName: 'OPTIMISM_MAINNET',
    name: 'Optimism',
    symbol: 'ETH',
    decimals: 18,
    family: 'evm',
    evmChainId: 10,
    isTestnet: false,
    isFeatured: true,
    logoUrl: CHAIN_LOGOS['evm:10'],
  },
  {
    id: 'svm:101',
    internalName: 'SOLANA_MAINNET',
    name: 'Solana',
    symbol: 'SOL',
    decimals: 9,
    family: 'svm',
    isTestnet: false,
    isFeatured: true,
    logoUrl: CHAIN_LOGOS['svm:101'],
  },
]

export function findChain(chains: Chain[], id: string): Chain | undefined {
  return chains.find((c) => c.id === id)
}
