/**
 * BridgeRPCClient - Direct JSON-RPC client for Lux BridgeVM and ThresholdVM
 *
 * This client replaces the legacy BridgeApiClient by communicating directly
 * with the Lux node's BridgeVM (B-Chain) and ThresholdVM (T-Chain) via JSON-RPC.
 *
 * Benefits:
 * - Fully decentralized - no centralized backend server required
 * - Private asset transfers through Lux network
 * - Direct MPC threshold signatures via T-Chain
 * - Lower latency - direct node communication
 */

import { v4 as uuidv4 } from 'uuid'
import type { CryptoNetwork, NetworkCurrency } from '@/Models/CryptoNetwork'
import type { BridgeSettings } from '@/Models/BridgeSettings'
import { SwapStatus } from '@/Models/SwapStatus'

// =============================================================================
// JSON-RPC Types
// =============================================================================

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: unknown
}

interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0'
  id: string | number
  result?: T
  error?: JsonRpcError
}

interface JsonRpcError {
  code: number
  message: string
  data?: unknown
}

// =============================================================================
// Bridge Types (matching BridgeVM RPC)
// =============================================================================

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

export type BridgeRequestStatus =
  | 'pending'
  | 'deposited'
  | 'signing'
  | 'signed'
  | 'releasing'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface ChainConfig {
  chainId: string
  chainName: string
  rpcEndpoint: string
  bridgeContract: string
  tokenContracts: Record<string, string>
  confirmations: number
  enabled: boolean
  nativeCurrency: string
  blockTime: number
}

export interface FeeEstimate {
  flatFee: string
  percentageFee: number
  totalFee: string
  netAmount: string
  estimatedTime: number
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

export interface NetworkStats {
  totalRequests: number
  pendingRequests: number
  completedRequests: number
  failedRequests: number
  totalVolume: Record<string, string>
  dailyVolume: Record<string, string>
  averageCompletionTime: number
}

export interface Validator {
  nodeId: string
  address: string
  stake: string
  mpcPartyId: string
  isActive: boolean
  successCount: number
  failureCount: number
}

export interface DailyVolume {
  chain: string
  volume: string
  count: number
  resetTime: number
}

export interface FeeConfig {
  flatFeeNanoLux: string
  percentageFeeBps: number
}

export interface CollectedFees {
  totalCollected: string
  totalDistributed: string
  pendingDistribution: string
  feesByChain: Record<string, string>
}

export interface BridgeBlock {
  id: string
  parentId: string
  height: number
  timestamp: number
  requests: BridgeRequest[]
}

// =============================================================================
// Threshold Types (matching ThresholdVM RPC)
// =============================================================================

export interface ThresholdInfo {
  version: string
  nodeId: string
  chainId: string
  mpcReady: boolean
  activeKeyId: string
  threshold: number
  totalParties: number
  supportedProtocols: string[]
  authorizedChains: string[]
  totalKeys: number
  activeSessions: number
}

export interface KeyInfo {
  keyId: string
  protocol: string
  publicKey: string
  address?: string
  threshold: number
  totalParties: number
  generation: number
  status: string
  signCount: number
  createdAt: number
  lastUsedAt?: number
  partyIds: string[]
}

export interface SignatureResult {
  sessionId: string
  status: string
  signature?: string
  r?: string
  s?: string
  v?: number
  signerParties?: string[]
  completedAt?: number
  error?: string
}

export interface ProtocolInfo {
  name: string
  description: string
  supportedCurves: string[]
  keySize: number
  signatureSize: number
  isPostQuantum: boolean
  supportsReshare: boolean
  supportsRefresh: boolean
}

export interface QuotaInfo {
  chainId: string
  dailyLimit: number
  usedToday: number
  remaining: number
  resetTime: number
}

// =============================================================================
// BridgeRPCClient
// =============================================================================

export class BridgeRPCClient {
  // Static properties for backward compatibility with BridgeApiClient
  static apiVersion: string = '1'
  static apiBaseEndpoint?: string = 'http://127.0.0.1:9650'

  private bridgeRpcUrl: string
  private thresholdRpcUrl: string
  private requestId: number = 0

  constructor(
    bridgeRpcUrl: string = 'http://127.0.0.1:9650/ext/bc/B/rpc',
    thresholdRpcUrl: string = 'http://127.0.0.1:9650/ext/bc/T/rpc'
  ) {
    this.bridgeRpcUrl = bridgeRpcUrl
    this.thresholdRpcUrl = thresholdRpcUrl
  }

  // ===========================================================================
  // Low-level RPC
  // ===========================================================================

  private async rpcCall<T>(
    url: string,
    method: string,
    params?: unknown
  ): Promise<T> {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: ++this.requestId,
      method,
      params,
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status} ${response.statusText}`)
    }

    const json: JsonRpcResponse<T> = await response.json()

    if (json.error) {
      throw new BridgeRPCError(json.error.code, json.error.message, json.error.data)
    }

    return json.result as T
  }

  private async bridgeRpc<T>(method: string, params?: unknown): Promise<T> {
    return this.rpcCall<T>(this.bridgeRpcUrl, method, params)
  }

  private async thresholdRpc<T>(method: string, params?: unknown): Promise<T> {
    return this.rpcCall<T>(this.thresholdRpcUrl, method, params)
  }

  // ===========================================================================
  // Bridge Operations (B-Chain)
  // ===========================================================================

  /**
   * Submit a new bridge request
   */
  async submitBridgeRequest(params: {
    sourceChain: string
    destChain: string
    sourceAsset: string
    destAsset: string
    amount: string
    recipient: string
    sender: string
  }): Promise<BridgeRequest> {
    return this.bridgeRpc<BridgeRequest>('bridge_submitRequest', params)
  }

  /**
   * Get bridge request status
   */
  async getBridgeStatus(requestId: string): Promise<BridgeRequest> {
    return this.bridgeRpc<BridgeRequest>('bridge_getStatus', { requestId })
  }

  /**
   * Get list of bridge requests with filtering
   */
  async getBridgeRequests(params?: {
    status?: BridgeRequestStatus
    sourceChain?: string
    destChain?: string
    page?: number
    pageSize?: number
  }): Promise<BridgeRequest[]> {
    return this.bridgeRpc<BridgeRequest[]>('bridge_getRequests', params || {})
  }

  /**
   * Estimate bridge fee
   */
  async estimateFee(params: {
    sourceChain: string
    destChain: string
    amount: string
  }): Promise<FeeEstimate> {
    return this.bridgeRpc<FeeEstimate>('bridge_estimateFee', params)
  }

  /**
   * Get MPC signature for a bridge request
   */
  async getBridgeSignature(requestId: string): Promise<{
    signature: string
    r: string
    s: string
    v: number
  }> {
    return this.bridgeRpc('bridge_getSignature', { requestId })
  }

  /**
   * Complete a swap by providing destination transaction hash
   */
  async completeSwap(requestId: string, destTxHash: string): Promise<BridgeRequest> {
    return this.bridgeRpc<BridgeRequest>('bridge_completeSwap', { requestId, destTxHash })
  }

  /**
   * Cancel a pending bridge request
   */
  async cancelRequest(requestId: string): Promise<{ success: boolean }> {
    return this.bridgeRpc('bridge_cancelRequest', { requestId })
  }

  // ===========================================================================
  // Network Information (B-Chain)
  // ===========================================================================

  /**
   * Get bridge node information
   */
  async getBridgeInfo(): Promise<BridgeInfo> {
    return this.bridgeRpc<BridgeInfo>('bridge_getInfo')
  }

  /**
   * Get network statistics
   */
  async getNetworkStats(): Promise<NetworkStats> {
    return this.bridgeRpc<NetworkStats>('bridge_getNetworkStats')
  }

  /**
   * Get supported chains
   */
  async getSupportedChains(): Promise<ChainConfig[]> {
    return this.bridgeRpc<ChainConfig[]>('bridge_getSupportedChains')
  }

  /**
   * Get configuration for a specific chain
   */
  async getChainConfig(chainId: string): Promise<ChainConfig> {
    return this.bridgeRpc<ChainConfig>('bridge_getChainConfig', { chainId })
  }

  /**
   * Get daily volume statistics
   */
  async getDailyVolume(chainId?: string): Promise<DailyVolume[]> {
    return this.bridgeRpc<DailyVolume[]>('bridge_getDailyVolume', { chainId })
  }

  // ===========================================================================
  // Validator Information (B-Chain)
  // ===========================================================================

  /**
   * Get list of validators
   */
  async getValidators(): Promise<Validator[]> {
    return this.bridgeRpc<Validator[]>('bridge_getValidators')
  }

  /**
   * Get MPC status
   */
  async getMPCStatus(): Promise<{
    ready: boolean
    threshold: number
    totalParties: number
    partyId: string
    activeSessions: number
  }> {
    return this.bridgeRpc('bridge_getMPCStatus')
  }

  /**
   * Get MPC public key
   */
  async getMPCPublicKey(): Promise<{ publicKey: string }> {
    return this.bridgeRpc('bridge_getMPCPublicKey')
  }

  // ===========================================================================
  // Signer Set Management (B-Chain) - Opt-in, first 100 validators
  // ===========================================================================
  //
  // NOTE: These methods are primarily used by lux-cli for validator operators
  // to manage their node's participation in the bridge signer set. The bridge
  // app UI typically only needs getSignerSetInfo() for display purposes.
  //
  // Key Flow:
  //   1. First 100 validators opt-in via registerValidator (no reshare)
  //   2. After 100, set is CLOSED - new validators go to waitlist
  //   3. Reshare ONLY happens when a signer fails/stops and is replaced
  //   4. Key shards stored locally in ~/.lux/keys by validator operator

  /**
   * Register a validator as an MPC signer (opt-in)
   *
   * NOTE: Called by lux-cli when validator operator wants to join bridge signer set.
   * First 100 validators are accepted. NO reshare on join.
   * After 100, validators are added to waitlist for slot replacement.
   *
   * @param params.nodeId - The validator's node ID
   * @param params.stakeAmount - Optional stake amount
   * @param params.mpcPubKey - Optional hex-encoded MPC public key
   * @returns Registration result
   */
  async registerValidator(params: {
    nodeId: string
    stakeAmount?: string
    mpcPubKey?: string
  }): Promise<{
    nodeId: string
    registered: boolean
    signerIndex: number
    totalSigners: number
    threshold: number
    reshareRequired: boolean
    epoch: number
    setFrozen: boolean
    message: string
  }> {
    return this.bridgeRpc('bridge_registerValidator', params)
  }

  /**
   * Get current signer set information
   *
   * Returns the current state of the opt-in signer management system.
   * Useful for both CLI operators and UI display.
   */
  async getSignerSetInfo(): Promise<{
    totalSigners: number
    threshold: number
    maxSigners: number
    currentEpoch: number
    setFrozen: boolean
    remainingSlots: number
    signers: Array<{
      nodeId: string
      partyId: string
      stakeAmount: number
      active: boolean
      joinedAt: string
    }>
  }> {
    return this.bridgeRpc('bridge_getSignerSetInfo')
  }

  /**
   * Replace a failed/stopped signer
   *
   * NOTE: This is the ONLY operation that triggers a reshare.
   * Called when a signer fails health checks or stops participating.
   * Optionally includes a replacement from the waitlist.
   *
   * @param params.nodeId - The failed signer's node ID to remove
   * @param params.replacementNodeId - Optional replacement node ID from waitlist
   */
  async replaceSigner(params: {
    nodeId: string
    replacementNodeId?: string
  }): Promise<{
    success: boolean
    removedNodeId: string
    replacementNodeId?: string
    reshareSession: string
    newEpoch: number
    activeSigners: number
    threshold: number
    message: string
  }> {
    return this.bridgeRpc('bridge_replaceSigner', params)
  }

  // ===========================================================================
  // Fee Information (B-Chain)
  // ===========================================================================

  /**
   * Get fee configuration
   */
  async getFeeConfig(): Promise<FeeConfig> {
    return this.bridgeRpc<FeeConfig>('bridge_getFeeConfig')
  }

  /**
   * Get collected fees
   */
  async getCollectedFees(): Promise<CollectedFees> {
    return this.bridgeRpc<CollectedFees>('bridge_getCollectedFees')
  }

  // ===========================================================================
  // Block Information (B-Chain)
  // ===========================================================================

  /**
   * Get latest block
   */
  async getLatestBlock(): Promise<BridgeBlock> {
    return this.bridgeRpc<BridgeBlock>('bridge_getLatestBlock')
  }

  /**
   * Get block by ID
   */
  async getBlock(blockId: string): Promise<BridgeBlock> {
    return this.bridgeRpc<BridgeBlock>('bridge_getBlock', { blockId })
  }

  /**
   * Get block by height
   */
  async getBlockByHeight(height: number): Promise<BridgeBlock> {
    return this.bridgeRpc<BridgeBlock>('bridge_getBlockByHeight', { height })
  }

  // ===========================================================================
  // Health (B-Chain)
  // ===========================================================================

  /**
   * Check bridge health
   */
  async bridgeHealth(): Promise<{ status: string; mpcReady: boolean }> {
    return this.bridgeRpc('bridge_health')
  }

  // ===========================================================================
  // Threshold Operations (T-Chain)
  // ===========================================================================

  /**
   * Request a threshold signature
   */
  async requestSignature(params: {
    keyId?: string
    messageHash: string
    messageType?: 'raw' | 'eth_sign' | 'typed_data'
    requestingChain: string
  }): Promise<{ sessionId: string; status: string }> {
    return this.thresholdRpc('threshold_sign', params)
  }

  /**
   * Get signature result
   */
  async getSignature(sessionId: string): Promise<SignatureResult> {
    return this.thresholdRpc<SignatureResult>('threshold_getSignature', { sessionId })
  }

  /**
   * Batch sign multiple messages
   */
  async batchSign(params: {
    keyId: string
    messageHashes: string[]
    requestingChain: string
  }): Promise<{ sessionIds: string[]; status: string }> {
    return this.thresholdRpc('threshold_batchSign', params)
  }

  // ===========================================================================
  // Key Management (T-Chain)
  // ===========================================================================

  /**
   * Reshare key to new set of parties (for validator rotation)
   *
   * This is called when new validators join the network up to the cap of 100.
   * After 100 validators, the signer set is frozen.
   *
   * @param params.keyId - The key to reshare
   * @param params.newPartyIds - New party IDs (validators) to include
   * @param params.newThreshold - Optional new threshold (default: 2/3 of parties)
   */
  async reshareKey(params: {
    keyId: string
    newPartyIds: string[]
    newThreshold?: number
  }): Promise<{ sessionId: string; status: string }> {
    return this.thresholdRpc('threshold_reshare', params)
  }

  /**
   * Refresh key shares (invalidates old shares without changing parties)
   *
   * Use this to proactively refresh shares for security without
   * changing the validator set.
   */
  async refreshKey(params: {
    keyId: string
  }): Promise<{ sessionId: string; status: string }> {
    return this.thresholdRpc('threshold_refresh', params)
  }

  /**
   * Get reshare status
   */
  async getReshareStatus(sessionId: string): Promise<{
    sessionId: string
    status: string
    keyId: string
    newPartyCount: number
    completedAt?: number
    error?: string
  }> {
    return this.thresholdRpc('threshold_getKeygenStatus', { sessionId })
  }

  /**
   * List all threshold keys
   */
  async listKeys(): Promise<KeyInfo[]> {
    return this.thresholdRpc<KeyInfo[]>('threshold_listKeys')
  }

  /**
   * Get key details
   */
  async getKey(keyId: string): Promise<KeyInfo> {
    return this.thresholdRpc<KeyInfo>('threshold_getKey', { keyId })
  }

  /**
   * Get public key
   */
  async getPublicKey(keyId?: string): Promise<{ publicKey: string }> {
    return this.thresholdRpc('threshold_getPublicKey', { keyId })
  }

  /**
   * Get address derived from key
   */
  async getAddress(keyId?: string): Promise<{ address: string }> {
    return this.thresholdRpc('threshold_getAddress', { keyId })
  }

  // ===========================================================================
  // Protocol Information (T-Chain)
  // ===========================================================================

  /**
   * Get supported protocols
   */
  async getProtocols(): Promise<ProtocolInfo[]> {
    return this.thresholdRpc<ProtocolInfo[]>('threshold_getProtocols')
  }

  /**
   * Get specific protocol info
   */
  async getProtocolInfo(protocol: string): Promise<ProtocolInfo> {
    return this.thresholdRpc<ProtocolInfo>('threshold_getProtocolInfo', { protocol })
  }

  // ===========================================================================
  // Threshold Network Info (T-Chain)
  // ===========================================================================

  /**
   * Get threshold node info
   */
  async getThresholdInfo(): Promise<ThresholdInfo> {
    return this.thresholdRpc<ThresholdInfo>('threshold_getInfo')
  }

  /**
   * Get threshold stats
   */
  async getThresholdStats(): Promise<{
    totalSignatures: number
    totalKeygens: number
    activeSessions: number
    signaturesByChain: Record<string, number>
    averageSigningTime: number
    successRate: number
  }> {
    return this.thresholdRpc('threshold_getStats')
  }

  /**
   * Get quota for a chain
   */
  async getQuota(chainId: string): Promise<QuotaInfo> {
    return this.thresholdRpc<QuotaInfo>('threshold_getQuota', { chainId })
  }

  /**
   * Check threshold health
   */
  async thresholdHealth(): Promise<{ status: string; mpcReady: boolean }> {
    return this.thresholdRpc('threshold_health')
  }

  // ===========================================================================
  // Legacy API Compatibility (maps to BridgeApiClient methods)
  // ===========================================================================

  /**
   * Get networks (compatible with BridgeApiClient.GetLSNetworksAsync)
   */
  async getNetworks(): Promise<CryptoNetwork[]> {
    const chains = await this.getSupportedChains()
    return chains.map(chain => this.chainConfigToNetwork(chain))
  }

  /**
   * Get settings (compatible with BridgeApiClient.GetSettingsAsync)
   */
  async getSettings(): Promise<BridgeSettings> {
    const [info, feeConfig] = await Promise.all([
      this.getBridgeInfo(),
      this.getFeeConfig(),
    ])

    return {
      // Map to BridgeSettings format
      exchanges: [],
      networks: [],
    } as BridgeSettings
  }

  /**
   * Create swap (compatible with BridgeApiClient.CreateSwapAsync)
   */
  async createSwap(params: {
    amount: number
    source_network: string
    source_asset: string
    source_address?: string
    destination_network: string
    destination_asset: string
    destination_address: string
  }): Promise<{ swap_id: string }> {
    const request = await this.submitBridgeRequest({
      sourceChain: params.source_network,
      destChain: params.destination_network,
      sourceAsset: params.source_asset,
      destAsset: params.destination_asset,
      amount: params.amount.toString(),
      recipient: params.destination_address,
      sender: params.source_address || '',
    })

    return { swap_id: request.requestId }
  }

  /**
   * Get swap details (compatible with BridgeApiClient.GetSwapDetailsAsync)
   */
  async getSwapDetails(swapId: string): Promise<SwapItem> {
    const request = await this.getBridgeStatus(swapId)
    return this.bridgeRequestToSwapItem(request)
  }

  /**
   * Get swaps (compatible with BridgeApiClient.GetSwapsAsync)
   */
  async getSwaps(page: number = 1, status?: SwapStatus): Promise<SwapItem[]> {
    const bridgeStatus = status !== undefined
      ? this.swapStatusToBridgeStatus(status)
      : undefined

    const requests = await this.getBridgeRequests({
      status: bridgeStatus,
      page,
      pageSize: 20,
    })

    return requests.map(r => this.bridgeRequestToSwapItem(r))
  }

  /**
   * Estimate fee (compatible with BridgeApiClient.GetFee)
   */
  async getFee(params: {
    source: string
    destination: string
    asset: string
    amount?: number
  }): Promise<{
    min_amount: number
    max_amount: number
    fee_amount: number
  }> {
    const estimate = await this.estimateFee({
      sourceChain: params.source,
      destChain: params.destination,
      amount: (params.amount || 0).toString(),
    })

    return {
      min_amount: 0.001, // Configurable minimum
      max_amount: 1000000, // Configurable maximum
      fee_amount: parseFloat(estimate.totalFee),
    }
  }

  /**
   * Fetcher for SWR (compatible with BridgeApiClient.fetcher)
   */
  fetcher = async (url: string): Promise<any> => {
    // For legacy API compatibility, this would need to route to appropriate RPC calls
    // For now, it's a pass-through - real implementation would parse URL and call appropriate method
    const response = await fetch(`${BridgeRPCClient.apiBaseEndpoint}/api${url}`)
    return response.json()
  }

  /**
   * Disconnect exchange (compatible with BridgeApiClient.DisconnectExchangeAsync)
   */
  async DisconnectExchangeAsync(swapId: string, exchangeName: string): Promise<void> {
    await this.bridgeRpc('bridge_disconnectExchange', { requestId: swapId, exchange: exchangeName })
  }

  /**
   * Migrate swaps from guest to authenticated user (compatible with BridgeApiClient.SwapsMigration)
   */
  async SwapsMigration(guestAuthToken: string): Promise<void> {
    // This is a legacy operation - in the new decentralized model,
    // swap ownership is determined by on-chain signatures
    // For compatibility, we can still expose this as a no-op or warning
    console.warn('SwapsMigration is deprecated in decentralized bridge model')
  }

  /**
   * Cancel swap (compatible with BridgeApiClient.CancelSwapAsync)
   */
  async CancelSwapAsync(swapId: string): Promise<void> {
    await this.cancelRequest(swapId)
  }

  /**
   * Get pending swaps (compatible with BridgeApiClient.GetPendingSwapsAsync)
   */
  async GetPendingSwapsAsync(): Promise<SwapItem[]> {
    const requests = await this.getBridgeRequests({ status: 'pending' })
    return requests.map(r => this.bridgeRequestToSwapItem(r))
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private chainConfigToNetwork(chain: ChainConfig): CryptoNetwork {
    return {
      display_name: chain.chainName,
      internal_name: chain.chainId,
      is_testnet: chain.chainId.includes('test') || chain.chainId.includes('sepolia'),
      is_featured: false,
      chain_id: chain.chainId,
      status: chain.enabled ? 'active' : 'inactive',
      type: 'evm' as any, // NetworkType.EVM
      native_currency: chain.nativeCurrency,
      transaction_explorer_template: '',
      account_explorer_template: '',
      currencies: Object.entries(chain.tokenContracts).map(([asset, address]) => ({
        name: asset,
        asset,
        logo: '',
        contract_address: address,
        decimals: 18,
        status: 'active' as const,
        is_deposit_enabled: true,
        is_withdrawal_enabled: true,
        is_refuel_enabled: false,
        precision: 6,
        price_in_usd: 0,
        is_native: address === '' || address === '0x0000000000000000000000000000000000000000',
      })),
      metadata: null,
      managed_accounts: [],
      nodes: [chain.rpcEndpoint],
    }
  }

  private bridgeRequestToSwapItem(request: BridgeRequest): SwapItem {
    return {
      id: request.requestId,
      created_date: new Date(request.createdAt * 1000).toISOString(),
      fee: request.feeAmount ? parseFloat(request.feeAmount) : undefined,
      status: this.bridgeStatusToSwapStatus(request.status),
      destination_address: request.recipient as `0x${string}`,
      requested_amount: parseFloat(request.amount),
      source_asset: request.sourceAsset,
      source_network: request.sourceChain,
      destination_asset: request.destAsset,
      destination_network: request.destChain,
      transactions: [],
      exchange_account_connected: false,
      has_pending_deposit: request.status === 'pending',
      sequence_number: 0,
    }
  }

  private bridgeStatusToSwapStatus(status: BridgeRequestStatus): SwapStatus {
    const mapping: Record<BridgeRequestStatus, SwapStatus> = {
      pending: SwapStatus.UserTransferPending,
      deposited: SwapStatus.UserTransferPending,
      signing: SwapStatus.BridgeTransferPending,
      signed: SwapStatus.BridgeTransferPending,
      releasing: SwapStatus.BridgeTransferPending,
      completed: SwapStatus.Completed,
      failed: SwapStatus.Failed,
      cancelled: SwapStatus.Cancelled,
    }
    return mapping[status] || SwapStatus.UserTransferPending
  }

  private swapStatusToBridgeStatus(status: SwapStatus): BridgeRequestStatus | undefined {
    switch (status) {
      case SwapStatus.UserTransferPending:
        return 'pending'
      case SwapStatus.BridgeTransferPending:
        return 'signing'
      case SwapStatus.Completed:
        return 'completed'
      case SwapStatus.Failed:
        return 'failed'
      case SwapStatus.Cancelled:
        return 'cancelled'
      default:
        return undefined
    }
  }
}

// =============================================================================
// Error Classes
// =============================================================================

export class BridgeRPCError extends Error {
  constructor(
    public code: number,
    message: string,
    public data?: unknown
  ) {
    super(message)
    this.name = 'BridgeRPCError'
  }
}

// =============================================================================
// Legacy Types for BridgeApiClient compatibility
// =============================================================================

export interface SwapItem {
  id: string
  created_date: string
  fee?: number
  status: SwapStatus
  destination_address: `0x${string}`
  requested_amount: number
  message?: string
  reference_id?: string
  app_name?: string
  refuel_price?: number
  refuel_transaction_id?: string
  source_asset: string
  source_network: string
  source_exchange?: string
  destination_asset: string
  destination_network: string
  destination_exchange?: string
  transactions: Transaction[]
  refuel?: boolean
  exchange_account_connected: boolean
  exchange_account_name?: string
  fiat_session_id?: string
  fiat_redirect_url?: string
  has_pending_deposit: boolean
  sequence_number: number
  fail_reason?: string
  use_teleporter?: boolean
  deposit_address?: {
    id: number
    type: string
    address: string
  }
}

export interface Transaction {
  type: TransactionType
  from: string
  to: string
  created_date: string
  amount: number
  transaction_id: string
  confirmations: number
  max_confirmations: number
  explorer_url: string
  account_explorer_url: string
  usd_value: number
  usd_price: number
  status: TransactionStatus
}

export enum TransactionType {
  Input = 'input',
  Output = 'output',
  Refuel = 'refuel',
}

export enum TransactionStatus {
  Completed = 'completed',
  Initiated = 'initiated',
  Pending = 'pending',
}

export enum DepositType {
  Manual = 'manual',
  Wallet = 'wallet',
}

export type DepositAddress = {
  type: string
  address: `0x${string}`
}

export enum DepositAddressSource {
  UserGenerated = 0,
  Managed = 1,
}

export type NetworkAccount = {
  id: string
  address: string
  note: string
  network_id: string
  network: string
}

export type CreateSwapParams = {
  amount: number
  app_name?: string
  reference_id?: string
  refuel?: boolean
  source_network?: string
  source_exchange?: string
  source_asset: string
  source_address?: string
  destination_network?: string
  destination_exchange?: string
  destination_asset: string
  destination_address?: string
  use_deposit_address?: boolean
}

export type AddressBookItem = {
  address: string
  date: string
  networks: string[]
  exchanges: string[]
}

export type Fee = {
  min_amount: number
  max_amount: number
  fee_amount: number
  deposit_type: DepositType
}

export enum PublishedSwapTransactionStatus {
  Pending,
  Error,
  Completed,
}

export type PublishedSwapTransactions = {
  state: {
    swapTransactions: {
      [key: string]: SwapTransaction
    }
  }
}

export type SwapTransaction = {
  hash: string
  status: PublishedSwapTransactionStatus
}

export enum SwapType {
  OnRamp = 'cex_to_network',
  OffRamp = 'network_to_cex',
  CrossChain = 'network_to_network',
}

export enum WithdrawType {
  Wallet = 'wallet',
  Manually = 'manually',
  Stripe = 'stripe',
  Coinbase = 'coinbase',
  External = 'external',
}

export type ConnectParams = {
  api_key: string
  api_secret: string
  keyphrase?: string
  exchange: string
}

export type CreateSwapData = {
  swap_id: string
}

export enum SwapStatusInNumbers {
  Pending = 0,
  Completed = 1,
  Failed = 2,
  Expired = 3,
  Delayed = 4,
  Cancelled = 5,
  SwapsWithoutCancelledAndExpired = '0&status=1&status=2&status=4',
}

export type Campaign = {
  id: number
  name: string
  display_name: string
  asset: string
  network: string
  percentage: number
  start_date: string
  end_date: string
  min_payout_amount: number
  total_budget: number
  distributed_amount: number
  status: 'active' | 'inactive'
}

export type Reward = {
  user_reward: {
    period_pending_amount: number
    total_amount: number
    total_pending_amount: number
    position: number
  }
  next_airdrop_date: string | Date
}

export type Leaderboard = {
  leaderboard: {
    address: string
    amount: number
    position: number
  }[]
  leaderboard_budget: number
}

export type RewardPayout = {
  date: string
  transaction_id: string
  amount: number
}

// =============================================================================
// Default Export & Factory
// =============================================================================

/**
 * Create a BridgeRPCClient with default or custom endpoints
 */
export function createBridgeRPCClient(options?: {
  bridgeRpcUrl?: string
  thresholdRpcUrl?: string
  nodeUrl?: string
}): BridgeRPCClient {
  const nodeUrl = options?.nodeUrl || 'http://127.0.0.1:9650'
  const bridgeRpcUrl = options?.bridgeRpcUrl || `${nodeUrl}/ext/bc/B/rpc`
  const thresholdRpcUrl = options?.thresholdRpcUrl || `${nodeUrl}/ext/bc/T/rpc`

  return new BridgeRPCClient(bridgeRpcUrl, thresholdRpcUrl)
}

export default BridgeRPCClient
