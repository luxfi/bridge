import type { BridgeSettings } from '@/Models/BridgeSettings'
import BridgeApiClient from '@/lib/BridgeApiClient'

const getBridgeSettings = async (): Promise<BridgeSettings | undefined> => {

  const apiClient = new BridgeApiClient()
  const data = await apiClient.GetSettingsAsync()

  if (data) {
    return data
  } else {
    return undefined
  }
}

export default getBridgeSettings
