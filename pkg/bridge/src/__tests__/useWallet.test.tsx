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

// Mutable so individual tests can simulate EIP-6963 MIPD adding extra
// connectors at runtime. Reset in beforeEach.
let connectorList: Array<{ id: string; name: string; type?: string }> = [
  injectedStub,
  coinbaseStub,
  wcStub,
]

vi.mock('wagmi', () => ({
  useAccount: () => accountState,
  useConnect: () => ({
    connectors: connectorList,
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
  connectorList = [injectedStub, coinbaseStub, wcStub]
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

  it('connect() prefers injected (browser extension) by default', async () => {
    // Preference order: injected → metaMask → coinbaseWalletSDK →
    // walletConnect → first available. Desktop users with MetaMask get the
    // extension popup; mobile/no-extension users get WC via the picker UI
    // (connectWith), not this legacy entry.
    const { result } = renderHook(() => useWallet())
    connectAsync.mockResolvedValueOnce(undefined)
    await act(async () => {
      await result.current.connect('evm:1')
    })
    expect(connectAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        connector: injectedStub,
        chainId: 1,
      }),
    )
  })

  it('exposes a picker-friendly connectors[] with polished names + icons', () => {
    const { result } = renderHook(() => useWallet())
    const ids = result.current.connectors.map((c) => c.id)
    expect(ids).toEqual(['injected', 'coinbaseWalletSDK', 'walletConnect'])
    const names = result.current.connectors.map((c) => c.name)
    expect(names).toContain('Browser Wallet')   // injected polished
    expect(names).toContain('Coinbase Wallet')  // coinbaseWalletSDK polished
    expect(names).toContain('WalletConnect')
    // Every connector gets at least a fallback icon
    expect(result.current.connectors.every((c) => c.icon.length > 0)).toBe(true)
    // Every connector has an `installed` flag — true only when the wallet
    // is locally present. In jsdom (no window.ethereum, no EIP-6963) every
    // connector is remote.
    expect(
      result.current.connectors.every((c) => typeof c.installed === 'boolean'),
    ).toBe(true)
    expect(result.current.connectors.find((c) => c.id === 'injected')?.installed).toBe(false)
    expect(result.current.connectors.find((c) => c.id === 'walletConnect')?.installed).toBe(false)
  })

  it('marks the legacy injected connector as installed when window.ethereum exists', () => {
    const originalEthereum = (globalThis.window as { ethereum?: unknown } | undefined)?.ethereum
    if (typeof globalThis.window !== 'undefined') {
      ;(globalThis.window as { ethereum?: unknown }).ethereum = { isMetaMask: true }
    }
    try {
      const { result } = renderHook(() => useWallet())
      const injected = result.current.connectors.find((c) => c.id === 'injected')
      expect(injected?.installed).toBe(true)
    } finally {
      if (typeof globalThis.window !== 'undefined') {
        ;(globalThis.window as { ethereum?: unknown }).ethereum = originalEthereum
      }
    }
  })

  it('hides the legacy injected connector when an EIP-6963 connector announced itself', () => {
    // MIPD adds a dotted-RDNS connector alongside the legacy `injected`
    // one — picker should drop the legacy duplicate and keep the named one.
    connectorList = [
      injectedStub,
      { id: 'io.metamask', name: 'MetaMask', type: 'injected' },
      coinbaseStub,
      wcStub,
    ]
    const { result } = renderHook(() => useWallet())
    const ids = result.current.connectors.map((c) => c.id)
    expect(ids).not.toContain('injected')
    expect(ids).toContain('io.metamask')
    const mm = result.current.connectors.find((c) => c.id === 'io.metamask')
    expect(mm?.installed).toBe(true)
    expect(mm?.name).toBe('MetaMask')
  })

  it('hides the Coinbase Wallet SDK connector when the Coinbase EIP-6963 extension is present', () => {
    connectorList = [
      injectedStub,
      { id: 'com.coinbase.wallet', name: 'Coinbase Wallet', type: 'injected' },
      coinbaseStub,
      wcStub,
    ]
    const { result } = renderHook(() => useWallet())
    const ids = result.current.connectors.map((c) => c.id)
    // injected is also dropped because an EIP-6963 connector is present;
    // coinbaseWalletSDK is dropped because the Coinbase extension covers it.
    expect(ids).not.toContain('coinbaseWalletSDK')
    expect(ids).toContain('com.coinbase.wallet')
  })


  it('connectWith() routes to the chosen connector', async () => {
    const { result } = renderHook(() => useWallet())
    connectAsync.mockResolvedValueOnce(undefined)
    await act(async () => {
      await result.current.connectWith('coinbaseWalletSDK', 'evm:8453')
    })
    expect(connectAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        connector: coinbaseStub,
        chainId: 8453,
      }),
    )
  })

  it('connectWith() throws when the id is not registered', async () => {
    const { result } = renderHook(() => useWallet())
    await expect(
      result.current.connectWith('does-not-exist'),
    ).rejects.toThrow(/not registered/)
  })

  it('signMessage delegates to wagmi signMessageAsync', async () => {
    const { result } = renderHook(() => useWallet())
    const sig = await result.current.signMessage('hello')
    expect(sig).toBe('0xsignature')
    expect(signMessageAsync).toHaveBeenCalledWith({ message: 'hello' })
  })

  it('switchChain rejects non-EVM bridge ids', async () => {
    const { result } = renderHook(() => useWallet())
    // svm/btc/ton are genuinely non-EVM. lux: IS EVM at the wallet
    // leg (see architecture_lux_family_evm_dual memory) so it must
    // NOT reject — that case is covered in the next test.
    await expect(result.current.switchChain('svm:101')).rejects.toThrow(/not an EVM chain/)
    await expect(result.current.switchChain('btc:mainnet')).rejects.toThrow(/not an EVM chain/)
    await expect(result.current.switchChain('ton:mainnet')).rejects.toThrow(/not an EVM chain/)
  })

  it('switchChain accepts lux: bridge ids (Lux is EVM at the wallet leg)', async () => {
    const { result } = renderHook(() => useWallet())
    switchChainAsync.mockResolvedValueOnce(undefined)
    await act(async () => {
      await result.current.switchChain('lux:96369')
    })
    expect(switchChainAsync).toHaveBeenCalledWith({ chainId: 96369 })
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
