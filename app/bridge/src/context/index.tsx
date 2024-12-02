'use client'
import type { ErrorInfo, PropsWithChildren } from 'react'
import { IntercomProvider } from 'react-use-intercom'
import { SWRConfig } from 'swr'
import { ErrorBoundary } from 'react-error-boundary'
import { useSearchParams } from 'next/navigation'
import * as Sentry from '@sentry/nextjs'
import { Provider as JotaiProvider } from "jotai";

import { TooltipProvider } from '@hanzo/ui/primitives'

import ErrorFallback from '../components/ErrorFallback'
import ColorSchema from '../components/ColorSchema'
import TonConnectProvider from '../components/TonConnectProvider'

import Solana from '../components/SolanaProvider'
import { SendErrorMessage } from '../lib/telegram'
import { QueryParams } from '../Models/QueryParams'
import { THEME_COLORS } from '../Models/Theme'
import { BridgeAppSettings } from '../Models/BridgeAppSettings'
import { type BridgeSettings } from '../Models/BridgeSettings'

import QueryProvider from './query'
import WalletProvider from './wallet-provider'
import AuthProvider from './auth-provider'
import SettingsProvider from './settings-provider'
import FeeProvider from './fee-provider'
import EthersProvider from './ethers-provider'


const INTERCOM_APP_ID = 'o1kmvctg'
import '@rainbow-me/rainbowkit/styles.css'
import { ToastProvider } from '@/context/toast-provider'

const Contexts: React.FC<
  {
    settings?: BridgeSettings
  } & PropsWithChildren
> = ({ settings, children }) => {
  const searchParams = useSearchParams()
  // :aa These were was all that getServerSideProps() ever returned.
  // So seems clearest to just do it this way.
  const _settings = settings ?? {
    networks: [],
    exchanges: [],
    sourceRoutes: [],
    destinationRoutes: [],
  }
  const themeData = THEME_COLORS.default // :aa TODO

  const query: QueryParams = {
    ...(searchParams.get('lockAddress') === 'true'
      ? { lockAddress: true }
      : {}),
    ...(searchParams.get('lockNetwork') === 'true'
      ? { lockNetwork: true }
      : {}),
    ...(searchParams.get('lockExchange') === 'true'
      ? { lockExchange: true }
      : {}),
    ...(searchParams.get('hideRefuel') === 'true' ? { hideRefuel: true } : {}),
    ...(searchParams.get('hideAddress') === 'true'
      ? { hideAddress: true }
      : {}),
    ...(searchParams.get('hideFrom') === 'true' ? { hideFrom: true } : {}),
    ...(searchParams.get('hideTo') === 'true' ? { hideTo: true } : {}),
    ...(searchParams.get('lockFrom') === 'true' ? { lockFrom: true } : {}),
    ...(searchParams.get('lockTo') === 'true' ? { lockTo: true } : {}),
    ...(searchParams.get('lockAsset') === 'true' ? { lockAsset: true } : {}),

    ...(searchParams.get('lockAddress') === 'false'
      ? { lockAddress: false }
      : {}),
    ...(searchParams.get('lockNetwork') === 'false'
      ? { lockNetwork: false }
      : {}),
    ...(searchParams.get('lockExchange') === 'false'
      ? { lockExchange: false }
      : {}),
    ...(searchParams.get('hideRefuel') === 'false'
      ? { hideRefuel: false }
      : {}),
    ...(searchParams.get('hideAddress') === 'false'
      ? { hideAddress: false }
      : {}),
    ...(searchParams.get('hideFrom') === 'false' ? { hideFrom: false } : {}),
    ...(searchParams.get('hideTo') === 'false' ? { hideTo: false } : {}),
    ...(searchParams.get('lockFrom') === 'false' ? { lockFrom: false } : {}),
    ...(searchParams.get('lockTo') === 'false' ? { lockTo: false } : {}),
    ...(searchParams.get('lockAsset') === 'false' ? { lockAsset: false } : {}),
  }

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
        <QueryProvider query={query}>
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
                        <WalletProvider>
                          <EthersProvider>
                            <Solana>
                              <FeeProvider>
                                {children}
                              </FeeProvider>
                            </Solana>
                          </EthersProvider>
                        </WalletProvider>
                      </TonConnectProvider>
                    </JotaiProvider>
                  </ToastProvider>
                </ErrorBoundary>
              </TooltipProvider>
            </AuthProvider>
          </SettingsProvider>
        </QueryProvider>
      </IntercomProvider>
    </SWRConfig>
  )
}

export default Contexts
