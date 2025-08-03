import { exec as execCallback } from "child_process"
import { promisify } from "util"
import crypto from "crypto"
import Web3 from "web3"

const exec = promisify(execCallback)

// Modern Lux MPC integration using Go binary
export class LuxMPCService {
  private mpcNodes: string[]
  private keyPath: string
  
  constructor() {
    // Use Lux MPC nodes directly
    this.mpcNodes = [
      process.env.LUX_MPC_NODE_0 || "http://localhost:8080",
      process.env.LUX_MPC_NODE_1 || "http://localhost:8081",
      process.env.LUX_MPC_NODE_2 || "http://localhost:8082"
    ]
    this.keyPath = process.env.LUX_MPC_KEY_PATH || "~/.lux-mpc/bridge.key"
  }

  /**
   * Generate MPC signature using Lux MPC
   */
  async generateSignature(signData: {
    txId: string
    fromNetworkId: string
    toNetworkId: string
    toTokenAddress: string
    msgSignature: string
    receiverAddressHash: string
  }): Promise<{
    signature: string
    mpcSigner: string
    hashedTxId: string
    toTokenAddressHash: string
  }> {
    // Construct message following bridge protocol
    const toNetworkIdHash = Web3.utils.keccak256(signData.toNetworkId)
    const hashedTxId = Web3.utils.keccak256(signData.txId)
    const toTokenAddressHash = Web3.utils.keccak256(signData.toTokenAddress)
    
    // Message format matching bridge expectations
    const message = toNetworkIdHash + hashedTxId + toTokenAddressHash + signData.receiverAddressHash
    const messageHash = Web3.utils.keccak256(message)
    
    // Create session ID for this signing operation
    const sessionId = `bridge-${signData.txId}-${Date.now()}`
    
    try {
      // Use lux-mpc-cli to request signature
      const signCommand = `lux-mpc-cli sign \
        --session-id "${sessionId}" \
        --message "${messageHash}" \
        --key-id "bridge-key" \
        --protocol "ecdsa" \
        --endpoint "${this.mpcNodes[0]}"`
      
      console.log("Executing MPC signing:", { sessionId, messageHash })
      
      const { stdout, stderr } = await exec(signCommand, {
        timeout: 60000, // 60 second timeout
        env: {
          ...process.env,
          LUX_MPC_KEY_PATH: this.keyPath
        }
      })
      
      if (stderr) {
        console.error("MPC signing stderr:", stderr)
      }
      
      // Parse response
      const result = JSON.parse(stdout)
      
      // Convert signature to bridge format (0x + r + s + v)
      const signature = this.formatSignatureForBridge(result.signature)
      
      return {
        signature,
        mpcSigner: result.publicKey,
        hashedTxId,
        toTokenAddressHash
      }
    } catch (error) {
      console.error("MPC signing failed:", error)
      throw new Error(`MPC signing failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Initialize MPC key if not exists
   */
  async initializeKey(): Promise<void> {
    try {
      // Check if key exists
      const checkCommand = `lux-mpc-cli key list --endpoint "${this.mpcNodes[0]}"`
      const { stdout } = await exec(checkCommand)
      
      if (!stdout.includes("bridge-key")) {
        console.log("Initializing bridge MPC key...")
        
        // Generate new key
        const keygenCommand = `lux-mpc-cli keygen \
          --key-id "bridge-key" \
          --protocol "ecdsa" \
          --threshold 2 \
          --parties 3 \
          --endpoint "${this.mpcNodes[0]}"`
        
        await exec(keygenCommand, {
          timeout: 120000, // 2 minute timeout for key generation
          env: {
            ...process.env,
            LUX_MPC_KEY_PATH: this.keyPath
          }
        })
        
        console.log("Bridge MPC key initialized successfully")
      } else {
        console.log("Bridge MPC key already exists")
      }
    } catch (error) {
      console.error("Failed to initialize MPC key:", error)
      throw error
    }
  }

  /**
   * Health check for MPC nodes
   */
  async healthCheck(): Promise<{ node: string; healthy: boolean }[]> {
    const results = await Promise.all(
      this.mpcNodes.map(async (node) => {
        try {
          const response = await fetch(`${node}/health`)
          return { node, healthy: response.ok }
        } catch (error) {
          return { node, healthy: false }
        }
      })
    )
    
    return results
  }

  /**
   * Format signature for bridge compatibility
   */
  private formatSignatureForBridge(signature: any): string {
    // Extract R, S, V from signature object
    let r: string, s: string, v: string
    
    if (typeof signature === "string") {
      // If signature is already hex string, parse it
      const sigHex = signature.startsWith("0x") ? signature.slice(2) : signature
      r = sigHex.slice(0, 64)
      s = sigHex.slice(64, 128)
      v = sigHex.slice(128) || "1b"
    } else if (signature.r && signature.s) {
      // If signature has r,s components
      r = signature.r.toString("hex").padStart(64, "0")
      s = signature.s.toString("hex").padStart(64, "0")
      v = signature.v ? signature.v.toString(16) : "1b"
    } else {
      throw new Error("Invalid signature format")
    }
    
    // Ensure proper padding
    r = r.padStart(64, "0")
    s = s.padStart(64, "0")
    v = v.padStart(2, "0")
    
    return "0x" + r + s + v
  }

  /**
   * Get MPC public key for verification
   */
  async getPublicKey(): Promise<string> {
    try {
      const command = `lux-mpc-cli key info --key-id "bridge-key" --endpoint "${this.mpcNodes[0]}"`
      const { stdout } = await exec(command)
      const keyInfo = JSON.parse(stdout)
      return keyInfo.publicKey
    } catch (error) {
      console.error("Failed to get public key:", error)
      throw error
    }
  }
}

// Export singleton instance
export const luxMPC = new LuxMPCService()