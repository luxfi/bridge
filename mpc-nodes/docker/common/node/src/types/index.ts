import Web3 from "web3"
import { RegisteredSubscription } from "web3/lib/commonjs/eth.exports"

export type CONTRACTS = {
  [key: string]: string
}
export type SETTINGS = {
  RPC: string[]
  LuxETH: CONTRACTS
  LuxBTC: CONTRACTS
  WSHM: CONTRACTS
  Teleporter: CONTRACTS
  NetNames: {
    [key: string]: string
  }
  DB: string
  Msg: string
  DupeListLimit: string
  SMTimeout: number
  NewSigAllowed: boolean
  SigningManagers: string[]
  KeyStore: string
}

export type SIGN_REQUEST = {
  tokenAmount: string
  web3Form: Web3<RegisteredSubscription>
  vault: boolean
  decimals: number
  receiverAddressHash: string
  toNetworkId: string
  toTokenAddress: string
  hashedTxId: string
  nonce: string
}
