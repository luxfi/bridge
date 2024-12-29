import { reaction } from 'mobx'

import type { SwapState } from '@/domain/types'

export default (store: SwapState) => (reaction(
  () => ({
    toNetworks: store.toNetworks,
  }),
  ({ 
    toNetworks, 
  }) => {
    const oldNetwork = store.toNetwork
    if (!oldNetwork || !toNetworks.find((n) => (n.internal_name === oldNetwork.internal_name))) {
      store.setToNetwork(store.toNetworks.length ? store.toNetworks[0] : null)
    }
  }
))
