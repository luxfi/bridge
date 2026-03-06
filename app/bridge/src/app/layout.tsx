import React, { type PropsWithChildren } from 'react'
import dynamic from "next/dynamic"
import { Inter } from 'next/font/google'

// Footer removed — bridge is a single-page swap interface

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

import '../styles/globals.css'
import '../styles/dialog-transition.css'
import '@rainbow-me/rainbowkit/styles.css'

import siteDef from '@/site-def'
import _metadata from '@/metadata'

import Contexts from '@/components/Contexts'
import Main from '@/components/main'
import Header from '@/components/header'
import { ChevronDown } from 'lucide-react'
import getBridgeSettings from '@/util/getBridgeSettings'
import { resolveTenant } from '@/lib/tenant'
import { headers } from 'next/headers'

export const metadata = { ..._metadata }

const ConnectedWallets = dynamic(
  () => import("../components/ConnectedWallets").then((comp) => (comp.ConnectedWallets)),
  { loading: () => (null) }
)

const RootLayout: React.FC<PropsWithChildren> = async ({ children }) => {
  const settings = await getBridgeSettings()

  // Resolve tenant config server-side from incoming hostname
  const headersList = headers()
  const hostname =
    headersList.get('x-tenant-hostname') ||
    headersList.get('host') ||
    'bridge.lux.network'
  const tenant = resolveTenant(hostname)

  // Build per-tenant siteDef override
  const tenantSiteDef = {
    ...siteDef,
    currentAs: `https://${tenant.hostname}`,
    ...(tenant.links?.home ? { home: tenant.links.home } : {}),
  }

  // Per-tenant metadata
  const tenantMetadata = {
    ..._metadata,
    title: tenant.name,
    description: `${tenant.name} — cross-chain bridge`,
    ...(tenant.faviconUrl ? { icons: { icon: tenant.faviconUrl } } : {}),
  }

  return (
    <html lang='en' suppressHydrationWarning className='dark' style={{backgroundColor: '#000'}}>
      <head>
        <base target='_blank' />
        {/* Inject CSS vars for white-label theming */}
        <style>{`
          :root {
            --brand-primary: ${tenant.primaryColor};
            --brand-accent: ${tenant.accentColor || tenant.primaryColor};
          }
        `}</style>
        {tenant.faviconUrl && <link rel='icon' href={tenant.faviconUrl} />}
        {/* Hanzo Insights — behavioral analytics */}
        <script
          dangerouslySetInnerHTML={{
            __html: `!function(t,e){var o,n,p,r;e.__SV||(window.ha=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="ha",u.people=u.people||[],u.toString=function(t){var e="ha";return"ha"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture captureException identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on getActiveMatchingSurveys getSurveys getNextSurveyStep onSessionId setPersonProperties".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.ha||[]);ha.init('phc_e16a2d5a8033442d87f090b24c606825',{api_host:'https://insights.hanzo.ai',person_profiles:'identified_only'});ha.register({app:'lux-bridge',tenant:'${tenant.id}',hostname:'${hostname}'})`,
          }}
        />
      </head>
      <body
        suppressHydrationWarning
        className={`${inter.variable} font-sans bg-background text-foreground flex flex-col min-h-full`}
      >
        {settings ? (
          <Contexts settings={settings}>
            <Header siteDef={tenantSiteDef} logoVariant='logo-only' logoSrc={tenant.logoUrl}>
              <ConnectedWallets
                connectButtonVariant='outline'
                showWalletIcon={false}
                connectButtonClx='pl-3 pr-2 flex rounded-lg relative'
              >
                <span className='pr-1.5'>Connect</span>
                <span className='pr-1'>|</span>
                <span className=''>
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                </span>
              </ConnectedWallets >
            </Header>
            <Main>{children}</Main>
          </Contexts>
        ) : (
          <Main>
            <div className="flex items-center justify-center min-h-screen">
              <p className="text-muted-foreground">Bridge is loading...</p>
            </div>
          </Main>
        )}
        <footer className="py-4 text-center text-xs text-muted-foreground">
          Lux Bridge
        </footer>
      </body>
    </html>
  )
}

export default RootLayout
