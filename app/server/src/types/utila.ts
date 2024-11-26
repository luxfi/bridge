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
  },
  assets: Record<string, string>
}

export type UTILA_TRANSACTION_CREATED = {
  id: string,
  vault: string,
  type: string,
  resourceType: string,
  resource: string,
}

export type UTILA_TRANSACTION_STATE_UPDATED = {
  id: string,
  vault: string,
  type: string,
  details: {
    transactionStateUpdated: {
      newState: string
    }
  },
  resourceType: string,
  resource: string,
}