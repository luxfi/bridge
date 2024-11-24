export type Desposit = {
    address: string,
    memo?: string
}

export type Network = {
    display_name: string,
    internal_name: string,
    native_currency: string,
    logo: string,
    is_testnet: boolean,
    is_featured: boolean,
    average_completion_time: string,
    chain_id: number | null,
    status: string,
    type: string,
    deposit_address?: Desposit,
    refuel_amount_in_usd: number,
    transaction_explorer_template: string,
    account_explorer_template: string,
    node: string,
    currencies: Token[],
}

export type Token = {
    name: string,
    asset: string,
    logo: string,
    contract_address: string | null,
    decimals: number,
    status: string,
    is_deposit_enabled: boolean,
    is_withdrawal_enabled: boolean,
    is_refuel_enabled: boolean,
    max_withdrawal_amount: number,
    deposit_fee: number,
    withdrawal_fee: number,
    source_base_fee: number,
    destination_base_fee: number,
    is_native: boolean
}