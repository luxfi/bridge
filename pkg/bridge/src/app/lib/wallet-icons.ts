// Bundled wallet-brand icons.
//
// Wagmi v2 connectors expose `icon?: string` inconsistently — coinbaseWallet
// has one when the host sets `appLogoUrl`, walletConnect does not, injected
// reflects whichever extension the user has installed (and sometimes nothing).
// To present a stable picker UI we fall back to these inline SVGs keyed by
// the connector id wagmi reports.
//
// EIP-6963 RDNS ids: wagmi 2.x's MIPD (Multi Injected Provider Discovery)
// auto-creates one connector per announced provider. Their connector `id`
// is the provider's RDNS string (`io.metamask`, `io.rabby`, `app.phantom`,
// `com.coinbase.wallet`, `com.brave.wallet`, etc.). We key both lookup
// tables on those too so the picker doesn't fall back to the generic globe.

const svg = (body: string): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(body)}`

const METAMASK_SVG = svg(
  '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><rect width="32" height="32" rx="6" fill="#1a1a1a"/><path d="M26 4 18 9.7l1.5-3.5L26 4zM6 4l7.9 5.8L12.5 6.2 6 4z" fill="#e2761b"/><path d="m22.6 21-2.3 3.5 4.9 1.3 1.4-4.8-4 0zM5.4 21l1.4 4.8 4.9-1.3-2.3-3.5-4 0z" fill="#e4761b"/><path d="m11.7 14-1.4 2.1 4.9.2-.2-5.3-3.3 3zm8.6 0-3.3-3-.1 5.3 4.8-.2-1.4-2.1z" fill="#e4761b"/><path d="m11.7 24.5 2.9-1.4-2.5-2 .4-3.4 3.4 1v6.2l-4.2-.4zm8.6 0-4.2.4v-6.2l3.4-1 .4 3.4-2.5 2 2.9 1.4z" fill="#d7c1b3"/></svg>',
)

const COINBASE_SVG = svg(
  '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#0052ff"/><path d="M16 7a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm-3.5 6h7v6h-7v-6z" fill="#fff"/></svg>',
)

const WALLETCONNECT_SVG = svg(
  '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><rect width="32" height="32" rx="6" fill="#3396ff"/><path d="M9.5 13c3.6-3.5 9.4-3.5 13 0l.4.4c.2.2.2.5 0 .7l-1.4 1.4c-.1.1-.3.1-.4 0l-.6-.6c-2.5-2.5-6.6-2.5-9.1 0l-.6.6c-.1.1-.3.1-.4 0L9 14.1c-.2-.2-.2-.5 0-.7l.5-.4zm16 2.5 1.3 1.3c.2.2.2.5 0 .7l-5.7 5.6c-.2.2-.5.2-.7 0l-4-4c-.1-.1-.2-.1-.2 0l-4.1 4c-.2.2-.5.2-.7 0l-5.6-5.6c-.2-.2-.2-.5 0-.7l1.3-1.3c.2-.2.5-.2.7 0l4.1 4 .1 0 4-4c.2-.2.5-.2.7 0l4 4c.1.1.2.1.2 0l4-4c.2-.2.5-.2.7 0z" fill="#fff"/></svg>',
)

const INJECTED_FALLBACK_SVG = svg(
  '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#374151"/><circle cx="16" cy="16" r="9" stroke="#fff" stroke-width="1.5" fill="none"/><path d="M7 16h18M16 7c2.5 2.5 4 5.5 4 9s-1.5 6.5-4 9c-2.5-2.5-4-5.5-4-9s1.5-6.5 4-9z" stroke="#fff" stroke-width="1.5" fill="none"/></svg>',
)

const SAFE_SVG = svg(
  '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#12ff80"/><path d="M11 12h10v8H11z" fill="#000"/></svg>',
)

const RABBY_SVG = svg(
  '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><rect width="32" height="32" rx="6" fill="#8697ff"/><path d="M8 18c0-4 3-7 8-7s8 3 8 7c0 3-3 6-8 6s-8-3-8-6zm5-1.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm6 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" fill="#fff"/></svg>',
)

const PHANTOM_SVG = svg(
  '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><rect width="32" height="32" rx="6" fill="#ab9ff2"/><path d="M16 8c4.4 0 8 3.6 8 8v6c0 1.1-.9 2-2 2h-3v-3c0-.6-.4-1-1-1s-1 .4-1 1v3h-2v-3c0-.6-.4-1-1-1s-1 .4-1 1v3h-3c-1.1 0-2-.9-2-2v-6c0-4.4 3.6-8 8-8zm-3 7a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z" fill="#fff"/></svg>',
)

const BRAVE_SVG = svg(
  '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><rect width="32" height="32" rx="6" fill="#fb542b"/><path d="M16 6l4 3-2 3 2 6-4 6-4-6 2-6-2-3 4-3z" fill="#fff"/></svg>',
)

const RAINBOW_SVG = svg(
  '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="rb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff6257"/><stop offset=".33" stop-color="#ffb800"/><stop offset=".66" stop-color="#7eda00"/><stop offset="1" stop-color="#3898ff"/></linearGradient></defs><rect width="32" height="32" rx="6" fill="url(#rb)"/><path d="M7 23a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0-6a8 8 0 0 1 8 8h-3a5 5 0 0 0-5-5v-3zm0-6a14 14 0 0 1 14 14h-3a11 11 0 0 0-11-11V11z" fill="#fff"/></svg>',
)

const TRUST_SVG = svg(
  '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><rect width="32" height="32" rx="6" fill="#0500ff"/><path d="M16 5l8 3v8c0 5-3.5 9-8 11-4.5-2-8-6-8-11V8l8-3z" fill="#fff"/></svg>',
)

/**
 * Lookup table keyed by wagmi connector `id`. Returns a data-URL SVG to use
 * when the connector itself doesn't expose an `icon` field.
 */
export const WALLET_ICONS: Record<string, string> = {
  injected: METAMASK_SVG, // overwhelmingly MetaMask in the wild
  metaMask: METAMASK_SVG,
  metaMaskSDK: METAMASK_SVG,
  io_metamask: METAMASK_SVG,
  'io.metamask': METAMASK_SVG,
  'io.rabby': RABBY_SVG,
  'app.phantom': PHANTOM_SVG,
  'com.brave.wallet': BRAVE_SVG,
  'me.rainbow': RAINBOW_SVG,
  'com.trustwallet.app': TRUST_SVG,
  coinbaseWallet: COINBASE_SVG,
  coinbaseWalletSDK: COINBASE_SVG,
  'com.coinbase.wallet': COINBASE_SVG,
  walletConnect: WALLETCONNECT_SVG,
  safe: SAFE_SVG,
}

export const INJECTED_FALLBACK = INJECTED_FALLBACK_SVG

/**
 * User-facing connector name. Wagmi's `name` is often technical
 * ("Injected", "WalletConnect", "Coinbase Wallet"); this map polishes the
 * common ids for the picker UI. Unknown ids fall through to wagmi's `name`.
 */
export const WALLET_DISPLAY_NAMES: Record<string, string> = {
  injected: 'Browser Wallet',
  metaMask: 'MetaMask',
  metaMaskSDK: 'MetaMask',
  'io.metamask': 'MetaMask',
  'io.rabby': 'Rabby',
  'app.phantom': 'Phantom',
  'com.brave.wallet': 'Brave Wallet',
  'me.rainbow': 'Rainbow',
  'com.trustwallet.app': 'Trust Wallet',
  coinbaseWallet: 'Coinbase Wallet',
  coinbaseWalletSDK: 'Coinbase Wallet',
  'com.coinbase.wallet': 'Coinbase Wallet',
  walletConnect: 'WalletConnect',
  safe: 'Safe',
}
