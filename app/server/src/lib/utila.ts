import { Router, Request, Response } from "express";
import { createVerify, constants } from "crypto";
import { createGrpcClient, serviceAccountAuthStrategy } from "@luxfi/utila";
import jwt from "jsonwebtoken";
import { UTILA_NETWORKS } from "@/config/constants";
import logger from "@/logger";

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
 * Middleware to verify the webhook signature
 */
export const verifyUtilaSignature = (req: Request, res: Response, next: Function) => {
  let rawData = "";

  req.on("data", (chunk) => {
    rawData += chunk;
  });

  req.on("end", () => {
    try {
      const signature = req.headers["x-utila-signature"] as string;
      logger.info("Verifying webhook signature", { signature });

      if (!signature || !verifySignature(signature, rawData, utilaPublicKey)) {
        logger.warn("Signature verification failed", { signature, body: rawData });
        return res.status(401).send("Invalid signature");
      }

      logger.info("Webhook signature verified successfully");
      req.body = JSON.parse(rawData); // Parse the raw data
      logger.debug("Parsed webhook payload", req.body);
      next(); // Pass control to the next handler
    } catch (error) {
      logger.error("Error during signature verification", {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : null,
      });
      res.status(400).json({ error: "Invalid JSON payload or signature" });
    }
  });

  req.on("error", (error) => {
    logger.error("Request error during signature verification", {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : null,
    });
    res.status(400).json({ error: "Request processing error" });
  });
};

/**
 * Helper function to verify the signature
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
    logger.error("Error during signature verification", {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : null,
    });
    return false;
  }
}

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
    const token = jwt.sign({}, process.env.SERVICE_ACCOUNT_PRIVATE_KEY as string, options);
    logger.info("JWT token generated successfully");
    return token;
  } catch (error) {
    logger.error("Error generating JWT token", {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : null,
    });
    throw error;
  }
};
