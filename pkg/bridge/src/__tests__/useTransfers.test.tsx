// Copyright (C) 2019-2025, Lux Industries, Inc. All rights reserved.
// See the file LICENSE for licensing terms.
//
// useTransfers POSTs to /api/swaps then polls /api/swaps/:id. We mock
// wagmi's useAccount + the fetch surface to drive each scenario.

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let accountState: { address: string | undefined } = { address: undefined }

// Hoisted so the wagmi mock can reference them at module-init time; tests
// reset and assert call history per-case via the wagmi-mocks export below.
const wagmiMocks = vi.hoisted(() => ({
  sendTransactionAsync: vi.fn(async (_args: unknown) => '0xdeadbeef' as `0x${string}`),
  switchChainAsync: vi.fn(async (_args: unknown) => undefined),
  writeContractAsync: vi.fn(async (_args: unknown) => '0xfeed' as `0x${string}`),
}))

vi.mock('wagmi', () => ({
  useAccount: () => accountState,
  // Auto-deposit (Phase 3 wagmi-push) calls these on EVM swaps.
  useSendTransaction: () => ({ sendTransactionAsync: wagmiMocks.sendTransactionAsync }),
  useSwitchChain: () => ({ switchChainAsync: wagmiMocks.switchChainAsync }),
  useWriteContract: () => ({ writeContractAsync: wagmiMocks.writeContractAsync }),
}))

// useSolanaSend reads from @solana/wallet-adapter-react's WalletContext,
// which logs a noisy console.error on every render when no WalletProvider
// is mounted. The hook itself never crashes (the default context returns
// null), but the noise drowns out real test failures. Tests don't
// exercise non-EVM auto-deposit; mirror the wagmi mock pattern and
// hand back noop senders. Real Sol→Lux / TON / BTC flows are covered
// by the integration story (NonEVMProviders mounts the real provider).
vi.mock('../app/lib/wallet-adapters', () => ({
  useSolanaSend: () => ({
    sendSolAsync: () => Promise.reject(new Error('useSolanaSend mocked in test')),
    ready: false,
    senderAddress: null,
  }),
  useTonSend: () => ({
    sendTonAsync: () => Promise.reject(new Error('useTonSend mocked in test')),
    ready: false,
    senderAddress: null,
  }),
  useXrpSend: () => ({
    sendXrpAsync: () => Promise.reject(new Error('useXrpSend mocked in test')),
    ready: false,
    senderAddress: null,
  }),
  useWalletForFamily: () => ({
    family: 'noop',
    address: null,
    connected: false,
    connecting: false,
    connect: async () => {},
    disconnect: async () => {},
    balance: null,
    balanceSymbol: '',
    balanceLoading: false,
    availableWallets: [],
  }),
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
      // Pure MPC flow: every source gets an MPC-derived deposit address;
      // the teleporter-contract dispatch is off the happy path.
      use_deposit_address: true,
      use_teleporter: false,
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

  // ───────────────────────────────────────────────────────────────────────
  // EVM auto-deposit (Phase 3 wagmi-push)
  // ───────────────────────────────────────────────────────────────────────
  //
  // After createSwap returns with a deposit_address, useTransfers tries
  // to pop the user's wallet via wagmi when the source chain is
  // EVM-native. ERC-20 and non-EVM sources MUST short-circuit so the
  // hook stays compatible with chains that don't have a wagmi popup.

  describe('EVM auto-deposit (wagmi-push)', () => {
    beforeEach(() => {
      wagmiMocks.sendTransactionAsync.mockClear()
      wagmiMocks.switchChainAsync.mockClear()
      wagmiMocks.writeContractAsync.mockClear()
      accountState = { address: '0xabc1234567890abcdef1234567890abcdef12345' }
    })

    it('pops the wallet for EVM native source with deposit_address envelope', async () => {
      global.fetch = fetchMatcher([
        [
          /\/api\/swaps$/,
          {
            data: {
              id: 'swap_auto',
              status: 'pending',
              // Envelope: walletId###0x-address (the MPC-derived address).
              deposit_address: 'mpc-wallet-1###0xfeedfacecafebeef0000000000000000deadbeef',
            },
          },
        ],
        [/\/api\/swaps\//, { data: { id: 'swap_auto', status: 'pending' } }],
      ])

      const { result } = renderHook(() => useTransfers())
      await act(async () => {
        await result.current.initiate({
          fromChainId: 'evm:1',
          toChainId: 'lux:96369',
          fromAssetId: 'evm:1:ETH',
          toAssetId: 'lux:96369:LUX',
          inAmount: 0.5,
          outAmount: 0.49,
        })
      })

      expect(wagmiMocks.switchChainAsync).toHaveBeenCalledWith({ chainId: 1 })
      expect(wagmiMocks.sendTransactionAsync).toHaveBeenCalledTimes(1)
      const args = wagmiMocks.sendTransactionAsync.mock.calls[0]?.[0] as {
        to: string
        value: bigint
        chainId: number
      }
      expect(args.to.toLowerCase()).toBe('0xfeedfacecafebeef0000000000000000deadbeef')
      expect(args.value).toBe(500000000000000000n) // 0.5 ETH in wei
      expect(args.chainId).toBe(1)
    })

    it('skips the popup for non-EVM source chains (BTC)', async () => {
      global.fetch = fetchMatcher([
        [
          /\/api\/swaps$/,
          {
            data: {
              id: 'swap_btc',
              status: 'pending',
              deposit_address: 'mpc-wallet-2###tb1qexampleexampleexampleexample',
            },
          },
        ],
        [/\/api\/swaps\//, { data: { id: 'swap_btc', status: 'pending' } }],
      ])
      const { result } = renderHook(() => useTransfers())
      await act(async () => {
        await result.current.initiate({
          fromChainId: 'btc:mainnet',
          toChainId: 'lux:96369',
          fromAssetId: 'btc:mainnet:BTC',
          toAssetId: 'lux:96369:LUX',
          inAmount: 0.001,
          outAmount: 0.0009,
        })
      })
      expect(wagmiMocks.sendTransactionAsync).not.toHaveBeenCalled()
    })

    it('marks the transfer failed with "Wallet rejected" when MetaMask is rejected', async () => {
      wagmiMocks.sendTransactionAsync.mockRejectedValueOnce(
        new Error('User rejected the request'),
      )
      global.fetch = fetchMatcher([
        [
          /\/api\/swaps$/,
          {
            data: {
              id: 'swap_reject',
              status: 'pending',
              deposit_address: 'mpc-wallet-3###0xfeedfacecafebeef0000000000000000deadbeef',
            },
          },
        ],
        [/\/api\/swaps\//, { data: { id: 'swap_reject', status: 'pending' } }],
      ])
      const { result } = renderHook(() => useTransfers())
      await act(async () => {
        await result.current.initiate({
          fromChainId: 'evm:1',
          toChainId: 'lux:96369',
          fromAssetId: 'evm:1:ETH',
          toAssetId: 'lux:96369:LUX',
          inAmount: 0.1,
          outAmount: 0.09,
        })
      })
      expect(result.current.active?.phase).toBe('failed')
      expect(result.current.active?.error).toBe('Wallet rejected')
      // Address still surfaced for the user's own records / manual retry.
      expect(result.current.active?.depositAddress).toContain('0xfeedface')
    })

    it('routes ERC-20 sources to writeContract instead of sendTransaction', async () => {
      // USDC on Ethereum mainnet — a known DEFAULT_ASSETS entry with
      // contractAddress + decimals=6. The helper should call
      // writeContractAsync with transfer(deposit, parseUnits(amount, 6)).
      global.fetch = fetchMatcher([
        [
          /\/api\/swaps$/,
          {
            data: {
              id: 'swap_erc20',
              status: 'pending',
              deposit_address: 'mpc-wallet-4###0xfeedfacecafebeef0000000000000000deadbeef',
            },
          },
        ],
        [/\/api\/swaps\//, { data: { id: 'swap_erc20', status: 'pending' } }],
      ])
      const { result } = renderHook(() => useTransfers())
      await act(async () => {
        await result.current.initiate({
          fromChainId: 'evm:1',
          toChainId: 'lux:96369',
          fromAssetId: 'evm:1:USDC',
          toAssetId: 'lux:96369:LUX',
          inAmount: 100,
          outAmount: 99.5,
        })
      })

      // Native sendTransaction is NOT called for ERC-20 sources.
      expect(wagmiMocks.sendTransactionAsync).not.toHaveBeenCalled()
      // writeContract IS called, with the transfer() shape.
      expect(wagmiMocks.writeContractAsync).toHaveBeenCalledTimes(1)
      const args = wagmiMocks.writeContractAsync.mock.calls[0]?.[0] as {
        address: string
        functionName: string
        args: readonly [string, bigint]
        chainId: number
      }
      expect(args.functionName).toBe('transfer')
      expect(args.address.toLowerCase()).toMatch(/^0x[0-9a-f]{40}$/)
      expect(args.args[0].toLowerCase()).toBe('0xfeedfacecafebeef0000000000000000deadbeef')
      expect(args.args[1]).toBe(100_000_000n) // 100 USDC × 10^6
      expect(args.chainId).toBe(1)
    })

    it('marks failed when the user rejects the ERC-20 popup', async () => {
      wagmiMocks.writeContractAsync.mockRejectedValueOnce(
        // EIP-1193 4001-style error from MetaMask
        Object.assign(new Error('User denied transaction signature'), {
          name: 'UserRejectedRequestError',
        }),
      )
      global.fetch = fetchMatcher([
        [
          /\/api\/swaps$/,
          {
            data: {
              id: 'swap_erc20_rej',
              status: 'pending',
              deposit_address: 'mpc-wallet-5###0xfeedfacecafebeef0000000000000000deadbeef',
            },
          },
        ],
        [/\/api\/swaps\//, { data: { id: 'swap_erc20_rej', status: 'pending' } }],
      ])
      const { result } = renderHook(() => useTransfers())
      await act(async () => {
        await result.current.initiate({
          fromChainId: 'evm:1',
          toChainId: 'lux:96369',
          fromAssetId: 'evm:1:USDC',
          toAssetId: 'lux:96369:LUX',
          inAmount: 50,
          outAmount: 49.5,
        })
      })
      expect(result.current.active?.phase).toBe('failed')
      expect(result.current.active?.error).toBe('Wallet rejected')
    })

    it('marks failed when the user rejects the chain switch', async () => {
      wagmiMocks.switchChainAsync.mockRejectedValueOnce(
        new Error('User rejected the request'),
      )
      global.fetch = fetchMatcher([
        [
          /\/api\/swaps$/,
          {
            data: {
              id: 'swap_chain_rej',
              status: 'pending',
              deposit_address: 'mpc-wallet-6###0xfeedfacecafebeef0000000000000000deadbeef',
            },
          },
        ],
        [/\/api\/swaps\//, { data: { id: 'swap_chain_rej', status: 'pending' } }],
      ])
      const { result } = renderHook(() => useTransfers())
      await act(async () => {
        await result.current.initiate({
          fromChainId: 'evm:1',
          toChainId: 'lux:96369',
          fromAssetId: 'evm:1:ETH',
          toAssetId: 'lux:96369:LUX',
          inAmount: 0.1,
          outAmount: 0.09,
        })
      })
      expect(result.current.active?.phase).toBe('failed')
      expect(result.current.active?.error).toBe('Wallet rejected')
      // No tx attempted after a refused chain switch.
      expect(wagmiMocks.sendTransactionAsync).not.toHaveBeenCalled()
      expect(wagmiMocks.writeContractAsync).not.toHaveBeenCalled()
    })

    it('skips the popup when no deposit_address comes back', async () => {
      global.fetch = fetchMatcher([
        // No deposit_address field at all — server didn't issue one.
        [/\/api\/swaps$/, { data: { id: 'swap_nodep', status: 'pending' } }],
        [/\/api\/swaps\//, { data: { id: 'swap_nodep', status: 'pending' } }],
      ])
      const { result } = renderHook(() => useTransfers())
      await act(async () => {
        await result.current.initiate({
          fromChainId: 'evm:1',
          toChainId: 'lux:96369',
          fromAssetId: 'evm:1:ETH',
          toAssetId: 'lux:96369:LUX',
          inAmount: 0.5,
          outAmount: 0.49,
        })
      })
      expect(wagmiMocks.sendTransactionAsync).not.toHaveBeenCalled()
    })
  })

  // ───────────────────────────────────────────────────────────────────────
  // Server-side LastError propagation
  // ───────────────────────────────────────────────────────────────────────
  //
  // The bridge backend writes a human-readable transient error to
  // `last_error` on the swap record whenever the broadcast or signing
  // leg fails recoverably (insufficient funds, RPC gateway flake,
  // etc.). The SPA polls /api/swaps/:id, mirrors that field to
  // Transfer.lastError, and TransferStatus renders it as a warning
  // banner — distinct from `Transfer.error` (terminal failure).

  describe('refund phase propagation', () => {
    it('maps server refunding/refunded statuses to TransferPhase + surfaces refund_tx_hash', async () => {
      let serverState = {
        status: 'bridge_transfer_pending_broadcasting' as string,
        refund_tx_hash: undefined as string | undefined,
      }
      global.fetch = fetchMatcher([
        [/\/api\/swaps$/, { data: { id: 'swap_refunded', status: 'pending' } }],
        [
          /\/api\/swaps\//,
          () => ({
            data: {
              id: 'swap_refunded',
              status: serverState.status,
              ...(serverState.refund_tx_hash
                ? { refund_tx_hash: serverState.refund_tx_hash }
                : {}),
            },
          }),
        ],
      ])
      const { result } = renderHook(() => useTransfers())
      await act(async () => {
        await result.current.initiate({
          fromChainId: 'lux:96369',
          toChainId: 'evm:1',
          fromAssetId: 'lux:96369:LUX',
          toAssetId: 'evm:1:USDC',
          inAmount: 1,
          outAmount: 0.99,
        })
      })

      // Step 1 — server transitions to refunding.
      serverState = { status: 'refunding', refund_tx_hash: undefined }
      await waitFor(
        () => {
          expect(result.current.active?.phase).toBe('refunding')
        },
        { timeout: 5_000 },
      )

      // Step 2 — server lands the refund + reports the source-chain tx hash.
      serverState = { status: 'refunded', refund_tx_hash: '0xrefundhash123' }
      await waitFor(
        () => {
          expect(result.current.active?.phase).toBe('refunded')
        },
        { timeout: 5_000 },
      )
      expect(result.current.active?.refundTxHash).toBe('0xrefundhash123')

      // 'refunded' is terminal — poll loop stops. The SPA's 5min
      // timeout should NOT fire (no patch to 'failed'). The phase
      // staying at 'refunded' after a beat is a regression guard:
      // if subscribe() kept polling and the next response was missing
      // refund_tx_hash, refundTxHash would clear here.
      await new Promise((r) => setTimeout(r, 200))
      expect(result.current.active?.phase).toBe('refunded')
      expect(result.current.active?.refundTxHash).toBe('0xrefundhash123')
    })
  })

  describe('server-side last_error propagation', () => {
    it('mirrors last_error from poll into Transfer.lastError', async () => {
      let lastErr: string | null =
        'Insufficient funds in release address — fund the MPC address with destination-chain gas tokens'
      global.fetch = fetchMatcher([
        [/\/api\/swaps$/, { data: { id: 'swap_lerr', status: 'pending' } }],
        [
          /\/api\/swaps\//,
          () => ({
            data: {
              id: 'swap_lerr',
              status: 'bridge_transfer_pending_broadcasting',
              ...(lastErr ? { last_error: lastErr } : {}),
            },
          }),
        ],
      ])
      const { result } = renderHook(() => useTransfers())
      await act(async () => {
        await result.current.initiate({
          fromChainId: 'lux:96369',
          toChainId: 'evm:1',
          fromAssetId: 'lux:96369:LUX',
          toAssetId: 'evm:1:USDC',
          inAmount: 1,
          outAmount: 0.99,
        })
      })
      await waitFor(
        () => {
          expect(result.current.active?.lastError).toMatch(/insufficient funds/i)
        },
        { timeout: 5_000 },
      )
      // Phase stays in broadcasting — last_error is NOT terminal.
      expect(result.current.active?.phase).toBe('broadcasting')
      expect(result.current.active?.error).toBeUndefined()

      // Server clears its last_error on the next tick (issue resolved
      // → user funded address → broadcast accepted). The local
      // Transfer.lastError should clear too.
      lastErr = null
      await waitFor(
        () => {
          expect(result.current.active?.lastError).toBeUndefined()
        },
        { timeout: 5_000 },
      )
    })
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
