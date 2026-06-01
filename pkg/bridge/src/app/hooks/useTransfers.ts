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
import { erc20Abi, parseEther, parseUnits } from 'viem'
import {
  useAccount,
  useSendTransaction,
  useSwitchChain,
  useWriteContract,
} from 'wagmi'

import { getConfig } from '../../config'
import { type Asset } from '../lib/assets'
import { type Chain, findChain } from '../lib/chains'
import { useSolanaSend } from '../lib/wallet-adapters'
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
  | 'refunding'     // dest broadcast couldn't land (insufficient funds, etc.)
                    // — refund driver is sweeping deposit back to sender
  | 'refunded'      // refund landed; sender got source-chain funds back
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
  /**
   * Terminal failure reason — set together with `phase: 'failed'`.
   * Distinct from `lastError`: `error` means the swap is dead, `lastError`
   * means the swap is still retrying but currently blocked.
   */
  error?: string
  /**
   * Most-recent transient driver error from the bridge — typically a
   * human-readable label like "Insufficient funds in release address".
   * The swap is still progressing; the bridge will retry. The UI
   * surfaces this so the user knows what's blocking before the SPA's
   * 5-minute deadline elapses. Cleared automatically when the server's
   * `last_error` field disappears (i.e. the underlying issue
   * resolved — usually because the user funded the address).
   */
  lastError?: string
  /**
   * Source-chain transaction hash of the refund sweep, populated by
   * the bridge's refund driver once it lands. Together with
   * phase === 'refunded' this lets the UI deep-link to the explorer
   * tx where the user received their source-chain funds back.
   */
  refundTxHash?: string
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
  // Refund phases first — "refunded" must beat "completed"'s loose
  // heuristic; "refunding" must beat broadcasting/transfer.
  if (s === 'refunded') return 'refunded'
  if (s.startsWith('refund')) return 'refunding'
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
  // EVM auto-deposit hooks. When the source chain is EVM and the user
  // has a wagmi-connected wallet, we'd rather pop MetaMask after
  // createSwap returns than make the user copy the deposit address by
  // hand. switchChainAsync resolves "wrong network" mismatches first;
  // sendTransactionAsync handles native transfers (ETH / LUX / BNB);
  // writeContractAsync handles ERC-20 transfers (USDC / USDT / DAI).
  // All three throw cleanly on user reject — tryAutoDeposit catches
  // and returns {ok: false} so the caller can mark the transfer
  // 'failed' instead of leaving it spinning.
  const { sendTransactionAsync } = useSendTransaction()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  // Solana auto-deposit hook. When the source chain is family='svm' and
  // the user has Phantom (or any Wallet Standard-compatible Solana
  // wallet) connected, this builds + sends a SystemProgram.transfer to
  // the MPC deposit address. Stays a no-op for non-svm sources — see
  // tryAutoDeposit for the family branch.
  const { sendSolAsync, senderAddress: solSenderAddress } = useSolanaSend()
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

        // Mirror server-side LastError to the local Transfer.lastError so
        // the UI can render the underlying blocker (e.g. "Insufficient
        // funds in release address") instead of waiting on the 5-minute
        // SPA deadline. Empty/missing on the wire → clear locally so the
        // banner disappears as soon as the bridge's next retry succeeds.
        const wireLastErr =
          typeof serverSwap.last_error === 'string' ? serverSwap.last_error : ''
        patch(transferId, { lastError: wireLastErr || undefined })

        // Refund tx hash appears together with phase=refunded — the
        // refund driver lands the source-chain sweep, then patches
        // both fields atomically server-side. Mirror it so the UI can
        // link to the explorer.
        if (typeof serverSwap.refund_tx_hash === 'string' && serverSwap.refund_tx_hash) {
          patch(transferId, { refundTxHash: serverSwap.refund_tx_hash })
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

        // Terminal phases — stop polling. `refunded` is terminal too:
        // the bridge has swept the source-chain deposit back to the
        // sender and the swap will never advance further.
        if (phase === 'completed' || phase === 'failed' || phase === 'refunded') {
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

      // Every source uses the MPC-derived deposit address. The server's
      // createMPCWalletForDeposit() returns a chain-appropriate address
      // (ETH for EVM, BTC for Bitcoin, SOL for Solana, etc.) via a single
      // MPC keygen, so we don't need a wagmi writeContract path or
      // teleporter-contract dispatch on the client. Callers can still pass
      // `useDepositAddress: false` to opt back into the legacy teleporter
      // flow on EVM sources, but the SDK default is the MPC flow.
      const useDepositAddress = input.useDepositAddress ?? true

      // Resolve the source-chain sender at the moment of createSwap.
      //
      // For svm sources we prefer the hook-tracked solSenderAddress
      // (subscribed to Phantom's connect/disconnect events), but fall
      // back to reading window.phantom.solana.publicKey inline. The
      // inline read defends against two edge cases the hook can miss:
      //   (a) the user is on cached React state — useSolanaSend hasn't
      //       re-rendered with the latest phantom event yet;
      //   (b) the user connected via Wallet Standard direct (path 2),
      //       where window.phantom.solana exists but never emitted a
      //       'connect' event on its own surface (the wallet-standard
      //       feature fires its own callback instead).
      // Either way the fresh window read at this exact instant is the
      // ground truth, so use it as the final fallback.
      let sourceSender: string | undefined
      if (fromChain.family === 'svm') {
        // Inline window read as a final fallback for late-binding or
        // Wallet-Standard-direct connects that don't emit a 'connect'
        // event on window.phantom.solana's own surface. The hook
        // subscribes to those events but the inline read is always
        // ground truth at this exact instant.
        const phantomPk =
          typeof window !== 'undefined'
            ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (window as any).phantom?.solana?.publicKey?.toString?.()
            : undefined
        sourceSender = solSenderAddress ?? phantomPk ?? undefined
      } else {
        sourceSender = account.address ?? undefined
      }

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
            // Sender = the connected wallet on the SOURCE chain. The
            // backend's refund driver sends source funds back to this
            // address when a swap fails, so it MUST be a same-family
            // address: base58 for svm sources, 0x… for evm/lux sources.
            // Falling back to account.address (always EVM via wagmi)
            // for an svm source bricks refunds with
            // "preSign Solana refund: invalid base58 character '0'".
            ...(sourceSender ? { sender: sourceSender } : {}),
            refuel: input.refuel ?? false,
            useDepositAddress,
            // MPC pipeline handles cross-chain delivery end-to-end —
            // teleport-processor.ts (background loop watching teleporter
            // contracts) is no longer on our happy path.
            useTeleporter: false,
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
        // EVM auto-deposit. Native + ERC-20 paths both pop the wallet.
        // Non-EVM sources return null (no wagmi path), keeping the
        // manual-deposit fallback. On user reject the helper returns
        // {ok: false, error} so we mark the transfer 'failed' rather
        // than letting it spin until the SPA-side 5min timer expires.
        const dep = await tryAutoDeposit({
          swap,
          fromChain,
          fromAsset,
          inAmount: input.inAmount,
          switchChainAsync,
          sendTransactionAsync,
          writeContractAsync,
          sendSolAsync,
        })
        if (dep && !dep.ok) {
          // Local 'failed' is the source of truth here — server-side
          // the swap is still pending (no deposit detected yet). Don't
          // subscribe, otherwise the poll would overwrite phase back to
          // 'pending' on the next tick.
          patch(id, { phase: 'failed', error: dep.error })
        } else {
          void subscribe(id, swap.id)
        }
      } catch (err) {
        if (controller.signal.aborted) return x
        const msg = err instanceof Error ? err.message : 'Failed to submit transfer'
        patch(id, { phase: 'failed', error: msg })
      }

      return x
    },
    [
      account.address,
      cfg.apiHost,
      cfg.brand?.name,
      cfg.env,
      cfg.mpc?.utila,
      cfg.mpc?.fireblocks,
      chains,
      assets,
      patch,
      subscribe,
      switchChainAsync,
      sendTransactionAsync,
      writeContractAsync,
      sendSolAsync,
      solSenderAddress,
    ],
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

/**
 * Parse the deposit_address envelope returned by createSwap. Format is
 * `walletId###<chain-native-address>` for MPC-derived addresses; we
 * only care about the trailing chain address. Returns null when the
 * envelope is missing or malformed.
 */
function extractDepositAddress(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null
  const i = raw.lastIndexOf('###')
  const addr = i >= 0 ? raw.slice(i + 3) : raw
  return addr || null
}

/**
 * Result of tryAutoDeposit.
 *
 *   null            — didn't attempt (non-EVM source, missing fields,
 *                     bad envelope). The caller leaves the transfer
 *                     in 'pending' so the watcher can still pick up a
 *                     manual deposit if the user sends from a separate
 *                     wallet.
 *   {ok: true}      — wallet confirmed; tx is on-chain or in mempool.
 *                     The deposit watcher will advance state shortly.
 *   {ok: false, …}  — user rejected, wallet errored, or chain switch
 *                     was refused. The caller marks the transfer
 *                     'failed' so the UI doesn't spin until the SPA's
 *                     5-min deadline elapses.
 */
type AutoDepositResult =
  | null
  | { ok: true; hash: string }
  | { ok: false; error: string }

/**
 * Auto-deposit dispatcher. Pops the user's wallet so the deposit
 * confirms with one click instead of a copy-paste address.
 *
 * Family routing:
 *   - 'evm' / 'lux' → wagmi sendTransaction (native) or writeContract
 *     (ERC-20). Lux is wagmi-flavoured because the wallet leg is EVM
 *     even though the chain family is tagged separately.
 *   - 'svm' → @solana/wallet-adapter sendTransaction (Phantom + any
 *     other Wallet Standard wallet). SPL tokens not yet wired —
 *     fromAsset.contractAddress set on a SOL chain returns null.
 *   - other (btc / ton / xrp / cardano) → null. Those families don't
 *     have a wagmi-equivalent in this codebase yet, so the user
 *     copy-pastes the deposit address into the wallet themselves.
 *
 * Null is "didn't attempt" — the manual-deposit fallback in
 * TransferStatus picks up. {ok:false} is "tried and the user
 * rejected" — the caller marks the transfer 'failed' so the UI
 * doesn't spin until the SPA-side timer fires.
 */
async function tryAutoDeposit(args: {
  swap: ServerSwap
  fromChain: Chain
  fromAsset: Asset
  inAmount: number
  switchChainAsync: (args: { chainId: number }) => Promise<unknown>
  sendTransactionAsync: (args: {
    to: `0x${string}`
    value: bigint
    chainId?: number
  }) => Promise<`0x${string}`>
  writeContractAsync: (args: {
    address: `0x${string}`
    abi: typeof erc20Abi
    functionName: 'transfer'
    args: readonly [`0x${string}`, bigint]
    chainId?: number
  }) => Promise<`0x${string}`>
  sendSolAsync: (args: { to: string; sol: number }) => Promise<string>
}): Promise<AutoDepositResult> {
  const {
    swap, fromChain, fromAsset, inAmount,
    switchChainAsync, sendTransactionAsync, writeContractAsync, sendSolAsync,
  } = args

  // Solana branch — SOL-source swaps. Pop Phantom / any Wallet Standard
  // wallet with SystemProgram.transfer to the base58 deposit address.
  // SPL tokens are out of scope: the assembler / signing driver only
  // handle native SOL today (see internal/txassembler/solana.go's
  // explicit reject). If the asset has a contract, fall through to null
  // so the user lands on manual deposit instead of getting a wrong-tx
  // popup.
  if (fromChain.family === 'svm') {
    if (fromAsset.contractAddress) return null
    const onchainAddr = extractDepositAddress(swap.deposit_address)
    if (!onchainAddr) return null
    // Reject Solana addresses that wouldn't parse as base58. Strict-er
    // than necessary (PublicKey.fromBase58 does its own validation) but
    // gives a clearer error than "Invalid public key input".
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(onchainAddr)) return null
    try {
      const sig = await sendSolAsync({ to: onchainAddr, sol: inAmount })
      return { ok: true, hash: sig }
    } catch (err) {
      return { ok: false, error: humanizeWalletError(err, 'Wallet rejected') }
    }
  }

  // EVM / Lux branch — Lux's wallet leg is EVM-compatible (Avalanche
  // C-Chain fork), so the same wagmi sendTransaction / writeContract
  // path works. Other non-EVM families (btc / ton / xrp / cardano) bail
  // to manual deposit since the user wallet can't sign those here.
  if (fromChain.family !== 'evm' && fromChain.family !== 'lux') return null
  if (!fromChain.evmChainId) return null

  const onchainAddr = extractDepositAddress(swap.deposit_address)
  if (!onchainAddr || !/^0x[0-9a-fA-F]{40}$/.test(onchainAddr)) return null

  const isERC20 = Boolean(fromAsset.contractAddress)

  let amountUnits: bigint
  try {
    amountUnits = isERC20
      ? parseUnits(String(inAmount), fromAsset.decimals ?? 18)
      : parseEther(String(inAmount))
  } catch {
    return null
  }

  try {
    await switchChainAsync({ chainId: fromChain.evmChainId })
  } catch (err) {
    return { ok: false, error: humanizeWalletError(err, 'Network switch rejected') }
  }

  try {
    let hash: `0x${string}`
    if (isERC20 && fromAsset.contractAddress) {
      hash = await writeContractAsync({
        address: fromAsset.contractAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [onchainAddr as `0x${string}`, amountUnits],
        chainId: fromChain.evmChainId,
      })
    } else {
      hash = await sendTransactionAsync({
        to: onchainAddr as `0x${string}`,
        value: amountUnits,
        chainId: fromChain.evmChainId,
      })
    }
    return { ok: true, hash }
  } catch (err) {
    return { ok: false, error: humanizeWalletError(err, 'Wallet rejected') }
  }
}

/**
 * Convert wagmi / viem error shapes into a short user-readable string.
 * Wallet libraries commonly throw with messages like
 *   "User rejected the request." (rabby / metamask),
 *   "User denied transaction signature" (older metamask),
 *   "User cancelled" (ledger live connector),
 * plus EIP-1193 4001 (UserRejectedRequestError) — collapse all of
 * them to a single "Wallet rejected" surface and leave the original
 * message attached for diagnostics.
 */
function humanizeWalletError(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (
    /reject|deny|cancel|4001/i.test(msg) ||
    (err as { name?: string })?.name === 'UserRejectedRequestError'
  ) {
    return 'Wallet rejected'
  }
  return `${fallback}: ${truncate(msg, 120)}`
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n) + '…'
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
