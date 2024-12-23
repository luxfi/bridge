export const getLimits = (
  fromAsset: string,
  toAsset: string,
  version: 'testnet' | 'mainnet' | undefined
) => {
  return {
    manual_min_amount: 0.1,
    manual_min_amount_in_usd: 0,
    max_amount: 100,
    max_amount_in_usd: 0,
    wallet_min_amount: 0,
    wallet_min_amount_in_usd: 0
  }
}