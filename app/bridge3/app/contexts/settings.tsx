import { createContext, useContext, type PropsWithChildren } from 'react'

import type AppSettings from '@/domain/types/app-settings'

interface AppSettingsRef {
  settings: AppSettings | undefined
}

const SettingsContext = createContext<AppSettingsRef | null>({
  settings: undefined
} satisfies AppSettingsRef)

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

const useSettingsRef = (): AppSettingsRef => {
  const ref = useContext(SettingsContext)

  if (!ref ) {
    throw new Error('useSettingsRef() must be used within the scope of a SettingsProvider!')
  }

  return ref
}


const useSettings = (): AppSettings => {
  const ref = useContext(SettingsContext)

  if (!ref || !ref.settings) {
    throw new Error('SettingsProvider not ititialized!')
  }

  return ref.settings
};

export {
  SettingsProvider,
  useSettingsRef,
  useSettings,
  type AppSettingsRef
}
