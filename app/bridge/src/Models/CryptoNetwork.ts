export enum NetworkType {
    EVM = "evm",
    Starknet = "starknet",
    Solana = "solana",
    Cosmos = "cosmos",
    StarkEx = "stark_ex",
    ZkSyncLite = "zk_sync_lite",
    TON = "ton",
    Bitocoin = "btc",
    Cardano = "cardano",
    XRP = "xrp",
}

export type CryptoNetwork = {
    display_name: string
    internal_name: string
    logo?: string
    is_testnet: boolean
    is_featured: boolean
    chain_id: string | null | undefined
    status: 'active' | 'inactive'
    type: NetworkType
    native_currency:string,
    transaction_explorer_template: string
    account_explorer_template: string
    currencies: NetworkCurrency[]
    metadata: Metadata | null | undefined
    managed_accounts: string[]
    nodes: string[]
    // managed_accounts: ManagedAccount[]
    // nodes: NetworkNode[]
}

export type NetworkCurrency = {
    name: string
    asset: string
    logo: string
    contract_address: string | null | undefined
    decimals: number
    status: 'active' | 'inactive'
    is_deposit_enabled: boolean
    is_withdrawal_enabled: boolean
    is_refuel_enabled: boolean
    precision: number
    price_in_usd: number
    is_native: boolean
    mint?: boolean
}
export type NetworkNode = {
    url: string
}
export type ManagedAccount = {
    address: `0x${string}`
}
export type Metadata = {
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