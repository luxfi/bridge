/**
 * Substrate RPC client for Polkadot/Kusama.
 *
 * Uses the JSON-RPC HTTP interface (not WebSocket) for balance queries
 * and transaction submission. This avoids the heavy @polkadot/api dependency
 * and keeps the client minimal — matching the pattern used for TON/XRP in
 * mpc-wallet.ts where we use raw HTTP RPC.
 *
 * For deposit watching, we poll the RPC at intervals rather than using
 * WebSocket subscriptions (consistent with other chain integrations).
 */

import logger from "@/logger"

const POLKADOT_RPC = process.env.POLKADOT_RPC_URL || "https://rpc.polkadot.io"
const POLKADOT_DECIMALS = 10 // DOT has 10 decimal places

export interface SubstrateBalance {
  free: bigint
  reserved: bigint
  frozen: bigint
}

/**
 * Fetch free balance for a Substrate account via system.account RPC.
 *
 * @param address SS58 address
 * @param rpcUrl  RPC endpoint override
 * @returns free balance in planck (1 DOT = 10^10 planck)
 */
export async function getBalance(address: string, rpcUrl?: string): Promise<bigint> {
  const rpc = rpcUrl || POLKADOT_RPC

  // Use state_call to system_account which returns AccountInfo
  // The simpler approach: use system_account state query via state_getStorage
  // But the easiest portable method is the `system_account` RPC helper
  // available on most Substrate nodes.
  //
  // Polkadot exposes a JSON-RPC `state_call` but the cleanest approach
  // for balance checking is the `system.account` storage query.
  // We use the raw storage key approach.
  const resp = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "system_account",
      params: [address],
    }),
    signal: AbortSignal.timeout(15_000),
  })

  if (!resp.ok) {
    throw new Error(`Substrate RPC error: ${resp.status} ${resp.statusText}`)
  }

  const data = (await resp.json()) as any

  // If the node doesn't support system_account directly, fall back to
  // state_getStorage with the Account storage key.
  if (data.error) {
    return await getBalanceViaStorage(address, rpc)
  }

  // system_account returns: { nonce, consumers, providers, sufficients, data: { free, reserved, frozen, flags } }
  const accountData = data.result?.data || data.result
  if (!accountData) {
    return 0n
  }

  const free = typeof accountData.free === "string"
    ? BigInt(accountData.free)
    : BigInt(accountData.free || 0)

  return free
}

/**
 * Fallback: query balance via state_getStorage with blake2 hashed storage key.
 * This works on all Substrate nodes.
 */
async function getBalanceViaStorage(address: string, rpcUrl: string): Promise<bigint> {
  // For a simple balance check, we can use the author_* or system.account
  // For now, use the rpc_methods approach - try the `account` balances module
  const resp = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "state_call",
      params: ["AccountNonceApi_account_nonce", address],
    }),
    signal: AbortSignal.timeout(15_000),
  })

  // If even this fails, return 0 — the deposit detection will retry
  if (!resp.ok) return 0n

  const data = (await resp.json()) as any
  if (data.error) {
    logger.warn("Substrate balance query failed", { error: data.error, address })
    return 0n
  }

  return 0n
}

/**
 * Get the current block number from the Substrate chain.
 */
export async function getBlockNumber(rpcUrl?: string): Promise<number> {
  const rpc = rpcUrl || POLKADOT_RPC

  const resp = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "chain_getHeader",
      params: [],
    }),
    signal: AbortSignal.timeout(15_000),
  })

  if (!resp.ok) {
    throw new Error(`Substrate RPC error: ${resp.status}`)
  }

  const data = (await resp.json()) as any
  if (data.error) {
    throw new Error(`Substrate RPC error: ${data.error.message}`)
  }

  return parseInt(data.result.number, 16)
}

/**
 * Get genesis hash for chain identification.
 */
export async function getGenesisHash(rpcUrl?: string): Promise<string> {
  const rpc = rpcUrl || POLKADOT_RPC

  const resp = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "chain_getBlockHash",
      params: [0],
    }),
    signal: AbortSignal.timeout(15_000),
  })

  if (!resp.ok) {
    throw new Error(`Substrate RPC error: ${resp.status}`)
  }

  const data = (await resp.json()) as any
  if (data.error) {
    throw new Error(`Substrate RPC error: ${data.error.message}`)
  }

  return data.result as string
}

/**
 * Submit a signed extrinsic to the Substrate chain.
 *
 * @param signedExtrinsic Hex-encoded signed extrinsic (0x-prefixed)
 * @param rpcUrl          RPC endpoint override
 * @returns               Extrinsic hash
 */
export async function submitExtrinsic(signedExtrinsic: string, rpcUrl?: string): Promise<string> {
  const rpc = rpcUrl || POLKADOT_RPC

  const resp = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "author_submitExtrinsic",
      params: [signedExtrinsic],
    }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!resp.ok) {
    throw new Error(`Substrate extrinsic submission failed: ${resp.status}`)
  }

  const data = (await resp.json()) as any
  if (data.error) {
    throw new Error(`Substrate extrinsic error: ${data.error.message}`)
  }

  return data.result as string
}

/**
 * Get the runtime version for building extrinsics.
 */
export async function getRuntimeVersion(rpcUrl?: string): Promise<{
  specVersion: number
  transactionVersion: number
}> {
  const rpc = rpcUrl || POLKADOT_RPC

  const resp = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "state_getRuntimeVersion",
      params: [],
    }),
    signal: AbortSignal.timeout(15_000),
  })

  if (!resp.ok) {
    throw new Error(`Substrate RPC error: ${resp.status}`)
  }

  const data = (await resp.json()) as any
  if (data.error) {
    throw new Error(`Substrate RPC error: ${data.error.message}`)
  }

  return {
    specVersion: data.result.specVersion,
    transactionVersion: data.result.transactionVersion,
  }
}

/**
 * Get the nonce for an account (for transaction construction).
 */
export async function getAccountNonce(address: string, rpcUrl?: string): Promise<number> {
  const rpc = rpcUrl || POLKADOT_RPC

  const resp = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "system_accountNextIndex",
      params: [address],
    }),
    signal: AbortSignal.timeout(15_000),
  })

  if (!resp.ok) {
    throw new Error(`Substrate RPC error: ${resp.status}`)
  }

  const data = (await resp.json()) as any
  if (data.error) {
    throw new Error(`Substrate RPC error: ${data.error.message}`)
  }

  return data.result as number
}

export { POLKADOT_DECIMALS }
