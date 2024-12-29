import { createContext, useContext, useRef, type PropsWithChildren } from 'react'

import type AppSettings from '@/domain/types/app-settings'
const SettingsContext = createContext<React.MutableRefObject<AppSettings | null> | null>(null)

const SettingsProvider: React.FC<{
  settings?: AppSettings | null
} & PropsWithChildren> = ({ 
  children, 
  settings=null 
}) => {

  const settingsRef = useRef<AppSettings | null>(settings)

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
