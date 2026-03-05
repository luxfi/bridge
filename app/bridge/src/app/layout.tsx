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
