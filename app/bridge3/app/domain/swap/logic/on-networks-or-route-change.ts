import { reaction } from 'mobx'

import type { Network, NetworkType } from '@luxfi/core'
import type { SwapState, Bridge } from '@/domain/types'

const matchesRoute = (bridge: Bridge, t: NetworkType): boolean => (
  (bridge === 'teleport' ? t === 'evm' : t !== 'evm' )  
)

export default (store: SwapState) => (reaction(
  () => ({
    networks: store.allNetworks,
    bridge: store.bridge,   
  }),
  ({ 
    networks, 
    bridge
  }) => {
    
    store.setFromNetworks(networks.filter(
      (n: Network) => (n.status === 'active' && matchesRoute(bridge, n.type))
    ))
    store.setFromNetwork(store.fromNetworks.length ? store.fromNetworks[0] : null)
    store.setFromAssets(store.fromNetwork?.currencies ?? [])
    store.setFromAsset(store.fromAssets.length ? store.fromAssets[0] : null)
  },
    // fire now so that all reactions will cascade based on
    // what was passed into the constructor
  { fireImmediately: true}
))


