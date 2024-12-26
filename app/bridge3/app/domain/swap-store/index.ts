import { 
  computed, 
  makeObservable, 
  observable, 
  action,
} from 'mobx'

import type { Asset, Network } from '@luxfi/core'
import type SwapState from '../types/swap-state' 

class SwapStore implements SwapState {

  private _from: Network | null
  private _to: Network | null
  private _fromNetworks: Network[] 
  private _toNetworks: Network[]
  private _assetsAvailable: Asset[]
  private _asset: Asset | null

  private _amount: number

  private _networks: Network[]

  constructor(
    networks: Network[], 
    initialTo?: Network, 
    initialFrom?: Network
  ) {
    
    this._networks = networks
    this._fromNetworks = networks
    this._toNetworks = networks

    this._from = initialFrom ?? networks[0] 
    this._to = initialTo ?? networks[1] 

      // TODO
    this._assetsAvailable = this._from.currencies
    this._asset = this._from.currencies[0]

    this._amount = 0

    makeObservable<
      SwapStore, 
        '_from' |
        '_to' | 
        '_fromNetworks' |
        '_toNetworks' | 
        '_asset' |
        '_assetsAvailable' |
        '_amount'

    >(this, {
      _from: observable.shallow,
      _to : observable.shallow,
      _fromNetworks: observable.shallow,
      _toNetworks : observable.shallow,
      _asset: observable.shallow,
      _assetsAvailable: observable.shallow,
      _amount: observable
    })

    makeObservable(this, {
      from: computed,
      to: computed,
      fromNetworks: computed,
      toNetworks: computed,
      assetsAvailable: computed,
      asset: computed,
      amount: computed,
      setFromNetworks: action.bound,
      setToNetworks: action.bound,
      setFrom: action.bound,
      setTo: action.bound,
      setAsset: action.bound,
      setNetworks: action.bound,
      setAmount: action.bound
    })
  }

  get from() : Network | null {
    return this._from
  }

  get to() : Network| null {
    return this._to
  }

  get fromNetworks() : Network[] {
    return this._fromNetworks
  }

  get toNetworks() : Network[] {
    return this._toNetworks
  }

  get assetsAvailable() : Asset[] {
    return this._assetsAvailable
  }

  get asset() : Asset | null {
    return this._asset
  }

  get amount() : number {
    return this._amount
  }

  setAmount = (a: number): void => {
    this._amount = a
  }

  setFrom = (n: Network | null) => {
    this._from = n
  }

  setTo = (n: Network | null) => {
    this._to = n
  }

  setFromNetworks = (n: Network[]) => {
    this._fromNetworks = n
  } 

  setToNetworks = (n: Network[]) => {
    this._toNetworks = n
  } 

  setAsset = (a: Asset | null) => {
    this._asset = a
  }

  setNetworks = (
    networks: Network[], 
    initialTo?: Network, 
    initialFrom?: Network
  ) => {
    this._networks = networks
    this._fromNetworks = networks
    this._toNetworks = networks

    this._from = initialFrom ?? networks[0] 
    this._to = initialTo ?? networks[1] 
  }

}

export default SwapStore

