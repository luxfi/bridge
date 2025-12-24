// Copyright (C) 2019-2025, Lux Industries, Inc. All rights reserved.
// See the file LICENSE for licensing terms.

// T-Chain (ThresholdVM) Types

/** Supported MPC protocols */
export type Protocol = 'lss' | 'cggmp21' | 'frost' | 'bls' | 'ringtail'

/** Supported blockchain chains */
export type Chain =
  | 'ethereum' | 'bitcoin' | 'solana' | 'xrpl' | 'lux'
  | 'bsc' | 'polygon' | 'base' | 'ton' | 'near' | 'aptos' | 'sui' | 'cardano'

/** Keygen request parameters */
export interface KeygenRequest {
  /** Unique key identifier */
  keyId: string
  /** Target chain (auto-selects protocol) */
  chain?: Chain
  /** Explicit protocol selection */
  protocol?: Protocol
  /** Signature threshold (t in t-of-n) */
  threshold?: number
  /** Total parties (n in t-of-n) */
  totalParties?: number
}

/** Keygen response */
export interface KeygenResponse {
  sessionId: string
  keyId: string
  protocol: Protocol
  status: 'pending' | 'running' | 'completed' | 'failed'
  threshold: number
  totalParties: number
  publicKey?: string
  startedAt: number
  completedAt?: number
  error?: string
}

/** Sign request parameters */
export interface SignRequest {
  /** Key ID to sign with */
  keyId: string
  /** Message hash to sign (hex encoded) */
  messageHash: string
  /** Message type for EVM compatibility */
  messageType?: 'raw' | 'eth_sign' | 'typed_data'
}

/** Sign session response */
export interface SignResponse {
  sessionId: string
  keyId: string
  status: 'pending' | 'signing' | 'completed' | 'failed'
  createdAt: number
  expiresAt: number
}

/** Completed signature */
export interface SignatureResponse {
  sessionId: string
  status: 'completed' | 'failed'
  /** Full signature (hex) */
  signature?: string
  /** ECDSA r component (hex) */
  r?: string
  /** ECDSA s component (hex) */
  s?: string
  /** ECDSA recovery id */
  v?: number
  /** Parties that participated */
  signerParties?: string[]
  completedAt?: number
  error?: string
}

/** Key information */
export interface KeyInfo {
  keyId: string
  protocol: Protocol
  chain?: Chain
  publicKey: string
  threshold: number
  totalParties: number
  generation: number
  createdAt: number
  lastUsed?: number
}

/** Chain configuration */
export interface ChainConfig {
  chain: Chain
  defaultProtocol: Protocol
  signatureType: 'ecdsa' | 'eddsa' | 'schnorr'
  curve: string
  altProtocols: Protocol[]
}

/** Protocol information */
export interface ProtocolInfo {
  name: Protocol
  description: string
  supportedCurves: string[]
  supportsReshare: boolean
  supportsRefresh: boolean
  isPostQuantum: boolean
  keySize: number
  signatureSize: number
}

/** Reshare request */
export interface ReshareRequest {
  keyId: string
  newPartyIds: string[]
  newThreshold: number
}

/** Refresh request */
export interface RefreshRequest {
  keyId: string
}

/** Batch sign request */
export interface BatchSignRequest {
  keyId: string
  messageHashes: string[]
}

/** Session info */
export interface SessionInfo {
  sessionId: string
  type: 'keygen' | 'sign' | 'reshare' | 'refresh'
  keyId: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  requestingChain?: string
  createdAt: number
  expiresAt?: number
  completedAt?: number
  error?: string
}

/** Session list options */
export interface SessionListOptions {
  chainId?: string
  status?: string
  limit?: number
}

/** Network stats */
export interface NetworkStats {
  totalKeys: number
  totalSignatures: number
  activeSessions: number
  uptime: number
}

/** Quota info */
export interface QuotaInfo {
  chainId: string
  dailyLimit: number
  used: number
  remaining: number
  resetsAt: number
}

/** Health status */
export interface HealthStatus {
  healthy: boolean
  ready: boolean
  version: string
  uptime: number
}

/** Threshold info */
export interface ThresholdInfo {
  version: string
  networkId: string
  chainId: string
  supportedProtocols: Protocol[]
  supportedChains: Chain[]
  maxActiveSessions: number
  currentSessions: number
}

/** T-Chain client options */
export interface ThresholdClientOptions {
  /** T-Chain RPC endpoint */
  endpoint: string
  /** Requesting chain ID */
  chainId?: string
  /** Request timeout in ms */
  timeout?: number
}

/** JSON-RPC request */
export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params: unknown
}

/** JSON-RPC response */
export interface JsonRpcResponse<T> {
  jsonrpc: '2.0'
  id: number
  result?: T
  error?: {
    code: number
    message: string
    data?: unknown
  }
}
