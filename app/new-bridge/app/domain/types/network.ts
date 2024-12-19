import Deposit from './deposit'
import Token from './token'

interface Network {
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
  deposit_address?: Deposit,
  refuel_amount_in_usd: number,
  transaction_explorer_template: string,
  account_explorer_template: string,
  node: string,
  currencies: Token[],
}

export {
  type Network as default
}
