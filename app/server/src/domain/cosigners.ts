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

import logger from "@/logger"

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

export type CosignerIntent = UtilaCosignerIntent | FireblocksCosignerIntent

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
  const secret = await fetchCosignerSecret(intent)
  if (intent.kind === "utila") {
    return runUtila(intent, secret, opts)
  }
  return runFireblocks(intent, secret, opts)
}

// ────────────────────────────────────────────────────────────────────────
//  Utila cosign — uses @luxfi/utila Connect-RPC client
// ────────────────────────────────────────────────────────────────────────

async function runUtila(
  intent: UtilaCosignerIntent,
  _serviceAccountPem: string,
  _opts: DispatchCosignersOptions,
): Promise<CosignResult> {
  // TODO(#386):
  //   1. Build a `@luxfi/utila` gRPC client using `serviceAccountAuthStrategy`
  //      with { email: derived from intent.client_id, privateKey: _serviceAccountPem }.
  //      DO NOT reuse the singleton in `domain/utila.ts` — that's the
  //      primary-signer client, scoped to env vars. This is a per-tenant client.
  //   2. Submit a transaction-approval request against intent.vault_id (or the
  //      default vault if unset) referencing _opts.txHash and _opts.nativeSignature.
  //   3. Poll the approval status (or wait on Utila's webhook — domain/utila.ts
  //      already verifies Utila webhook signatures; reuse `utilaPublicKey` +
  //      `verifySignature` from there).
  //   4. Return CosignResult with status approved/rejected/failed + signature
  //      (Utila's tx hash on its side) + externalId (Utila's request id).
  logger.warn(
    `[cosigners.utila] STUB — would cosign swap via org=${intent.org_id} client=${intent.client_id} vault=${intent.vault_id ?? "(default)"}`,
  )
  return {
    intent,
    status: "failed",
    reason: "Utila cosigner not implemented yet — see issue #386",
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
