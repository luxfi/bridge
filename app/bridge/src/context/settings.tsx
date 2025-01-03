"use client"

import { 
  type PropsWithChildren, 
  createContext, 
  useContext, 
} from "react"

import { BridgeAppSettings } from "@/Models/BridgeAppSettings"

type SettingsContainer = {
  settings: BridgeAppSettings
}
const SettingsContext = createContext<SettingsContainer | null>(null)

const SettingsProvider: React.FC<{
  settings: BridgeAppSettings
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

const useSettings = (): BridgeAppSettings => {

  const container = useContext<SettingsContainer | null>(SettingsContext)

  if (container === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider")
  }

  return container!.settings
}

const useSettingsContainer = (): SettingsContainer | null => {
  const container = useContext<SettingsContainer | null>(SettingsContext)
  if (container === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider")
  }
  return container
}

export {
  SettingsProvider,
  useSettings,
  useSettingsContainer,
  SettingsContext 
}
