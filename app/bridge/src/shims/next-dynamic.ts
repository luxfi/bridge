/**
 * Vite SPA shim for `next/dynamic`.
 * React.lazy-backed dynamic imports with optional loading fallback.
 */
import React, { Suspense, type ComponentType, type FC } from 'react'

export interface DynamicOptions<P = Record<string, unknown>> {
  loading?: FC<{ error?: Error | null; isLoading?: boolean; pastDelay?: boolean; retry?: () => void; timedOut?: boolean; _props?: P }>
  ssr?: boolean
  suspense?: boolean
}

type Loader<P> = () => Promise<{ default: ComponentType<P> } | ComponentType<P>>

export default function dynamic<P = Record<string, unknown>>(
  loader: Loader<P>,
  opts: DynamicOptions<P> = {},
): ComponentType<P> {
  const Lazy = React.lazy(async () => {
    const mod = await loader()
    // Accept either { default: Component } or a Component directly
    const Component = (mod as { default?: ComponentType<P> }).default ?? (mod as ComponentType<P>)
    return { default: Component }
  })

  const Loading = opts.loading

  const Wrapped: FC<P> = (props) => {
    return React.createElement(
      Suspense,
      { fallback: Loading ? React.createElement(Loading, {} as never) : null },
      React.createElement(Lazy as ComponentType<P>, props),
    )
  }
  Wrapped.displayName = 'DynamicShim'
  return Wrapped
}
