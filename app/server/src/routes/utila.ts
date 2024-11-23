import { Router, Request, Response } from "express";
import { createVerify, constants } from "crypto";
import { createGrpcClient, createHttpClient, serviceAccountAuthStrategy } from '@luxfi/utila';
import { handleError, verifyUtilaSignature } from "@/lib/utilas";

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


// router.get("/token", async (req: Request, res: Response) => {
//   try {
//     const token = generateToken();
//     res.status(200).json({ token });
//   } catch (error) {
//     handleError(res, "Token Generation Route", error);
//   }
// });

/**
 * Get utila's balance
 * @route /v1/utila/balances
 */
router.get("/balances", async (req: Request, res: Response) => {
  try {
    const { balances } = await client.queryBalances({
      parent: `vaults/${process.env.VAULT_ID}`,
    })
    res.status(200).json({ balances });
  } catch (error) {
    handleError(res, "Failed to fetch balances:", error);
  }
});

/**
 * Get utila's balance
 * @route /v1/utila/networks
 */
router.get("/networks", async (req: Request, res: Response) => {
  try {
    const networks = await client.listNetworks({
      pageSize: 1
    })
    res.status(200).json(networks);
  } catch (error) {
    handleError(res, "Failed to fetch balances:", error);
  }
});

/**
 * Get utila's network
 * @route /v1/utila/network/bitcoin-mainnet
 */
router.get("/network/:network", async (req: Request, res: Response) => {
  const { network } = req.params;
  try {
    const response = await client.getNetwork({
      name: network
    })
    res.status(200).json({network: response});
  } catch (error) {
    handleError(res, "Failed to fetch balances:", error);
  }
});

/**
 * Get utila's balance
 * @route /v1/utila/wallets
 */
router.get("/wallets", async (req: Request, res: Response) => {
  try {
    const wallets = await client.listWallets({
      parent: `vaults/${process.env.VAULT_ID}`
    })
    res.status(200).json(wallets);
  } catch (error) {
    handleError(res, "Failed to fetch balances:", error);
  }
});

/**
 * Get utila's balance
 * @route /v1/utila/assets/native.solana-mainnet
 */
router.get("/assets/:asset", async (req: Request, res: Response) => {
  const { asset } = req.params;
  try {
    const assets = await client.getAsset({
      name: asset
    })
    res.status(200).json(assets);
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
