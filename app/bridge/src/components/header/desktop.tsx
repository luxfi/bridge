import React, { type PropsWithChildren } from 'react'
import Image from 'next/image'

import type { LinkDef } from '@hanzo/ui/types'

import { cn } from '@hanzo/ui/util'
import { Logo, type LogoVariant } from '@luxfi/ui'

const DesktopHeader: React.FC<
  {
    currentAs: string | undefined
    links: LinkDef[]
    className?: string
    noAuth?: boolean
    logoVariant?: LogoVariant
    /** White-label: override logo with custom image URL */
    logoSrc?: string
  } & PropsWithChildren
> = ({
  links,
  className = '',
  noAuth = false,
  children,
  logoVariant = 'text-only',
  logoSrc,
}) => {
  const [isMenuOpened, setIsMenuOpen] = React.useState(false)

  return (
    <header
      id="DESKTOP_HEADER"
      className={cn(
        'bg-[rgba(0, 0, 0, 0.5)] !backdrop-blur-3xl fixed z-header top-0 left-0 right-0',
        className,
        isMenuOpened ? ' h-full' : ''
      )}
    >
      {/* md or larger */}
      <div
        className={
          'flex flex-row h-[80px] items-center justify-between ' +
          'mx-3 md:mx-6 w-full max-w-screen'
        }
      >
        {logoSrc ? (
          <a href="/" className="flex items-center">
            <Image src={logoSrc} alt="Bridge Logo" height={32} width={120} style={{ objectFit: 'contain' }} />
          </a>
        ) : (
          <Logo
            size={logoVariant === 'logo-only' ? 'sm' : 'sm'}
            href="/"
            outerClx="flex"
            key="two"
            variant={logoVariant}
          />
        )}
        <div className=""></div>
        <div className="flex items-center">{children}</div>
      </div>
    </header>
  )
}

export default DesktopHeader
