import { reaction } from 'mobx'

import type { SwapState } from '@/domain/types'

export default (store: SwapState) => (reaction(
  () => ({
    toNetwork: store.toNetwork,
  }),
  ({ 
    toNetwork, 
  }) => {
    store.setToAsset(toNetwork?.currencies.length ? toNetwork?.currencies[0] : null)
  }
))
