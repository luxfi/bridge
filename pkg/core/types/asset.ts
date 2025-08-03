interface Asset {
  name: string
  asset: string
  logo: string
  contract_address: string | null
  decimals: number
  status: string
  is_deposit_enabled: boolean
  is_withdrawal_enabled: boolean
  is_refuel_enabled: boolean
  max_withdrawal_amount: number
  deposit_fee: number
  withdrawal_fee: number
  source_base_fee: number
  destination_base_fee: number
  id?: number,
  price_in_usd?: number | null,
  precision?: number | null,
  listing_date?: Date,
  network_id?: number
  mint?: boolean
}

export {
  type Asset as default
}