import { getTokenPrice } from "@/domain/tokens"

export const getQuote = async (
  fromNetwork: string, 
  fromAsset: string, 
  toNetwork: string, 
  toAsset: string, 
  amount: number, 
  refuel: number, 
  useDepositAddress: string 
) => {

  const [sourcePrice, destinationPrice] = await Promise.all([
    getTokenPrice(fromAsset), 
    getTokenPrice(toAsset)
  ])

  return ({
    quote: {
      receive_amount: (amount * sourcePrice) / destinationPrice,
      min_receive_amount: 0.975,
      blockchain_fee: 0.145766, // we need to estimate blockchain fee.
      service_fee: 0.01, // our bridge service fee is 1%. or We should make no fee for our bridge currently.
      avg_completion_time: "00:00:47.4595530", // it should be about 20 min for btc, and 3 ~ 4 mins for evm chains.
      refuel_in_source: null,
      slippage: 0.025,
      total_fee: 0.245766,
      total_fee_in_usd: 0.245766
    },
    refuel: null,
    reward: {}
  })
}