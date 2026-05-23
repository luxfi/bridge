// Layered cosigner backend — Utila + Fireblocks.
//
// SDK side (pkg/bridge v1.0.3+) declares `mpc.utila` and / or `mpc.fireblocks`
// blocks. Per swap, the SDK posts a `cosigners[]` array of PUBLIC identifiers
// (org_id, client_id, api_key, vault ids). This module:
//
//   1. Validates the incoming intent shape (no secrets accepted from the wire).
//   2. Fetches the matching secret half from KMS by tenant identifier.
//   3. Issues a cosign request against the external custodian after the
//      native MPC sign session completes for a given swap.
//   4. Surfaces approval / rejection back into the swap state machine.
//
// Backend enforces "all listed must approve" — if `cosigners[]` has N entries,
// the swap may not transition to `broadcasting` until all N have signed off
// (in addition to the native threshold network sign).
//
// SCAFFOLD STATUS (2026-05-22, issue #386):
//   ✅ Types match the SDK wire shape exactly.
//   ✅ Dispatch entrypoint compiles + flows through validation.
//   ⏳ KMS reads are stubbed — needs the KMS client wire-up (env `KMS_URL`,
//      `KMS_TOKEN` + path conventions agreed with KMS team).
//   ⏳ Utila cosign uses `@luxfi/utila` Connect-RPC client — needs the
//      transaction-approval flow specifically (different from the existing
//      Utila *primary signer* mode in domain/utila.ts).
//   ⏳ Fireblocks cosign needs `fireblocks-sdk` added to package.json:
//        pnpm add fireblocks-sdk -F @luxbridge/server
//   ⏳ Prisma schema needs a related `CosignerStep` model (or a `metadata`
//      JSON column on Swap) to persist intent + per-step status.
//
// Read this with `pkg/bridge/src/app/lib/bridge-api.ts::serializeCosigner`
// open — that's the source of truth for the wire shape this module accepts.

import {
  FireblocksSDK,
  PeerType,
  TransactionOperation,
} from "fireblocks-sdk"

import {
  createGrpcClient,
  serviceAccountAuthStrategy,
} from "@luxfi/utila"

import { KeyManagementServiceClient } from "@google-cloud/kms"
import { createHash } from "crypto"

import logger from "@/logger"
import { prisma } from "@/prisma-instance"

// ────────────────────────────────────────────────────────────────────────
//  Public types — match SDK shape EXACTLY. Do not drift.
// ────────────────────────────────────────────────────────────────────────

/** Utila cosigner intent. Snake-case, matches SDK serialization. */
export interface UtilaCosignerIntent {
  kind: "utila"
  org_id: string
  client_id: string
  api_host?: string
  vault_id?: string
}

/** Fireblocks cosigner intent. Snake-case, matches SDK serialization. */
export interface FireblocksCosignerIntent {
  kind: "fireblocks"
  api_key: string
  api_host?: string
  vault_account_id?: string
}

/**
 * Cloud-HSM provider. Each value is a synchronous, HSM-backed signing
 * layer with an adapter in this module implementing `CloudSigner`.
 */
export type CloudHsmProvider =
  | "gcp_kms"
  | "aws_kms"
  | "azure_key_vault"
  | "vault_transit"

/**
 * Signing algorithm. Narrow allow-list; adding an algorithm requires
 * evaluating its security against the bridge's settlement-signature
 * acceptance rules. Default for EVM is `secp256k1_ecdsa_sha256`.
 */
export type CosignerAlgorithm =
  | "secp256k1_ecdsa_sha256"
  | "ed25519"
  | "rsa_pss_sha256"

/**
 * Cloud-HSM cosigner intent — flat, uniform shape. The wire-side
 * matches the SDK's BridgeCloudHsmConfig exactly; per-provider config
 * is encoded in `key_ref` (each provider's URI form is self-describing,
 * so no extra config blob is needed).
 *
 * `identity_hint` is a NON-SECRET hint (SA email, role ARN, Vault role)
 * used only to scope which workload-identity binding the backend
 * consults — never credentials.
 */
export interface CloudHsmCosignerIntent {
  kind: "cloud_hsm"
  provider: CloudHsmProvider
  /**
   * Full provider-specific resource ref. Self-describing per provider:
   *   gcp_kms          `projects/{p}/locations/{l}/keyRings/{r}/cryptoKeys/{k}/cryptoKeyVersions/{v}`
   *   aws_kms          `arn:aws:kms:{region}:{account}:key/{key-id}`
   *   azure_key_vault  `https://{vault}.vault.azure.net/keys/{name}[/{version}]`
   *   vault_transit    `transit/keys/{name}`
   */
  key_ref: string
  algorithm: CosignerAlgorithm
  identity_hint?: string
}

/**
 * f-chain (FHE attestation) cosigner intent — native to the Lux Network.
 * Co-signs the same txHash that m-chain (native MPC) signed, via an
 * FHE-secured key material so the message stays encrypted across the
 * f-chain quorum. PQ-safe by construction (lattice-based FHE).
 *
 * For the bridge.lux.network tenant, m-chain + (optionally) f-chain is
 * the entire signing topology — no external cosigners.
 */
export interface FChainCosignerIntent {
  kind: "fchain"
  public_url: string
  scheme?: "ckks" | "bgv" | "bfv"
}

export type CosignerIntent =
  | UtilaCosignerIntent
  | FireblocksCosignerIntent
  | CloudHsmCosignerIntent
  | FChainCosignerIntent

const ALL_CLOUD_PROVIDERS: ReadonlySet<CloudHsmProvider> = new Set<CloudHsmProvider>([
  "gcp_kms",
  "aws_kms",
  "azure_key_vault",
  "vault_transit",
])

const ALL_ALGORITHMS: ReadonlySet<CosignerAlgorithm> = new Set<CosignerAlgorithm>([
  "secp256k1_ecdsa_sha256",
  "ed25519",
  "rsa_pss_sha256",
])

const ALL_FCHAIN_SCHEMES: ReadonlySet<NonNullable<FChainCosignerIntent["scheme"]>> = new Set([
  "ckks",
  "bgv",
  "bfv",
])

// ────────────────────────────────────────────────────────────────────────
//  Structured cloud-signer errors
// ────────────────────────────────────────────────────────────────────────

/**
 * Stable, provider-agnostic error categories for cloud-HSM signing.
 * Bridge state-machine maps these to CosignResult.status:
 *   permission_denied / key_disabled / key_not_found  → rejected
 *   algorithm_mismatch / invalid_digest                → rejected (terminal)
 *   rate_limited / network_error / provider_unavailable → failed (retryable)
 */
export type CloudSignerErrorCode =
  | "permission_denied"
  | "key_not_found"
  | "key_disabled"
  | "algorithm_mismatch"
  | "invalid_digest"
  | "rate_limited"
  | "network_error"
  | "provider_unavailable"

export class CloudSignerError extends Error {
  constructor(
    public readonly code: CloudSignerErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = "CloudSignerError"
  }
}

/** Map a CloudSignerErrorCode to the cosigner result status. */
function statusForErrorCode(
  code: CloudSignerErrorCode,
): Exclude<CosignResult["status"], "approved"> {
  switch (code) {
    case "permission_denied":
    case "key_disabled":
    case "key_not_found":
    case "algorithm_mismatch":
    case "invalid_digest":
      return "rejected"
    case "rate_limited":
    case "network_error":
    case "provider_unavailable":
      return "failed"
  }
}

/** Result of a single cosign step. */
export interface CosignResult {
  intent: CosignerIntent
  /** "approved" — cosigner signed; "rejected" — external denial; "failed" — transport / config error. */
  status: "approved" | "rejected" | "failed"
  /** External signature blob (cosigner-specific encoding). Present only when `status === "approved"`. */
  signature?: string
  /** External rejection reason or transport error. Present unless `status === "approved"`. */
  reason?: string
  /** External transaction / approval id (for traceability + idempotency). */
  externalId?: string
}

// ────────────────────────────────────────────────────────────────────────
//  Wire-shape validation
// ────────────────────────────────────────────────────────────────────────

/**
 * Validate raw `cosigners[]` JSON from the wire. Returns the parsed
 * array on success, or throws `BadCosignerIntent` with a precise reason.
 *
 * Reject anything that smells like a secret leak — `api_secret`,
 * `private_key`, `service_account_private_key`, etc. The SDK is not
 * supposed to send these; if any consumer is forwarding them, we want
 * to fail loudly rather than silently accept them.
 */
export class BadCosignerIntent extends Error {
  constructor(public readonly index: number, message: string) {
    super(`cosigners[${index}]: ${message}`)
    this.name = "BadCosignerIntent"
  }
}

const SECRET_FIELD_NAMES = new Set([
  "secret",
  "api_secret",
  "private_key",
  "secret_key",
  "service_account_private_key",
  "jwt",
  "token",
  "auth_token",
])

export function validateCosigners(raw: unknown): CosignerIntent[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) {
    throw new BadCosignerIntent(-1, "must be an array")
  }
  return raw.map((entry, i): CosignerIntent => {
    if (entry === null || typeof entry !== "object") {
      throw new BadCosignerIntent(i, "must be an object")
    }
    // Defensive: reject if any secret-like field is present on the wire.
    for (const key of Object.keys(entry as object)) {
      if (SECRET_FIELD_NAMES.has(key.toLowerCase())) {
        throw new BadCosignerIntent(
          i,
          `unexpected secret-like field "${key}" — secrets must NEVER cross the wire; backend reads them from KMS`,
        )
      }
    }
    const e = entry as Record<string, unknown>
    if (e.kind === "utila") {
      if (typeof e.org_id !== "string" || !e.org_id) {
        throw new BadCosignerIntent(i, "utila: org_id required")
      }
      if (typeof e.client_id !== "string" || !e.client_id) {
        throw new BadCosignerIntent(i, "utila: client_id required")
      }
      const out: UtilaCosignerIntent = {
        kind: "utila",
        org_id: e.org_id,
        client_id: e.client_id,
      }
      if (typeof e.api_host === "string" && e.api_host) out.api_host = e.api_host
      if (typeof e.vault_id === "string" && e.vault_id) out.vault_id = e.vault_id
      return out
    }
    if (e.kind === "fireblocks") {
      if (typeof e.api_key !== "string" || !e.api_key) {
        throw new BadCosignerIntent(i, "fireblocks: api_key required")
      }
      const out: FireblocksCosignerIntent = {
        kind: "fireblocks",
        api_key: e.api_key,
      }
      if (typeof e.api_host === "string" && e.api_host) out.api_host = e.api_host
      if (typeof e.vault_account_id === "string" && e.vault_account_id) {
        out.vault_account_id = e.vault_account_id
      }
      return out
    }
    if (e.kind === "cloud_hsm") {
      if (
        typeof e.provider !== "string" ||
        !ALL_CLOUD_PROVIDERS.has(e.provider as CloudHsmProvider)
      ) {
        throw new BadCosignerIntent(
          i,
          `cloud_hsm: unknown provider "${String(e.provider)}" (allowed: ${Array.from(ALL_CLOUD_PROVIDERS).join(", ")})`,
        )
      }
      if (typeof e.key_ref !== "string" || !e.key_ref) {
        throw new BadCosignerIntent(i, "cloud_hsm: key_ref required")
      }
      if (
        typeof e.algorithm !== "string" ||
        !ALL_ALGORITHMS.has(e.algorithm as CosignerAlgorithm)
      ) {
        throw new BadCosignerIntent(
          i,
          `cloud_hsm: algorithm required (allowed: ${Array.from(ALL_ALGORITHMS).join(", ")})`,
        )
      }
      const out: CloudHsmCosignerIntent = {
        kind: "cloud_hsm",
        provider: e.provider as CloudHsmProvider,
        key_ref: e.key_ref,
        algorithm: e.algorithm as CosignerAlgorithm,
      }
      if (typeof e.identity_hint === "string" && e.identity_hint) {
        out.identity_hint = e.identity_hint
      }
      return out
    }
    if (e.kind === "fchain") {
      if (typeof e.public_url !== "string" || !e.public_url) {
        throw new BadCosignerIntent(i, "fchain: public_url required")
      }
      const out: FChainCosignerIntent = {
        kind: "fchain",
        public_url: e.public_url,
      }
      if (typeof e.scheme === "string") {
        if (!ALL_FCHAIN_SCHEMES.has(e.scheme as NonNullable<FChainCosignerIntent["scheme"]>)) {
          throw new BadCosignerIntent(
            i,
            `fchain: unknown scheme "${e.scheme}" (allowed: ${Array.from(ALL_FCHAIN_SCHEMES).join(", ")})`,
          )
        }
        out.scheme = e.scheme as FChainCosignerIntent["scheme"]
      }
      return out
    }
    throw new BadCosignerIntent(i, `unknown cosigner kind "${String(e.kind)}"`)
  })
}

// ────────────────────────────────────────────────────────────────────────
//  KMS — secret lookup by public identifier
// ────────────────────────────────────────────────────────────────────────

/**
 * Fetch the secret half (Utila service-account private key, Fireblocks
 * secret PEM) from KMS, keyed by the PUBLIC identifier carried in the
 * intent. Never exposed to the wire.
 *
 * KMS path convention:
 *   utila:      bridge/cosigners/utila/<org_id>/service_account_pem
 *   fireblocks: bridge/cosigners/fireblocks/<api_key>/secret_pem
 *
 * TODO(#386): wire to the actual KMS client. The bridge backend already
 * speaks to KMS via `process.env.KMS_URL` + a service-account JWT — see
 * how `domain/utila.ts` reads `SERVICE_ACCOUNT_PRIVATE_KEY` from env for
 * the primary-signer mode and replace this stub with a KMS GET on the
 * paths above.
 */
/** Normalise a public identifier for use as an env var suffix. POSIX
 *  shells reject hyphens / dots in env var names, so we map every
 *  non-alphanumeric character to underscore. Lossy by design — the env
 *  var fallback is for local dev only; production uses KMS paths that
 *  preserve the original public id verbatim. */
function envSafe(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "_")
}

export async function fetchCosignerSecret(
  intent: CosignerIntent,
): Promise<string> {
  // TEMPORARY — env-var fallback so local dev / tests can wire one tenant
  // without the KMS round-trip. Production MUST take the KMS branch.
  if (intent.kind === "utila") {
    const envKey = `UTILA_COSIGNER_PEM__${envSafe(intent.org_id)}`
    const pem = process.env[envKey]
    if (!pem) {
      throw new Error(
        `Utila cosigner secret not in KMS (TODO) and ${envKey} is unset — cannot complete cosign for org ${intent.org_id}`,
      )
    }
    return pem
  }
  const envKey = `FIREBLOCKS_COSIGNER_PEM__${envSafe(intent.api_key)}`
  const pem = process.env[envKey]
  if (!pem) {
    throw new Error(
      `Fireblocks cosigner secret not in KMS (TODO) and ${envKey} is unset — cannot complete cosign for key ${intent.api_key}`,
    )
  }
  return pem
}

// ────────────────────────────────────────────────────────────────────────
//  Cosign dispatch — runs after native MPC sign completes
// ────────────────────────────────────────────────────────────────────────

export interface DispatchCosignersOptions {
  /** Swap id (for tracing + idempotency). */
  swapId: string
  /** Native-MPC signature already produced for this swap (hex). Cosigners attest to this. */
  nativeSignature: string
  /** Tx hash that the cosigners are attesting to (hex, source chain). */
  txHash: string
  /** Cosigner intents from the swap record. */
  cosigners: CosignerIntent[]
}

/**
 * Run all cosign steps. Returns one result per intent.
 *
 * The caller (swap state machine) decides what to do with rejections —
 * typical policy is "any rejection → swap.failed". This module does not
 * mutate state; it returns results.
 */
export async function dispatchCosigners(
  opts: DispatchCosignersOptions,
): Promise<CosignResult[]> {
  if (opts.cosigners.length === 0) return []

  logger.info(
    `[cosigners] dispatching ${opts.cosigners.length} cosign step(s) for swap=${opts.swapId}`,
  )

  // Run cosigners in parallel — they are independent. Any rejection still
  // results in the swap failing, but we don't gate the requests serially.
  const results = await Promise.all(
    opts.cosigners.map((intent) => runOne(intent, opts).catch((err): CosignResult => ({
      intent,
      status: "failed",
      reason: err instanceof Error ? err.message : String(err),
    }))),
  )

  for (const r of results) {
    logger.info(
      `[cosigners] swap=${opts.swapId} ${r.intent.kind}=${r.status}` +
        (r.reason ? ` reason=${r.reason}` : "") +
        (r.externalId ? ` externalId=${r.externalId}` : ""),
    )
  }

  return results
}

async function runOne(
  intent: CosignerIntent,
  opts: DispatchCosignersOptions,
): Promise<CosignResult> {
  if (intent.kind === "cloud_hsm") {
    // Cloud HSM signers use workload identity (no secret fetch).
    return runCloudHsm(intent, opts)
  }
  if (intent.kind === "fchain") {
    // f-chain is a native Lux Network signer — no external KMS lookup.
    return runFChain(intent, opts)
  }
  const secret = await fetchCosignerSecret(intent)
  if (intent.kind === "utila") {
    return runUtila(intent, secret, opts)
  }
  return runFireblocks(intent, secret, opts)
}

// ────────────────────────────────────────────────────────────────────────
//  Utila cosign — uses @luxfi/utila Connect-RPC client
// ────────────────────────────────────────────────────────────────────────

/**
 * Utila TransactionState_Enum (v1alpha2) partitioned by how we surface
 * each state to the bridge state machine. Values from
 * `pkg/utila/src/lib/gen/utila/api/v1/transactions_pb.ts`.
 *
 *   approved (signature present): SIGNED=4, AWAITING_PUBLISH=5,
 *     PUBLISHED=6, MINED=7, CONFIRMED=13
 *   rejected (Utila policy denial / cancel): DECLINED=9, CANCELED=11,
 *     EXPIRED=15, DROPPED=12
 *   failed (transient / on-chain failure): FAILED=8, REPLACED=10
 *
 * Non-terminal intermediates (AWAITING_APPROVAL=2, AWAITING_POLICY_CHECK=14,
 * AWAITING_SIGNATURE=3) keep polling until terminal.
 */
const UT_STATE_APPROVED = new Set([4, 5, 6, 7, 13])
const UT_STATE_REJECTED = new Set([9, 11, 12, 15])
const UT_STATE_FAILED = new Set([8, 10])

const UTILA_POLL_INTERVAL_MS = 1500
function utilaPollTimeoutMs(): number {
  return Number(process.env.UTILA_COSIGNER_TIMEOUT_MS ?? 60_000)
}

/**
 * Convert Utila's signature bytes to a 0x-hex string. The proto field
 * is `optional bytes signature = 3` (Uint8Array on the wire).
 */
function utilaSignatureHex(sig: Uint8Array | undefined): string | undefined {
  if (!sig || sig.length === 0) return undefined
  let hex = "0x"
  for (let i = 0; i < sig.length; i++) {
    hex += sig[i]!.toString(16).padStart(2, "0")
  }
  return hex
}

async function runUtila(
  intent: UtilaCosignerIntent,
  serviceAccountPem: string,
  opts: DispatchCosignersOptions,
): Promise<CosignResult> {
  if (!intent.vault_id) {
    return {
      intent,
      status: "failed",
      reason: `utila intent missing vault_id — required to scope initiateTransaction for org ${intent.org_id}`,
    }
  }

  // Per-tenant client. Mirrors the construction in `domain/utila.ts`
  // (which holds the env-singleton primary-signer client) but isolates
  // each tenant's auth context — multiple tenants can cosign in parallel
  // without singleton contention.
  let client
  try {
    client = createGrpcClient({
      authStrategy: serviceAccountAuthStrategy({
        email: intent.org_id,
        privateKey: async () => serviceAccountPem,
      }),
      ...(intent.api_host ? { baseUrl: intent.api_host } : {}),
    }).version("v1alpha2")
  } catch (err) {
    return {
      intent,
      status: "failed",
      reason: `utila client construction failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  // Initiate an evm_personal_sign — Utila's RAW-message-sign mode. The
  // wallet (`from_address`) is the tenant's client_id; the message hex
  // is the native MPC txHash. Utila's TAP (Transaction Authorization
  // Policy) decides whether to approve. NORMAL priority is the default
  // for cosigner attestations.
  let initiated
  try {
    initiated = await (client as { initiateTransaction: (req: unknown) => Promise<{ transaction?: { name?: string; state?: { state?: number } } }> })
      .initiateTransaction({
        parent: `vaults/${intent.vault_id}`,
        details: {
          details: {
            case: "evmPersonalSign",
            value: {
              fromAddress: intent.client_id,
              messageHex: opts.txHash,
            },
          },
        },
        priority: 2, // NORMAL
        note: `lux-bridge cosign swap=${opts.swapId}`,
      })
  } catch (err) {
    return {
      intent,
      status: "failed",
      reason: `utila initiateTransaction failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  const txName = initiated.transaction?.name
  if (!txName) {
    return {
      intent,
      status: "failed",
      reason: "utila initiateTransaction returned no transaction.name",
    }
  }

  const timeoutMs = utilaPollTimeoutMs()
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    let tx
    try {
      tx = await (client as { getTransaction: (req: unknown) => Promise<{ name?: string; state?: { state?: number }; evmMessage?: { signature?: Uint8Array } }> })
        .getTransaction({ name: txName })
    } catch (err) {
      logger.warn(
        `[cosigners.utila] getTransaction transient error on tx=${txName}: ${err instanceof Error ? err.message : String(err)}`,
      )
      await sleep(UTILA_POLL_INTERVAL_MS)
      continue
    }

    const state = tx.state?.state ?? 0

    if (UT_STATE_APPROVED.has(state)) {
      const sig = utilaSignatureHex(tx.evmMessage?.signature)
      if (!sig) {
        // Approved-state but no signature yet — Utila publishes the
        // sig in a later state transition. Keep polling.
        await sleep(UTILA_POLL_INTERVAL_MS)
        continue
      }
      return { intent, status: "approved", signature: sig, externalId: txName }
    }

    if (UT_STATE_REJECTED.has(state)) {
      return {
        intent,
        status: "rejected",
        reason: `utila state=${state} (DECLINED/CANCELED/DROPPED/EXPIRED — TAP policy denial)`,
        externalId: txName,
      }
    }

    if (UT_STATE_FAILED.has(state)) {
      return {
        intent,
        status: "failed",
        reason: `utila state=${state} (FAILED/REPLACED)`,
        externalId: txName,
      }
    }

    // Still in flight (AWAITING_APPROVAL / AWAITING_POLICY_CHECK / etc.) — wait.
    await sleep(UTILA_POLL_INTERVAL_MS)
  }

  return {
    intent,
    status: "failed",
    reason: `utila tx ${txName} timed out after ${timeoutMs}ms; manual check via getTransaction may still resolve`,
    externalId: txName,
  }
}

// ────────────────────────────────────────────────────────────────────────
//  Fireblocks cosign — real impl via fireblocks-sdk
// ────────────────────────────────────────────────────────────────────────

/**
 * Polling cadence + ceiling for Fireblocks RAW-sign approval flow.
 * Fireblocks transactions move through:
 *   SUBMITTED → QUEUED → PENDING_AUTHORIZATION
 *     → PENDING_SIGNATURE → COMPLETED        (happy path)
 *     → REJECTED | CANCELLED | BLOCKED       (denied)
 *     → FAILED | TIMEOUT                     (transient / config error)
 *
 * 60s ceiling matches the SDK-side mpc-session timeout default; long
 * Fireblocks TAP workflows that exceed this are surfaced as `failed` so
 * the bridge state machine can retry rather than hold a swap open
 * indefinitely. The exact ceiling is overridable via env for tenants
 * with slower approval SLAs. Read on each call rather than at module
 * load so tests / config changes are picked up without a restart.
 */
const FIREBLOCKS_POLL_INTERVAL_MS = 1500
function fireblocksPollTimeoutMs(): number {
  return Number(process.env.FIREBLOCKS_COSIGNER_TIMEOUT_MS ?? 60_000)
}

/**
 * Terminal Fireblocks statuses, partitioned by how we surface them to
 * the bridge state machine. Anything in `complete` releases settlement;
 * anything in `reject` fails the swap with a clear user-visible reason;
 * anything in `transient` fails the swap but in a way that should be
 * retryable at the operator's discretion.
 *
 * Note Fireblocks's enum is wide (some statuses are deprecated, some
 * are AML-screening intermediates). We treat unknown statuses as
 * non-terminal and keep polling — Fireblocks will eventually reach
 * one of the values below or hit the timeout ceiling.
 */
const FB_STATUS_COMPLETE = new Set([
  "COMPLETED",
  "BROADCASTING", // tx accepted, on-chain; for RAW-sign this is effectively terminal
  "CONFIRMING",
])
const FB_STATUS_REJECT = new Set(["REJECTED", "CANCELLED", "BLOCKED"])
const FB_STATUS_TRANSIENT = new Set(["FAILED", "TIMEOUT"])

async function runFireblocks(
  intent: FireblocksCosignerIntent,
  secretPem: string,
  opts: DispatchCosignersOptions,
): Promise<CosignResult> {
  const client = new FireblocksSDK(
    secretPem,
    intent.api_key,
    intent.api_host ?? "https://api.fireblocks.io",
  )

  // RAW-sign mode: Fireblocks signs the raw txHash bytes without
  // submitting an on-chain transfer. This is exactly what a layered
  // cosigner is supposed to do — attest to "this exact tx hash is
  // approved" without moving funds itself.
  let created
  try {
    created = await client.createTransaction({
      operation: TransactionOperation.RAW,
      source: {
        type: PeerType.VAULT_ACCOUNT,
        id: intent.vault_account_id ?? "0",
      },
      note: `lux-bridge cosign swap=${opts.swapId}`,
      extraParameters: {
        rawMessageData: {
          messages: [{ content: opts.txHash }],
        },
      },
    })
  } catch (err) {
    return {
      intent,
      status: "failed",
      reason: `fireblocks createTransaction failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  const txId = created.id
  const timeoutMs = fireblocksPollTimeoutMs()
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    let tx
    try {
      tx = await client.getTransactionById(txId)
    } catch (err) {
      // Transient transport error — log + keep polling until deadline.
      logger.warn(
        `[cosigners.fireblocks] getTransactionById transient error on tx=${txId}: ${err instanceof Error ? err.message : String(err)}`,
      )
      await sleep(FIREBLOCKS_POLL_INTERVAL_MS)
      continue
    }

    if (FB_STATUS_COMPLETE.has(tx.status)) {
      const sig = tx.signedMessages?.[0]?.signature?.fullSig
      if (!sig) {
        return {
          intent,
          status: "failed",
          reason: `fireblocks tx ${txId} reached ${tx.status} but no signature in signedMessages[0]`,
          externalId: txId,
        }
      }
      return { intent, status: "approved", signature: sig, externalId: txId }
    }

    if (FB_STATUS_REJECT.has(tx.status)) {
      return {
        intent,
        status: "rejected",
        reason: `fireblocks status=${tx.status}${tx.subStatus ? ` subStatus=${tx.subStatus}` : ""}`,
        externalId: txId,
      }
    }

    if (FB_STATUS_TRANSIENT.has(tx.status)) {
      return {
        intent,
        status: "failed",
        reason: `fireblocks status=${tx.status}${tx.subStatus ? ` subStatus=${tx.subStatus}` : ""}`,
        externalId: txId,
      }
    }

    // Still in flight (SUBMITTED, QUEUED, PENDING_*, etc.) — wait.
    await sleep(FIREBLOCKS_POLL_INTERVAL_MS)
  }

  return {
    intent,
    status: "failed",
    reason: `fireblocks tx ${txId} timed out after ${timeoutMs}ms; manual check via getTransactionById may still resolve`,
    externalId: txId,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ────────────────────────────────────────────────────────────────────────
//  Cloud HSM cosign — synchronous, HSM-backed sign
// ────────────────────────────────────────────────────────────────────────

/**
 * Structured input to a CloudSigner. Symmetric to CloudSignResult so
 * callers can pipe outputs back into other signers (composition).
 */
export interface CloudSignInput {
  keyRef: string
  digest: Uint8Array
  algorithm: CosignerAlgorithm
  identityHint?: string
  /** Optional trace id, propagated to CosignerStep.external_id on failure paths. */
  requestId?: string
}

export interface CloudSignResult {
  signature: Uint8Array
  publicKeyRef: string
  provider: CloudHsmProvider
  /** Resolved key version (when distinct from publicKeyRef — Azure / GCP). */
  keyVersion?: string
  /** RFC 3339 UTC timestamp the adapter records (informational). */
  signedAt: string
}

/**
 * Trust boundary for any cloud-HSM-backed signer. One method, no state.
 * Adapters implement this per provider (gcp_kms / aws_kms /
 * azure_key_vault / vault_transit); the dispatcher picks one off the
 * intent and never sees provider-specific shapes again.
 *
 * Errors MUST be CloudSignerError instances so the dispatcher can map
 * to stable CosignResult.status without string parsing.
 */
export interface CloudSigner {
  readonly provider: CloudHsmProvider
  sign(input: CloudSignInput): Promise<CloudSignResult>
}

/**
 * Compute the digest a Cloud HSM signer attests to.
 *
 * Convention: SHA-256 over the txHash bytes (the same bytes the native
 * MPC threshold network signed). All cloud KMSs support sign-by-digest
 * mode so we pre-hash on the bridge backend rather than shipping the
 * full message — keeps the HSM call cheap and avoids transport-size
 * limits for typed-data flows.
 *
 * If txHash is already a 32-byte hash, we SHA-256 it again — a
 * "second-pre-image" attestation that says "I attest to the bytes
 * 0xabc…" not "I attest to the transaction the bytes describe."
 * Same security property; cleaner audit trail.
 */
export function cloudHsmDigest(txHash: string): Buffer {
  const cleanHex = txHash.startsWith("0x") ? txHash.slice(2) : txHash
  const raw = Buffer.from(cleanHex, "hex")
  return createHash("sha256").update(raw).digest()
}

function buildCloudSigner(intent: CloudHsmCosignerIntent): CloudSigner {
  switch (intent.provider) {
    case "gcp_kms":
      return gcpKmsSigner(intent.identity_hint)
    case "aws_kms":
      return awsKmsSigner()
    case "azure_key_vault":
      return azureKeyVaultSigner()
    case "vault_transit":
      return vaultTransitSigner()
  }
}

async function runCloudHsm(
  intent: CloudHsmCosignerIntent,
  opts: DispatchCosignersOptions,
): Promise<CosignResult> {
  const digest = cloudHsmDigest(opts.txHash)
  const signer = buildCloudSigner(intent)
  const requestId = opts.swapId

  try {
    const res = await signer.sign({
      keyRef: intent.key_ref,
      digest,
      algorithm: intent.algorithm,
      identityHint: intent.identity_hint,
      requestId,
    })
    const sigHex =
      "0x" +
      Array.from(res.signature)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
    return {
      intent,
      status: "approved",
      signature: sigHex,
      externalId: res.keyVersion ?? res.publicKeyRef,
    }
  } catch (err) {
    if (err instanceof CloudSignerError) {
      return {
        intent,
        status: statusForErrorCode(err.code),
        reason: `cloud_hsm/${intent.provider} ${err.code}: ${err.message}`,
      }
    }
    return {
      intent,
      status: "failed",
      reason: `cloud_hsm/${intent.provider}: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

// ── GCP Cloud KMS adapter ────────────────────────────────────────────────
//
// Auth: workload identity ONLY. The bridge backend trusts the cloud's
// native identity layer — Workload Identity Federation, attached SA on
// GKE / Cloud Run, GCE metadata — to provide credentials. We do NOT
// support SA-JSON-key fallback in this SDK surface; tenants that lack
// a managed identity binding should set one up before enabling
// `cloud_hsm` cosign rather than ship JSON keys through any side
// channel.
//
// `identityHint` (the SA email) is a NON-SECRET hint only. Forwarded
// to the GCP client as `projectId` derivation context; never used as
// a credential.

function gcpKmsSigner(_identityHint?: string): CloudSigner {
  const client = new KeyManagementServiceClient()

  return {
    provider: "gcp_kms",
    async sign(input: CloudSignInput): Promise<CloudSignResult> {
      if (input.algorithm !== "secp256k1_ecdsa_sha256") {
        // GCP CKMS supports EC_SIGN_SECP256K1_SHA256 as the canonical
        // EVM signing alg. Other algorithms map to other key purposes
        // (EC_SIGN_P256_SHA256, RSA_SIGN_PSS_*, etc.) and require an
        // adapter aware of digest-vs-message distinctions. Reject early.
        throw new CloudSignerError(
          "algorithm_mismatch",
          `algorithm ${input.algorithm} not yet wired for gcp_kms (only secp256k1_ecdsa_sha256)`,
        )
      }
      let response
      try {
        ;[response] = await client.asymmetricSign({
          name: input.keyRef,
          digest: { sha256: input.digest },
        })
      } catch (err) {
        throw mapGcpError(err)
      }
      if (!response.signature) {
        throw new CloudSignerError(
          "provider_unavailable",
          "GCP KMS asymmetricSign returned no signature",
        )
      }
      const sigBuf =
        typeof response.signature === "string"
          ? Buffer.from(response.signature, "base64")
          : Buffer.from(response.signature)
      return {
        signature: sigBuf,
        publicKeyRef: input.keyRef,
        provider: "gcp_kms",
        keyVersion: input.keyRef,
        signedAt: new Date().toISOString(),
      }
    },
  }
}

/**
 * Map a raw error from `@google-cloud/kms` to a CloudSignerError code.
 *
 * GCP gRPC errors carry a `code` number (Status) — we use those when
 * available, and fall back to string matching for non-gRPC transport
 * failures. The categories follow the user-facing semantics in
 * CloudSignerErrorCode docs.
 */
function mapGcpError(err: unknown): CloudSignerError {
  const e = err as { code?: number; message?: string } & Error
  const msg = e.message ?? String(err)
  // gRPC status codes per google.rpc.Code:
  //   7  PERMISSION_DENIED
  //   5  NOT_FOUND
  //   9  FAILED_PRECONDITION (key disabled, wrong purpose, etc.)
  //  16  UNAUTHENTICATED
  //   8  RESOURCE_EXHAUSTED (quota / rate limit)
  //  14  UNAVAILABLE
  //   4  DEADLINE_EXCEEDED
  if (e.code === 7 || /PERMISSION_DENIED/i.test(msg)) {
    return new CloudSignerError("permission_denied", msg, err)
  }
  if (e.code === 16 || /UNAUTHENTICATED|UNAUTHORIZED/i.test(msg)) {
    return new CloudSignerError("permission_denied", msg, err)
  }
  if (e.code === 5 || /NOT_FOUND|not found/i.test(msg)) {
    return new CloudSignerError("key_not_found", msg, err)
  }
  if (e.code === 9 || /disabled|FAILED_PRECONDITION/i.test(msg)) {
    return new CloudSignerError("key_disabled", msg, err)
  }
  if (e.code === 8 || /RESOURCE_EXHAUSTED|rate limit|too many/i.test(msg)) {
    return new CloudSignerError("rate_limited", msg, err)
  }
  if (e.code === 14 || /UNAVAILABLE|unreachable/i.test(msg)) {
    return new CloudSignerError("provider_unavailable", msg, err)
  }
  return new CloudSignerError("network_error", msg, err)
}

// ── AWS KMS adapter (stub — #386 follow-up) ──────────────────────────────
//
// pnpm add @aws-sdk/client-kms -F @luxbridge/server
//   import { KMSClient, SignCommand } from "@aws-sdk/client-kms"
//   const region = identityHint ?? keyRef.split(":")[3]
//   const client = new KMSClient({ region })  // workload identity chain
//   const cmd = new SignCommand({
//     KeyId: keyRef,
//     Message: digest,
//     MessageType: "DIGEST",
//     SigningAlgorithm: "ECDSA_SHA_256",
//   })
//   const res = await client.send(cmd)
// Error mapping (AWS): AccessDenied → permission_denied; NotFoundException →
// key_not_found; KMSInvalidStateException → key_disabled;
// ThrottlingException → rate_limited; service errors → provider_unavailable.

function awsKmsSigner(): CloudSigner {
  return {
    provider: "aws_kms",
    async sign(_input: CloudSignInput): Promise<CloudSignResult> {
      throw new CloudSignerError(
        "provider_unavailable",
        "AWS KMS cosigner not yet implemented — see issue #386. Implementation sketch in cosigners.ts.",
      )
    },
  }
}

// ── Azure Key Vault adapter (stub — #386 follow-up) ──────────────────────
//
// pnpm add @azure/keyvault-keys @azure/identity -F @luxbridge/server
//   import { CryptographyClient } from "@azure/keyvault-keys"
//   import { DefaultAzureCredential } from "@azure/identity"
//   const client = new CryptographyClient(keyRef, new DefaultAzureCredential())
//   const result = await client.sign("ES256K", input.digest)  // for secp256k1
// Error mapping (Azure): Forbidden → permission_denied; KeyNotFound →
// key_not_found; KeyDisabled → key_disabled; TooManyRequests →
// rate_limited; ServiceUnavailable → provider_unavailable.

function azureKeyVaultSigner(): CloudSigner {
  return {
    provider: "azure_key_vault",
    async sign(_input: CloudSignInput): Promise<CloudSignResult> {
      throw new CloudSignerError(
        "provider_unavailable",
        "Azure Key Vault cosigner not yet implemented — see issue #386. Implementation sketch in cosigners.ts.",
      )
    },
  }
}

// ── Vault Transit adapter (stub — #386 follow-up) ────────────────────────
//
// HashiCorp Vault's transit secret engine — POST /v1/transit/sign/{name}
// with `{ input: <base64 digest>, prehashed: true, signature_algorithm:
// "pkcs1v15"|"pss" }` for RSA, or hash_algorithm/signature_algorithm
// pair for EC. Auth via AppRole / Kubernetes / OIDC — the Vault client
// picks up VAULT_ADDR / VAULT_TOKEN or a short-lived broker token.

function vaultTransitSigner(): CloudSigner {
  return {
    provider: "vault_transit",
    async sign(_input: CloudSignInput): Promise<CloudSignResult> {
      throw new CloudSignerError(
        "provider_unavailable",
        "Vault Transit cosigner not yet implemented — see issue #386.",
      )
    },
  }
}

// ── f-chain (FHE attestation) — native Lux Network signer ────────────────
//
// f-chain is a sibling of m-chain on the Lux primary network. Where
// m-chain produces a classical threshold ECDSA signature (CGGMP21 /
// FROST), f-chain produces an FHE-secured attestation over the same
// txHash. PQ-safe by construction (lattice-based FHE).
//
// Stub for now — the actual f-chain attestation client lives in a
// sibling Lux workspace (@luxfi/fchain, planned). When that ships,
// runFChain becomes a thin wrapper around its sign API.

async function runFChain(
  intent: FChainCosignerIntent,
  opts: DispatchCosignersOptions,
): Promise<CosignResult> {
  void opts
  void intent
  return {
    intent,
    status: "failed",
    reason:
      "fchain cosigner not yet implemented — waiting on @luxfi/fchain workspace. See issue #386.",
  }
}

// ────────────────────────────────────────────────────────────────────────
//  Persistence — Prisma CosignerStep model
// ────────────────────────────────────────────────────────────────────────

/**
 * Persist the cosigner intents for a swap at create-time. One row per
 * intent, status starts at `pending`. Idempotent only at the call site
 * (handleSwapCreation runs once per POST /api/swaps); this function
 * itself is not.
 *
 * Schema notes (#386 follow-up): the existing CosignerStep columns
 * (`kind`, `public_id`, `api_host?`, `vault_id?`) cover utila and
 * fireblocks cleanly. For cloud_hsm, we encode the provider in `kind`
 * (compound: `cloud_hsm:gcp_kms`, `cloud_hsm:aws_kms`, `cloud_hsm:azure_kv`)
 * to avoid a Prisma migration round here — once the schema gains a
 * dedicated `provider` column the encoding can be split out without
 * a wire-shape change.
 */
export async function persistCosignerIntents(
  swapId: string,
  intents: CosignerIntent[],
): Promise<void> {
  if (intents.length === 0) return
  await prisma.$transaction(
    intents.map((intent) =>
      prisma.cosignerStep.create({
        data: {
          swap_id: swapId,
          ...cosignerStepFields(intent),
          status: "pending",
        },
      }),
    ),
  )
  logger.info(
    `[cosigners] persisted ${intents.length} CosignerStep row(s) for swap=${swapId}`,
  )
}

/**
 * Reduce a CosignerIntent to its CosignerStep column values. Pure
 * function so persistence + DB-row-rebuild stay symmetric.
 */
function cosignerStepFields(
  intent: CosignerIntent,
): { kind: string; public_id: string; api_host: string | null; vault_id: string | null } {
  if (intent.kind === "utila") {
    return {
      kind: "utila",
      public_id: intent.org_id,
      api_host: intent.api_host ?? null,
      vault_id: intent.vault_id ?? null,
    }
  }
  if (intent.kind === "fireblocks") {
    return {
      kind: "fireblocks",
      public_id: intent.api_key,
      api_host: intent.api_host ?? null,
      vault_id: intent.vault_account_id ?? null,
    }
  }
  if (intent.kind === "cloud_hsm") {
    // Compound `kind` carries the provider sub-discriminator without
    // requiring a Prisma schema change. `public_id` is the key_ref;
    // `api_host` overloaded as identity_hint; `vault_id` overloaded as
    // the algorithm so it round-trips on read. The first schema-
    // migration round will split these into dedicated columns.
    return {
      kind: `cloud_hsm:${intent.provider}`,
      public_id: intent.key_ref,
      api_host: intent.identity_hint ?? null,
      vault_id: intent.algorithm,
    }
  }
  // fchain
  return {
    kind: "fchain",
    public_id: intent.public_url,
    api_host: intent.scheme ?? null,
    vault_id: null,
  }
}

/** Reconstruct a CosignerIntent from a DB row. Inverse of cosignerStepFields. */
function rowToIntent(row: {
  kind: string
  public_id: string
  api_host: string | null
  vault_id: string | null
}): CosignerIntent {
  if (row.kind === "utila") {
    const intent: UtilaCosignerIntent = {
      kind: "utila",
      org_id: row.public_id,
      client_id: row.public_id, // TODO(#386): persist client_id separately;
      // for now we collapse onto public_id since the env-var fallback
      // doesn't distinguish them. KMS-real version will key off org_id.
    }
    if (row.api_host) intent.api_host = row.api_host
    if (row.vault_id) intent.vault_id = row.vault_id
    return intent
  }
  if (row.kind === "fireblocks") {
    const intent: FireblocksCosignerIntent = {
      kind: "fireblocks",
      api_key: row.public_id,
    }
    if (row.api_host) intent.api_host = row.api_host
    if (row.vault_id) intent.vault_account_id = row.vault_id
    return intent
  }
  if (row.kind.startsWith("cloud_hsm:")) {
    const provider = row.kind.slice("cloud_hsm:".length) as CloudHsmProvider
    if (!ALL_CLOUD_PROVIDERS.has(provider)) {
      throw new Error(
        `cloud_hsm row has unknown provider sub-discriminator: ${row.kind}`,
      )
    }
    if (!row.vault_id || !ALL_ALGORITHMS.has(row.vault_id as CosignerAlgorithm)) {
      throw new Error(
        `cloud_hsm row vault_id (algorithm) missing or invalid: ${row.vault_id}`,
      )
    }
    const intent: CloudHsmCosignerIntent = {
      kind: "cloud_hsm",
      provider,
      key_ref: row.public_id,
      algorithm: row.vault_id as CosignerAlgorithm,
    }
    if (row.api_host) intent.identity_hint = row.api_host
    return intent
  }
  if (row.kind === "fchain") {
    const intent: FChainCosignerIntent = {
      kind: "fchain",
      public_url: row.public_id,
    }
    if (
      row.api_host &&
      ALL_FCHAIN_SCHEMES.has(row.api_host as NonNullable<FChainCosignerIntent["scheme"]>)
    ) {
      intent.scheme = row.api_host as FChainCosignerIntent["scheme"]
    }
    return intent
  }
  throw new Error(`unknown cosigner kind in CosignerStep row: ${row.kind}`)
}

/**
 * Dispatch all pending cosigner steps for a swap. Called at the
 * post-native-sign hook in the swap state machine. Returns an aggregate
 * verdict so the caller can decide whether to advance the swap or fail it.
 *
 *   "all_approved"   — every step returned approved; safe to broadcast
 *   "any_rejected"   — at least one external denial; fail the swap with
 *                      a user-visible reason
 *   "any_failed"     — transport / config error; fail the swap and let
 *                      the operator retry
 *   "no_steps"       — no cosigners on this swap; caller proceeds as usual
 *
 * Each step's row is updated with its terminal status + signature /
 * reason / external_id so the trail is queryable post-hoc.
 */
export type CosignAggregate =
  | "all_approved"
  | "any_rejected"
  | "any_failed"
  | "no_steps"

export interface DispatchForSwapResult {
  aggregate: CosignAggregate
  results: CosignResult[]
  failingReasons: string[]
}

export async function dispatchCosignersForSwap(
  swapId: string,
  nativeSignature: string,
  txHash: string,
): Promise<DispatchForSwapResult> {
  const rows = await prisma.cosignerStep.findMany({
    where: { swap_id: swapId, status: "pending" },
    orderBy: { id: "asc" },
  })
  if (rows.length === 0) {
    return { aggregate: "no_steps", results: [], failingReasons: [] }
  }

  const intents = rows.map(rowToIntent)
  const results = await dispatchCosigners({
    swapId,
    nativeSignature,
    txHash,
    cosigners: intents,
  })

  // Persist per-step terminal state. We update rows by index since
  // dispatchCosigners preserves intent order.
  await Promise.all(
    rows.map((row, i) => {
      const r = results[i]!
      return prisma.cosignerStep.update({
        where: { id: row.id },
        data: {
          status: r.status,
          signature: r.signature ?? null,
          reason: r.reason ?? null,
          external_id: r.externalId ?? null,
        },
      })
    }),
  )

  const anyRejected = results.some((r) => r.status === "rejected")
  const anyFailed = results.some((r) => r.status === "failed")
  const failingReasons = results
    .filter((r) => r.status !== "approved" && r.reason)
    .map((r) => `${r.intent.kind}: ${r.reason!}`)

  if (anyRejected) {
    return { aggregate: "any_rejected", results, failingReasons }
  }
  if (anyFailed) {
    return { aggregate: "any_failed", results, failingReasons }
  }
  return { aggregate: "all_approved", results, failingReasons: [] }
}
