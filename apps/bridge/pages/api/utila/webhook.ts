import type { NextApiRequest, NextApiResponse } from "next";
import { createVerify, constants } from "crypto";

const publicKey = `
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
 * Verifies the Utila webhook signature
 * @param signatureBase64 Signature from `x-utila-signature` header
 * @param data Raw request body data
 * @returns Boolean indicating whether the signature is valid
 */
function verifySignature(signatureBase64: string, data: string): boolean {
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
    console.error("Error verifying signature:", error);
    return false;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  let rawData = "";

  // Collect raw data for signature verification
  await new Promise((resolve, reject) => {
    req.on("data", chunk => (rawData += chunk));
    req.on("end", resolve);
    req.on("error", reject);
  });

  const signature = req.headers["x-utila-signature"] as string;

  if (!signature || !verifySignature(signature, rawData)) {
    return res.status(401).json({ error: "Signature verification failed" });
  }

  // Parse JSON body after verification
  const event = JSON.parse(rawData);

  try {
    // Handle different types of events
    switch (event.type) {
      case "TRANSACTION_CREATED":
        console.log("Transaction Created:", event);
        // Process transaction creation logic here
        break;

      case "TRANSACTION_STATE_UPDATED":
        const newState = event.details?.transactionStateUpdated?.newState;
        console.log("Transaction State Updated:", newState);
        // Process state update logic here (e.g., CONFIRMED)
        break;

      case "WALLET_CREATED":
        console.log("Wallet Created:", event);
        // Handle wallet creation logic here
        break;

      case "WALLET_ADDRESS_CREATED":
        console.log("Wallet Address Created:", event);
        // Handle wallet address creation logic here
        break;

      default:
        console.log("Unhandled event type:", event.type);
        break;
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error handling webhook event:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
