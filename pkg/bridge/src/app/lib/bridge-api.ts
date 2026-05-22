// Bridge backend API client.
//
// Wraps the Express bridge server exposed at `${cfg.apiHost}`. Endpoint paths
// mirror the server's `/api/*` routes (see `app/server/src/server.ts`).
//
// Design rules:
//   - Pure functions, no React. The hooks call this layer; the layer never
//     calls React. That keeps testing trivial (fetch-mock against pure
//     functions, no need for renderHook plumbing).
//   - Errors throw `BridgeApiError` with `{ status, body }`. The caller
//     decides whether to surface to UI, retry, or swallow.
//   - No global state. Each function receives `apiHost`.
//   - PQ-safe. The wire shapes here describe *intents*; the server signs
//     intents via the MPC threshold network. No signing material is ever
//     transmitted from the client.

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

/** GET `/api/quote?source_network=…` */
export async function fetchQuote(
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

/** POST `/api/swaps` payload. */
export interface CreateSwapParams {
  amount: number
  sourceNetwork: string
  sourceAsset: string
  destinationNetwork: string
  destinationAsset: string
  destinationAddress: string
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
  [k: string]: unknown
}

/** POST `/api/swaps` */
export async function createSwap(
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

/** GET `/api/swaps/:id` */
export async function getSwap(
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
