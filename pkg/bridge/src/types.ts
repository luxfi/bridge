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
 * Auth (Hanzo IAM white-label) config block.
 *
 * Mirrors the `auth` prop accepted by `<Exchange>` in `@luxfi/exchange`, so
 * tenant apps wire identical OIDC config across products.
 */
export interface BridgeAuthConfig {
  /** Identity provider. Only `iam` is supported today. */
  provider: 'iam'
  /** OIDC issuer URL (e.g. `https://iam.lux.network`). */
  issuer: string
  /** OIDC client id (per-tenant, registered in IAM). */
  clientId: string
  /** Optional white-label IAM hostname (login UI). */
  idHost?: string
  /** Optional IAM org slug for multi-tenant routing. */
  orgSlug?: string
}

/**
 * KMS (secrets + runtime config) block.
 *
 * Tenants point this at their KMS endpoint; the bridge fetches per-tenant
 * runtime secrets via JWT-gated requests.
 */
export interface BridgeKMSConfig {
  /** KMS endpoint URL (e.g. `https://kms.lux.network`). */
  url: string
}

/**
 * Wallet connector config block.
 *
 * Pure declarative pass-through to the bridge's wallet layer. No defaults
 * are baked in here — tenants supply their own WalletConnect project id and
 * preferred chain set.
 */
export interface BridgeWalletConfig {
  /** WalletConnect v2 project id (per tenant). */
  walletConnectProjectId?: string
  /** EVM chain id selected on first connect. */
  defaultChainId?: number
  /** Allow-list of EVM chain ids the connector exposes. */
  supportedChainIds?: number[]
}

/**
 * MPC cluster config block.
 *
 * The bridge co-signs cross-chain settlement via Lux MPC (CGGMP21 / FROST).
 * Public cluster (m-chain) handles user wallets; the optional private cluster
 * is reserved for treasury / fee accounts.
 */
export interface BridgeMPCConfig {
  /** Public MPC cluster URL (m-chain). */
  publicUrl: string
  /** Optional private MPC cluster URL (treasury fees). */
  privateUrl?: string
  /** Threshold-sig protocol. */
  protocol?: 'cggmp21' | 'frost'
}

/**
 * Runtime configuration for the bridge SDK.
 *
 * `apiHost` and `env` are required; every other block is optional and
 * defaults to the unbranded Lux build. The optional blocks intentionally
 * mirror the `<Exchange>` prop set in `@luxfi/exchange` so tenants wire
 * identical config across products.
 */
export interface BridgeConfig {
  /** API host (e.g. `https://api.bridge.lux.network`). */
  apiHost: string
  /** Environment slug (`mainnet`, `testnet`, or a custom env name). */
  env: string
  /** Optional brand overrides for white-label deployments. */
  brand?: BrandConfig
  /** Optional auth (Hanzo IAM) block. Mirrors `<Exchange auth={…} />`. */
  auth?: BridgeAuthConfig
  /** Optional KMS block. Mirrors `<Exchange kms={…} />`. */
  kms?: BridgeKMSConfig
  /** Optional wallet connector block. */
  wallet?: BridgeWalletConfig
  /** Optional MPC cluster block. */
  mpc?: BridgeMPCConfig
  /**
   * Optional Lux ID OIDC client ID.
   * @deprecated Use `auth.clientId` instead. Preserved for backwards compat.
   */
  clientId?: string
  /**
   * Optional Lux ID OIDC org slug.
   * @deprecated Use `auth.orgSlug` instead. Preserved for backwards compat.
   */
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
