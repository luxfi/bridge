import axios from 'axios'
import type AppSettings from '@/domain/types/app-settings'



const getSettings = async (): Promise<AppSettings | undefined> => {

  const { data } = await axios.get(
    `https://api-bridge.lux.network/api/settings?version=mainnet`
  )

  return data ?? undefined
}

export default getSettings
