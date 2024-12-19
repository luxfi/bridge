interface Token {
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

export {
  type Token as default 
}