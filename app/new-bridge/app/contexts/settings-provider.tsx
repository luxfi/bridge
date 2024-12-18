import { 
  createContext, 
  useContext, 
  type PropsWithChildren 
} from 'react'

import { BridgeAppSettings } from '@/types/bridge-app-settings'

// Type for the Settings Container
type SettingsContainer = {
  settings: BridgeAppSettings
};

// Create the Context
const SettingsContext = createContext<SettingsContainer | null>(null)

// Provider Component
const SettingsProvider: React.FC<{
  settings: BridgeAppSettings
} & PropsWithChildren> = ({ 
  children, 
  settings 
}) => {
  return (
    <SettingsContext.Provider value={{ settings }}>
      {children}
    </SettingsContext.Provider>
  );
};

// Hook to Access Settings
const useSettings = (): BridgeAppSettings => {
  const container = useContext(SettingsContext)

  if (!container) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }

  return container.settings
};

// Hook to Access the Entire Settings Container
const useSettingsContainer = (): SettingsContainer => {
  const container = useContext(SettingsContext)

  if (!container) {
    throw new Error('useSettingsContainer must be used within a SettingsProvider')
  }

  return container
};

export {
  SettingsProvider,
  useSettings,
  useSettingsContainer,
  SettingsContext
};
