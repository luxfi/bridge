import type { Network, Asset } from '@luxfi/core'

interface SwapState {
  get fromNetworks(): Network[]
  get toNetworks(): Network[]
  get to() : Network | null
  get from() : Network | null
  get assetsAvailable() : Asset[] 
  get asset() : Asset | null
  get teleport() : boolean
  get amount() : number
  setFrom(n: Network | null) : void
  setTo(n: Network | null): void 
  setAsset(a: Asset | null): void
  setAmount(a: number): void
  setTeleport(b: boolean): void

  setNetworks(
    networks: Network[], 
    initialTo?: Network, 
    initialFrom?: Network
  ): void

}

export {
  type SwapState as default
}
