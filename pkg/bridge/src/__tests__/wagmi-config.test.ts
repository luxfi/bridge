// Copyright (C) 2019-2025, Lux Industries, Inc. All rights reserved.
// See the file LICENSE for licensing terms.

import { describe, expect, it } from 'vitest'

import {
  bridgeIdToWagmiChainId,
  buildWagmiConfig,
  wagmiChainIdToBridgeId,
} from '../app/lib/wagmi-config'
import type { BridgeConfig } from '../types'

const base: BridgeConfig = {
  apiHost: 'https://api.example.test',
  env: 'mainnet',
}

describe('bridgeIdToWagmiChainId', () => {
  it('parses evm: namespaced ids', () => {
    expect(bridgeIdToWagmiChainId('evm:1')).toBe(1)
    expect(bridgeIdToWagmiChainId('evm:8453')).toBe(8453)
  })
  it('returns null for non-evm ids', () => {
    expect(bridgeIdToWagmiChainId('lux:96369')).toBeNull()
    expect(bridgeIdToWagmiChainId('svm:101')).toBeNull()
    expect(bridgeIdToWagmiChainId('garbage')).toBeNull()
  })
})

describe('wagmiChainIdToBridgeId', () => {
  it('round-trips evm ids', () => {
    expect(wagmiChainIdToBridgeId(1)).toBe('evm:1')
    expect(wagmiChainIdToBridgeId(8453)).toBe('evm:8453')
    expect(bridgeIdToWagmiChainId(wagmiChainIdToBridgeId(42161))).toBe(42161)
  })
})

describe('buildWagmiConfig', () => {
  it('builds a wagmi Config with all default EVM chains', () => {
    const config = buildWagmiConfig(base)
    expect(config.chains.length).toBeGreaterThanOrEqual(5)
    const ids = config.chains.map((c) => c.id)
    expect(ids).toContain(1)
    expect(ids).toContain(8453)
  })

  it('narrows chains to supportedChainIds when provided', () => {
    const config = buildWagmiConfig({
      ...base,
      wallet: { supportedChainIds: [1, 8453] },
    })
    const ids = config.chains.map((c) => c.id)
    expect(ids).toEqual(expect.arrayContaining([1, 8453]))
    expect(ids).not.toContain(42161)
  })

  it('hoists defaultChainId to chains[0]', () => {
    const config = buildWagmiConfig({
      ...base,
      wallet: { defaultChainId: 8453 },
    })
    expect(config.chains[0]?.id).toBe(8453)
  })

  it('falls back to mainnet when supportedChainIds is empty', () => {
    const config = buildWagmiConfig({
      ...base,
      wallet: { supportedChainIds: [999999] },
    })
    expect(config.chains.length).toBe(1)
    expect(config.chains[0]?.id).toBe(1)
  })

  it('omits walletConnect connector when no projectId is supplied', () => {
    const config = buildWagmiConfig(base)
    const ids = config.connectors.map((c) => c.id)
    expect(ids).not.toContain('walletConnect')
    // injected + coinbase are always present
    expect(ids).toContain('injected')
  })

  it('includes walletConnect connector when projectId is supplied', () => {
    const config = buildWagmiConfig({
      ...base,
      wallet: { walletConnectProjectId: 'test-project-id' },
    })
    const ids = config.connectors.map((c) => c.id)
    expect(ids).toContain('walletConnect')
  })
})
