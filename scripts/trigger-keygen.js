#!/usr/bin/env node

const { connect, StringCodec } = require("nats");

const sc = StringCodec();

async function triggerKeyGen() {
  try {
    // Connect to NATS
    const nc = await connect({ servers: "nats://localhost:4223" });
    console.log("Connected to NATS");

    // Create key generation request
    const keygenRequest = {
      sessionId: `keygen-bridge-${Date.now()}`,
      keyId: "bridge-key",
      protocol: "ecdsa",
      threshold: 2,
      parties: 3,
      curve: "secp256k1",
      timestamp: Date.now()
    };

    console.log("Sending keygen request:", keygenRequest);

    // Publish to the keygen request subject
    await nc.publish(
      "mpc.keygen_request.bridge",
      sc.encode(JSON.stringify(keygenRequest))
    );

    console.log("Keygen request published");

    // Wait a bit for processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Close connection
    await nc.drain();
    console.log("Done");

  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

triggerKeyGen();