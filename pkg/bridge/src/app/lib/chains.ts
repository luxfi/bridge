// Supported chain registry for the inlined bridge UI.
//
// The static fallback set (`DEFAULT_CHAINS`) is now DERIVED from
// @luxwallet/chains — the canonical, native-shared chain registry — via
// `buildDefaultChains()` in ./registry. The bridge backend still resolves the
// full env-specific set from the API host at runtime (see useNetworks); this
// is the pre-API / fallback list, kept consistent with the registry so the
// selector never shows a chain the ecosystem doesn't define.
//
// Permissionless-by-design: chains are referenced by namespaced ID
// (`evm:1`, `lux:96369`) — no central authority maps names to chain IDs
// and any consumer can extend the list at the SDK boundary.
//
// registry.ts imports only TYPES from this module (`Chain`, `ChainFamily`),
// so the cycle is erased at compile time and resolves cleanly at runtime
// (chains.ts → registry.ts init, one direction — registry never reads a
// runtime value from chains.ts).
import { buildDefaultChains } from './registry'

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

// Derived from @luxwallet/chains — see ./registry. The registry is the source
// of WHICH chains exist; the bridge owns only the id/family/internalName
// projection. This now covers all six connectable ecosystems (EVM/Lux,
// Solana, Bitcoin, TON, XRP, Polkadot) so the selector and the wallet-connect
// flow agree on exactly the bridge-supported set.
export const DEFAULT_CHAINS: Chain[] = buildDefaultChains()

export function findChain(chains: Chain[], id: string): Chain | undefined {
  return chains.find((c) => c.id === id)
}
