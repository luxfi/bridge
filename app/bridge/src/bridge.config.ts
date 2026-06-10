// Lux-branded bridge config.
//
// The SDK is jurisdiction-neutral — every tenant supplies its own brand
// block and API host at mount time. This file is the only place where
// Lux-specific text/logos/colors live in the build.
//
// Source of truth for the Lux brand block: @luxfi/brand
// (https://github.com/luxfi/brand). Every Lux value is read from the
// package's brand.json so a brand bump in the package propagates here
// on the next install — no string copies, no drift. The JSON subpath
// is used because the npm-published @luxfi/brand@1.0.0 omits its .d.ts
// shipping artefact; brand.json is included and TypeScript infers full
// literal types from it under `resolveJsonModule`.
//
// Logo source of truth: @luxfi/logo (https://github.com/luxfi/logo).
// The canonical SVG generator is inlined as a data URL so the build
// artifact has zero external dependencies for the brand mark.
//
// Env resolution order (per key):
//   1. window.__ENV     — runtime, set by /__ENV.js at page load. One
//                         image, N envs. Serving container templates
//                         /__ENV.js from real env at boot.
//   2. import.meta.env  — build-time Vite fallback, used in dev and as
//                         a safety net if the serving image fails to
//                         template /__ENV.js.
//   3. @luxfi/brand defaults — final fallback to the canonical Lux brand
//                              package's brand.json values.

import type {
  BridgeConfig,
  BridgeMPCConfig,
  BridgeWalletConfig,
} from '@luxfi/bridge'
import luxBrandJson from '@luxfi/brand/brand.json'
import { getColorSVG } from '@luxfi/logo'

declare global {
  interface Window {
    __ENV?: Partial<Record<string, string>>
  }
}

// Pick only the fields we actually consume, so the bundle doesn't ship the
// full brand block (legalEntity, complianceEmail, social handles, the brand
// chain registry, etc.). Cuts bundle bloat and prevents accidental tenant-
// metadata leakage if a future SDK feature ever reads `window`-attached
// brand state.
const { shortName, primaryColor, supportEmail } = luxBrandJson.brand

const runtime: Partial<Record<string, string>> =
  (typeof window !== 'undefined' && window.__ENV) || {}
const build = import.meta.env

/**
 * Look up a config value by key. Tries runtime (`window.__ENV`) first,
 * then build-time (`import.meta.env.VITE_*`), then the supplied fallback.
 */
const env = (key: string, fallback?: string): string | undefined => {
  const r = runtime[key]
  if (r) return r
  const b = build[`VITE_${key}`]
  if (b) return b
  return fallback
}

const luxLogoDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(getColorSVG())}`

// Live bridge REST endpoint. Note the hostname is `bridge-api.lux.network`
// (hyphenated) — this is the same Express backend the production
// bridge.lux.network frontend uses today. The previous `api.bridge.lux.network`
// fallback never resolved in DNS, which is why the UI used to surface
// "Failed to fetch" on first load. When a public B-Chain (BridgeVM) JSON-RPC
// endpoint is exposed, the SDK will try that first via `BridgeConfig.rpc`
// and only fall back to this REST host on RPC failure.
const fallbackApiHost = 'https://bridge-api.lux.network'
const fallbackDocsUrl = 'https://docs.lux.network/bridge'

// MPC endpoints. publicUrl is the m-chain (public threshold network, used
// for user wallets); privateUrl is the treasury cluster (used for fee
// collection only and not always reachable from the tenant). Protocol
// defaults to cggmp21 — the canonical classical ECDSA-CMP variant called
// out as leaderless / permissionless-safe in REQUIREMENTS.md §5.3.
const fallbackMpcPublicUrl = 'https://mpc.lux.network'
const fallbackMpcProtocol: NonNullable<BridgeMPCConfig['protocol']> = 'cggmp21'

// Curated EVM allow-list for the Lux tenant. The SDK's full supported set
// (mainnet, lux, arbitrum, base, polygon, optimism, bsc for mainnet; sepolia,
// luxTestnet, arbitrumSepolia, baseSepolia, optimismSepolia, polygonAmoy,
// holesky, bscTestnet for testnet) is intentionally narrowed here so the
// user wallet only sees chains the bridge backend actually settles to.
//
// Lux mainnet (96369) and Lux Testnet (96368) ARE in the wagmi connector
// because the user wallet signs the deposit leg when Lux is the SOURCE
// chain (LUX → external). When Lux is the DESTINATION, the user never
// signs on Lux — the bridge's MPC release wallet pays out. Non-EVM
// chains (Solana, BTC, TON, XRP) are signed end-to-end by MPC for both
// legs and don't appear in the wagmi connector.
//
// Env-aware:
//   BRIDGE_ENV=testnet → Sepolia / Lux Testnet / Base Sepolia / Holesky;
//   BRIDGE_ENV=local   → Lux Local (31337) / Zoo Local (200203) — for
//                         smoke testing against a local avalanchego node,
//                         no public testnet chains shown so the picker
//                         isn't cluttered with networks the local bridge
//                         can't actually serve;
//   BRIDGE_ENV=mainnet (default) → the production EVM allow-list.
const envSlug = env('BRIDGE_ENV', 'mainnet') ?? 'mainnet'
const isTestnetEnv = envSlug === 'testnet' || envSlug === 'devnet'
const isLocalEnv = envSlug === 'local'
const fallbackSupportedChainIds = isLocalEnv
  ? [
      31337,  // Lux Local (C-Chain EVM; P-Chain primary network is 1337
              // but lives outside wagmi — see luxLocal in wagmi-config.ts)
      200203, // Zoo Local (C-Chain EVM)
    ]
  : isTestnetEnv
    ? [
        11155111, // Ethereum Sepolia
        96368,    // Lux Testnet
        200201,   // Zoo Testnet
        84532,    // Base Sepolia
        17000,    // Holesky
        421614,   // Arbitrum Sepolia
        11155420, // Optimism Sepolia
        80002,    // Polygon Amoy
        97,       // BSC Testnet
        43113,    // Avalanche Fuji
      ]
    : [
        1,      // Ethereum mainnet
        96369,  // Lux
        200200, // Zoo
        42161,  // Arbitrum
        8453,   // Base
        137,    // Polygon
        10,     // Optimism
        56,     // BSC
        43114,  // Avalanche
      ]
const fallbackDefaultChainId = isLocalEnv ? 31337 : isTestnetEnv ? 11155111 : 1

/**
 * Parse a comma-separated list of numeric chain IDs from env, dropping
 * non-numeric entries. Empty / unset → `undefined` so the caller can fall
 * back to the static allow-list.
 */
const parseChainIds = (raw: string | undefined): number[] | undefined => {
  if (!raw) return undefined
  const ids = raw
    .split(',')
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n))
  return ids.length > 0 ? ids : undefined
}

const parseChainId = (raw: string | undefined): number | undefined => {
  if (!raw) return undefined
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) ? n : undefined
}

const wallet: BridgeWalletConfig = {
  walletConnectProjectId: env('WC_PROJECT_ID'),
  defaultChainId: parseChainId(env('BRIDGE_WALLET_DEFAULT_CHAIN')) ?? fallbackDefaultChainId,
  supportedChainIds:
    parseChainIds(env('BRIDGE_WALLET_SUPPORTED_CHAINS')) ?? fallbackSupportedChainIds,
}

// MPC protocol must be one of the union values in BridgeMPCConfig.protocol.
// Anything else from env → fall back to cggmp21 rather than producing a
// type-cast lie.
const ALLOWED_MPC_PROTOCOLS: readonly NonNullable<BridgeMPCConfig['protocol']>[] = [
  'cggmp21',
  'frost',
  'bls',
  'doerner',
  'pulsar',
  'corona',
  'magnetar',
]

const parseMpcProtocol = (
  raw: string | undefined,
): NonNullable<BridgeMPCConfig['protocol']> => {
  if (!raw) return fallbackMpcProtocol
  const match = ALLOWED_MPC_PROTOCOLS.find((p) => p === raw)
  return match ?? fallbackMpcProtocol
}

const mpc: BridgeMPCConfig = {
  publicUrl: env('BRIDGE_MPC_PUBLIC_URL', fallbackMpcPublicUrl),
  privateUrl: env('BRIDGE_MPC_PRIVATE_URL'),
  protocol: parseMpcProtocol(env('BRIDGE_MPC_PROTOCOL')),
}

// In Vite dev mode we want apiHost to be same-origin so /api/* routes through
// the Vite dev proxy (which injects the production Origin header — see
// vite.config.ts). In production builds we use the explicit env value or the
// canonical bridge-api.lux.network fallback (where the prod origin is on
// the server's CORS allow-list).
const devApiHost =
  import.meta.env.DEV && typeof window !== 'undefined'
    ? window.location.origin
    : undefined

export const bridgeConfig: BridgeConfig = {
  apiHost: devApiHost ?? env('BRIDGE_API_HOST', fallbackApiHost)!,
  env: envSlug,
  clientId: env('BRIDGE_CLIENT_ID'),
  iamOrg: env('BRIDGE_IAM_ORG', 'lux'),
  // Tenant-level Solana RPC override. Undefined ⇒ SDK falls back to
  // its mainnet default in NonEVMProviders. For devnet smoke testing
  // set VITE_BRIDGE_SOLANA_RPC_URL=https://api.devnet.solana.com so
  // the SPA's Phantom balance reads match the cluster the user's
  // wallet is on.
  solanaRpcUrl: env('BRIDGE_SOLANA_RPC_URL'),
  brand: {
    name: `${shortName ?? 'Lux'} Bridge`,
    logoUrl: env('BRIDGE_LOGO_URL') || luxLogoDataUrl,
    primaryColor: primaryColor ?? '#000000',
    // secondaryColor intentionally omitted. brand.json's theme.{light,dark}.accent1
    // is a per-theme foreground (white on dark / black on light), NOT a brand
    // accent — wiring it to --brand-secondary breaks hover-color on the
    // opposite-theme surface. Fall back to the SDK's compiled default
    // (`var(--brand-secondary, #7a9ff5)` in pkg/bridge/src/app/styles/theme.css)
    // until @luxfi/brand exposes a real brand-accent field.
    supportEmail: supportEmail ?? 'support@lux.network',
    docsUrl: fallbackDocsUrl,
  },
  wallet,
  mpc,
}
