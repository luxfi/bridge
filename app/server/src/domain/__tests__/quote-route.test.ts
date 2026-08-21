import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import express from 'express'
import type { Server } from 'http'

import quoteRouter from '@/routes/quote'

// The only outbound call left on this path is the display-only fee price, and
// it is stubbed to fail — both so the suite does not reach the public internet,
// and because "the price lookup failed" is precisely the state being asserted.
// It is also the honest default: the upstream feed does not list 9 of the 38
// symbols the bridge asks about, so failure is the common case, not the edge.
vi.mock('axios', () => ({
  default: { get: vi.fn().mockRejectedValue(new Error('no network in tests')) },
}))

// The unit tests cover `convert`; this covers the thing a client actually
// touches — the wire. It mounts the real router on a real server and speaks
// HTTP to it, because the defect being guarded is not just an arithmetic one:
// the endpoint used to answer 200 with a confident number for input it could
// not honour, and a status code is part of that answer.
//
// No database and no network: the quote path stopped consulting either, and the
// destination assets here price from the built-in table.
let server: Server
let base: string

beforeAll(async () => {
  const app = express()
  app.use('/api/quote', quoteRouter)
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve)
  })
  const addr = server.address()
  if (!addr || typeof addr === 'string') throw new Error('no port')
  base = `http://127.0.0.1:${addr.port}/api/quote`
})

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

const quote = async (from: string, fromAsset: string, to: string, toAsset: string, amount: string) => {
  const qs = new URLSearchParams({
    source_network: from,
    source_token: fromAsset,
    destination_network: to,
    destination_token: toAsset,
    amount,
    refuel: 'false',
    use_deposit_address: 'false',
  })
  const res = await fetch(`${base}?${qs}`)
  return { status: res.status, body: await res.json() as any }
}

describe('GET /api/quote', () => {
  it('quotes 990 for 1000 out of Lux, where production returned 900,000', async () => {
    const { status, body } = await quote('ZOO_MAINNET', 'ZLUX', 'LUX_MAINNET', 'LUX', '1000')
    expect(status).toBe(200)
    expect(body.data.quote.receive_amount).toBe(990)
  })

  it('quotes the reverse direction identically', async () => {
    // Same route, legs swapped. The old ratio inverted here: 1.089 one way,
    // 900,000 the other.
    const there = await quote('ZOO_MAINNET', 'ZLUX', 'LUX_MAINNET', 'LUX', '1000')
    const back = await quote('LUX_MAINNET', 'LUX', 'ZOO_MAINNET', 'ZLUX', '1000')
    expect(back.body.data.quote.receive_amount).toBe(there.body.data.quote.receive_amount)
  })

  it('guarantees the amount it quotes — no slippage band on a wrap', async () => {
    const { body } = await quote('ZOO_MAINNET', 'ZLUX', 'LUX_MAINNET', 'LUX', '1000')
    expect(body.data.quote.min_receive_amount).toBe(body.data.quote.receive_amount)
    expect(body.data.quote.slippage).toBe(0)
  })

  it('refuses an unroutable pair with 400 instead of inventing a trade', async () => {
    const { status, body } = await quote('LUX_MAINNET', 'LBTC', 'ZOO_MAINNET', 'ZETH', '1')
    expect(status).toBe(400)
    expect(body.error).toMatch(/no bridge route/)
  })

  it('refuses a missing or nonsense amount with 400, not NaN with 200', async () => {
    // `Number(undefined)` is NaN, which used to flow all the way into the
    // stored quote and only surface much later at parseUnits, where it reads as
    // a chain problem.
    const res = await fetch(`${base}?source_network=LUX_MAINNET&source_token=LBTC` +
      `&destination_network=ZOO_MAINNET&destination_token=ZBTC`)
    expect(res.status).toBe(400)
  })

  it('reports an unknown fee price as null rather than as $1.00', async () => {
    // cbBTC is unpriced upstream. The old code answered 1, which is a number a
    // caller cannot tell from a real dollar.
    const { status, body } = await quote('LUX_MAINNET', 'LBTC', 'ZOO_MAINNET', 'cbBTC', '1000')
    expect(status).toBe(200)
    expect(body.data.quote.receive_amount).toBe(990)
    expect(body.data.quote.total_fee_in_usd).toBeNull()
  })

  it('resolves the LUX<->ZOO corridor as a priced trade, not "no bridge route"', async () => {
    // LUX and ZOO both price from the built-in table, so this settles with no
    // network. 1000 LUX / (0.000021 / 0.0011) − 1% = 51857.14 ZOO — a trade, not
    // the 990 a wrap would pay. The minimum sits a 2.5% band under.
    const { status, body } = await quote('LUX_MAINNET', 'LUX', 'ZOO_MAINNET', 'ZOO', '1000')
    expect(status).toBe(200)
    expect(body.data.quote.receive_amount).toBeCloseTo(51857.142857, 3)
    expect(body.data.quote.slippage).toBe(0.025)
    expect(body.data.quote.min_receive_amount).toBeCloseTo(51857.142857 * 0.975, 3)
  })

  it('refuses the LUX<->ETH corridor with 503 when the ETH feed is unreachable', async () => {
    // The route exists — so this is not the 400 an unroutable pair gets. ETH is
    // priced from the upstream feed, which is stubbed to fail here, so the
    // corridor refuses with price_unknown rather than inventing a rate.
    const { status, body } = await quote('LUX_MAINNET', 'LUX', 'ETHEREUM_MAINNET', 'ETH', '1000')
    expect(status).toBe(503)
    expect(body.error).toMatch(/price_unknown/)
  })
})
