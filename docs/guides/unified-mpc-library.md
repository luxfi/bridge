# Unified MPC Library: Bridging ECDSA and EdDSA for Lux.Network

## BLUF: Signature scheme integration made simple

This documentation provides a comprehensive guide for creating a unified Multi-Party Computation (MPC) library that abstracts the differences between ECDSA and EdDSA implementations in the Lux.Network bridge. The library enables developers to implement consistent threshold signature workflows across different blockchain networks using a single API, regardless of the underlying signature scheme. Key architectural considerations include a layered abstraction approach, clearly defined interfaces between components, deterministic key derivation from common seeds, and specialized protocol implementations optimized for each signature scheme's mathematical properties.

## Understanding signature schemes fundamentals

Digital signature schemes form the backbone of blockchain transaction security, with ECDSA and EdDSA representing two distinct approaches with different security properties and implementation characteristics.

### ECDSA vs EdDSA: Core differences

**ECDSA (Elliptic Curve Digital Signature Algorithm)** and **EdDSA (Edwards-curve Digital Signature Algorithm)** differ in several fundamental ways that impact their MPC implementations:

| Characteristic | ECDSA | EdDSA |
| --- | --- | --- |
| Curve type | Weierstrass form (y² = x³ + ax + b) | Twisted Edwards (ax² + y² = 1 + dx²y²) |
| Popular curves | secp256k1, secp256r1 | Ed25519, Ed448 |
| Nonce generation | Traditionally random (security risk) | Deterministic (derived from key and message) |
| MPC complexity | Higher (non-linear signing equation) | Lower (linear structure) |
| Communication rounds | Typically 4+ rounds | Typically 3 rounds |
| Side-channel resistance | Requires careful implementation | Built-in protection |

**Impact on MPC implementation:** EdDSA's design makes it inherently more MPC-friendly due to its deterministic nonce generation and simpler mathematical structure. ECDSA requires more complex protocols to handle its non-linear signing equation securely in a distributed setting.

### Which blockchains use what?

Different blockchain networks use different signature schemes:

- **ECDSA**: Bitcoin, Ethereum, and most EVM-compatible chains
- **EdDSA**: Solana (Ed25519), Cardano, Polkadot, Cosmos

The Lux.Network bridge currently supports numerous EVM-compatible chains using ECDSA, and adding support for EdDSA will enable connections to networks like Solana, Cardano, and other non-EVM chains.

## Architecture design principles

The unified MPC library's architecture must balance abstraction with optimization, providing a consistent API while leveraging scheme-specific optimizations under the hood.

### Layered abstraction model

A multi-layered architecture provides different levels of abstraction for different use cases:

```
┌─────────────────────────────────────────────────────┐
│ Application Layer (Lux.Network Bridge)              │
└───────────────────────┬─────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────┐
│ Unified API (Common Interface for All Schemes)      │
└───────────────────────┬─────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────┐
│ Protocol Layer (Scheme-Specific MPC Protocols)      │
├─────────────┬─────────┴────────────┬────────────────┤
│ ECDSA       │ EdDSA                │ Future Schemes │
│ Protocol    │ Protocol             │ (e.g., BLS)    │
└─────────────┴──────────────────────┴────────────────┘
```

This structure allows for:
- **Common interfaces** at the top layers
- **Specialized implementations** at the lower layers
- **Easy extensibility** for future signature schemes

### Component interfaces

The core interfaces establish a consistent API across signature schemes:

```typescript
enum SignatureScheme {
  ECDSA = 'ecdsa',
  EDDSA = 'eddsa'
}

interface SignatureService {
  generateKeyPair(params: SecurityParameters): Promise<KeyPair>;
  distributeShares(key: PrivateKey, threshold: number, parties: number): Promise<KeyShare[]>;
  sign(message: Buffer, scheme?: SignatureScheme): Promise<SignatureResult>;
  verify(message: Buffer, signature: Buffer, publicKey: Buffer, scheme?: SignatureScheme): Promise<boolean>;
  getSignatureSchemeForChain(chainId: string): SignatureScheme;
}

interface KeyShare {
  getPartyId(): number;
  getShareData(): Buffer;
  isValid(): boolean;
  refresh(): KeyShare; // For proactive security
}

interface MPCParty {
  sendMessage(message: Message, recipient: PartyId): void;
  broadcast(message: Message): void;
  registerMessageHandler(handler: MessageHandler): void;
  getSessionState(): SessionState;
}

interface SignatureResult {
  signature: string;
  signer?: string; // For ECDSA, recovered address; empty for EdDSA
  scheme: SignatureScheme;
}
```

### Factory pattern for scheme selection

Implement a factory pattern to instantiate the appropriate cryptographic implementations:

```typescript
// Create the appropriate scheme implementation
const signatureService = SignatureServiceFactory.create({
  supportedSchemes: [SchemeType.ECDSA, SchemeType.EDDSA],
  ecdsaParams: new ECDSAParameters(Curve.SECP256K1),
  eddsaParams: new EdDSAParameters(Curve.ED25519),
  defaultScheme: SchemeType.ECDSA
});

// Chain-to-scheme mapping configuration
const chainSignatureSchemes: Record<string, SignatureScheme> = {
  // Default EVM chains use ECDSA
  "1": SignatureScheme.ECDSA,     // Ethereum
  "56": SignatureScheme.ECDSA,    // BSC
  "137": SignatureScheme.ECDSA,   // Polygon
  "43114": SignatureScheme.ECDSA, // Avalanche
  "96369": SignatureScheme.ECDSA, // Lux Network
  "200200": SignatureScheme.ECDSA, // Zoo Network
  // Non-EVM chains use EdDSA
  "SOL-MAINNET": SignatureScheme.EDDSA,  // Solana
  "SOL-DEVNET": SignatureScheme.EDDSA,   // Solana Devnet
  "ADA-MAINNET": SignatureScheme.EDDSA,  // Cardano
  "DOT-MAINNET": SignatureScheme.EDDSA,  // Polkadot
};
```

This approach encapsulates implementation details while providing a consistent interface.

## Integration with Lux.Network Bridge

### Docker Configuration

Update the Dockerfile for MPC nodes to include both ECDSA and EdDSA implementations:

```dockerfile
# Use Rust as the base image
FROM rust:latest AS rust_builder

# Set the working directory
WORKDIR /app

# Clone the external MPC repositories instead of embedding them
RUN apt-get update && apt-get install -y git pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

# Clone the ECDSA repository
RUN git clone https://github.com/luxfi/multi-party-ecdsa.git ./ecdsa

# Clone the EdDSA repository
RUN git clone https://github.com/luxfi/multi-party-eddsa.git ./eddsa

# Install nightly version of Rust and set it as the default toolchain
RUN rustup install nightly
RUN rustup default nightly

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

### Environment Configuration

Add environment variables for signature scheme configuration:

```yaml
services:
  mpc-node:
    environment:
      # Existing variables...
      
      # New environment variables for signature scheme selection
      - ECDSA_CLIENT_NAME=gg18_sign_client
      - ECDSA_SM_MANAGER=gg18_sm_manager
      - EDDSA_CLIENT_NAME=frost_sign_client
      - EDDSA_SM_MANAGER=frost_sm_manager
      - DEFAULT_SIGNATURE_SCHEME=ecdsa
```

## Unified key generation and management

Key generation and management are critical components that must be carefully designed to work across different signature schemes.

### From common seed to scheme-specific keys

Rather than trying to convert between ECDSA and EdDSA keys (which is not mathematically sound), derive different scheme-specific keys from a common master seed:

```
Master Seed
    │
    ├─→ KDF(seed, "ECDSA") → ECDSA Private Key
    │
    └─→ KDF(seed, "EdDSA") → EdDSA Private Key
```

This approach ensures:
- A single backup seed can restore all keys
- Different schemes use cryptographically isolated keys
- No security compromises from attempted direct conversions

### Implementing unified key generation script

```typescript
// Key generation utilities
class KeyGenerator {
  private masterSeed: Buffer;
  
  constructor(seed?: Buffer) {
    // Generate random seed if not provided
    this.masterSeed = seed || crypto.randomBytes(32);
  }
  
  // Get the master seed (for backup)
  getMasterSeed(): Buffer {
    return this.masterSeed;
  }
  
  // Derive ECDSA key
  deriveECDSAKey(): Buffer {
    return crypto.createHmac('sha256', this.masterSeed)
      .update('ECDSA')
      .digest();
  }
  
  // Derive EdDSA key
  deriveEdDSAKey(): Buffer {
    return crypto.createHmac('sha256', this.masterSeed)
      .update('EdDSA')
      .digest();
  }
  
  // Generate keys for all supported schemes
  generateAllKeys(): Record<SignatureScheme, Buffer> {
    return {
      [SignatureScheme.ECDSA]: this.deriveECDSAKey(),
      [SignatureScheme.EDDSA]: this.deriveEdDSAKey()
    };
  }
}
```

### Bash script for unified keygen

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

## The signing process: protocol differences

The signing process reveals the most significant differences between ECDSA and EdDSA in MPC contexts.

### Implementing unified signing utility

```typescript
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
  "96369": SignatureScheme.ECDSA, // Lux Network
  "200200": SignatureScheme.ECDSA, // Zoo Network
  // Non-EVM chains use EdDSA
  "SOL-MAINNET": SignatureScheme.EDDSA,  // Solana
  "SOL-DEVNET": SignatureScheme.EDDSA,   // Solana Devnet
  "ADA-MAINNET": SignatureScheme.EDDSA,  // Cardano
  "DOT-MAINNET": SignatureScheme.EDDSA,  // Polkadot
};

/**
 * Get signature scheme for a chain
 * @param chainId Chain ID
 * @returns Signature scheme to use
 */
export const getSignatureSchemeForChain = (chainId: string): SignatureScheme => {
  return CHAIN_SIGNATURE_SCHEMES[chainId] || DEFAULT_SIGNATURE_SCHEME
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
              // Process EdDSA signature format
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
```

### Dynamic transaction signing

```typescript
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
      // EdDSA message formatting might be different for specific chains
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
```

## Network handling and protocol sessions

MPC requires secure communication between parties, with different requirements for each protocol.

### Session state management

```typescript
interface SessionManager {
  createSession(sessionType: SessionType, params: SessionParameters): Session;
  getSession(id: SessionId): Session;
  closeSession(id: SessionId): void;
}

interface Session {
  getId(): SessionId;
  getType(): SessionType;
  getState(): SessionState;
  isComplete(): boolean;
  getOutgoingMessages(): Message[];
  processIncomingMessages(messages: Message[]): void;
  getResult(): any; // Result depends on session type
}

// Session implementation
class MPCSession implements Session {
  private id: SessionId;
  private type: SessionType;
  private state: SessionState = SessionState.INITIALIZED;
  private messages: Message[] = [];
  private result: any = null;
  private scheme: SignatureScheme;
  
  constructor(id: SessionId, type: SessionType, scheme: SignatureScheme) {
    this.id = id;
    this.type = type;
    this.scheme = scheme;
  }
  
  getId(): SessionId {
    return this.id;
  }
  
  getType(): SessionType {
    return this.type;
  }
  
  getState(): SessionState {
    return this.state;
  }
  
  isComplete(): boolean {
    return this.state === SessionState.COMPLETED;
  }
  
  getOutgoingMessages(): Message[] {
    return this.messages;
  }
  
  processIncomingMessages(messages: Message[]): void {
    // Process protocol-specific messages
    // This will differ between ECDSA and EdDSA
    if (this.scheme === SignatureScheme.ECDSA) {
      this.processECDSAMessages(messages);
    } else {
      this.processEdDSAMessages(messages);
    }
  }
  
  private processECDSAMessages(messages: Message[]): void {
    // ECDSA-specific message processing
    // ...
  }
  
  private processEdDSAMessages(messages: Message[]): void {
    // EdDSA-specific message processing
    // ...
  }
  
  getResult(): any {
    return this.result;
  }
  
  setComplete(result: any): void {
    this.state = SessionState.COMPLETED;
    this.result = result;
  }
}

// Session manager implementation
class MPCSessionManager implements SessionManager {
  private sessions: Map<SessionId, Session> = new Map();
  
  createSession(type: SessionType, params: SessionParameters): Session {
    const id = crypto.randomBytes(16).toString('hex');
    const scheme = params.scheme || SignatureScheme.ECDSA;
    const session = new MPCSession(id, type, scheme);
    this.sessions.set(id, session);
    return session;
  }
  
  getSession(id: SessionId): Session {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Session not found: ${id}`);
    }
    return session;
  }
  
  closeSession(id: SessionId): void {
    this.sessions.delete(id);
  }
}
```

## Error handling and security considerations

Robust error handling and security measures are essential for a cryptographic library.

### Error hierarchy

```typescript
// Base exception
class MPCException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MPCException';
  }
}

// Protocol-specific exceptions
class ECDSAException extends MPCException {
  constructor(message: string) {
    super(message);
    this.name = 'ECDSAException';
  }
}

class EdDSAException extends MPCException {
  constructor(message: string) {
    super(message);
    this.name = 'EdDSAException';
  }
}

// Operation-specific exceptions
class KeyGenerationException extends MPCException {
  constructor(message: string) {
    super(message);
    this.name = 'KeyGenerationException';
  }
}

class SigningException extends MPCException {
  constructor(message: string) {
    super(message);
    this.name = 'SigningException';
  }
}

class VerificationException extends MPCException {
  constructor(message: string) {
    super(message);
    this.name = 'VerificationException';
  }
}

// Security-related exceptions
class SecurityViolationException extends MPCException {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityViolationException';
  }
}

class ThresholdNotMetException extends SecurityViolationException {
  constructor(message: string) {
    super(message);
    this.name = 'ThresholdNotMetException';
  }
}
```

### Security validations

```typescript
// Security validator
class SecurityValidator {
  /**
   * Validate a key share
   * @param share Key share to validate
   * @returns True if the share is valid
   */
  static validateKeyShare(share: KeyShare): boolean {
    // Basic validation
    if (!share || !share.getShareData()) {
      throw new SecurityViolationException('Invalid key share');
    }
    
    // Scheme-specific validation
    if (share instanceof ECDSAKeyShare) {
      return this.validateECDSAKeyShare(share);
    } else if (share instanceof EdDSAKeyShare) {
      return this.validateEdDSAKeyShare(share);
    }
    
    throw new SecurityViolationException('Unknown key share type');
  }
  
  /**
   * Validate ECDSA key share
   * @param share ECDSA key share
   * @returns True if the share is valid
   */
  private static validateECDSAKeyShare(share: ECDSAKeyShare): boolean {
    // ECDSA-specific validation
    // ...
    return true;
  }
  
  /**
   * Validate EdDSA key share
   * @param share EdDSA key share
   * @returns True if the share is valid
   */
  private static validateEdDSAKeyShare(share: EdDSAKeyShare): boolean {
    // EdDSA-specific validation
    // ...
    return true;
  }
  
  /**
   * Validate that the threshold is met
   * @param shares Array of shares
   * @param threshold Required threshold
   * @returns True if the threshold is met
   */
  static validateThreshold(shares: KeyShare[], threshold: number): boolean {
    if (!shares || shares.length < threshold) {
      throw new ThresholdNotMetException(
        `Threshold not met: ${shares ? shares.length : 0} < ${threshold}`
      );
    }
    
    // Additional threshold validation
    // ...
    
    return true;
  }
  
  /**
   * Validate input parameters
   * @param params Parameters to validate
   * @returns Validated parameters
   */
  static validateInputs(params: any): any {
    // Validate input types and ranges
    // ...
    
    return params;
  }
}
```

## Integration with Solana and other EdDSA chains

### Solana Network Configuration

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

### Verification Process for Solana

```typescript
// Solana program for verifying Ed25519 signatures

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
```

## Testing strategy

Comprehensive testing is essential for a cryptographic library:

1. **Unit tests**: Individual components and methods
   - Key generation
   - Signature creation
   - Signature verification
   - Protocol message processing

2. **Integration tests**: Interactions between components
   - End-to-end signing flow
   - Cross-protocol interactions
   - Error handling

3. **Property-based tests**: Mathematical properties
   - Signature validity
   - Key derivation properties
   - Statistical properties of randomness

4. **Security tests**: Resistance to common attacks
   - Fault injection
   - Timing attacks
   - Replay attacks

5. **Standard test vectors**: Compliance with standards
   - ECDSA test vectors from NIST
   - EdDSA test vectors from RFC 8032

6. **Network simulation**: Realistic conditions
   - Latency simulation
   - Packet loss
   - Out-of-order messages

7. **Stress testing**: Performance under load
   - Multiple concurrent sessions
   - Resource limitations
   - Long-running operations

## Deployment and Operations

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

### Deployment Steps

1. **Update MPC Node Configuration**:
   - Update Dockerfile to include both ECDSA and EdDSA implementations
   - Add environment variables for signature scheme configuration

2. **Key Generation**:
   - Generate keys for both signature schemes
   - Securely back up the master seed
   - Distribute key shares among the MPC nodes

3. **Network Configuration**:
   - Update `settings.ts` to include new chains with their signature schemes
   - Configure swap pairs for the new tokens

4. **Testing**:
   - Test transactions with both ECDSA and EdDSA chains
   - Verify that the correct signature scheme is used for each chain
   - Ensure proper error handling for all edge cases

5. **Monitoring**:
   - Add monitoring for both ECDSA and EdDSA signatures
   - Track success rates for different signature schemes
   - Log any signature failures or timeouts

### Scaling Considerations

1. **Horizontal Scaling**:
   - Add more MPC nodes to handle increased transaction volume
   - Ensure key shares are properly distributed to new nodes

2. **Protocol Optimization**:
   - Optimize message exchange for each protocol
   - Implement batching for signature operations

3. **Load Balancing**:
   - Distribute signature requests across MPC nodes
   - Consider chain-specific node groups for specialized hardware requirements

## Conclusion

Creating a unified MPC library that bridges ECDSA and EdDSA implementations unlocks significant new capabilities for the Lux.Network bridge:

1. **Enhanced blockchain support**: Adding EdDSA support enables the bridge to connect to Solana, Cardano, Polkadot, and other non-EVM chains.

2. **Simplified development**: A unified API makes it easier to add support for new chains without changing the core bridge logic.

3. **Optimized performance**: Each signature scheme can be implemented in the most efficient way while maintaining a consistent interface.

4. **Future-proof architecture**: The layered design makes it straightforward to add support for new signature schemes as they emerge.

5. **Security isolation**: Deriving scheme-specific keys from a common seed ensures that different signature schemes don't compromise each other's security.

By implementing this unified MPC library, Lux.Network will significantly expand its cross-chain capabilities while maintaining the security and reliability that users expect.
