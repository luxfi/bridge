// EVM signer wired through the canonical MPCClient.
//
// Replaces the legacy axios/polling-against-/api/v1/transactions code
// path with a single MPCClient.sign() round-trip plus a getWallet()
// for address lookup. All bridge → mpcd traffic now flows through the
// same wire protocol as ~/work/lux/kms/pkg/mpc/client.go.
//
// Env (brand-neutral):
//   BRIDGE_MPC_URL              required (mpcd base URL)
//   BRIDGE_IAM_ISSUER           required (auth)
//   BRIDGE_IAM_CLIENT_ID        required (auth)
//   BRIDGE_IAM_CLIENT_SECRET    required (auth — from KMS in prod)
//   BRIDGE_MPC_WALLET_ID        EVM signer wallet id (required to enable)
//
// Standalone-friendly: isMPCSigningEnabled() returns false when the env
// block is incomplete; callers fall back to LUX_SIGNER (legacy private
// key) as documented in domain/swaps.ts. No crashes at module load.

import {
  JsonRpcProvider,
  Transaction,
  Interface,
  getBytes,
} from "ethers"

import { IAMClient } from "@/clients/iam"
import { MPCClient } from "@/clients/mpc"
import logger from "@/logger"

// Lazily-built singleton MPC client. Env is read on first call so test
// fixtures can mutate process.env without import-order issues.
let _mpcClient: MPCClient | undefined
function getMpcClient(): MPCClient | undefined {
  if (_mpcClient) return _mpcClient
  const url = process.env.BRIDGE_MPC_URL
  const issuer = process.env.BRIDGE_IAM_ISSUER
  const clientId = process.env.BRIDGE_IAM_CLIENT_ID
  const clientSecret = process.env.BRIDGE_IAM_CLIENT_SECRET
  if (!url || !issuer || !clientId || !clientSecret) return undefined
  const iam = new IAMClient({ issuer, clientId, clientSecret })
  _mpcClient = new MPCClient({ url, iam })
  return _mpcClient
}

/** Test hook — drop the cached client so a fresh env config rebuilds it. */
export function _resetMpcClientForTests(): void {
  _mpcClient = undefined
}

/**
 * Sign and broadcast an EVM contract call via the canonical MPCClient.
 *
 * Flow:
 *   1. Resolve the bridge's settlement wallet (MPCClient.getWallet) to
 *      get its ETH address.
 *   2. Build an unsigned EIP-1559 transaction with the right nonce
 *      against `provider`.
 *   3. Compute the unsigned tx hash bytes.
 *   4. Call MPCClient.sign — one HTTP round-trip; mpcd handles the
 *      threshold round internally and returns r/s/v.
 *   5. Attach the signature and broadcast.
 *
 * Compared to the previous /api/v1/transactions + polling implementation
 * this is ~2× shorter and one network round-trip instead of N polls.
 */
export async function mpcSignAndSend(
  provider: JsonRpcProvider,
  to: string,
  data: string,
  value: bigint = 0n,
): Promise<string> {
  const client = getMpcClient()
  if (!client) {
    throw new Error(
      "MPC signing unavailable: BRIDGE_MPC_URL / BRIDGE_IAM_* env block is incomplete",
    )
  }
  const walletId = process.env.BRIDGE_MPC_WALLET_ID
  if (!walletId) {
    throw new Error(
      "MPC signing unavailable: BRIDGE_MPC_WALLET_ID is not set",
    )
  }

  // 1. Wallet → ETH address.
  const wallet = await client.getWallet(walletId)
  const fromAddress = wallet.ethAddress
  if (!fromAddress) {
    throw new Error(
      `MPC wallet ${walletId} has no eth_address (keygen incomplete?)`,
    )
  }

  // 2. Unsigned tx.
  const feeData = await provider.getFeeData()
  const network = await provider.getNetwork()
  const nonce = await provider.getTransactionCount(fromAddress)

  const tx = Transaction.from({
    type: 2, // EIP-1559
    to,
    data,
    value,
    nonce,
    chainId: network.chainId,
    maxFeePerGas: feeData.maxFeePerGas,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
    gasLimit: 300_000n,
  })

  // 3. Hash to sign.
  const unsignedHashBytes = getBytes(tx.unsignedHash)

  // 4. Threshold sign — single round-trip.
  const result = await client.sign({
    walletId,
    keyType: "secp256k1",
    message: unsignedHashBytes,
  })

  // 5. Attach signature + broadcast.
  let r = result.r
  let s = result.s
  let v = result.v
  if (!r || !s) {
    // Some mpcd response shapes return the compact 65-byte signature in
    // result.signature (hex). Split it manually as a fallback.
    const sigHex = result.signature.replace(/^0x/, "")
    if (sigHex.length < 130) {
      throw new Error(
        `MPC sign returned signature too short to split (got ${sigHex.length} hex chars; expected ≥130 for r||s||v)`,
      )
    }
    r = "0x" + sigHex.slice(0, 64)
    s = "0x" + sigHex.slice(64, 128)
    v = parseInt(sigHex.slice(128, 130), 16)
  }
  // EIP-155: v should be 27 or 28 (or chainId*2 + 35/36, but tx.signature
  // accepts the raw 27/28 form and ethers handles the rest at serialize).
  if (typeof v !== "number") v = 27
  if (v < 27) v += 27

  tx.signature = {
    r: r.startsWith("0x") ? r : "0x" + r,
    s: s.startsWith("0x") ? s : "0x" + s,
    v,
  }

  const broadcast = await provider.broadcastTransaction(tx.serialized)
  await broadcast.wait()
  logger.info(
    `[mpc-signer] broadcast tx=${broadcast.hash} from=${fromAddress} via mpcd wallet=${walletId}`,
  )
  return broadcast.hash
}

/**
 * Sign and send a `bridgeMint(recipient, amount)` call via MPC.
 */
export async function mpcBridgeMint(
  provider: JsonRpcProvider,
  tokenAddress: string,
  recipient: string,
  amount: bigint,
  abi: unknown[],
): Promise<string> {
  const iface = new Interface(abi as ConstructorParameters<typeof Interface>[0])
  const data = iface.encodeFunctionData("bridgeMint", [recipient, amount])
  return mpcSignAndSend(provider, tokenAddress, data)
}

/**
 * Send native token via MPC signer.
 */
export async function mpcSendNative(
  provider: JsonRpcProvider,
  to: string,
  value: bigint,
): Promise<string> {
  return mpcSignAndSend(provider, to, "0x", value)
}

/**
 * MPC signing is enabled iff the full BRIDGE_MPC_* + BRIDGE_IAM_* env
 * block + BRIDGE_MPC_WALLET_ID are all set. Callers branch on this to
 * fall back to LUX_SIGNER (legacy private key) when running standalone.
 */
export function isMPCSigningEnabled(): boolean {
  return !!(
    process.env.BRIDGE_MPC_URL &&
    process.env.BRIDGE_IAM_ISSUER &&
    process.env.BRIDGE_IAM_CLIENT_ID &&
    process.env.BRIDGE_IAM_CLIENT_SECRET &&
    process.env.BRIDGE_MPC_WALLET_ID
  )
}
