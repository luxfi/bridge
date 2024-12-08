import React, { type PropsWithChildren } from 'react'

import {
  RootLayout as RootLayoutCore,
  //viewport as ViewportCode,
} from '@luxfi/ui/root-layout'

import { Footer } from '@luxfi/ui'

import '../styles/globals.css'
import '../styles/dialog-transition.css'

import siteDef from '@/site-def'
import _metadata from '@/metadata'

import Contexts from '@/context'
import Main from '@/components/main'
import Header from '@/components/header'

export const metadata = { ..._metadata }
// export const viewport = { ...ViewportCode }


const RootLayout: React.FC<PropsWithChildren> = async ({ children }) => (
  <RootLayoutCore siteDef={siteDef} showHeader={false}>
    <Contexts>
      <Header siteDef={siteDef} logoVariant='logo-only' />
      <Main>{children}</Main>
    </Contexts>
    <Footer siteDef={siteDef} />
  </RootLayoutCore>
)

export default RootLayout
