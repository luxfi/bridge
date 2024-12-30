import axios from 'axios'
import type AppSettings from '@/domain/types/app-settings'

import swapPairs from './swap-pairs'

const getSettings = async (): Promise<AppSettings | undefined> => {

  const { data } = await axios.get(
    `https://api-bridge.lux.network/api/settings?version=mainnet`
  )

  data.swapPairs = swapPairs

  return data as AppSettings ?? undefined
}

export default getSettings
