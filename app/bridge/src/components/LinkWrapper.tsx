'use client'
import Link, { type LinkProps } from 'next/link'

import resolvePersistentQueryParams from '@/util/resolvePersistentQueryParams'
import type { PropsWithChildren } from 'react'
import { useSearchParams } from 'next/navigation'

const LinkWrapper: React.FC<
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & 
  LinkProps & 
  React.RefAttributes<HTMLAnchorElement> & 
  PropsWithChildren
> = ({
  children,
  href,
  ...rest
}) => {

  const pathname = typeof href === 'object' ? href.pathname : href
  const query = (typeof href === 'object' && typeof href.query === 'object') ? href.query : {}
  const sp = new URLSearchParams(query as Record<string, string>)

  // check if current type is teleport
  // const searchParams = useSearchParams()
  // const useTeleporter = searchParams.get('teleport') === 'false' ? false : true
  // sp.append('teleport', String(useTeleporter))
  
  return (
    <Link
      {...rest}
      href={{
        pathname: pathname,
        query: resolvePersistentQueryParams(sp).toString() 
      }}
    >
      {children}
    </Link>
  )
}

export default LinkWrapper