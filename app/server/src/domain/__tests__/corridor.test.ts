import { describe, it, expect, vi } from 'vitest'

// A corridor is the one route whose settlement reads a price. Pin the feed to
// fixed values so the trade math is deterministic and the suite never reaches
// the network — what is under test is the arithmetic and the refusal, not the
// upstream. LUX and ZOO are the real self-priced pair; ETH stands in for a
// feed-listed asset.
vi.mock('@/domain/tokens', () => ({
  getTokenPrice: vi.fn(async (t: string) =>
    ({ LUX: 0.0011, ZOO: 0.000021, ETH: 3500 } as Record<string, number>)[t]),
}))

import {
  settle,
  isCorridor,
  isRoutable,
  isSupportedPair,
  UnknownPrice,
  UnsupportedPair,
} from '@/domain/quote'
import { getTokenPrice } from '@/domain/tokens'

const LUX = 'LUX_MAINNET'
const ZOO = 'ZOO_MAINNET'
const ETH = 'ETHEREUM_MAINNET'

describe('cross-asset corridors', () => {
  it('routes LUX<->ZOO and LUX<->ETH, from either end', () => {
    for (const [a, b] of [['LUX', 'ZOO'], ['LUX', 'ETH']]) {
      expect(isCorridor(a, b)).toBe(true)
      expect(isCorridor(b, a)).toBe(true)
      expect(isRoutable(a, b)).toBe(true)
      expect(isRoutable(b, a)).toBe(true)
    }
  })

  it('keeps corridors out of the wrap table, so convert can never settle one 1:1', () => {
    // isSupportedPair is the wrap table. A corridor absent from it is the thing
    // that makes the mint structurally unreachable: convert only reads wraps.
    expect(isSupportedPair('LUX', 'ZOO')).toBe(false)
    expect(isSupportedPair('LUX', 'ETH')).toBe(false)
  })

  it('prices LUX->ZOO at the ratio of the two feeds, minus the 1% exit', async () => {
    // 1000 LUX @ $0.0011 = $1.10; / $0.000021 per ZOO = 52380.95 ZOO gross; the
    // 1% exit fee leaves 51857.14. NOT 990 — a 1:1 wrap would have paid 990.
    const { receiveAmount, feeRate, slippage } = await settle(LUX, 'LUX', ZOO, 'ZOO', 1000)
    expect(receiveAmount).toBeCloseTo(51857.142857, 4)
    expect(receiveAmount).not.toBe(990)
    expect(feeRate).toBe(0.01)
    expect(slippage).toBe(0.025)
  })

  it('inverts exactly when the legs swap', async () => {
    // 1000 ZOO @ $0.000021 / $0.0011 per LUX = 19.0909 LUX gross; 1% → 18.9.
    const { receiveAmount } = await settle(ZOO, 'ZOO', LUX, 'LUX', 1000)
    expect(receiveAmount).toBeCloseTo(18.9, 6)
  })

  it('prices LUX->ETH from the ETH feed', async () => {
    const { receiveAmount } = await settle(LUX, 'LUX', ETH, 'ETH', 1000)
    expect(receiveAmount).toBeCloseTo((1000 * 0.0011 / 3500) * 0.99, 12)
  })

  it('charges nothing entering Lux/Zoo', async () => {
    // ETH->LUX is an entry, not an exit: no fee. 1 ETH @ $3500 / $0.0011 per LUX.
    const { receiveAmount, feeRate } = await settle(ETH, 'ETH', LUX, 'LUX', 1)
    expect(feeRate).toBe(0)
    expect(receiveAmount).toBeCloseTo(3500 / 0.0011, 2)
  })

  it('refuses a corridor it cannot price instead of inventing a rate', async () => {
    // The mint was a ratio built from one invented price. With a leg unpriced the
    // corridor refuses — it never stands a number in. The route still exists, so
    // this is UnknownPrice (retryable), not UnsupportedPair.
    vi.mocked(getTokenPrice).mockResolvedValueOnce(undefined) // source leg unpriced
    await expect(settle(LUX, 'LUX', ZOO, 'ZOO', 1000)).rejects.toBeInstanceOf(UnknownPrice)
  })

  it('refuses a non-finite amount before consulting any feed', async () => {
    await expect(settle(LUX, 'LUX', ZOO, 'ZOO', NaN)).rejects.toBeInstanceOf(RangeError)
  })

  it('still refuses a pair that is neither wrap nor corridor', async () => {
    // BTC -> ETH is executable by nobody; naming it does not make a route.
    await expect(settle(LUX, 'LBTC', ZOO, 'ZETH', 1)).rejects.toBeInstanceOf(UnsupportedPair)
  })

  it('leaves wraps exact — settle hands them to convert, 1:1, no band', async () => {
    const { receiveAmount, slippage } = await settle(ZOO, 'ZLUX', LUX, 'LUX', 1000)
    expect(receiveAmount).toBe(990)
    expect(slippage).toBe(0)
  })
})
