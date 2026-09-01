// BridgeRPCClient — JSON-RPC client for the Lux BridgeVM (b-chain).
//
// Direct, decentralized path: instead of the legacy Express REST backend at
// bridge-api.lux.network, this talks straight to the Lux node's BridgeVM
// JSON-RPC interface at `${nodeUrl}/v1/chain/B/rpc`. MPC signing rounds run
// through the matching ThresholdVM interface (`/v1/chain/T/rpc`), handled by
// `@luxfi/threshold` (see lib/mpc-session.ts).
//
// This file is a focused port of the original 1227-line client at
// `origin/swarm/phase1.5-inline-ui:app/bridge/src/lib/BridgeRPCClient.ts`
// (deleted from main during the Phase 2 collapse). It restores only the
// methods the inlined bridge UI actually drives (quote / create swap / poll
// status / supported chains / MPC info). The remainder of the original
// surface — campaigns, leaderboards, validator ops, signer-set management —
// can be cherry-picked back if those flows reappear in the UI.
//
// Trust model: the JSON-RPC node is treated as untrusted transport. The
// authoritative settlement decisions (min_receive_amount, signature
// validity) are enforced by the MPC threshold quorum, not by anything in
// this file. Permissionless: any consumer can point at any BridgeVM node;
// there is no central authority on the wire protocol.

// =============================================================================
// JSON-RPC envelope
// =============================================================================

/**
 * Per-process JSON-RPC request id. Monotonic + random suffix so concurrent
 * tabs don't collide if the node logs are correlated. Doesn't need to be
 * cryptographically random — the node uses it only to pair responses to
 * requests on its end of the wire.
 */
let _rpcSeq = 0
const _rpcRandom = Math.random().toString(36).slice(2, 8)
function nextRpcId(): string {
  _rpcSeq += 1
  return `${_rpcRandom}-${_rpcSeq}`
}

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: string
  method: string
  params?: unknown
}

interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0'
  id: string | number
  result?: T
  error?: { code: number; message: string; data?: unknown }
}

export class BridgeRpcError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly data?: unknown,
  ) {
    super(message)
    this.name = 'BridgeRpcError'
  }
}

// =============================================================================
// Bridge types (mirror BridgeVM RPC schema)
// =============================================================================

export type BridgeRequestStatus =
  | 'pending'
  | 'deposited'
  | 'signing'
  | 'signed'
  | 'releasing'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface BridgeRequest {
  requestId: string
  sourceChain: string
  destChain: string
  sourceAsset: string
  destAsset: string
  amount: string
  recipient: string
  sender: string
  status: BridgeRequestStatus
  createdAt: number
  sourceTxHash?: string
  destTxHash?: string
  signature?: string
  feeAmount?: string
  netAmount?: string
}

export interface ChainConfig {
  chainId: string
  chainName: string
  rpcEndpoint: string
  bridgeContract: string
  tokenContracts: Record<string, string>
  nativeCurrency: string
  blockTime: number
  confirmations: number
  enabled: boolean
}

export interface BridgeInfo {
  version: string
  nodeId: string
  chainId: string
  mpcReady: boolean
  mpcPublicKey: string
  threshold: number
  totalParties: number
  supportedChains: string[]
  totalBridged: string
  totalFees: string
}

export interface FeeEstimate {
  feeAmount: string
  netAmount: string
  estimatedTime: number
}

// =============================================================================
// Constructor options
// =============================================================================

export interface BridgeRPCClientOptions {
  /** B-Chain (BridgeVM) JSON-RPC URL, e.g. `https://node.lux.network/v1/chain/B/rpc`. */
  bridgeRpcUrl: string
  /** Optional T-Chain (ThresholdVM) JSON-RPC URL. */
  thresholdRpcUrl?: string
  /** Request timeout in ms. Defaults to 10s. */
  timeoutMs?: number
}

// =============================================================================
// BridgeRPCClient
// =============================================================================

export class BridgeRPCClient {
  private bridgeRpcUrl: string
  private thresholdRpcUrl: string | null
  private timeoutMs: number

  constructor(opts: BridgeRPCClientOptions) {
    this.bridgeRpcUrl = opts.bridgeRpcUrl
    this.thresholdRpcUrl = opts.thresholdRpcUrl ?? null
    this.timeoutMs = opts.timeoutMs ?? 10_000
  }

  // ---------- transport ----------

  private async rpc<T>(
    url: string,
    method: string,
    params?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const body: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: nextRpcId(),
      method,
      ...(params !== undefined ? { params } : {}),
    }

    // Compose signal: caller's AbortSignal + a per-request timeout. The
    // timeout exists so a hung node doesn't block the UI forever.
    const ctl = new AbortController()
    const onAbort = () => ctl.abort()
    if (signal) {
      if (signal.aborted) ctl.abort()
      else signal.addEventListener('abort', onAbort)
    }
    const timer = setTimeout(() => ctl.abort(), this.timeoutMs)

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctl.signal,
      })
      if (!resp.ok) {
        throw new BridgeRpcError(
          `RPC ${method} HTTP ${resp.status}`,
          resp.status,
          null,
        )
      }
      const json = (await resp.json()) as JsonRpcResponse<T>
      if (json.error) {
        throw new BridgeRpcError(
          `RPC ${method}: ${json.error.message}`,
          json.error.code,
          json.error.data,
        )
      }
      if (json.result === undefined) {
        throw new BridgeRpcError(`RPC ${method}: empty result`, -32603, null)
      }
      return json.result
    } finally {
      clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', onAbort)
    }
  }

  /** RPC call routed to the B-Chain (BridgeVM) endpoint. */
  bridgeCall<T>(method: string, params?: unknown, signal?: AbortSignal): Promise<T> {
    return this.rpc<T>(this.bridgeRpcUrl, method, params, signal)
  }

  /** RPC call routed to the T-Chain (ThresholdVM) endpoint. Throws if not configured. */
  thresholdCall<T>(method: string, params?: unknown, signal?: AbortSignal): Promise<T> {
    if (!this.thresholdRpcUrl) {
      throw new BridgeRpcError(
        'thresholdRpcUrl not configured; pass it to BridgeRPCClient to enable T-Chain calls',
        -32601,
      )
    }
    return this.rpc<T>(this.thresholdRpcUrl, method, params, signal)
  }

  // ---------- bridge: quote / swap / status ----------

  /**
   * Fee + receive-amount estimate for a bridge intent. The BridgeVM is the
   * authority on routing economics; this returns the same shape the UI
   * already binds to (server quote).
   */
  estimateFee(
    params: {
      sourceChain: string
      destChain: string
      sourceAsset: string
      destAsset: string
      amount: string
      refuel?: boolean
    },
    signal?: AbortSignal,
  ): Promise<FeeEstimate> {
    return this.bridgeCall<FeeEstimate>('bridge_estimateFee', params, signal)
  }

  /**
   * Submit a bridge intent. Returns the request record (with `requestId`)
   * that the client then polls via `getBridgeStatus`.
   */
  submitBridgeRequest(
    params: {
      sourceChain: string
      destChain: string
      sourceAsset: string
      destAsset: string
      amount: string
      recipient: string
      sender: string
      refuel?: boolean
    },
    signal?: AbortSignal,
  ): Promise<BridgeRequest> {
    return this.bridgeCall<BridgeRequest>('bridge_submitRequest', params, signal)
  }

  /** Read the current state of a bridge request. */
  getBridgeStatus(
    requestId: string,
    signal?: AbortSignal,
  ): Promise<BridgeRequest> {
    return this.bridgeCall<BridgeRequest>('bridge_getStatus', { requestId }, signal)
  }

  /** Cancel a pending bridge request. */
  cancelRequest(
    requestId: string,
    signal?: AbortSignal,
  ): Promise<{ success: boolean }> {
    return this.bridgeCall<{ success: boolean }>('bridge_cancelRequest', { requestId }, signal)
  }

  // ---------- bridge: discovery ----------

  /** Node-level info (mpc readiness, threshold, supported chains). */
  getBridgeInfo(signal?: AbortSignal): Promise<BridgeInfo> {
    return this.bridgeCall<BridgeInfo>('bridge_getInfo', undefined, signal)
  }

  /** Supported chains as the BridgeVM reports them. */
  getSupportedChains(signal?: AbortSignal): Promise<ChainConfig[]> {
    return this.bridgeCall<ChainConfig[]>('bridge_getSupportedChains', undefined, signal)
  }

  /** Per-chain config (RPC endpoint, bridge contract, token contracts). */
  getChainConfig(chainId: string, signal?: AbortSignal): Promise<ChainConfig> {
    return this.bridgeCall<ChainConfig>('bridge_getChainConfig', { chainId }, signal)
  }

  /** Liveness probe — used by the fallback adapter to decide whether RPC is reachable. */
  health(signal?: AbortSignal): Promise<{ status: string; mpcReady: boolean }> {
    return this.bridgeCall<{ status: string; mpcReady: boolean }>(
      'bridge_health',
      undefined,
      signal,
    )
  }

  // ---------- threshold (m-chain) ----------

  /** Active MPC public key (for the bridge's signing party). */
  getMPCPublicKey(signal?: AbortSignal): Promise<{ publicKey: string }> {
    return this.bridgeCall<{ publicKey: string }>('bridge_getMPCPublicKey', undefined, signal)
  }

  /** Retrieve the MPC signature for a completed bridge request. */
  getBridgeSignature(
    requestId: string,
    signal?: AbortSignal,
  ): Promise<{ signature: string; sessionId: string }> {
    return this.bridgeCall<{ signature: string; sessionId: string }>(
      'bridge_getSignature',
      { requestId },
      signal,
    )
  }
}

/** Convenience factory. Mirrors the original `createBridgeRPCClient` signature. */
export function createBridgeRPCClient(opts: {
  nodeUrl?: string
  bridgeRpcUrl?: string
  thresholdRpcUrl?: string
  timeoutMs?: number
}): BridgeRPCClient {
  const nodeUrl = opts.nodeUrl ?? 'http://127.0.0.1:9650'
  const init: BridgeRPCClientOptions = {
    bridgeRpcUrl: opts.bridgeRpcUrl ?? `${nodeUrl}/v1/chain/B/rpc`,
    thresholdRpcUrl: opts.thresholdRpcUrl ?? `${nodeUrl}/v1/chain/T/rpc`,
    ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
  }
  return new BridgeRPCClient(init)
}
