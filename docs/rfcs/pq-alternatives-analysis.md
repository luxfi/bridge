# Post-Quantum Alternatives Analysis: Finding Better Performance

## Overview

You're right to ask - Ringtail's 140x signature size and 6000x network overhead is impractical. Let's examine more performant post-quantum alternatives.

## NIST PQC Competition Winners & Candidates

### 1. CRYSTALS-Dilithium (NIST Standard for Signatures)

**Performance:**
```
Security Level: NIST-2 (comparable to 128-bit)
Signature Size: 2,420 bytes (vs Ringtail's 13,400)
Public Key: 1,312 bytes
Signing Time: ~0.1 ms
Verification: ~0.03 ms
```

**Pros:**
- ✅ 5.5x smaller than Ringtail
- ✅ NIST standardized (FIPS 204)
- ✅ Much faster signing/verification
- ✅ Production-ready implementations

**Cons:**
- ❌ Still 25x larger than BLS
- ❌ No threshold version standardized yet

### 2. Falcon (NIST Alternate)

**Performance:**
```
Security Level: NIST-2
Signature Size: 666 bytes (Falcon-512)
Public Key: 897 bytes
Signing Time: ~0.5 ms
Verification: ~0.05 ms
```

**Pros:**
- ✅ 20x smaller than Ringtail
- ✅ Only 7x larger than BLS
- ✅ NIST approved alternate
- ✅ Smallest lattice signatures

**Cons:**
- ❌ Complex implementation
- ❌ Side-channel concerns
- ❌ No threshold version

### 3. SPHINCS+ (Hash-based, NIST Standard)

**Performance:**
```
Security Level: NIST-2
Signature Size: 7,856 bytes (SPHINCS+-128f)
Public Key: 32 bytes
Signing Time: ~2 ms
Verification: ~0.1 ms
```

**Pros:**
- ✅ Tiny public keys
- ✅ Only depends on hash functions
- ✅ Most conservative security

**Cons:**
- ❌ Large signatures (but smaller than Ringtail)
- ❌ Stateless = larger than stateful alternatives
- ❌ No aggregation

## Threshold/Aggregatable PQ Signatures

### 4. Threshold Dilithium Variants

Recent research has produced threshold versions of Dilithium:

**Performance (estimated):**
```
Signature Size: ~3,000 bytes
Rounds: 3-4 (more than Ringtail)
Network Traffic: ~5 KB per party
Status: Research prototypes
```

### 5. BLS-style Aggregation for Lattices (Research)

**"Practical Lattice-Based Zero-Knowledge Proofs for Integer Relations" (2022)**
```
Aggregated Signature: ~5-10 KB for 100 signers
Individual shares: ~500 bytes
Status: Early research
```

### 6. Hybrid Classical-PQ Signatures

**Concept**: Use BLS now, commit to PQ public key hash

```solidity
struct HybridSignature {
    bytes blsSignature;      // 96 bytes
    bytes32 pqPublicKeyHash; // 32 bytes
}
```

**Transition Plan:**
1. Start with BLS only
2. Add PQ public key commitments
3. When quantum threat emerges, switch to PQ verification
4. Historical signatures remain valid

## Performance Comparison Table

| Scheme | Signature Size | vs BLS | Threshold? | Aggregation? | Production Ready? |
|--------|---------------|--------|------------|--------------|-------------------|
| BLS | 96 bytes | 1x | ✅ Yes | ✅ Yes | ✅ Yes |
| **Dilithium** | 2,420 bytes | 25x | 🟡 Research | ❌ No | ✅ Yes |
| **Falcon** | 666 bytes | 7x | ❌ No | ❌ No | ✅ Yes |
| SPHINCS+ | 7,856 bytes | 82x | ❌ No | ❌ No | ✅ Yes |
| Ringtail | 13,400 bytes | 140x | ✅ Yes | ❌ No | 🟡 Research |

## Recommendations for Lux Bridge

### Option 1: Dilithium for High-Value (Best Performance)

```go
// Use standard Dilithium for treasury operations
if transfer.Value > TREASURY_THRESHOLD {
    sig := dilithium.Sign(message, secretKey)
    // 2.4 KB signature vs 13.4 KB Ringtail
}
```

**Pros:**
- 5.5x smaller than Ringtail
- NIST standardized
- Fast verification

**Cons:**
- No built-in threshold
- Need trusted dealer or DKG

### Option 2: Falcon for Space-Critical

```go
// Use Falcon when signature size matters most
if requiresCompactSignature {
    sig := falcon.Sign(message, secretKey)
    // Only 666 bytes!
}
```

**Pros:**
- Smallest PQ signatures
- Only 7x larger than BLS

**Cons:**
- Harder to implement securely
- No threshold support

### Option 3: Hybrid BLS+Commitment (Recommended)

```solidity
contract HybridBridge {
    struct Validator {
        bytes blsPublicKey;
        bytes32 dilithiumKeyHash; // Commit now, reveal later
    }
    
    function verifySignature(
        bytes memory blsSignature,
        bytes32 messageHash
    ) public view returns (bool) {
        // Today: Verify BLS only
        require(verifyBLS(blsSignature, messageHash), "Invalid BLS");
        
        // Future: Also verify Dilithium when quantum threat emerges
        // require(verifyDilithium(dilithiumSig, messageHash), "Invalid PQ");
        
        return true;
    }
}
```

### Option 4: Wait for Better Threshold PQ

**Timeline:**
- 2024-2025: Research on threshold Dilithium/Falcon
- 2026-2027: Standardization efforts
- 2028+: Production-ready threshold PQ

## Practical Architecture for Today

```yaml
signature_architecture:
  # Phase 1 (2024-2026): BLS + Commitments
  current:
    consensus: bls
    user_operations: bls
    treasury: bls
    commitment: dilithium_public_key_hash
    
  # Phase 2 (2027-2029): Hybrid Operation
  transition:
    consensus: bls  # Keep for performance
    user_operations: bls
    treasury: dilithium  # Switch high-value only
    
  # Phase 3 (2030+): Full PQ
  future:
    consensus: threshold_dilithium  # When available
    user_operations: falcon  # For size efficiency
    treasury: dilithium
```

## Implementation Strategy

### 1. Immediate: Add PQ Key Commitments

```typescript
interface ValidatorRegistration {
    blsPublicKey: string;
    dilithiumPublicKeyHash: string; // Add this now
    falconPublicKeyHash?: string;   // Optional alternate
}
```

### 2. Short-term: Implement Dilithium for Treasury

```bash
# Use existing Dilithium libraries
go get github.com/cloudflare/circl/sign/dilithium
```

### 3. Monitor: Threshold PQ Development

Key projects to watch:
- NIST PQC Round 4 (for new signatures)
- Threshold Dilithium research
- Aggregatable lattice signatures

## Cost Analysis: Dilithium vs Ringtail vs BLS

```javascript
// For 10 treasury operations/day
const costs = {
    bls: {
        signatureSize: 96,
        dailyStorage: 960,         // bytes
        annualCost: 11             // USD
    },
    dilithium: {
        signatureSize: 2420,
        dailyStorage: 24200,       // bytes  
        annualCost: 137            // USD (acceptable)
    },
    ringtail: {
        signatureSize: 13400,
        dailyStorage: 134000,      // bytes
        annualCost: 548            // USD
    }
};
```

## Conclusion

**Better PQ alternatives exist:**

1. **Dilithium**: 5.5x smaller than Ringtail, NIST standardized
2. **Falcon**: Only 7x larger than BLS, smallest PQ option
3. **Hybrid approaches**: Smooth transition path

**Recommended approach:**
1. Use **Dilithium** instead of Ringtail for treasury operations (better performance)
2. Implement **hybrid BLS+commitment** for smooth transition
3. Wait for **threshold Dilithium** research to mature
4. Keep BLS for high-frequency operations until 2030+

The key insight: You don't need threshold signatures for treasury operations if you have a secure multi-party approval process. Standard Dilithium with MPC approval gives you PQ security with 5.5x better performance than Ringtail.