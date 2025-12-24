// Copyright (C) 2019-2025, Lux Industries, Inc. All rights reserved.
// See the file LICENSE for licensing terms.

import type {
  ThresholdClientOptions,
  KeygenRequest,
  KeygenResponse,
  SignRequest,
  SignResponse,
  SignatureResponse,
  KeyInfo,
  ChainConfig,
  ProtocolInfo,
  Chain,
  Protocol,
  JsonRpcRequest,
  JsonRpcResponse,
  ReshareRequest,
  RefreshRequest,
  SessionInfo,
  SessionListOptions,
  NetworkStats,
  QuotaInfo,
  HealthStatus,
  ThresholdInfo,
} from './types'

/**
 * T-Chain (ThresholdVM) client for MPC threshold signatures
 *
 * @example
 * ```ts
 * const client = new ThresholdClient({ endpoint: 'http://localhost:9650/ext/bc/T' })
 *
 * // Generate key by chain (auto-selects protocol)
 * const keygen = await client.keygen({ keyId: 'my-key', chain: 'ethereum' })
 *
 * // Or by explicit protocol
 * const keygen2 = await client.keygen({ keyId: 'frost-key', protocol: 'frost' })
 *
 * // Sign a message
 * const sign = await client.sign({ keyId: 'my-key', messageHash: '0x...' })
 * const sig = await client.waitForSignature(sign.sessionId)
 * ```
 */
export class ThresholdClient {
  private endpoint: string
  private chainId: string
  private timeout: number
  private requestId = 0

  constructor(options: ThresholdClientOptions) {
    this.endpoint = options.endpoint
    this.chainId = options.chainId ?? 'unknown'
    this.timeout = options.timeout ?? 30000
  }

  // ===========================================================================
  // Key Generation
  // ===========================================================================

  /**
   * Initiate key generation on T-Chain
   * Specify chain for auto protocol selection, or protocol for explicit selection
   */
  async keygen(req: KeygenRequest): Promise<KeygenResponse> {
    return this.call<KeygenResponse>('threshold_keygen', {
      keyId: req.keyId,
      chain: req.chain,
      protocol: req.protocol,
      threshold: req.threshold,
      totalParties: req.totalParties,
      requestedBy: this.chainId,
    })
  }

  /**
   * Convenience method for chain-based key generation
   */
  async keygenForChain(keyId: string, chain: Chain): Promise<KeygenResponse> {
    return this.keygen({ keyId, chain })
  }

  /**
   * Get keygen session status
   */
  async getKeygenStatus(sessionId: string): Promise<KeygenResponse> {
    return this.call<KeygenResponse>('threshold_getKeygenStatus', { sessionId })
  }

  /**
   * Wait for keygen to complete
   */
  async waitForKeygen(sessionId: string, timeoutMs = 60000): Promise<KeygenResponse> {
    const deadline = Date.now() + timeoutMs
    const pollInterval = 500

    while (Date.now() < deadline) {
      const status = await this.getKeygenStatus(sessionId)

      if (status.status === 'completed') {
        return status
      }
      if (status.status === 'failed') {
        throw new Error(`Keygen failed: ${status.error}`)
      }

      await this.sleep(pollInterval)
    }

    throw new Error('Keygen timed out')
  }

  // ===========================================================================
  // Signing
  // ===========================================================================

  /**
   * Request a signature from T-Chain
   */
  async sign(req: SignRequest): Promise<SignResponse> {
    return this.call<SignResponse>('threshold_sign', {
      keyId: req.keyId,
      messageHash: req.messageHash,
      messageType: req.messageType ?? 'raw',
      requestingChain: this.chainId,
    })
  }

  /**
   * Get signature result
   */
  async getSignature(sessionId: string): Promise<SignatureResponse> {
    return this.call<SignatureResponse>('threshold_getSignature', { sessionId })
  }

  /**
   * Wait for signature to complete
   */
  async waitForSignature(sessionId: string, timeoutMs = 30000): Promise<SignatureResponse> {
    const deadline = Date.now() + timeoutMs
    const pollInterval = 100

    while (Date.now() < deadline) {
      const sig = await this.getSignature(sessionId)

      if (sig.status === 'completed') {
        return sig
      }
      if (sig.status === 'failed') {
        throw new Error(`Signing failed: ${sig.error}`)
      }

      await this.sleep(pollInterval)
    }

    throw new Error('Signing timed out')
  }

  /**
   * Sign and wait for completion
   */
  async signAndWait(req: SignRequest, timeoutMs = 30000): Promise<SignatureResponse> {
    const resp = await this.sign(req)
    return this.waitForSignature(resp.sessionId, timeoutMs)
  }

  // ===========================================================================
  // Key Management
  // ===========================================================================

  /**
   * Get key information
   */
  async getKey(keyId: string): Promise<KeyInfo> {
    return this.call<KeyInfo>('threshold_getKey', { keyId })
  }

  /**
   * List all keys
   */
  async listKeys(): Promise<KeyInfo[]> {
    return this.call<KeyInfo[]>('threshold_listKeys', {})
  }

  /**
   * Get public key for a key ID
   */
  async getPublicKey(keyId: string): Promise<string> {
    const result = await this.call<{ publicKey: string }>('threshold_getPublicKey', { keyId })
    return result.publicKey
  }

  /**
   * Get address for a key ID (chain-specific derivation)
   */
  async getAddress(keyId: string): Promise<string> {
    const result = await this.call<{ address: string }>('threshold_getAddress', { keyId })
    return result.address
  }

  /**
   * Reshare key with new party set
   */
  async reshare(req: ReshareRequest): Promise<KeygenResponse> {
    return this.call<KeygenResponse>('threshold_reshare', req)
  }

  /**
   * Refresh key shares (proactive security)
   */
  async refresh(req: RefreshRequest): Promise<KeygenResponse> {
    return this.call<KeygenResponse>('threshold_refresh', req)
  }

  /**
   * Batch sign multiple messages
   */
  async batchSign(keyId: string, messageHashes: string[]): Promise<string[]> {
    const result = await this.call<{ sessionIds: string[] }>('threshold_batchSign', {
      keyId,
      messageHashes,
    })
    return result.sessionIds
  }

  // ===========================================================================
  // Session Management
  // ===========================================================================

  /**
   * List sessions
   */
  async getSessions(opts?: SessionListOptions): Promise<SessionInfo[]> {
    return this.call<SessionInfo[]>('threshold_getSessions', opts ?? {})
  }

  /**
   * Cancel a session
   */
  async cancelSession(sessionId: string): Promise<boolean> {
    const result = await this.call<{ cancelled: boolean }>('threshold_cancelSession', { sessionId })
    return result.cancelled
  }

  // ===========================================================================
  // Network Info & Health
  // ===========================================================================

  /**
   * Get network info
   */
  async getInfo(): Promise<ThresholdInfo> {
    return this.call<ThresholdInfo>('threshold_getInfo', {})
  }

  /**
   * Get network statistics
   */
  async getStats(): Promise<NetworkStats> {
    return this.call<NetworkStats>('threshold_getStats', {})
  }

  /**
   * Get quota info for a chain
   */
  async getQuota(chainId?: string): Promise<QuotaInfo> {
    return this.call<QuotaInfo>('threshold_getQuota', { chainId: chainId ?? this.chainId })
  }

  /**
   * Health check
   */
  async health(): Promise<HealthStatus> {
    return this.call<HealthStatus>('threshold_health', {})
  }

  /**
   * Check if ready
   */
  async isReady(): Promise<boolean> {
    try {
      const health = await this.health()
      return health.ready
    } catch {
      return false
    }
  }

  // ===========================================================================
  // Protocol & Chain Info
  // ===========================================================================

  /**
   * Get supported chains and their configurations
   */
  async getSupportedChains(): Promise<ChainConfig[]> {
    return this.call<ChainConfig[]>('threshold_getSupportedChains', {})
  }

  /**
   * Get protocol information
   */
  async getProtocolInfo(): Promise<ProtocolInfo[]> {
    return this.call<ProtocolInfo[]>('threshold_getProtocolInfo', {})
  }

  /**
   * Get chain configuration
   */
  async getChainConfig(chain: Chain): Promise<ChainConfig> {
    return this.call<ChainConfig>('threshold_getChainConfig', { chain })
  }

  /**
   * Resolve protocol for a chain
   */
  async resolveProtocol(chain: Chain, protocol?: Protocol): Promise<Protocol> {
    return this.call<Protocol>('threshold_resolveProtocol', { chain, protocol })
  }

  // ===========================================================================
  // Internal
  // ===========================================================================

  private async call<T>(method: string, params: unknown): Promise<T> {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: ++this.requestId,
      method,
      params,
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const json = (await response.json()) as JsonRpcResponse<T>

      if (json.error) {
        throw new Error(`RPC error ${json.error.code}: ${json.error.message}`)
      }

      return json.result as T
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
