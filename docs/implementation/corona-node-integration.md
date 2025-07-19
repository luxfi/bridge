# Integrating Corona into the Existing Node.js Backend

This document shows the minimal changes needed to integrate Corona into the existing MPC node implementation.

## 1. Update `node.ts`

Add Corona support to the main node file:

```typescript
// In /mpc-nodes/docker/common/node/src/node.ts

import { CoronaAdapter } from './corona-adapter';

// Add to existing imports...

// Add signature scheme configuration
const SIGNATURE_SCHEME = process.env.SIGNATURE_SCHEME || 'ECDSA';

// Modify the signing endpoint
app.post('/sign', async (req, res) => {
    const { message, scheme = SIGNATURE_SCHEME } = req.body;
    
    try {
        let result;
        
        if (scheme === 'CORONA') {
            // Use Corona for signing
            const adapter = new CoronaAdapter(
                PARTY_ID,
                THRESHOLD,
                getPartyInfo()
            );
            result = await adapter.sign(message);
        } else {
            // Use existing GG18 implementation
            result = await signClient(
                SERVER_URL,
                ROOM,
                PARTY_ID,
                message
            );
        }
        
        res.json({
            success: true,
            signature: result.signature,
            type: result.type,
            publicKey: result.publicKey
        });
    } catch (error) {
        logger.error('Signing failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Add health check for Corona
app.get('/corona/health', async (req, res) => {
    if (SIGNATURE_SCHEME !== 'CORONA') {
        return res.json({ enabled: false });
    }
    
    try {
        const adapter = new CoronaAdapter(PARTY_ID, THRESHOLD, getPartyInfo());
        const healthy = await adapter.healthCheck();
        res.json({ enabled: true, healthy });
    } catch (error) {
        res.status(500).json({ enabled: true, healthy: false, error: error.message });
    }
});
```

## 2. Update `utils.ts`

Add a Corona signing function similar to the existing `signClient`:

```typescript
// In /mpc-nodes/docker/common/node/src/utils.ts

export async function coronaSignClient(
    message: string,
    partyId: number,
    threshold: number,
    serviceUrl: string = 'http://localhost:8080'
): Promise<SignatureResult> {
    const adapter = new CoronaAdapter(partyId, threshold, getPartyInfo());
    return adapter.sign(message);
}

// Add to existing signature type detection
export function detectSignatureType(signature: string): 'ecdsa' | 'corona' {
    // Corona signatures are much larger (13KB vs 65 bytes)
    if (signature.length > 1000) {
        return 'corona';
    }
    return 'ecdsa';
}
```

## 3. Update Docker Compose

Modify `docker-compose.yml` to include the Corona service:

```yaml
version: '3.8'

services:
  # Existing MPC node service
  mpc-node-0:
    build: .
    environment:
      - PARTY_ID=0
      - THRESHOLD=2
      - SIGNATURE_SCHEME=${SIGNATURE_SCHEME:-ECDSA}
      - CORONA_SERVICE_URL=http://corona-0:8080
    depends_on:
      - corona-0
    networks:
      - mpc-network

  # Corona service for party 0
  corona-0:
    build:
      context: .
      dockerfile: corona.Dockerfile
    environment:
      - PARTY_ID=0
      - THRESHOLD=2
      - PARTIES=3
    networks:
      - mpc-network
    volumes:
      - ./config/corona:/app/config

  # Repeat for other parties...
  mpc-node-1:
    # ... similar configuration

  corona-1:
    # ... similar configuration

networks:
  mpc-network:
    driver: bridge
```

## 4. Environment Configuration

Update `.env` file to support both schemes:

```bash
# Signature scheme selection
SIGNATURE_SCHEME=CORONA  # or ECDSA

# Existing ECDSA configuration
GG18_SERVER_URL=http://localhost:8000
GG18_ROOM=test-room

# Corona configuration
CORONA_SERVICE_URL=http://corona:8080
CORONA_SECURITY_LEVEL=128  # 128, 192, or 256

# Common configuration
PARTY_ID=0
THRESHOLD=2
PARTY_COUNT=3
```

## 5. Update Message Handling

Since Corona expects hex-encoded messages, ensure proper encoding:

```typescript
// In the signing flow
function prepareMessageForSigning(message: string, scheme: string): string {
    if (scheme === 'CORONA') {
        // Corona expects hex without 0x prefix
        return message.startsWith('0x') ? message.slice(2) : message;
    } else {
        // GG18 expects the message as-is
        return message;
    }
}
```

## 6. Handle Different Signature Formats

Update signature storage and retrieval to handle both formats:

```typescript
interface StoredSignature {
    id: string;
    message: string;
    signature: string;
    type: 'ecdsa' | 'corona';
    publicKey?: string;
    timestamp: number;
}

// Store signatures with type information
async function storeSignature(sig: StoredSignature): Promise<void> {
    // Store in database with type field
    await db.signatures.insert({
        ...sig,
        size: sig.signature.length,
    });
}

// Retrieve and parse signatures based on type
async function getSignature(id: string): Promise<StoredSignature> {
    const stored = await db.signatures.findOne({ id });
    
    if (stored.type === 'corona') {
        // Handle large Corona signatures
        // Maybe store in separate table or file system
    }
    
    return stored;
}
```

## 7. Update Smart Contract Interface

For chains that will verify Corona signatures:

```typescript
// Add Corona verification support
async function verifySignatureOnChain(
    signature: string,
    message: string,
    type: 'ecdsa' | 'corona'
): Promise<boolean> {
    if (type === 'corona') {
        // Call Corona verifier contract
        const verifier = new ethers.Contract(
            CORONA_VERIFIER_ADDRESS,
            CORONA_VERIFIER_ABI,
            provider
        );
        
        const sig = CoronaAdapter.decodeSignature(signature);
        return await verifier.verifySignature(
            message,
            sig.c,
            sig.z,
            sig.delta,
            sig.public_key
        );
    } else {
        // Use existing ECDSA verification
        return await verifyECDSA(signature, message);
    }
}
```

## 8. Monitoring and Logging

Add Corona-specific metrics:

```typescript
// Add to monitoring
const metrics = {
    corona_sign_duration: new Histogram({
        name: 'corona_sign_duration_seconds',
        help: 'Duration of Corona signing operations',
        labelNames: ['round', 'status'],
    }),
    corona_signature_size: new Gauge({
        name: 'corona_signature_size_bytes',
        help: 'Size of Corona signatures',
    }),
};

// Track metrics in signing flow
const timer = metrics.corona_sign_duration.startTimer({ round: '1' });
// ... perform signing
timer({ status: 'success' });
```

## 9. Graceful Migration

Implement a gradual migration strategy:

```typescript
// Signature scheme selection logic
function selectSignatureScheme(
    assetType: string,
    networkId: number
): 'ecdsa' | 'corona' {
    // Use feature flags or configuration
    const coronaEnabled = process.env.CORONA_ENABLED === 'true';
    const coronaNetworks = (process.env.CORONA_NETWORKS || '').split(',');
    
    if (coronaEnabled && coronaNetworks.includes(networkId.toString())) {
        // Check if asset type supports Corona
        if (isCoronaSupported(assetType)) {
            return 'corona';
        }
    }
    
    return 'ecdsa';
}
```

## 10. Testing

Add tests for both signature schemes:

```typescript
describe('MPC Signing', () => {
    describe('ECDSA', () => {
        it('should sign with GG18', async () => {
            const result = await signWithMPC(testMessage, 'ecdsa');
            expect(result.type).toBe('ecdsa');
            expect(result.signature.length).toBe(130); // 65 bytes hex
        });
    });
    
    describe('Corona', () => {
        it('should sign with Corona', async () => {
            const result = await signWithMPC(testMessage, 'corona');
            expect(result.type).toBe('corona');
            expect(result.signature.length).toBeGreaterThan(10000); // ~13KB
        });
    });
    
    it('should handle scheme selection', async () => {
        process.env.SIGNATURE_SCHEME = 'CORONA';
        const result = await signWithMPC(testMessage);
        expect(result.type).toBe('corona');
    });
});
```

## Deployment Steps

1. **Deploy Corona services first** (they can run alongside ECDSA)
2. **Update Node.js backend** with dual-scheme support
3. **Test with SIGNATURE_SCHEME=ECDSA** to ensure no regression
4. **Enable Corona for test networks**
5. **Monitor performance and reliability**
6. **Gradually enable for production networks**

## Rollback Plan

If issues arise with Corona:

1. Set `SIGNATURE_SCHEME=ECDSA` in environment
2. Restart MPC nodes (Corona services can stay running)
3. All new signatures will use ECDSA
4. Existing Corona signatures remain valid

This integration approach ensures minimal disruption to the existing system while adding post-quantum security through Corona.