// Public types for the @luxfi/bridge SDK.
//
// These types are part of the package's public API and follow semver. Internal
// type churn happens inside @luxbridge/app and is hidden from consumers via
// barrel re-export here.

/**
 * Brand configuration for white-labeling the bridge UI.
 *
 * Downstream consumers (Lux, Hanzo, Zoo, etc.) pass their own brand block.
 * The bridge stays jurisdiction-neutral; brand text is supplied at mount time.
 */
export interface BrandConfig {
  /** Display name for the bridge instance (window title, header). */
  name: string
  /** URL to the brand logo (SVG preferred). */
  logoUrl?: string
  /** URL to the favicon. */
  faviconUrl?: string
  /** Primary brand color (CSS color, e.g. `#0066ff`). Applied as `--brand-primary`. */
  primaryColor?: string
  /** Optional secondary color. Applied as `--brand-secondary`. */
  secondaryColor?: string
  /** Optional support email shown in the footer. */
  supportEmail?: string
  /** Optional documentation link. */
  docsUrl?: string
}

/**
 * Runtime configuration for the bridge SDK.
 *
 * `apiHost` and `env` are required; brand defaults to the unbranded Lux build.
 */
export interface BridgeConfig {
  /** API host (e.g. `https://api.bridge.lux.network`). */
  apiHost: string
  /** Environment slug (`mainnet`, `testnet`, or a custom env name). */
  env: string
  /** Optional brand overrides for white-label deployments. */
  brand?: BrandConfig
  /** Optional Lux ID OIDC client ID. */
  clientId?: string
  /** Optional Lux ID OIDC org slug. */
  iamOrg?: string
}

/**
 * Mount options for `mountBridge`.
 */
export interface MountBridgeOptions {
  /** Runtime config. Required — there is no implicit default. */
  config: BridgeConfig
  /** DOM element id to mount into. Defaults to `bridge-root`. */
  rootId?: string
}
