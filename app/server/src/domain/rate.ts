import { getTokenPrice } from "@/domain/tokens"

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

  return {
    wallet_fee_in_usd: 10,
    wallet_fee: 0.1,
    wallet_receive_amount: amount,
    manual_fee_in_usd: 0,
    manual_fee: 0,
    manual_receive_amount: amount * sourcePrice / destinationPrice,
    avg_completion_time: {
      total_minutes: 2,
      total_seconds: 0,
      total_hours: 0,
    },
    fee_usd_price: 10,
  }
}