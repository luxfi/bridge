import { getTokenPrice } from "@/domain/tokens"
import { isExitFromLux, BRIDGE_FEE_RATE } from "./quote"

export const getRate = async (
  fromNetwork: string,
  fromAsset: string,
  toNetwork: string,
  toAsset: string,
  amount: number,
  version: 'mainnet' | 'testnet',
) => {

  const [sourcePrice, destinationPrice] = await Promise.all([
    getTokenPrice(fromAsset),
    getTokenPrice(toAsset)
  ])

  const rawReceiveAmount = amount * sourcePrice / destinationPrice
  const feeRate = isExitFromLux(fromNetwork, toNetwork) ? BRIDGE_FEE_RATE : 0
  const feeAmount = rawReceiveAmount * feeRate
  const receiveAmount = rawReceiveAmount - feeAmount
  const feeUsd = feeAmount * destinationPrice

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