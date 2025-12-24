// Copyright (C) 2019-2025, Lux Industries, Inc. All rights reserved.
// See the file LICENSE for licensing terms.

/**
 * @luxfi/threshold - T-Chain (ThresholdVM) SDK
 *
 * TypeScript SDK for interacting with T-Chain MPC threshold signatures.
 *
 * @example
 * ```ts
 * import { ThresholdClient } from '@luxfi/threshold'
 *
 * const client = new ThresholdClient({
 *   endpoint: 'http://localhost:9650/ext/bc/T'
 * })
 *
 * // Generate key for Ethereum (auto-selects LSS protocol)
 * const keygen = await client.keygen({ keyId: 'eth-key', chain: 'ethereum' })
 * const result = await client.waitForKeygen(keygen.sessionId)
 *
 * // Generate key for Solana (auto-selects FROST protocol)
 * const solKeygen = await client.keygen({ keyId: 'sol-key', chain: 'solana' })
 *
 * // Sign with a key
 * const sig = await client.signAndWait({
 *   keyId: 'eth-key',
 *   messageHash: '0x...',
 *   messageType: 'eth_sign'
 * })
 * ```
 *
 * @packageDocumentation
 */

export { ThresholdClient } from './client'
export type {
  // Client options
  ThresholdClientOptions,

  // Protocol types
  Protocol,
  Chain,
  ProtocolInfo,
  ChainConfig,

  // Keygen
  KeygenRequest,
  KeygenResponse,

  // Sign
  SignRequest,
  SignResponse,
  SignatureResponse,

  // Key management
  KeyInfo,
  ReshareRequest,
  RefreshRequest,

  // Session management
  SessionInfo,
  SessionListOptions,

  // Network info
  NetworkStats,
  QuotaInfo,
  HealthStatus,
  ThresholdInfo,

  // JSON-RPC
  JsonRpcRequest,
  JsonRpcResponse,
} from './types'
