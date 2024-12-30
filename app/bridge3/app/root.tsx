import React, { type PropsWithChildren } from 'react'

import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  type MetaFunction,
} from '@remix-run/react'

  // 'type' must be outside the curlies! 
  // https://github.com/remix-run/remix/issues/9916#issuecomment-2436405265
import type { LinksFunction } from '@vercel/remix'
import { Analytics } from '@vercel/analytics/react'

import { BreakpointIndicator } from '@hanzo/ui/primitives-common'

import Contexts from '@/contexts'
import Main from '@/components/main'
import Header from '@/components/header'

import _links from './links';
import metadata from './metadata'
import siteDef from './site-def'
import ConnectWallets from './components/wallets/connect-wallet'

//export const config = { runtime: 'edge' }

// Cache Busting and Dynamic CSS Handling
if (import.meta.hot) {
  import.meta.hot.on('vite:beforeUpdate', () => {
    // Dynamically reload stylesheets during HMR updates
    const links = document.querySelectorAll('link[rel="stylesheet"]')
    links.forEach(link => {
      const href = link.getAttribute('href') || ''
      link.setAttribute('href', href.split('?')[0] + '?v=' + Date.now())
    })
  })
}

// Additional CSS imports for animations
const useDynamicCSS = () => {
  React.useEffect(() => {
    // Dynamic CSS imports with cache-busting
    const cssLinks = [
      '/app/style/lux-global-non-next.css',
      '/app/style/cart-animation.css',
      '/app/style/checkout-animation.css',
    ]

    cssLinks.forEach(link => {
      const el = document.createElement('link')
      el.rel = 'stylesheet'
      el.href = `${link}?v=${Date.now()}` // Append version for cache busting
      document.head.appendChild(el)
    })
  }, [])
}

// Body classes for styling
const bodyClasses = 'bg-background text-foreground flex flex-col min-h-full '


export const links: LinksFunction = () => (_links)
export const meta: MetaFunction = () => (metadata)

const Layout: React.FC<PropsWithChildren> = ({ 
  children 
})  => {
  // Apply dynamic CSS
  useDynamicCSS()

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
        <Contexts>
          <Header siteDef={siteDef}>
            <ConnectWallets/>
          </Header>
          <Main className='gap-4 '>
            {children}
          </Main>
        </Contexts>
        <ScrollRestoration />
        <Scripts />
        {process.env.NODE_ENV === 'development' && <BreakpointIndicator />}
        <Analytics />
      </body>
    </html>
  )
}

const Root: React.FC = () => (
  <Outlet />
)


export {
  Layout,
  Root as default
}