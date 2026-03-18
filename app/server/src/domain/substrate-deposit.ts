/**
 * Deposit detection for Substrate-based chains (Polkadot, Kusama).
 *
 * Follows the same pattern as checkEVMDeposit/checkBTCDeposit/checkTONDeposit
 * in mpc-wallet.ts — polls the on-chain balance at the deposit address and
 * compares it against the required amount.
 */

import logger from "@/logger"
import { getBalance, POLKADOT_DECIMALS } from "./substrate-client.js"

const SUBSTRATE_RPC_URLS: Record<string, string> = {
  POLKADOT_MAINNET: "https://rpc.polkadot.io",
}

/**
 * Check whether a deposit of at least `requiredAmount` DOT has arrived
 * at the given Substrate address.
 *
 * @param network        Internal network name (e.g., POLKADOT_MAINNET)
 * @param address        SS58-encoded deposit address
 * @param requiredAmount Required amount in human-readable units (e.g., 10.5 DOT)
 * @returns              true if balance >= requiredAmount
 */
export async function checkSubstrateDeposit(
  network: string,
  address: string,
  requiredAmount: number,
): Promise<boolean> {
  const rpcUrl = SUBSTRATE_RPC_URLS[network]
  if (!rpcUrl) {
    logger.warn(`No Substrate RPC URL for network ${network}`)
    return false
  }

  try {
    const balancePlanck = await getBalance(address, rpcUrl)
    const balanceDot = Number(balancePlanck) / Math.pow(10, POLKADOT_DECIMALS)
    logger.info(`Substrate deposit check: ${address} has ${balanceDot} DOT (need ${requiredAmount})`, {
      network,
      balancePlanck: balancePlanck.toString(),
      balanceDot,
      requiredAmount,
    })
    return balanceDot >= requiredAmount
  } catch (error) {
    logger.error(`Substrate deposit check failed for ${network}/${address}`, { error })
    return false
  }
}

export { SUBSTRATE_RPC_URLS }
