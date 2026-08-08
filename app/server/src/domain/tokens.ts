import axios from "axios"
import logger from "@/logger"

// Assets with no listing anywhere, priced by us.
const OWN_PRICES: Record<string, number> = {
  LUX: 0.0011,
  ZOO: 0.000021,
  LUSD: 1.0,
  ZUSD: 1.0,
}

/**
 * USD price of a token, or undefined when nobody quotes it.
 *
 * ⚠ THE RETURN TYPE IS THE POINT. This used to answer 1 on any failure, which
 * reads as "$1.00" and is indistinguishable from a genuine dollar-pegged
 * stablecoin. Coinbase does not list 9 of the 38 symbols this is asked for
 * (LUX, ZOO, cbBTC, SIXR, MRB, REDO, DOGS, AI16Z, XDAI), so that branch was not
 * a rare error path — it was a third of all lookups, quietly inventing a price.
 * Downstream that number was divided by, and the quotient was minted.
 *
 * Nothing computes a payout from this any more (see quote.ts: bridging is a
 * wrap, so no price is involved), but the distinction still has to hold: a
 * caller must be able to tell a price from the absence of one, and only
 * `undefined` says the second thing.
 */
export const getTokenPrice = async (token_id: string): Promise<number | undefined> => {
  const own = OWN_PRICES[token_id]
  if (own !== undefined) return own

  // L- and Z- prefixed assets are Lux/Zoo wrappers of an underlying that IS
  // listed, and they are worth exactly what they wrap.
  const underlying = /^[LZ]/.test(token_id) ? token_id.slice(1) : token_id
  const ownUnderlying = OWN_PRICES[underlying]
  if (ownUnderlying !== undefined) return ownUnderlying

  try {
    const { data: { data } } = await axios.get(
      `https://api.coinbase.com/v2/prices/${underlying}-USD/buy`,
      {
        headers: {
          "x-api-key": process.env.COINBASE_API_KEY,
          accept: "application/json",
        },
      }
    )
    const price = Number(data.amount)
    // A non-finite or non-positive price is a malformed answer, not a cheap
    // asset, and it must not be passed off as one.
    return Number.isFinite(price) && price > 0 ? price : undefined
  }
  catch {
    logger.warn(`[tokens] no price for ${token_id} (looked up ${underlying})`)
    return undefined
  }
}
