import { convert, feeInUsd } from "./quote"

// The same conversion as a quote, under different field names — this is what the
// UI polls while the user is typing, so if it disagreed with getQuote the number
// would change at the moment of committing. It projects from `convert` rather
// than recomputing so that it cannot.
export const getRate = async (
  fromNetwork: string,
  fromAsset: string,
  toNetwork: string,
  toAsset: string,
  amount: number,
  version: 'mainnet' | 'testnet',
) => {

  const { receiveAmount, feeAmount, feeRate } = convert(fromNetwork, fromAsset, toNetwork, toAsset, amount)
  const feeUsd = await feeInUsd(toAsset, feeAmount)

  return {
    wallet_fee_in_usd: feeUsd,
    wallet_fee: feeRate,
    wallet_receive_amount: receiveAmount,
    manual_fee_in_usd: feeUsd,
    manual_fee: feeRate,
    manual_receive_amount: receiveAmount,
    avg_completion_time: {
      total_minutes: 2,
      total_seconds: 0,
      total_hours: 0,
    },
    fee_usd_price: feeUsd,
  }
}
