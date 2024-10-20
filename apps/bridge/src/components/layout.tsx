'use client'
import { ErrorBoundary } from "react-error-boundary";
import { useRouter } from "next/router";

import * as Sentry from "@sentry/nextjs";

import { HeadMetadata } from '@luxfi/ui/next'

import ThemeWrapper from "./themeWrapper";
import MaintananceContent from "./maintanance/maintanance";
import ErrorFallback from "./ErrorFallback";
import ColorSchema from "./ColorSchema";
import TonConnectProvider from "./TonConnectProvider";
import QueryProvider from "../context/query";
import RainbowKit from "./RainbowKit";
import Solana from "./SolanaProvider";
import { BridgeAppSettings } from "../Models/BridgeAppSettings";
import { type BridgeSettings } from "../Models/BridgeSettings";
import { SendErrorMessage } from "../lib/telegram";
import { QueryParams } from "../Models/QueryParams";
import { THEME_COLORS, type ThemeData } from "../Models/Theme";
import { TooltipProvider } from "./shadcn/tooltip";
import { AuthProvider } from "@/context/authContext";
import { SettingsProvider } from "@/context/settings";
import { FeeProvider } from "@/context/feeContext";
import { JotaiProvider } from "@/context/jotaiContext";

import metadata from "../metadata"
import type { ErrorInfo, PropsWithChildren } from "react"

type Props = {
  children: JSX.Element | JSX.Element[];
  hideFooter?: boolean;
  settings?: BridgeSettings;
  themeData?: ThemeData | null
};

export default function Layout({ 
  children, 
  settings, 
  themeData 
} : {
  hideFooter?: boolean;
  settings?: BridgeSettings;
  themeData?: ThemeData | null
} & PropsWithChildren) {

  const router = useRouter();
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

  function logErrorToService(error: Error, info: ErrorInfo) {
    const transaction = Sentry.startTransaction({
      name: "error_boundary_handler",
    });
    Sentry.configureScope((scope) => {
      scope.setSpan(transaction);
    });
    if (process.env.NEXT_PUBLIC_VERCEL_ENV && !error.stack?.includes("chrome-extension")) {
      SendErrorMessage("UI error", `env: ${process.env.NEXT_PUBLIC_VERCEL_ENV} %0A url: ${process.env.NEXT_PUBLIC_VERCEL_URL} %0A message: ${error?.message} %0A errorInfo: ${info?.componentStack} %0A stack: ${error?.stack ?? error.stack} %0A`)
    }
    Sentry.captureException(error, {data: info});
    transaction?.finish();
  }

  themeData = themeData || THEME_COLORS.default

  const basePath = router?.basePath ?? ""


  return (<>
    <HeadMetadata metadata={metadata} />
    {themeData && (<ColorSchema themeData={themeData} />)}
    <QueryProvider query={query}>
      <SettingsProvider data={appSettings}>
        <AuthProvider>
          <TooltipProvider delayDuration={500}>
            <ErrorBoundary FallbackComponent={ErrorFallback} onError={logErrorToService}>
                <ThemeWrapper>
                  <JotaiProvider>
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
                  </JotaiProvider>
                </ThemeWrapper>
            </ErrorBoundary>
          </TooltipProvider>
        </AuthProvider>
      </SettingsProvider >
    </QueryProvider >
  </>)
}
