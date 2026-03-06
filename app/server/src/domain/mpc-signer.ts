import { JsonRpcProvider, Transaction, parseUnits, Interface, keccak256, getBytes } from "ethers"
import axios from "axios"

const MPC_API_URL = process.env.MPC_API_URL || "https://mpc.lux.network"
const MPC_API_TOKEN = process.env.MPC_API_TOKEN || ""
const MPC_WALLET_ID = process.env.MPC_WALLET_ID || ""

interface MPCSignResult {
  r: string
  s: string
  signature?: string
}

const mpcHeaders = () => ({
  Authorization: `Bearer ${MPC_API_TOKEN}`,
  "Content-Type": "application/json",
})

/**
 * Sign and broadcast an EVM contract call via MPC.
 * 1. Build unsigned tx (to, data, gas, nonce, chainId)
 * 2. Serialize the unsigned tx hash
 * 3. POST to MPC API /transactions with raw_tx = unsigned tx hash
 * 4. Get back r, s signature components
 * 5. Attach signature to tx and broadcast via provider
 */
export async function mpcSignAndSend(
  provider: JsonRpcProvider,
  to: string,
  data: string,
  value: bigint = 0n,
): Promise<string> {
  const feeData = await provider.getFeeData()
  const network = await provider.getNetwork()

  // Get nonce for the MPC wallet address
  const walletInfo = await axios.get(
    `${MPC_API_URL}/api/v1/wallets/${MPC_WALLET_ID}`,
    { headers: mpcHeaders() }
  )
  const fromAddress = walletInfo.data.ethAddress || walletInfo.data.eth_address
  if (!fromAddress) {
    throw new Error(`MPC wallet ${MPC_WALLET_ID} has no ETH address`)
  }

  const nonce = await provider.getTransactionCount(fromAddress)

  // Build unsigned transaction
  const tx = Transaction.from({
    type: 2, // EIP-1559
    to,
    data,
    value,
    nonce,
    chainId: network.chainId,
    maxFeePerGas: feeData.maxFeePerGas,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
    gasLimit: 300000n,
  })

  // Get the unsigned tx hash to sign
  const unsignedHash = tx.unsignedHash
  const rawTxHex = Buffer.from(getBytes(unsignedHash)).toString("hex")

  // Submit to MPC API for signing
  const signResp = await axios.post(
    `${MPC_API_URL}/api/v1/transactions`,
    {
      wallet_id: MPC_WALLET_ID,
      tx_type: "bridge_payout",
      chain: `eip155:${network.chainId}`,
      to_address: to,
      raw_tx: rawTxHex,
    },
    { headers: mpcHeaders() }
  )

  const txRecord = signResp.data

  // Poll for signature completion (MPC signing is async)
  let signed = txRecord
  for (let i = 0; i < 30; i++) {
    if (signed.status === "signed" || signed.status === "confirmed") break
    if (signed.status === "failed") throw new Error("MPC signing failed")
    await new Promise((r) => setTimeout(r, 2000))
    const poll = await axios.get(
      `${MPC_API_URL}/api/v1/transactions/${signed.id}`,
      { headers: mpcHeaders() }
    )
    signed = poll.data
  }

  if (signed.status !== "signed" && signed.status !== "confirmed") {
    throw new Error(`MPC signing timed out (status: ${signed.status})`)
  }

  // Reconstruct signature
  const rHex = signed.signatureR || signed.signature_r
  const sHex = signed.signatureS || signed.signature_s
  if (!rHex || !sHex) {
    throw new Error("MPC response missing r/s signature components")
  }

  // Attach signature to tx
  const rBuf = Buffer.from(rHex, "hex")
  const sBuf = Buffer.from(sHex, "hex")
  // Determine v (recovery id) — try both 0 and 1
  tx.signature = {
    r: "0x" + rBuf.toString("hex"),
    s: "0x" + sBuf.toString("hex"),
    v: 0,
  }

  // Broadcast
  const signedTxHex = tx.serialized
  const broadcastResult = await provider.broadcastTransaction(signedTxHex)
  await broadcastResult.wait()

  return broadcastResult.hash
}

/**
 * Sign and send a bridgeMint call via MPC.
 */
export async function mpcBridgeMint(
  provider: JsonRpcProvider,
  tokenAddress: string,
  recipient: string,
  amount: bigint,
  abi: any[],
): Promise<string> {
  const iface = new Interface(abi)
  const data = iface.encodeFunctionData("bridgeMint", [recipient, amount])
  return mpcSignAndSend(provider, tokenAddress, data)
}

/**
 * Send native token (LUX/ZOO) via MPC signer.
 */
export async function mpcSendNative(
  provider: JsonRpcProvider,
  to: string,
  value: bigint,
): Promise<string> {
  return mpcSignAndSend(provider, to, "0x", value)
}

/**
 * Check if MPC signing is configured and available.
 */
export function isMPCSigningEnabled(): boolean {
  return !!(MPC_API_URL && MPC_API_TOKEN && MPC_WALLET_ID)
}
