# Implementing Dual-Signature Support for Lux.Network Bridge

This guide documents the implementation of dual-signature support (ECDSA and EdDSA) for the Lux.Network bridge, enabling cross-chain transfers between EVM-compatible chains and Solana.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Implementation Steps](#implementation-steps)
4. [Configuration](#configuration)
5. [Key Generation](#key-generation)
6. [Signature Verification](#signature-verification)
7. [Troubleshooting](#troubleshooting)
8. [References](#references)

## Overview

The Lux.Network bridge uses Multi-Party Computation (MPC) to enable secure, cross-chain asset transfers. The original implementation supported only ECDSA signatures (used by Ethereum and other EVM chains). This update adds support for EdDSA/Ed25519 signatures (used by Solana), allowing the bridge to connect to more blockchains while maintaining security.

### Key Features

- **Dual-signature support**: ECDSA for EVM chains and EdDSA (Ed25519) for Solana
- **External repositories**: Referencing [luxfi/multi-party-ecdsa](https://github.com/luxfi/multi-party-ecdsa) and [luxfi/multi-party-eddsa](https://github.com/luxfi/multi-party-eddsa)
- **Dynamic signature selection**: Automatic selection based on destination chain
- **Chain-specific configuration**: Flexible framework for supporting additional chains

## Architecture

The dual-signature MPC bridge architecture consists of several key components:

1. **Docker Container**: A unified container that builds and provides both signature implementations
2. **Signature Scheme Detection**: Maps chain IDs to appropriate signature schemes
3. **Unified API**: Consistent Node.js interface for both signature types
4. **Chain-specific Configuration**: Settings for each supported blockchain network

### Signature Flow

```
┌───────────┐     ┌───────────────┐     ┌──────────────────┐
│  User     │     │  Destination  │     │  Signature Type  │
│  Request  │────▶│  Chain ID     │────▶│  Detection       │
└───────────┘     └───────────────┘     └──────────────────┘
                                               │
                   ┌──────────────────┐        │
                   │  Signature       │◀───────┘
                   │  Generation      │
                   └──────────────────┘
                          │
          ┌───────────────┴───────────────┐
          │                               │
┌─────────▼────────┐           ┌─────────▼────────┐
│  ECDSA Process   │           │  EdDSA Process   │
│  (EVM Chains)    │           │  (Solana)        │
└──────────────────┘           └──────────────────┘
```

## Implementation Steps

### 1. Updated Dockerfile for MPC Node

The updated Dockerfile clones both MPC repositories instead of embedding them:

```dockerfile
# Use Rust as the base image
FROM rust:latest AS rust_builder

# Set the working directory
WORKDIR /app

# Clone the external MPC repositories instead of copying them
RUN apt-get update && apt-get install -y git pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

# Clone the ECDSA repository
RUN git clone https://github.com/luxfi/multi-party-ecdsa.git ./ecdsa

# Clone the EdDSA repository
RUN git clone https://github.com/luxfi/multi-party-eddsa.git ./eddsa

# Install nightly version of Rust and set it as the default toolchain
RUN rustup install nightly
RUN rustup default nightly

# Ensure the nightly toolchain is being used
RUN rustc --version

# Build the ECDSA library
WORKDIR /app/ecdsa
RUN cargo +nightly build --release --examples

# Build the EdDSA library
WORKDIR /app/eddsa
RUN cargo +nightly build --release --examples

# Use Node.js for the final image
FROM node:20

# Set working directory in Node container  
WORKDIR /app

COPY ./common/node .

# Install Node.js dependencies
RUN npm install

# Build node app
RUN npm run build

# Create multiparty directory structure
RUN mkdir -p ./dist/multiparty/ecdsa ./dist/multiparty/eddsa

# Copy the built ECDSA Rust binaries and examples
COPY --from=rust_builder /app/ecdsa/target/release/examples ./dist/multiparty/ecdsa/target/release/examples
COPY --from=rust_builder /app/ecdsa/target/release/deps ./dist/multiparty/ecdsa/target/release/deps

# Copy the built EdDSA Rust binaries and examples
COPY --from=rust_builder /app/eddsa/target/release/examples ./dist/multiparty/eddsa/target/release/examples
COPY --from=rust_builder /app/eddsa/target/release/deps ./dist/multiparty/eddsa/target/release/deps

EXPOSE 6000

# Command to run the application
CMD ["node", "dist/node.js"]
```

### 2. Updated Docker-compose.yaml

The Docker-compose file includes new environment variables for signature scheme configuration:

```yaml
services:
  sm-manager:
    build:
      context: .
      dockerfile: ./services/sm-manager
    ports:
      - 8000:8000
    networks:
      - lux-network
    deploy:
      replicas: 1
      restart_policy:
        condition: on-failure
  mpc-node:
    build:
      context: .
      dockerfile: ./services/mpc-node
    environment:
      - NODE_ENV=
      - smTimeOutBound=
      - sign_client_name=
      - node_number=
      - sign_sm_manager=
      - PORT=
      - POSTGRESQL_URL=
      # New environment variables for signature scheme selection
      - ECDSA_CLIENT_NAME=gg18_sign_client
      - ECDSA_SM_MANAGER=gg18_sm_manager
      - EDDSA_CLIENT_NAME=frost_sign_client
      - EDDSA_SM_MANAGER=frost_sm_manager
      - DEFAULT_SIGNATURE_SCHEME=ecdsa
    ports:
      - 6000:6000
    networks:
      - lux-network
    deploy:
      replicas: 1
      restart_policy:
        condition: on-failure
networks:
  lux-network:
    driver: bridge
```

### 3. Updated Types for Dual Signatures

Updated types.ts for dual-signature support:

```typescript
import Web3 from "web3"
import { RegisteredSubscription } from "web3/lib/commonjs/eth.exports"

export type CONTRACTS = {
  [key: string]: string
}

export type SETTINGS = {
  RPC: string[]
  LuxETH: CONTRACTS
  LuxBTC: CONTRACTS
  WSHM: CONTRACTS
  Teleporter: CONTRACTS
  NetNames: {
    [key: string]: string
  }
  DB: string
  Msg: string
  DupeListLimit: string
  SMTimeout: number
  NewSigAllowed: boolean
  SigningManagers: string[]
  KeyStore: string
}

// Enum for signature schemes
export enum SignatureScheme {
  ECDSA = 'ecdsa',
  EDDSA = 'eddsa'
}

// Signing request interface
export type SIGN_REQUEST = {
  tokenAmount: string
  web3Form: Web3<RegisteredSubscription>
  vault: boolean
  decimals: number
  receiverAddressHash: string
  toNetworkId: string
  toTokenAddress: string
  hashedTxId: string
  nonce: string
  // Optional signature scheme to use
  signatureScheme?: SignatureScheme
}

// Network configuration with signature scheme
export type NETWORK_CONFIG = {
  display_name: string
  internal_name: string
  is_testnet: boolean
  chain_id: string
  teleporter: string
  vault: string
  node: string
  currencies: TOKEN[]
  // Signature scheme to use for this network
  signature_scheme?: SignatureScheme
}

// Token configuration
export type TOKEN = {
  name: string
  asset: string
  contract_address: null | string
  decimals: number
  is_native: boolean
}
```

### 4. Updated Utility Functions

The `utils.ts` file has been updated to support both signature schemes:

```typescript
import Web3 from "web3"
import dotenv from "dotenv"
import find from "find-process"
import { RegisteredSubscription } from "web3/lib/commonjs/eth.exports"
import { recoverAddress } from "ethers"
import { promisify } from "util"
import { exec as childExec } from "child_process"
import { settings } from "./config"
import { SIGN_REQUEST } from "./types"

const exec = promisify(childExec)
dotenv.config()

// Signature scheme enum
enum SignatureScheme {
  ECDSA = 'ecdsa',
  EDDSA = 'eddsa'
}

// Default signature scheme from environment
const DEFAULT_SIGNATURE_SCHEME = (process.env.DEFAULT_SIGNATURE_SCHEME || 'ecdsa').toLowerCase() as SignatureScheme

// Client and manager names for different signature schemes
const SIGNATURE_CONFIG = {
  [SignatureScheme.ECDSA]: {
    clientName: process.env.ECDSA_CLIENT_NAME || process.env.sign_client_name,
    smManager: process.env.ECDSA_SM_MANAGER || process.env.sign_sm_manager,
    directory: 'ecdsa'
  },
  [SignatureScheme.EDDSA]: {
    clientName: process.env.EDDSA_CLIENT_NAME || 'frost_sign_client',
    smManager: process.env.EDDSA_SM_MANAGER || 'frost_sm_manager',
    directory: 'eddsa'
  }
}

/* SM Manager Timeout Params */
const smTimeOutBound = Number(process.env.smTimeOutBound)

/** key share for this node */
const keyStore = settings.KeyStore

/**
 * Map chain IDs to signature schemes
 * Defaults to ECDSA for backward compatibility
 */
const CHAIN_SIGNATURE_SCHEMES: Record<string, SignatureScheme> = {
  // Default EVM chains use ECDSA
  "1": SignatureScheme.ECDSA,     // Ethereum
  "56": SignatureScheme.ECDSA,    // BSC
  "137": SignatureScheme.ECDSA,   // Polygon
  "43114": SignatureScheme.ECDSA, // Avalanche
  // Solana uses EdDSA
  "SOL-MAINNET": SignatureScheme.EDDSA,
  "SOL-DEVNET": SignatureScheme.EDDSA,
  // Add other EdDSA chains as needed
}

/**
 * Get signature scheme for a chain
 * @param chainId Chain ID
 * @returns Signature scheme to use
 */
export const getSignatureSchemeForChain = (chainId: string): SignatureScheme => {
  return CHAIN_SIGNATURE_SCHEMES[chainId] || DEFAULT_SIGNATURE_SCHEME
}

/**
 * Kill a signer process
 * @param signerProc Process ID
 */
const killSigner = async (signerProc: string) => {
  try {
    console.log("::Killing Signer..")
    const cmd = "kill -9 " + signerProc
    const out = await exec(cmd)
    console.log("::Signer dead...", out)
  } catch (e) {
    console.log("::Signer process already dead:", e)
  }
}

/**
 * get WEB3 object by given network's rpc url
 * @param rpcUrl
 * @returns
 */
export const getWeb3FormForRPC = (rpcUrl: string) => {
  try {
    const _web3 = new Web3(new Web3.providers.HttpProvider(rpcUrl))
    return _web3
  } catch (err) {
    return null
  }
}

/**
 * kill all running signers for all signature schemes
 */
export const killSigners = async () => {
  try {
    // Kill ECDSA signers
    const ecdsaConfig = SIGNATURE_CONFIG[SignatureScheme.ECDSA]
    const ecdsaList = await find("name", `${ecdsaConfig.clientName} ${ecdsaConfig.smManager}`)
    if (ecdsaList.length > 0) {
      for (const p of ecdsaList) {
        await killSigner(String(p.pid))
      }
    }

    // Kill EdDSA signers
    const eddsaConfig = SIGNATURE_CONFIG[SignatureScheme.EDDSA]
    const eddsaList = await find("name", `${eddsaConfig.clientName} ${eddsaConfig.smManager}`)
    if (eddsaList.length > 0) {
      for (const p of eddsaList) {
        await killSigner(String(p.pid))
      }
    }
  } catch (err) {
    console.log("::killSignersError:", err)
  }
}

/**
 * generate signature using the appropriate scheme
 * @param msgHash Message hash to sign
 * @param scheme Signature scheme to use
 * @returns Signature components
 */
export const signClient = async (msgHash: string, scheme: SignatureScheme = DEFAULT_SIGNATURE_SCHEME) => {
  return new Promise(async (resolve, reject) => {
    try {
      const config = SIGNATURE_CONFIG[scheme]
      console.log(`========================================================= In ${scheme.toUpperCase()} Sign Client ============================================================`)
      
      const list = await find("name", `${config.clientName} ${config.smManager}`)
      if (list.length > 0) {
        console.log("::clientAlreadyRunning:::", list)
        try {
          const x = list.length === 1 ? 0 : 1
          const uptimeCmd = "ps -p " + list[x].pid + " -o etime"
          const uptimeOut = await exec(uptimeCmd)
          const upStdout = uptimeOut.stdout
          const upStderr = uptimeOut.stderr

          if (upStdout) {
            const up = upStdout.split("\n")[1].trim().split(":")
            console.log("::upStdout:", up, "Time Bound:", smTimeOutBound)
            const upStdoutArr = up
            // SM Manager timed out
            if (Number(upStdoutArr[upStdoutArr.length - 1]) >= smTimeOutBound) {
              console.log("::SM Manager signing timeout reached")
              try {
                for (const p of list) {
                  await killSigner(String(p.pid))
                }
                const cmd = `./target/release/examples/${config.clientName} ${config.smManager} ${keyStore} ${msgHash}`
                await exec(cmd, { cwd: __dirname + `/multiparty/${config.directory}`, shell: "/bin/bash" })
              } catch (err) {
                console.log("::Partial signature process may not have exited:", err)
                resolve(signClient(msgHash, scheme))
                return
              }
            } else {
              // Retry with same scheme
              resolve(signClient(msgHash, scheme))
              return
            }
          } else {
            console.log("::upStderr:", upStderr)
            reject("::SignerDeadError2:" + upStderr)
            return
          }
        } catch (err) {
          console.log("::SignerDeadError3:", err)
          reject("SignerDeadError3:" + err)
          return
        }
      } else {
        console.log("About to message signers...")
        try {
          //Invoke client signer
          console.log(`::Using ${scheme} signer: ${config.clientName} ${config.smManager}`)
          const cmd = `./target/release/examples/${config.clientName} ${config.smManager} ${keyStore} ${msgHash}`
          console.log("::command: ", cmd)
          const out = await exec(cmd, { cwd: __dirname + `/multiparty/${config.directory}` })
          const { stdout, stderr } = out
          console.log("::stdout:", stdout, stderr)
          
          if (stdout) {
            if (scheme === SignatureScheme.ECDSA) {
              // Process ECDSA signature format
              const sig = stdout.split("sig_json")[1].split(",")
              if (sig.length > 0) {
                const r = sig[0].replace(": ", "").replace(/["]/g, "").trim()
                const s = sig[1].replace(/["]/g, "").trim()
                const v = Number(sig[2].replace(/["]/g, "")) === 0 ? "1b" : "1c"
                let signature = "0x" + r + s + v
                if (signature.length < 132) {
                  throw new Error("elements in xs are not pairwise distinct")
                }
                // Handle odd length sigs
                if (signature.length % 2 != 0) {
                  signature = "0x0" + signature.split("0x")[1]
                }

                console.log("::ECDSA Signature:", signature)
                resolve({ r, s, v, signature, scheme: SignatureScheme.ECDSA })
                return
              }
            } else if (scheme === SignatureScheme.EDDSA) {
              // Process EdDSA signature format - this will vary based on your EdDSA implementation
              // The below is a placeholder and should be adjusted based on your EdDSA output format
              const sigOutput = stdout.trim()
              const signatureMatch = sigOutput.match(/signature: ([0-9a-fA-F]+)/)
              
              if (signatureMatch && signatureMatch[1]) {
                const signature = "0x" + signatureMatch[1]
                console.log("::EdDSA Signature:", signature)
                resolve({ signature, scheme: SignatureScheme.EDDSA })
                return
              } else {
                reject("EdDSA signature format not recognized")
                return
              }
            }
          } else {
            console.log("::stderr:" + stderr)
            reject("SignerFailError1:" + stderr)
            return
          }
        } catch (err) {
          console.log("::SignerFailError2:" + err)

          if (err.toString().includes("elements in xs are not pairwise distinct")) {
            await sleep(2000)
            resolve(signClient(msgHash, scheme))
            return
          } else {
            reject("SignerFailError2: " + err)
            return
          }
        }
      }
    } catch (err) {
      console.log("::sign client error: =======================")
      console.log(err.stack || err)
      reject(err.stack)
      return
    }
  })
}

/**
 * sign message with appropriate signature scheme
 * @param message
 * @param web3
 * @param chainId
 * @returns
 */
export const signMessage = async (message: string, web3: Web3<RegisteredSubscription>, chainId?: string) => {
  try {
    // Determine the signature scheme to use
    const scheme = chainId ? getSignatureSchemeForChain(chainId) : DEFAULT_SIGNATURE_SCHEME
    
    if (scheme === SignatureScheme.ECDSA) {
      return signECDSAMessage(message, web3)
    } else {
      return signEdDSAMessage(message)
    }
  } catch (err) {
    console.log("Error:", err)
    return Promise.reject(err)
  }
}

/**
 * Sign a message using ECDSA
 */
const signECDSAMessage = async (message: string, web3: Web3<RegisteredSubscription>) => {
  const myMsgHashAndPrefix = web3.eth.accounts.hashMessage(message)
  const netSigningMsg = myMsgHashAndPrefix.substr(2)
  
  try {
    const { signature, r, s, v } = (await signClient(netSigningMsg, SignatureScheme.ECDSA)) as any
    let signer = ""
    try {
      signer = recoverAddress(myMsgHashAndPrefix, signature)
      console.log("ECDSA MPC Address:", signer)
    } catch (err) {
      console.log("err: ", err)
    }
    return Promise.resolve({ signature, signer, scheme: SignatureScheme.ECDSA })
  } catch (err) {
    console.log("Error:", err)
    return Promise.reject("signClientError:")
  }
}

/**
 * Sign a message using EdDSA
 */
const signEdDSAMessage = async (message: string) => {
  // Convert message to appropriate format for EdDSA
  // This might be different than ECDSA hashing
  const messageBuffer = Buffer.from(message)
  const messageHash = messageBuffer.toString('hex')
  
  try {
    const { signature } = (await signClient(messageHash, SignatureScheme.EDDSA)) as any
    // EdDSA doesn't use recovery, so we can't derive the public key here
    // You'd need to store the public key and verify signatures differently
    return Promise.resolve({ signature, signer: "", scheme: SignatureScheme.EDDSA })
  } catch (err) {
    console.log("Error:", err)
    return Promise.reject("signClientError:")
  }
}

/**
 * Concatenate the message to be hashed.
 * @param toNetworkIdHash
 * @param txIdHash
 * @param toTokenAddress
 * @param tokenAmount
 * @param decimals
 * @param receiverAddressHash
 * @param vault
 * @returns merged msg
 */
export const concatMsg = (toNetworkIdHash: string, hashedTxId: string, toTokenAddress: string, tokenAmount: string, decimals: number, receiverAddressHash: string, vault: boolean) => {
  return toNetworkIdHash + hashedTxId + toTokenAddress + tokenAmount + decimals + receiverAddressHash + vault
}

/**
 * hash tx and sign with appropriate signature scheme
 * @param param0
 * @returns
 */
export const hashAndSignTx = async ({ web3Form, vault, toNetworkId, hashedTxId, toTokenAddress, tokenAmount, decimals, receiverAddressHash, nonce }: SIGN_REQUEST) => {
  try {
    const scheme = getSignatureSchemeForChain(toNetworkId)
    const toNetworkIdHash = Web3.utils.keccak256(toNetworkId)
    const toTokenAddressHash = Web3.utils.keccak256(toTokenAddress)
    
    // Format message based on signature scheme
    if (scheme === SignatureScheme.ECDSA) {
      const message = concatMsg(toNetworkIdHash, hashedTxId, toTokenAddressHash, tokenAmount, decimals, receiverAddressHash, vault)
      console.log("::ECDSA message to sign: ", message)
      const hash = web3Form.utils.soliditySha3(message)
      const { signature, signer } = await signMessage(hash, web3Form, toNetworkId)
      return Promise.resolve({ signature, mpcSigner: signer })
    } else {
      // EdDSA message formatting might be different
      const message = concatMsg(toNetworkIdHash, hashedTxId, toTokenAddressHash, tokenAmount, decimals, receiverAddressHash, vault)
      console.log("::EdDSA message to sign: ", message)
      // For EdDSA we can hash the message differently if needed
      const { signature, signer } = await signMessage(message, web3Form, toNetworkId)
      return Promise.resolve({ signature, mpcSigner: signer })
    }
  } catch (err) {
    if (err.toString().includes("invalid point")) {
      hashAndSignTx({ web3Form, vault, toNetworkId, hashedTxId, toTokenAddress, tokenAmount, decimals, receiverAddressHash, nonce })
    } else {
      console.log(err)
      return Promise.reject(err)
    }
  }
}

/**
 * await for miliseconds
 * @param millis
 * @returns
 */
export const sleep = async (millis: number) => new Promise((resolve) => setTimeout(resolve, millis))
```

### 5. Solana Network Configuration

Add Solana configuration to the settings:

```typescript
// Add this to your settings.ts file to support Solana and other EdDSA chains

import { SignatureScheme } from "../types"

// Add to the MAIN_NETWORKS array
const solanaMainnetConfig = {
  display_name: "Solana",
  internal_name: "SOLANA_MAINNET",
  is_testnet: false,
  chain_id: "SOL-MAINNET",
  teleporter: "<YOUR_SOLANA_MAINNET_TELEPORTER_ADDRESS>",  // Replace with your Solana teleporter address
  vault: "<YOUR_SOLANA_MAINNET_VAULT_ADDRESS>",      // Replace with your Solana vault address
  node: "https://api.mainnet-beta.solana.com",
  signature_scheme: SignatureScheme.EDDSA, // Specify EdDSA for Solana
  currencies: [
    {
      name: "SOL",
      asset: "SOL",
      contract_address: null,
      decimals: 9,
      is_native: true
    },
    {
      name: "USDC",
      asset: "USDC",
      contract_address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      decimals: 6,
      is_native: false
    },
    // Add more Solana tokens as needed
  ]
}

// Add to the TEST_NETWORKS array
const solanaDevnetConfig = {
  display_name: "Solana Devnet",
  internal_name: "SOLANA_DEVNET",
  is_testnet: true,
  chain_id: "SOL-DEVNET",
  teleporter: "<YOUR_SOLANA_DEVNET_TELEPORTER_ADDRESS>",
  vault: "<YOUR_SOLANA_DEVNET_VAULT_ADDRESS>",
  node: "https://api.devnet.solana.com",
  signature_scheme: SignatureScheme.EDDSA, // Specify EdDSA for Solana
  currencies: [
    {
      name: "SOL",
      asset: "SOL",
      contract_address: null,
      decimals: 9,
      is_native: true
    },
    // Add more Solana devnet tokens as needed
  ]
}

// Add these to your SWAP_PAIRS object
const solanaSwapPairs = {
  // Native SOL can be swapped with wrapped SOL tokens on other chains
  SOL: ["LSOL", "ZSOL"],
  LSOL: ["SOL", "ZSOL"],
  ZSOL: ["SOL", "LSOL"],
  
  // Add other token swap pairs
  // ...
}

// Export these settings to be added to your main arrays
export const NEW_NETWORKS = {
  mainnet: [solanaMainnetConfig],
  testnet: [solanaDevnetConfig]
}

export const NEW_SWAP_PAIRS = solanaSwapPairs
```

## Configuration

### Environment Variables

| Variable | Description | Default Value |
|----------|-------------|---------------|
| `DEFAULT_SIGNATURE_SCHEME` | Default signature scheme when not specified | `ecdsa` |
| `ECDSA_CLIENT_NAME` | Name of ECDSA client executable | `gg18_sign_client` |
| `ECDSA_SM_MANAGER` | Name of ECDSA session manager executable | `gg18_sm_manager` |
| `EDDSA_CLIENT_NAME` | Name of EdDSA client executable | `frost_sign_client` |
| `EDDSA_SM_MANAGER` | Name of EdDSA session manager executable | `frost_sm_manager` |
| `smTimeOutBound` | Session manager timeout value | Varies |
| `node_number` | MPC node number in the network | Varies |

### Chain-to-Signature Scheme Mapping

```typescript
const CHAIN_SIGNATURE_SCHEMES: Record<string, SignatureScheme> = {
  // Default EVM chains use ECDSA
  "1": SignatureScheme.ECDSA,     // Ethereum
  "56": SignatureScheme.ECDSA,    // BSC
  "137": SignatureScheme.ECDSA,   // Polygon
  "43114": SignatureScheme.ECDSA, // Avalanche
  // Solana uses EdDSA
  "SOL-MAINNET": SignatureScheme.EDDSA,
  "SOL-DEVNET": SignatureScheme.EDDSA,
  // Add other EdDSA chains as needed
}
```

## Key Generation

### Key Generation Script

This script generates keys for both signature schemes:

```bash
#!/bin/bash
# Dual-signature key generation script for MPC nodes
# This script generates keys for both ECDSA and EdDSA signature schemes

# Configuration
NODE_NUMBER=${NODE_NUMBER:-0}
ECDSA_CLIENT_NAME=${ECDSA_CLIENT_NAME:-gg18_keygen_client}
ECDSA_SM_MANAGER=${ECDSA_SM_MANAGER:-gg18_sm_manager}
EDDSA_CLIENT_NAME=${EDDSA_CLIENT_NAME:-frost_keygen_client}
EDDSA_SM_MANAGER=${EDDSA_SM_MANAGER:-frost_sm_manager}
THRESHOLD=${THRESHOLD:-2}
TOTAL_PARTIES=${TOTAL_PARTIES:-3}

echo "===== MPC Key Generation for Node $NODE_NUMBER ====="
echo "- Threshold: $THRESHOLD"
echo "- Total Parties: $TOTAL_PARTIES"

# Generate ECDSA keys
echo "===== Generating ECDSA Keys ====="
cd /app/dist/multiparty/ecdsa || exit 1
./target/release/examples/$ECDSA_CLIENT_NAME $ECDSA_SM_MANAGER $NODE_NUMBER $THRESHOLD $TOTAL_PARTIES

# Check if ECDSA keygen was successful
if [ $? -ne 0 ]; then
  echo "❌ ECDSA key generation failed!"
  exit 1
else
  echo "✅ ECDSA key generation successful!"
fi

# Generate EdDSA keys
echo "===== Generating EdDSA Keys ====="
cd /app/dist/multiparty/eddsa || exit 1
./target/release/examples/$EDDSA_CLIENT_NAME $EDDSA_SM_MANAGER $NODE_NUMBER $THRESHOLD $TOTAL_PARTIES

# Check if EdDSA keygen was successful
if [ $? -ne 0 ]; then
  echo "❌ EdDSA key generation failed!"
  exit 1
else
  echo "✅ EdDSA key generation successful!"
fi

echo "===== Key Generation Complete ====="
echo "✅ Both ECDSA and EdDSA keys have been generated successfully!"
echo "✅ Node is ready for signing operations."
```

## Signature Verification

### Verifying EdDSA Signatures in Solana

```rust
// Example Solana program for verifying Ed25519 signatures from your MPC system

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
    ed25519_program,
};

// Entry point for the Solana program
entrypoint!(process_instruction);

// Process instruction logic
pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    msg!("Processing Bridge instruction");

    // Get account iterator
    let accounts_iter = &mut accounts.iter();

    // Get accounts
    let bridge_account = next_account_info(accounts_iter)?;
    let payer = next_account_info(accounts_iter)?;
    
    // Verify the bridge account is owned by this program
    if bridge_account.owner != program_id {
        return Err(ProgramError::IncorrectProgramId);
    }

    // Parse instruction type
    if instruction_data.len() < 4 {
        return Err(ProgramError::InvalidInstructionData);
    }

    // Read instruction type from first byte
    let instruction_type = instruction_data[0];

    match instruction_type {
        // Process token bridge with Ed25519 signature verification
        0 => process_bridge_tokens(accounts, &instruction_data[1..]),
        
        // Other instruction types
        _ => {
            msg!("Invalid instruction type");
            Err(ProgramError::InvalidInstructionData)
        }
    }
}

// Process token bridge with Ed25519 signature verification
fn process_bridge_tokens(accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    msg!("Processing bridge token request");

    // Get account iterator
    let accounts_iter = &mut accounts.iter();

    // Skip bridge account that was already processed
    let _bridge_account = next_account_info(accounts_iter)?;
    let _payer = next_account_info(accounts_iter)?;
    
    // Get ed25519 program account for signature verification
    let ed25519_program_id = next_account_info(accounts_iter)?;
    
    // Ensure we're using the correct program
    if *ed25519_program_id.key != ed25519_program::id() {
        return Err(ProgramError::InvalidArgument);
    }

    // Parse data
    if data.len() < 32 + 64 + 32 {
        msg!("Data too short for signature verification");
        return Err(ProgramError::InvalidInstructionData);
    }

    // Extract public key, signature, and message from data
    let public_key = &data[0..32];
    let signature = &data[32..96];
    let message = &data[96..];

    // Verify the Ed25519 signature
    let signature_valid = ed25519_program::verify_signature(
        public_key,
        message,
        signature,
    );

    if !signature_valid {
        msg!("Invalid Ed25519 signature");
        return Err(ProgramError::InvalidArgument);
    }

    msg!("Signature verification successful");

    // Continue with token bridging logic
    // ...
    
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_verify_ed25519_signature() {
        // Test signature verification logic
        // ...
    }
}
```

### Verifying ECDSA Signatures in EVM Chains

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title Bridge Signature Verifier
 * @dev Verifies ECDSA signatures for cross-chain teleport operations
 */
contract BridgeSignatureVerifier {
    /**
     * @dev Verifies a signature
     * @param _hash The hash that was signed
     * @param _signature The signature bytes
     * @param _expectedSigner The expected signer address
     * @return True if signature is valid and matches expected signer
     */
    function verifySignature(
        bytes32 _hash, 
        bytes memory _signature, 
        address _expectedSigner
    ) internal pure returns (bool) {
        // Recover signer from signature
        address recoveredSigner = recoverSigner(_hash, _signature);
        
        // Check if recovered signer matches expected signer
        return recoveredSigner == _expectedSigner;
    }
    
    /**
     * @dev Recovers the signer from a signature
     * @param _hash The hash that was signed
     * @param _signature The signature bytes
     * @return The address of the signer
     */
    function recoverSigner(
        bytes32 _hash, 
        bytes memory _signature
    ) internal pure returns (address) {
        require(_signature.length == 65, "Invalid signature length");
        
        bytes32 r;
        bytes32 s;
        uint8 v;
        
        // Extract r, s, v from signature
        assembly {
            r := mload(add(_signature, 32))
            s := mload(add(_signature, 64))
            v := byte(0, mload(add(_signature, 96)))
        }
        
        // Version of signature should be 27 or 28, but EIP-155 recovery adds chain ID
        if (v < 27) {
            v += 27;
        }
        
        // Recover the signer
        address signer = ecrecover(_hash, v, r, s);
        require(signer != address(0), "ECDSA: invalid signature");
        
        return signer;
    }
}
```

## Troubleshooting

### Common Issues and Solutions

#### 1. Signature Scheme Mismatch

**Problem**: The wrong signature scheme is being used for a particular chain.

**Solution**: 
- Check the `CHAIN_SIGNATURE_SCHEMES` mapping in `utils.ts`.
- Ensure the chain ID is correctly mapped to the appropriate signature scheme.
- Add explicit mapping for missing chains.

#### 2. Missing Binaries

**Problem**: The MPC binaries for either ECDSA or EdDSA are missing or not found.

**Solution**:
- Verify the Docker build process completed successfully.
- Check that the binary paths in the Docker container match the paths expected in the code.
- Ensure the git repositories were successfully cloned and built.

#### 3. EdDSA Signature Output Format Mismatch

**Problem**: The output format from the EdDSA library doesn't match the expected format in the code.

**Solution**:
- Check the actual output format of your EdDSA library.
- Update the signature parsing logic in `signClient` function to match the output format.
- Add debug logging to see the actual output structure.

#### 4. Key Generation Failure

**Problem**: Key generation fails for either ECDSA or EdDSA.

**Solution**:
- Ensure all nodes are running and accessible.
- Check that the threshold and party count parameters are consistent across all nodes.
- Verify network connectivity between nodes during key generation.
- Check logs for specific errors.

## References

1. [ZenGo Multi-Party ECDSA](https://github.com/ZenGo-X/multi-party-ecdsa)
2. [ZenGo Multi-Party EdDSA](https://github.com/ZenGo-X/multi-party-eddsa)
3. [Solana Ed25519 Program](https://docs.rs/solana-program/latest/solana_program/ed25519_program/index.html)
4. [EdDSA RFC 8032](https://tools.ietf.org/html/rfc8032)
5. [Solana Developer Documentation](https://docs.solana.com/developing/programming-model/overview)
6. [ECDSA Wikipedia](https://en.wikipedia.org/wiki/Elliptic_Curve_Digital_Signature_Algorithm)
7. [EdDSA Wikipedia](https://en.wikipedia.org/wiki/EdDSA)
8. [Threshold Signatures for Blockchains](https://medium.com/zengo/threshold-signatures-private-key-the-next-generation-f27b30793b)
