// luxwallet integration — the seam between bridge chains and the wallet
// stacks that connect them. Asserts that:
//
//   1. Every bridge family routes to the right wallet stack (wagmi vs
//      @luxwallet/connect), and the non-EVM families map to a real connector.
//   2. The static chain set is derived from @luxwallet/chains and covers all
//      SIX connectable ecosystems, so the chain selector and the connect flow
//      agree on exactly the bridge-supported set.

import { describe, expect, it } from 'vitest'

import {
  canLuxConnect,
  familyToLuxChain,
  isEvmFamily,
} from '../app/lib/wallet-family'
import { DEFAULT_CHAINS } from '../app/lib/chains'
import type { ChainFamily } from '../app/lib/chains'

describe('wallet-family routing', () => {
  it('routes EVM and Lux to wagmi, not @luxwallet/connect', () => {
    expect(isEvmFamily('evm')).toBe(true)
    expect(isEvmFamily('lux')).toBe(true)
    // EVM/Lux are wagmi's job — no luxwallet connector.
    expect(familyToLuxChain('evm')).toBeNull()
    expect(familyToLuxChain('lux')).toBeNull()
    expect(canLuxConnect('evm')).toBe(false)
    expect(canLuxConnect('lux')).toBe(false)
  })

  it('maps every non-EVM family to a @luxwallet/connect chain', () => {
    const expected: Record<string, string> = {
      svm: 'solana',
      btc: 'bitcoin',
      ton: 'ton',
      xrp: 'xrp',
      substrate: 'polkadot',
    }
    for (const [family, chain] of Object.entries(expected)) {
      expect(familyToLuxChain(family as ChainFamily)).toBe(chain)
      expect(canLuxConnect(family as ChainFamily)).toBe(true)
      expect(isEvmFamily(family as ChainFamily)).toBe(false)
    }
  })

  it('has no connector for cardano (honest gap — paste-address only)', () => {
    expect(familyToLuxChain('cardano')).toBeNull()
    expect(canLuxConnect('cardano')).toBe(false)
  })
})

describe('DEFAULT_CHAINS derived from @luxwallet/chains', () => {
  it('covers all six connectable ecosystems', () => {
    const families = new Set(DEFAULT_CHAINS.map((c) => c.family))
    // EVM (+ Lux), Solana, Bitcoin, TON, XRP, Polkadot — the full connect set.
    expect(families.has('evm')).toBe(true)
    expect(families.has('lux')).toBe(true)
    expect(families.has('svm')).toBe(true)
    expect(families.has('btc')).toBe(true)
    expect(families.has('ton')).toBe(true)
    expect(families.has('xrp')).toBe(true)
    expect(families.has('substrate')).toBe(true)
  })

  it('keeps the canonical bridge ids the backend + tests key on', () => {
    const ids = DEFAULT_CHAINS.map((c) => c.id)
    expect(ids).toContain('lux:96369')
    expect(ids).toContain('evm:1')
    expect(ids).toContain('svm:101')
    expect(ids).toContain('btc:mainnet')
    expect(ids).toContain('ton:mainnet')
    expect(ids).toContain('xrp:mainnet')
    expect(ids).toContain('polkadot:mainnet')
  })

  it('lists Lux first (featured home chain)', () => {
    expect(DEFAULT_CHAINS[0]?.family).toBe('lux')
  })

  it('every non-EVM chain in the selector has a working connector', () => {
    for (const chain of DEFAULT_CHAINS) {
      if (isEvmFamily(chain.family)) continue
      // The picker will offer a connect for this chain; assert it can.
      expect(canLuxConnect(chain.family)).toBe(true)
    }
  })

  it('carries the backend internal_name for every chain', () => {
    for (const chain of DEFAULT_CHAINS) {
      expect(chain.internalName.length).toBeGreaterThan(0)
    }
  })
})
