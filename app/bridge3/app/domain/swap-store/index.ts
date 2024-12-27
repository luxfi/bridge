import { 
  computed, 
  makeObservable, 
  observable, 
  action,
  type IReactionDisposer,
  reaction,
} from 'mobx'

import type { Asset, Network } from '@luxfi/core'
import type SwapState from '../types/swap-state' 
import { SWAP_PAIRS as TELEPORT_SWAP_PAIRS } from '../constants/teleport'
import { SWAP_PAIRS as NON_TELEPORT_SWAP_PAIRS } from '../constants/non-teleport'

class SwapStore implements SwapState {

  private _fromNetworks: Network[] = []
  private _toNetworks: Network[] = []
  private _from: Network | null = null
  private _to: Network | null = null
  private _possibleAssets: Asset[] = []
  private _asset: Asset | null = null
  private _amount: number = 0
  private _teleport: boolean = true
  private _networks: Network[] = []

  private _disposers: IReactionDisposer[] = []

  constructor(
    networks: Network[], 
    initialTo?: Network, 
    initialFrom?: Network
  ) {
    
    makeObservable<
      SwapStore, 
      '_networks' | 
      '_from' |
      '_to' | 
      '_fromNetworks' | 
      '_toNetworks' | 
      '_possibleAssets' | 
      '_asset' |
      '_amount' |
      '_teleport'
    >(this, {
      _networks: observable.shallow,
      _from: observable.shallow,
      _to : observable.shallow,
      _fromNetworks: observable.shallow,
      _toNetworks : observable.shallow,
      _possibleAssets: observable.shallow,
      _asset: observable.shallow,
      _amount: observable,
      _teleport: observable
    })

    makeObservable(this, {
      from: computed,
      to: computed,
      fromNetworks: computed,
      toNetworks: computed,
      possibleAssets: computed,
      asset: computed,
      amount: computed,
      teleport: computed,
      setFrom: action.bound,
      setTo: action.bound,
      setPossibleAssets: action,
      setAsset: action.bound,
      setAmount: action.bound,
      setTeleport: action.bound,
      setNetworks: action.bound,
    })

    this._networks = networks
    this._from = initialFrom ?? null 
    this._to = initialTo ?? null
  }

  initialize = () => {
      // reaction() returns the disposer function
    this._disposers.push(
      reaction(
        () => ({
          networks: this._networks,
          teleport: this._teleport,   
        }),
        ({ networks, teleport}) => {

            // FROM
          if (teleport) {
            this.setFromNetworks(networks.filter((n: Network) => ( n.type === 'evm' && n.status === 'active')))
          }
          else {
            this.setFromNetworks(networks.filter((n: Network) => ( n.type !== 'evm' && n.status === 'active')))
          }
          this.setFrom(this._fromNetworks.length ? this._fromNetworks[0] : null)
          
            // to maintain previous logic, though fromAsset is not in the current ui
          const fromAsset = this.from?.currencies.find((c: Asset) => c.status === 'active')

            // TO
          let toNets: Network[]
          //if (teleport) {
            toNets = fromAsset ? (
              networks.map((n: Network) => ({
                ...n,
                currencies: n.currencies.filter(
                  (c: Asset) => (TELEPORT_SWAP_PAIRS[fromAsset.asset].includes(c.asset))
                ),
              })).filter((n: Network) => n.currencies.length > 0 && n.type === 'evm')  
            ) : []    
          //}
          /*  This is how the old code was... not sure how it works .  grrr
          else {
            toNets = fromAsset ? (
              networks.map((n: Network) => ({
                ...n,
                currencies: n.currencies.filter(
                  (c: Asset) => (NON_TELEPORT_SWAP_PAIRS[fromAsset.asset].includes(c.asset))
                ),
              })).filter((n: Network) => n.currencies.length > 0 && n.type !== 'evm')  
            ) : []   
          }
          */
          this.setToNetworks(toNets)
          this.setTo(this._toNetworks.length ? this._toNetworks[0] : null)

            // ASSETS / ASSET
          this.setPossibleAssets(this.to?.currencies.filter((c: Asset) => (c.status === 'active')) ?? [])
          this.setAsset(this._possibleAssets.length ? this._possibleAssets[0] : null)
        },
        { fireImmediately: true}
      )
    )
  }

    // must be called explicitly
  dispose = () => { this._disposers.forEach((d) => {d()}) }

  get from() : Network | null       { return this._from }
  get to() : Network| null          { return this._to }
  get fromNetworks() : Network[]    { return this._fromNetworks }
  get toNetworks() : Network[]      { return this._toNetworks }
  get possibleAssets() : Asset[] { return this._possibleAssets }
  get asset() : Asset | null { return this._asset }
  get amount() : number { return this._amount }
  get teleport() : boolean { return this._teleport }

  setAmount = (a: number): void => { this._amount = a }
  setFromNetworks = (n: Network[]) => { this._fromNetworks = n }
  setToNetworks = (n: Network[]) => { this._toNetworks = n }
  setPossibleAssets = (a: Asset[]) => { this._possibleAssets = a }
  setFrom = (n: Network | null) => { this._from = n }
  setTo = (n: Network | null) => { this._to = n }
  setAsset = (a: Asset | null) => { this._asset = a }
  setTeleport = (b: boolean) => { this._teleport = b }

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
