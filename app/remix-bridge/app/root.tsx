import React, { PropsWithChildren } from 'react'

import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  type MetaFunction,
  LiveReload
} from '@remix-run/react'
import type { LinksFunction } from '@vercel/remix'
import { Analytics } from '@vercel/analytics/react';

import { BreakpointIndicator } from '@hanzo/ui/primitives-common'

import '@luxfi/ui/style/lux-global-non-next.css'
import '@luxfi/ui/style/cart-animation.css'
import '@luxfi/ui/style/checkout-animation.css'

import Main from 'app/components/main'
import _links from './links';
import metadata from './metadata';

export const config = { runtime: 'edge' }

const bodyClasses = 'bg-background text-foreground flex flex-col min-h-full '

export const links: LinksFunction = () => (_links)
export const meta: MetaFunction = () => (metadata)

const Layout: React.FC<PropsWithChildren> = ({ 
  children 
})  => (
  <html 
    lang='en' 
    suppressHydrationWarning 
    className='hanzo-ui-dark-theme' 
    style={{backgroundColor: '#000'}}
  >
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
      {/* https://github.com/remix-run/remix/issues/2958#issuecomment-2188876125
      process.env.NODE_ENV === 'development' && <LiveReload /> 
      */}
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