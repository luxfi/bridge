// Bridge → mpcd integration via HTTP.
//
// Replaces the legacy NATS/Consul-coupled BridgeMPCIntegration with a
// synchronous HTTP call against the canonical mpcd daemon
// (~/work/lux/mpc, github.com/luxfi/mpc). The bridge no longer needs
// NATS for pub/sub or Consul for shared state — mpcd's HTTP API does
// threshold signing in a single round-trip, and per-swap state lives
// in Postgres via Prisma.
//
// Public surface preserved so domain/mpc-modern.ts stays unchanged:
//   bridgeMPC.initialize()                    — eager IAM warm-up
//   bridgeMPC.generateMPCSignature(req)       — threshold sign
//   bridgeMPC.completeSwap(hashedTxId)        — persists completion marker
//   bridgeMPC.getHealthStatus()               — cluster status
//
// Env (brand-neutral):
//   BRIDGE_MPC_URL              mpcd base URL (required for sign / status)
//   BRIDGE_IAM_ISSUER           OIDC issuer (required)
//   BRIDGE_IAM_CLIENT_ID        OAuth2 client id (required)
//   BRIDGE_IAM_CLIENT_SECRET    OAuth2 client secret (required, from KMS in prod)
//   BRIDGE_MPC_WALLET_ID        default wallet to sign with (default: bridge-settlement)
//
// Standalone-friendly: if any required env is missing, generateMPCSignature
// returns a clean error rather than crashing the process. The rest of
// the bridge (deposit ingestion, payout planning, swap-state machine)
// continues to function.

import Web3 from "web3"

import { IAMClient } from "@/clients/iam"
import { MPCClient } from "@/clients/mpc"
import { prisma } from "@/prisma-instance"
import logger from "@/logger"

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
 * Bridge ↔ mpcd integration. Singleton. Lazy IAM + MPC client init so
 * the bridge boots cleanly when MPC env is unset (standalone mode).
 */
export class BridgeMPCIntegration {
  private static instance: BridgeMPCIntegration
  private isInitialized = false
  private iam?: IAMClient
  private mpc?: MPCClient

  private constructor() {
    // Nothing to do until initialize() runs.
  }

  static getInstance(): BridgeMPCIntegration {
    if (!BridgeMPCIntegration.instance) {
      BridgeMPCIntegration.instance = new BridgeMPCIntegration()
    }
    return BridgeMPCIntegration.instance
  }

  /**
   * Eagerly resolve env + warm the IAM cache for the `mpc` audience.
   * No-op when env is unset (standalone mode); callers see a clear
   * error from generateMPCSignature() instead.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return
    const mpcUrl = process.env.BRIDGE_MPC_URL
    const iamIssuer = process.env.BRIDGE_IAM_ISSUER
    const clientId = process.env.BRIDGE_IAM_CLIENT_ID
    const clientSecret = process.env.BRIDGE_IAM_CLIENT_SECRET

    if (!mpcUrl || !iamIssuer || !clientId || !clientSecret) {
      logger.warn(
        "[bridge-mpc] env unset (BRIDGE_MPC_URL / BRIDGE_IAM_*) — running in standalone mode; sign calls will reject cleanly",
      )
      this.isInitialized = true
      return
    }

    this.iam = new IAMClient({ issuer: iamIssuer, clientId, clientSecret })
    this.mpc = new MPCClient({ url: mpcUrl, iam: this.iam })
    try {
      await this.iam.mint("mpc")
      const status = await this.mpc.status()
      logger.info(
        `[bridge-mpc] connected to ${mpcUrl} (${status.online}/${status.total} online, protocols=${status.protocols.join(",")})`,
      )
    } catch (err) {
      logger.warn(
        `[bridge-mpc] connectivity check failed (will retry on first sign): ${err instanceof Error ? err.message : String(err)}`,
      )
    }
    this.isInitialized = true
  }

  /**
   * Threshold sign a bridge settlement message via mpcd.
   *
   * `signData.msgSignature` is the bridge's commitment to the
   * settlement (per-tx digest). We forward it as the sign payload to
   * the wallet identified by BRIDGE_MPC_WALLET_ID (default
   * `bridge-settlement`). mpcd handles the threshold round internally
   * and returns the final signature in one HTTP response.
   */
  async generateMPCSignature(
    signData: BridgeSignRequest,
  ): Promise<BridgeSignResponse> {
    if (!signData.txId || !signData.fromNetworkId || !signData.toNetworkId) {
      return { status: false, msg: "Missing required fields" }
    }
    await this.initialize()
    if (!this.mpc) {
      return {
        status: false,
        msg: "BRIDGE_MPC_URL is not configured — native MPC sign unavailable in standalone mode",
      }
    }

    const walletId =
      process.env.BRIDGE_MPC_WALLET_ID ?? "bridge-settlement"
    const hashedTxId = Web3.utils.keccak256(signData.txId)
    // Use the bridge's per-tx commitment as the sign payload. mpcd
    // accepts an opaque byte payload — the signing algorithm picked at
    // wallet keygen time determines how it's hashed internally.
    const message = Buffer.from(
      signData.msgSignature.replace(/^0x/, ""),
      "hex",
    )

    try {
      const res = await this.mpc.sign({
        walletId,
        keyType: "secp256k1",
        message,
      })
      return {
        status: true,
        data: {
          fromTokenAddress: signData.toTokenAddress,
          contract: "",
          from: "",
          tokenAmount: "0",
          signature: res.signature.startsWith("0x")
            ? res.signature
            : "0x" + res.signature,
          mpcSigner: walletId,
          hashedTxId,
          toTokenAddressHash: Web3.utils.keccak256(signData.toTokenAddress),
          vault: false,
        },
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error(`[bridge-mpc] sign failed for tx=${signData.txId}: ${msg}`)
      return { status: false, msg: `MPC signature failed: ${msg}` }
    }
  }

  /**
   * Record a completion marker for a swap. Persists to Postgres rather
   * than to Consul KV — single source of truth per HIP-0105.
   */
  async completeSwap(
    hashedTxId: string,
  ): Promise<{ status: boolean; msg: string }> {
    try {
      await prisma.swap.updateMany({
        where: { id: hashedTxId },
        data: { metadata_sequence_number: Date.now() },
      })
      return { status: true, msg: "success" }
    } catch (err) {
      logger.error(`[bridge-mpc] completeSwap failed for ${hashedTxId}:`, err)
      return {
        status: false,
        msg: err instanceof Error ? err.message : String(err),
      }
    }
  }

  /** Cluster status — proxies through MPCClient when configured. */
  async getHealthStatus(): Promise<{
    online: number
    total: number
    protocols: string[]
    standalone?: boolean
  }> {
    await this.initialize()
    if (!this.mpc) {
      return { online: 0, total: 0, protocols: [], standalone: true }
    }
    return this.mpc.status()
  }
}

export const bridgeMPC = BridgeMPCIntegration.getInstance()
