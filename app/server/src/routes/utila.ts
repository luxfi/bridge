import { Router, Request, Response } from "express";
import { handleError, verifyUtilaSignature } from "@/lib/utilas";

const router: Router = Router();

/**
 * // Webhook route to handle events
 * @route /v1/utila/webhook
 */
router.post("/webhook", verifyUtilaSignature, async (req: Request, res: Response) => {
  const eventType = req.body.type;

  try {
    console.log(`Processing ${eventType}:\n${req}`);
    switch (eventType) {
      case "TRANSACTION_CREATED":
        console.log("Transaction Created:", JSON.stringify(req.body, null, 2));
        break;
      case "TRANSACTION_STATE_UPDATED":
        console.log("Transaction State Updated:", JSON.stringify(req.body, null, 2));
        break;
      case "WALLET_CREATED":
        console.log("Wallet Created:", JSON.stringify(req.body, null, 2));
        break;
      case "WALLET_ADDRESS_CREATED":
        console.log("Wallet Address Created:", JSON.stringify(req.body, null, 2));
        break;
      default:
        console.warn("Unknown event type:", JSON.stringify(req.body, null, 2));
        break;
    }

    res.status(200).send("Webhook received successfully");
  } catch (error) {
    handleError(res, "Webhook Processing", error);
  }
});

export default router;
