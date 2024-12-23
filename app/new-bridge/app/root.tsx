import React, { PropsWithChildren } from 'react'

import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  type MetaFunction,
  LiveReload,
  useLoaderData
} from '@remix-run/react'

import Contexts from '@/contexts'

import  { type LinksFunction, type LoaderFunction } from '@vercel/remix'
import { Analytics } from '@vercel/analytics/react'

import { BreakpointIndicator } from '@hanzo/ui/primitives-common'

import '@/style/lux-global-non-next.css'
import '@/style/cart-animation.css'
import '@/style/checkout-animation.css'

import Main from 'app/components/main'
import getBridgeSettings from './utils/get-bridge-settings'
import Header from 'app/components/header'
import _links from './links';
import metadata from './metadata'
import siteDef from './site-def'
import { BridgeSettings } from './types/bridge-settings'

export const config = { runtime: 'edge' }

const bodyClasses = 'bg-background text-foreground flex flex-col min-h-full '

export const links: LinksFunction = () => (_links)
export const meta: MetaFunction = () => (metadata)

export const loader: LoaderFunction = async () => {
  const settings = await getBridgeSettings()
  if (!settings) {
    // TODO :aa
    //return redirect("/") // Redirect if settings are not available
  }
  return (settings)
}

const Layout: React.FC<PropsWithChildren> = ({ 
  children 
})  => {
  
  const settings = useLoaderData() as BridgeSettings

  return (
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
        <Contexts settings={settings } >
          <Header siteDef={siteDef}/>
          <Main className='gap-4 '>
            {children}
          </Main>
        </Contexts>
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
}

const App: React.FC = () => (
  <Outlet />
)


export {
  Layout,
  App as default
}