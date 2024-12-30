import { useContext } from 'react'

import type AppSettings from '@/domain/types/app-settings'
import { SettingsContext } from './settings'
import { LuxkitInitializerContext } from './luxkit'
import { useInitializeSwapState } from './swap-state'
import type { Network } from '@luxfi/core'

const useSetSettings = (
  settings: AppSettings,
  fromInitial?: Network, 
  toInitial?: Network 
): void => {

  useInitializeSwapState(
    settings,
    fromInitial,
    toInitial
  )
  const settingsRef = useContext(SettingsContext)
  if (!settingsRef) {
    throw new Error('useSetSettings() must be within SettingsProvider and SwapStateProvider!')
  }
<<<<<<< HEAD
  settingsRef.settings = settings
  const initializeLuxkit = useContext(LuxkitInitializerContext)
  if (!initializeLuxkit) {
    throw new Error('useSetSettings() must be within LuxkitInitializerContext!')
  }
  initializeLuxkit(settings.networks)
=======
  settingsRef.current = settings
>>>>>>> 41338a68568d3b9b8b8eeaa208403e94f9f255e2
}

export default useSetSettings
