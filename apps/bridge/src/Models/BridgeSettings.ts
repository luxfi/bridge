import { type CryptoNetwork } from './CryptoNetwork'
import { type Exchange } from './Exchange'

export type BridgeSettings = {
  exchanges: Exchange[]
  networks: CryptoNetwork[]
  sources?: Route[]
  destinations?: Route[]
}

export type Route = {
  network: string
  asset: string
}