import { SwapStatus } from "@luxfi/core"
import { JsonRpcProvider } from "ethers"

import logger from "@/logger"
import { prisma } from "@/prisma-instance"
import { handlerUtilaPayoutAction } from "./swaps"

const POLL_INTERVAL_MS = 15_000 // 15 seconds
const MAX_SWAP_AGE_HOURS = 72

// RPC endpoints for verifying transfers on-chain
// Zoo is an L2 subnet on Lux, NOT the Z-chain (ZK VM)
const RPC_URLS: Record<string, string> = {
  LUX_MAINNET: "https://api.lux.network/ext/bc/C/rpc",
  LUX_TESTNET: "https://api.lux-test.network/ext/bc/C/rpc",
  LUX_DEVNET: "https://api.lux-dev.network/ext/bc/C/rpc",
  ZOO_MAINNET: "https://api.lux.network/ext/bc/zoo/rpc",
  ZOO_TESTNET: "https://api.lux-test.network/ext/bc/zoo/rpc",
  ZOO_DEVNET: "https://api.lux-dev.network/ext/bc/zoo/rpc",
}

/**
 * Verify that a teleporter transfer tx exists on-chain.
 */
async function verifyTransferOnChain(
  networkName: string,
  txHash: string
): Promise<boolean> {
  const rpcUrl = RPC_URLS[networkName]
  if (!rpcUrl) return false

  try {
    const provider = new JsonRpcProvider(rpcUrl)
    const receipt = await provider.getTransactionReceipt(txHash)
    return receipt !== null && receipt.status === 1
  } catch {
    return false
  }
}

/**
 * Process a single stuck teleporter swap:
 * 1. Verify the user's transfer tx on source chain
 * 2. If confirmed, trigger payout via handlerUtilaPayoutAction
 */
async function processSwap(swap: any): Promise<void> {
  const swapId = swap.id
  const sourceName = swap.source_network?.internal_name

  // Find the input transaction
  const inputTx = swap.transactions?.find((t: any) => t.type === "input")
  if (!inputTx?.transaction_hash) {
    logger.warn(`[teleport-processor] Swap ${swapId} has no input tx hash — skipping`)
    return
  }

  // Verify the transfer on-chain
  const verified = await verifyTransferOnChain(sourceName, inputTx.transaction_hash)
  if (!verified) {
    logger.info(`[teleport-processor] Swap ${swapId} transfer not yet confirmed on ${sourceName}`)
    return
  }

  // Trigger payout — handlerUtilaPayoutAction now accepts TeleportProcessPending
  logger.info(`[teleport-processor] Swap ${swapId} transfer verified — triggering payout`)
  try {
    const result = await handlerUtilaPayoutAction(swapId)
    logger.info(`[teleport-processor] Swap ${swapId} payout result: ${result.status}`)
  } catch (err: any) {
    logger.error(`[teleport-processor] Swap ${swapId} payout failed: ${err.message}`)
  }
}

/**
 * Single poll iteration: find all TeleportProcessPending swaps and process them.
 */
async function pollOnce(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - MAX_SWAP_AGE_HOURS * 3600_000)
    const stuckSwaps = await prisma.swap.findMany({
      where: {
        status: SwapStatus.TeleportProcessPending,
        created_date: { gte: cutoff },
      },
      include: {
        source_network: true,
        source_asset: true,
        destination_network: true,
        destination_asset: true,
        quotes: true,
        transactions: true,
      },
    })

    if (stuckSwaps.length > 0) {
      logger.info(`[teleport-processor] Found ${stuckSwaps.length} pending teleporter swap(s)`)
    }

    for (const swap of stuckSwaps) {
      await processSwap(swap)
    }
  } catch (err: any) {
    logger.error(`[teleport-processor] Poll error: ${err.message}`)
  }
}

/**
 * Start the teleporter swap processor background loop.
 */
export function startTeleportProcessor(): void {
  logger.info(`[teleport-processor] Starting (poll every ${POLL_INTERVAL_MS / 1000}s)`)
  // First poll immediately
  pollOnce()
  // Then on interval
  setInterval(pollOnce, POLL_INTERVAL_MS)
}
