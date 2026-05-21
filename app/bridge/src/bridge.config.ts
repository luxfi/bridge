// Lux-branded bridge config.
//
// The SDK is jurisdiction-neutral — every tenant supplies its own brand
// block and API host at mount time. This file is the only place where
// Lux-specific text/logos/colors live in the build.
//
// Logo source of truth: @luxfi/logo (https://github.com/luxfi/logo).
// We import the canonical SVG generator and inline it as a data URL so
// the build artifact has zero external dependencies for the brand mark.

import type { BridgeConfig } from '@luxfi/bridge'
import { getColorSVG } from '@luxfi/logo'

const luxLogoDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(getColorSVG())}`

// `import.meta.env` is Vite's standard env namespace; missing values fall back
// to the production network.
const env = import.meta.env

export const bridgeConfig: BridgeConfig = {
  apiHost: env.VITE_BRIDGE_API_HOST ?? 'https://api.bridge.lux.network',
  env: env.VITE_BRIDGE_ENV ?? 'mainnet',
  clientId: env.VITE_BRIDGE_CLIENT_ID,
  iamOrg: env.VITE_BRIDGE_IAM_ORG ?? 'lux',
  brand: {
    name: 'Lux Bridge',
    logoUrl: env.VITE_BRIDGE_LOGO_URL ?? luxLogoDataUrl,
    primaryColor: '#5b8def',
    secondaryColor: '#7a9ff5',
    supportEmail: 'support@lux.network',
    docsUrl: 'https://docs.lux.network/bridge',
  },
}
