import type { Network, Asset } from '@luxfi/core'

interface SwapState {
  get fromNetworks(): Network[]
  get toNetworks(): Network[]
  get to() : Network | null
  get from() : Network | null
  get assetsAvailable() : Asset[] 
  get asset() : Asset | null
  setFrom(n: Network | null) : void
  setTo(n: Network | null): void 
  setFromNetworks(n: Network[]): void 
  setToNetworks(n: Network[]): void 
  setAsset(a: Asset | null): void

  get amount() : number
  setAmount(a: number): void

  setNetworks(
    networks: Network[], 
    initialTo?: Network, 
    initialFrom?: Network
  ): void

}

export {
  type SwapState as default
}
