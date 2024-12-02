import type { ManagedAccount, Metadata, NetworkCurrency, NetworkType } from './CryptoNetwork'

export type LayerStatus = 'active' | 'inactive' | 'insufficient_liquidity'
export type Layer = {
    display_name: string
    internal_name: string
    logo: string
    is_testnet: boolean
    is_featured: boolean
    chain_id: string | null | undefined
    refuel_amount_in_usd: number
    type: NetworkType,
    transaction_explorer_template: string
    account_explorer_template: string,
    assets: NetworkCurrency[]
    metadata: Metadata | null | undefined
    managed_accounts: string[]
    nodes: string[]
    // managed_accounts: ManagedAccount[]
    // nodes: NetworkNodes[]
}

export type NetworkNodes = {
    url: string
}