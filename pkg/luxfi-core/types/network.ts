import type Asset from './asset'
import type DepositAddress from './deposit-address'
import type NetworkType from './network-type'

type NetworkNode = { url: string } | string

interface NetworkMetadata {
  multicall3?: {
      address: `0x${string}`
      blockCreated: number
  }
  ensRegistry?: {
      address: `0x${string}`
  }
  ensUniversalResolver?: {
      address: `0x${string}`
  }
  WatchdogContractAddress?: `0x${string}`
  L1Network?: string
}

interface _ManagedAccount {
  address: `0x${string}`
}

type ManagedAccount = _ManagedAccount | string

interface Network {
  
  display_name: string
  internal_name: string
  transaction_explorer_template: string
  account_explorer_template: string
  currencies: Asset[]
  refuel_amount_in_usd?: number
  chain_id: string | null
  type: NetworkType
  created_date?: string
  is_featured: boolean
  nodes: NetworkNode[]
  managed_accounts: ManagedAccount[]
  metadata: NetworkMetadata | null | undefined
  img_url?: string

  id?: number,
  native_currency: string | null
  is_testnet: boolean | null
  logo: string | null
  average_completion_time: string | null
  listing_date?: Date | null

  status: string
  deposit_address?: DepositAddress
}

export {
  type Network as default
}
