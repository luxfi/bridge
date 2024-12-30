import type { Asset } from '@luxfi/core'
import type AppSettings from './app-settings'

interface BackendService {
  getSettings: () => Promise<AppSettings | undefined> 
  getAssetPrice: (a: Asset) => Promise<number | undefined>
}

export {
  type BackendService as default
}

