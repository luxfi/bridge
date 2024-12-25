import type { PropsWithChildren } from 'react'

import { SettingsProvider } from '@/contexts/settings'
import type BridgeSettings from '@/domain/types/app-settings'

const Contexts: React.FC<{
  settings?: BridgeSettings
} & PropsWithChildren> = ({ 
  settings, 
  children 
}) => {

  return (
    <SettingsProvider settings={settings}>
      {children}
    </SettingsProvider>
  )
}

export default Contexts
