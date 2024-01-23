import React, { PropsWithChildren } from 'react'
import Script from 'next/script'

import { inter, drukTextWide } from '@luxdefi/ui/next-fonts'

import Header from '@/components/Header'
import Footer from '@/components/Footer'

import { SettingsProvider } from "@/context/settings";

import '../style/globals.css'
import metadata from "../metadata"

const bodyClasses = 
'bg-background text-foreground flex min-h-screen flex-col items-center max-w-6xl mx-auto ' + 
  `${inter.variable} ${drukTextWide.variable} font-sans` 

const RootLayout: React.FC<PropsWithChildren> = ({
  children,
}) => (
  <SettingsProvider>
  <html lang="en" className='lux-dark-theme'>
    <Script defer data-domain="bridge.lux.network" src="https://plausible.io/js/script.js" />
    <body className={bodyClasses}>
      <Header />
      {children}
      <Footer />
    </body>
  </html>
  </SettingsProvider>
)

export {
  RootLayout as default, 
  metadata
}
