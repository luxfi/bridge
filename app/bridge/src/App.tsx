import { ChevronDown } from 'lucide-react'
import { lazy, Suspense, useEffect, useState, type FC } from 'react'
import { Route, Switch, useRoute } from 'wouter'

import Contexts from '@/components/Contexts'
import Header from '@/components/header'
import Main from '@/components/main'
import { BridgeAppSettings } from '@/Models/BridgeAppSettings'
import { type BridgeSettings } from '@/Models/BridgeSettings'
import getBridgeSettings from '@/util/getBridgeSettings'
import siteDef from '@/site-def'
import { fetchTenant, getTenant, type TenantConfig } from '@/lib/tenant'

import HomePage from '@/pages/HomePage'
import NotFoundPage from '@/pages/NotFoundPage'

const AuthPage = lazy(() => import('@/pages/AuthPage'))
const CampaignsPage = lazy(() => import('@/pages/CampaignsPage'))
const CampaignDetailPage = lazy(() => import('@/pages/CampaignDetailPage'))
const SalonPage = lazy(() => import('@/pages/SalonPage'))
const SwapPage = lazy(() => import('@/pages/SwapPage'))
const TeleporterSwapPage = lazy(() => import('@/pages/TeleporterSwapPage'))
const UtilaSwapPage = lazy(() => import('@/pages/UtilaSwapPage'))
const TransactionsPage = lazy(() => import('@/pages/TransactionsPage'))

const ConnectedWallets = lazy(() =>
  import('@/components/ConnectedWallets').then((m) => ({ default: m.ConnectedWallets })),
)

// wouter route components take no params; pages read via useRoute + window.__NEXT_PARAMS__
function withParam<P extends string>(
  Component: FC<{ params: Record<P, string> }>,
  paramName: P,
): FC {
  return function Wrapped() {
    const [, params] = useRoute<Record<P, string>>(`/*`)
    const value = (params as Record<P, string> | null)?.[paramName] ?? ''
    return <Component params={{ [paramName]: value } as Record<P, string>} />
  }
}

function RouteWithParams<P extends string>({ path, component: C, paramName }: {
  path: string
  component: FC<{ params: Record<P, string> }>
  paramName: P
}) {
  return (
    <Route path={path}>
      {(params: Record<string, string>) => (
        <C params={{ [paramName]: params[paramName] ?? '' } as Record<P, string>} />
      )}
    </Route>
  )
}

export function App() {
  const [settings, setSettings] = useState<BridgeSettings | undefined>(undefined)
  const [tenant, setTenant] = useState<TenantConfig>(() => getTenant())

  useEffect(() => {
    void getBridgeSettings().then(setSettings).catch(() => setSettings(undefined))
    void fetchTenant().then(setTenant).catch(() => setTenant(getTenant()))
  }, [])

  const content = (
    <Suspense fallback={null}>
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/auth" component={AuthPage} />
        <Route path="/campaigns" component={CampaignsPage} />
        <RouteWithParams path="/campaigns/:campaign" component={CampaignDetailPage} paramName="campaign" />
        <Route path="/salon" component={SalonPage} />
        <RouteWithParams path="/swap/:swapId" component={SwapPage} paramName="swapId" />
        <RouteWithParams path="/swap/teleporter/:swapId" component={TeleporterSwapPage} paramName="swapId" />
        <RouteWithParams path="/swap/v2/:swapId" component={UtilaSwapPage} paramName="swapId" />
        <Route path="/transactions" component={TransactionsPage} />
        <Route component={NotFoundPage} />
      </Switch>
    </Suspense>
  )

  if (!settings) {
    // Settings not loaded yet — render minimal shell
    return (
      <Main>
        <div className="flex items-center justify-center min-h-screen">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </Main>
    )
  }

  return (
    <Contexts settings={settings}>
      <Header siteDef={siteDef} logoVariant="logo-only" logoSrc={tenant.logoUrl}>
        <Suspense fallback={null}>
          <ConnectedWallets
            connectButtonVariant="outline"
            showWalletIcon={false}
            connectButtonClx="pl-3 pr-2 flex rounded-lg relative"
          >
            <span className="pr-1.5">Connect</span>
            <span className="pr-1">|</span>
            <span>
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            </span>
          </ConnectedWallets>
        </Suspense>
      </Header>
      <Main>{content}</Main>
      <footer className="py-4 text-center text-xs text-muted-foreground">{tenant.name}</footer>
    </Contexts>
  )
}

// Suppress the unused warning for BridgeAppSettings import (used via SettingsProvider in Contexts)
void BridgeAppSettings
// Suppress unused — left here in case future routes need direct RouteWithParams wrapping via withParam helper
void withParam
