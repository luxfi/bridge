import React, { type PropsWithChildren } from 'react'

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

export const metadata = { ..._metadata }
// export const viewport = { ...ViewportCode }

// const RootLayout: React.FC<PropsWithChildren> = async ({ children }) => (
//   <RootLayoutCore siteDef={siteDef} showHeader>
//     <Contexts>
//       <Main>{children}</Main>
//     </Contexts>
//     <Footer siteDef={siteDef} />
//   </RootLayoutCore>
// )

// export default RootLayout

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning={true} className={`font-sans`}>
      <body lang="en" suppressHydrationWarning={true}>
        <main className="bg-white">
          {children}
        </main>
        <footer className="py-3 text-center text-slate-500 text-2xl font-[title]">Copyright 2024</footer>
      </body>
    </html>
  );
}
