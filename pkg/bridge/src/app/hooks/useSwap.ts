// Swap form state hook for the inlined bridge UI.
//
// Owns chain/asset selection + the live quote against the bridge backend.
// The quote is fetched from `${cfg.apiHost}/api/quote` (server route
// `app/server/src/routes/quote.ts`), debounced 300ms so typing doesn't
// flood the backend.
//
// Trust model:
//   - The quote is *advisory* — the user signs the final amount when they
//     submit the transfer. The server is not trusted to set the price; the
//     MPC threshold layer enforces min_receive_amount on settlement.
//   - Permissionless-by-design: any consumer can hit the same endpoint. The
//     server is a read-only price oracle; the bridge has no central pricing
//     authority.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { getConfig } from '../../config'
import { DEFAULT_ASSETS, type Asset, assetsForChain } from '../lib/assets'
import { BridgeApiError, chainIdToInternalName, fetchQuote } from '../lib/bridge-api'
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
  /** Minimum receive amount the user has consented to (slippage protected). */
  minOut: number
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
  /** True while a quote request is in flight. */
  quoting: boolean
  /** Last-fetched quote error, when applicable. */
  quoteError: string | null
  setFromChain: (c: Chain) => void
  setToChain: (c: Chain) => void
  setFromAsset: (a: Asset) => void
  setToAsset: (a: Asset) => void
  setAmount: (s: string) => void
  reverse: () => void
  fromAssetOptions: Asset[]
  toAssetOptions: Asset[]
}

const QUOTE_DEBOUNCE_MS = 300

/**
 * Format the server's `avg_completion_time` (e.g. `00:03:00`) as a short
 * UI string (`~3 min`). Falls back to the raw string when the format is
 * unrecognized.
 */
function formatEta(raw: string): string {
  const m = /^(\d+):(\d+):/.exec(raw)
  if (!m) return raw || '—'
  const hours = Number(m[1])
  const mins = Number(m[2])
  if (hours > 0) return `~${hours}h ${mins}m`
  if (mins > 0) return `~${mins} min`
  return '<1 min'
}

export function useSwap(): SwapState {
  const cfg = getConfig()

  const chains = DEFAULT_CHAINS
  const assets = DEFAULT_ASSETS

  const initFrom = findChain(chains, 'lux:96369') ?? chains[0]
  const initTo = findChain(chains, 'evm:1') ?? chains[1] ?? chains[0]
  if (!initFrom || !initTo) {
    throw new Error('useSwap: DEFAULT_CHAINS is empty')
  }

  const [fromChain, setFromChain] = useState<Chain>(initFrom)
  const [toChain, setToChain] = useState<Chain>(initTo)
  const initFromAsset = assetsForChain(assets, initFrom.id)[0]
  const initToAsset = assetsForChain(assets, initTo.id)[0]
  if (!initFromAsset || !initToAsset) {
    throw new Error('useSwap: DEFAULT_ASSETS missing entries for default chains')
  }
  const [fromAsset, setFromAsset] = useState<Asset>(initFromAsset)
  const [toAsset, setToAsset] = useState<Asset>(initToAsset)
  const [amount, setAmount] = useState<string>('')

  const [quote, setQuote] = useState<Quote | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [quoteError, setQuoteError] = useState<string | null>(null)

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
      const first = opts[0]
      if (first && opts.findIndex((a) => a.id === fromAsset.id) < 0) {
        setFromAsset(first)
      }
    },
    [assets, fromAsset.id],
  )
  const setToChainSafe = useCallback(
    (c: Chain) => {
      setToChain(c)
      const opts = assetsForChain(assets, c.id)
      const first = opts[0]
      if (first && opts.findIndex((a) => a.id === toAsset.id) < 0) {
        setToAsset(first)
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

  // ─── Quote effect ────────────────────────────────────────────────────
  // Debounced fetch. Cleanup aborts the in-flight request so rapid input
  // changes don't pile up requests against the backend.
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    setQuoteError(null)

    const n = Number(amount)
    if (!isFinite(n) || n <= 0) {
      setQuote(null)
      setQuoting(false)
      return
    }
    if (fromChain.id === toChain.id && fromAsset.id === toAsset.id) {
      // Same source + destination is meaningless — clear quote, no fetch.
      setQuote(null)
      setQuoting(false)
      return
    }

    const sourceNetwork = chainIdToInternalName(fromChain.id, cfg.env)
    const destinationNetwork = chainIdToInternalName(toChain.id, cfg.env)
    if (!sourceNetwork || !destinationNetwork) {
      // Unsupported chain pair on this env — clear quote, surface error.
      setQuote(null)
      setQuoteError('Unsupported chain pair for current environment')
      setQuoting(false)
      return
    }

    const timer = setTimeout(() => {
      // Abort any prior in-flight request.
      abortRef.current?.abort()
      const ctl = new AbortController()
      abortRef.current = ctl
      setQuoting(true)

      fetchQuote(
        cfg.apiHost,
        {
          sourceNetwork,
          sourceToken: fromAsset.symbol,
          destinationNetwork,
          destinationToken: toAsset.symbol,
          amount: n,
        },
        ctl.signal,
      )
        .then((sq) => {
          if (ctl.signal.aborted) return
          const out = sq.receive_amount
          const fee = sq.total_fee_in_usd
          const rate = n > 0 ? out / n : 0
          setQuote({
            outAmount: out,
            feeUsd: fee,
            destGas: sq.blockchain_fee,
            etaText: formatEta(sq.avg_completion_time),
            rate,
            minOut: sq.min_receive_amount,
          })
          setQuoteError(null)
        })
        .catch((err: unknown) => {
          if (ctl.signal.aborted) return
          if (err instanceof BridgeApiError) {
            setQuoteError(`Quote failed (${err.status})`)
          } else if (err instanceof Error && err.name === 'AbortError') {
            // Aborted by a newer keystroke — silent.
            return
          } else {
            const msg = err instanceof Error ? err.message : 'Quote failed'
            setQuoteError(msg)
          }
          setQuote(null)
        })
        .finally(() => {
          if (!ctl.signal.aborted) setQuoting(false)
        })
    }, QUOTE_DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      // Do NOT abort here — the next effect run will abort. This avoids
      // tearing down the in-flight request when React fires unrelated
      // re-renders (e.g. parent state changes that don't touch our deps).
    }
  }, [amount, fromChain.id, toChain.id, fromAsset.id, toAsset.id, fromAsset.symbol, toAsset.symbol, cfg.apiHost, cfg.env])

  return {
    chains,
    assets,
    fromChain,
    toChain,
    fromAsset,
    toAsset,
    amount,
    quote,
    quoting,
    quoteError,
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
