import * as fs from "fs"
import * as path from "path"
import { logger } from "./logger"

// Dynamic import for ES module
let ed: any

interface SignTxMessage {
  key_type: string
  wallet_id: string
  network_internal_code: string
  tx_id: string
  tx: number[] | string
  signature?: number[]
}

/**
 * MPC Request Signing Utilities
 * Handles Ed25519 signing of MPC requests with the initiator key
 */
export class MPCRequestSigner {
  private privateKey: Uint8Array | null = null
  private publicKey: string | null = null

  constructor(private keyPath: string) {}

  /**
   * Load the initiator private key from file
   */
  async loadKey(): Promise<void> {
    try {
      // Load noble/ed25519 dynamically
      if (!ed) {
        ed = await import("@noble/ed25519")
      }
      
      const resolvedPath = path.resolve(this.keyPath)
      const keyHex = fs.readFileSync(resolvedPath, "utf-8").trim()
      
      // Convert hex string to Uint8Array
      this.privateKey = Uint8Array.from(Buffer.from(keyHex, "hex"))
      
      // Generate public key
      const publicKeyBytes = await ed.getPublicKeyAsync(this.privateKey)
      this.publicKey = Buffer.from(publicKeyBytes).toString("hex")
      
      logger.info(`Loaded initiator key, public key: ${this.publicKey}`)
    } catch (error) {
      logger.error("Failed to load initiator private key:", error)
      throw new Error(`Failed to load initiator private key: ${error}`)
    }
  }

  /**
   * Sign a SignTxMessage request
   */
  async signRequest(request: SignTxMessage): Promise<SignTxMessage> {
    if (!this.privateKey) {
      throw new Error("Private key not loaded")
    }

    // Ensure ed25519 is loaded
    if (!ed) {
      ed = await import("@noble/ed25519")
    }

    // Create the payload to sign (without the signature field)
    const payload = {
      key_type: request.key_type,
      wallet_id: request.wallet_id,
      network_internal_code: request.network_internal_code,
      tx_id: request.tx_id,
      tx: request.tx
    }

    // Convert to canonical JSON and sign
    const message = Buffer.from(JSON.stringify(payload))
    const signature = await ed.signAsync(message, this.privateKey)

    // Return the request with signature as array of numbers
    return {
      ...request,
      signature: Array.from(signature)
    }
  }

  /**
   * Sign just a wallet ID for key generation
   */
  async signWalletId(walletId: string): Promise<Uint8Array> {
    if (!this.privateKey) {
      throw new Error("Private key not loaded")
    }

    // Ensure ed25519 is loaded
    if (!ed) {
      ed = await import("@noble/ed25519")
    }

    // For key generation, we sign just the wallet ID string
    const message = Buffer.from(walletId)
    const signature = await ed.signAsync(message, this.privateKey)
    
    return signature
  }

  /**
   * Sign a signing request for MPC
   */
  async signSigningRequest(request: any): Promise<string> {
    if (!this.privateKey) {
      throw new Error("Private key not loaded")
    }

    // Ensure ed25519 is loaded
    if (!ed) {
      ed = await import("@noble/ed25519")
    }

    // Create the payload to sign (without the signature field)
    const payload = {
      key_type: request.key_type,
      wallet_id: request.wallet_id,
      network_internal_code: request.network_internal_code,
      tx_id: request.tx_id,
      tx: request.tx
    }

    // Convert to canonical JSON and sign
    const message = Buffer.from(JSON.stringify(payload))
    const signature = await ed.signAsync(message, this.privateKey)
    
    // Return signature as base64 string
    return Buffer.from(signature).toString('base64')
  }

  /**
   * Get the public key
   */
  getPublicKey(): string | null {
    return this.publicKey
  }
}

// Export singleton instance
export const mpcRequestSigner = new MPCRequestSigner(
  process.env.MPC_INITIATOR_KEY_PATH || "/Users/z/work/lux/mpc/identity/initiator.key"
)