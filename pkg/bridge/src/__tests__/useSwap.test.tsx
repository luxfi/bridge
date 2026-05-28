// Copyright (C) 2019-2025, Lux Industries, Inc. All rights reserved.
// See the file LICENSE for licensing terms.
//
// useSwap is wagmi-free (the swap form doesn't need a connected wallet to
// preview a quote). It now uses useNetworks() → useQuery() so each test
// renders inside a QueryClientProvider; the dynamic registry falls back to
// DEFAULT_CHAINS when the networks fetch errors, so the assertions about
// default IDs ('lux:96369', 'evm:1') still hold.

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Stub useNetworks to return the bundled defaults synchronously. This
// keeps the fetch counter focused on /api/quote (the surface under test)
// — without the stub, useNetworks fires a /api/networks request on mount
// and the test's single-response mock would account for it ahead of the
// quote call.
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
import { useSwap } from '../app/hooks/useSwap'
import { makeTestWrapper } from './test-providers'

const originalFetch = global.fetch

function mockOnce(body: unknown, ok = true) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? 'OK' : 'ERR',
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  })
}

beforeEach(() => {
  setConfig({
    apiHost: 'https://api.example.test',
    env: 'mainnet',
  })
})

afterEach(() => {
  global.fetch = originalFetch
  vi.useRealTimers()
})

describe('useSwap', () => {
  it('initializes with default chain pair + null quote', () => {
    const { result } = renderHook(() => useSwap(), { wrapper: makeTestWrapper() })
    expect(result.current.fromChain.id).toBe('lux:96369')
    expect(result.current.toChain.id).toBe('evm:1')
    expect(result.current.quote).toBeNull()
    expect(result.current.quoteError).toBeNull()
    expect(result.current.quoting).toBe(false)
  })

  it('reverse() swaps from/to chains and assets', () => {
    const { result } = renderHook(() => useSwap(), { wrapper: makeTestWrapper() })
    const before = {
      from: result.current.fromChain.id,
      to: result.current.toChain.id,
      fromAsset: result.current.fromAsset.id,
      toAsset: result.current.toAsset.id,
    }
    act(() => {
      result.current.reverse()
    })
    expect(result.current.fromChain.id).toBe(before.to)
    expect(result.current.toChain.id).toBe(before.from)
    expect(result.current.fromAsset.id).toBe(before.toAsset)
    expect(result.current.toAsset.id).toBe(before.fromAsset)
  })

  it('debounces quote fetches by 300ms', async () => {
    mockOnce({
      data: {
        quote: {
          receive_amount: 99.8,
          min_receive_amount: 97.3,
          blockchain_fee: 0.0008,
          service_fee: 0.01,
          avg_completion_time: '00:03:00',
          total_fee: 0.2,
          total_fee_in_usd: 0.2,
          slippage: 0.025,
        },
      },
    })
    const { result } = renderHook(() => useSwap(), { wrapper: makeTestWrapper() })

    act(() => {
      result.current.setAmount('100')
    })
    // No fetch synchronously.
    expect(global.fetch).not.toHaveBeenCalled()

    await waitFor(
      () => {
        expect(global.fetch).toHaveBeenCalledTimes(1)
      },
      { timeout: 1_000 },
    )

    await waitFor(() => {
      expect(result.current.quote?.outAmount).toBeCloseTo(99.8, 6)
      expect(result.current.quote?.rate).toBeCloseTo(0.998, 6)
      expect(result.current.quoting).toBe(false)
    })
  })

  it('clears the quote when amount is invalid or zero', async () => {
    mockOnce({ data: { quote: { receive_amount: 50, min_receive_amount: 49, blockchain_fee: 0, service_fee: 0.01, avg_completion_time: '00:03:00', total_fee: 0, total_fee_in_usd: 0, slippage: 0.025 } } })
    const { result } = renderHook(() => useSwap(), { wrapper: makeTestWrapper() })

    act(() => result.current.setAmount('10'))
    await waitFor(() => expect(result.current.quote).not.toBeNull(), { timeout: 1_000 })

    act(() => result.current.setAmount('0'))
    await waitFor(() => {
      expect(result.current.quote).toBeNull()
    })
  })

  it('surfaces quoteError on server 5xx', async () => {
    mockOnce({ error: 'boom' }, false)
    const { result } = renderHook(() => useSwap(), { wrapper: makeTestWrapper() })

    act(() => result.current.setAmount('5'))
    await waitFor(() => expect(result.current.quoteError).not.toBeNull(), {
      timeout: 1_000,
    })
    expect(result.current.quote).toBeNull()
  })
})
