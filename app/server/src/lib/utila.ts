import jwt from "jsonwebtoken"
import logger from "@/logger"
import { UTILA_NETWORKS } from "@/config/constants"
import { handlerDepositAction } from "./swaps"
import { createVerify, constants } from "crypto"
import { Request, Response, NextFunction } from "express"
import { createGrpcClient, serviceAccountAuthStrategy } from "@luxfi/utila"
import { UTILA_TRANSACTION_CREATED, UTILA_TRANSACTION_STATE_UPDATED } from "@/types/utila"

// Ensure required environment variables are set
const validateEnv = (): void => {
  const requiredEnvVars = ["SERVICE_ACCOUNT_EMAIL", "SERVICE_ACCOUNT_PRIVATE_KEY"]
  let missingVars: string[] = []
  requiredEnvVars.forEach((key) => {
    if (!process.env[key]) missingVars.push(key)
  })

  if (missingVars.length > 0) {
    logger.warn(`Utila integration is missing the following environment variables: ${missingVars.join(", ")}`)
  }
}

validateEnv()

// utila grpc client
export const client = createGrpcClient({
  authStrategy: serviceAccountAuthStrategy({
    email: process.env.SERVICE_ACCOUNT_EMAIL as string,
    privateKey: async () => process.env.SERVICE_ACCOUNT_PRIVATE_KEY as string
  })
}).version("v1alpha2")

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
`

// Verify the signature of incoming requests
function verifySignature(signatureBase64: string, data: string, publicKey: string): boolean {
  let signatureBuffer: Buffer
  try {
    signatureBuffer = Buffer.from(signatureBase64, "base64")
  } catch (error) {
    logger.error(">> Error converting signature from base64", { error })
    return false
  }

  let verifier
  verifier = createVerify("RSA-SHA512")
  verifier.update(data, "utf8")

  try {
    const result = verifier.verify(
      {
        key: utilaPublicKey,
        padding: constants.RSA_PKCS1_PSS_PADDING,
        saltLength: constants.RSA_PSS_SALTLEN_DIGEST
      },
      signatureBuffer
    )
    return result
  } catch (error) {
    logger.error(">> Error verifying signature", { error })
    return false
  }
}

// Middleware to verify the webhook signature
export const verifyUtilaSignature = (req: Request, res: Response, next: NextFunction): void => {
  let data = ""
  req.on("data", (chunk) => (data += chunk))
  req.on("end", () => {
    const signature = req.headers["x-utila-signature"] as string
    try {
      const eventType = JSON.parse(data)?.type
      if (!eventType) {
        throw "Cannot parse webhook data"
      }
      console.info(`>> Processing webhook request for [${eventType}]`)

      if (!signature) {
        console.error(">> Missing x-utila-signature Header")
        throw new Error("Missing x-utila-signature header")
      }

      if (!verifySignature(signature, data, utilaPublicKey)) {
        throw new Error("Signature verification failed")
      }
      console.info(">> Webhook signature verified successfully")
      req.body = JSON.parse(data)
      next()
    } catch (err: any) {
      console.error(">> Signature Verification Failed")
      console.log({
        signature,
        data
      })
      res.status(401).send(err?.message)
    }
  })
}

// Generate a JWT token
export const generateToken = (): string => {
  const options: jwt.SignOptions = {
    subject: process.env.SERVICE_ACCOUNT_EMAIL,
    audience: "https://api.utila.io/",
    expiresIn: "1h",
    algorithm: "RS256"
  }

  try {
    return jwt.sign({}, process.env.SERVICE_ACCOUNT_PRIVATE_KEY as string, options)
  } catch (error) {
    logger.error("Error generating JWT token", { error })
    throw error
  }
}

// Create a new wallet for deposit
export const createNewWalletForDeposit = async (name: string) => {
  try {
    const network = UTILA_NETWORKS[name]
    if (!network) throw new Error(`Unrecognized network - ${name}`)

    const { vaults } = await client.listVaults({})
    if (!vaults || vaults.length === 0) throw new Error("No vaults found")

    const wallet = await _createNewWallet(vaults[0].name, network.name, `${network.name}-${Date.now()}`)

    if (!wallet.addresses.length) throw new Error("No wallet address found")

    return wallet
  } catch (error) {
    logger.error("Error creating wallet for deposit", { error })
    throw error
  }
}

// Helper to create a new wallet
const _createNewWallet = async (vaultName: string, network: string, displayName: string) => {
  const payload = {
    parent: vaultName,
    wallet: {
      displayName,
      networks: [network]
    }
  }

  const walletResponse = await client.createWallet(payload)
  const { walletAddresses } = await client.listWalletAddresses({
    parent: walletResponse?.wallet?.name
  })

  return {
    ...walletResponse.wallet,
    addresses: walletAddresses || []
  }
}

// Archive a wallet if expired without deposits
export const archiveWalletForExpire = async (name: string) => {
  try {
    const { balances } = await client.queryBalances({ parent: name })
    if (!balances.length) {
      await client.archiveWallet({ name, allowMissing: true })
      logger.info("Archived wallet successfully", { name })
    }
  } catch (error) {
    logger.error("Error archiving expired wallet", { error })
  }
}

/**
 *
 * @param payload
 */
export const handleTransactionCreated = async (payload: UTILA_TRANSACTION_CREATED) => {
  try {
    console.info(">> Processing for [TRANSACTION_CREATED]")
    const { transaction } = await client.getTransaction({
      name: payload.resource
    })
    if (!transaction) {
      throw new Error("No Transaction")
    }
    const transfers = transaction.transfers || []
    if (transfers.length === 0) {
      throw new Error("No Token Transfers")
    }

    const { state, hash, createTime } = transaction
    const { amount, asset, sourceAddress, destinationAddress } = transfers[0]

    await handlerDepositAction(
      state,
      hash as string,
      Number(amount),
      asset,
      sourceAddress?.value as string,
      destinationAddress?.value as string,
      new Date(createTime ? Number(createTime.seconds) * 1000 : new Date()),
      payload.vault,
      "TRANSACTION_CREATED"
    )
  } catch (error: any) {
    console.error(">> Error Parsing Webhook for TRANSACTION_CREATED")
    console.log(error)
    throw error
  }
}

/**
 *
 * @param payload
 */
export const handleTransactionStateUpdated = async (payload: UTILA_TRANSACTION_STATE_UPDATED) => {
  try {
    console.info(">> Processing for [TRANSACTION_STATE_UPDATED]")
    const { transaction } = await client.getTransaction({
      name: payload.resource
    })
    if (!transaction) {
      throw new Error("No Transaction")
    }
    const transfers = transaction.transfers || []
    if (transfers.length === 0) {
      throw new Error("No Token Transfers")
    }

    const { state, hash, createTime } = transaction
    const { amount, asset, sourceAddress, destinationAddress } = transfers[0]

    await handlerDepositAction(
      state,
      hash as string,
      Number(amount),
      asset,
      sourceAddress?.value as string,
      destinationAddress?.value as string,
      new Date(createTime ? Number(createTime.seconds) * 1000 : new Date()),
      payload.vault,
      "TRANSACTION_STATE_UPDATED"
    )
  } catch (error: any) {
    console.error(">> Error Parsing Webhook for TRANSACTION_STATE_UPDATED")
    console.log(error)
    throw error
  }
}
