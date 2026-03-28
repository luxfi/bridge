import React, { type PropsWithChildren } from 'react'
import dynamic from "next/dynamic"
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

import '../styles/globals.css'
import '../styles/dialog-transition.css'
import '@rainbow-me/rainbowkit/styles.css'

import siteDef from '@/site-def'
import Contexts from '@/components/Contexts'
import Main from '@/components/main'
import Header from '@/components/header'
import { ChevronDown } from 'lucide-react'
import getBridgeSettings from '@/util/getBridgeSettings'
import { fetchTenant, type TenantConfig } from '@/lib/tenant'

const ConnectedWallets = dynamic(
  () => import("../components/ConnectedWallets").then((comp) => (comp.ConnectedWallets)),
  { loading: () => (null) }
)

/**
 * Root layout — all branding derived from Hanzo IAM org.
 * Zero hardcoded brand. Tenant config fetched from IAM at render time.
 */
const RootLayout: React.FC<PropsWithChildren> = async ({ children }) => {
  const settings = await getBridgeSettings()
  // fetchTenant is safe during build (returns fallback when IAM unreachable)
  let tenant
  try {
    tenant = await fetchTenant()
  } catch {
    tenant = (await import('@/lib/tenant')).getTenant()
  }

  return (
    <html lang='en' suppressHydrationWarning className='dark' style={{backgroundColor: '#000'}}>
      <head>
        <base target='_blank' />
        <title>{tenant.name}</title>
        <meta name="description" content={`${tenant.name} — cross-chain bridge`} />
        {tenant.faviconUrl && <link rel='icon' href={tenant.faviconUrl} />}
        {/* Inject brand colors as CSS vars — drives all themed components */}
        <style>{`
          :root {
            --brand-primary: ${tenant.primaryColor};
          }
        `}</style>
      </head>
      <body
        suppressHydrationWarning
        className={`${inter.variable} font-sans bg-background text-foreground flex flex-col min-h-full`}
      >
        {settings ? (
          <Contexts settings={settings}>
            <Header siteDef={siteDef} logoVariant='logo-only' logoSrc={tenant.logoUrl}>
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
              <p className="text-muted-foreground">Loading...</p>
            </div>
          </Main>
        )}
        <footer className="py-4 text-center text-xs text-muted-foreground">
          {tenant.name}
        </footer>
      </body>
    </html>
  )
}

export default RootLayout
