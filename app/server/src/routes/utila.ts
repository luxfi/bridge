import { Router, Request, Response } from "express";
import { createVerify, constants } from "crypto";
import jwt from "jsonwebtoken";

const router: Router = Router();

// Utila Public Key
const utilaPublicKey = `
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

// Helper to log errors
function logError(context: string, error: unknown): void {
  if (error instanceof Error) {
    console.error(`[${context}] Error: ${error.message}\nStack: ${error.stack}`);
  } else {
    console.error(`[${context}] Unexpected error:`, error);
  }
}

// Centralized error handler
function handleError(res: Response, context: string, error: unknown): void {
  logError(context, error);
  res.status(500).json({ error: "An internal server error occurred" });
}

// Generate a JWT token
function generateToken(): string {
  const options: jwt.SignOptions = {
    subject: process.env.SERVICE_ACCOUNT_EMAIL,
    audience: "https://api.utila.io/",
    expiresIn: "1h",
    algorithm: "RS256",
  };
  try {
    const token = jwt.sign({}, process.env.SERVICE_ACCOUNT_PRIVATE_KEY as string, options);
    console.log("Generated Token:", token);
    return token;
  } catch (error) {
    throw error; // Let the error be handled by the centralized handler
  }
}

// Middleware to verify the webhook signature
function verifyUtilaSignature(req: Request, res: Response, next: Function) {
  let rawData = "";

  req.on("data", (chunk) => {
    rawData += chunk;
  });

  req.on("end", () => {
    try {
      const signature = req.headers["x-utila-signature"] as string;

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

// Function to verify the signature
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

// Webhook route to handle events
router.post("/webhook/utila", verifyUtilaSignature, async (req: Request, res: Response) => {
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
