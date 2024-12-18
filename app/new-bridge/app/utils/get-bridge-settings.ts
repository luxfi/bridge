import type { BridgeSettings } from '@/types/bridge-settings'
import axios from 'axios'
// import BridgeApiClient from '@/lib/bridge-api-client'

const getBridgeSettings = async (): Promise<BridgeSettings | undefined> => {

  // const apiClient = new BridgeApiClient()
  // const data = await apiClient.GetSettingsAsync()

  const { data } = await axios.get(
    `https://api-bridge.lux.network/api/settings?version=mainnet`
  )

  if (data) {
    return data
  } else {
    return undefined
  }
}

export default getBridgeSettings
