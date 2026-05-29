// vitest.setup.ts — runs before every test file in the SDK.
//
// Why this file exists:
//
// `@tonconnect/ui-react` (and its underlying `@tonconnect/ui` core) eagerly
// touch `window.localStorage` at module import time — it reads the
// last-selected-wallet metadata while resolving the module. In test envs
// (happy-dom and certain jsdom configs), `window.localStorage` is present
// but its prototype methods aren't fully wired, so calls like
// `this.localStorage.getItem(...)` throw `getItem is not a function`.
//
// Polyfilling localStorage with a plain object that has the standard
// methods sidesteps this without changing any application code.

class MemoryStorage implements Storage {
  private data: Record<string, string> = {}

  get length(): number {
    return Object.keys(this.data).length
  }

  clear(): void {
    this.data = {}
  }

  getItem(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key]! : null
  }

  key(index: number): string | null {
    return Object.keys(this.data)[index] ?? null
  }

  removeItem(key: string): void {
    delete this.data[key]
  }

  setItem(key: string, value: string): void {
    this.data[key] = String(value)
  }
}

// Replace localStorage / sessionStorage with the polyfill on every
// supported global object. Idempotent — re-running this in subsequent
// test files is a no-op because Object.defineProperty with the same
// descriptor doesn't error.
function installStorage(target: object, name: 'localStorage' | 'sessionStorage'): void {
  try {
    Object.defineProperty(target, name, {
      value: new MemoryStorage(),
      writable: false,
      configurable: true,
    })
  } catch {
    // Already defined as non-configurable — leave it alone, the test
    // env's existing storage might already work for this case.
  }
}

if (typeof globalThis !== 'undefined') {
  installStorage(globalThis, 'localStorage')
  installStorage(globalThis, 'sessionStorage')
}
if (typeof window !== 'undefined') {
  installStorage(window, 'localStorage')
  installStorage(window, 'sessionStorage')
}

// Clear both storages before every test so writes from one test don't
// leak into the next — happy-dom's native storage auto-resets, our
// MemoryStorage polyfill doesn't, so test isolation was being silently
// broken (useTransfers's persistence layer was seeing residual swaps).
import { beforeEach } from 'vitest'
beforeEach(() => {
  if (typeof globalThis !== 'undefined') {
    globalThis.localStorage?.clear?.()
    globalThis.sessionStorage?.clear?.()
  }
  if (typeof window !== 'undefined') {
    window.localStorage?.clear?.()
    window.sessionStorage?.clear?.()
  }
})
