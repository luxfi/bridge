// Chain + asset logos as inline SVG data URLs.
//
// Centralized so chains.ts / assets.ts don't grow long literals, and so a
// future "fetch from the bridge backend" registry can replace this file
// without touching every selector. SVG is preferred over PNG: data URL
// stays under 1 kB per logo, scales crisp on retina, and the SDK ships
// zero network dependencies for brand marks.
//
// Naming convention: LOGOS[symbol] for fungible assets (LUX, ETH, USDC),
// CHAIN_LOGOS[chain.id] for chain marks (`lux:96369`, `evm:1`). Where the
// chain native token equals the chain's brand mark (ETH on Ethereum,
// LUX on Lux) the two reference the same data URL.

/** Encode an SVG string as a data URL. */
const svg = (body: string): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(body)}`

const ETH_SVG = svg(
  '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#627eea"/><path d="M16.5 4v8.87l7.5 3.35z" fill="#fff" fill-opacity=".6"/><path d="M16.5 4L9 16.22l7.5-3.35z" fill="#fff"/><path d="M16.5 21.97v6.03L24 17.62z" fill="#fff" fill-opacity=".6"/><path d="M16.5 28v-6.03L9 17.62z" fill="#fff"/><path d="M16.5 20.57l7.5-4.35-7.5-3.35z" fill="#fff" fill-opacity=".2"/><path d="M9 16.22l7.5 4.35v-7.7z" fill="#fff" fill-opacity=".6"/></svg>',
)

const LUX_SVG = svg(
  '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#000"/><path d="M16 23 L9 11 L23 11 Z" fill="#fff"/></svg>',
)

const ARB_SVG = svg(
  '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#28a0f0"/><path d="M14.7 8.5 L20.4 22.5 L18.4 22.5 L13.2 10.8 Z" fill="#fff"/><path d="M16.5 14 L22 22.5 L19.6 22.5 L15.3 16.7 Z" fill="#fff"/><circle cx="11.2" cy="22" r="1.4" fill="#fff"/></svg>',
)

const BASE_SVG = svg(
  '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#0052ff"/><path d="M16 26a10 10 0 1 0 0-20v20zM6 16h10V6a10 10 0 0 0 0 20z" fill="#fff"/></svg>',
)

const POL_SVG = svg(
  '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#8247e5"/><path d="M20.5 13 L20.5 18 L16 20.5 L11.5 18 L11.5 13 L16 10.5 Z M16 13 L13.5 14.5 L13.5 17 L16 18.5 L18.5 17 L18.5 14.5 L16 13 Z" fill="#fff" fill-rule="evenodd"/></svg>',
)

const OP_SVG = svg(
  '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#ff0420"/><text x="16" y="21" font-family="Arial Black, sans-serif" font-weight="900" font-size="12" fill="#fff" text-anchor="middle">OP</text></svg>',
)

const SOL_SVG = svg(
  '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="sg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#9945ff"/><stop offset=".5" stop-color="#00d2ff"/><stop offset="1" stop-color="#14f195"/></linearGradient></defs><circle cx="16" cy="16" r="16" fill="#0a0a0a"/><path d="M10 12 H20 L22 10 H12 Z M10 17 H20 L22 19 H12 Z M10 22 H20 L22 24 H12 Z" fill="url(#sg)"/></svg>',
)

const USDC_SVG = svg(
  '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#2775ca"/><path d="M16 6a10 10 0 1 0 0 20A10 10 0 0 0 16 6zm.9 15.3v1.7h-1.6v-1.6c-1.6-.2-2.7-1-3-2.3l1.6-.3c.2.7.7 1.2 1.7 1.2.9 0 1.4-.3 1.4-1 0-.5-.4-.8-1.5-1l-.6-.1c-1.8-.4-2.4-1.2-2.4-2.4 0-1.3.9-2.1 2.4-2.3v-1.6h1.6v1.7c1.4.2 2.3.9 2.6 2l-1.6.4c-.2-.6-.7-1-1.5-1-.7 0-1.3.3-1.3.9 0 .5.4.7 1.5 1l.6.1c1.8.4 2.5 1.2 2.5 2.4 0 1.3-1 2.1-2.4 2.3z" fill="#fff"/></svg>',
)

const USDT_SVG = svg(
  '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#26a17b"/><path d="M17.8 14.7v-1.6h3.7v-2.5H10.5v2.5h3.7v1.6c-3 .1-5.3.7-5.3 1.5s2.3 1.4 5.3 1.5v5.2h3.6V18c3-.1 5.3-.7 5.3-1.5s-2.3-1.4-5.3-1.5zm0 2.6c-.1 0-.7 0-1.8 0-1 0-1.6 0-1.8 0-2.6-.1-4.5-.6-4.5-1.1 0-.5 1.9-1 4.5-1.1v1.8c.2 0 .8 0 1.8 0 1 0 1.6 0 1.8 0v-1.8c2.6.1 4.5.6 4.5 1.1 0 .5-1.9 1-4.5 1.1z" fill="#fff"/></svg>',
)

const MATIC_SVG = POL_SVG

const BTC_SVG = svg(
  '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#f7931a"/><path d="M21.4 14.1c.3-1.9-1.2-2.9-3.2-3.6l.6-2.6-1.6-.4-.6 2.5c-.4-.1-.9-.2-1.3-.3l.6-2.5-1.6-.4-.6 2.6c-.4-.1-.7-.2-1-.2l-2.2-.5-.4 1.7s1.2.3 1.2.3c.7.2.8.6.8 1l-1.5 6.2c-.1.2-.2.4-.6.3 0 0-1.2-.3-1.2-.3l-.8 1.8 2.1.5c.4.1.8.2 1.1.3l-.6 2.6 1.6.4.6-2.6c.4.1.9.2 1.3.3l-.6 2.6 1.6.4.6-2.6c2.7.5 4.7.3 5.6-2.1.7-2-.1-3.1-1.5-3.8 1-.3 1.8-1 2-2.5zm-3.5 5.1c-.5 2-3.9.9-5 .6l.8-3.2c1.1.3 4.7.8 4.2 2.6zm.5-5.2c-.4 1.8-3.3.9-4.2.6l.7-2.9c.9.2 4 .7 3.5 2.3z" fill="#fff"/></svg>',
)

const BNB_SVG = svg(
  '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#f3ba2f"/><path d="M12.1 14.4 16 10.5l3.9 3.9 2.3-2.3L16 6l-6.2 6.2 2.3 2.3zM6 16l2.3-2.3L10.6 16l-2.3 2.3L6 16zm6.1 1.6L16 21.5l3.9-3.9 2.3 2.3L16 26l-6.2-6.2v0l2.3-2.3zM21.4 16l2.3-2.3L26 16l-2.3 2.3L21.4 16zm-3-0l-2.4-2.4-1.8 1.8-.2.2L13.7 16l2.3 2.3 2.4-2.3z" fill="#fff"/></svg>',
)

const AVAX_SVG = svg(
  '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#e84142"/><path d="M11.1 22h-2.5c-.5 0-.8 0-.9-.1-.1-.1-.2-.3-.2-.5 0-.1 0-.3.1-.4l8.8-15.3c0-.1.1-.2.2-.2.1-.1.2-.1.3-.1.1 0 .2 0 .3.1.1.1.1.1.2.2l1.8 3.1c.1.1.1.2.1.4 0 .1 0 .3-.1.4l-7.2 12.4c0 .1-.1.2-.2.2-.1.1-.1.1-.2.1-.1 0-.2 0-.3-.1zm10.9 0h-3.7c-.5 0-.8 0-.9-.1-.1-.1-.2-.3-.2-.5 0-.1 0-.3.1-.4l1.9-3.2c0-.1.1-.2.2-.2.1-.1.2-.1.3-.1.1 0 .2 0 .3.1.1.1.1.1.2.2l1.9 3.2c.1.1.1.2.1.4 0 .2-.1.4-.2.5-.1.1-.4.1-.9.1z" fill="#fff"/></svg>',
)

const TON_SVG = svg(
  '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#0098ea"/><path d="M22.3 11.7H9.7c-.8 0-1.3.9-.9 1.6L15.3 23c.3.5 1 .5 1.3 0l6.5-9.7c.4-.7-.1-1.6-.8-1.6zm-7.1 9-1.4-2.7-3.4-6.1c-.1-.2 0-.4.2-.4h4.7v9.2zm5.7-8.8-3.4 6.1-1.4 2.7v-9.2h4.7c.2 0 .3.2.1.4z" fill="#fff"/></svg>',
)

const DOT_SVG = svg(
  '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#e6007a"/><ellipse cx="16" cy="9.5" rx="3.6" ry="2.2" fill="#fff"/><ellipse cx="16" cy="22.5" rx="3.6" ry="2.2" fill="#fff"/><ellipse cx="10.4" cy="12.75" rx="3.6" ry="2.2" transform="rotate(-60 10.4 12.75)" fill="#fff"/><ellipse cx="21.6" cy="19.25" rx="3.6" ry="2.2" transform="rotate(-60 21.6 19.25)" fill="#fff"/><ellipse cx="10.4" cy="19.25" rx="3.6" ry="2.2" transform="rotate(60 10.4 19.25)" fill="#fff"/><ellipse cx="21.6" cy="12.75" rx="3.6" ry="2.2" transform="rotate(60 21.6 12.75)" fill="#fff"/></svg>',
)

const ADA_SVG = svg(
  '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#0033ad"/><g fill="#fff"><circle cx="16" cy="9" r="1.4"/><circle cx="16" cy="23" r="1.4"/><circle cx="10" cy="12.5" r="1.4"/><circle cx="22" cy="12.5" r="1.4"/><circle cx="10" cy="19.5" r="1.4"/><circle cx="22" cy="19.5" r="1.4"/><circle cx="16" cy="16" r="2"/></g></svg>',
)

const XRP_SVG = svg(
  '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#000"/><path d="M22.5 9.5h2.2l-4.6 4.7c-2.3 2.3-6 2.3-8.2 0L7.3 9.5h2.2l3.5 3.5c1.7 1.7 4.5 1.7 6.1 0l3.4-3.5zM7.3 22.5l4.6-4.7c2.3-2.3 6-2.3 8.2 0l4.6 4.7h-2.2l-3.5-3.5c-1.7-1.7-4.5-1.7-6.1 0l-3.4 3.5H7.3z" fill="#fff"/></svg>',
)

// Round 2: bundled marks for the chains the API exposes that we didn't ship
// in the initial set. Letter-glyphs in brand-coloured circles — same visual
// language as BTC/BNB/AVAX above. Production CDN URLs (cdn.lux.network) all
// 522 for these chains so the bundled fallback is the only thing that
// renders today; if/when the CDN comes back, the mapper still prefers
// these (CHAIN_LOGOS lookup wins over the API URL).

const ZOO_SVG = svg(
  '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#2e7d32"/><text x="16" y="22" font-family="Arial Black, sans-serif" font-weight="900" font-size="16" fill="#fff" text-anchor="middle">Z</text></svg>',
)

const CELO_SVG = svg(
  '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#fbcc5c"/><rect x="8" y="8" width="12" height="12" stroke="#000" stroke-width="2.4" fill="none"/><rect x="12" y="12" width="12" height="12" stroke="#000" stroke-width="2.4" fill="none"/></svg>',
)

const GNO_SVG = svg(
  '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#133629"/><circle cx="16" cy="16" r="6" fill="none" stroke="#fff" stroke-width="2"/><circle cx="13" cy="14" r="1.4" fill="#fff"/><circle cx="19" cy="14" r="1.4" fill="#fff"/></svg>',
)

const FTM_SVG = svg(
  '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#1969ff"/><path d="M16.5 7l6 3.5v11l-6 3.5-6-3.5v-11l6-3.5zm-4.5 5.6v6.8l4.5 2.6V8L12 11.6z" fill="#fff" fill-rule="evenodd"/></svg>',
)

const AURORA_SVG = svg(
  '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="aurg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#70d44b"/><stop offset="1" stop-color="#3aa653"/></linearGradient></defs><circle cx="16" cy="16" r="16" fill="url(#aurg)"/><path d="M16 8l5 12h-2.5l-1-2.5h-3l-1 2.5H11L16 8zm-.7 7.5h1.4L16 12.5l-.7 3z" fill="#fff"/></svg>',
)

const ZORA_SVG = svg(
  '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="zorag" cx=".5" cy=".5" r=".7"><stop offset="0" stop-color="#fff"/><stop offset=".4" stop-color="#ffd166"/><stop offset=".7" stop-color="#ef476f"/><stop offset="1" stop-color="#7209b7"/></radialGradient></defs><circle cx="16" cy="16" r="16" fill="url(#zorag)"/></svg>',
)

const BLAST_SVG = svg(
  '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#fcfc03"/><text x="16" y="22" font-family="Arial Black, sans-serif" font-weight="900" font-size="16" fill="#000" text-anchor="middle">B</text></svg>',
)

const LINEA_SVG = svg(
  '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#000"/><path d="M10 9h3v11h9v3H10V9z" fill="#61dfff"/></svg>',
)

const XDAI_SVG = svg(
  '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#133629"/><text x="16" y="22" font-family="Arial, sans-serif" font-weight="700" font-size="12" fill="#fff" text-anchor="middle">xDAI</text></svg>',
)

export const CHAIN_LOGOS: Record<string, string> = {
  'lux:96369': LUX_SVG,
  'evm:1': ETH_SVG,
  'evm:42161': ARB_SVG,
  'evm:8453': BASE_SVG,
  'evm:137': POL_SVG,
  'evm:10': OP_SVG,
  'svm:101': SOL_SVG,
  'btc:mainnet': BTC_SVG,
  'ton:mainnet': TON_SVG,
  'xrp:mainnet': XRP_SVG,
  'polkadot:mainnet': DOT_SVG,
  'cardano:mainnet': ADA_SVG,
  'evm:56': BNB_SVG,            // Binance Smart Chain
  'evm:43114': AVAX_SVG,        // Avalanche C-Chain
  'evm:200200': ZOO_SVG,        // Zoo
  'evm:42220': CELO_SVG,        // Celo
  'evm:100': GNO_SVG,           // Gnosis Chain
  'evm:250': FTM_SVG,           // Fantom Opera
  'evm:1313161554': AURORA_SVG, // Aurora (NEAR)
  'evm:7777777': ZORA_SVG,      // Zora
  'evm:81457': BLAST_SVG,       // Blast
  'evm:59144': LINEA_SVG,       // Linea
}

export const ASSET_LOGOS: Record<string, string> = {
  LUX: LUX_SVG,
  ETH: ETH_SVG,
  WETH: ETH_SVG,
  USDC: USDC_SVG,
  USDT: USDT_SVG,
  DAI: USDC_SVG, // visually similar coin glyph, distinct color
  MATIC: MATIC_SVG,
  POL: MATIC_SVG, // Polygon renamed MATIC → POL
  SOL: SOL_SVG,
  BTC: BTC_SVG,
  WBTC: BTC_SVG,
  BNB: BNB_SVG,
  AVAX: AVAX_SVG,
  TON: TON_SVG,
  DOT: DOT_SVG,
  ADA: ADA_SVG,
  XRP: XRP_SVG,
  ZOO: ZOO_SVG,
  CELO: CELO_SVG,
  XDAI: XDAI_SVG,
  FTM: FTM_SVG,
  BLAST: BLAST_SVG,
}
