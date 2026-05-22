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

import type { BridgeConfig } from '@luxfi/bridge'
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

// Bridge endpoints belong to the bridge subdomain — independent of
// @luxfi/brand's appDomain (which is "lux.exchange" for the exchange).
const fallbackApiHost = 'https://api.bridge.lux.network'
const fallbackDocsUrl = 'https://docs.lux.network/bridge'

export const bridgeConfig: BridgeConfig = {
  apiHost: env('BRIDGE_API_HOST', fallbackApiHost)!,
  env: env('BRIDGE_ENV', 'mainnet')!,
  clientId: env('BRIDGE_CLIENT_ID'),
  iamOrg: env('BRIDGE_IAM_ORG', 'lux'),
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
}
