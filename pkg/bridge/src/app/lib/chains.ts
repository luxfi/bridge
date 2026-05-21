// Supported chain registry for the inlined bridge UI.
//
// This is a minimal static registry sufficient to wire the swap form. The
// real bridge backend resolves the full chain set from the API host at
// runtime — Phase 3 R2 swaps this for an API-driven `useChains()` hook.
//
// Permissionless-by-design: chains are referenced by namespaced ID
// (`evm:1`, `lux:96369`) — no central authority maps names to chain IDs
// and any consumer can extend the list at the SDK boundary.

export interface Chain {
  /** Stable namespaced ID, e.g. `evm:1` (Ethereum mainnet), `lux:96369`. */
  id: string
  /** Display name shown in the selector. */
  name: string
  /** Short symbol, e.g. `ETH`, `LUX`. */
  symbol: string
  /** Decimals for the native token. */
  decimals: number
  /** Chain family — drives signer + RPC adaptor selection. */
  family: 'evm' | 'lux' | 'svm' | 'btc'
  /** Optional human-readable description. */
  description?: string
}

export const DEFAULT_CHAINS: Chain[] = [
  {
    id: 'lux:96369',
    name: 'Lux Network',
    symbol: 'LUX',
    decimals: 18,
    family: 'lux',
    description: 'Lux primary network — leaderless Quasar consensus',
  },
  {
    id: 'evm:1',
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18,
    family: 'evm',
  },
  {
    id: 'evm:42161',
    name: 'Arbitrum One',
    symbol: 'ETH',
    decimals: 18,
    family: 'evm',
  },
  {
    id: 'evm:8453',
    name: 'Base',
    symbol: 'ETH',
    decimals: 18,
    family: 'evm',
  },
  {
    id: 'evm:137',
    name: 'Polygon',
    symbol: 'MATIC',
    decimals: 18,
    family: 'evm',
  },
  {
    id: 'evm:10',
    name: 'Optimism',
    symbol: 'ETH',
    decimals: 18,
    family: 'evm',
  },
  {
    id: 'svm:101',
    name: 'Solana',
    symbol: 'SOL',
    decimals: 9,
    family: 'svm',
  },
]

export function findChain(chains: Chain[], id: string): Chain | undefined {
  return chains.find((c) => c.id === id)
}
