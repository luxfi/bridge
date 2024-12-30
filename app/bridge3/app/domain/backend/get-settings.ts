import axios from 'axios'
import type AppSettings from '@/domain/types/app-settings'

const getSettings = async (): Promise<AppSettings | undefined> => {

  const { data } = await axios.get(
    import.meta.env.VITE_SERVER_URI + '/api/settings?version=' + import.meta.env.VITE_NET_VERSION
  )
  return data ?? undefined
}

export default getSettings
