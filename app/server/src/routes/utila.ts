import { Router, Request, Response, raw } from "express"

import { client, verifyUtilaSignature } from "@/domain/utila"
import { handleTransactionCreated, handleTransactionStateUpdated } from "@/domain/utila"
import logger from "@/logger"


const router: Router = Router()
/**
 * Webhook route to handle events
 * Handles POST requests to /v1/utila/webhook (or /webhook via alias/rewrite)
 */
router.post("/webhook", verifyUtilaSignature, async (req: Request, res: Response) => {
  const eventType = req.body.type
  console.info(`>> Received a POST request to /v1/utila/webhook - [${eventType}]`)
  // logger.info("Received a POST request to /v1/utila/webhook", {
  //   headers: req.headers,
  //   body: req.body,
  // });

  try {
    switch (eventType) {
      case "TRANSACTION_CREATED": {
        await handleTransactionCreated(req.body)
        break
      }

      case "TRANSACTION_STATE_UPDATED": {
        await handleTransactionStateUpdated(req.body)
        break
      }

      case "WALLET_CREATED":
        // logger.info("Wallet Created", { eventData: req.body });
        break

      case "WALLET_ADDRESS_CREATED":
        // logger.info("Wallet Address Created", { eventData: req.body });
        break

      default:
      // logger.warn("Unknown event type received", { eventData: req.body });
      // return res.status(400).json({ error: "Unknown event type" });
    }

    res.status(200).json({ message: "Webhook received successfully" })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred"
    const errorStack = error instanceof Error ? error.stack : null

    console.error("Error processing webhook", {
      message: errorMessage,
      stack: errorStack
    })

    res.status(500).json({
      error: "Internal Server Error",
      details: errorMessage
    })
  }
})

/**
 * Catch-all for unsupported methods on /webhook
 */
router.all("/webhook", (req: Request, res: Response) => {
  logger.warn(`Unsupported method ${req.method} on /webhook`)
  res.status(405).json({ error: "Method Not Allowed" })
})

// router.get("/networks", async (req: Request, res: Response) => {
//   const data = await client.listNetworks({})
//   res.json(data)
// })
router.post("/assets", async (req: Request, res: Response) => {
  const { id } = req.body
  try {
    const data = await client.getAsset({
      name: id
    })
    res.json(data)
  } catch (err) {
    res.json(`[${id}] is not recognized`)
  }
})

export default router
