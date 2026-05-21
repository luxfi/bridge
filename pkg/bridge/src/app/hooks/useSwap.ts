// Swap form state hook for the inlined bridge UI.
//
// Owns the from/to chain selection, asset selection, amount, and a derived
// quote. The quote here is a deterministic display-only mock — Phase 3 R3
// wires the real cross-chain quote against the bridge backend (which itself
// is permissionless: rates are computed from on-chain reserves + MPC node
// attestations, no central pricing authority).

import { useState, useMemo, useCallback } from 'react'
import {
  DEFAULT_ASSETS,
  type Asset,
  assetsForChain,
} from '../lib/assets'
import { DEFAULT_CHAINS, type Chain, findChain } from '../lib/chains'

export interface Quote {
  /** Amount the user receives on the destination chain. */
  outAmount: number
  /** USD fee charged by the bridge. */
  feeUsd: number
  /** Gas estimate on the destination chain (in destination native units). */
  destGas: number
  /** Estimated time-to-finality, e.g. `~5min`. */
  etaText: string
  /** Implied effective rate, `outAmount / inAmount`. */
  rate: number
}

export interface SwapState {
  chains: Chain[]
  assets: Asset[]
  fromChain: Chain
  toChain: Chain
  fromAsset: Asset
  toAsset: Asset
  amount: string
  quote: Quote | null
  setFromChain: (c: Chain) => void
  setToChain: (c: Chain) => void
  setFromAsset: (a: Asset) => void
  setToAsset: (a: Asset) => void
  setAmount: (s: string) => void
  reverse: () => void
  fromAssetOptions: Asset[]
  toAssetOptions: Asset[]
}

/**
 * Compute a deterministic display-only quote from an input amount.
 *
 * Replaced by `useQuote(backend, from, to, amount)` once Phase 3 R3 ships
 * the API client.
 */
function computeQuote(amountStr: string, from: Asset, to: Asset): Quote | null {
  const n = Number(amountStr)
  if (!isFinite(n) || n <= 0) return null
  // Tiny mock rate matrix — stable but obviously placeholder.
  const stableSym = (s: string) =>
    s === 'USDC' || s === 'USDT' || s === 'USDL' || s === 'DAI'
  const usd = (sym: string) => {
    switch (sym) {
      case 'ETH':
        return 3500
      case 'LUX':
        return 12
      case 'MATIC':
        return 0.6
      case 'SOL':
        return 175
      default:
        return stableSym(sym) ? 1 : 1
    }
  }
  const inUsd = n * usd(from.symbol)
  const out = (inUsd / usd(to.symbol)) * 0.998 // 0.2% bridge fee
  const fee = inUsd * 0.002
  const rate = out / n
  return {
    outAmount: out,
    feeUsd: fee,
    destGas: 0.0008,
    etaText: '~3 min',
    rate,
  }
}

export function useSwap(): SwapState {
  const chains = DEFAULT_CHAINS
  const assets = DEFAULT_ASSETS

  const initFrom = findChain(chains, 'lux:96369') ?? chains[0]
  const initTo = findChain(chains, 'evm:1') ?? chains[1] ?? chains[0]

  const [fromChain, setFromChain] = useState<Chain>(initFrom)
  const [toChain, setToChain] = useState<Chain>(initTo)
  const [fromAsset, setFromAsset] = useState<Asset>(
    assetsForChain(assets, initFrom.id)[0]!,
  )
  const [toAsset, setToAsset] = useState<Asset>(
    assetsForChain(assets, initTo.id)[0]!,
  )
  const [amount, setAmount] = useState<string>('')

  const fromAssetOptions = useMemo(
    () => assetsForChain(assets, fromChain.id),
    [assets, fromChain.id],
  )
  const toAssetOptions = useMemo(
    () => assetsForChain(assets, toChain.id),
    [assets, toChain.id],
  )

  // Keep selected asset in sync with chain change.
  const setFromChainSafe = useCallback(
    (c: Chain) => {
      setFromChain(c)
      const opts = assetsForChain(assets, c.id)
      if (opts[0] && opts.findIndex((a) => a.id === fromAsset.id) < 0) {
        setFromAsset(opts[0])
      }
    },
    [assets, fromAsset.id],
  )
  const setToChainSafe = useCallback(
    (c: Chain) => {
      setToChain(c)
      const opts = assetsForChain(assets, c.id)
      if (opts[0] && opts.findIndex((a) => a.id === toAsset.id) < 0) {
        setToAsset(opts[0])
      }
    },
    [assets, toAsset.id],
  )

  const reverse = useCallback(() => {
    setFromChain(toChain)
    setToChain(fromChain)
    setFromAsset(toAsset)
    setToAsset(fromAsset)
  }, [fromChain, toChain, fromAsset, toAsset])

  const quote = useMemo(
    () => computeQuote(amount, fromAsset, toAsset),
    [amount, fromAsset, toAsset],
  )

  return {
    chains,
    assets,
    fromChain,
    toChain,
    fromAsset,
    toAsset,
    amount,
    quote,
    setFromChain: setFromChainSafe,
    setToChain: setToChainSafe,
    setFromAsset,
    setToAsset,
    setAmount,
    reverse,
    fromAssetOptions,
    toAssetOptions,
  }
}
