import type { Network, Asset } from '@luxfi/core'
import type AppSettings from './app-settings'

interface SwapState {

  allNetworks : Network[]
  fromNetworks: Network[]
  toNetworks: Network[]
  toNetwork : Network | null
  fromNetwork : Network | null
  fromAssets : Asset[] 
  fromAsset : Asset | null
  toAsset : Asset | null
  teleport : boolean
  fromAssetQuantity : number

  setFromNetwork(n: Network | null) : void
  setToNetwork(n: Network | null): void 
  setFromAsset(a: Asset | null): void
  setToAsset(a: Asset | null): void
  setFromAssetQuantity(a: number): void
  setTeleport(b: boolean): void

    // internal use
  swapPairs: Record<string, string[]>
  setFromNetworks(n: Network[]): void
  setToNetworks(n: Network[]): void
  setFromAssets(a: Asset[]): void

  setSettings (
    settings: AppSettings,
    initialTo?: Network, 
    initialFrom?: Network
  ): void
}

export { type SwapState as default }
