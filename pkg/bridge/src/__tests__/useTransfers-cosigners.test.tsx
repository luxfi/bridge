// Layered cosigner SDK behavior (issue #390 — partial coverage at the
// hook level, mocked backend). Verifies that when `mpc.utila` and / or
// `mpc.fireblocks` are configured on BridgeConfig, the SDK forwards the
// matching `cosigners[]` array in the POST /api/swaps body — in
// snake_case, with PUBLIC IDs only (no `api_secret`, no `private_key`).
//
// Full backend-coupled e2e (issue #390 — Playwright happy / rejection)
// lands once the backend implementation (issue #386) is wired up.

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let accountState: { address: string | undefined } = { address: undefined }

vi.mock('wagmi', () => ({
  useAccount: () => accountState,
  // useTransfers also calls these for the EVM auto-deposit popup path
  // (native send + ERC-20 transfer + chain switch).
  useSendTransaction: () => ({
    sendTransactionAsync: vi.fn(async () => '0xdeadbeef' as `0x${string}`),
  }),
  useSwitchChain: () => ({
    switchChainAsync: vi.fn(async () => undefined),
  }),
  useWriteContract: () => ({
    writeContractAsync: vi.fn(async () => '0xfeed' as `0x${string}`),
  }),
}))

// Stub useNetworks → DEFAULT_CHAINS / DEFAULT_ASSETS so the fetch matcher
// here only handles /api/swaps (the surface under test).
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

function fetchMatcher(
  routes: Array<[RegExp | string, (() => unknown) | unknown]>,
) {
  return vi.fn().mockImplementation((url: string) => {
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
  accountState = { address: '0xabc1234567890abcdef1234567890abcdef12345' }
})

afterEach(() => {
  global.fetch = originalFetch
  vi.useRealTimers()
})

function initiateLuxToEvm(hook: ReturnType<typeof useTransfers>) {
  return hook.initiate({
    fromChainId: 'lux:96369',
    toChainId: 'evm:1',
    fromAssetId: 'lux:96369:LUX',
    toAssetId: 'evm:1:USDC',
    inAmount: 10,
    outAmount: 9.8,
  })
}

function postBody(): Record<string, unknown> {
  const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
  const post = calls.find((c) => /\/api\/swaps$/.test(c[0] as string))
  if (!post) throw new Error('no POST /api/swaps call was made')
  const init = post[1] as RequestInit
  return JSON.parse(init.body as string)
}

describe('useTransfers — layered cosigners (SDK side)', () => {
  it('omits cosigners[] entirely when no layered providers are configured', async () => {
    setConfig({
      apiHost: 'https://api.example.test',
      env: 'mainnet',
      brand: { name: 'TestBridge' },
      mpc: { publicUrl: 'https://mpc.example.test', protocol: 'cggmp21' },
    })
    global.fetch = fetchMatcher([
      [/\/api\/swaps$/, { data: { id: 'swap_a', status: 'pending' } }],
      [/\/api\/swaps\//, { data: { id: 'swap_a', status: 'pending' } }],
    ])
    const { result } = renderHook(() => useTransfers())
    await act(async () => {
      await initiateLuxToEvm(result.current)
    })
    expect('cosigners' in postBody()).toBe(false)
  })

  it('forwards a utila intent in snake_case with PUBLIC ids only', async () => {
    setConfig({
      apiHost: 'https://api.example.test',
      env: 'mainnet',
      brand: { name: 'TestBridge' },
      mpc: {
        publicUrl: 'https://mpc.example.test',
        protocol: 'cggmp21',
        utila: {
          orgId: 'tenant-x',
          clientId: 'lux-bridge',
          apiHost: 'https://api.utila.io',
          vaultId: 'vault_123',
        },
      },
    })
    global.fetch = fetchMatcher([
      [/\/api\/swaps$/, { data: { id: 'swap_b', status: 'pending' } }],
      [/\/api\/swaps\//, { data: { id: 'swap_b', status: 'pending' } }],
    ])
    const { result } = renderHook(() => useTransfers())
    await act(async () => {
      await initiateLuxToEvm(result.current)
    })
    const body = postBody()
    expect(body.cosigners).toEqual([
      {
        kind: 'utila',
        org_id: 'tenant-x',
        client_id: 'lux-bridge',
        api_host: 'https://api.utila.io',
        vault_id: 'vault_123',
      },
    ])
    // Defensive — no secret-like field ever in the wire body.
    const serialized = JSON.stringify(body).toLowerCase()
    expect(serialized).not.toMatch(/private_key|service_account_private_key|api_secret|\bjwt\b|\btoken\b/)
  })

  it('forwards a fireblocks intent in snake_case with PUBLIC ids only', async () => {
    setConfig({
      apiHost: 'https://api.example.test',
      env: 'mainnet',
      brand: { name: 'TestBridge' },
      mpc: {
        publicUrl: 'https://mpc.example.test',
        protocol: 'cggmp21',
        fireblocks: {
          apiKey: 'pub-key-id',
          apiHost: 'https://api.fireblocks.io',
          vaultAccountId: '0',
        },
      },
    })
    global.fetch = fetchMatcher([
      [/\/api\/swaps$/, { data: { id: 'swap_c', status: 'pending' } }],
      [/\/api\/swaps\//, { data: { id: 'swap_c', status: 'pending' } }],
    ])
    const { result } = renderHook(() => useTransfers())
    await act(async () => {
      await initiateLuxToEvm(result.current)
    })
    const body = postBody()
    expect(body.cosigners).toEqual([
      {
        kind: 'fireblocks',
        api_key: 'pub-key-id',
        api_host: 'https://api.fireblocks.io',
        vault_account_id: '0',
      },
    ])
  })

  it('forwards both utila + fireblocks together (belt + suspenders)', async () => {
    setConfig({
      apiHost: 'https://api.example.test',
      env: 'mainnet',
      brand: { name: 'TestBridge' },
      mpc: {
        publicUrl: 'https://mpc.example.test',
        utila: { orgId: 'org-a', clientId: 'cid-a' },
        fireblocks: { apiKey: 'pub-key' },
      },
    })
    global.fetch = fetchMatcher([
      [/\/api\/swaps$/, { data: { id: 'swap_d', status: 'pending' } }],
      [/\/api\/swaps\//, { data: { id: 'swap_d', status: 'pending' } }],
    ])
    const { result } = renderHook(() => useTransfers())
    await act(async () => {
      await initiateLuxToEvm(result.current)
    })
    const cosigners = postBody().cosigners as Array<Record<string, unknown>>
    expect(cosigners).toHaveLength(2)
    expect(cosigners[0]).toMatchObject({ kind: 'utila', org_id: 'org-a', client_id: 'cid-a' })
    expect(cosigners[1]).toMatchObject({ kind: 'fireblocks', api_key: 'pub-key' })
  })

  it('omits optional sub-fields (api_host, vault_id) when unset', async () => {
    setConfig({
      apiHost: 'https://api.example.test',
      env: 'mainnet',
      brand: { name: 'TestBridge' },
      mpc: {
        publicUrl: 'https://mpc.example.test',
        utila: { orgId: 'org', clientId: 'cid' },
      },
    })
    global.fetch = fetchMatcher([
      [/\/api\/swaps$/, { data: { id: 'swap_e', status: 'pending' } }],
      [/\/api\/swaps\//, { data: { id: 'swap_e', status: 'pending' } }],
    ])
    const { result } = renderHook(() => useTransfers())
    await act(async () => {
      await initiateLuxToEvm(result.current)
    })
    const cosigner = (postBody().cosigners as Array<Record<string, unknown>>)[0]
    expect(cosigner).toEqual({ kind: 'utila', org_id: 'org', client_id: 'cid' })
    // No `api_host: undefined`, no `vault_id: undefined` on the wire.
    expect('api_host' in cosigner!).toBe(false)
    expect('vault_id' in cosigner!).toBe(false)
  })
})
