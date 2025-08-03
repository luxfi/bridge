import { bridgeMPC } from "./mpc-bridge"

/**
 * Modern MPC integration for Lux Bridge
 * Replaces the old Rust-based implementation with Go-based Lux MPC
 */

/**
 * Get signature from MPC oracle network
 */
export const getSigFromMpcOracleNetwork = async (signData: {
  txId: string
  fromNetworkId: string
  toNetworkId: string
  toTokenAddress: string
  msgSignature: string
  receiverAddressHash: string
}) => {
  console.log("::signdata:", signData)
  
  // Ensure MPC service is initialized
  await bridgeMPC.initialize()
  
  // Generate signature using modern MPC
  const response = await bridgeMPC.generateMPCSignature(signData)
  
  if (!response.status) {
    throw new Error(response.msg || "MPC signature generation failed")
  }
  
  return response.data
}

/**
 * Update MPC node to complete swap
 */
export const completeSwapWithMpc = async (hashedTxId: string) => {
  try {
    const result = await bridgeMPC.completeSwap(hashedTxId)
    return result
  } catch (err) {
    console.log(">> error in updating complete swap for mpc", err)
    throw err
  }
}

/**
 * Get MPC network health status
 */
export const getMpcHealthStatus = async () => {
  return bridgeMPC.getHealthStatus()
}