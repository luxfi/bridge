/**
 * Vite SPA shim for `next/link`.
 * Bridges Next.js <Link> API onto a plain <a>, using wouter for SPA navigation.
 */
import React, { type AnchorHTMLAttributes, type PropsWithChildren } from 'react'
import { Link as WouterLink } from 'wouter'

export interface LinkProps {
  href: string | { pathname?: string | null; query?: Record<string, string> | string }
  as?: string
  replace?: boolean
  scroll?: boolean
  shallow?: boolean
  passHref?: boolean
  prefetch?: boolean
  locale?: string | false
  legacyBehavior?: boolean
}

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> &
  LinkProps & { children?: React.ReactNode }

function resolveHref(href: LinkProps['href']): string {
  if (typeof href === 'string') return href
  const path = href?.pathname || '/'
  if (!href?.query) return path
  if (typeof href.query === 'string') {
    return `${path}?${href.query}`
  }
  const qs = new URLSearchParams(href.query as Record<string, string>).toString()
  return qs ? `${path}?${qs}` : path
}

const Link = React.forwardRef<HTMLAnchorElement, PropsWithChildren<Props>>(
  function Link({ href, as: _as, replace, scroll, shallow, passHref, prefetch, locale, legacyBehavior, children, ...rest }, ref) {
    const resolved = resolveHref(href)
    const isExternal = /^https?:\/\//i.test(resolved) || resolved.startsWith('mailto:') || resolved.startsWith('tel:')

    if (isExternal) {
      return (
        <a ref={ref} href={resolved} {...rest}>
          {children}
        </a>
      )
    }

    return (
      <WouterLink href={resolved} asChild>
        <a ref={ref} {...rest}>
          {children}
        </a>
      </WouterLink>
    )
  },
)

export default Link
