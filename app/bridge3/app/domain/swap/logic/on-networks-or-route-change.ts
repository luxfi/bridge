import { reaction } from 'mobx'

import type { Network, Asset } from '@luxfi/core'
import type { SwapState } from '@/domain/types'

export default (store: SwapState) => (reaction(
  () => ({
    networks: store.allNetworks,
    teleport: store.teleport,   
  }),
  ({ 
    networks, 
    teleport
  }) => {
    if (teleport) {
      store.setFromNetworks(networks.filter((n: Network) => ( n.type === 'evm' && n.status === 'active')))
    }
    else {
      store.setFromNetworks(networks.filter((n: Network) => ( n.type !== 'evm' && n.status === 'active')))
    }
    store.setFromNetwork(store.fromNetworks.length ? store.fromNetworks[0] : null)
    //store.setFromAssets(store.fromNetwork?.currencies /* .filter((c: Asset) => (c.status === 'active')) */ ?? [] )
    store.setFromAssets(store.fromNetwork?.currencies.filter((c: Asset) => (c.status === 'active')) ?? [])
    store.setFromAsset(store.fromAssets.length ? store.fromAssets[0] : null)
  },
  { fireImmediately: true}
))


