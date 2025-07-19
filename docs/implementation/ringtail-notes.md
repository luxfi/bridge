# Ringtail: Practical Two-Round Lattice-Based Threshold Signatures

## Overview

Ringtail is a state-of-the-art lattice-based threshold signature scheme that provides post-quantum security. Unlike the current GG18 ECDSA implementation, Ringtail is based on the Learning with Errors (LWE) and Short Integer Solution (SIS) problems, making it resistant to quantum attacks.

## Key Features

### 1. Two-Round Protocol
- **Round 1 (Offline)**: Message-independent, can be preprocessed
- **Round 2 (Online)**: Requires only the message, single broadcast round
- Compared to current GG18 which requires multiple rounds

### 2. Post-Quantum Security
- Based on standard lattice assumptions (LWE/SIS)
- Quantum-resistant unlike ECDSA-based schemes
- Future-proof for quantum computing threats

### 3. Concrete Efficiency
- Supports up to t = 1024 parties
- 13.4 KB signature size (128-bit security)
- 10.5 KB online communication
- Comparable to or better than classical schemes

### 4. Security Properties
- Static corruption model
- Proven secure under standard assumptions
- No new cryptographic assumptions required

## Technical Details

### Parameters (128-bit security)
- Ring dimension φ = 256
- Modulus q ≈ 2^48
- Secret key length n = 7
- Public key length m = 8
- Signature size: 13.4 KB
- Verification key size: 4.5 KB

### Core Components

1. **Key Generation**
   - Trusted dealer generates LWE key pair (A, b = As + e)
   - Secret s is shared using Shamir secret sharing
   - Each party i receives share s_i

2. **Signing Protocol**
   - **Offline Phase**: Each party generates Di = A[r*_i | R_i] + [e*_i | E_i]
   - **Online Phase**: 
     - Compute combined D = Σ D_j
     - Hash to get challenge c
     - Each party computes signature share z_i
     - Combine shares to get final signature

3. **Verification**
   - Standard Raccoon verification
   - Check norm bounds and hash consistency

## Comparison with Current Implementation

| Feature | GG18 (Current) | Ringtail (Proposed) |
|---------|----------------|---------------------|
| Security | Classical | Post-Quantum |
| Rounds | 3+ | 2 (1 offline) |
| Signature Size | ~64 bytes | ~13.4 KB |
| Assumptions | DLog | LWE/SIS |
| Implementation | Rust (KZen) | Needs new impl |

## Integration Strategy

### 1. Architecture Changes

The integration would require significant architectural changes:

```
Current Architecture:
Node.js API → Rust GG18 Binary → ECDSA Signature

Proposed Architecture:
Node.js API → Rust Ringtail Binary → Lattice Signature
```

### 2. Key Differences from ECDSA

- **Key Format**: Lattice keys are matrices/vectors over polynomial rings
- **Signature Format**: Much larger (13.4 KB vs 64 bytes)
- **Math Operations**: Polynomial arithmetic instead of elliptic curve
- **Randomness**: Requires Gaussian sampling

### 3. Implementation Approach

#### Phase 1: Core Cryptography
1. Implement ring arithmetic (NTT-friendly)
2. Implement Gaussian sampling
3. Implement core Ringtail protocol
4. Create test vectors

#### Phase 2: Integration
1. Create Rust binary interface similar to current GG18
2. Update Node.js wrapper to handle larger signatures
3. Modify smart contracts to verify Ringtail signatures
4. Update bridge protocol for post-quantum signatures

#### Phase 3: Migration
1. Support both ECDSA and Ringtail in parallel
2. Gradual migration path for existing assets
3. Performance optimization

## Building on CGGMP Foundation

While Ringtail is fundamentally different from CGGMP (lattice vs elliptic curve), we can reuse several architectural patterns:

### 1. Communication Infrastructure
- P2P networking layer
- Message serialization/deserialization
- State machine management

### 2. Share Management
- Both use Shamir secret sharing
- Similar share distribution mechanisms
- Threshold logic remains similar

### 3. Protocol Flow
- Preprocessing phase concept
- Round optimization strategies
- Abort handling mechanisms

### 4. Security Model
- Static corruption assumptions
- Authenticated channels
- Similar threat model

## Implementation Considerations

### 1. Performance
- Larger signatures require more bandwidth
- Polynomial operations are computationally intensive
- Need optimized NTT implementation

### 2. Smart Contract Changes
- Current contracts verify ECDSA signatures
- Need new contracts for lattice signature verification
- Gas costs will be higher due to larger signatures

### 3. Backwards Compatibility
- Cannot directly replace ECDSA
- Need migration strategy for existing assets
- Dual-signature period may be necessary

## Security Analysis

### 1. Quantum Resistance
- Secure against Shor's algorithm
- Based on worst-case lattice problems
- No known quantum attacks

### 2. Classical Security
- 128-bit security level
- Proven reductions to standard problems
- No proprietary assumptions

### 3. Implementation Security
- Side-channel considerations
- Gaussian sampling must be constant-time
- Careful randomness management

## Next Steps

1. **Prototype Development**
   - Start with standalone Ringtail implementation
   - Create benchmarking suite
   - Develop test vectors

2. **Integration Planning**
   - Design smart contract changes
   - Plan migration strategy
   - Update documentation

3. **Security Audit**
   - Formal verification of core components
   - Side-channel analysis
   - External security review

## References

1. Boschini et al., "Ringtail: Practical Two-Round Threshold Signatures from Learning with Errors"
2. Current implementation: GG18 (Gennaro & Goldfeder 2018)
3. Planned upgrade: CGGMP21 (Canetti et al. 2021)
4. Base signature: Raccoon (lattice-based Schnorr-like)

## Appendix: Key Algorithms

### Algorithm 1: Key Generation
```
1. Sample A ← R^{m×n}_q uniformly
2. Sample s ← D^n_{σe}, e ← D^m_{σe}  
3. Compute b = As + e mod q
4. Share s using Shamir: (s_1, ..., s_ℓ) ← Share(s)
5. Distribute shares to parties
```

### Algorithm 2: Signing (Simplified)
```
Offline:
1. Each party i: D_i = A[r*_i | R_i] + [e*_i | E_i]
2. Broadcast D_i

Online:
1. Compute D = Σ D_j, u = H_u(D, μ)
2. Compute h = D[1; u], c = H_c(⌊h⌉_ν, μ)
3. Each party: z_i = s_i·λ_{T,i}·c + [r*_i | R_i]·[1; u]
4. Combine: z = Σ z_i
```

This provides a foundation for implementing Ringtail as a post-quantum alternative to the current ECDSA-based MPC system.