import { Router, Request, Response } from "express";
import { createVerify, constants } from "crypto";
import { createGrpcClient, createHttpClient, serviceAccountAuthStrategy } from '@luxfi/utila';
import { createNewWalletForDeposit, handleError, verifyUtilaSignature } from "@/lib/utilas";
import { serializedData } from "@/lib/utils";

const router: Router = Router();

/**
 * utila grpc client
 */
const client = createGrpcClient({
  authStrategy: serviceAccountAuthStrategy({
    email: process.env.SERVICE_ACCOUNT_EMAIL as string,
    privateKey: async () => process.env.SERVICE_ACCOUNT_PRIVATE_KEY as string,
  }),
}).version("v1alpha2");

/**
 * Get utila's balance
 * @route /v1/utila/balances
 */
router.get("/balances", async (req: Request, res: Response) => {
  try {
    const { balances } = await client.queryBalances({
      parent: `vaults/11b8bd854f3e`,
    })
    res.status(200).json({ balances });
  } catch (error) {
    handleError(res, "Failed to fetch balances:", error);
  }
});

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
