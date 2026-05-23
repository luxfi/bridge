// Bridge backend API client.
//
// Two transports, one public surface:
//
//   - Direct JSON-RPC against the Lux BridgeVM (`./bridge-rpc.ts`). Used
//     when the tenant configures `BridgeConfig.rpc.bchainUrl` and the SDK
//     installs a `BridgeRPCClient` instance via `setRpcClient(...)`. This is
//     the dApp path — no centralized backend in the data flow.
//   - HTTP REST against the legacy Express bridge server at `${cfg.apiHost}`.
//     Used when no RPC client is installed, or as automatic fallback when an
//     RPC call fails / times out (configurable via `rpc.fallback`).
//
// Hooks call `fetchQuote / createSwap / getSwap` with the same signatures
// they always have. The transport choice is made here, transparently.
//
// Design rules:
//   - Errors throw `BridgeApiError` with `{ status, body }`. The caller
//     decides whether to surface to UI, retry, or swallow.
//   - PQ-safe. The wire shapes here describe *intents*; the bridge signs
//     intents via the MPC threshold network. No signing material is ever
//     transmitted from the client.

import {
  BridgeRpcError,
  type BridgeRequest,
  type BridgeRequestStatus,
  type BridgeRPCClient,
} from './bridge-rpc'

/** Errors thrown by the bridge API client. */
export class BridgeApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message)
    this.name = 'BridgeApiError'
  }
}

// ---------------------------------------------------------------------------
// RPC transport — installed by Bridge.tsx once at mount when cfg.rpc.bchainUrl
// is set. Module-level so the pure-function call sites below don't have to
// thread it as a parameter (they're called from many code paths and tests
// rely on the current shape).
// ---------------------------------------------------------------------------

let _rpcClient: BridgeRPCClient | null = null
let _rpcFallback: 'rest' | 'fail' = 'rest'

/** Install (or replace) the active BridgeRPCClient. Pass null to disable RPC. */
export function setRpcClient(
  client: BridgeRPCClient | null,
  fallback: 'rest' | 'fail' = 'rest',
): void {
  _rpcClient = client
  _rpcFallback = fallback
}

/** Currently-installed BridgeRPCClient, if any. Exported for tests + debug. */
export function getRpcClient(): BridgeRPCClient | null {
  return _rpcClient
}

/** True when the latest RPC call should be retried via REST on error. */
function shouldFallback(): boolean {
  return _rpcFallback === 'rest'
}

/**
 * Server quote response.
 *
 * Shape comes from `app/server/src/domain/quote.ts::getQuote`. The server
 * wraps the response in `{ data: { quote, refuel, reward } }` — we unwrap
 * here so callers see a flat object.
 */
export interface ServerQuote {
  receive_amount: number
  min_receive_amount: number
  blockchain_fee: number
  service_fee: number
  avg_completion_time: string
  total_fee: number
  total_fee_in_usd: number
  slippage: number
}

export interface QuoteParams {
  /** Server "internal_name" (e.g. `ETHEREUM_MAINNET`). */
  sourceNetwork: string
  /** Asset symbol (e.g. `USDC`). */
  sourceToken: string
  /** Server "internal_name" (e.g. `LUX_MAINNET`). */
  destinationNetwork: string
  destinationToken: string
  amount: number
  refuel?: boolean
  useDepositAddress?: boolean
}

/** GET `/api/quote?source_network=…` — REST transport. */
async function fetchQuoteViaRest(
  apiHost: string,
  params: QuoteParams,
  signal?: AbortSignal,
): Promise<ServerQuote> {
  const url = new URL('/api/quote', apiHost)
  url.searchParams.set('source_network', params.sourceNetwork)
  url.searchParams.set('source_token', params.sourceToken)
  url.searchParams.set('destination_network', params.destinationNetwork)
  url.searchParams.set('destination_token', params.destinationToken)
  url.searchParams.set('amount', String(params.amount))
  url.searchParams.set('refuel', String(params.refuel ? 1 : 0))
  if (params.useDepositAddress !== undefined) {
    url.searchParams.set('use_deposit_address', String(params.useDepositAddress))
  }

  const resp = await fetch(url.toString(), { signal })
  if (!resp.ok) {
    const body = await safeJson(resp)
    throw new BridgeApiError(`fetchQuote ${resp.status}`, resp.status, body)
  }
  const json = (await resp.json()) as { data?: { quote?: ServerQuote } }
  const quote = json.data?.quote
  if (!quote) {
    throw new BridgeApiError('fetchQuote: missing quote in response', 500, json)
  }
  return quote
}

/** estimateFee via BridgeVM RPC, translated into the REST ServerQuote shape. */
async function fetchQuoteViaRpc(
  client: BridgeRPCClient,
  params: QuoteParams,
  signal?: AbortSignal,
): Promise<ServerQuote> {
  const fe = await client.estimateFee(
    {
      sourceChain: params.sourceNetwork,
      destChain: params.destinationNetwork,
      sourceAsset: params.sourceToken,
      destAsset: params.destinationToken,
      amount: String(params.amount),
      refuel: params.refuel ?? false,
    },
    signal,
  )
  const receive = Number(fe.netAmount)
  const fee = Number(fe.feeAmount)
  if (!Number.isFinite(receive) || !Number.isFinite(fee)) {
    throw new BridgeApiError(
      'fetchQuote: BridgeVM returned non-numeric amounts',
      500,
      fe,
    )
  }
  return {
    receive_amount: receive,
    // BridgeVM doesn't yet report slippage; use a conservative 2.5% so the
    // UI's min-receive line shows a sane value rather than 0.
    min_receive_amount: receive * 0.975,
    blockchain_fee: 0,
    service_fee: fee,
    total_fee: fee,
    total_fee_in_usd: 0,
    avg_completion_time: formatSeconds(fe.estimatedTime),
    slippage: 0.025,
  }
}

/**
 * Quote. RPC if a BridgeRPCClient is installed, REST otherwise. RPC errors
 * fall back to REST when `fallback === 'rest'` (default).
 */
export async function fetchQuote(
  apiHost: string,
  params: QuoteParams,
  signal?: AbortSignal,
): Promise<ServerQuote> {
  if (_rpcClient) {
    try {
      return await fetchQuoteViaRpc(_rpcClient, params, signal)
    } catch (err) {
      if (!shouldFallback() || isAbort(err)) throw err
      // Silent in production builds; visible in dev so the fallback is obvious.
      if (typeof console !== 'undefined') {
        console.warn('[bridge] RPC quote failed, falling back to REST:', err)
      }
    }
  }
  return fetchQuoteViaRest(apiHost, params, signal)
}

/**
 * Optional layered-cosigner intent.
 *
 * The SDK forwards PUBLIC identifiers only — `orgId`, `clientId`, `apiKey`,
 * vault ids. The bridge backend uses these to look up the corresponding
 * secret half from KMS and complete the cosign on behalf of the tenant.
 * No secret material ever leaves the browser bundle.
 */
export type CosignerIntent =
  | {
      kind: 'utila'
      orgId: string
      clientId: string
      apiHost?: string
      vaultId?: string
    }
  | {
      kind: 'fireblocks'
      apiKey: string
      apiHost?: string
      vaultAccountId?: string
    }

/** POST `/api/swaps` payload (also used as input to the RPC submitBridgeRequest). */
export interface CreateSwapParams {
  amount: number
  sourceNetwork: string
  sourceAsset: string
  destinationNetwork: string
  destinationAsset: string
  destinationAddress: string
  /**
   * Sender address. Used by the RPC transport only — the REST backend
   * derives the sender from the connecting wallet via signed deposit.
   * Defaults to `destinationAddress` (typical self-bridge case).
   */
  sender?: string
  refuel?: boolean
  useDepositAddress: boolean
  useTeleporter: boolean
  appName: string
  /**
   * Optional layered cosigners. When non-empty, the bridge backend
   * enforces (native MPC sign) AND (every listed cosigner approves)
   * before releasing settlement.
   */
  cosigners?: CosignerIntent[]
}

/** Server swap envelope (loose shape — wraps the underlying swap record). */
export interface ServerSwap {
  id: string
  status?: string
  source_network?: string
  destination_network?: string
  /**
   * Deposit address the user must send funds to. Populated by the server
   * when the swap was created with `useDepositAddress: true` (required for
   * non-EVM source chains where the user can't sign a contract call from
   * the connected wagmi wallet). Field name is snake_case to match the
   * server's wire format.
   */
  deposit_address?: string
  [k: string]: unknown
}

/** POST `/api/swaps` — REST transport. */
async function createSwapViaRest(
  apiHost: string,
  params: CreateSwapParams,
  opts: { idempotencyKey?: string; signal?: AbortSignal } = {},
): Promise<ServerSwap> {
  const url = new URL('/api/swaps', apiHost)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey

  const resp = await fetch(url.toString(), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      amount: params.amount,
      source_network: params.sourceNetwork,
      source_asset: params.sourceAsset,
      destination_network: params.destinationNetwork,
      destination_asset: params.destinationAsset,
      destination_address: params.destinationAddress,
      refuel: params.refuel ?? false,
      use_deposit_address: params.useDepositAddress,
      use_teleporter: params.useTeleporter,
      app_name: params.appName,
      ...(params.cosigners && params.cosigners.length > 0
        ? { cosigners: params.cosigners.map(serializeCosigner) }
        : {}),
    }),
    signal: opts.signal,
  })

  if (!resp.ok) {
    const body = await safeJson(resp)
    throw new BridgeApiError(`createSwap ${resp.status}`, resp.status, body)
  }
  const json = (await resp.json()) as { data?: ServerSwap }
  const swap = json.data
  if (!swap || !swap.id) {
    throw new BridgeApiError('createSwap: missing swap.id in response', 500, json)
  }
  return swap
}

/** submitBridgeRequest via BridgeVM RPC, translated into the REST ServerSwap shape. */
async function createSwapViaRpc(
  client: BridgeRPCClient,
  params: CreateSwapParams,
  signal?: AbortSignal,
): Promise<ServerSwap> {
  const req = await client.submitBridgeRequest(
    {
      sourceChain: params.sourceNetwork,
      destChain: params.destinationNetwork,
      sourceAsset: params.sourceAsset,
      destAsset: params.destinationAsset,
      amount: String(params.amount),
      recipient: params.destinationAddress,
      sender: params.sender ?? params.destinationAddress,
      refuel: params.refuel ?? false,
    },
    signal,
  )
  return bridgeRequestToServerSwap(req)
}

/**
 * Create swap. RPC first when available; REST fallback on failure.
 * (Cosigner block isn't yet plumbed into BridgeVM RPC — when cosigners are
 * configured we use REST unconditionally to ensure the backend's cosigner
 * pipeline fires.)
 */
export async function createSwap(
  apiHost: string,
  params: CreateSwapParams,
  opts: { idempotencyKey?: string; signal?: AbortSignal } = {},
): Promise<ServerSwap> {
  const hasCosigners = params.cosigners && params.cosigners.length > 0
  if (_rpcClient && !hasCosigners) {
    try {
      return await createSwapViaRpc(_rpcClient, params, opts.signal)
    } catch (err) {
      if (!shouldFallback() || isAbort(err)) throw err
      if (typeof console !== 'undefined') {
        console.warn('[bridge] RPC submitBridgeRequest failed, falling back to REST:', err)
      }
    }
  }
  return createSwapViaRest(apiHost, params, opts)
}

/** GET `/api/swaps/:id` — REST transport. */
async function getSwapViaRest(
  apiHost: string,
  swapId: string,
  signal?: AbortSignal,
): Promise<ServerSwap> {
  const url = new URL(`/api/swaps/${encodeURIComponent(swapId)}`, apiHost)
  const resp = await fetch(url.toString(), { signal })
  if (!resp.ok) {
    const body = await safeJson(resp)
    throw new BridgeApiError(`getSwap ${resp.status}`, resp.status, body)
  }
  const json = (await resp.json()) as { data?: ServerSwap }
  if (!json.data) {
    throw new BridgeApiError('getSwap: missing data in response', 500, json)
  }
  return json.data
}

/** getBridgeStatus via BridgeVM RPC, translated into ServerSwap. */
async function getSwapViaRpc(
  client: BridgeRPCClient,
  swapId: string,
  signal?: AbortSignal,
): Promise<ServerSwap> {
  const req = await client.getBridgeStatus(swapId, signal)
  return bridgeRequestToServerSwap(req)
}

/** Status read. RPC first when available; REST fallback on failure. */
export async function getSwap(
  apiHost: string,
  swapId: string,
  signal?: AbortSignal,
): Promise<ServerSwap> {
  if (_rpcClient) {
    try {
      return await getSwapViaRpc(_rpcClient, swapId, signal)
    } catch (err) {
      if (!shouldFallback() || isAbort(err)) throw err
      if (typeof console !== 'undefined') {
        console.warn('[bridge] RPC getBridgeStatus failed, falling back to REST:', err)
      }
    }
  }
  return getSwapViaRest(apiHost, swapId, signal)
}

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

/** Map a BridgeVM BridgeRequest to the legacy ServerSwap shape the UI consumes. */
function bridgeRequestToServerSwap(req: BridgeRequest): ServerSwap {
  return {
    id: req.requestId,
    status: bridgeStatusToServerStatus(req.status),
    source_network: req.sourceChain,
    destination_network: req.destChain,
    // BridgeVM's submitBridgeRequest doesn't currently return a deposit
    // address — that's a REST-backend concept for non-EVM sources. When
    // both transports are in play, the REST path supplies this field.
  }
}

/**
 * Map BridgeVM's BridgeRequestStatus to a status string that flows through
 * `useTransfers::statusToPhase`. We pick canonical legacy strings that the
 * existing phase-mapper already understands ("completed", "fail", "signing",
 * "broadcasting", "pending").
 */
function bridgeStatusToServerStatus(status: BridgeRequestStatus): string {
  switch (status) {
    case 'pending':
    case 'deposited':
      return 'user_transfer_pending'
    case 'signing':
    case 'signed':
      return 'bridge_transfer_pending_signing'
    case 'releasing':
      return 'bridge_transfer_pending_broadcasting'
    case 'completed':
      return 'completed'
    case 'failed':
      return 'failed'
    case 'cancelled':
      return 'cancelled'
  }
}

/** Format `seconds` as `HH:MM:SS` (matches server's `avg_completion_time`). */
function formatSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '00:01:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

/** True when an error is an AbortError (don't retry aborted requests). */
function isAbort(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true
  if (err instanceof BridgeRpcError && err.message.includes('aborted')) return true
  if (err instanceof Error && err.name === 'AbortError') return true
  return false
}

async function safeJson(resp: Response): Promise<unknown> {
  try {
    return await resp.json()
  } catch {
    return await resp.text().catch(() => null)
  }
}

function serializeCosigner(c: CosignerIntent): Record<string, unknown> {
  if (c.kind === 'utila') {
    return {
      kind: 'utila',
      org_id: c.orgId,
      client_id: c.clientId,
      ...(c.apiHost ? { api_host: c.apiHost } : {}),
      ...(c.vaultId ? { vault_id: c.vaultId } : {}),
    }
  }
  return {
    kind: 'fireblocks',
    api_key: c.apiKey,
    ...(c.apiHost ? { api_host: c.apiHost } : {}),
    ...(c.vaultAccountId ? { vault_account_id: c.vaultAccountId } : {}),
  }
}

/**
 * Map a bridge-internal chain ID (`evm:1`, `lux:96369`) to the server's
 * "internal_name" (`ETHEREUM_MAINNET`, `LUX_MAINNET`).
 *
 * This is the boundary between SDK-side stable IDs and the server's enum.
 * Unknown IDs return null; callers surface a UI error rather than guessing.
 */
const CHAIN_ID_TO_INTERNAL_NAME: Record<string, string> = {
  'evm:1': 'ETHEREUM_MAINNET',
  'evm:42161': 'ARBITRUM_MAINNET',
  'evm:8453': 'BASE_MAINNET',
  'evm:137': 'POLYGON_MAINNET',
  'evm:10': 'OPTIMISM_MAINNET',
  'lux:96369': 'LUX_MAINNET',
  'svm:101': 'SOLANA_MAINNET',
}

export function chainIdToInternalName(chainId: string, env: string): string | null {
  const base = CHAIN_ID_TO_INTERNAL_NAME[chainId]
  if (!base) return null
  // Suffix swap for testnet/devnet — server uses `*_TESTNET` / `*_DEVNET`.
  if (env === 'testnet') return base.replace('_MAINNET', '_TESTNET')
  if (env === 'devnet') return base.replace('_MAINNET', '_DEVNET')
  return base
}
