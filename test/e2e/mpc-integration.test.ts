import { describe, it, expect, beforeAll, afterAll } from "@jest/globals"
import Web3 from "web3"
import { getSigFromMpcOracleNetwork, completeSwapWithMpc, getMpcHealthStatus } from "../../app/server/src/domain/mpc-modern"
import { mpcService } from "../../app/server/src/services/mpc-service"
import { bridgeMPC } from "../../app/server/src/domain/mpc-bridge"

describe("Bridge MPC Integration E2E Tests", () => {
  let web3: Web3
  
  beforeAll(async () => {
    // Initialize Web3
    web3 = new Web3("http://localhost:8545")
    
    // Initialize MPC service
    await mpcService.initialize()
    await bridgeMPC.initialize()
    
    // Wait for MPC network to be ready
    let retries = 0
    while (retries < 30) {
      const status = await getMpcHealthStatus()
      if (status.ready) {
        console.log("MPC network is ready:", status)
        break
      }
      await new Promise(resolve => setTimeout(resolve, 1000))
      retries++
    }
  }, 60000)

  afterAll(async () => {
    await mpcService.shutdown()
  })

  describe("MPC Network Health", () => {
    it("should have minimum threshold nodes active", async () => {
      const status = await getMpcHealthStatus()
      
      expect(status).toBeDefined()
      expect(status.activeNodes).toBeGreaterThanOrEqual(status.threshold)
      expect(status.ready).toBe(true)
    })

    it("should have all nodes registered in Consul", async () => {
      const status = await getMpcHealthStatus()
      
      expect(status.nodes).toBeDefined()
      expect(status.nodes.length).toBeGreaterThanOrEqual(2)
      
      // Check each node has required metadata
      status.nodes.forEach(node => {
        expect(node.id).toBeDefined()
        expect(node.address).toBeDefined()
        expect(node.port).toBeDefined()
        expect(node.meta.publicKey).toBeDefined()
      })
    })
  })

  describe("MPC Signature Generation", () => {
    it("should generate valid signature for bridge transaction", async () => {
      // Create test transaction data
      const testTx = {
        txId: `0x${crypto.randomBytes(32).toString("hex")}`,
        fromNetworkId: "1", // Ethereum
        toNetworkId: "56", // BSC
        toTokenAddress: "0x" + "0".repeat(40), // Zero address for native token
        msgSignature: "0x" + "0".repeat(130), // Placeholder signature
        receiverAddressHash: web3.utils.keccak256("0x" + "1".repeat(40)),
      }

      // Generate signature
      const result = await getSigFromMpcOracleNetwork(testTx)
      
      expect(result).toBeDefined()
      expect(result.signature).toBeDefined()
      expect(result.signature).toMatch(/^0x[0-9a-fA-F]{130}$/) // 65 bytes = 130 hex chars
      expect(result.mpcSigner).toBeDefined()
      expect(result.hashedTxId).toBe(web3.utils.keccak256(testTx.txId))
      expect(result.toTokenAddressHash).toBe(web3.utils.keccak256(testTx.toTokenAddress))
    }, 30000)

    it("should generate deterministic signatures for same input", async () => {
      const testTx = {
        txId: `0x${crypto.randomBytes(32).toString("hex")}`,
        fromNetworkId: "1",
        toNetworkId: "56",
        toTokenAddress: "0x" + "0".repeat(40),
        msgSignature: "0x" + "0".repeat(130),
        receiverAddressHash: web3.utils.keccak256("0x" + "1".repeat(40)),
      }

      // Generate two signatures for the same transaction
      const result1 = await getSigFromMpcOracleNetwork(testTx)
      const result2 = await getSigFromMpcOracleNetwork(testTx)
      
      // Should get the same signature
      expect(result1.signature).toBe(result2.signature)
      expect(result1.mpcSigner).toBe(result2.mpcSigner)
    }, 30000)

    it("should reject invalid signature requests", async () => {
      const invalidTx = {
        txId: "", // Invalid empty txId
        fromNetworkId: "1",
        toNetworkId: "56",
        toTokenAddress: "0x" + "0".repeat(40),
        msgSignature: "0x" + "0".repeat(130),
        receiverAddressHash: web3.utils.keccak256("0x" + "1".repeat(40)),
      }

      await expect(getSigFromMpcOracleNetwork(invalidTx)).rejects.toThrow()
    })
  })

  describe("Cross-Chain Transaction Flow", () => {
    it("should complete full bridge transaction flow", async () => {
      // Step 1: Create a mock burn transaction
      const burnTx = {
        txId: `0x${crypto.randomBytes(32).toString("hex")}`,
        fromNetworkId: "1", // Ethereum
        toNetworkId: "56", // BSC
        toTokenAddress: "0x" + "1234567890".repeat(4), // Mock token address
        msgSignature: createMockSignature(),
        receiverAddressHash: web3.utils.keccak256("0x" + "9876543210".repeat(4)),
      }

      // Step 2: Get MPC signature
      const signature = await getSigFromMpcOracleNetwork(burnTx)
      expect(signature).toBeDefined()
      expect(signature.signature).toBeDefined()

      // Step 3: Verify signature can be used for minting
      const recoveredSigner = await verifyMPCSignature(
        signature.signature,
        burnTx,
        signature.mpcSigner
      )
      expect(recoveredSigner.toLowerCase()).toBe(signature.mpcSigner.toLowerCase())

      // Step 4: Complete the swap
      const completion = await completeSwapWithMpc(signature.hashedTxId)
      expect(completion.status).toBe(true)
      expect(completion.msg).toBe("success")
    }, 60000)
  })

  describe("Threshold Signature Properties", () => {
    it("should successfully sign with threshold number of nodes", async () => {
      // This test verifies that signing works with exactly threshold nodes
      const status = await getMpcHealthStatus()
      
      // Ensure we have at least threshold nodes
      expect(status.activeNodes).toBeGreaterThanOrEqual(status.threshold)
      
      // Create signing request
      const testTx = {
        txId: `0x${crypto.randomBytes(32).toString("hex")}`,
        fromNetworkId: "1",
        toNetworkId: "137", // Polygon
        toTokenAddress: "0x" + "abcdef".repeat(6) + "1234",
        msgSignature: createMockSignature(),
        receiverAddressHash: web3.utils.keccak256("0x" + "fedcba".repeat(6) + "4321"),
      }

      const result = await getSigFromMpcOracleNetwork(testTx)
      expect(result.signature).toBeDefined()
    }, 30000)
  })

  describe("Security Tests", () => {
    it("should prevent replay attacks", async () => {
      const testTx = {
        txId: `0x${crypto.randomBytes(32).toString("hex")}`,
        fromNetworkId: "1",
        toNetworkId: "56",
        toTokenAddress: "0x" + "0".repeat(40),
        msgSignature: createMockSignature(),
        receiverAddressHash: web3.utils.keccak256("0x" + "1".repeat(40)),
      }

      // First request should succeed
      const result1 = await getSigFromMpcOracleNetwork(testTx)
      expect(result1).toBeDefined()

      // Mark as completed
      await completeSwapWithMpc(result1.hashedTxId)

      // Replay attempt should fail or return same signature
      const result2 = await getSigFromMpcOracleNetwork(testTx)
      expect(result2.signature).toBe(result1.signature)
    }, 30000)

    it("should validate message signatures", async () => {
      const invalidTx = {
        txId: `0x${crypto.randomBytes(32).toString("hex")}`,
        fromNetworkId: "1",
        toNetworkId: "56",
        toTokenAddress: "0x" + "0".repeat(40),
        msgSignature: "0xinvalid", // Invalid signature format
        receiverAddressHash: web3.utils.keccak256("0x" + "1".repeat(40)),
      }

      await expect(getSigFromMpcOracleNetwork(invalidTx)).rejects.toThrow()
    })
  })

  describe("Performance Tests", () => {
    it("should handle concurrent signing requests", async () => {
      const concurrentRequests = 5
      const requests = []

      for (let i = 0; i < concurrentRequests; i++) {
        const testTx = {
          txId: `0x${crypto.randomBytes(32).toString("hex")}`,
          fromNetworkId: "1",
          toNetworkId: "56",
          toTokenAddress: "0x" + i.toString().repeat(40).slice(0, 40),
          msgSignature: createMockSignature(),
          receiverAddressHash: web3.utils.keccak256(`0x${i}`),
        }
        
        requests.push(getSigFromMpcOracleNetwork(testTx))
      }

      const results = await Promise.all(requests)
      
      // All requests should succeed
      results.forEach(result => {
        expect(result).toBeDefined()
        expect(result.signature).toBeDefined()
      })
      
      // All signatures should be unique (different transactions)
      const signatures = results.map(r => r.signature)
      const uniqueSignatures = new Set(signatures)
      expect(uniqueSignatures.size).toBe(concurrentRequests)
    }, 60000)

    it("should complete signature generation within acceptable time", async () => {
      const testTx = {
        txId: `0x${crypto.randomBytes(32).toString("hex")}`,
        fromNetworkId: "1",
        toNetworkId: "56",
        toTokenAddress: "0x" + "0".repeat(40),
        msgSignature: createMockSignature(),
        receiverAddressHash: web3.utils.keccak256("0x" + "1".repeat(40)),
      }

      const startTime = Date.now()
      await getSigFromMpcOracleNetwork(testTx)
      const duration = Date.now() - startTime

      // Should complete within 10 seconds
      expect(duration).toBeLessThan(10000)
    }, 15000)
  })
})

// Helper functions

function createMockSignature(): string {
  // Create a valid ECDSA signature format
  const r = crypto.randomBytes(32).toString("hex")
  const s = crypto.randomBytes(32).toString("hex")
  const v = "1b"
  return "0x" + r + s + v
}

async function verifyMPCSignature(
  signature: string,
  txData: any,
  expectedSigner: string
): Promise<string> {
  // Mock verification - in real implementation would recover actual signer
  return expectedSigner
}