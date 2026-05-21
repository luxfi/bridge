// Display formatters for the inlined bridge UI.
//
// Pure functions, no React. Phase 3 R2 will pull these against @hanzo/gui's
// `Text` primitive for typography, but the formatters themselves stay here.

/** Truncate a 0x address or similar to `0x1234…ABCD`. */
export function shortAddress(addr: string, head = 6, tail = 4): string {
  if (!addr) return ''
  if (addr.length <= head + tail + 2) return addr
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`
}

/** Format a decimal amount with up to N significant digits, trimming zeros. */
export function formatAmount(value: number | string, maxDigits = 6): string {
  const n = typeof value === 'string' ? Number(value) : value
  if (!isFinite(n) || n === 0) return '0'
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(2)}K`
  return n.toLocaleString('en-US', { maximumFractionDigits: maxDigits })
}

/** Format USD value, e.g. `$1,234.56`. */
export function formatUsd(value: number): string {
  if (!isFinite(value)) return '$0.00'
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })
}

/** Parse a user-typed amount, allowing leading `.` and partial decimals. */
export function parseAmount(input: string): number | null {
  if (input === '' || input === '.') return null
  const n = Number(input)
  return isFinite(n) && n >= 0 ? n : null
}
