import { createContext, useContext, useRef, type PropsWithChildren } from 'react'

import type AppSettings from '@/domain/types/app-settings'
const SettingsContext = createContext<React.MutableRefObject<AppSettings> | null>(null)

const SettingsProvider: React.FC<{
  appSettings: AppSettings
} & PropsWithChildren> = ({ 
  children, 
  appSettings 
}) => {

  const settingsRef = useRef<AppSettings>(appSettings)

  return (
    <SettingsContext.Provider value={settingsRef}>
      {children}
    </SettingsContext.Provider>
  )
}

const useSettings = (): AppSettings => {
  const ref = useContext(SettingsContext)

  if (!ref || !ref.current) {
    throw new Error('SettingsProvider not ititialized!')
  }

  return ref.current
}

export {
  SettingsProvider as default,
  SettingsContext,
  useSettings,
}
