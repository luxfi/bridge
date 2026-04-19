/**
 * Vite SPA shim for `@next/mdx` — not used at runtime in SPA mode.
 */
export default function withMDX<T = unknown>(config: T): T {
  return config
}
