import type { PropsWithChildren } from 'react'

import { SettingsProvider } from '@/contexts/settings'
import type { BridgeSettings } from '@/types/bridge-settings'
import { BridgeAppSettings } from '@/types/bridge-app-settings'

//const INTERCOM_APP_ID = 'o1kmvctg'

const Contexts: React.FC<{
    settings: BridgeSettings
} & PropsWithChildren> = ({ 
  settings, 
  children 
}) => {

  // @info These were was all that getServerSideProps() ever returned.
  // So seems clearest to just do it this way.
  const _settings = settings ?? {
    networks: [],
    // exchanges: [],
    // sourceRoutes: [],
    // destinationRoutes: [],
  }

  return (
    <SettingsProvider settings={new BridgeAppSettings(_settings)}>
        {children}
    </SettingsProvider>
  )
}

export default Contexts
