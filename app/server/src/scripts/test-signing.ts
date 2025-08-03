import { connect, StringCodec } from "nats"

const sc = StringCodec()

async function testSigning() {
  try {
    const nc = await connect({ servers: "nats://localhost:4223" })
    console.log("Connected to NATS at localhost:4223")

    const sessionId = `test-${Date.now()}`
    const request = {
      sessionId,
      txId: "0x10f0b50717e880325d96f75bd7f237b511e3601eabe1fe78c6469f67cbda23a7",
      fromNetworkId: "1",
      toNetworkId: "56",
      toTokenAddress: "0x0000000000000000000000000000000000000000",
      msgSignature: "0x82f45522308949c25cad1d1fe3003213f85a72c15ce8757a32063195da2770126d7bb674246013af1066372c83f6afa4f2eaee8f389ab305418eb939192e83cd79",
      receiverAddressHash: "0x21f9cf6aab4b051de0aa1a6abcc3bc59761a9a622f9951291091fe7c9646ad41",
      nonce: 2,
      tokenAmount: "0",
      decimals: 18,
      vault: false,
      timestamp: Date.now(),
    }

    // Subscribe to results first
    const sub = nc.subscribe("mpc.mpc_signing_result.*")
    console.log("Subscribed to mpc.mpc_signing_result.*")

    // Publish the signing request
    const topic = `mpc.signing_request.${sessionId}`
    await nc.publish(topic, sc.encode(JSON.stringify(request)))
    console.log(`Published signing request to ${topic}`)

    // Wait for result
    console.log("Waiting for signing result...")
    const timeout = setTimeout(() => {
      console.log("Timeout waiting for result")
      nc.close()
      process.exit(1)
    }, 30000)

    for await (const msg of sub) {
      console.log("Received result:", sc.decode(msg.data))
      clearTimeout(timeout)
      nc.close()
      process.exit(0)
    }
  } catch (error) {
    console.error("Error:", error)
    process.exit(1)
  }
}

testSigning()