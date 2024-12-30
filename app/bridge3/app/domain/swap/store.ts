import { 
  computed, 
  makeObservable, 
  observable, 
  action,
  type IReactionDisposer,
} from 'mobx'

import type { Asset, Network } from '@luxfi/core'
import type { AppSettings, SwapState } from '@/domain/types' 

import onNetworksOrRouteChange from './logic/on-networks-or-route-change'
import onFromNetworkChange from './logic/on-from-network-change'
import onFromAssetChange from './logic/on-from-asset-change'
import onToNetworksChange from './logic/on-to-networks-change'
import onToNetworkChange from './logic/on-to-network-change'

class SwapStore implements SwapState {

  fromNetworks: Network[] = []
  toNetworks: Network[] = []
  fromNetwork: Network | null = null
  toNetwork: Network | null = null
  fromAssets: Asset[] = []
  fromAsset: Asset | null = null
  toAsset: Asset | null = null
  fromAssetQuantity: number = 0
  teleport: boolean = true
  allNetworks: Network[] = []

  swapPairs: Record<string, string[]>  = {}

  private _disposers: IReactionDisposer[] = []

  constructor(
    settings: AppSettings,
    initialTo?: Network, 
    initialFrom?: Network
  ) {
    makeObservable(this, {
      fromNetworks: observable.shallow,
      toNetworks: observable.shallow,
      fromNetwork: observable.shallow,
      toNetwork: observable.shallow,
      fromAssets: observable.shallow,
      fromAsset:observable.shallow,
      toAsset: observable.shallow,
      fromAssetQuantity: observable,
      teleport: observable,
      allNetworks: observable.shallow,
      setFromNetwork: action.bound,
      setToNetwork: action.bound,
      setFromAssets: action,
      setFromAsset: action.bound,
      setToAsset: action.bound,
      setFromAssetQuantity: action.bound,
      setTeleport: action.bound,
      setSettings: action.bound,
    })

    this.allNetworks = settings.networks
    this.swapPairs = settings.swapPairs
    this.fromNetwork = initialFrom ?? null 
    this.toNetwork = initialTo ?? null
  }

    /**  
    This should be called clients-side as early as possible 
    (eg, in useEffect()).
     
    Mobx reaction()s return a disposer function.
    Provider calls our dispose() when it unmounts 
    via useEffect()'s return value. 

    These should be called in REVERSE order of causality 
    for the effects to cascade properly the first time.
    */
  initialize = () => {
    this._disposers.push(onToNetworkChange(this))
    this._disposers.push(onToNetworksChange(this))
    this._disposers.push(onFromAssetChange(this))
    this._disposers.push(onFromNetworkChange(this))
    this._disposers.push(onNetworksOrRouteChange(this)) // fires immediately
  }

  dispose = () => { this._disposers.forEach((d) => {d()}) }

  setFromNetworks = (n: Network[]): void        => { this.fromNetworks = n }
  setToNetworks = (n: Network[]): void          => { this.toNetworks = n }
  setFromNetwork = (n: Network | null): void    => { this.fromNetwork = n }
  setToNetwork = (n: Network | null): void      => { this.toNetwork = n }
  setFromAssets = (a: Asset[]): void            => { this.fromAssets = a }
  setFromAsset = (a: Asset | null): void        => { this.fromAsset = a }
  setToAsset = (a: Asset | null): void          => { this.toAsset = a }
  setFromAssetQuantity = (a: number): void      => { this.fromAssetQuantity = a }
  setTeleport = (b: boolean): void              => { this.teleport = b }

  setSettings = (
    settings: AppSettings,
    initialTo?: Network, 
    initialFrom?: Network
  ) => {
    this.allNetworks = settings.networks
    this.swapPairs = settings.swapPairs
    this.fromNetwork = initialFrom ?? null 
    this.toNetwork = initialTo ?? null 
  }
}

export default SwapStore
