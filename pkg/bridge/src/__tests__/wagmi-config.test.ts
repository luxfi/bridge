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
  it('parses lux: namespaced ids (Lux chains are EVM at the wallet leg)', () => {
    expect(bridgeIdToWagmiChainId('lux:96369')).toBe(96369)
    expect(bridgeIdToWagmiChainId('lux:96368')).toBe(96368)
  })
  it('returns null for non-evm ids', () => {
    expect(bridgeIdToWagmiChainId('svm:101')).toBeNull()
    expect(bridgeIdToWagmiChainId('btc:mainnet')).toBeNull()
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

  it('exposes the testnet EVM set when env=testnet', () => {
    const config = buildWagmiConfig({ ...base, env: 'testnet' })
    const ids = config.chains.map((c) => c.id)
    // Sepolia, Base Sepolia, Holesky must all be present; mainnet chains must not.
    expect(ids).toEqual(expect.arrayContaining([11155111, 84532, 17000]))
    expect(ids).not.toContain(1)
    expect(ids).not.toContain(8453)
  })

  it('treats env=devnet the same as env=testnet for chain set selection', () => {
    const config = buildWagmiConfig({ ...base, env: 'devnet' })
    const ids = config.chains.map((c) => c.id)
    expect(ids).toContain(11155111)
    expect(ids).not.toContain(1)
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

  // Holesky's viem default RPC returns HTTP 403; we override to drpc.org
  // so useBalance() doesn't stall on `…` forever. Assert the override
  // is wired (the config exposes Holesky as a chain).
  it('includes Holesky in the testnet chain set', () => {
    const config = buildWagmiConfig({ ...base, env: 'testnet' })
    expect(config.chains.map((c) => c.id)).toContain(17000)
  })
})
