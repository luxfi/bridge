import { Router, Request, Response, NextFunction } from "express";
import { createVerify, constants } from "crypto";
import { createGrpcClient, serviceAccountAuthStrategy } from "@luxfi/utila";
import jwt from "jsonwebtoken";
import { UTILA_NETWORKS } from "@/config/constants";
import logger from "@/logger";

/**
 * Ensure required environment variables are set
 */
const validateEnv = (): void => {
  const requiredEnvVars = [
    "SERVICE_ACCOUNT_EMAIL",
    "SERVICE_ACCOUNT_PRIVATE_KEY",
  ];
  let missingVars: string[] = [];
  requiredEnvVars.forEach((key) => {
    if (!process.env[key]) missingVars.push(key);
  });

  if (missingVars.length > 0) {
    logger.warn(
      `Utila integration is missing the following environment variables: ${missingVars.join(
        ", "
      )}`
    );
  }
};
validateEnv();
/**
 * utila grpc client
 */
const client = createGrpcClient({
  authStrategy: serviceAccountAuthStrategy({
    email: process.env.SERVICE_ACCOUNT_EMAIL as string,
    privateKey: async () => process.env.SERVICE_ACCOUNT_PRIVATE_KEY as string,
  }),
}).version("v1alpha2");

export const utilaPublicKey = `
-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAulI1XPGRDFcymdf2zXvD
spfdTXA1g0NOavZ50+AtcQP7f+KTpXoO1bkr6x9dO2Jq8FHImRT1sbhKhcNXT4WC
dLSa/2Zh60QE3tp9d51o1XDSnzRMwcGbFyJ7C30DVpVEIwqD2Z5GRlzXinqIeVdY
GOubuVol/wOAynS32DX+6y2PiqbYj7P84csBOgpNT27Mc6InEqKb7LWQtU8LPttx
tfyceOPXE5G4h+UujPsPG6WN5MHHVbP9r6oneEF3knbfL3hCJRjwV9HfTtG6JyYr
25Dy6SOCphrlEZi8IGcKxL6fEMetDGGVCjm7XfHyt6fYoUonD9lZsvbSyUsRwf/1
+x77F2LxtzQyvMJR9jD16WUyzm+fUBSVQixxKnKSrVkeLqkmGboDTY5kw3doSVTP
zcGDzWkzqC3lgwRLnSg4J+koQY+yo9jYBbFdSp+/PfVmp9NEaBuCV63mp/85VWIh
1FRYe6lEdGZWdmIcbDvNYU/Cui/yGZoID7+sJJq/rWN0Qxx/0skEaT/083+iYLVA
QNLvWtmQfgNKPm6GeQknRUEWyWUJtq6ANeP/8hGVM1G/edOdLn+KfhXZvw41O5z1
uKHEqHIV+NaCNnFbDj924bJhA/fWNKxYv7/Nm44Wy1nXlgqdHiFkSqtjUBPmzE/n
yj92azWBq1RbGHY+9/POguMCAwEAAQ==
-----END PUBLIC KEY-----
`;

/**
 * Verify the signature of incoming requests
 */
function verifySignature(signatureBase64: string, data: string, publicKey: string): boolean {
  try {
    const signatureBuffer = Buffer.from(signatureBase64, "base64");
    const verifier = createVerify("RSA-SHA512");
    verifier.update(data);

    return verifier.verify(
      {
        key: publicKey,
        padding: constants.RSA_PKCS1_PSS_PADDING,
        saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
      },
      signatureBuffer
    );
  } catch (error) {
    logger.error("Error during signature verification", { error });
    return false;
  }
}

/**
 * Middleware to verify the webhook signature
 */
export const verifyUtilaSignature = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Log all incoming request details
  logger.info("Incoming webhook request", {
    method: req.method,
    url: req.originalUrl,
    headers: req.headers,
  });

  const signature = req.headers["x-utila-signature"] as string;

  if (!signature) {
    logger.warn("Missing x-utila-signature header");
    return next(); // Skip verification if the header is missing
  }

  try {
    const rawData = req.body.toString("utf8"); // Convert Buffer to string

    if (!verifySignature(signature, rawData, utilaPublicKey)) {
      logger.warn("Signature verification failed", { signature, rawData });
      res.status(401).send("Invalid signature");
      return
    }

    logger.info("Webhook signature verified successfully");
    req.body = JSON.parse(rawData); // Parse raw JSON body
    next(); // Continue to the next middleware
  } catch (error) {
    logger.error("Error during signature verification", { error });
    res.status(400).json({ error: "Invalid JSON payload or signature" });
  }
};

/**
 * Generate a JWT token
 */
export const generateToken = (): string => {
  const options: jwt.SignOptions = {
    subject: process.env.SERVICE_ACCOUNT_EMAIL,
    audience: "https://api.utila.io/",
    expiresIn: "1h",
    algorithm: "RS256",
  };

  try {
    return jwt.sign({}, process.env.SERVICE_ACCOUNT_PRIVATE_KEY as string, options);
  } catch (error) {
    logger.error("Error generating JWT token", { error });
    throw error;
  }
};

/**
 * Create a new wallet for deposit
 */
export const createNewWalletForDeposit = async (name: string) => {
  try {
    const network = UTILA_NETWORKS[name];
    if (!network) throw new Error(`Unrecognized network - ${name}`);

    const { vaults } = await client.listVaults({});
    if (!vaults || vaults.length === 0) throw new Error("No vaults found");

    const wallet = await _createNewWallet(
      vaults[0].name,
      network.name,
      `${network.name}-${Date.now()}`
    );

    if (!wallet.addresses.length) throw new Error("No wallet address found");

    return wallet;
  } catch (error) {
    logger.error("Error creating wallet for deposit", { error });
    throw error;
  }
};

/**
 * Helper to create a new wallet
 */
const _createNewWallet = async (vaultName: string, network: string, displayName: string) => {
  const payload = {
    parent: vaultName,
    wallet: {
      displayName,
      networks: [network],
    },
  };

  const walletResponse = await client.createWallet(payload);
  const { walletAddresses } = await client.listWalletAddresses({
    parent: walletResponse?.wallet?.name,
  });

  return {
    ...walletResponse.wallet,
    addresses: walletAddresses || [],
  };
};

/**
 * Archive a wallet if expired without deposits
 */
export const archiveWalletForExpire = async (name: string) => {
  try {
    const { balances } = await client.queryBalances({ parent: name });
    if (!balances.length) {
      await client.archiveWallet({ name, allowMissing: true });
      logger.info("Archived wallet successfully", { name });
    }
  } catch (error) {
    logger.error("Error archiving expired wallet", { error });
  }
};
