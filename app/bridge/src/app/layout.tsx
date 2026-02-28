import React, { type PropsWithChildren } from 'react'
import dynamic from "next/dynamic"
import { Inter } from 'next/font/google'

import { Footer } from '@luxfi/ui'

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

export const metadata = { ..._metadata }

const ConnectedWallets = dynamic(
  () => import("../components/ConnectedWallets").then((comp) => (comp.ConnectedWallets)),
  { loading: () => (null) }
)

const RootLayout: React.FC<PropsWithChildren> = async ({ children }) => {
  const settings = await getBridgeSettings()

  return (
    <html lang='en' suppressHydrationWarning className='dark' style={{backgroundColor: '#000'}}>
      <head>
        <base target='_blank' />
      </head>
      <body
        suppressHydrationWarning
        className={`${inter.variable} font-sans bg-background text-foreground flex flex-col min-h-full`}
      >
        {settings ? (
          <Contexts settings={settings}>
            <Header siteDef={siteDef} logoVariant='logo-only'>
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
        <Footer siteDef={siteDef} />
      </body>
    </html>
  )
}

export default RootLayout
