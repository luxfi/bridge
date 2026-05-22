// Swap form state hook for the inlined bridge UI.
//
// Owns chain/asset selection + the live quote against the bridge backend.
// The quote is fetched from `${cfg.apiHost}/api/quote` (server route
// `app/server/src/routes/quote.ts`), debounced 300ms so typing doesn't
// flood the backend.
//
// Selection state is stored as IDs (`fromChainId`, `fromAssetId`, …) and
// the actual Chain / Asset objects are looked up on every render from the
// `useNetworks()` registry. This means: the chain list can change under us
// (DEFAULT_CHAINS → API response → manual refetch) and the selection
// survives — only the resolved objects change. Without this, a chain
// stored by reference would silently disappear when the registry refreshed.
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
import { type Asset, assetsForChain } from '../lib/assets'
import { BridgeApiError, fetchQuote } from '../lib/bridge-api'
import { type Chain, findChain } from '../lib/chains'
import { useNetworks } from './useNetworks'

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
  /**
   * Whether the quote / swap should include destination-chain gas top-up
   * ("refuel"). The server treats this as a hint that the user wants to
   * receive a small amount of native gas on the destination chain alongside
   * the bridged asset — useful when the user has zero balance there.
   */
  refuel: boolean
  /** True until useNetworks() has populated the registry from the API. */
  networksLoading: boolean
  setFromChain: (c: Chain) => void
  setToChain: (c: Chain) => void
  setFromAsset: (a: Asset) => void
  setToAsset: (a: Asset) => void
  setAmount: (s: string) => void
  setRefuel: (b: boolean) => void
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

/**
 * Pick a sensible default chain ID — Lux first (the canonical source),
 * Ethereum second (the canonical destination), else the first chain in the
 * registry. Falls back to a benign string when the registry is empty so
 * upstream lookups don't throw.
 */
function pickDefaultId(chains: Chain[], preferredId: string): string {
  if (findChain(chains, preferredId)) return preferredId
  return chains[0]?.id ?? preferredId
}

export function useSwap(): SwapState {
  const cfg = getConfig()
  const { chains, assets, isLoading: networksLoading } = useNetworks()

  // Selection state is stored as IDs, not full Chain/Asset objects. The
  // resolved objects are derived via useMemo over the registry so they
  // stay fresh even when DEFAULT_CHAINS swaps in for the API response.
  const [fromChainId, setFromChainId] = useState<string>(() =>
    pickDefaultId(chains, 'lux:96369'),
  )
  const [toChainId, setToChainId] = useState<string>(() =>
    pickDefaultId(chains, 'evm:1'),
  )

  // Initial asset choice — first asset on each chain. Same ID-based pattern.
  const [fromAssetId, setFromAssetId] = useState<string>(() =>
    assetsForChain(assets, fromChainId)[0]?.id ?? '',
  )
  const [toAssetId, setToAssetId] = useState<string>(() =>
    assetsForChain(assets, toChainId)[0]?.id ?? '',
  )

  const [amount, setAmount] = useState<string>('')
  const [refuel, setRefuel] = useState<boolean>(false)

  const [quote, setQuote] = useState<Quote | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [quoteError, setQuoteError] = useState<string | null>(null)

  // Resolved (Chain, Asset) objects from the current registry.
  const fromChain = useMemo<Chain>(
    () =>
      findChain(chains, fromChainId) ??
      chains[0] ?? {
        id: fromChainId,
        internalName: fromChainId,
        name: fromChainId,
        symbol: '',
        decimals: 18,
        family: 'evm',
      },
    [chains, fromChainId],
  )
  const toChain = useMemo<Chain>(
    () =>
      findChain(chains, toChainId) ??
      chains[1] ??
      chains[0] ??
      fromChain,
    [chains, toChainId, fromChain],
  )

  const fromAssetOptions = useMemo<Asset[]>(
    () => assetsForChain(assets, fromChain.id),
    [assets, fromChain.id],
  )
  const toAssetOptions = useMemo<Asset[]>(
    () => assetsForChain(assets, toChain.id),
    [assets, toChain.id],
  )

  const fromAsset = useMemo<Asset>(() => {
    const exact = fromAssetOptions.find((a) => a.id === fromAssetId)
    if (exact) return exact
    return (
      fromAssetOptions[0] ?? {
        id: fromAssetId || `${fromChain.id}:?`,
        symbol: fromChain.symbol,
        name: fromChain.symbol,
        chainId: fromChain.id,
        decimals: fromChain.decimals,
      }
    )
  }, [fromAssetOptions, fromAssetId, fromChain])

  const toAsset = useMemo<Asset>(() => {
    const exact = toAssetOptions.find((a) => a.id === toAssetId)
    if (exact) return exact
    return (
      toAssetOptions[0] ?? {
        id: toAssetId || `${toChain.id}:?`,
        symbol: toChain.symbol,
        name: toChain.symbol,
        chainId: toChain.id,
        decimals: toChain.decimals,
      }
    )
  }, [toAssetOptions, toAssetId, toChain])

  // When the registry first resolves (DEFAULT → API) and an entry's ID
  // doesn't exist in the new list, snap to the first available so we don't
  // leave the picker showing a stale selection. This only fires on real
  // registry changes (chains.length, not chain reference identity).
  useEffect(() => {
    if (chains.length === 0) return
    if (!findChain(chains, fromChainId)) {
      const next = pickDefaultId(chains, 'lux:96369')
      if (next !== fromChainId) setFromChainId(next)
    }
    if (!findChain(chains, toChainId)) {
      const next = pickDefaultId(chains, 'evm:1')
      if (next !== toChainId) setToChainId(next)
    }
  }, [chains, fromChainId, toChainId])

  // When fromChain's asset options change and the current selection isn't
  // valid, drop to the first option. Same on toChain. (Asset ID embeds the
  // chain ID, so a chain swap always invalidates the asset selection.)
  useEffect(() => {
    if (fromAssetOptions.length === 0) return
    if (!fromAssetOptions.some((a) => a.id === fromAssetId)) {
      const first = fromAssetOptions[0]
      if (first) setFromAssetId(first.id)
    }
  }, [fromAssetOptions, fromAssetId])
  useEffect(() => {
    if (toAssetOptions.length === 0) return
    if (!toAssetOptions.some((a) => a.id === toAssetId)) {
      const first = toAssetOptions[0]
      if (first) setToAssetId(first.id)
    }
  }, [toAssetOptions, toAssetId])

  const setFromChainSafe = useCallback((c: Chain) => {
    setFromChainId(c.id)
  }, [])
  const setToChainSafe = useCallback((c: Chain) => {
    setToChainId(c.id)
  }, [])
  const setFromAssetSafe = useCallback((a: Asset) => {
    setFromAssetId(a.id)
  }, [])
  const setToAssetSafe = useCallback((a: Asset) => {
    setToAssetId(a.id)
  }, [])

  const reverse = useCallback(() => {
    setFromChainId(toChainId)
    setToChainId(fromChainId)
    setFromAssetId(toAssetId)
    setToAssetId(fromAssetId)
  }, [fromChainId, toChainId, fromAssetId, toAssetId])

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

    const sourceNetwork = fromChain.internalName
    const destinationNetwork = toChain.internalName
    if (!sourceNetwork || !destinationNetwork) {
      // Chain still resolving (registry not yet loaded) or missing
      // internalName field — quietly back off and let the next render retry.
      setQuote(null)
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
          refuel,
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
  }, [
    amount,
    refuel,
    fromChain.id,
    toChain.id,
    fromChain.internalName,
    toChain.internalName,
    fromAsset.id,
    toAsset.id,
    fromAsset.symbol,
    toAsset.symbol,
    cfg.apiHost,
  ])

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
    refuel,
    networksLoading,
    setFromChain: setFromChainSafe,
    setToChain: setToChainSafe,
    setFromAsset: setFromAssetSafe,
    setToAsset: setToAssetSafe,
    setAmount,
    setRefuel,
    reverse,
    fromAssetOptions,
    toAssetOptions,
  }
}
