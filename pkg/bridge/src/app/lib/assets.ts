// Supported asset registry for the inlined bridge UI.
//
// Like chains.ts, this is a minimal static set sufficient to render a real
// swap form. The real bridge resolves assets per-chain from the API host
// at runtime — Phase 3 R2 swaps this for `useAssets(chainId)`.
//
// PQ-safe note: asset symbols are surface-only labels. All signing is done
// by the SDK's MPC layer (Ringtail + ECDSA hybrid) — not by anything in
// this file. The asset list is data, not trust.

import { ASSET_LOGOS } from './logos'

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
  /**
   * Optional EVM contract address. When undefined the asset is the chain's
   * native currency (used by wagmi's useBalance to fetch a native balance
   * rather than ERC-20). Lower-case hex.
   */
  contractAddress?: string
}

const logo = (symbol: string): string | undefined => ASSET_LOGOS[symbol]

export const DEFAULT_ASSETS: Asset[] = [
  // Lux native
  {
    id: 'lux:96369:LUX',
    symbol: 'LUX',
    name: 'Lux',
    chainId: 'lux:96369',
    decimals: 18,
    logoUrl: logo('LUX'),
  },
  // Ethereum
  { id: 'evm:1:ETH', symbol: 'ETH', name: 'Ether', chainId: 'evm:1', decimals: 18, logoUrl: logo('ETH') },
  { id: 'evm:1:USDC', symbol: 'USDC', name: 'USD Coin', chainId: 'evm:1', decimals: 6, logoUrl: logo('USDC'), contractAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' },
  { id: 'evm:1:USDT', symbol: 'USDT', name: 'Tether USD', chainId: 'evm:1', decimals: 6, logoUrl: logo('USDT'), contractAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7' },
  // Arbitrum
  { id: 'evm:42161:ETH', symbol: 'ETH', name: 'Ether', chainId: 'evm:42161', decimals: 18, logoUrl: logo('ETH') },
  { id: 'evm:42161:USDC', symbol: 'USDC', name: 'USD Coin', chainId: 'evm:42161', decimals: 6, logoUrl: logo('USDC'), contractAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831' },
  // Base
  { id: 'evm:8453:ETH', symbol: 'ETH', name: 'Ether', chainId: 'evm:8453', decimals: 18, logoUrl: logo('ETH') },
  { id: 'evm:8453:USDC', symbol: 'USDC', name: 'USD Coin', chainId: 'evm:8453', decimals: 6, logoUrl: logo('USDC'), contractAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' },
  // Polygon
  { id: 'evm:137:MATIC', symbol: 'MATIC', name: 'Matic', chainId: 'evm:137', decimals: 18, logoUrl: logo('MATIC') },
  { id: 'evm:137:USDC', symbol: 'USDC', name: 'USD Coin', chainId: 'evm:137', decimals: 6, logoUrl: logo('USDC'), contractAddress: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359' },
  // Optimism
  { id: 'evm:10:ETH', symbol: 'ETH', name: 'Ether', chainId: 'evm:10', decimals: 18, logoUrl: logo('ETH') },
  { id: 'evm:10:USDC', symbol: 'USDC', name: 'USD Coin', chainId: 'evm:10', decimals: 6, logoUrl: logo('USDC'), contractAddress: '0x0b2c639c533813f4aa9d7837caf62653d097ff85' },
  // Solana
  { id: 'svm:101:SOL', symbol: 'SOL', name: 'Solana', chainId: 'svm:101', decimals: 9, logoUrl: logo('SOL') },
  { id: 'svm:101:USDC', symbol: 'USDC', name: 'USD Coin', chainId: 'svm:101', decimals: 6, logoUrl: logo('USDC') },
]

export function assetsForChain(assets: Asset[], chainId: string): Asset[] {
  return assets.filter((a) => a.chainId === chainId)
}
