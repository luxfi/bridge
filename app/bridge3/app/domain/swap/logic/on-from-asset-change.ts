import { reaction } from 'mobx'

import type { Network, Asset } from '@luxfi/core'
import type { SwapState } from '@/domain/types'
import backend from '@/domain/backend'


// A swap pair is SYMMETRIC, and it is read that way here rather than written
// twice in the table.
//
// swapPairs is a hand-maintained map, and 35 of its entries name a destination
// that does not name them back: BTC lists LBTC, while LBTC lists WBTC, ZBTC and
// cbBTC but not BTC. Reading it in one direction only therefore offered
// BTC -> LBTC and refused LBTC -> BTC, for 35 pairs, with nothing in the UI to
// say why one direction worked and the other did not.
//
// Wrapping and unwrapping are the same route, so the relation is symmetric by
// nature; the asymmetry was bookkeeping drift, not intent. Closing it HERE keeps
// one declaration and makes the drift unrepresentable — adding 35 reverse
// entries by hand would just re-open the same gap the next time an asset is
// added.
//
// The optional chaining is the second half of the bug. swapPairs[src.asset] is
// undefined for an asset with no row at all (LSIXR and ZSIXR are named as
// destinations but have none), and `.includes` on undefined THROWS. That throw
// escapes the mobx reaction below, so setToNetworks never runs and the
// destination picker renders EMPTY — a crash presenting as a blank UI.
const swapExists = (
  swapPairs: Record<string, string[]>,
  src: Asset,
  swapAsset: Asset
): boolean => (
  (swapPairs[src.asset]?.includes(swapAsset.asset) ?? false) ||
  (swapPairs[swapAsset.asset]?.includes(src.asset) ?? false)
)

export default (store: SwapState) => (reaction(
  () => ({
    fromAsset: store.fromAsset,
  }),
  async ({ 
    fromAsset, 
  }) => {
      // Networks for which at least one swap pair exists (swap is possible)
    store.setToNetworks(
      fromAsset ? (
        store.allNetworks
          .map((n: Network) => ({
            ...n,
            currencies: n.currencies.filter((c: Asset) => (swapExists(store.swapPairs, fromAsset!, c))),
          }))
          .filter((n: Network) => n.currencies.length > 0)
      ) : []  
    )  
    if (fromAsset) {
      const price = await backend.getAssetPrice(fromAsset)
      store.setFromAssetPriceUSD(price ?? null)
    }

  }
))
