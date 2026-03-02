'use client'
import React, { type PropsWithChildren } from 'react'

import type { SiteDef } from '@luxfi/ui/site-def'

import DesktopHeader from './desktop'
//import MobileHeader from './mobile'
import { cn } from '@hanzo/ui/util'
import { type LogoVariant } from '@luxfi/ui'


  /** children will render furthest right */
const Header: React.FC<{
  siteDef: SiteDef
  className?: string
  logoVariant?: LogoVariant
  /** White-label: custom logo image URL (overrides default Lux logo) */
  logoSrc?: string
} & PropsWithChildren> = ({
  siteDef,
  className = '',
  children,
  logoVariant='text-only',
  logoSrc,
}) => {

    const { nav: { common, featured }, currentAs, noAuth } = siteDef
    const links = (featured) ? [...common, ...featured] : common

    return (<>
      <DesktopHeader
        className='flex'
        links={links}
        currentAs={currentAs}
        noAuth={noAuth}
        logoVariant={logoVariant}
        logoSrc={logoSrc}
      >
        {children}
      </DesktopHeader>
      { /* 
      <MobileHeader
        className={cn(className, 'md:hidden')}
        links={links}
        currentAs={currentAs}
        setChatbotOpen={setOpen}
        noAuth={noAuth}
        
      /> */}
    </>)
  }

export default Header
