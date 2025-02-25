import { reaction } from 'mobx'

import type { Network, Asset } from '@luxfi/core'
import type { SwapState } from '@/domain/types'
import backend from '@/domain/backend'


const swapExists = (
  swapPairs: Record<string, string[]>, 
  src: Asset,  
  swapAsset: Asset
): boolean => (
  swapPairs[src.asset].includes(swapAsset.asset)
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
