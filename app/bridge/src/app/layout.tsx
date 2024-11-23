import React, { type PropsWithChildren } from 'react'
import dynamic from "next/dynamic"

import {
  RootLayout as RootLayoutCore,
  viewport as ViewportCode,
} from '@luxfi/ui/root-layout'

import { Footer } from '@luxfi/ui'

import '../styles/globals.css'
import '../styles/dialog-transition.css'
import '@rainbow-me/rainbowkit/styles.css'

import siteDef from '@/site-def'
import _metadata from '@/metadata'

import Contexts from '@/components/Contexts'
import Main from '@/components/main'
import Header from '@/components/header'
import { ChevronDown } from 'lucide-react'

export const metadata = { ..._metadata }
// export const viewport = { ...ViewportCode }

const ConnectedWallets = dynamic(
  () => import("../components/ConnectedWallets").then((comp) => (comp.ConnectedWallets)), 
  { loading: () => (null) }
)




const RootLayout: React.FC<PropsWithChildren> = async ({ children }) => (
  <RootLayoutCore siteDef={siteDef} showHeader={false}>
    <Contexts>
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
    <Footer siteDef={siteDef} />
  </RootLayoutCore>
)

export default RootLayout
