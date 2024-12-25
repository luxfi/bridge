import { 
  computed, 
  makeObservable, 
  observable, 
  action,
} from 'mobx'

import type { Asset, Network } from '@luxfi/core'
import type SwapState from '../types/swap-state' 

class SwapStore implements SwapState {

  private _to: Network
  private _from: Network 
  private _assetsAvailable: Asset[]
  private _asset: Asset 

  constructor(
    networks: Network[], 
    initialTo?: Network, 
    initialFrom?: Network
  ) {
    
    this._from = initialFrom ?? networks[0] 
    this._to = initialTo ?? networks[0] 

      // TODO
    this._assetsAvailable = this._from.currencies
    this._asset = this._from.currencies[0]

    makeObservable<
      SwapStore, 
        '_to' | 
        '_from' |
        '_asset' |
        '_assetsAvailable'  
    >(this, {
      _to : observable.shallow,
      _from: observable.shallow,
      _asset: observable.shallow,
      _assetsAvailable: observable.shallow,
    })

    makeObservable(this, {
      from: computed,
      to: computed,
      assetsAvailable: computed,
      asset: computed,
      setFrom: action,
      setTo: action,
      setAsset: action
    })

  }

  get to() : Network {
    return this._to
  }

  get from() : Network {
    return this._from
  }

  get assetsAvailable() : Asset[] {
    return this._assetsAvailable
  }

  get asset() : Asset | null {
    return this._asset
  }

  setFrom = (n: Network) => {
    this._from = n
  }

  setTo = (n: Network) => {
    this._to = n
  }

  setAsset = (a: Asset) => {
    this._asset = a
  }

}

export default SwapStore

