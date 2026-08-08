import { getTokenPrice } from "@/domain/tokens"
import swapPairs from "@/domain/settings/swap-pairs"

// 0% fee bridging IN from external chains
// 1% fee on every transfer FROM Lux/Zoo (to each other, or out to external)
const BRIDGE_FEE_RATE = 0.01
const LUX_ZOO_NETWORKS = ['LUX_MAINNET', 'LUX_TESTNET', 'LUX_DEVNET', 'ZOO_MAINNET', 'ZOO_TESTNET', 'ZOO_DEVNET']

function isExitFromLux(fromNetwork: string, _toNetwork: string): boolean {
  return LUX_ZOO_NETWORKS.includes(fromNetwork)
}

const pairs: Record<string, string[]> = swapPairs

/** A pair the bridge has no route for. The caller must refuse, not improvise. */
export class UnsupportedPair extends Error {
  constructor(readonly fromAsset: string, readonly toAsset: string) {
    super(`no bridge route between ${fromAsset} and ${toAsset}`)
    this.name = 'UnsupportedPair'
  }
}

// A bridge pair is SYMMETRIC, and it is read that way rather than written twice.
// 33 of the table's rows name a destination that does not name them back (BTC
// lists LBTC; LBTC lists WBTC, ZBTC, cbBTC but not BTC), so a one-directional
// read accepts a route inbound and refuses the identical route outbound.
export const isSupportedPair = (fromAsset: string, toAsset: string): boolean => (
  (pairs[fromAsset]?.includes(toAsset) ?? false) ||
  (pairs[toAsset]?.includes(fromAsset) ?? false)
)

// THE conversion. Every quote, rate and stored swap projects from this one
// function, because they must agree: on an exit, handlerUtilaPayoutAction mints
// `quotes.receive_amount` — the number computed here IS the number minted.
//
// A BRIDGE PAIR IS A WRAP, NEVER A TRADE. Take the connected components of the
// pair table and all 33 of them are one underlying wearing three names —
// {BTC, LBTC, WBTC, ZBTC, cbBTC}, {ETH, LETH, WETH, ZETH}, {LUX, ZLUX}, and so
// on. There is no edge in the table between two different assets. So the
// conversion rate is 1, exactly, in both directions, and the only thing that
// comes off the top is the fee.
//
// It used to be `amount * sourcePrice / destinationPrice`, priced per request
// off Coinbase. That is a trade's formula, and applying it to a wrap made the
// output depend on whether a third party happened to know both tickers. Coinbase
// prices 29 of the 38 symbols the bridge asks about; the other 9 threw, and
// getTokenPrice answered $1.00 for them. So one leg of a pair got a real market
// price and the other got a dollar, and the ratio of those two numbers became a
// mint:
//
//     1000 ZLUX  ->        900,000 LUX    (LUX $0.0011 real, ZLUX $1.00 invented)
//     1000 LZOO  ->     47,142,857 ZOO
//     1000 LBTC  ->     64,267,132 cbBTC
//     1000 LUX   ->          1.089 ZLUX   (the same error inverted)
//
// all measured against production. Every one of those should be 990. The two
// directions disagreeing was not a separate bug from the size of the number; it
// was the same bug seen from each end, because a ratio built from one real price
// and one invented one inverts when you swap the legs.
//
// Pricing cannot be repaired by finding a better price feed, either: there is no
// price at which wrapping is not 1:1, so consulting a feed at all is what was
// wrong. Removing the division removes the whole class — a feed outage, a
// delisting, a renamed ticker and a rate-limit now change nothing here, because
// nothing here asks.
export const convert = (
  fromNetwork: string,
  fromAsset: string,
  toNetwork: string,
  toAsset: string,
  amount: number,
) => {
  if (!isSupportedPair(fromAsset, toAsset)) {
    throw new UnsupportedPair(fromAsset, toAsset)
  }
  // NaN propagates through arithmetic silently and reaches parseUnits as a
  // throw much later, where it reads as a chain problem. Reject it here.
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError(`amount must be a non-negative finite number, got ${amount}`)
  }

  const feeRate = isExitFromLux(fromNetwork, toNetwork) ? BRIDGE_FEE_RATE : 0
  const feeAmount = amount * feeRate

  return {
    receiveAmount: amount - feeAmount,
    feeAmount,
    feeRate,
  }
}

// The USD value of the fee is DISPLAY, and it is the only thing here that needs
// a price. When the price is unknown it is reported as unknown: a null renders
// as nothing, while the $1.00 that used to stand in for "lookup failed" renders
// as a fact. Nothing downstream computes from this.
export const feeInUsd = async (asset: string, feeAmount: number): Promise<number | null> => {
  const price = await getTokenPrice(asset)
  return price === undefined ? null : feeAmount * price
}

export const getQuote = async (
  fromNetwork: string,
  fromAsset: string,
  toNetwork: string,
  toAsset: string,
  amount: number,
  refuel: number,
  useDepositAddress: string
) => {

  const { receiveAmount, feeAmount, feeRate } = convert(fromNetwork, fromAsset, toNetwork, toAsset, amount)

  return ({
    quote: {
      receive_amount: receiveAmount,
      // A wrap is exact, so the guaranteed minimum IS the quote. The 2.5% band
      // this used to advertise described a market that is not being crossed,
      // and it asked the user to consent to 2.5% less than the bridge can ever
      // pay. Settlement compares against the same number this returns.
      min_receive_amount: receiveAmount,
      blockchain_fee: 0,
      service_fee: feeRate,
      avg_completion_time: "00:03:00",
      refuel_in_source: null,
      slippage: 0,
      total_fee: feeAmount,
      total_fee_in_usd: await feeInUsd(toAsset, feeAmount),
    },
    refuel: null,
    reward: {}
  })
}

export { isExitFromLux, BRIDGE_FEE_RATE }
