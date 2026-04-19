/**
 * Vite SPA shim for `next/headers`. Browser-only; cookies come from document.cookie.
 * No server context in SPA mode — headers() returns empty readable store.
 */
interface CookieStore {
  get: (name: string) => { name: string; value: string } | undefined
  getAll: () => Array<{ name: string; value: string }>
  has: (name: string) => boolean
}

function parseCookies(): Map<string, string> {
  const map = new Map<string, string>()
  if (typeof document === 'undefined') return map
  const raw = document.cookie
  if (!raw) return map
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const name = part.slice(0, idx).trim()
    const value = decodeURIComponent(part.slice(idx + 1).trim())
    if (name) map.set(name, value)
  }
  return map
}

export function cookies(): CookieStore {
  const map = parseCookies()
  return {
    get: (name: string) => {
      const value = map.get(name)
      return value == null ? undefined : { name, value }
    },
    getAll: () => Array.from(map.entries()).map(([name, value]) => ({ name, value })),
    has: (name: string) => map.has(name),
  }
}

export function headers(): ReadonlyMap<string, string> {
  return new Map()
}
