// MPC threshold session helper.
//
// Bridges the bridge UI to the `@luxfi/threshold` SDK so the `signing` phase
// of a transfer can surface real progress to the user instead of a setTimeout
// placeholder.
//
// Trust model:
//   - The client *initiates* a sign session; the actual sign rounds happen on
//     the T-Chain (ThresholdVM) cluster operated by the MPC validator set.
//   - No private-key material is ever generated, held, or transmitted on the
//     client. Key shares live on the MPC nodes; threshold-t signers
//     collaborate to produce a single ECDSA/EdDSA/lattice signature.
//   - Protocol selection respects `BridgeMPCConfig.protocol` when present.
//     Default is `cggmp21` (secp256k1, EVM-compatible). Post-quantum
//     variants (`pulsar`, `corona`, `magnetar`) plug in via the same RPC
//     surface — the SDK is protocol-agnostic.

import { ThresholdClient } from '@luxfi/threshold'
import type {
  Protocol,
  SignResponse,
  SignatureResponse,
} from '@luxfi/threshold'

import type { BridgeMPCConfig } from '../../types'

/** Bridge-side view of MPC progress for the UI. */
export interface MpcProgress {
  /** Threshold session id (returned by `threshold_sign`). */
  sessionId: string
  /** Current session status as the T-Chain reports it. */
  status: SignResponse['status'] | SignatureResponse['status']
  /** Protocol the session was created with (resolved at runtime). */
  protocol: Protocol
  /** Completed signature hex, when status === `completed`. */
  signature?: string
  /** Final-state error (failed only). */
  error?: string
}

export interface MpcSessionOptions {
  /** MPC cluster config from the bridge SDK config. */
  mpc: BridgeMPCConfig
  /** Key id to sign with (per-user, derived during onboarding). */
  keyId: string
  /** Message hash to sign (hex). */
  messageHash: string
  /** Message type hint for EVM compatibility. */
  messageType?: 'raw' | 'eth_sign' | 'typed_data'
  /** Optional requesting chain id for quota accounting. */
  chainId?: string
  /** Per-tick progress callback. Called on every status change. */
  onProgress?: (p: MpcProgress) => void
  /** AbortSignal — cancels polling, does *not* cancel the MPC session itself. */
  signal?: AbortSignal
  /** Hard timeout in ms (default 60_000). */
  timeoutMs?: number
}

/**
 * Start a threshold-sign session and report progress until it terminates.
 *
 * Returns the final progress record (status === `completed` | `failed`).
 * Throws only on transport failure or abort; signing failures are surfaced
 * via `progress.status === 'failed'`.
 *
 * The function polls `getSignature(sessionId)` at 250ms intervals until the
 * session reaches a terminal state or the timeout fires. Cancellation via
 * `signal` aborts the *polling* loop — the underlying MPC session keeps
 * running on T-Chain (so a refresh can rejoin it).
 */
export async function runMpcSignSession(
  opts: MpcSessionOptions,
): Promise<MpcProgress> {
  const protocol: Protocol = opts.mpc.protocol ?? 'cggmp21'
  // `publicUrl` is optional on BridgeMPCConfig to support pure-external
  // custody (utila/fireblocks only, no native threshold). The native MPC
  // sign session can only run when publicUrl is provided.
  if (!opts.mpc.publicUrl) {
    throw new Error(
      'runMpcSignSession requires mpc.publicUrl; pure-external custody flows must skip the native sign step',
    )
  }
  const client = new ThresholdClient({
    endpoint: opts.mpc.publicUrl,
    ...(opts.chainId ? { chainId: opts.chainId } : {}),
  })

  // 1. Initiate sign.
  const session = await client.sign({
    keyId: opts.keyId,
    messageHash: opts.messageHash,
    messageType: opts.messageType ?? 'raw',
  })

  let progress: MpcProgress = {
    sessionId: session.sessionId,
    status: session.status,
    protocol,
  }
  opts.onProgress?.(progress)

  // 2. Poll for completion.
  const deadline = Date.now() + (opts.timeoutMs ?? 60_000)
  const pollIntervalMs = 250

  while (Date.now() < deadline) {
    if (opts.signal?.aborted) {
      throw new DOMException('MPC session polling aborted', 'AbortError')
    }

    let next: SignatureResponse
    try {
      next = await client.getSignature(session.sessionId)
    } catch (err) {
      // Transient transport errors — surface to onProgress and keep polling
      // until the deadline. This is the right behavior because the MPC
      // session itself is durable on T-Chain.
      const error = err instanceof Error ? err.message : String(err)
      progress = { ...progress, error }
      opts.onProgress?.(progress)
      await sleep(pollIntervalMs)
      continue
    }

    if (next.status !== progress.status) {
      progress = {
        sessionId: session.sessionId,
        status: next.status,
        protocol,
        ...(next.signature ? { signature: next.signature } : {}),
        ...(next.error ? { error: next.error } : {}),
      }
      opts.onProgress?.(progress)
    }

    if (next.status === 'completed' || next.status === 'failed') {
      return progress
    }

    await sleep(pollIntervalMs)
  }

  throw new DOMException('MPC session polling timed out', 'TimeoutError')
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
