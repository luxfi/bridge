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
  /**
   * Meta description for the document `<head>` — written to
   * `<meta name="description">` plus `og:description` / `twitter:description`
   * by `applyBrandMetadata`. White-labels the head per tenant so a non-Lux
   * surface never leaks "Lux" in its description (the white-label invariant).
   */
  description?: string
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
 * Cloud-HSM cosigner provider. Each value is a synchronous,
 * HSM-backed signing layer. Adding a new cloud here is a single
 * adapter on the bridge backend (`domain/cosigners.ts::CloudSigner`).
 */
export type CloudHsmProvider =
  | "gcp_kms"
  | "aws_kms"
  | "azure_key_vault"
  | "vault_transit"

/**
 * Signing algorithm. Bridge accepts a narrow allow-list — adding an
 * algorithm requires evaluating its security against the existing
 * settlement-signature acceptance rules on `app/server`. The default
 * for EVM cross-chain settlement is `secp256k1_ecdsa_sha256`.
 */
export type CosignerAlgorithm =
  | "secp256k1_ecdsa_sha256"
  | "ed25519"
  | "rsa_pss_sha256"

/**
 * Cloud-HSM cosigner config — one signer per entry.
 *
 * Layers a synchronous HSM-backed signature on top of the native MPC
 * threshold network. The bridge backend enforces 2-of-2 (or N-of-N
 * across multiple cloud HSMs + native MPC) before releasing settlement.
 * Right model when a tenant's policy is "this institutional treasury
 * key in cloud HSM must attest to every bridge transfer."
 *
 * The browser SDK is **declarative only**. It never authenticates to
 * any cloud KMS directly — the bridge backend resolves identity at
 * signing time using the cloud's native workload-identity story:
 *
 *   GCP:    Workload Identity Federation / attached service account
 *   AWS:    IAM role / OIDC role assumption
 *   Azure:  Managed Identity / workload identity
 *   Vault:  AppRole / Kubernetes auth / short-lived OIDC token
 *
 * `identityHint` is a NON-SECRET hint (e.g. a service-account email,
 * a role ARN, a Vault role name) — never credentials. The backend
 * uses it only to scope which workload-identity binding to consult.
 * SA-JSON-key mode is intentionally not supported in the SDK
 * configuration surface; tenants that lack a managed-identity setup
 * should bind one before enabling cloud-HSM cosign.
 */
export interface BridgeCloudHsmConfig {
  /** Cloud provider for this signer. */
  provider: CloudHsmProvider
  /**
   * Provider-specific full key reference. All info needed to locate
   * the key in the cloud lives here — no per-provider config blob is
   * required because each provider's URI form is self-describing:
   *
   *   gcp_kms          `projects/{p}/locations/{l}/keyRings/{r}/cryptoKeys/{k}/cryptoKeyVersions/{v}`
   *   aws_kms          `arn:aws:kms:{region}:{account}:key/{key-id}`
   *   azure_key_vault  `https://{vault}.vault.azure.net/keys/{name}[/{version}]`
   *   vault_transit    `transit/keys/{name}` (within a tenant's mount path)
   */
  keyRef: string
  /** Signing algorithm — required so the backend can reject early. */
  algorithm: CosignerAlgorithm
  /**
   * Optional non-secret identity hint. Backend uses this only to scope
   * which workload-identity binding to consult; never carries credentials.
   * Examples: GCP SA email, AWS role ARN, Vault role name.
   */
  identityHint?: string
}

/**
 * MPC cluster config block.
 *
 * The bridge co-signs cross-chain settlement via Lux MPC (CGGMP21 / FROST
 * / lattice-based PQ variants). Public cluster (m-chain) handles user
 * wallets; the optional private cluster is reserved for treasury / fee
 * accounts.
 *
 * Optionally layers external MPC custodians (Utila, Fireblocks) and / or
 * cloud-HSM signers (GCP Cloud KMS, AWS KMS, Azure Key Vault) as
 * additional cosigners alongside the native threshold network. All
 * blocks are independent and may be enabled together for belt-and-
 * suspenders institutional flows. Native Lux MPC remains the primary
 * signer; layered cosigners sit on top — backend enforces "all listed
 * must approve" before releasing settlement.
 *
 * Approval semantics differ by layer:
 *   - Utila / Fireblocks: async TAP policy, human approval, polling
 *   - Cloud HSM: synchronous, single API call, sub-second latency
 *
 * The SDK collapses both shapes into the same `cosigners[]` wire array;
 * the backend dispatcher (`domain/cosigners.ts`) handles the difference.
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
  /**
   * Optional cloud-HSM cosigners. Array form so a tenant can layer
   * multiple cloud KMSs simultaneously (e.g. GCP + AWS for cross-region
   * redundancy). Each entry is one synchronous HSM signer.
   *
   * For the Lux-Network tenant (bridge.lux.network), this is **left
   * empty** — Lux relies on m-chain (native MPC) and optionally f-chain
   * (FHE-secured attestation, see `fchain` below) and nothing else.
   * Other tenants (Zoo / Hanzo / institutional white-labels) opt in
   * here when their policy requires regulated-custodian cosign.
   */
  cloudHsm?: BridgeCloudHsmConfig[]

  /**
   * Optional f-chain (FHE attestation) cosigner. Native to the Lux
   * Network — f-chain is the FHE-secured sibling of m-chain, designed
   * for confidential / leaderless attestation without leaking the
   * txHash to plaintext quorum. Used as a SECOND native signer
   * alongside m-chain when a tenant wants PQ-safe cosign without
   * pulling in an external custodian.
   *
   * The Lux-Network bridge tenant may flip this on as the only
   * "extra" layer beyond m-chain — keeps the signing surface entirely
   * within the Lux primary network (b-chain ledger, m-chain MPC,
   * f-chain FHE) with no external dependencies.
   */
  fchain?: BridgeFChainConfig
}

/**
 * f-chain (FHE attestation) config block.
 *
 * f-chain runs alongside m-chain on the Lux primary network. Where
 * m-chain produces a classical threshold signature (CGGMP21 / FROST),
 * f-chain produces an FHE-secured attestation over the same txHash —
 * the cosign property without leaking the message to a plaintext
 * threshold quorum. Same trust boundary as m-chain (Lux validator set),
 * different computation model.
 */
export interface BridgeFChainConfig {
  /** f-chain cluster URL. Distinct from m-chain's publicUrl. */
  publicUrl: string
  /**
   * FHE scheme identifier. The default `ckks` works for general
   * attestation; `bgv` and `bfv` are alternative lattice schemes if
   * a tenant has cross-vendor interop requirements.
   */
  scheme?: "ckks" | "bgv" | "bfv"
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
