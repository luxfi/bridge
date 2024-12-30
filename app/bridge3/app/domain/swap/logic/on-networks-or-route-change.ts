import { reaction } from 'mobx'

import type { Network, Asset, NetworkType } from '@luxfi/core'
import type { SwapState } from '@/domain/types'

const matchesRoute = (teleport: boolean, t: NetworkType): boolean => (
  (teleport ? t === 'evm' : t !== 'evm' )  
)

export default (store: SwapState) => (reaction(
  () => ({
    networks: store.allNetworks,
    teleport: store.teleport,   
  }),
  ({ 
    networks, 
    teleport
  }) => {
    
    store.setFromNetworks(networks.filter(
      (n: Network) => (n.status === 'active' && matchesRoute(teleport, n.type))
    ))
    store.setFromNetwork(store.fromNetworks.length ? store.fromNetworks[0] : null)
    store.setFromAssets(store.fromNetwork?.currencies ?? [])
    store.setFromAsset(store.fromAssets.length ? store.fromAssets[0] : null)
  },
    // fire now so that all reactions will cascade based on
    // what was passed into the constructor
  { fireImmediately: true}
))


