import { reaction } from 'mobx'

import type { SwapState } from '@/domain/types'

export default (store: SwapState) => (reaction(
  () => ({
    toNetworks: store.toNetworks,
  }),
  ({ 
    toNetworks, 
  }) => {
    store.setToNetwork(toNetworks.length ? toNetworks[0] : null)
  }
))
