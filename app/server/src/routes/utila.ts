import { Router, Request, Response } from "express";
import { verifyUtilaSignature } from "@/lib/utila";
import logger from "@/logger";
import { handleTransactionCreated, handleTransactionStateUpdated } from "@/lib/utila";
import { handlerUtilaPayoutAction } from "@/lib/swaps";

const router: Router = Router();

router.get("/payout/:swapId", async (req: Request, res: Response) => {
  try {
    const swapId = req.params.swapId
    const data = await handlerUtilaPayoutAction (swapId)
    res.status(200).json(data)
  } catch (err) {
    res.status(400).json(err)
  }
})

/**
 * Webhook route to handle events
 * Handles POST requests to /v1/utila/webhook (or /webhook via alias/rewrite)
 */
router.post("/webhook", verifyUtilaSignature, async (req: Request, res: Response) => {
  console.info(">> Received a POST request to /v1/utila/webhook");
  // logger.info("Received a POST request to /v1/utila/webhook", {
  //   headers: req.headers,
  //   body: req.body,
  // });

  try {
    const eventType = req.body.type;

    console.info(`>> Processing event Type - [${eventType}]`);

    switch (eventType) {
      case "TRANSACTION_CREATED": {
        await handleTransactionCreated (req.body)
        break;
      }

      case "TRANSACTION_STATE_UPDATED": {
        await handleTransactionStateUpdated (req.body)
        break;
      }
        
      case "WALLET_CREATED":
        // logger.info("Wallet Created", { eventData: req.body });
        break;

      case "WALLET_ADDRESS_CREATED":
        // logger.info("Wallet Address Created", { eventData: req.body });
        break;

      default:
        // logger.warn("Unknown event type received", { eventData: req.body });
        // return res.status(400).json({ error: "Unknown event type" });
    }

    res.status(200).json({ message: "Webhook received successfully" });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    const errorStack = error instanceof Error ? error.stack : null;

    console.error("Error processing webhook", {
      message: errorMessage,
      stack: errorStack,
    });

    res.status(500).json({
      error: "Internal Server Error",
      details: errorMessage,
    });
  }
});

/**
 * Catch-all for unsupported methods on /webhook
 */
router.all("/webhook", (req: Request, res: Response) => {
  logger.warn(`Unsupported method ${req.method} on /webhook`);
  res.status(405).json({ error: "Method Not Allowed" });
});

export default router;
