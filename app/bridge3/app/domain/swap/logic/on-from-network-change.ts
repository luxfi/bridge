import { reaction } from 'mobx'

import type { SwapState } from '@/domain/types'

export default (store: SwapState) => (reaction(
  () => ({
    network: store.fromNetwork,
  }),
  ({ 
    network, 
  }) => {
      // Do not filter by status==='active' as the UI now shows those as disabled
    store.setFromAssets(network?.currencies ?? [])
    store.setFromAsset(store.fromAssets.length ? store.fromAssets[0] : null)
  }
))
