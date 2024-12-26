import { 
  computed, 
  makeObservable, 
  observable, 
  action,
} from 'mobx'

import type { Asset, Network } from '@luxfi/core'
import type SwapState from '../types/swap-state' 
import { SWAP_PAIRS as TELEPORT_SWAP_PAIRS } from '../constants/teleport'
import { SWAP_PAIRS as NON_TELEPORT_SWAP_PAIRS } from '../constants/non-teleport'

class SwapStore implements SwapState {

  private _from: Network | null
  private _to: Network | null
  private _asset: Asset | null = null

  private _amount: number = 0

  private _teleport: boolean = true

  private _networks: Network[]

  constructor(
    networks: Network[], 
    initialTo?: Network, 
    initialFrom?: Network
  ) {
    
    makeObservable<
      SwapStore, 
        '_from' |
        '_to' | 
        '_asset' |
        '_amount' |
        '_teleport'

    >(this, {
      _from: observable.shallow,
      _to : observable.shallow,
      _asset: observable.shallow,
      _amount: observable,
      _teleport: observable
    })

    makeObservable(this, {
      from: computed,
      to: computed,
      fromNetworks: computed,
      toNetworks: computed,
      assetsAvailable: computed,
      asset: computed,
      amount: computed,
      teleport: computed,
      setFrom: action.bound,
      setTo: action.bound,
      setAsset: action.bound,
      setNetworks: action.bound,
      setAmount: action.bound,
      setTeleport: action.bound
    })

    this._networks = networks
    this._from = initialFrom ?? null 
    this._to = initialTo ?? null


  }

  get from() : Network | null {
    if (!this._from) {
      this._from = this.fromNetworks.length ? this.fromNetworks[0] : null
    }
    return this._from
  }

  get to() : Network| null {
    if (!this._to) {
      this._to = this.toNetworks.length ? this.toNetworks[0] : null
    }
    return this._to
  }

  get fromNetworks() : Network[] {

    if (this._teleport) {
      return this._networks.filter(
        (n: Network) => ( n.type === 'evm' && n.status === 'active')
      )
    }
    return this._networks.filter(
      (n: Network) => ( n.type !== 'evm' && n.status === 'active')
    )
  }

  get toNetworks() : Network[] {
      // to maintain previous logic, though fromAsset is not in the current ui
    const fromAsset = this.from?.currencies.find((c: Asset) => c.status === 'active')
    if (this._teleport) {
      return fromAsset ? (
        this._networks
          .map((n: Network) => ({
            ...n,
            currencies: n.currencies.filter(
              (c: Asset) => (TELEPORT_SWAP_PAIRS[fromAsset.asset].includes(c.asset))
            ),
          }))
          .filter((n: Network) => n.currencies.length > 0 && n.type === 'evm')  
      ) : []    
    }
    return fromAsset ? (
      this._networks
        .map((n: Network) => ({
          ...n,
          currencies: n.currencies.filter(
            (c: Asset) => (NON_TELEPORT_SWAP_PAIRS[fromAsset.asset].includes(c.asset))
          ),
        }))
        .filter((n: Network) => n.currencies.length > 0 && n.type !== 'evm')  
    ) : []   
  }

  get assetsAvailable() : Asset[] {
    return this.to?.currencies.filter((c: Asset) => (c.status === 'active')) ?? []
  }

  get asset() : Asset | null {
    if (!this._asset) {
      this._asset = this.assetsAvailable.length ? this.assetsAvailable[0] : null
    }
    return this._asset
  }

  get amount() : number {
    return this._amount
  }

  get teleport() : boolean {
    return this._teleport
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

  setAsset = (a: Asset | null) => {
    this._asset = a
  }

  setTeleport = (b: boolean) => {
    this._teleport = b
  }

  setNetworks = (
    networks: Network[], 
    initialTo?: Network, 
    initialFrom?: Network
  ) => {
    this._networks = networks
    this._from = initialFrom ?? networks[0] 
    this._to = initialTo ?? networks[1] 
  }

}

export default SwapStore
