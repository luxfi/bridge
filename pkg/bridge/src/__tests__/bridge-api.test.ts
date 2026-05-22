// Copyright (C) 2019-2025, Lux Industries, Inc. All rights reserved.
// See the file LICENSE for licensing terms.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  BridgeApiError,
  chainIdToInternalName,
  createSwap,
  fetchQuote,
  getSwap,
} from '../app/lib/bridge-api'

const API_HOST = 'https://api.example.test'

function mockFetch(response: {
  ok?: boolean
  status?: number
  body?: unknown
}) {
  const ok = response.ok ?? true
  const status = response.status ?? (ok ? 200 : 500)
  return vi.fn().mockResolvedValue({
    ok,
    status,
    statusText: ok ? 'OK' : 'ERR',
    json: () => Promise.resolve(response.body),
    text: () => Promise.resolve(JSON.stringify(response.body ?? null)),
  })
}

const originalFetch = global.fetch

beforeEach(() => {
  vi.useRealTimers()
})

afterEach(() => {
  global.fetch = originalFetch
})

describe('chainIdToInternalName', () => {
  it('maps known mainnet chains to internal_name', () => {
    expect(chainIdToInternalName('evm:1', 'mainnet')).toBe('ETHEREUM_MAINNET')
    expect(chainIdToInternalName('lux:96369', 'mainnet')).toBe('LUX_MAINNET')
    expect(chainIdToInternalName('evm:42161', 'mainnet')).toBe(
      'ARBITRUM_MAINNET',
    )
  })

  it('rewrites suffix to TESTNET / DEVNET based on env', () => {
    expect(chainIdToInternalName('evm:1', 'testnet')).toBe('ETHEREUM_TESTNET')
    expect(chainIdToInternalName('evm:1', 'devnet')).toBe('ETHEREUM_DEVNET')
    expect(chainIdToInternalName('lux:96369', 'testnet')).toBe('LUX_TESTNET')
  })

  it('returns null for unknown chain ids', () => {
    expect(chainIdToInternalName('btc:0', 'mainnet')).toBeNull()
    expect(chainIdToInternalName('evm:99999', 'mainnet')).toBeNull()
  })
})

describe('fetchQuote', () => {
  it('hits /api/quote with correct query params and unwraps data.quote', async () => {
    const body = {
      data: {
        quote: {
          receive_amount: 99.8,
          min_receive_amount: 97.3,
          blockchain_fee: 0,
          service_fee: 0.01,
          avg_completion_time: '00:03:00',
          total_fee: 0.2,
          total_fee_in_usd: 0.2,
          slippage: 0.025,
        },
        refuel: null,
        reward: {},
      },
    }
    global.fetch = mockFetch({ body })

    const q = await fetchQuote(API_HOST, {
      sourceNetwork: 'LUX_MAINNET',
      sourceToken: 'LUX',
      destinationNetwork: 'ETHEREUM_MAINNET',
      destinationToken: 'USDC',
      amount: 100,
    })

    expect(q.receive_amount).toBe(99.8)
    expect(q.min_receive_amount).toBe(97.3)
    expect(global.fetch).toHaveBeenCalledTimes(1)
    const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string
    expect(calledUrl).toContain('/api/quote?')
    expect(calledUrl).toContain('source_network=LUX_MAINNET')
    expect(calledUrl).toContain('source_token=LUX')
    expect(calledUrl).toContain('amount=100')
  })

  it('throws BridgeApiError on non-OK response', async () => {
    global.fetch = mockFetch({ ok: false, status: 502, body: { error: 'bad' } })
    await expect(
      fetchQuote(API_HOST, {
        sourceNetwork: 'LUX_MAINNET',
        sourceToken: 'LUX',
        destinationNetwork: 'ETHEREUM_MAINNET',
        destinationToken: 'USDC',
        amount: 1,
      }),
    ).rejects.toBeInstanceOf(BridgeApiError)
  })

  it('throws BridgeApiError when response shape is wrong', async () => {
    global.fetch = mockFetch({ body: { data: {} } })
    await expect(
      fetchQuote(API_HOST, {
        sourceNetwork: 'LUX_MAINNET',
        sourceToken: 'LUX',
        destinationNetwork: 'ETHEREUM_MAINNET',
        destinationToken: 'USDC',
        amount: 1,
      }),
    ).rejects.toMatchObject({
      name: 'BridgeApiError',
      message: expect.stringMatching(/missing quote/),
    })
  })
})

describe('createSwap', () => {
  it('POSTs to /api/swaps with snake_case body + Idempotency-Key header', async () => {
    global.fetch = mockFetch({
      body: { data: { id: 'swap_123', status: 'pending' } },
    })
    const swap = await createSwap(
      API_HOST,
      {
        amount: 100,
        sourceNetwork: 'LUX_MAINNET',
        sourceAsset: 'LUX',
        destinationNetwork: 'ETHEREUM_MAINNET',
        destinationAsset: 'USDC',
        destinationAddress: '0xabc',
        useDepositAddress: false,
        useTeleporter: true,
        appName: 'test',
      },
      { idempotencyKey: 'key-abc' },
    )
    expect(swap.id).toBe('swap_123')
    const init = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as RequestInit
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      'Idempotency-Key': 'key-abc',
    })
    const body = JSON.parse(init.body as string)
    expect(body).toMatchObject({
      amount: 100,
      source_network: 'LUX_MAINNET',
      destination_address: '0xabc',
      use_teleporter: true,
      app_name: 'test',
    })
  })

  it('throws when server returns no id', async () => {
    global.fetch = mockFetch({ body: { data: {} } })
    await expect(
      createSwap(API_HOST, {
        amount: 1,
        sourceNetwork: 'LUX_MAINNET',
        sourceAsset: 'LUX',
        destinationNetwork: 'ETHEREUM_MAINNET',
        destinationAsset: 'USDC',
        destinationAddress: '0x',
        useDepositAddress: false,
        useTeleporter: true,
        appName: 't',
      }),
    ).rejects.toBeInstanceOf(BridgeApiError)
  })
})

describe('getSwap', () => {
  it('GETs /api/swaps/:id and unwraps data', async () => {
    global.fetch = mockFetch({ body: { data: { id: 'x', status: 'completed' } } })
    const swap = await getSwap(API_HOST, 'x')
    expect(swap.status).toBe('completed')
    const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string
    expect(calledUrl).toMatch(/\/api\/swaps\/x$/)
  })

  it('encodes the swap id', async () => {
    global.fetch = mockFetch({ body: { data: { id: 'x', status: 'ok' } } })
    await getSwap(API_HOST, 'swap/with/slashes')
    const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string
    expect(calledUrl).toContain('/api/swaps/swap%2Fwith%2Fslashes')
  })
})
