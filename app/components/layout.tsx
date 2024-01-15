import React, { useEffect, useState } from "react"
import Head from "next/head"
import { useRouter } from "next/router";
import ThemeWrapper from "./themeWrapper";
import { ErrorBoundary } from "react-error-boundary";
import MaintananceContent from "./maintanance/maintanance";
import { AuthProvider } from "../context/authContext";
import { SettingsProvider } from "../context/settings";
import { BridgeAppSettings } from "../Models/BridgeAppSettings";
import { BridgeSettings } from "../Models/BridgeSettings";
import ErrorFallback from "./ErrorFallback";
import { SendErrorMessage } from "../lib/telegram";
import { QueryParams } from "../Models/QueryParams";
import QueryProvider from "../context/query";
import { THEME_COLORS, ThemeData } from "../Models/Theme";
import { TooltipProvider } from "./shadcn/tooltip";
import ColorSchema from "./ColorSchema";
import TonConnectProvider from "./TonConnectProvider";
import * as Sentry from "@sentry/nextjs";
import { FeeProvider } from "../context/feeContext";
import RainbowKit from "./RainbowKit";
import Solana from "./SolanaProvider";

type Props = {
  children: JSX.Element | JSX.Element[];
  hideFooter?: boolean;
  settings?: BridgeSettings;
  themeData?: ThemeData | null
};

export default function Layout({ children, settings, themeData }: Props) {
  const router = useRouter();

  useEffect(() => {
    function prepareUrl(params) {
      const url = new URL(location.href)
      const queryParams = new URLSearchParams(location.search)
      let customUrl = url.protocol + "//" + url.hostname + url.pathname.replace(/\/$/, '')
      for (const paramName of params) {
        const paramValue = queryParams.get(paramName)
        if (paramValue) customUrl = customUrl + '/' + paramValue
      }
      return customUrl
    }
    plausible('pageview', {
      u: prepareUrl([
        'destNetwork', //opsolate
        'sourceExchangeName', //opsolate
        'addressSource', //opsolate
        'from',
        'to',
        'appName',
        'asset',
        'amount'
      ])
    })
  }, [])

  if (!settings)
    return <ThemeWrapper>
      <MaintananceContent />
    </ThemeWrapper>

  let appSettings = new BridgeAppSettings(settings)

  const query: QueryParams = {
    ...router.query,
    ...(router.query.lockAddress === 'true' ? { lockAddress: true } : {}),
    ...(router.query.lockNetwork === 'true' ? { lockNetwork: true } : {}),
    ...(router.query.lockExchange === 'true' ? { lockExchange: true } : {}),
    ...(router.query.hideRefuel === 'true' ? { hideRefuel: true } : {}),
    ...(router.query.hideAddress === 'true' ? { hideAddress: true } : {}),
    ...(router.query.hideFrom === 'true' ? { hideFrom: true } : {}),
    ...(router.query.hideTo === 'true' ? { hideTo: true } : {}),
    ...(router.query.lockFrom === 'true' ? { lockFrom: true } : {}),
    ...(router.query.lockTo === 'true' ? { lockTo: true } : {}),
    ...(router.query.lockAsset === 'true' ? { lockAsset: true } : {}),


    ...(router.query.lockAddress === 'false' ? { lockAddress: false } : {}),
    ...(router.query.lockNetwork === 'false' ? { lockNetwork: false } : {}),
    ...(router.query.lockExchange === 'false' ? { lockExchange: false } : {}),
    ...(router.query.hideRefuel === 'false' ? { hideRefuel: false } : {}),
    ...(router.query.hideAddress === 'false' ? { hideAddress: false } : {}),
    ...(router.query.hideFrom === 'false' ? { hideFrom: false } : {}),
    ...(router.query.hideTo === 'false' ? { hideTo: false } : {}),
    ...(router.query.lockFrom === 'false' ? { lockFrom: false } : {}),
    ...(router.query.lockTo === 'false' ? { lockTo: false } : {}),
    ...(router.query.lockAsset === 'false' ? { lockAsset: false } : {}),
  };

  function logErrorToService(error, info) {
    const transaction = Sentry.startTransaction({
      name: "error_boundary_handler",
    });
    Sentry.configureScope((scope) => {
      scope.setSpan(transaction);
    });
    if (process.env.NEXT_PUBLIC_VERCEL_ENV && !error.stack.includes("chrome-extension")) {
      SendErrorMessage("UI error", `env: ${process.env.NEXT_PUBLIC_VERCEL_ENV} %0A url: ${process.env.NEXT_PUBLIC_VERCEL_URL} %0A message: ${error?.message} %0A errorInfo: ${info?.componentStack} %0A stack: ${error?.stack ?? error.stack} %0A`)
    }
    Sentry.captureException(error, info);
    transaction?.finish();
  }

  themeData = themeData || THEME_COLORS.default

  const basePath = router?.basePath ?? ""

  return (<>
    <Head>
      <title>Bridge</title>
      <link rel="apple-touch-icon" sizes="180x180" href={`${basePath}/favicon/apple-touch-icon.png`} />
      <link rel="icon" type="image/png" sizes="32x32" href={`${basePath}/favicon/favicon-32x32.png`} />
      <link rel="icon" type="image/png" sizes="16x16" href={`${basePath}/favicon/favicon-16x16.png`} />
      <link rel="manifest" href={`${basePath}/favicon/site.webmanifest`} />
      <meta name="msapplication-TileColor" content="#ffffff" />
      <meta name="theme-color" content={`rgb(${themeData.secondary?.[900]})`} />
      <meta name="description" content="Move crypto across exchanges, blockchains, and wallets." />

      {/* Facebook Meta Tags */}
      <meta property="og:url" content={`https://bridge.lux.network/${basePath}`} />
      <meta property="og:type" content="website" />
      <meta property="og:title" content="Bridge" />
      <meta property="og:description" content="Move crypto across exchanges, blockchains, and wallets." />
      <meta property="og:image" content={`https://bridge.lux.network/${basePath}/opengraph.jpg?v=2`} />

      {/* Twitter Meta Tags */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta property="twitter:domain" content="bridge.lux.network" />
      <meta property="twitter:url" content={`https://bridge.lux.network/${basePath}`} />
      <meta name="twitter:title" content="Bridge" />
      <meta name="twitter:description" content="Move crypto across exchanges, blockchains, and wallets." />
      <meta name="twitter:image" content={`https://bridge.lux.network/${basePath}/opengraphtw.jpg`} />
    </Head>
    {
      themeData &&
      <ColorSchema themeData={themeData} />
    }
    <QueryProvider query={query}>
      <SettingsProvider data={appSettings}>
        <AuthProvider>
          <TooltipProvider delayDuration={500}>
            <ErrorBoundary FallbackComponent={ErrorFallback} onError={logErrorToService}>
              <ThemeWrapper>
                <TonConnectProvider basePath={basePath} themeData={themeData}>
                  <RainbowKit>
                    <Solana>
                      <FeeProvider>
                      {(process.env.NEXT_PUBLIC_IN_MAINTANANCE === 'true') ? (
                        <MaintananceContent />
                      ) : (
                        children
                      )}
                      </FeeProvider>
                    </Solana>
                  </RainbowKit>
                </TonConnectProvider>
              </ThemeWrapper>
            </ErrorBoundary>
          </TooltipProvider>
        </AuthProvider>
      </SettingsProvider >
    </QueryProvider >
  </>)
}
