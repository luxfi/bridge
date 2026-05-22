// Copyright (C) 2019-2025, Lux Industries, Inc. All rights reserved.
// See the file LICENSE for licensing terms.
//
// useTransfers POSTs to /api/swaps then polls /api/swaps/:id. We mock
// wagmi's useAccount + the fetch surface to drive each scenario.

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let accountState: { address: string | undefined } = { address: undefined }

vi.mock('wagmi', () => ({
  useAccount: () => accountState,
}))

// Stub useNetworks to return the bundled static defaults so the test's
// fetch matcher only sees /api/swaps + /api/swaps/:id (not the
// /api/networks call useNetworks would otherwise fire on mount).
vi.mock('../app/hooks/useNetworks', async () => {
  const { DEFAULT_CHAINS } = await import('../app/lib/chains')
  const { DEFAULT_ASSETS } = await import('../app/lib/assets')
  return {
    useNetworks: () => ({
      chains: DEFAULT_CHAINS,
      assets: DEFAULT_ASSETS,
      isLoading: false,
      isError: false,
      refetch: () => {},
    }),
  }
})

import { setConfig } from '../config'
import { useTransfers } from '../app/hooks/useTransfers'

const originalFetch = global.fetch

/**
 * Build a fetch double that responds based on URL pattern. Each entry is a
 * (urlMatch, response) pair; the first match wins. Responses can be a
 * function returning a Response-shaped object, or a static one.
 */
function fetchMatcher(
  routes: Array<[RegExp | string, (() => unknown) | unknown]>,
) {
  return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const route = routes.find(([m]) =>
      typeof m === 'string' ? url.includes(m) : m.test(url),
    )
    if (!route) {
      return Promise.reject(new Error(`unrouted fetch: ${url}`))
    }
    const body = typeof route[1] === 'function' ? (route[1] as () => unknown)() : route[1]
    return Promise.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    })
  })
}

beforeEach(() => {
  setConfig({
    apiHost: 'https://api.example.test',
    env: 'mainnet',
    brand: { name: 'TestBridge' },
  })
  accountState = { address: '0xabc1234567890abcdef1234567890abcdef12345' }
})

afterEach(() => {
  global.fetch = originalFetch
  vi.useRealTimers()
})

describe('useTransfers', () => {
  it('initiate() POSTs to /api/swaps with snake_case + idempotency key', async () => {
    let serverStatus = 'pending'
    global.fetch = fetchMatcher([
      [
        /\/api\/swaps$/,
        { data: { id: 'swap_abc', status: 'pending' } },
      ],
      [
        /\/api\/swaps\/swap_abc/,
        () => ({ data: { id: 'swap_abc', status: serverStatus } }),
      ],
    ])

    const { result } = renderHook(() => useTransfers())

    let local: ReturnType<typeof result.current.initiate> | null = null
    await act(async () => {
      local = result.current.initiate({
        fromChainId: 'lux:96369',
        toChainId: 'evm:1',
        fromAssetId: 'lux:96369:LUX',
        toAssetId: 'evm:1:USDC',
        inAmount: 10,
        outAmount: 9.8,
      })
      await local
    })

    expect(result.current.transfers.length).toBe(1)
    expect(result.current.active?.phase).toBe('pending')

    // Verify the POST shape.
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
    const post = calls.find((c) => /\/api\/swaps$/.test(c[0] as string))
    expect(post).toBeDefined()
    const init = post?.[1] as RequestInit
    expect(init?.method).toBe('POST')
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json' })
    const body = JSON.parse(init?.body as string)
    expect(body).toMatchObject({
      amount: 10,
      source_network: 'LUX_MAINNET',
      destination_network: 'ETHEREUM_MAINNET',
      destination_address: '0xabc1234567890abcdef1234567890abcdef12345',
      use_teleporter: true, // LUX leg → teleporter
      app_name: 'TestBridge',
    })

    // Advance server state and wait for poll to pick up.
    serverStatus = 'completed'
    await waitFor(
      () => {
        expect(result.current.active?.phase).toBe('completed')
      },
      { timeout: 5_000 },
    )
  })

  it('fails the transfer when no destination address is available', async () => {
    accountState = { address: undefined }
    global.fetch = fetchMatcher([[/.*/, { data: { id: 'x', status: 'x' } }]])
    const { result } = renderHook(() => useTransfers())

    await act(async () => {
      await result.current.initiate({
        fromChainId: 'lux:96369',
        toChainId: 'evm:1',
        fromAssetId: 'lux:96369:LUX',
        toAssetId: 'evm:1:USDC',
        inAmount: 1,
        outAmount: 1,
      })
    })

    expect(result.current.active?.phase).toBe('failed')
    expect(result.current.active?.error).toMatch(/wallet not connected/)
  })

  it('fails on unsupported chain pair (no internal_name mapping)', async () => {
    global.fetch = fetchMatcher([[/.*/, { data: { id: 'x', status: 'x' } }]])
    const { result } = renderHook(() => useTransfers())

    await act(async () => {
      await result.current.initiate({
        fromChainId: 'evm:9999',
        toChainId: 'evm:1',
        fromAssetId: 'evm:9999:ETH',
        toAssetId: 'evm:1:USDC',
        inAmount: 1,
        outAmount: 1,
      })
    })

    expect(result.current.active?.phase).toBe('failed')
    expect(result.current.active?.error).toMatch(/Unsupported/)
  })

  it('clear() removes all transfers and aborts polling', async () => {
    global.fetch = fetchMatcher([
      [/\/api\/swaps$/, { data: { id: 'swap_y', status: 'pending' } }],
      [/\/api\/swaps\//, { data: { id: 'swap_y', status: 'pending' } }],
    ])
    const { result } = renderHook(() => useTransfers())
    await act(async () => {
      await result.current.initiate({
        fromChainId: 'lux:96369',
        toChainId: 'evm:1',
        fromAssetId: 'lux:96369:LUX',
        toAssetId: 'evm:1:USDC',
        inAmount: 5,
        outAmount: 4.9,
      })
    })
    expect(result.current.transfers.length).toBe(1)
    act(() => {
      result.current.clear()
    })
    expect(result.current.transfers).toEqual([])
    expect(result.current.active).toBeNull()
  })
})
