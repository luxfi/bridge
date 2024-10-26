import type { CryptoNetwork } from '@/Models/CryptoNetwork'
import type { Exchange } from '@/Models/Exchange'
import BridgeApiClient from '@/lib/BridgeApiClient'

const getApiSettings = async (
  swapId: string
): Promise<{
  networks?: CryptoNetwork[]
  exchanges?: Exchange[]
  error?: string
}> => {

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
  const { data: networkData } = await apiClient.GetLSNetworksAsync()
  const { data: exchangeData } = await apiClient.GetExchangesAsync()

  if (!networkData || !exchangeData) return {
    error: 'no network or exchange!' 
  }

  return {
    networks: networkData,
    exchanges: exchangeData,
  }

}

export default getApiSettings

