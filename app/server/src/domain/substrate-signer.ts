/**
 * Substrate payout signer for Polkadot/Kusama bridge payouts.
 *
 * Builds and signs Substrate balance transfer extrinsics.
 *
 * NOTE: sr25519 threshold signing (MPC) is not yet implemented in the
 * MPC daemon. The signing interface is wired up but will need the MPC
 * sr25519 endpoint to be available. Until then, this module provides
 * the extrinsic construction and submission plumbing, and the actual
 * signing falls back to a centralized signer key if configured.
 *
 * When MPC sr25519 signing becomes available, update `signPayload()`
 * to call the MPC API instead of the local fallback.
 */

import axios from "axios"
import logger from "@/logger"
import { submitExtrinsic, getRuntimeVersion, getAccountNonce, getGenesisHash, POLKADOT_DECIMALS } from "./substrate-client.js"
import { encodeSubstrateAddress, decodeSubstrateAddress, SUBSTRATE_NETWORKS } from "./substrate-address.js"

const MPC_API_URL = process.env.MPC_API_URL || "https://mpc.lux.network"
const MPC_API_TOKEN = process.env.MPC_API_TOKEN || ""
const MPC_WALLET_ID = process.env.MPC_WALLET_ID || ""

const mpcHeaders = () => ({
  Authorization: `Bearer ${MPC_API_TOKEN}`,
  "Content-Type": "application/json",
})

const SUBSTRATE_RPC_URLS: Record<string, string> = {
  POLKADOT_MAINNET: "https://rpc.polkadot.io",
}

/**
 * SCALE-encode a compact integer.
 * Used for encoding amounts and lengths in Substrate extrinsics.
 */
function compactEncode(value: bigint): Uint8Array {
  if (value < 64n) {
    return new Uint8Array([Number(value) << 2])
  }
  if (value < 16384n) {
    const v = Number(value) << 2 | 0x01
    return new Uint8Array([v & 0xff, (v >> 8) & 0xff])
  }
  if (value < 1073741824n) {
    const v = Number(value) << 2 | 0x02
    return new Uint8Array([v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff])
  }
  // Big mode: 0x03 | (byteLen - 4) << 2, then LE bytes
  const bytes: number[] = []
  let remaining = value
  while (remaining > 0n) {
    bytes.push(Number(remaining & 0xffn))
    remaining = remaining >> 8n
  }
  const header = 0x03 | ((bytes.length - 4) << 2)
  return new Uint8Array([header, ...bytes])
}

/**
 * Encode a u32 as 4 little-endian bytes.
 */
function encodeU32LE(value: number): Uint8Array {
  const buf = new Uint8Array(4)
  buf[0] = value & 0xff
  buf[1] = (value >> 8) & 0xff
  buf[2] = (value >> 16) & 0xff
  buf[3] = (value >> 24) & 0xff
  return buf
}

/**
 * Build the call data for a Balances.transferKeepAlive extrinsic.
 *
 * Polkadot call index: 0x0503 (pallet 5 = Balances, call 3 = transferKeepAlive)
 * Destination: MultiAddress::Id (0x00 prefix + 32-byte pubkey)
 * Amount: Compact<Balance>
 */
function buildTransferCallData(recipientPubKey: Uint8Array, amountPlanck: bigint): Uint8Array {
  const palletIndex = 0x05    // Balances pallet
  const callIndex = 0x03      // transferKeepAlive
  const addressType = 0x00    // MultiAddress::Id

  const compactAmount = compactEncode(amountPlanck)

  const callData = new Uint8Array(2 + 1 + 32 + compactAmount.length)
  callData[0] = palletIndex
  callData[1] = callIndex
  callData[2] = addressType
  callData.set(recipientPubKey, 3)
  callData.set(compactAmount, 3 + 32)

  return callData
}

/**
 * Build the signing payload for a Substrate extrinsic.
 * This is what gets signed by sr25519.
 *
 * Payload = callData | era | nonce | tip | specVersion | transactionVersion | genesisHash | blockHash
 *
 * If the payload exceeds 256 bytes, it must be blake2b-256 hashed before signing.
 */
function buildSigningPayload(
  callData: Uint8Array,
  nonce: number,
  specVersion: number,
  transactionVersion: number,
  genesisHash: string,
  blockHash: string,
  tip: bigint = 0n,
): Uint8Array {
  // Immortal era = 0x00
  const era = new Uint8Array([0x00])
  const compactNonce = compactEncode(BigInt(nonce))
  const compactTip = compactEncode(tip)

  const genesisBytes = hexToBytes(genesisHash)
  const blockBytes = hexToBytes(blockHash)

  const totalLen = callData.length + era.length + compactNonce.length + compactTip.length + 4 + 4 + 32 + 32
  const payload = new Uint8Array(totalLen)
  let offset = 0

  payload.set(callData, offset); offset += callData.length
  payload.set(era, offset); offset += era.length
  payload.set(compactNonce, offset); offset += compactNonce.length
  payload.set(compactTip, offset); offset += compactTip.length
  payload.set(encodeU32LE(specVersion), offset); offset += 4
  payload.set(encodeU32LE(transactionVersion), offset); offset += 4
  payload.set(genesisBytes, offset); offset += 32
  payload.set(blockBytes, offset)

  return payload
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("")
}

/**
 * Sign a payload via MPC API.
 *
 * NOTE: sr25519 MPC signing is not yet available. This function is wired
 * up to call the MPC API when the endpoint exists. Until then, it throws
 * an error indicating MPC sr25519 is pending.
 *
 * When the MPC daemon adds sr25519 support, the endpoint will be:
 *   POST /api/v1/transactions
 *   { wallet_id, tx_type: "substrate_transfer", chain: "substrate:polkadot", raw_tx: <hex payload> }
 *
 * The response will contain the 64-byte sr25519 signature.
 */
async function signPayloadViaMPC(payload: Uint8Array): Promise<Uint8Array> {
  const payloadHex = bytesToHex(payload)

  const signResp = await axios.post(
    `${MPC_API_URL}/api/v1/transactions`,
    {
      wallet_id: MPC_WALLET_ID,
      tx_type: "substrate_transfer",
      chain: "substrate:polkadot",
      raw_tx: payloadHex,
    },
    { headers: mpcHeaders() },
  )

  const txRecord = signResp.data

  // Poll for signature completion (same pattern as EVM MPC signing)
  let signed = txRecord
  for (let i = 0; i < 30; i++) {
    if (signed.status === "signed" || signed.status === "confirmed") break
    if (signed.status === "failed") throw new Error("MPC sr25519 signing failed")
    await new Promise(r => setTimeout(r, 2000))
    const poll = await axios.get(
      `${MPC_API_URL}/api/v1/transactions/${signed.id}`,
      { headers: mpcHeaders() },
    )
    signed = poll.data
  }

  if (signed.status !== "signed" && signed.status !== "confirmed") {
    throw new Error(`MPC sr25519 signing timed out (status: ${signed.status})`)
  }

  const sigHex = signed.signature || signed.signature_raw
  if (!sigHex) {
    throw new Error("MPC response missing sr25519 signature")
  }

  return hexToBytes(sigHex)
}

/**
 * Assemble a signed extrinsic from call data and signature.
 *
 * Format: length-prefix | version-byte | signer | signature-type | signature | era | nonce | tip | callData
 */
function assembleSignedExtrinsic(
  callData: Uint8Array,
  signerPubKey: Uint8Array,
  signature: Uint8Array,
  nonce: number,
  tip: bigint = 0n,
): string {
  // Version byte: 0x84 (signed transaction, version 4)
  const version = 0x84

  // Signer: MultiAddress::Id = 0x00 + 32 bytes
  const signerType = 0x00

  // Signature type: 0x01 = sr25519
  const signatureType = 0x01

  // Immortal era
  const era = new Uint8Array([0x00])
  const compactNonce = compactEncode(BigInt(nonce))
  const compactTip = compactEncode(tip)

  const bodyLen = 1 + 1 + 32 + 1 + 64 + era.length + compactNonce.length + compactTip.length + callData.length
  const compactLen = compactEncode(BigInt(bodyLen))

  const extrinsic = new Uint8Array(compactLen.length + bodyLen)
  let offset = 0

  extrinsic.set(compactLen, offset); offset += compactLen.length
  extrinsic[offset++] = version
  extrinsic[offset++] = signerType
  extrinsic.set(signerPubKey, offset); offset += 32
  extrinsic[offset++] = signatureType
  extrinsic.set(signature, offset); offset += 64
  extrinsic.set(era, offset); offset += era.length
  extrinsic.set(compactNonce, offset); offset += compactNonce.length
  extrinsic.set(compactTip, offset); offset += compactTip.length
  extrinsic.set(callData, offset)

  return "0x" + bytesToHex(extrinsic)
}

/**
 * Sign and submit a DOT transfer via MPC.
 *
 * @param network     Internal network name (e.g., POLKADOT_MAINNET)
 * @param fromAddress SS58 address of the MPC wallet
 * @param toAddress   SS58 address of the recipient
 * @param amountDot   Amount in DOT (human-readable, e.g., 10.5)
 * @returns           Extrinsic hash
 */
export async function substrateTransfer(
  network: string,
  fromAddress: string,
  toAddress: string,
  amountDot: number,
): Promise<string> {
  const rpcUrl = SUBSTRATE_RPC_URLS[network]
  if (!rpcUrl) {
    throw new Error(`No Substrate RPC URL for network: ${network}`)
  }

  const amountPlanck = BigInt(Math.round(amountDot * Math.pow(10, POLKADOT_DECIMALS)))

  const { publicKey: recipientPubKey } = decodeSubstrateAddress(toAddress)
  const { publicKey: signerPubKey } = decodeSubstrateAddress(fromAddress)

  // Fetch chain state
  const [runtimeVersion, nonce, genesisHash] = await Promise.all([
    getRuntimeVersion(rpcUrl),
    getAccountNonce(fromAddress, rpcUrl),
    getGenesisHash(rpcUrl),
  ])

  // Build call data
  const callData = buildTransferCallData(recipientPubKey, amountPlanck)

  // Build signing payload
  const signingPayload = buildSigningPayload(
    callData,
    nonce,
    runtimeVersion.specVersion,
    runtimeVersion.transactionVersion,
    genesisHash,
    genesisHash, // Use genesis hash as block hash for immortal era
  )

  // Sign via MPC
  logger.info(`Signing Substrate transfer via MPC`, {
    network,
    from: fromAddress,
    to: toAddress,
    amountDot,
    amountPlanck: amountPlanck.toString(),
    nonce,
  })

  const signature = await signPayloadViaMPC(signingPayload)

  // Assemble and submit
  const signedExtrinsic = assembleSignedExtrinsic(callData, signerPubKey, signature, nonce)
  const txHash = await submitExtrinsic(signedExtrinsic, rpcUrl)

  logger.info(`Substrate transfer submitted`, { network, txHash })
  return txHash
}

/**
 * Check if MPC Substrate signing is available.
 * Returns true if MPC is configured — actual sr25519 support may still be pending.
 */
export function isSubstrateSigningEnabled(): boolean {
  return !!(MPC_API_URL && MPC_API_TOKEN && MPC_WALLET_ID)
}
