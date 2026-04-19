/**
 * Vite SPA shim for `next/navigation`.
 * Maps Next.js App Router navigation hooks onto wouter + URLSearchParams.
 */
import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { useLocation as useWouterLocation, useSearch } from 'wouter'

export type ReadonlyURLSearchParams = URLSearchParams

export function useSearchParams(): URLSearchParams {
  const search = useSearch()
  return useMemo(() => new URLSearchParams(search ?? ''), [search])
}

export function usePathname(): string {
  const [location] = useWouterLocation()
  return location
}

export interface AppRouter {
  push: (href: string) => void
  replace: (href: string) => void
  back: () => void
  forward: () => void
  refresh: () => void
  prefetch: (_href: string) => void
}

export function useRouter(): AppRouter {
  const [, setLocation] = useWouterLocation()
  return useMemo(
    () => ({
      push: (href: string) => setLocation(href),
      replace: (href: string) => setLocation(href, { replace: true }),
      back: () => window.history.back(),
      forward: () => window.history.forward(),
      refresh: () => window.location.reload(),
      prefetch: () => {},
    }),
    [setLocation],
  )
}

// Minimal useParams — wouter uses route-level params; callers that need [slug]
// should read via useRoute or the matched route. This shim returns {} unless
// the caller has set window.__NEXT_PARAMS__ via the page component.
function subscribe(cb: () => void) {
  window.addEventListener('popstate', cb)
  return () => window.removeEventListener('popstate', cb)
}
function getParams(): Record<string, string> {
  return (window as unknown as { __NEXT_PARAMS__?: Record<string, string> }).__NEXT_PARAMS__ || {}
}
export function useParams<T extends Record<string, string> = Record<string, string>>(): T {
  return useSyncExternalStore(subscribe, getParams) as T
}

export function redirect(href: string): never {
  window.location.assign(href)
  throw new Error('redirect')
}

export function notFound(): never {
  throw new Error('notFound')
}
