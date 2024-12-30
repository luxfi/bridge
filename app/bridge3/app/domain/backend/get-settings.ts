import axios from 'axios'
import type AppSettings from '@/domain/types/app-settings'

import swapPairs from './swap-pairs'

const getSettings = async (): Promise<AppSettings | undefined> => {

  const { data } = await axios.get(
    import.meta.env.VITE_SERVER_URI + '/api/settings?version=' + import.meta.env.VITE_NET_VERSION
  )

  data.swapPairs = swapPairs

  return data as AppSettings ?? undefined
}

export default getSettings
