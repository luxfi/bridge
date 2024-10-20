import type { BridgeSettings } from '@/Models/BridgeSettings'
import type { CryptoNetwork } from '@/Models/CryptoNetwork'
import type { Exchange } from '@/Models/Exchange'
import BridgeApiClient from '@/lib/BridgeApiClient'

const getBridgeSettings = async (
  swapId?: string // :aa TODO seems to be unused!
): Promise<
  BridgeSettings | { error: string } | undefined 
> => {

  if (swapId) {
    const isValidGuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        swapId
      )

    if (!isValidGuid) {
      return {
        error: 'invalid guid!'
      }
    }
    const apiClient = new BridgeApiClient()
    const { data: networks } = await apiClient.GetLSNetworksAsync()
    const { data: exchanges } = await apiClient.GetExchangesAsync()

    if (!networks || !exchanges) return {
      error: 'no network or exchange!' 
    }

    return {
      networks,
      exchanges,
    }
  }

  const apiClient = new BridgeApiClient()
  const { data } = await apiClient.GetSettingsAsync()

  return data
}

export default getBridgeSettings
