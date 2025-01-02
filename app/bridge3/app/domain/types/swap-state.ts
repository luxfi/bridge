import type { Network, Asset } from '@luxfi/core'
import type AppSettings from './app-settings'

type Bridge = 'teleport' | 'utila'

interface SwapState {

  allNetworks : Network[]
  fromNetworks: Network[]
  toNetworks: Network[]
  toNetwork : Network | null
  fromNetwork : Network | null
  fromAssets : Asset[] 
  fromAsset : Asset | null
  fromAssetPriceUSD: number | null
  toAsset : Asset | null
  bridge : Bridge
  fromAssetQuantity : number

  setFromNetwork(n: Network | null) : void
  setToNetwork(n: Network | null): void 
  setFromAsset(a: Asset | null): void
  setFromAssetPriceUSD(n: number | null): void
  setToAsset(a: Asset | null): void
  setFromAssetQuantity(a: number): void
  setBridge(b: Bridge): void

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

export { 
  type SwapState as default,
  type Bridge
}
