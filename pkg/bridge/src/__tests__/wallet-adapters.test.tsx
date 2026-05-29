// wallet-adapters.test.tsx — focused tests on the family dispatcher and
// the noop fallback. The concrete adapter hooks (wagmi/solana/ton/btc)
// are tested in their own ecosystems; here we lock in:
//
//   1. familyForBridgeId mapping (every prefix routes to the right family)
//   2. useWalletForFamily returns the right shape for unsupported families
//   3. NonEVMProviders renders without throwing (smoke test for the
//      provider tree; the underlying SDK providers each take ~hundreds
//      of ms to initialise so a smoke is what we can afford in CI)

import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createConfig, http, WagmiProvider } from 'wagmi'
import { mainnet } from 'viem/chains'
import type { FC, ReactNode } from 'react'

import {
  NonEVMProviders,
  useWalletForFamily,
  useWalletForBridgeId,
} from '../app/lib/wallet-adapters'

// A minimal wagmi config so the EVM branch's useAccount() hooks can
// resolve (they'd throw without a WagmiProvider in the tree).
const wagmiCfg = createConfig({
  chains: [mainnet],
  transports: { [mainnet.id]: http() },
})

function makeWrapper(): FC<{ children: ReactNode }> {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }) => (
    <WagmiProvider config={wagmiCfg}>
      <QueryClientProvider client={qc}>
        <NonEVMProviders>{children}</NonEVMProviders>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

describe('useWalletForFamily', () => {
  it('returns a not-connected shape for xrp (no adapter yet)', () => {
    const { result } = renderHook(() => useWalletForFamily('xrp'), {
      wrapper: makeWrapper(),
    })
    expect(result.current.family).toBe('xrp')
    expect(result.current.connected).toBe(false)
    expect(result.current.balance).toBe(null)
    expect(result.current.availableWallets).toEqual([])
  })

  it('returns a not-connected shape for cardano (no adapter yet)', () => {
    const { result } = renderHook(() => useWalletForFamily('cardano'), {
      wrapper: makeWrapper(),
    })
    expect(result.current.family).toBe('cardano')
    expect(result.current.connected).toBe(false)
  })

  it('xrp adapter rejects connect() with a clear error', async () => {
    const { result } = renderHook(() => useWalletForFamily('xrp'), {
      wrapper: makeWrapper(),
    })
    await expect(result.current.connect()).rejects.toThrow(/No wallet adapter for xrp/)
  })

  it('routes svm to the Solana adapter (initial state)', () => {
    const { result } = renderHook(() => useWalletForFamily('svm'), {
      wrapper: makeWrapper(),
    })
    expect(result.current.family).toBe('svm')
    expect(result.current.connected).toBe(false)
    expect(result.current.balanceSymbol).toBe('SOL')
    // Phantom + Solflare are configured by default — both should
    // surface in availableWallets even before a connect attempt.
    expect(result.current.availableWallets.length).toBeGreaterThanOrEqual(1)
  })

  it('routes ton to the TonConnect adapter (initial state)', () => {
    const { result } = renderHook(() => useWalletForFamily('ton'), {
      wrapper: makeWrapper(),
    })
    expect(result.current.family).toBe('ton')
    expect(result.current.connected).toBe(false)
    expect(result.current.balanceSymbol).toBe('TON')
  })

  it('routes btc to the sats-connect adapter (initial state)', () => {
    const { result } = renderHook(() => useWalletForFamily('btc'), {
      wrapper: makeWrapper(),
    })
    expect(result.current.family).toBe('btc')
    expect(result.current.connected).toBe(false)
    expect(result.current.balanceSymbol).toBe('BTC')
  })

  it('routes evm to the wagmi adapter', () => {
    const { result } = renderHook(() => useWalletForFamily('evm', { chainId: 1, symbol: 'ETH' }), {
      wrapper: makeWrapper(),
    })
    expect(result.current.family).toBe('evm')
    expect(result.current.connected).toBe(false)
    expect(result.current.balanceSymbol).toBe('ETH')
    // availableWallets reflects whatever connectors the wagmi Config
    // was built with — empty in this test rig because we passed no
    // connectors. The real BridgeApp wires injected/coinbase/walletConnect.
    expect(Array.isArray(result.current.availableWallets)).toBe(true)
  })
})

describe('useWalletForBridgeId', () => {
  it('routes lux:96369 to the EVM adapter', () => {
    const { result } = renderHook(() => useWalletForBridgeId('lux:96369', 'LUX'), {
      wrapper: makeWrapper(),
    })
    expect(result.current.family).toBe('lux')
  })

  it('routes svm:101 to the Solana adapter', () => {
    const { result } = renderHook(() => useWalletForBridgeId('svm:101', 'SOL'), {
      wrapper: makeWrapper(),
    })
    expect(result.current.family).toBe('svm')
    expect(result.current.balanceSymbol).toBe('SOL')
  })

  it('routes btc:mainnet to the Bitcoin adapter', () => {
    const { result } = renderHook(() => useWalletForBridgeId('btc:mainnet', 'BTC'), {
      wrapper: makeWrapper(),
    })
    expect(result.current.family).toBe('btc')
    expect(result.current.balanceSymbol).toBe('BTC')
  })

  it('routes ton:mainnet to the TonConnect adapter', () => {
    const { result } = renderHook(() => useWalletForBridgeId('ton:mainnet', 'TON'), {
      wrapper: makeWrapper(),
    })
    expect(result.current.family).toBe('ton')
    expect(result.current.balanceSymbol).toBe('TON')
  })

  it('routes unknown prefixes to EVM as a default', () => {
    const { result } = renderHook(() => useWalletForBridgeId('mystery:1'), {
      wrapper: makeWrapper(),
    })
    expect(result.current.family).toBe('evm')
  })
})

describe('NonEVMProviders', () => {
  it('renders children without throwing (provider tree mounts)', () => {
    // Smoke test — the three providers (Connection, Solana Wallet,
    // TonConnect UI) each have init overhead; we only assert they
    // don't blow up at mount, not that they reach any specific state.
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { getByText } = render(
      <WagmiProvider config={wagmiCfg}>
        <QueryClientProvider client={qc}>
          <NonEVMProviders>
            <div>mounted</div>
          </NonEVMProviders>
        </QueryClientProvider>
      </WagmiProvider>,
    )
    expect(getByText('mounted')).toBeTruthy()
  })
})
