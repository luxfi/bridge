// LocalStorage persistence for bridge transfers.
//
// Scope: per (apiHost, walletAddress) so different envs and different
// signers don't collide. Stored records are intentionally a *subset* of
// the in-memory `Transfer` shape — no AbortControllers, no closures, just
// the serializable view a refresh needs to re-render.
//
// Storage budget: 50 most-recent transfers per scope. The cap is deliberate
// (localStorage has tight quotas on some browsers and we don't want a
// long-running user to balloon the page payload).

import type { Transfer } from '../hooks/useTransfers'

const MAX_TRANSFERS = 50
const VERSION = 1

interface StoredV1 {
  v: 1
  transfers: Transfer[]
}

function key(apiHost: string, walletAddress: string | null | undefined): string | null {
  if (!walletAddress) return null
  // Stable key — strips trailing slash on apiHost so the same host with /
  // and without / share storage.
  const host = apiHost.replace(/\/+$/, '')
  return `bridge:transfers:${VERSION}:${host}:${walletAddress.toLowerCase()}`
}

/**
 * Read the persisted transfer list for a given (apiHost, wallet) scope.
 * Returns [] when storage is missing, unreadable, or the schema doesn't
 * match (we never throw to the caller — a broken cache must not break
 * the UI).
 */
export function loadTransfers(
  apiHost: string,
  walletAddress: string | null | undefined,
): Transfer[] {
  if (typeof window === 'undefined' || !window.localStorage) return []
  const k = key(apiHost, walletAddress)
  if (!k) return []
  try {
    const raw = window.localStorage.getItem(k)
    if (!raw) return []
    const parsed = JSON.parse(raw) as StoredV1
    if (!parsed || parsed.v !== VERSION || !Array.isArray(parsed.transfers)) {
      return []
    }
    return parsed.transfers.slice(0, MAX_TRANSFERS)
  } catch {
    return []
  }
}

/**
 * Persist the transfer list for a given (apiHost, wallet) scope. No-ops
 * when wallet is missing or localStorage is unavailable (SSR / private mode).
 */
export function saveTransfers(
  apiHost: string,
  walletAddress: string | null | undefined,
  transfers: Transfer[],
): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  const k = key(apiHost, walletAddress)
  if (!k) return
  try {
    const payload: StoredV1 = {
      v: VERSION,
      transfers: transfers.slice(0, MAX_TRANSFERS),
    }
    window.localStorage.setItem(k, JSON.stringify(payload))
  } catch {
    // Quota exceeded / disabled — silent. The in-memory list still works.
  }
}

/**
 * Return true when a transfer is still active (the UI may want to resume
 * polling on it). Terminal phases never need polling.
 */
export function isActive(t: Transfer): boolean {
  return t.phase !== 'completed' && t.phase !== 'failed'
}
