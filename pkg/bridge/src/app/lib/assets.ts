// Supported asset registry for the inlined bridge UI.
//
// Like chains.ts, this is a minimal static set sufficient to render a real
// swap form. The real bridge resolves assets per-chain from the API host
// at runtime — Phase 3 R2 swaps this for `useAssets(chainId)`.
//
// PQ-safe note: asset symbols are surface-only labels. All signing is done
// by the SDK's MPC layer (Ringtail + ECDSA hybrid) — not by anything in
// this file. The asset list is data, not trust.

export interface Asset {
  /** Stable per-chain ID, e.g. `lux:96369:LUX`, `evm:1:USDC`. */
  id: string
  /** Display symbol. */
  symbol: string
  /** Long name shown in the selector list. */
  name: string
  /** ID of the chain this asset lives on (chains.ts → Chain.id). */
  chainId: string
  /** Decimals. */
  decimals: number
  /** Optional logo URL. */
  logoUrl?: string
}

export const DEFAULT_ASSETS: Asset[] = [
  // Lux native
  {
    id: 'lux:96369:LUX',
    symbol: 'LUX',
    name: 'Lux',
    chainId: 'lux:96369',
    decimals: 18,
  },
  // Ethereum
  { id: 'evm:1:ETH', symbol: 'ETH', name: 'Ether', chainId: 'evm:1', decimals: 18 },
  { id: 'evm:1:USDC', symbol: 'USDC', name: 'USD Coin', chainId: 'evm:1', decimals: 6 },
  { id: 'evm:1:USDT', symbol: 'USDT', name: 'Tether USD', chainId: 'evm:1', decimals: 6 },
  // Arbitrum
  { id: 'evm:42161:ETH', symbol: 'ETH', name: 'Ether', chainId: 'evm:42161', decimals: 18 },
  { id: 'evm:42161:USDC', symbol: 'USDC', name: 'USD Coin', chainId: 'evm:42161', decimals: 6 },
  // Base
  { id: 'evm:8453:ETH', symbol: 'ETH', name: 'Ether', chainId: 'evm:8453', decimals: 18 },
  { id: 'evm:8453:USDC', symbol: 'USDC', name: 'USD Coin', chainId: 'evm:8453', decimals: 6 },
  // Polygon
  { id: 'evm:137:MATIC', symbol: 'MATIC', name: 'Matic', chainId: 'evm:137', decimals: 18 },
  { id: 'evm:137:USDC', symbol: 'USDC', name: 'USD Coin', chainId: 'evm:137', decimals: 6 },
  // Optimism
  { id: 'evm:10:ETH', symbol: 'ETH', name: 'Ether', chainId: 'evm:10', decimals: 18 },
  { id: 'evm:10:USDC', symbol: 'USDC', name: 'USD Coin', chainId: 'evm:10', decimals: 6 },
  // Solana
  { id: 'svm:101:SOL', symbol: 'SOL', name: 'Solana', chainId: 'svm:101', decimals: 9 },
  { id: 'svm:101:USDC', symbol: 'USDC', name: 'USD Coin', chainId: 'svm:101', decimals: 6 },
]

export function assetsForChain(assets: Asset[], chainId: string): Asset[] {
  return assets.filter((a) => a.chainId === chainId)
}
