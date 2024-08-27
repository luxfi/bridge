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
