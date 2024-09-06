export type Network = {
    id: number,
    display_name: string | null,
    internal_name: string | null,
    native_currency: string | null,
    is_testnet: boolean | null,
    is_featured: boolean | null,
    logo: string | null,
    chain_id: string | null,
    type: string | null,
    average_completion_time: string | null,
    transaction_explorer_template: string | null,
    account_explorer_template: string | null,
    listing_date: Date | null,
}

export type Currency = {
    id: number,
    name: string | null,
    asset: string | null,
    logo: string | null,
    contract_address: string | null,
    decimals: number | null,
    price_in_usd: number | null,
    precision: number | null,
    is_native: boolean | null,
    listing_date: Date,
    network_id: number
}

export type Swap = {
    id: string,
    created_date: Date,
    source_network_id: number,
    source_network: Network,
    source_exchange: string | null,
    source_asset_id: number,
    source_asset: Currency,
    source_address: string,
    destination_network_id: number,
    destination_network: Network,
    destination_exchange: string | null,
    destination_asset_id: number,
    destination_asset: Currency,
    destination_address: string,
    refuel: boolean | null,
    use_deposit_address: boolean | null,
    requested_amount: number | null,
    status: string,
    fail_reason: string | null,
    metadata_sequence_number: number | null,
    block_number: number,
    deposit_address_id: number,
    deposit_address: {
        id: number,
        type: string,
        address: string
    },
}