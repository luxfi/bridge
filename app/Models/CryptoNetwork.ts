export enum NetworkType {
    EVM = "evm",
    Starknet = "starknet",
    Solana = "solana",
    Cosmos = "cosmos",
    StarkEx = "stark_ex",
    ZkSyncLite = "zk_sync_lite",
    TON = "ton",
    Bitocoin = "btc"
}

export class CryptoNetwork {
    display_name: string;
    internal_name: string;
    transaction_explorer_template: string;
    account_explorer_template: string;
    currencies: NetworkCurrency[];
    refuel_amount_in_usd: number;
    chain_id: string;
    type: NetworkType;
    created_date: string;
    is_featured: boolean;
    nodes: NetworkNode[];
    managed_accounts: ManagedAccount[];
    metadata: Metadata | null | undefined;
    img_url?: string
}

export class NetworkCurrency {
    asset: string;
    is_refuel_enabled: boolean;
    is_native: boolean
    //TODO may be plain string
    contract_address?: `0x${string}` | null;
    decimals: number;
    precision: number;
    price_in_usd: number;
    availableInSource: boolean;
    availableInDestination: boolean;
}
export class NetworkNode {
    url: string;
}
export class ManagedAccount {
    address: `0x${string}`;
}
export class Metadata {
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