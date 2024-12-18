'use client'
import { ErrorBoundary } from 'react-error-boundary'
import * as Sentry from '@sentry/nextjs'
import { TooltipProvider } from '@hanzo/ui/primitives'
import ErrorFallback from '@/components/ErrorFallback'
import ColorSchema from '@/components/ColorSchema'
import TonConnectProvider from './TonConnectProvider'
import RainbowKit from '@/components/RainbowKit'
import Solana from '@/components/SolanaProvider'
import { BridgeAppSettings } from '@/Models/BridgeAppSettings'
import { SendErrorMessage } from '@/lib/telegram'
import { THEME_COLORS, type ThemeData } from '../Models/Theme'
import { AuthProvider } from '@/context/authContext'
import { SettingsProvider } from '@/context/settings'
import { FeeProvider } from '@/context/feeContext'
import { JotaiProvider } from '@/context/jotaiContext'
import { EthersProvider } from '@/context/ethersContext'
import { type BridgeSettings } from '@/Models/BridgeSettings'

import { IntercomProvider } from 'react-use-intercom'
import { SWRConfig } from 'swr'

import type { ErrorInfo, PropsWithChildren } from 'react'

const INTERCOM_APP_ID = 'o1kmvctg'
import { ToastProvider } from '@/context/toast-provider'
import '@rainbow-me/rainbowkit/styles.css'

const Contexts: React.FC<
  {
    settings: BridgeSettings
  } & PropsWithChildren
> = ({ settings, children }) => {
  // :aa These were was all that getServerSideProps() ever returned.
  // So seems clearest to just do it this way.
  const _settings = settings ?? {
    networks: [],
    exchanges: [],
    sourceRoutes: [],
    destinationRoutes: [],
  }
  const themeData = THEME_COLORS.default // :aa TODO

  function logErrorToService(error: Error, info: ErrorInfo) {
    const transaction = Sentry.startTransaction({
      name: 'error_boundary_handler',
    })
    Sentry.configureScope((scope) => {
      scope.setSpan(transaction)
    })
    if (
      process.env.NEXT_PUBLIC_VERCEL_ENV &&
      !error.stack?.includes('chrome-extension')
    ) {
      SendErrorMessage(
        'UI error',
        `env: ${process.env.NEXT_PUBLIC_VERCEL_ENV} %0A url: ${process.env.NEXT_PUBLIC_VERCEL_URL} %0A message: ${error?.message} %0A errorInfo: ${info?.componentStack} %0A stack: ${error?.stack ?? error.stack} %0A`
      )
    }
    Sentry.captureException(error, { data: info })
    transaction?.finish()
  }

  return (
    <SWRConfig value={{ revalidateOnFocus: false }}>
      <IntercomProvider appId={INTERCOM_APP_ID} initializeDelay={2500}>
        {themeData && <ColorSchema themeData={themeData} />}
        <SettingsProvider settings={new BridgeAppSettings(_settings)}>
          <AuthProvider>
            <TooltipProvider delayDuration={500}>
              <ErrorBoundary
                FallbackComponent={ErrorFallback}
                onError={logErrorToService}
              >
                <ToastProvider>
                  <JotaiProvider>
                    <TonConnectProvider basePath={''} themeData={themeData}>
                      <RainbowKit>
                        <EthersProvider>
                          <Solana>
                            <FeeProvider>{children}</FeeProvider>
                          </Solana>
                        </EthersProvider>
                      </RainbowKit>
                    </TonConnectProvider>
                  </JotaiProvider>
                </ToastProvider>
              </ErrorBoundary>
            </TooltipProvider>
          </AuthProvider>
        </SettingsProvider>
      </IntercomProvider>
    </SWRConfig>
  )
}

export default Contexts
