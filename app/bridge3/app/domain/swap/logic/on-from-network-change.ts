import { reaction } from 'mobx'

import type { Network, Asset } from '@luxfi/core'
import type { SwapState } from '@/domain/types'

export default (store: SwapState) => (reaction(
  () => ({
    network: store.fromNetwork,
  }),
  ({ 
    network, 
  }) => {
    store.setFromAssets(network?.currencies.filter((c: Asset) => (c.status === 'active')) ?? [])
    store.setFromAsset(store.fromAssets.length ? store.fromAssets[0] : null)
  }
))
