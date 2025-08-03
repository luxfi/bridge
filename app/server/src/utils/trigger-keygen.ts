import { connect, StringCodec } from "nats"
import { mpcRequestSigner } from "./mpc-signing"

const sc = StringCodec()

async function triggerKeyGeneration() {
  try {
    // Load the initiator key
    await mpcRequestSigner.loadKey()
    
    // Connect to NATS
    const nc = await connect({
      servers: "nats://localhost:4223"
    })
    
    console.log("Connected to NATS")

    // Create key generation request
    const walletId = "bridge-wallet-0"
    
    // For key generation, we sign just the wallet ID
    const signature = await mpcRequestSigner.signWalletId(walletId)
    
    // Create the message with signature as base64 string
    const keygenMsg = {
      wallet_id: walletId,
      signature: Buffer.from(signature).toString('base64')
    }

    // Publish key generation request
    const sessionId = `keygen-${Date.now()}`
    await nc.publish(
      `mpc.keygen_request.${sessionId}`,
      sc.encode(JSON.stringify(keygenMsg))
    )
    
    console.log(`Published key generation request for wallet ${walletId}`)
    console.log(`Session ID: ${sessionId}`)
    
    // Subscribe to results
    const sub = nc.subscribe("mpc.mpc_keygen_result.*")
    
    console.log("Waiting for key generation result...")
    
    // Wait for result with timeout
    const timeout = setTimeout(() => {
      console.log("Timeout waiting for key generation")
      nc.close()
      process.exit(1)
    }, 60000)
    
    for await (const msg of sub) {
      const result = JSON.parse(sc.decode(msg.data))
      console.log("Received key generation result:", result)
      
      if (result.wallet_id === walletId) {
        clearTimeout(timeout)
        
        if (result.result_type === "success") {
          console.log("Key generation successful!")
          console.log("ECDSA Public key:", result.ecdsa_pub_key)
          console.log("EdDSA Public key:", result.eddsa_pub_key)
        } else {
          console.log("Key generation failed:", result.error_reason)
        }
        
        nc.close()
        break
      }
    }
  } catch (error) {
    console.error("Error:", error)
    process.exit(1)
  }
}

// Run the script
triggerKeyGeneration()