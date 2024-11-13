'use client'
import { ErrorBoundary } from 'react-error-boundary'
import { useSearchParams } from 'next/navigation'
import axios from 'axios'
import * as Sentry from '@sentry/nextjs'

import { TooltipProvider } from '@hanzo/ui/primitives'

import ErrorFallback from './ErrorFallback'
import ColorSchema from './ColorSchema'
// import TonConnectProvider from './TonConnectProvider'
import QueryProvider from '../context/query'
import RainbowKit from './RainbowKit'
import Solana from './SolanaProvider'
import { BridgeAppSettings } from '../Models/BridgeAppSettings'
import { SendErrorMessage } from '../lib/telegram'
import { QueryParams } from '../Models/QueryParams'
import { THEME_COLORS, type ThemeData } from '../Models/Theme'
import { AuthProvider } from '@/context/authContext'
import { SettingsProvider } from '@/context/settings'
import { FeeProvider } from '@/context/feeContext'
import { JotaiProvider } from '@/context/jotaiContext'
import { type BridgeSettings } from '../Models/BridgeSettings'

import { IntercomProvider } from 'react-use-intercom'
import { SWRConfig } from 'swr'

import type { ErrorInfo, PropsWithChildren } from 'react'

const INTERCOM_APP_ID = 'o1kmvctg'
import '@rainbow-me/rainbowkit/styles.css'
import { ToastProvider } from '@/context/toast-provider'
import useAsyncEffect from 'use-async-effect'

const Contexts: React.FC<
  {
    settings?: BridgeSettings
  } & PropsWithChildren
> = ({ settings, children }) => {
  const searchParams = useSearchParams()

  useAsyncEffect(async() => {
    const settings = await axios.get(`${process.env.NEXT_PUBLIC_BACKEND_API}/api/networks?version=mainnet`)
    console.log("::settings;;;", settings)
  }, [])

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
                      {/* <TonConnectProvider basePath={''} themeData={themeData}> */}
                      <RainbowKit>
                        <Solana>
                          <FeeProvider>
                            {children}
                          </FeeProvider>
                        </Solana>
                      </RainbowKit>
                      {/* </TonConnectProvider> */}
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
