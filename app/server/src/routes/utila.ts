import { Router, Request, Response, NextFunction } from "express";
import logger from "@/logger";

const router: Router = Router();

/**
 * Middleware for signature verification.
 * Replace the logic inside with your actual implementation.
 */
const verifyUtilaSignature = (req: Request, res: Response, next: NextFunction) => {
  try {
    logger.info("Verifying signature...");
    // Add your signature verification logic here
    // If the signature is invalid, throw an error or respond with 401
    next(); // Proceed if valid
  } catch (error) {
    logger.error("Signature verification failed", { error });
    res.status(401).send("Invalid signature");
  }
};

/**
 * Webhook route to handle events.
 * @route POST /v1/utila/webhook
 */
router.post(
  "/webhook",
  verifyUtilaSignature,
  async (req: Request, res: Response) => {
    logger.info("Received a POST request to /v1/utila/webhook", {
      headers: req.headers,
      body: req.body,
    });

    const { type } = req.body;

    try {
      logger.info(`Processing event type: ${type}`);

      switch (type) {
        case "TRANSACTION_CREATED":
          logger.info("Transaction Created:", req.body);
          break;

        case "TRANSACTION_STATE_UPDATED":
          logger.info("Transaction State Updated:", req.body);
          break;

        case "WALLET_CREATED":
          logger.info("Wallet Created:", req.body);
          break;

        case "WALLET_ADDRESS_CREATED":
          logger.info("Wallet Address Created:", req.body);
          break;

        default:
          logger.warn("Unknown event type received", req.body);
          res.status(400).send("Unknown event type");
          return;
      }

      res.status(200).send("Webhook processed successfully");
    } catch (error) {
      logger.error("Error processing webhook", {
        message: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : null,
      });
      res.status(500).send("Internal Server Error");
    }
  }
);

/**
 * Fallback route for undefined HTTP methods on /webhook
 */
router.all("/webhook", (req: Request, res: Response) => {
  logger.warn(`Unsupported method ${req.method} on /webhook`);
  res.status(405).send("Method Not Allowed");
});

export default router;
