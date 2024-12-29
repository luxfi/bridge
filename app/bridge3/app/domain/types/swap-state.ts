import type { Network, Asset } from '@luxfi/core'

interface SwapState {
  get allNetworks() : Network[]
  get fromNetworks(): Network[]
  get toNetworks(): Network[]
  get toNetwork() : Network | null
  get fromNetwork() : Network | null
  get fromAssets() : Asset[] 
  get fromAsset() : Asset | null
  get teleport() : boolean
  get fromAssetQuantity() : number
  setFromNetwork(n: Network | null) : void
  setToNetwork(n: Network | null): void 
  setFromAsset(a: Asset | null): void
  setFromAssetQuantity(a: number): void
  setTeleport(b: boolean): void

  // internal use
  setFromNetworks(n: Network[]): void
  setToNetworks(n: Network[]): void
  setFromAssets(a: Asset[]): void

  setNetworks(
    networks: Network[], 
    initialTo?: Network, 
    initialFrom?: Network
  ): void

}

export {
  type SwapState as default
}
