// Lux-branded bridge config.
//
// The SDK is jurisdiction-neutral — every tenant supplies its own brand
// block and API host at mount time. This file is the only place where
// Lux-specific text/logos/colors live in the build.
//
// Source of truth for the Lux brand block: @luxfi/brand
// (https://github.com/luxfi/brand). We read every Lux value from the
// package's brand.json so a brand bump in the package propagates here
// on the next install — no string copies, no drift. The JSON subpath
// is used because the npm-published @luxfi/brand@1.0.0 omits its .d.ts
// shipping artefact; brand.json is included and TypeScript infers full
// literal types from it under `resolveJsonModule`.
//
// Logo source of truth: @luxfi/logo (https://github.com/luxfi/logo).
// We import the canonical SVG generator and inline it as a data URL so
// the build artifact has zero external dependencies for the brand mark.

import type { BridgeConfig } from '@luxfi/bridge'
import luxBrandJson from '@luxfi/brand/brand.json'
import { getColorSVG } from '@luxfi/logo'

const luxBrand = luxBrandJson.brand

const luxLogoDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(getColorSVG())}`

// `import.meta.env` is Vite's standard env namespace; missing values fall back
// to values read from @luxfi/brand (which in turn defaults to the production
// Lux network).
const env = import.meta.env

const fallbackApiHost = luxBrand.appDomain
  ? `https://api.bridge.${luxBrand.appDomain}`
  : 'https://api.bridge.lux.network'
const fallbackDocsUrl = luxBrand.docsDomain
  ? `https://${luxBrand.docsDomain}/bridge`
  : 'https://docs.lux.network/bridge'

export const bridgeConfig: BridgeConfig = {
  apiHost: env.VITE_BRIDGE_API_HOST ?? fallbackApiHost,
  env: env.VITE_BRIDGE_ENV ?? 'mainnet',
  clientId: env.VITE_BRIDGE_CLIENT_ID,
  iamOrg: env.VITE_BRIDGE_IAM_ORG ?? 'lux',
  brand: {
    name: `${luxBrand.shortName ?? 'Lux'} Bridge`,
    logoUrl: env.VITE_BRIDGE_LOGO_URL ?? luxLogoDataUrl,
    primaryColor: luxBrand.primaryColor ?? '#000000',
    secondaryColor:
      luxBrand.theme?.dark?.accent1 ?? luxBrand.theme?.light?.accent1,
    supportEmail: luxBrand.supportEmail ?? 'support@lux.network',
    docsUrl: fallbackDocsUrl,
  },
}
