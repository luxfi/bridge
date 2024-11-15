import React, { PropsWithChildren } from 'react'

import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from '@remix-run/react'
import { Analytics } from '@vercel/analytics/react';

import { BreakpointIndicator } from '@hanzo/ui/primitives'

import '@luxfi/ui/style/lux-global.css'
import '@luxfi/ui/style/cart-animation.css'
import '@luxfi/ui/style/checkout-animation.css'

import Main from 'app/components/main'

export const config = { runtime: 'edge' }

const bodyClasses = 'bg-background text-foreground flex flex-col min-h-full '
  
const Layout: React.FC<PropsWithChildren> = ({ 
  children 
})  => (
  <html lang='en' suppressHydrationWarning className='stealth-ui-dark-theme' style={{backgroundColor: '#000'}}>
    <head>
      <meta charSet='utf-8' />
      <meta name='viewport' content='width=device-width, initial-scale=1' />
      <Meta />
      <Links />
    </head>
    <body className={bodyClasses} >
      <Main className='gap-4 '>
        {children}
      </Main>
      <ScrollRestoration />
      <Scripts />
      {/* process.env.NODE_ENV === 'development' && <LiveReload /> */}
      {process.env.NODE_ENV === 'development' && <BreakpointIndicator />}
      <Analytics />
    </body>
  </html>
)

const App: React.FC = () => (
    <Outlet />
)


export {
  Layout,
  App as default
}