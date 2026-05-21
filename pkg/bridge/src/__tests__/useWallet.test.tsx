// Copyright (C) 2019-2025, Lux Industries, Inc. All rights reserved.
// See the file LICENSE for licensing terms.
//
// useWallet wraps wagmi hooks. We mock the wagmi module so the test stays
// pure-React and doesn't require a real WagmiProvider tree.

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Connector stubs (id + name only — we never invoke them in tests).
const injectedStub = { id: 'injected', name: 'Injected' }
const coinbaseStub = { id: 'coinbaseWalletSDK', name: 'Coinbase' }
const wcStub = { id: 'walletConnect', name: 'WalletConnect' }

const connectAsync = vi.fn()
const disconnectAsync = vi.fn()
const signMessageAsync = vi.fn().mockResolvedValue('0xsignature')
const switchChainAsync = vi.fn()

let accountState: {
  address: string | undefined
  chainId: number | undefined
  isConnecting: boolean
} = {
  address: undefined,
  chainId: undefined,
  isConnecting: false,
}

vi.mock('wagmi', () => ({
  useAccount: () => accountState,
  useConnect: () => ({
    connectors: [injectedStub, coinbaseStub, wcStub],
    connectAsync,
    status: 'idle' as const,
  }),
  useDisconnect: () => ({ disconnectAsync }),
  useSignMessage: () => ({ signMessageAsync, isPending: false }),
  useSwitchChain: () => ({ switchChainAsync }),
}))

import { useWallet } from '../app/hooks/useWallet'

beforeEach(() => {
  accountState = { address: undefined, chainId: undefined, isConnecting: false }
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useWallet', () => {
  it('reports disconnected state when no account', () => {
    const { result } = renderHook(() => useWallet())
    expect(result.current.address).toBeNull()
    expect(result.current.chainId).toBeNull()
    expect(result.current.connecting).toBe(false)
  })

  it('reports connected state when wagmi reports an account', () => {
    accountState = {
      address: '0x1234567890abcdef1234567890abcdef12345678',
      chainId: 1,
      isConnecting: false,
    }
    const { result } = renderHook(() => useWallet())
    expect(result.current.address).toBe('0x1234567890abcdef1234567890abcdef12345678')
    expect(result.current.chainId).toBe('evm:1')
  })

  it('connect() prefers walletConnect connector when available', async () => {
    const { result } = renderHook(() => useWallet())
    connectAsync.mockResolvedValueOnce(undefined)
    await act(async () => {
      await result.current.connect('evm:1')
    })
    expect(connectAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        connector: wcStub,
        chainId: 1,
      }),
    )
  })

  it('signMessage delegates to wagmi signMessageAsync', async () => {
    const { result } = renderHook(() => useWallet())
    const sig = await result.current.signMessage('hello')
    expect(sig).toBe('0xsignature')
    expect(signMessageAsync).toHaveBeenCalledWith({ message: 'hello' })
  })

  it('switchChain rejects non-EVM bridge ids', async () => {
    const { result } = renderHook(() => useWallet())
    await expect(result.current.switchChain('lux:96369')).rejects.toThrow(/not an EVM chain/)
  })

  it('switchChain delegates to wagmi switchChainAsync for EVM ids', async () => {
    const { result } = renderHook(() => useWallet())
    switchChainAsync.mockResolvedValueOnce(undefined)
    await act(async () => {
      await result.current.switchChain('evm:8453')
    })
    expect(switchChainAsync).toHaveBeenCalledWith({ chainId: 8453 })
  })

  it('disconnect delegates to wagmi disconnectAsync', async () => {
    const { result } = renderHook(() => useWallet())
    disconnectAsync.mockResolvedValueOnce(undefined)
    await act(async () => {
      await result.current.disconnect()
    })
    expect(disconnectAsync).toHaveBeenCalledOnce()
  })
})
