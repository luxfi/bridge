import { useContext } from 'react'

import type AppSettings from '@/domain/types/app-settings'
import { SettingsContext } from './settings'
import { useInitializeSwapState } from './swap-state'
import type { Network } from '@luxfi/core'

const useSetSettings = (
  settings: AppSettings,
  fromInitial?: Network, 
  toInitial?: Network 
): void => {


  useInitializeSwapState(
    settings.networks,
    fromInitial,
    toInitial
  )
  const settingsRef = useContext(SettingsContext)
  if (!settingsRef) {
    throw new Error('useSetSettings() must be within SettingsProvider and SwapStateProvider!')
  }
  settingsRef.settings = settings
}

export {
  useSetSettings as default
}