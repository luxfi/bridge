import { getTokenPrice } from "@/domain/tokens"

// 0% fee bridging IN from external chains
// 1% fee on every transfer FROM Lux/Zoo (to each other, or out to external)
const BRIDGE_FEE_RATE = 0.01
const LUX_ZOO_NETWORKS = ['LUX_MAINNET', 'LUX_TESTNET', 'ZOO_MAINNET', 'ZOO_TESTNET']

function isExitFromLux(fromNetwork: string, _toNetwork: string): boolean {
  return LUX_ZOO_NETWORKS.includes(fromNetwork)
}

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

  const rawReceiveAmount = (amount * sourcePrice) / destinationPrice
  const feeRate = isExitFromLux(fromNetwork, toNetwork) ? BRIDGE_FEE_RATE : 0
  const serviceFee = rawReceiveAmount * feeRate
  const receiveAmount = rawReceiveAmount - serviceFee
  const serviceFeeUsd = serviceFee * destinationPrice

  return ({
    quote: {
      receive_amount: receiveAmount,
      min_receive_amount: receiveAmount * (1 - 0.025),
      blockchain_fee: 0,
      service_fee: feeRate,
      avg_completion_time: "00:03:00",
      refuel_in_source: null,
      slippage: 0.025,
      total_fee: serviceFee,
      total_fee_in_usd: serviceFeeUsd
    },
    refuel: null,
    reward: {}
  })
}

export { isExitFromLux, BRIDGE_FEE_RATE }