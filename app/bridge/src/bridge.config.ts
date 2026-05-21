// Lux-branded bridge config.
//
// The SDK is jurisdiction-neutral — every tenant supplies its own brand
// block and API host at mount time. This file is the only place where
// Lux-specific text/logos/colors live in the build.
//
// Logo source of truth: @luxfi/logo (https://github.com/luxfi/logo).
// We import the canonical SVG generator and inline it as a data URL so
// the build artifact has zero external dependencies for the brand mark.
//
// Env resolution order:
//   1. window.__ENV     — runtime, set by /__ENV.js at page load. One
//                         image, N envs. Serving container templates
//                         /__ENV.js from real env at boot.
//   2. import.meta.env  — build-time Vite fallback, used in dev and as
//                         a safety net if the serving image fails to
//                         template /__ENV.js.

import type { BridgeConfig } from '@luxfi/bridge'
import { getColorSVG } from '@luxfi/logo'

declare global {
  interface Window {
    __ENV?: Partial<Record<string, string>>
  }
}

const runtime: Partial<Record<string, string>> =
  (typeof window !== 'undefined' && window.__ENV) || {}
const build = import.meta.env
const env = (key: string, fallback?: string): string | undefined => {
  const r = runtime[key]
  if (r) return r
  const b = build[`VITE_${key}`]
  if (b) return b
  return fallback
}

const luxLogoDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(getColorSVG())}`

export const bridgeConfig: BridgeConfig = {
  apiHost: env('BRIDGE_API_HOST', 'https://api.bridge.lux.network')!,
  env: env('BRIDGE_ENV', 'mainnet')!,
  clientId: env('BRIDGE_CLIENT_ID'),
  iamOrg: env('BRIDGE_IAM_ORG', 'lux'),
  brand: {
    name: 'Lux Bridge',
    logoUrl: env('BRIDGE_LOGO_URL') || luxLogoDataUrl,
    primaryColor: '#5b8def',
    secondaryColor: '#7a9ff5',
    supportEmail: 'support@lux.network',
    docsUrl: 'https://docs.lux.network/bridge',
  },
}
