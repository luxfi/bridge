import { 
  computed, 
  makeObservable, 
  observable, 
  action,
  type IReactionDisposer,
} from 'mobx'

import type { Asset, Network } from '@luxfi/core'
import type SwapState from '../types/swap-state' 

import onNetworksOrRouteChange from './logic/on-networks-or-route-change'
import onFromNetworkChange from './logic/on-from-network-change'
import onFromAssetChange from './logic/on-from-asset-change'
import onToNetworksChange from './logic/on-to-networks-change'
import onToNetworkChange from './logic/on-to-network-change'

class SwapStore implements SwapState {

  private _fromNetworks: Network[] = []
  private _toNetworks: Network[] = []
  private _fromNetwork: Network | null = null
  private _toNetwork: Network | null = null
  private _fromAssets: Asset[] = []
  private _fromAsset: Asset | null = null
  private _toAsset: Asset | null = null
  private _fromAssetQuantity: number = 0
  private _teleport: boolean = true
  private _networks: Network[] = []
  private _swapPairs: Record<string, string[]>  = {}

  private _disposers: IReactionDisposer[] = []

  constructor(
    networks: Network[],
    swapPairs: Record<string, string[]>,  
    initialTo?: Network, 
    initialFrom?: Network
  ) {
    
    makeObservable<
      SwapStore, 
      '_networks' | 
      '_fromNetwork' |
      '_toNetwork' | 
      '_fromNetworks' | 
      '_toNetworks' | 
      '_fromAssets' | 
      '_fromAsset' |
      '_toAsset' |
      '_fromAssetQuantity' |
      '_teleport'
    >(this, {
      _networks: observable.shallow,
      _fromNetwork: observable.shallow,
      _toNetwork : observable.shallow,
      _fromNetworks: observable.shallow,
      _toNetworks : observable.shallow,
      _fromAssets: observable.shallow,
      _fromAsset: observable.shallow,
      _toAsset: observable.shallow,
      _fromAssetQuantity: observable,
      _teleport: observable
    })

    makeObservable(this, {
      allNetworks: computed,
      fromNetworks: computed,
      toNetworks: computed,
      fromNetwork: computed,
      toNetwork: computed,
      fromAssets: computed,
      fromAsset: computed,
      toAsset: computed,
      fromAssetQuantity: computed,
      teleport: computed,
      setFromNetwork: action.bound,
      setToNetwork: action.bound,
      setFromAssets: action,
      setFromAsset: action.bound,
      setToAsset: action.bound,
      setFromAssetQuantity: action.bound,
      setTeleport: action.bound,
      reset: action.bound,
    })

    this._networks = networks
    this._swapPairs = swapPairs
    this._fromNetwork = initialFrom ?? null 
    this._toNetwork = initialTo ?? null
  }

  initialize = () => {

      // Note: mobx reaction() returns the disposer function.

      // Also, these should be called in REVERSE order of causality 
      // for the effects to cascade properly the first time.
    this._disposers.push(onToNetworkChange(this))
    this._disposers.push(onToNetworksChange(this))
    this._disposers.push(onFromAssetChange(this))
    this._disposers.push(onFromNetworkChange(this))
    this._disposers.push(onNetworksOrRouteChange(this))
  }

    // must be called explicitly
  dispose = () => { this._disposers.forEach((d) => {d()}) }

  get allNetworks(): Network[]            { return this._networks }
  get fromNetworks() : Network[]          { return this._fromNetworks }
  get toNetworks() : Network[]            { return this._toNetworks }
  get fromNetwork() : Network | null      { return this._fromNetwork }
  get toNetwork() : Network| null         { return this._toNetwork }
  get fromAssets() : Asset[]              { return this._fromAssets }
  get fromAsset() : Asset | null          { return this._fromAsset }
  get toAsset() : Asset | null            { return this._toAsset }
  get fromAssetQuantity() : number        { return this._fromAssetQuantity }
  get teleport() : boolean                { return this._teleport }
  get swapPairs() : Record<string, string[]>  { return this._swapPairs }

  setFromNetworks = (n: Network[])        => { this._fromNetworks = n }
  setToNetworks = (n: Network[])          => { this._toNetworks = n }
  setFromNetwork = (n: Network | null)    => { this._fromNetwork = n }
  setToNetwork = (n: Network | null)      => { this._toNetwork = n }
  setFromAssets = (a: Asset[])            => { this._fromAssets = a }
  setFromAsset = (a: Asset | null)        => { this._fromAsset = a }
  setToAsset = (a: Asset | null)          => { this._toAsset = a }
  setFromAssetQuantity = (a: number): void => { this._fromAssetQuantity = a }
  setTeleport = (b: boolean)              => { this._teleport = b }

  reset = (
    networks: Network[], 
    swapPairs: Record<string, string[]>,  
    initialTo?: Network, 
    initialFrom?: Network
  ) => {
    this._networks = networks
    this._swapPairs = swapPairs
    this._fromNetwork = initialFrom ?? null 
    this._toNetwork = initialTo ?? null 
  }

}

export default SwapStore
