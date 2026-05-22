// useNetworks — dynamic chain + asset registry.
//
// Fetches `${cfg.apiHost}/api/networks` once via react-query, transforms
// the response into the SDK's flat (chains[], assets[]) shape, and returns
// it to consumers. While the request is in flight (or if it errors), the
// hook returns the bundled `DEFAULT_CHAINS` / `DEFAULT_ASSETS` so the UI
// is never empty.
//
// Cache policy:
//   - staleTime 5 min: chain registries don't change often; we don't want
//     to flicker the picker on every tab focus
//   - refetchOnWindowFocus: false (same reason)
//   - retry once on failure; if it still fails we just keep the fallback
//
// Replaces the hard-coded `DEFAULT_CHAINS` / `DEFAULT_ASSETS` usage in
// useSwap, useTransfers, and TransferStatus. Adding a new chain on the
// backend now appears in the UI without an SDK release.

import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { getConfig } from '../../config'
import { DEFAULT_CHAINS, type Chain } from '../lib/chains'
import { DEFAULT_ASSETS, type Asset } from '../lib/assets'
import {
  transformNetworks,
  type ApiNetwork,
} from '../lib/network-mapper'

export interface NetworksState {
  /** All active chains for the current env (testnet vs mainnet). */
  chains: Chain[]
  /** All active assets across those chains. */
  assets: Asset[]
  /** True while the very first request is in flight. */
  isLoading: boolean
  /** Whether the most recent fetch failed. The UI keeps the fallback in this case. */
  isError: boolean
  /** Manual refresh hook — useful for a "reload chains" button. */
  refetch: () => void
}

const NETWORKS_STALE_MS = 5 * 60 * 1000

export function useNetworks(): NetworksState {
  const cfg = getConfig()

  const query = useQuery({
    queryKey: ['bridge-networks', cfg.apiHost],
    queryFn: async ({ signal }): Promise<ApiNetwork[]> => {
      const url = new URL('/api/networks', cfg.apiHost)
      const resp = await fetch(url.toString(), { signal })
      if (!resp.ok) {
        throw new Error(`networks fetch failed: HTTP ${resp.status}`)
      }
      const json = (await resp.json()) as { data?: ApiNetwork[] }
      if (!json.data || !Array.isArray(json.data)) {
        throw new Error('networks fetch: missing data array')
      }
      return json.data
    },
    staleTime: NETWORKS_STALE_MS,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  })

  const transformed = useMemo(() => {
    if (!query.data) {
      return { chains: DEFAULT_CHAINS, assets: DEFAULT_ASSETS }
    }
    return transformNetworks(query.data, { testnet: cfg.env === 'testnet' })
  }, [query.data, cfg.env])

  // Defensive: if the backend filter produced an empty set (e.g. testnet
  // env but the API doesn't expose testnet rows yet), fall back to the
  // bundled defaults so the UI still renders a picker.
  const chains = transformed.chains.length > 0 ? transformed.chains : DEFAULT_CHAINS
  const assets = transformed.assets.length > 0 ? transformed.assets : DEFAULT_ASSETS

  return {
    chains,
    assets,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch as unknown as () => void,
  }
}
