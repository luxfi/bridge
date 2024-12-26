import { createContext, useContext, type PropsWithChildren } from 'react'

import type AppSettings from '@/domain/types/app-settings'

interface AppSettingsRef {
  settings: AppSettings | undefined
}

const SettingsContext = createContext<AppSettingsRef | null>(null)

const SettingsProvider: React.FC<{
  settings?: AppSettings
} & PropsWithChildren> = ({ 
  children, 
  settings 
}) => {
  return (
    <SettingsContext.Provider value={{settings}}>
      {children}
    </SettingsContext.Provider>
  )
}

const useSettings = (): AppSettings => {
  const ref = useContext(SettingsContext)

  if (!ref || !ref.settings) {
    throw new Error('SettingsProvider not ititialized!')
  }

  return ref.settings
}

export {
  SettingsProvider as default,
  SettingsContext,
  useSettings,
}
