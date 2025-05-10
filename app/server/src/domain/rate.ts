import { getTokenPrice } from "@/domain/tokens"
import { getNetworkWithdrawalTimeStatistics } from "@/domain/swaps"
import { prisma } from "@/prisma-instance"

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

  // Get real withdrawal time statistics for the destination network if available
  let withdrawalTimeStats = { total_seconds: 0, total_minutes: 0, total_hours: 0 }
  
  try {
    const network = await prisma.network.findFirst({
      where: { internal_name: toNetwork }
    })

    if (network) {
      const stats = await getNetworkWithdrawalTimeStatistics(network.id)
      if (stats && stats.total_withdrawals > 0) {
        // Use the last 24 hours average if available, otherwise use all-time average
        const avgSeconds = stats.last_24h_withdrawals > 0 
          ? stats.last_24h_avg_seconds 
          : stats.avg_time_seconds

        withdrawalTimeStats = {
          total_seconds: avgSeconds % 60,
          total_minutes: Math.floor(avgSeconds / 60) % 60,
          total_hours: Math.floor(avgSeconds / 3600)
        }
      }
    }
  } catch (error) {
    console.error('Error getting withdrawal time statistics:', error)
    // Use default values if stats are not available
    withdrawalTimeStats = {
      total_minutes: 2,
      total_seconds: 0,
      total_hours: 0,
    }
  }

  return {
    wallet_fee_in_usd: 10,
    wallet_fee: 0.1,
    wallet_receive_amount: amount,
    manual_fee_in_usd: 0,
    manual_fee: 0,
    manual_receive_amount: amount * sourcePrice / destinationPrice,
    avg_completion_time: withdrawalTimeStats,
    fee_usd_price: 10,
  }
}