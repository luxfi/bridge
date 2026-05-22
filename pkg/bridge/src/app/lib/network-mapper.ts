// Network mapper — translates `bridge-api.lux.network/api/networks`
// response shapes into the SDK's `Chain` / `Asset` interfaces.
//
// Pure functions, no React, no side effects. Tested by `useNetworks`
// indirectly; doing this as a separate module keeps the JSON↔domain
// boundary inspectable and makes it trivial to swap the backend out
// for a BridgeVM RPC `getSupportedChains` response in the future
// (just write another mapper, the rest of the SDK is unchanged).

import type { Asset } from './assets'
import { ASSET_LOGOS, CHAIN_LOGOS } from './logos'
import type { Chain, ChainFamily } from './chains'

// ---------------------------------------------------------------------------
// API shapes (subset of bridge-api.lux.network /api/networks response)
// ---------------------------------------------------------------------------

export interface ApiCurrency {
  name: string
  asset: string
  logo: string | null
  contract_address: string | null
  decimals: number
  status: string
  is_deposit_enabled: boolean
  is_withdrawal_enabled: boolean
  is_refuel_enabled: boolean
  // Other server fields exist (max_withdrawal_amount, fees, etc.) — we
  // don't need them in the UI today, so they stay un-typed and ignored.
}

export interface ApiNetwork {
  display_name: string
  internal_name: string
  logo: string | null
  native_currency: string
  is_testnet: boolean
  is_featured: boolean
  average_completion_time: string
  chain_id: string | null
  type: string
  status: string
  transaction_explorer_template: string
  account_explorer_template: string
  currencies: ApiCurrency[]
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

/**
 * Resolve the SDK's stable namespaced Chain.id from a network record.
 *
 * Stability rule: the same network (identified by `internal_name`) maps to
 * the same Chain.id forever, regardless of how the backend renames its
 * enums. The id format matches `DEFAULT_CHAINS` so static fallback
 * selections survive once the API responds.
 */
export function deriveChainId(net: ApiNetwork): string {
  // Lux is technically EVM but we tag family=lux for teleporter routing.
  // Pin to the canonical id used by DEFAULT_CHAINS so a user who picked
  // Lux from the static fallback stays selected after the API resolves.
  if (net.internal_name === 'LUX_MAINNET') return 'lux:96369'
  if (net.internal_name === 'LUX_TESTNET') return 'lux:96368'

  switch (net.type) {
    case 'evm':
      return net.chain_id ? `evm:${net.chain_id}` : net.internal_name.toLowerCase()
    case 'solana':
      return net.is_testnet ? 'svm:devnet' : 'svm:101'
    case 'btc':
      return net.is_testnet ? 'btc:testnet' : 'btc:mainnet'
    case 'ton':
      return net.is_testnet ? 'ton:testnet' : 'ton:mainnet'
    case 'xrp':
      return net.is_testnet ? 'xrp:testnet' : 'xrp:mainnet'
    case 'cardano':
      return net.is_testnet ? 'cardano:preview' : 'cardano:mainnet'
    case 'substrate':
      return net.is_testnet ? 'polkadot:westend' : 'polkadot:mainnet'
    default:
      return net.internal_name.toLowerCase()
  }
}

function deriveFamily(net: ApiNetwork): ChainFamily {
  if (net.internal_name === 'LUX_MAINNET' || net.internal_name === 'LUX_TESTNET') {
    return 'lux'
  }
  switch (net.type) {
    case 'evm':
      return 'evm'
    case 'solana':
      return 'svm'
    case 'btc':
      return 'btc'
    case 'ton':
      return 'ton'
    case 'xrp':
      return 'xrp'
    case 'cardano':
      return 'cardano'
    case 'substrate':
      return 'substrate'
    default:
      // Unknown family — treat as EVM so the wagmi connector at least
      // tries to handle it. UI shows the native_currency as-is.
      return 'evm'
  }
}

/**
 * Resolve the logo URL for a chain. Prefers the SDK-bundled inline SVGs
 * (zero-network, theme-matched, guaranteed-loadable) over the backend's
 * CDN URLs — `cdn.lux.network/bridge/...` returns 522 for several assets,
 * and even when it works it's a dependency we'd rather not have. The API
 * URL only fires when we don't ship a bundled equivalent.
 */
function resolveChainLogo(id: string, apiLogo: string | null): string | undefined {
  return CHAIN_LOGOS[id] ?? apiLogo ?? undefined
}

/** Same policy as resolveChainLogo, but keyed by asset symbol. */
function resolveAssetLogo(
  symbol: string,
  apiLogo: string | null,
): string | undefined {
  return ASSET_LOGOS[symbol] ?? apiLogo ?? undefined
}

/**
 * Convert one ApiNetwork to a SDK Chain. The native currency's decimals
 * field drives `Chain.decimals` — falling back to 18 (EVM default) when
 * the network has no currency entry matching its native symbol.
 */
export function mapNetwork(net: ApiNetwork): Chain {
  const native = net.currencies.find((c) => c.asset === net.native_currency)
  const id = deriveChainId(net)
  const logoUrl = resolveChainLogo(id, net.logo)
  return {
    id,
    internalName: net.internal_name,
    name: net.display_name,
    symbol: net.native_currency,
    decimals: native?.decimals ?? 18,
    family: deriveFamily(net),
    isTestnet: net.is_testnet,
    isFeatured: net.is_featured,
    ...(net.chain_id != null
      ? { evmChainId: Number.parseInt(net.chain_id, 10) }
      : {}),
    ...(logoUrl ? { logoUrl } : {}),
  }
}

/**
 * Convert one ApiCurrency to a SDK Asset. Requires the chain id (so we can
 * scope the asset's stable id to its chain).
 */
export function mapAsset(
  _net: ApiNetwork,
  c: ApiCurrency,
  chainId: string,
): Asset {
  const logoUrl = resolveAssetLogo(c.asset, c.logo)
  return {
    id: `${chainId}:${c.asset}`,
    symbol: c.asset,
    name: c.name || c.asset,
    chainId,
    decimals: c.decimals ?? 18,
    ...(logoUrl ? { logoUrl } : {}),
    ...(c.contract_address ? { contractAddress: c.contract_address } : {}),
  }
}

/**
 * Bulk transform an /api/networks response into the SDK's flat
 * (chains[], assets[]) shape.
 *
 * Filters:
 *   - networks with `status !== 'active'` are dropped
 *   - currencies with `status !== 'active'` are dropped
 *   - currencies that are neither deposit- nor withdrawal-enabled are
 *     dropped (they can't be bridged in *or* out, so showing them in the
 *     picker would just create dead options)
 *   - when `testnet === true`, only `is_testnet === true` networks pass
 *     (and vice versa) — UI never mixes mainnet + testnet rows
 */
export function transformNetworks(
  data: ApiNetwork[],
  opts: { testnet: boolean },
): { chains: Chain[]; assets: Asset[] } {
  const chains: Chain[] = []
  const assets: Asset[] = []
  for (const net of data) {
    if (net.status !== 'active') continue
    if (Boolean(net.is_testnet) !== opts.testnet) continue
    const chain = mapNetwork(net)
    chains.push(chain)
    for (const c of net.currencies ?? []) {
      if (c.status !== 'active') continue
      if (!c.is_deposit_enabled && !c.is_withdrawal_enabled) continue
      assets.push(mapAsset(net, c, chain.id))
    }
  }
  return { chains, assets }
}
