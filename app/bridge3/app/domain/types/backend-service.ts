import type AppSettings from './app-settings'

interface BackendService {
  getSettings: () => Promise<AppSettings | undefined> 
}

export {
  type BackendService as default
}

