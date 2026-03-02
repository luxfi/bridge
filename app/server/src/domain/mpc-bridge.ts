import { logger } from "../utils/logger"

const MPC_URL = process.env.MPC_URL || "http://mpc-node-0.mpc-node:8080"
const MPC_API_KEY = process.env.MPC_API_KEY
if (!MPC_API_KEY) {
  throw new Error("MPC_API_KEY env var is required — set it from KMS (MPC_API_KEY_BRIDGE)")
}

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
 * Bridge MPC Integration — REST API mode
 * Calls the Lux MPC REST API at MPC_URL instead of NATS/Consul.
 */
export class BridgeMPCIntegration {
  private static instance: BridgeMPCIntegration
  private isInitialized = false

  private constructor() {}

  static getInstance(): BridgeMPCIntegration {
    if (!BridgeMPCIntegration.instance) {
      BridgeMPCIntegration.instance = new BridgeMPCIntegration()
    }
    return BridgeMPCIntegration.instance
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      const health = await this.fetchMPC("/healthz")
      if (!health.ok) {
        throw new Error(`MPC health check failed: ${health.status}`)
      }
      this.isInitialized = true
      logger.info("Bridge MPC integration initialized", { url: MPC_URL })
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

      const resp = await this.fetchMPC("/api/v1/generate_mpc_sig", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txId: signData.txId,
          fromNetworkId: signData.fromNetworkId,
          toNetworkId: signData.toNetworkId,
          toTokenAddress: signData.toTokenAddress,
          msgSignature: signData.msgSignature,
          receiverAddressHash: signData.receiverAddressHash,
        }),
      })

      if (!resp.ok) {
        const text = await resp.text()
        logger.error("MPC API signing error", { status: resp.status, body: text })
        return { status: false, msg: `MPC signing failed: ${text}` }
      }

      const result = await resp.json()
      return result
    } catch (error) {
      logger.error("MPC signature generation failed:", error)
      return {
        status: false,
        msg: `MPC signing failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  async completeSwap(hashedTxId: string): Promise<{ status: boolean; msg: string }> {
    try {
      const resp = await this.fetchMPC("/api/v1/bridge/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hashedTxId }),
      })

      if (!resp.ok) {
        const text = await resp.text()
        return { status: false, msg: text }
      }

      return { status: true, msg: "success" }
    } catch (error) {
      logger.error("Failed to complete swap:", error)
      return { status: false, msg: error instanceof Error ? error.message : String(error) }
    }
  }

  async getHealthStatus(): Promise<any> {
    try {
      const resp = await this.fetchMPC("/healthz")
      if (!resp.ok) {
        return { ready: false, activeNodes: 0, threshold: 2 }
      }
      const data = await resp.json()
      return {
        ready: data.ready === true,
        activeNodes: data.connectedPeers?.length + 1 || 0,
        threshold: data.threshold || 2,
        version: data.version,
      }
    } catch {
      return { ready: false, activeNodes: 0, threshold: 2 }
    }
  }

  private fetchMPC(path: string, init?: RequestInit): Promise<Response> {
    const url = `${MPC_URL}${path}`
    const headers: Record<string, string> = {
      ...(init?.headers as Record<string, string> || {}),
    }
    headers["X-API-Key"] = MPC_API_KEY!
    return fetch(url, { ...init, headers })
  }
}

// Export singleton instance
export const bridgeMPC = BridgeMPCIntegration.getInstance()
