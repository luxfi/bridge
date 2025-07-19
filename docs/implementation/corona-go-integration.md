# Integrating Go Corona into Lux Bridge Backend

## Overview

This document outlines how to integrate the existing Go Corona implementation (located at `~/work/lux/corona`) into the Lux Bridge MPC backend infrastructure.

## Current Architecture vs. Proposed Integration

### Current Flow (GG18 ECDSA)
```
Node.js API (node.ts)
    ↓
signClient() in utils.ts
    ↓
Spawn Rust process (gg18_sign_client)
    ↓
ECDSA signature returned
```

### Proposed Flow (Corona)
```
Node.js API (node.ts)
    ↓
coronaSignClient() in utils.ts
    ↓
HTTP/gRPC call to Go Corona service
    ↓
Lattice signature returned
```

## Integration Approach

### Option 1: Go Service Wrapper (Recommended)

Create a Go service that wraps the Corona implementation and exposes HTTP/gRPC endpoints.

#### 1. Create Service Wrapper

Create `/mpc-nodes/corona-service/main.go`:

```go
package main

import (
    "encoding/json"
    "fmt"
    "log"
    "net/http"
    "sync"
    
    corona "lattice-threshold-signature/sign"
)

type CoronaService struct {
    party    *corona.Party
    sessions map[string]*SigningSession
    mu       sync.RWMutex
}

type SigningSession struct {
    OfflineData []byte
    Commitments map[int][]byte
}

type SignRequest struct {
    SessionID string `json:"session_id"`
    Message   []byte `json:"message"`
    Round     int    `json:"round"`
    Data      []byte `json:"data,omitempty"`
}

type SignResponse struct {
    Success bool   `json:"success"`
    Data    []byte `json:"data,omitempty"`
    Error   string `json:"error,omitempty"`
}

func (s *CoronaService) handleSign(w http.ResponseWriter, r *http.Request) {
    var req SignRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        respondError(w, err)
        return
    }
    
    switch req.Round {
    case 1:
        s.handleRound1(w, req)
    case 2:
        s.handleRound2(w, req)
    default:
        respondError(w, fmt.Errorf("invalid round: %d", req.Round))
    }
}

func main() {
    service := &CoronaService{
        sessions: make(map[string]*SigningSession),
    }
    
    // Initialize party from config
    service.initParty()
    
    http.HandleFunc("/sign", service.handleSign)
    http.HandleFunc("/health", handleHealth)
    
    log.Println("Corona service listening on :8080")
    log.Fatal(http.ListenAndServe(":8080", nil))
}
```

#### 2. Update Node.js Integration

Create `/mpc-nodes/docker/common/node/src/corona-client.ts`:

```typescript
import axios from 'axios';
import { SignatureResult } from './types';

export class CoronaClient {
    private serviceUrl: string;
    private partyId: number;
    
    constructor(partyId: number, serviceUrl: string = 'http://localhost:8080') {
        this.partyId = partyId;
        this.serviceUrl = serviceUrl;
    }
    
    async sign(message: string, sessionId: string): Promise<SignatureResult> {
        try {
            // Round 1: Offline phase
            const round1Response = await axios.post(`${this.serviceUrl}/sign`, {
                session_id: sessionId,
                round: 1,
                message: Buffer.from(message, 'hex'),
            });
            
            if (!round1Response.data.success) {
                throw new Error(round1Response.data.error);
            }
            
            // Coordinate with other parties (using existing infrastructure)
            await this.coordinateRound1(sessionId, round1Response.data.data);
            
            // Round 2: Online phase
            const round2Response = await axios.post(`${this.serviceUrl}/sign`, {
                session_id: sessionId,
                round: 2,
                message: Buffer.from(message, 'hex'),
                data: await this.gatherCommitments(sessionId),
            });
            
            if (!round2Response.data.success) {
                throw new Error(round2Response.data.error);
            }
            
            return {
                signature: round2Response.data.data.toString('hex'),
                type: 'corona',
            };
        } catch (error) {
            throw new Error(`Corona signing failed: ${error.message}`);
        }
    }
    
    private async coordinateRound1(sessionId: string, commitment: Buffer): Promise<void> {
        // Use existing coordination infrastructure
        // This would integrate with the current state machine manager
    }
    
    private async gatherCommitments(sessionId: string): Promise<Buffer> {
        // Gather commitments from all parties
        // This would use the existing P2P communication layer
    }
}
```

### Option 2: Direct Binary Execution (Simpler but Less Flexible)

Similar to the current Rust integration, spawn the Go binary as a subprocess.

Update `/mpc-nodes/docker/common/node/src/utils.ts`:

```typescript
export async function coronaSignClient(
    message: string,
    partyId: number,
    threshold: number,
    parties: number[]
): Promise<string> {
    return new Promise((resolve, reject) => {
        const coronaPath = path.join(__dirname, '../../corona/corona');
        
        const args = [
            '-party', partyId.toString(),
            '-threshold', threshold.toString(),
            '-parties', parties.join(','),
            '-message', message,
        ];
        
        const proc = spawn(coronaPath, args);
        let output = '';
        let error = '';
        
        proc.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        proc.stderr.on('data', (data) => {
            error += data.toString();
        });
        
        proc.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`Corona process exited with code ${code}: ${error}`));
            } else {
                try {
                    const result = JSON.parse(output);
                    resolve(result.signature);
                } catch (e) {
                    reject(new Error(`Failed to parse Corona output: ${output}`));
                }
            }
        });
    });
}
```

## Modifications Needed to Corona

### 1. Message Format Compatibility

The bridge expects to sign Ethereum-style message hashes. Update Corona to accept hex-encoded messages:

```go
// In sign.go
func (p *Party) SignMessage(messageHex string) error {
    messageBytes, err := hex.DecodeString(messageHex)
    if err != nil {
        return fmt.Errorf("invalid hex message: %v", err)
    }
    
    // Continue with existing signing logic
    return p.Sign(messageBytes)
}
```

### 2. Output Format

Ensure Corona outputs signatures in a format compatible with the bridge:

```go
type SignatureOutput struct {
    C         string `json:"c"`          // Challenge
    Z         string `json:"z"`          // Response  
    Delta     string `json:"delta"`      // Hint
    PublicKey string `json:"public_key"` // For verification
}
```

### 3. Network Configuration

Replace hardcoded IPs with configurable endpoints:

```go
type NetworkConfig struct {
    Parties []PartyEndpoint `json:"parties"`
}

type PartyEndpoint struct {
    ID       int    `json:"id"`
    Endpoint string `json:"endpoint"`
}

func LoadNetworkConfig(path string) (*NetworkConfig, error) {
    // Load from JSON file
}
```

## Docker Integration

### 1. Multi-Stage Dockerfile

Create `/mpc-nodes/docker/corona.Dockerfile`:

```dockerfile
# Build stage
FROM golang:1.21-alpine AS builder

WORKDIR /build
COPY corona/go.mod corona/go.sum ./
RUN go mod download

COPY corona/ ./
RUN go build -o corona-service ./service/main.go

# Runtime stage
FROM alpine:latest

RUN apk add --no-cache ca-certificates
WORKDIR /app

COPY --from=builder /build/corona-service /app/
COPY config/ /app/config/

EXPOSE 8080

CMD ["./corona-service"]
```

### 2. Docker Compose Integration

Update `/mpc-nodes/docker/docker-compose.yml`:

```yaml
services:
  mpc-node:
    build: .
    environment:
      - SIGNATURE_SCHEME=CORONA
      - CORONA_SERVICE_URL=http://corona:8080
    depends_on:
      - corona

  corona:
    build:
      context: .
      dockerfile: corona.Dockerfile
    environment:
      - PARTY_ID=${PARTY_ID}
      - THRESHOLD=${THRESHOLD}
    volumes:
      - ./config:/app/config
    ports:
      - "8080:8080"
```

## Configuration Management

### 1. Unified Configuration

Create `/mpc-nodes/config/corona.json`:

```json
{
    "security_level": "128",
    "threshold": 2,
    "parties": 3,
    "network": {
        "parties": [
            {"id": 0, "endpoint": "node0:9000"},
            {"id": 1, "endpoint": "node1:9000"},
            {"id": 2, "endpoint": "node2:9000"}
        ]
    },
    "parameters": {
        "ring_degree": 256,
        "modulus": "281474976729601",
        "kappa": 23,
        "n": 7,
        "m": 8,
        "d_bar": 48
    }
}
```

### 2. Environment-Based Configuration

Update the Node.js backend to select signature scheme:

```typescript
// In node.ts
const signatureScheme = process.env.SIGNATURE_SCHEME || 'ECDSA';

async function sign(message: string): Promise<SignatureResult> {
    switch (signatureScheme) {
        case 'ECDSA':
            return await gg18SignClient(message, ...);
        case 'CORONA':
            return await coronaClient.sign(message, ...);
        default:
            throw new Error(`Unsupported signature scheme: ${signatureScheme}`);
    }
}
```

## Migration Strategy

### Phase 1: Parallel Testing (Month 1-2)
1. Deploy Corona service alongside existing ECDSA
2. Run test transactions with both schemes
3. Verify signature compatibility

### Phase 2: Gradual Rollout (Month 3-4)
1. Enable Corona for test networks
2. Monitor performance and reliability
3. Implement fallback mechanisms

### Phase 3: Production Deployment (Month 5-6)
1. Deploy to mainnet with feature flags
2. Migrate new vaults to Corona
3. Maintain ECDSA for existing assets

## Smart Contract Considerations

Since Corona signatures are much larger (13.4 KB vs 65 bytes), you'll need new contracts:

### 1. Corona Verifier Contract

```solidity
interface ICoronaVerifier {
    function verifySignature(
        bytes calldata signature,
        bytes32 messageHash,
        bytes calldata publicKey
    ) external view returns (bool);
}
```

### 2. Updated Bridge Contract

```solidity
contract BridgeV2 {
    ICoronaVerifier public coronaVerifier;
    
    function processCoronaSignature(
        bytes calldata signature,
        bytes calldata message
    ) external {
        require(
            coronaVerifier.verifySignature(
                signature,
                keccak256(message),
                coronaPublicKey
            ),
            "Invalid Corona signature"
        );
        
        // Process bridge operation
    }
}
```

## Performance Optimization

### 1. Preprocessing Pool
- Maintain pool of offline signing data
- Generate during idle periods
- Reduces online signing latency

### 2. Parallel Processing
- Use goroutines for matrix operations
- Leverage SIMD instructions via Lattigo
- Optimize network communication

### 3. Caching
- Cache NTT conversions
- Reuse commitment data where possible
- Implement efficient state management

## Monitoring and Observability

### 1. Metrics
- Signing latency (offline vs online)
- Signature size
- Network bandwidth usage
- Error rates

### 2. Logging
- Structured logging with correlation IDs
- Debug mode for protocol traces
- Performance profiling

## Next Steps

1. **Set up development environment**
   ```bash
   cd /Users/z/work/lux/bridge/mpc-nodes
   mkdir corona-integration
   cp -r /Users/z/work/lux/corona ./
   ```

2. **Create service wrapper**
   - Implement HTTP/gRPC endpoints
   - Add configuration management
   - Integrate with existing infrastructure

3. **Update Node.js backend**
   - Add Corona client
   - Update routing logic
   - Add configuration options

4. **Testing**
   - Unit tests for integration layer
   - Integration tests with multiple parties
   - Performance benchmarks

5. **Documentation**
   - API documentation
   - Deployment guide
   - Migration playbook

This integration plan leverages your existing Go Corona implementation while fitting seamlessly into the current bridge architecture.