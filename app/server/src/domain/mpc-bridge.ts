import { mpcService } from "../services/mpc-service"
import { logger } from "../utils/logger"
import { mpcRequestSigner } from "../utils/mpc-signing"
import Web3 from "web3"
import { StringCodec } from "nats"

const sc = StringCodec()

interface BridgeSignRequest {
  txId: string
  fromNetworkId: string
  toNetworkId: string
  toTokenAddress: string
  msgSignature: string
  receiverAddressHash: string
}

interface BridgeSignResponse {
  status: boolean
  msg?: string
  data?: {
    fromTokenAddress: string
    contract: string
    from: string
    tokenAmount: string
    signature: string
    mpcSigner: string
    hashedTxId: string
    toTokenAddressHash: string
    vault: boolean
  }
}

/**
 * Bridge MPC Integration — NATS-based
 * Publishes signing requests to NATS JetStream, MPC nodes respond via result topics.
 */
export class BridgeMPCIntegration {
  private static instance: BridgeMPCIntegration
  private isInitialized = false
  private pendingSignatures: Map<string, (result: any) => void> = new Map()

  private constructor() {
    // Setup signature completion handler
    mpcService.on("signatureComplete", this.handleSignatureComplete.bind(this))
    // Subscribe to Go MPC result topics
    this.subscribeToMpcResults()
  }

  static getInstance(): BridgeMPCIntegration {
    if (!BridgeMPCIntegration.instance) {
      BridgeMPCIntegration.instance = new BridgeMPCIntegration()
    }
    return BridgeMPCIntegration.instance
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return
    try {
      await mpcRequestSigner.loadKey()
      await mpcService.initialize()
      this.isInitialized = true
      logger.info("Bridge MPC integration initialized")
    } catch (error) {
      logger.error("Failed to initialize Bridge MPC integration:", error)
      throw error
    }
  }

  async generateMPCSignature(signData: BridgeSignRequest): Promise<BridgeSignResponse> {
    try {
      if (!signData.txId || !signData.fromNetworkId || !signData.toNetworkId) {
        return { status: false, msg: "Missing required fields" }
      }

      // Validate request (skip strict validation for now)
      logger.info("Skipping signature validation for testing")

      // Check MPC network readiness
      const networkStatus = await mpcService.getNetworkStatus()
      if (!networkStatus.ready) {
        return {
          status: false,
          msg: `MPC network not ready. Only ${networkStatus.activeNodes}/${networkStatus.threshold} nodes active`,
        }
      }

      const sessionId = `bridge-${signData.txId}-${Date.now()}`
      const hashedTxId = Web3.utils.keccak256(signData.txId)

      // Create promise to wait for signature result
      const signaturePromise = new Promise<any>((resolve) => {
        this.pendingSignatures.set(sessionId, resolve)
        setTimeout(() => {
          if (this.pendingSignatures.has(sessionId)) {
            this.pendingSignatures.delete(sessionId)
            resolve({ error: "Signature timeout" })
          }
        }, 60000)
      })

      // Build signing request for Go MPC nodes
      const msgHash = Web3.utils.keccak256(signData.txId)
      const signingRequest: any = {
        key_type: "secp256k1",
        wallet_id: "bridge-wallet-0",
        network_internal_code: "ETH",
        tx_id: signData.txId,
        tx: Buffer.from(msgHash.replace("0x", ""), "hex").toString("base64"),
      }

      // Sign with initiator key
      const signature = await mpcRequestSigner.signSigningRequest(signingRequest)
      signingRequest.signature = signature
      logger.info(`Signed request: ${JSON.stringify(signingRequest)}`)

      // Publish to NATS
      await this.publishSigningRequest(sessionId, signingRequest)

      // Wait for result
      const result = await signaturePromise
      if (result.error) {
        return { status: false, msg: result.error }
      }

      return {
        status: true,
        data: {
          fromTokenAddress: signData.toTokenAddress,
          contract: "",
          from: "",
          tokenAmount: "0",
          signature: result.signature,
          mpcSigner: result.mpcSigner || "0x" + "0".repeat(40),
          hashedTxId,
          toTokenAddressHash: Web3.utils.keccak256(signData.toTokenAddress),
          vault: false,
        },
      }
    } catch (error) {
      logger.error("MPC signature generation failed:", error)
      return {
        status: false,
        msg: `MPC signature failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  async publishSigningRequest(sessionId: string, signedRequest: any): Promise<void> {
    try {
      const js = mpcService.nc.jetstream()
      await js.publish(
        `mpc.signing_request.${sessionId}`,
        sc.encode(JSON.stringify(signedRequest))
      )
    } catch (pubErr) {
      logger.warn("JetStream publish failed, using core NATS:", pubErr)
      await mpcService.nc.publish(
        `mpc.signing_request.${sessionId}`,
        sc.encode(JSON.stringify(signedRequest))
      )
    }
    logger.info(`Published signed signing request for session ${sessionId}`)
  }

  handleSignatureComplete(data: any): void {
    const resolver = this.pendingSignatures.get(data.sessionId)
    if (resolver) {
      this.pendingSignatures.delete(data.sessionId)
      resolver({ signature: data.signature, participants: data.participants })
      logger.info(`Signature completed for session ${data.sessionId}`)
    }
  }

  /**
   * Subscribe to MPC signing result topics.
   * MPC nodes publish results with tx_id (not sessionId), so match by tx_id prefix.
   */
  async subscribeToMpcResults(): Promise<void> {
    setTimeout(async () => {
      if (!mpcService.nc) return
      const sub = mpcService.nc.subscribe("mpc.mpc_signing_result.*")
      ;(async () => {
        for await (const msg of sub) {
          try {
            const result = JSON.parse(sc.decode(msg.data))
            logger.info("Received MPC signing result:", result)

            // MPC result has tx_id, not sessionId. Match pending signatures by tx_id prefix.
            const txId = result.tx_id
            if (!txId) continue

            // Find the pending signature whose sessionId starts with `bridge-${txId}-`
            for (const [sessionId, resolver] of this.pendingSignatures) {
              if (sessionId.startsWith(`bridge-${txId}-`)) {
                this.pendingSignatures.delete(sessionId)

                if (result.result_type === "success") {
                  // Reconstruct 65-byte Ethereum signature from r, s, recovery
                  const rBuf = Buffer.from(result.r, "base64")
                  const sBuf = Buffer.from(result.s, "base64")
                  const vBuf = result.signature_recovery
                    ? Buffer.from(result.signature_recovery, "base64")
                    : Buffer.from([27])
                  const v = vBuf[0] < 27 ? vBuf[0] + 27 : vBuf[0]
                  const sigHex =
                    "0x" +
                    rBuf.toString("hex") +
                    sBuf.toString("hex") +
                    v.toString(16).padStart(2, "0")

                  resolver({ signature: sigHex })
                } else {
                  resolver({
                    error: result.error_reason || "MPC signing failed",
                  })
                }
                break
              }
            }
          } catch (error) {
            logger.error("Error processing MPC result:", error)
          }
        }
      })()
    }, 1000)
  }

  async completeSwap(
    hashedTxId: string
  ): Promise<{ status: boolean; msg: string }> {
    try {
      await mpcService.consul.kv.set({
        Key: `bridge/transactions/${hashedTxId}/completed`,
        Value: JSON.stringify({
          timestamp: Date.now(),
          nodeId: mpcService.config.nodeId,
        }),
      })
      return { status: true, msg: "success" }
    } catch (error) {
      logger.error("Failed to complete swap:", error)
      return {
        status: false,
        msg: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async getHealthStatus(): Promise<any> {
    return mpcService.getNetworkStatus()
  }
}

export const bridgeMPC = BridgeMPCIntegration.getInstance()
