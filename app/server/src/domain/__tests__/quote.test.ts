import { describe, it, expect } from 'vitest'

import { convert, isSupportedPair, UnsupportedPair } from '@/domain/quote'
import swapPairs from '@/domain/settings/swap-pairs'

const pairs: Record<string, string[]> = swapPairs
const LUX = 'LUX_MAINNET'
const ZOO = 'ZOO_MAINNET'
const ETH = 'ETHEREUM_MAINNET'

// These are the numbers production actually returned, captured before the fix.
// Each one is what handlerUtilaPayoutAction would have minted, since on an exit
// payoutAmount is the stored quote's receive_amount.
describe('the mint the old formula produced', () => {
  const observed = [
    { from: ZOO, fromAsset: 'ZLUX', to: LUX, toAsset: 'LUX', was: 900_000 },
    { from: LUX, fromAsset: 'LZOO', to: ZOO, toAsset: 'ZOO', was: 47_142_857.14285714 },
    { from: LUX, fromAsset: 'LBTC', to: ZOO, toAsset: 'cbBTC', was: 64_267_132.05 },
    { from: LUX, fromAsset: 'LUX', to: ZOO, toAsset: 'ZLUX', was: 1.0890000000000002 },
  ]

  for (const { from, fromAsset, to, toAsset, was } of observed) {
    it(`${fromAsset} -> ${toAsset}: 1000 in yields 990, not ${was}`, () => {
      const { receiveAmount } = convert(from, fromAsset, to, toAsset, 1000)
      expect(receiveAmount).toBe(990)
      expect(receiveAmount).not.toBe(was)
    })
  }
})

describe('convert', () => {
  it('is exactly symmetric — the same pair converts alike in both directions', () => {
    // The old formula was a ratio of two prices, so swapping the legs inverted
    // it. Here the two directions are the same expression.
    const there = convert(LUX, 'LBTC', ZOO, 'ZBTC', 7.5).receiveAmount
    const back = convert(ZOO, 'ZBTC', LUX, 'LBTC', 7.5).receiveAmount
    expect(there).toBe(back)
  })

  it('charges 1% leaving Lux/Zoo and nothing entering', () => {
    expect(convert(LUX, 'LBTC', ETH, 'WBTC', 100)).toMatchObject({
      receiveAmount: 99, feeAmount: 1, feeRate: 0.01,
    })
    expect(convert(ETH, 'WBTC', LUX, 'LBTC', 100)).toMatchObject({
      receiveAmount: 100, feeAmount: 0, feeRate: 0,
    })
  })

  it('never depends on a price feed', async () => {
    // The property that retires the whole bug class: no lookup, so a delisting,
    // an outage or a renamed ticker cannot move the number. cbBTC, SIXR, MRB,
    // REDO, DOGS and AI16Z are all unpriced by the upstream feed.
    for (const asset of ['cbBTC', 'ZSIXR', 'ZMRB', 'ZREDO', 'ZDOGS', 'ZAI16Z']) {
      const src = pairs[asset]?.[0] ?? Object.entries(pairs).find(([, v]) => v.includes(asset))![0]
      expect(convert(LUX, src, ZOO, asset, 1000).receiveAmount).toBe(990)
    }
  })

  it('refuses a pair the bridge has no route for', () => {
    // Nothing can execute BTC -> ETH, so quoting it invents a trade the bridge
    // does not make. The old code answered with a price ratio.
    expect(() => convert(LUX, 'LBTC', ZOO, 'ZETH', 1)).toThrow(UnsupportedPair)
  })

  it('refuses a non-finite amount instead of propagating NaN', () => {
    expect(() => convert(LUX, 'LBTC', ZOO, 'ZBTC', NaN)).toThrow(RangeError)
    expect(() => convert(LUX, 'LBTC', ZOO, 'ZBTC', -1)).toThrow(RangeError)
  })

  it('is pure, so a caller can settle terms before taking any action', () => {
    // handleSwapCreation calls this BEFORE createMPCWalletForDeposit and
    // prisma.swap.create, both of which outlive the request — a minted custody
    // address and a swap row the payout path later reads. That ordering is only
    // safe while convert touches nothing: no clock, no network, no db. If it
    // ever needs any of those, the validation has to be split back out.
    const a = convert(LUX, 'LBTC', ZOO, 'ZBTC', 3)
    const b = convert(LUX, 'LBTC', ZOO, 'ZBTC', 3)
    expect(a).toEqual(b)
    expect(convert).toHaveLength(5)          // no callback, nothing injected
    expect(convert(LUX, 'LBTC', ZOO, 'ZBTC', 3)).not.toBeInstanceOf(Promise)
  })
})

describe('isSupportedPair', () => {
  it('reads the table symmetrically', () => {
    // 33 rows name a destination that does not name them back. BTC -> LBTC was
    // accepted and LBTC -> BTC refused, for the same route.
    expect(pairs['BTC']).toContain('LBTC')
    expect(pairs['LBTC']).not.toContain('BTC')
    expect(isSupportedPair('BTC', 'LBTC')).toBe(true)
    expect(isSupportedPair('LBTC', 'BTC')).toBe(true)
  })

  it('every route in the table is routable from either end', () => {
    for (const [from, tos] of Object.entries(pairs)) {
      for (const to of tos) {
        expect(isSupportedPair(from, to), `${from} -> ${to}`).toBe(true)
        expect(isSupportedPair(to, from), `${to} -> ${from}`).toBe(true)
      }
    }
  })

  it('survives an asset that has no row at all', () => {
    // LSIXR and ZSIXR are named as destinations but have no row of their own,
    // and indexing straight into the table for one yields undefined.
    expect(pairs['LSIXR']).toBeUndefined()
    expect(() => isSupportedPair('LSIXR', 'SIXR')).not.toThrow()
    expect(isSupportedPair('LSIXR', 'SIXR')).toBe(true)
    expect(isSupportedPair('LSIXR', 'NOTHING')).toBe(false)
  })
})

// The claim the whole fix rests on: a bridge pair is a wrap, never a trade —
// converting 1:1 is only right because every route in the table connects two
// names for one asset. If an edit ever joined two genuinely different assets,
// 1:1 would start giving away the difference.
//
// So the partition is PINNED, not derived. Deriving it would mean stripping an
// L/Z/W/cb prefix and comparing the remainder, and inferring an asset's identity
// from the spelling of its ticker is precisely the reasoning that produced the
// bug this file exists to prevent (it also reads LUX as a wrapped "UX"). These
// 33 groups were each checked by hand to be one underlying. A change here is a
// change to that claim, and it should be looked at by a person rather than
// re-justified by a regex.
const PEG_CLASSES = [
  'AI16Z LAI16Z ZAI16Z',
  'AVAX LAVAX ZAVAX',
  'BLAST LBLAST ZBLAST',
  'BNB LBNB ZBNB',
  'BOME LBOME ZBOME',
  'BONK LBONK ZBONK',
  'BTC LBTC WBTC ZBTC cbBTC',
  'CELO LCELO ZCELO',
  'DAI LUSD USDC USDT ZUSD',   // differently named, identically pegged to $1
  'DOGS LDOGS ZDOGS',
  'DOT LDOT ZDOT',
  'ETH LETH WETH ZETH',
  'FTM LFTM ZFTM',
  'FWOG LFWOG ZFWOG',
  'GIGA LGIGA ZGIGA',
  'LADA ZADA',
  'LMEW MEW ZMEW',
  'LMOODENG MOODENG ZMOODENG',
  'LMRB MRB ZMRB',
  'LNOT NOT ZNOT',
  'LPNUT PNUT ZPNUT',
  'LPOL POL ZPOL',
  'LPONKE PONKE ZPONKE',
  'LPOPCAT POPCAT ZPOPCAT',
  'LREDO REDO ZREDO',
  'LSIXR SIXR ZSIXR',
  'LSOL SOL ZSOL',
  'LTON TON ZTON',
  'LUX ZLUX',
  'LWIF WIF ZWIF',
  'LXDAI XDAI ZXDAI',
  'LXRP XRP ZXRP',
  'LZOO ZOO',
]

describe('the pair table only ever connects one underlying to itself', () => {
  it('partitions into exactly the reviewed peg classes', () => {
    const adj = new Map<string, Set<string>>()
    const link = (a: string, b: string) => {
      if (!adj.has(a)) adj.set(a, new Set())
      adj.get(a)!.add(b)
    }
    for (const [k, vs] of Object.entries(pairs)) for (const v of vs) { link(k, v); link(v, k) }

    const seen = new Set<string>()
    const found: string[] = []
    for (const start of adj.keys()) {
      if (seen.has(start)) continue
      const stack = [start]; const comp: string[] = []; seen.add(start)
      while (stack.length) {
        const x = stack.pop()!
        comp.push(x)
        for (const y of adj.get(x) ?? []) if (!seen.has(y)) { seen.add(y); stack.push(y) }
      }
      found.push(comp.sort().join(' '))
    }
    expect(found.sort()).toEqual([...PEG_CLASSES].sort())
  })

  it('converts 1:1 within every peg class', () => {
    for (const cls of PEG_CLASSES) {
      const members = cls.split(' ')
      for (const a of members) for (const b of members) {
        if (a === b || !isSupportedPair(a, b)) continue
        // entering Lux/Zoo is free, so the wrap is exactly 1:1 there
        expect(convert(ETH, a, LUX, b, 1000).receiveAmount, `${a} -> ${b}`).toBe(1000)
      }
    }
  })
})
