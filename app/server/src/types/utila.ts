export type UTILA_NETWORK = {
  $typeName: string
  name: string
  displayName: string
  testnet: boolean
  nativeAsset: string
  custom: boolean
  caipDetails: {
    $typeName: string
    chainId: string
    namespace: string
    reference: string
  }
}