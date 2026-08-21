// Cross-asset corridors — the complement of swap-pairs.ts.
//
// Every row in swap-pairs is ONE underlying wearing many names: LBTC, WBTC,
// cbBTC and ZBTC are all a bitcoin, so bridging between them is a wrap and the
// amount is exact — 1:1, no feed. A corridor is the other thing. LUX and ETH
// are different underlyings; no quantity of LUX *is* ETH. So delivering ETH for
// LUX is a trade, and the amount out has to track the two market prices.
//
// The two live in separate tables on purpose. `convert` — the wrap math — reads
// only swap-pairs, so it can never reach a cross-asset pair and settle it 1:1;
// that mistake is what once paid 900,000 LUX for 1,000. A corridor is settled
// by `settle` in quote.ts, which prices it and refuses when a price is unknown.
//
// Read symmetrically (see isCorridor): one row states the relation once, and
// both directions follow. LUX<->ZOO and LUX<->ETH are the two flagship routes.
export default {
  LUX: ['ZOO', 'ETH'],
} satisfies Record<string, string[]>
