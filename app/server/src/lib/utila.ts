import { Router, Request, Response } from "express";
import { createVerify, constants } from "crypto";
import { createGrpcClient, serviceAccountAuthStrategy } from '@luxfi/utila';
import jwt from "jsonwebtoken";
import { UTILA_NETWORKS } from "@/config/constants";
import { error } from "console";

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
 * Helper to log errors
 * @param context 
 * @param error 
 */
export function logError(context: string, error: unknown): void {
  if (error instanceof Error) {
    console.error(`[${context}] Error: ${error.message}\nStack: ${error.stack}`);
  } else {
    console.error(`[${context}] Unexpected error:`, error);
  }
}

/**
 * Centralized error handler
 * @param res 
 * @param context 
 * @param error 
 */
export function handleError(res: Response, context: string, error: unknown): void {
  logError(context, error);
  res.status(500).json({ error: "An internal server error occurred" });
}

/**
 * function to verify the signature
 * @param signatureBase64 
 * @param data 
 * @param publicKey 
 * @returns 
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
    logError("Signature Verification", error);
    return false;
  }
}

// Middleware to verify the webhook signature
export const verifyUtilaSignature = (req: Request, res: Response, next: Function) => {
  let rawData = "";

  req.on("data", (chunk) => {
    rawData += chunk;
  });

  req.on("end", () => {
    try {
      const signature = req.headers["x-utila-signature"] as string;
      console.log("::utila signature", signature, "::end::")

      if (!signature || !verifySignature(signature, rawData, utilaPublicKey)) {
        throw new Error("Signature verification failed");
      }

      req.body = JSON.parse(rawData);
      console.log("Received Payload:", JSON.stringify(req.body, null, 2)); // Neatly formatted payload
      next();
    } catch (error) {
      handleError(res, "Webhook Signature Verification", error);
    }
  });
}

// Generate a JWT token
export const generateToken = (): string => {
  const options: jwt.SignOptions = {
    subject: process.env.SERVICE_ACCOUNT_EMAIL,
    audience: "https://api.utila.io/",
    expiresIn: "1h",
    algorithm: "RS256",
  };
  try {
    const token = jwt.sign({}, process.env.SERVICE_ACCOUNT_PRIVATE_KEY as string, options);
    return token;
  } catch (error) {
    throw error; // Let the error be handled by the centralized handler
  }
}
/**
 * Create New Wallet address
 * @param vaultName 
 * @param network 
 * @param displayName 
 * @returns 
 */
export const _createNewWallet = async (vaultName: string, network: string, displayName: string) => {
  const payload = {
    parent: vaultName,
    wallet: {
      displayName: displayName,
      networks: [network],
    }
  };

  const walletResponse = await client.createWallet(payload);
  console.log(`${displayName} Wallet Created:`, walletResponse?.wallet?.name);

  const { walletAddresses } = await client.listWalletAddresses({
    parent: walletResponse?.wallet?.name,
  })

  return {
    ...walletResponse.wallet,
    addresses: walletAddresses || []
  };
};

/**
 * Create New Wallet address
 * @param name BITCOIN_MAINNET
 * @returns 
 */
export const createNewWalletForDeposit = async (name: string) => {
  try {

    const network = UTILA_NETWORKS[name];
    if (!network) throw `Unrecognized network - ${name}`
    
    const vaultsResponse = await client.listVaults({});
    const vaults = vaultsResponse.vaults || [];
    if (vaults.length === 0) throw new Error("No vaults found");
    const targetVault = vaults[0];

    const wallet = await _createNewWallet(
      targetVault.name,
      network.name,
      `${network.name}-${Date.now()}`
    );
    if (wallet.addresses.length === 0) throw "No wallet address found"
    return Promise.resolve(wallet)
  } catch (error) {
    console.log("::error while creating new wallet", error)
    return Promise.reject(error)
  }
};
/**
 * archive utila wallet because no deposit for expiration time
 * @param name 
 */
export const archiveWalletForExpire = async (name: string) => {
  try {
    console.log(name)
    const { balances } = await client.queryBalances({
      parent: name
    })
    if (balances?.length === 0) { // if there is no deposit
      await client.archiveWallet({
        name: name,
        allowMissing: true
      })
      console.log("::archived:", name)
    }
  } catch (err) {
    console.log("::error while archiving wallet for expire", error)
  }
}