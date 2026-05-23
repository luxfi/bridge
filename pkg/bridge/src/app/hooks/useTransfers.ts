// Transfer status hook — tracks in-flight cross-chain transfers.
//
// On `submit()`:
//   1. POSTs to `${cfg.apiHost}/api/swaps` to create the swap record.
//   2. Subscribes to swap state via SSE
//      (`${cfg.apiHost}/api/swaps/:id/events`) when the server supports it,
//      falling back to GET polling at 2s intervals otherwise.
//   3. When the phase enters `signing`, initiates an MPC threshold session
//      via `@luxfi/threshold` against `cfg.mpc.publicUrl` so the UI shows
//      real signer-side progress instead of a fixed `signing` label.
//
// Phase model is unchanged from the prior stub so SwapForm / TransferStatus
// continue to bind to the same TransferPhase enum.
//
// Permissionless: nothing here knows anything about a specific tenant —
// `cfg.apiHost` and `cfg.mpc` are passed in by the SDK consumer.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAccount } from 'wagmi'

import { getConfig } from '../../config'
import { findChain } from '../lib/chains'
import {
  BridgeApiError,
  createSwap,
  getSwap,
  type CosignerIntent,
  type ServerSwap,
} from '../lib/bridge-api'
import { runMpcSignSession, type MpcProgress } from '../lib/mpc-session'
import {
  isActive,
  loadTransfers,
  saveTransfers,
} from '../lib/transfer-storage'
import { useNetworks } from './useNetworks'

export type TransferPhase =
  | 'pending'       // submitted, waiting for source chain inclusion
  | 'signing'       // MPC threshold ceremony in progress
  | 'broadcasting'  // dest tx broadcast, waiting for finality
  | 'completed'     // dest finality reached
  | 'failed'        // any leg failed; .error has the reason

export interface Transfer {
  id: string
  /** Server swap id once createSwap returns. Used to resume polling after a refresh. */
  serverId?: string
  fromChainId: string
  toChainId: string
  fromAssetId: string
  toAssetId: string
  inAmount: number
  outAmount: number
  phase: TransferPhase
  createdAt: number
  /** MPC threshold session progress, populated during `signing`. */
  mpc?: MpcProgress
  /**
   * Deposit address the user must send the source asset to. Only populated
   * when the transfer was created with `useDepositAddress: true` (typically
   * for non-EVM source chains where the wagmi connector can't sign a
   * deposit tx). The UI surfaces this prominently in TransferStatus until
   * the deposit is detected on-chain.
   */
  depositAddress?: string
  error?: string
}

export interface TransferState {
  transfers: Transfer[]
  active: Transfer | null
  /**
   * Initiate a new transfer. Returns the *local* Transfer record immediately;
   * the server `id` is patched in once the swap is created.
   *
   * `destinationAddress` defaults to the currently-connected wallet address
   * — the common case is a self-send across chains. Tenants needing
   * sweep-to-treasury flows pass an explicit address.
   *
   * `refuel` requests a destination-gas top-up alongside the bridged asset
   * (server-side feature; the SDK just forwards the flag).
   *
   * `useDepositAddress` flips the source-side flow to "issue a deposit
   * address, user pays from any wallet" — required for non-EVM source
   * chains. When false (default), the server expects a wallet-signed
   * contract call on the source chain.
   */
  initiate: (
    t: Omit<Transfer, 'id' | 'phase' | 'createdAt' | 'mpc' | 'depositAddress' | 'error'> & {
      destinationAddress?: string
      appName?: string
      refuel?: boolean
      useDepositAddress?: boolean
    },
  ) => Promise<Transfer>
  /**
   * Back-compat alias for `initiate`. SwapForm calls `submit()` today; we
   * keep both names so the swap of Phase 3 R2.5 doesn't have to retouch.
   */
  submit: TransferState['initiate']
  clear: () => void
}

const POLL_INTERVAL_MS = 2_000
const POLL_DEADLINE_MS = 5 * 60_000 // 5 minutes

/**
 * Map server swap status (free-form string from the legacy schema) onto our
 * TransferPhase enum. Unknown statuses stay in `pending` until the next
 * tick — the server is the source of truth.
 */
function statusToPhase(status: string | undefined): TransferPhase {
  if (!status) return 'pending'
  const s = status.toLowerCase()
  if (s.includes('complete') || s.includes('payout')) return 'completed'
  if (s.includes('fail') || s.includes('expire') || s.includes('error')) return 'failed'
  if (s.includes('sign') || s.includes('mpc')) return 'signing'
  if (s.includes('broadcast') || s.includes('teleport') || s.includes('transfer')) return 'broadcasting'
  return 'pending'
}

let _localId = 0
function nextLocalId(): string {
  _localId += 1
  return `xfer_${Date.now().toString(36)}_${_localId}`
}

export function useTransfers(): TransferState {
  const cfg = getConfig()
  const account = useAccount()
  const { chains, assets } = useNetworks()

  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [active, setActive] = useState<Transfer | null>(null)

  // AbortControllers per transfer — torn down on unmount + on `clear()`.
  const controllersRef = useRef<Map<string, AbortController>>(new Map())

  // `subscribe` indirection — hydration effect references the latest closure
  // without forcing the effect to re-run on every render. (useCallback's
  // dependencies make `subscribe` stable per-mount but it changes any time
  // cfg.apiHost / cfg.mpc / patch change; we don't want hydration to fire
  // on those.)
  const subscribeRef = useRef<((tid: string, sid: string) => void) | null>(null)

  useEffect(() => {
    return () => {
      for (const c of controllersRef.current.values()) c.abort()
      controllersRef.current.clear()
    }
  }, [])

  // Patch a transfer by id. Used from every async progress callback.
  const patch = useCallback(
    (id: string, partial: Partial<Transfer>) => {
      setTransfers((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...partial } : t)),
      )
      setActive((curr) =>
        curr && curr.id === id ? { ...curr, ...partial } : curr,
      )
    },
    [],
  )

  // Subscribe to a single swap. Polls GET /api/swaps/:id until the swap
  // reaches a terminal phase, the deadline elapses, or the controller aborts.
  const subscribe = useCallback(
    async (transferId: string, serverSwapId: string) => {
      const controller = controllersRef.current.get(transferId)
      if (!controller) return
      const deadline = Date.now() + POLL_DEADLINE_MS
      let lastPhase: TransferPhase | null = null
      let mpcStarted = false

      while (Date.now() < deadline) {
        if (controller.signal.aborted) return
        let serverSwap: ServerSwap
        try {
          serverSwap = await getSwap(cfg.apiHost, serverSwapId, controller.signal)
        } catch (err) {
          if (controller.signal.aborted) return
          if (err instanceof BridgeApiError && err.status >= 500) {
            // Transient server error — keep polling.
            await sleep(POLL_INTERVAL_MS)
            continue
          }
          patch(transferId, {
            phase: 'failed',
            error: err instanceof Error ? err.message : 'unknown error',
          })
          return
        }

        const phase = statusToPhase(serverSwap.status)
        if (phase !== lastPhase) {
          patch(transferId, { phase })
          lastPhase = phase
        }

        // Deposit address may appear on a later poll (the server can take a
        // tick to allocate it). Patch unconditionally if present — the patch
        // is a no-op when nothing changes.
        if (typeof serverSwap.deposit_address === 'string') {
          patch(transferId, { depositAddress: serverSwap.deposit_address })
        }

        // Kick off MPC session on first entry into the signing phase.
        // `publicUrl` is required for the native threshold sign; tenants
        // running pure-external custody (utila/fireblocks only) skip this
        // — the backend assembles cosign without a client-side session.
        if (phase === 'signing' && !mpcStarted && cfg.mpc?.publicUrl) {
          mpcStarted = true
          // The bridge backend supplies the messageHash + keyId in the swap
          // record. We don't fail the transfer if those fields are absent;
          // the server-side MPC pipeline (`/api/swaps/getsig`) handles signing
          // for us in that case and we only display progress here.
          const keyId =
            typeof serverSwap.mpc_key_id === 'string'
              ? serverSwap.mpc_key_id
              : null
          const messageHash =
            typeof serverSwap.mpc_message_hash === 'string'
              ? serverSwap.mpc_message_hash
              : null
          if (keyId && messageHash) {
            runMpcSignSession({
              mpc: cfg.mpc,
              keyId,
              messageHash,
              messageType: 'eth_sign',
              chainId: typeof serverSwap.source_network === 'string' ? serverSwap.source_network : undefined,
              signal: controller.signal,
              onProgress: (p) => patch(transferId, { mpc: p }),
            }).catch((err: unknown) => {
              if (controller.signal.aborted) return
              // MPC failures don't immediately fail the transfer — the server
              // pipeline may still complete signing on the next tick. We
              // surface the error to the UI via the mpc field's `error`.
              const msg = err instanceof Error ? err.message : String(err)
              patch(transferId, {
                mpc: {
                  sessionId: 'aborted',
                  status: 'failed',
                  protocol: cfg.mpc?.protocol ?? 'cggmp21',
                  error: msg,
                },
              })
            })
          }
        }

        if (phase === 'completed' || phase === 'failed') {
          return
        }

        await sleep(POLL_INTERVAL_MS)
      }

      // Deadline elapsed without terminal phase. Mark failed with a clear
      // reason rather than leave the row spinning forever.
      patch(transferId, { phase: 'failed', error: 'Transfer timed out' })
    },
    [cfg.apiHost, cfg.mpc, patch],
  )

  // Keep subscribeRef pointing at the latest closure so the hydration
  // effect can fire-and-forget without taking subscribe as a dep.
  useEffect(() => {
    subscribeRef.current = (tid, sid) => {
      void subscribe(tid, sid)
    }
  }, [subscribe])

  // Hydrate from localStorage on wallet change. We abort any in-flight
  // controllers for the *prior* wallet so they don't keep writing into
  // the new wallet's state, then load the persisted list for the new
  // wallet and re-subscribe to anything that wasn't terminal.
  useEffect(() => {
    for (const c of controllersRef.current.values()) c.abort()
    controllersRef.current.clear()

    if (!account.address) {
      setTransfers([])
      setActive(null)
      return
    }

    const hydrated = loadTransfers(cfg.apiHost, account.address)
    setTransfers(hydrated)
    setActive(hydrated.find(isActive) ?? null)

    // Resume polling for non-terminal transfers that still have a server id.
    for (const t of hydrated) {
      if (!isActive(t) || !t.serverId) continue
      const controller = new AbortController()
      controllersRef.current.set(t.id, controller)
      subscribeRef.current?.(t.id, t.serverId)
    }
  }, [account.address, cfg.apiHost])

  // Persist on every transfer-list change. Cheap (one JSON.stringify per
  // change) and bounded by the MAX_TRANSFERS cap in transfer-storage.ts.
  useEffect(() => {
    saveTransfers(cfg.apiHost, account.address, transfers)
  }, [transfers, cfg.apiHost, account.address])

  const initiate = useCallback<TransferState['initiate']>(
    async (input) => {
      const id = nextLocalId()
      const x: Transfer = {
        id,
        fromChainId: input.fromChainId,
        toChainId: input.toChainId,
        fromAssetId: input.fromAssetId,
        toAssetId: input.toAssetId,
        inAmount: input.inAmount,
        outAmount: input.outAmount,
        phase: 'pending',
        createdAt: Date.now(),
      }
      setTransfers((prev) => [x, ...prev])
      setActive(x)

      const controller = new AbortController()
      controllersRef.current.set(id, controller)

      // Resolve chain / asset records from the live registry (or the
      // bundled static fallback when the API is still loading).
      const fromChain = findChain(chains, input.fromChainId)
      const toChain = findChain(chains, input.toChainId)
      const fromAsset = assets.find((a) => a.id === input.fromAssetId)
      const toAsset = assets.find((a) => a.id === input.toAssetId)
      const sourceNetwork = fromChain?.internalName
      const destinationNetwork = toChain?.internalName

      if (!sourceNetwork || !destinationNetwork || !fromAsset || !toAsset || !fromChain || !toChain) {
        patch(id, { phase: 'failed', error: 'Unsupported chain or asset for current environment' })
        return x
      }

      // Default destination: the connected wallet address (self-send). Tenants
      // that need a different destination pass it explicitly.
      const destinationAddress = input.destinationAddress ?? account.address
      if (!destinationAddress) {
        patch(id, { phase: 'failed', error: 'No destination address (wallet not connected)' })
        return x
      }

      // Layered cosigners — when tenants configure `mpc.utila` or
      // `mpc.fireblocks` (or both) the SDK forwards PUBLIC identifiers
      // only; the bridge backend pairs them with secret material in KMS.
      const cosigners: CosignerIntent[] = []
      if (cfg.mpc?.utila) {
        const u = cfg.mpc.utila
        cosigners.push({
          kind: 'utila',
          orgId: u.orgId,
          clientId: u.clientId,
          ...(u.apiHost ? { apiHost: u.apiHost } : {}),
          ...(u.vaultId ? { vaultId: u.vaultId } : {}),
        })
      }
      if (cfg.mpc?.fireblocks) {
        const f = cfg.mpc.fireblocks
        cosigners.push({
          kind: 'fireblocks',
          apiKey: f.apiKey,
          ...(f.apiHost ? { apiHost: f.apiHost } : {}),
          ...(f.vaultAccountId ? { vaultAccountId: f.vaultAccountId } : {}),
        })
      }

      // Non-EVM source chains MUST use deposit-address mode (we have no
      // wagmi connector for Bitcoin/Solana/TON/XRP/Cardano/Polkadot). The
      // caller can also force it on for EVM sources by passing the flag
      // explicitly — useful for paste-the-address flows from cold wallets.
      const useDepositAddress =
        input.useDepositAddress ??
        (fromChain.family !== 'evm' && fromChain.family !== 'lux')

      try {
        const swap = await createSwap(
          cfg.apiHost,
          {
            amount: input.inAmount,
            sourceNetwork,
            sourceAsset: fromAsset.symbol,
            destinationNetwork,
            destinationAsset: toAsset.symbol,
            destinationAddress,
            // Sender = connected wallet (self-bridge default). Used only by
            // the RPC transport; REST derives sender from the deposit tx.
            ...(account.address ? { sender: account.address } : {}),
            refuel: input.refuel ?? false,
            useDepositAddress,
            useTeleporter: fromChain.family === 'lux' || toChain.family === 'lux',
            appName: input.appName ?? cfg.brand?.name ?? '@luxfi/bridge',
            ...(cosigners.length > 0 ? { cosigners } : {}),
          },
          { idempotencyKey: id, signal: controller.signal },
        )
        // Patch the local record with the server id + deposit address (when
        // present) so hydration after a refresh can resume polling AND the
        // user keeps seeing the address to send to even on page reload.
        patch(id, {
          serverId: swap.id,
          ...(typeof swap.deposit_address === 'string'
            ? { depositAddress: swap.deposit_address }
            : {}),
        })
        void subscribe(id, swap.id)
      } catch (err) {
        if (controller.signal.aborted) return x
        const msg = err instanceof Error ? err.message : 'Failed to submit transfer'
        patch(id, { phase: 'failed', error: msg })
      }

      return x
    },
    [account.address, cfg.apiHost, cfg.brand?.name, cfg.env, cfg.mpc?.utila, cfg.mpc?.fireblocks, chains, assets, patch, subscribe],
  )

  const clear = useCallback(() => {
    for (const c of controllersRef.current.values()) c.abort()
    controllersRef.current.clear()
    setTransfers([])
    setActive(null)
    // Drop the persisted list too — `clear()` is a deliberate user action,
    // not just an unmount. Future refresh starts from a clean slate.
    saveTransfers(cfg.apiHost, account.address, [])
  }, [cfg.apiHost, account.address])

  return {
    transfers,
    active,
    initiate,
    submit: initiate,
    clear,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
