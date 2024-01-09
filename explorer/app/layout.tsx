import React, { PropsWithChildren } from 'react'
import { Metadata } from 'next'
import Script from 'next/script'

import { inter, drukTextWide } from '@luxdefi/ui/style/nextFonts'

import Header from '@/components/Header'
import Footer from '@/components/Footer'

import { SettingsProvider } from "@/context/settings";

import '../style/globals.css'

export const metadata: Metadata = {
  title: 'Bridge Explorer',
  description: 'Explore your swaps',
}

const bodyClasses = 
'bg-background text-foreground flex min-h-screen flex-col items-center max-w-6xl mx-auto ' + 
  `${inter.variable} ${drukTextWide.variable} font-sans` 

const RootLayout: React.FC<PropsWithChildren> = ({
  children,
}) => (
  <SettingsProvider>
  <html lang="en" className='dark'>
    <Script defer data-domain="bridge.lux.network" src="https://plausible.io/js/script.js" />
    <body className={bodyClasses}>
      <Header />
      {children}
      <Footer />
    </body>
  </html>
  </SettingsProvider>
)

export default RootLayout 

