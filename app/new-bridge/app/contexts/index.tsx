// providers
import { ErrorBoundary } from 'react-error-boundary'
import { TooltipProvider } from '@hanzo/ui/primitives'
import { SettingsProvider } from '@/contexts/settings-provider'
// import { IntercomProvider } from 'react-use-intercom'
// import ErrorFallback from '@/components/ErrorFallback'
// import ColorSchema from '@/components/ColorSchema'
// import TonConnectProvider from './TonConnectProvider'
// import RainbowKit from '@/components/RainbowKit'
// import Solana from '@/components/SolanaProvider'
// import { SendErrorMessage } from '@/lib/telegram'
// import { AuthProvider } from '@/contexts/authContext'
// import { FeeProvider } from '@/contexts/feeContext'
// import { JotaiProvider } from '@/contexts/jotaiContext'
// import { EthersProvider } from '@/contexts/ethersContext'

//types
import type { BridgeSettings } from '@/types/bridge-settings'
import type { ErrorInfo, PropsWithChildren } from 'react'
import { type ThemeData, THEME_COLORS } from '@/types/theme'
import { BridgeAppSettings } from '@/types/bridge-app-settings'

const INTERCOM_APP_ID = 'o1kmvctg'
import { ToastProvider } from '@/contexts/toast-provider'

const Contexts: React.FC<
  {
    settings: BridgeSettings
  } & PropsWithChildren
> = ({ settings, children }) => {
  // @info These were was all that getServerSideProps() ever returned.
  // So seems clearest to just do it this way.
  const _settings = settings ?? {
    networks: [],
    // exchanges: [],
    // sourceRoutes: [],
    // destinationRoutes: [],
  }
  const themeData = THEME_COLORS.default // :aa TODO

  return (
    <SettingsProvider settings={new BridgeAppSettings(_settings)}>
      <ToastProvider>
        {children}
      </ToastProvider>
    </SettingsProvider>
  )
}

export default Contexts
