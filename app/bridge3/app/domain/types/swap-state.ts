import type { Network, Asset } from '@luxfi/core'

interface SwapState {
  get to() : Network
  get from() : Network
  get assetsAvailable() : Asset[] 
  get asset() : Asset | null
}

export {
  type SwapState as default
}
