import { Router, Request, Response } from "express";
import { handleError, verifyUtilaSignature } from "@/lib/utila";
import logger from "@/logger";

const router: Router = Router();

/**
 * Webhook route to handle events
 * Handles POST requests to /v1/utila/webhook (or /webhook via alias/rewrite)
 */
router.post("/webhook", verifyUtilaSignature, async (req: Request, res: Response) => {
  const eventType = req.body.type;

  logger.info("Received a POST request to /webhook", {
    headers: req.headers,
    body: req.body,
  });

  try {
    logger.info(`Processing event type: ${eventType}`);

    switch (eventType) {
      case "TRANSACTION_CREATED":
        logger.info("Transaction Created", req.body);
        break;

      case "TRANSACTION_STATE_UPDATED":
        logger.info("Transaction State Updated", req.body);
        break;

      case "WALLET_CREATED":
        logger.info("Wallet Created", req.body);
        break;

      case "WALLET_ADDRESS_CREATED":
        logger.info("Wallet Address Created", req.body);
        break;

      default:
        logger.warn("Unknown event type received", req.body);
        res.status(400).send("Unknown event type");
        return;
    }

    res.status(200).send("Webhook received successfully");
  } catch (error) {
    logger.error("Error processing webhook", {
      message: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : null,
    });
    handleError(res, "Webhook Processing", error);
  }
});

/**
 * Catch-all for unsupported methods on /webhook
 */
router.all("/webhook", (req: Request, res: Response) => {
  logger.warn(`Unsupported method ${req.method} on /webhook`);
  res.status(405).send("Method Not Allowed");
});

export default router;
