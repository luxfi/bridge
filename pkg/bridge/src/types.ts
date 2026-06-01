// Public types for the @luxfi/bridge SDK.
//
// These types are part of the package's public API and follow semver. The
// inlined bridge UI under `./app/` consumes them through `getConfig()`
// rather than re-exporting — keeping the public surface minimal.

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
 * Utila cosigner block.
 *
 * Layers a Utila vault on top of the native Lux MPC cluster — the bridge
 * backend collects BOTH a native MPC threshold sign AND a Utila approval
 * before releasing settlement. Useful for tenants who already custody
 * with Utila and want regulated-cosigner gating without giving up the
 * native threshold property.
 *
 * The SDK declares the block; the actual Utila API client lives on the
 * bridge backend (browser never holds the Utila JWT or service-account
 * credentials). All fields here are tenant-visible identifiers safe to
 * ship in the page bundle.
 */
export interface BridgeUtilaConfig {
  /** Utila tenant org slug. */
  orgId: string
  /** OAuth client id (delegated auth — server completes the exchange). */
  clientId: string
  /** Optional Utila API host override. Defaults to `https://api.utila.io`. */
  apiHost?: string
  /** Optional vault id pinning a specific Utila vault. */
  vaultId?: string
}

/**
 * Fireblocks cosigner block.
 *
 * Layers a Fireblocks vault on top of the native Lux MPC cluster — same
 * pattern as `utila` (backend holds the secret, SDK only declares config).
 * Use when tenants are already on Fireblocks for institutional custody.
 *
 * The Fireblocks secret key NEVER lives in the browser; the API key id
 * here is the *public* tenant identifier registered with Fireblocks. The
 * bridge backend holds the matching secret in KMS and completes the
 * cosign on behalf of the tenant.
 */
export interface BridgeFireblocksConfig {
  /** Fireblocks tenant API key id (public — NOT the secret). */
  apiKey: string
  /** Optional Fireblocks API host override. Defaults to `https://api.fireblocks.io`. */
  apiHost?: string
  /** Optional vault account id pinning a specific Fireblocks vault. */
  vaultAccountId?: string
}

/**
 * MPC cluster config block.
 *
 * The bridge co-signs cross-chain settlement via Lux MPC (CGGMP21 / FROST
 * / lattice-based PQ variants). Public cluster (m-chain) handles user
 * wallets; the optional private cluster is reserved for treasury / fee
 * accounts.
 *
 * Optionally layers external MPC custodians (Utila, Fireblocks) as
 * additional cosigners alongside the native threshold network — both
 * blocks are independent and may be enabled together for belt-and-
 * suspenders institutional flows. Native Lux MPC remains the primary
 * signer; external custodians sit on top.
 */
export interface BridgeMPCConfig {
  /**
   * Public MPC cluster URL (m-chain).
   *
   * Optional only when a tenant runs pure-external custody (utila or
   * fireblocks block set, no native threshold). Recommended layered
   * mode keeps this set so native MPC remains the primary signer.
   */
  publicUrl?: string
  /** Optional private MPC cluster URL (treasury fees). */
  privateUrl?: string
  /**
   * Threshold-signature protocol identifier.
   *
   * Classical (ECDSA/EdDSA): `cggmp21`, `frost`, `bls`, `doerner`.
   * Post-quantum (lattice-based, leaderless-safe): `pulsar` (MLWE),
   * `corona` (RLWE), `magnetar` (research variant).
   *
   * All protocols are leaderless and permissionless-safe by design.
   */
  protocol?:
    | 'cggmp21'
    | 'frost'
    | 'bls'
    | 'doerner'
    | 'pulsar'
    | 'corona'
    | 'magnetar'
  /**
   * Optional Utila cosigner. Layers on top of native MPC.
   * Backend enforces 2-of-2 (native + utila) before releasing settlement.
   */
  utila?: BridgeUtilaConfig
  /**
   * Optional Fireblocks cosigner. Layers on top of native MPC.
   * Backend enforces 2-of-2 (native + fireblocks) before releasing settlement.
   */
  fireblocks?: BridgeFireblocksConfig
}

/**
 * Direct-RPC config block.
 *
 * When `bchainUrl` is set, the SDK tries the Lux BridgeVM JSON-RPC for
 * quote / submit / status before touching `BridgeConfig.apiHost` (the
 * legacy REST backend). On RPC error or unreachable host, falls back to
 * REST so the UI keeps working. This makes the bridge a true dApp without
 * forfeiting compatibility with hosts that don't expose a public BridgeVM
 * RPC yet.
 */
export interface BridgeRpcConfig {
  /**
   * B-Chain (BridgeVM) JSON-RPC URL, e.g.
   * `https://node.lux.network/ext/bc/B/rpc`. When set, drives the primary
   * data path (estimate fee / submit request / get status).
   */
  bchainUrl?: string
  /**
   * Optional T-Chain (ThresholdVM) JSON-RPC URL. When omitted, the SDK
   * uses `mpc.publicUrl` for MPC operations (they refer to the same
   * endpoint — kept as separate fields for callers that want to point
   * them at different proxies).
   */
  tchainUrl?: string
  /**
   * Behaviour when the RPC call fails or the endpoint is unreachable.
   * `rest` (default): fall back to the REST `apiHost`. `fail`: surface
   * the error to the UI.
   */
  fallback?: 'rest' | 'fail'
  /** Per-request RPC timeout in ms. Defaults to 10_000. */
  timeoutMs?: number
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
  /** Optional direct-RPC block. Drives the dApp path against BridgeVM. */
  rpc?: BridgeRpcConfig
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
  /**
   * Optional Solana RPC endpoint for the user-leg wallet adapter
   * (balance reads, optional auto-deposit send). Defaults to
   * `https://solana-rpc.publicnode.com` (mainnet) inside NonEVMProviders.
   * Override for devnet smoke tests (`https://api.devnet.solana.com`),
   * staging clusters, or higher-rate-limit endpoints (Helius / QuickNode /
   * Triton). The bridge BACKEND has its own --solana-rpc-url flag for the
   * release leg; this field only affects what the SPA's Connection
   * queries for balance / send.
   */
  solanaRpcUrl?: string
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
