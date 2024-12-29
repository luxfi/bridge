import type { Network, Asset } from '@luxfi/core'

interface SwapState {

  get allNetworks() : Network[]
  get fromNetworks(): Network[]
  get toNetworks(): Network[]
  get toNetwork() : Network | null
  get fromNetwork() : Network | null
  get fromAssets() : Asset[] 
  get fromAsset() : Asset | null
  get toAsset() : Asset | null
  get teleport() : boolean
  get fromAssetQuantity() : number
  setFromNetwork(n: Network | null) : void
  setToNetwork(n: Network | null): void 
  setFromAsset(a: Asset | null): void
  setToAsset(a: Asset | null): void
  setFromAssetQuantity(a: number): void
  setTeleport(b: boolean): void

    // internal use
  get swapPairs(): Record<string, string[]>
  setFromNetworks(n: Network[]): void
  setToNetworks(n: Network[]): void
  setFromAssets(a: Asset[]): void

  reset (
    networks: Network[], 
    swapPairs: Record<string, string[]>,
    initialTo?: Network, 
    initialFrom?: Network
  ): void

}

export {
  type SwapState as default
}
