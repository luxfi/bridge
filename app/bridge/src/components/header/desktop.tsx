import React, { type PropsWithChildren } from 'react'

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
  } & PropsWithChildren
> = ({
  links,
  className = '',
  noAuth = false,
  children,
  logoVariant = 'text-only',
}) => {
  const [isMenuOpened, setIsMenuOpen] = React.useState(false)

  // TODO move 13px into a size class and configure twMerge to recognize say, 'text-size-nav'
  // (vs be beat out by 'text-color-nav')
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
        <Logo
          size={logoVariant === 'logo-only' ? 'sm' : 'sm'}
          href="/"
          outerClx="flex"
          key="two"
          variant={logoVariant}
        />
        {/* md or larger */}
        <div className=""></div>
        <div className="flex items-center">{children}</div>
      </div>
    </header>
  )
}

export default DesktopHeader
