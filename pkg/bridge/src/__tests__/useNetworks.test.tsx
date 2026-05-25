// Copyright (C) 2019-2025, Lux Industries, Inc. All rights reserved.
// See the file LICENSE for licensing terms.
//
// useNetworks fetches `${apiHost}/api/networks?version=…` and transforms the
// response into the SDK's flat chains/assets shape. The version query param
// is load-bearing — without it the bridge backend defaults to mainnetSettings
// even when the SDK is configured for env=testnet, which masks the entire
// testnet network registry. These tests pin that behaviour.

import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setConfig } from '../config'
import { useNetworks } from '../app/hooks/useNetworks'
import { makeTestWrapper } from './test-providers'

const originalFetch = global.fetch

interface ApiNetworkJson {
  display_name: string
  internal_name: string
  logo: string | null
  native_currency: string
  is_testnet: boolean
  is_featured: boolean
  average_completion_time: string
  chain_id: string | null
  type: string
  status: string
  transaction_explorer_template: string
  account_explorer_template: string
  currencies: Array<{
    name: string
    asset: string
    logo: string | null
    contract_address: string | null
    decimals: number
    status: string
    is_deposit_enabled: boolean
    is_withdrawal_enabled: boolean
    is_refuel_enabled: boolean
  }>
}

const sepolia: ApiNetworkJson = {
  display_name: 'Ethereum Sepolia',
  internal_name: 'ETHEREUM_SEPOLIA',
  logo: null,
  native_currency: 'ETH',
  is_testnet: true,
  is_featured: true,
  average_completion_time: '00:03:00',
  chain_id: '11155111',
  type: 'evm',
  status: 'active',
  transaction_explorer_template: 'https://sepolia.etherscan.io/tx/{0}',
  account_explorer_template: 'https://sepolia.etherscan.io/address/{0}',
  currencies: [
    {
      name: 'ETH',
      asset: 'ETH',
      logo: null,
      contract_address: null,
      decimals: 18,
      status: 'active',
      is_deposit_enabled: true,
      is_withdrawal_enabled: true,
      is_refuel_enabled: false,
    },
  ],
}

const luxTestnet: ApiNetworkJson = {
  display_name: 'Lux Testnet',
  internal_name: 'LUX_TESTNET',
  logo: null,
  native_currency: 'LUX',
  is_testnet: true,
  is_featured: true,
  average_completion_time: '00:03:00',
  chain_id: '96368',
  type: 'evm',
  status: 'active',
  transaction_explorer_template: 'https://explore.lux-test.network/tx/{0}',
  account_explorer_template: 'https://explore.lux-test.network/address/{0}',
  currencies: [
    {
      name: 'LUX',
      asset: 'LUX',
      logo: null,
      contract_address: null,
      decimals: 18,
      status: 'active',
      is_deposit_enabled: true,
      is_withdrawal_enabled: true,
      is_refuel_enabled: false,
    },
  ],
}

const ethereumMainnet: ApiNetworkJson = {
  display_name: 'Ethereum',
  internal_name: 'ETHEREUM_MAINNET',
  logo: null,
  native_currency: 'ETH',
  is_testnet: false,
  is_featured: true,
  average_completion_time: '00:03:00',
  chain_id: '1',
  type: 'evm',
  status: 'active',
  transaction_explorer_template: 'https://etherscan.io/tx/{0}',
  account_explorer_template: 'https://etherscan.io/address/{0}',
  currencies: [
    {
      name: 'ETH',
      asset: 'ETH',
      logo: null,
      contract_address: null,
      decimals: 18,
      status: 'active',
      is_deposit_enabled: true,
      is_withdrawal_enabled: true,
      is_refuel_enabled: false,
    },
  ],
}

function mockNetworksResponse(rows: ApiNetworkJson[]): ReturnType<typeof vi.fn> {
  const fetchSpy = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve({ data: rows }),
    text: () => Promise.resolve(JSON.stringify({ data: rows })),
  })
  global.fetch = fetchSpy as unknown as typeof fetch
  return fetchSpy
}

afterEach(() => {
  global.fetch = originalFetch
  vi.useRealTimers()
})

describe('useNetworks', () => {
  beforeEach(() => {
    setConfig({ apiHost: 'https://api.example.test', env: 'mainnet' })
  })

  it('requests version=mainnet for env=mainnet', async () => {
    const fetchSpy = mockNetworksResponse([ethereumMainnet])
    const { result } = renderHook(() => useNetworks(), {
      wrapper: makeTestWrapper(),
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [calledUrl] = fetchSpy.mock.calls[0] as [string]
    expect(calledUrl).toBe(
      'https://api.example.test/api/networks?version=mainnet',
    )
    expect(result.current.chains.map((c) => c.internalName)).toContain(
      'ETHEREUM_MAINNET',
    )
  })

  it('requests version=testnet for env=testnet and surfaces testnet chains', async () => {
    setConfig({ apiHost: 'https://api.example.test', env: 'testnet' })
    const fetchSpy = mockNetworksResponse([sepolia, luxTestnet])
    const { result } = renderHook(() => useNetworks(), {
      wrapper: makeTestWrapper(),
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const [calledUrl] = fetchSpy.mock.calls[0] as [string]
    expect(calledUrl).toBe(
      'https://api.example.test/api/networks?version=testnet',
    )
    const internalNames = result.current.chains.map((c) => c.internalName)
    expect(internalNames).toEqual(
      expect.arrayContaining(['ETHEREUM_SEPOLIA', 'LUX_TESTNET']),
    )
    // Mainnet rows must not bleed through the env filter.
    expect(internalNames).not.toContain('ETHEREUM_MAINNET')
  })

  it('falls back to bundled DEFAULT_CHAINS when the API yields zero rows', async () => {
    setConfig({ apiHost: 'https://api.example.test', env: 'testnet' })
    // Server hands us only mainnet rows — they should be filtered out, and
    // we should fall back to DEFAULT_CHAINS rather than render an empty picker.
    mockNetworksResponse([ethereumMainnet])
    const { result } = renderHook(() => useNetworks(), {
      wrapper: makeTestWrapper(),
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.chains.length).toBeGreaterThan(0)
  })

  it('requests version=devnet for env=devnet', async () => {
    setConfig({ apiHost: 'https://api.example.test', env: 'devnet' })
    const fetchSpy = mockNetworksResponse([])
    renderHook(() => useNetworks(), { wrapper: makeTestWrapper() })
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
    const [calledUrl] = fetchSpy.mock.calls[0] as [string]
    expect(calledUrl).toBe(
      'https://api.example.test/api/networks?version=devnet',
    )
  })
})
