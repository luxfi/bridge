import { useContext } from 'react'

import type AppSettings from '@/domain/types/app-settings'
import { SettingsContext } from './settings'
import { LuxkitContext } from './luxkit'
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
  const luxKitRef = useContext(LuxkitContext)
  if (!luxKitRef) {
    throw new Error('useLux() must be within LuxkitInitializerContext!')
  }
  luxKitRef.initialize(settings.networks)
  settingsRef.current = settings
}

export default useSetSettings
