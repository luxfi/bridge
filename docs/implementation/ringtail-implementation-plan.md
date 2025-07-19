# Ringtail Implementation Plan for Lux Bridge

## Overview

This document outlines a concrete implementation plan for integrating Ringtail lattice-based threshold signatures into the Lux Bridge MPC infrastructure, building on the existing GG18 foundation.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Bridge Application                        │
├─────────────────────────────────────────────────────────────┤
│                    Protocol Selector                         │
│         ┌──────────────┐        ┌──────────────┐           │
│         │   GG18/ECDSA │        │   Ringtail   │           │
│         │   (Current)  │        │   (New)      │           │
│         └──────────────┘        └──────────────┘           │
├─────────────────────────────────────────────────────────────┤
│                 Common Infrastructure                        │
│   - P2P Communication                                       │
│   - State Management                                        │
│   - Share Distribution                                      │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Phases

### Phase 1: Core Cryptographic Library

#### 1.1 Ring Arithmetic Module

Create `/mpc-nodes/ringtail/src/ring.rs`:

```rust
// Ring arithmetic for R = Z[X]/(X^n + 1)
pub struct RingElement {
    coeffs: Vec<i64>,
    modulus: i64,
    degree: usize,
}

impl RingElement {
    pub fn new(coeffs: Vec<i64>, modulus: i64) -> Self {
        // Implementation
    }
    
    pub fn ntt(&self) -> NTTElement {
        // Number Theoretic Transform for fast multiplication
    }
    
    pub fn add(&self, other: &RingElement) -> RingElement {
        // Ring addition
    }
    
    pub fn mul(&self, other: &RingElement) -> RingElement {
        // Ring multiplication using NTT
    }
}

pub struct Matrix {
    elements: Vec<Vec<RingElement>>,
    rows: usize,
    cols: usize,
}
```

#### 1.2 Gaussian Sampling Module

Create `/mpc-nodes/ringtail/src/gaussian.rs`:

```rust
use rand_distr::{Distribution, Normal};

pub struct DiscreteGaussian {
    sigma: f64,
    center: i64,
}

impl DiscreteGaussian {
    pub fn sample<R: Rng>(&self, rng: &mut R) -> i64 {
        // Constant-time discrete Gaussian sampling
        // Using rejection sampling or CDT method
    }
    
    pub fn sample_poly<R: Rng>(&self, rng: &mut R, degree: usize) -> Vec<i64> {
        (0..degree).map(|_| self.sample(rng)).collect()
    }
}
```

#### 1.3 Core Protocol Implementation

Create `/mpc-nodes/ringtail/src/protocol.rs`:

```rust
pub struct RingtailParams {
    pub ring_degree: usize,      // φ = 256
    pub modulus: i64,            // q ≈ 2^48
    pub secret_dim: usize,       // n = 7
    pub public_dim: usize,       // m = 8
    pub sigma_e: f64,            // Error distribution parameter
    pub sigma_star: f64,         // Commitment randomness parameter
    pub kappa: usize,            // Challenge weight
}

pub struct Party {
    index: usize,
    secret_share: Vec<RingElement>,
    params: RingtailParams,
}

pub struct OfflineData {
    pub commitment: Matrix,           // D_i
    pub randomness: (Vec<RingElement>, Matrix),  // (r*_i, R_i)
}

pub struct OnlineSignature {
    pub challenge: RingElement,
    pub response: Vec<RingElement>,
    pub hint: Vec<i64>,
}
```

### Phase 2: Protocol Implementation

#### 2.1 Key Generation

Create `/mpc-nodes/ringtail/src/keygen.rs`:

```rust
pub async fn distributed_keygen(
    parties: usize,
    threshold: usize,
    params: &RingtailParams,
) -> Result<(PublicKey, Vec<SecretShare>), Error> {
    // 1. Trusted dealer generates A, s, e
    let a = Matrix::random(params.public_dim, params.secret_dim);
    let s = sample_secret(&params);
    let e = sample_error(&params);
    
    // 2. Compute public key b = As + e
    let b = a.mul_vec(&s).add(&e);
    
    // 3. Share secret using Shamir
    let shares = shamir_share(&s, threshold, parties);
    
    Ok((PublicKey { a, b }, shares))
}
```

#### 2.2 Signing Protocol

Create `/mpc-nodes/ringtail/src/sign.rs`:

```rust
pub async fn sign_offline(
    party: &Party,
    session_id: &str,
) -> Result<OfflineData, Error> {
    // Sample randomness
    let r_star = sample_gaussian_vector(party.params.secret_dim);
    let r_matrix = sample_gaussian_matrix(
        party.params.secret_dim, 
        party.params.aux_dim
    );
    
    // Compute commitment D_i = A[r*_i | R_i] + [e*_i | E_i]
    let commitment = compute_commitment(&party.public_key.a, &r_star, &r_matrix);
    
    // Broadcast commitment
    broadcast_commitment(&commitment, session_id).await?;
    
    Ok(OfflineData { commitment, randomness: (r_star, r_matrix) })
}

pub async fn sign_online(
    party: &Party,
    message: &[u8],
    offline_data: &OfflineData,
    commitments: &[Matrix],
) -> Result<SignatureShare, Error> {
    // 1. Combine commitments
    let combined_d = combine_commitments(commitments);
    
    // 2. Compute hash values
    let u = hash_to_vector(&combined_d, message);
    let h = combined_d.mul_vec(&[1, u]);
    let c = hash_to_challenge(&h.round(), message);
    
    // 3. Compute signature share
    let z_i = compute_signature_share(
        &party.secret_share,
        &c,
        &offline_data.randomness,
        &u
    );
    
    Ok(SignatureShare { z_i })
}
```

### Phase 3: Integration Layer

#### 3.1 Node.js Wrapper

Create `/mpc-nodes/docker/common/node/src/ringtail-client.ts`:

```typescript
import { spawn } from 'child_process';
import { RingtailConfig, SignatureResult } from './types';

export class RingtailClient {
  private config: RingtailConfig;
  
  constructor(config: RingtailConfig) {
    this.config = config;
  }
  
  async signOffline(sessionId: string): Promise<string> {
    // Spawn Rust process for offline phase
    const result = await this.runRustBinary('ringtail_sign_offline', {
      session_id: sessionId,
      party_index: this.config.partyIndex,
      // ... other params
    });
    
    return result.commitment_id;
  }
  
  async signOnline(
    message: string, 
    offlineDataId: string,
    commitments: string[]
  ): Promise<SignatureResult> {
    // Spawn Rust process for online phase
    const result = await this.runRustBinary('ringtail_sign_online', {
      message,
      offline_data_id: offlineDataId,
      commitments,
      // ... other params
    });
    
    return {
      signature: result.signature,
      publicKey: result.public_key,
    };
  }
  
  private async runRustBinary(
    binary: string, 
    params: any
  ): Promise<any> {
    // Similar to existing signClient implementation
    // but adapted for Ringtail's different data structures
  }
}
```

#### 3.2 Protocol Selector

Update `/mpc-nodes/docker/common/node/src/node.ts`:

```typescript
enum SignatureScheme {
  ECDSA_GG18 = 'ecdsa_gg18',
  RINGTAIL = 'ringtail',
}

class MPCNode {
  private gg18Client: GG18Client;
  private ringtailClient: RingtailClient;
  
  async sign(
    message: string,
    scheme: SignatureScheme = SignatureScheme.ECDSA_GG18
  ): Promise<SignatureResult> {
    switch (scheme) {
      case SignatureScheme.ECDSA_GG18:
        return this.signWithGG18(message);
      case SignatureScheme.RINGTAIL:
        return this.signWithRingtail(message);
      default:
        throw new Error(`Unsupported signature scheme: ${scheme}`);
    }
  }
  
  private async signWithRingtail(message: string): Promise<SignatureResult> {
    // 1. Check if we have offline data ready
    const offlineData = await this.getOrCreateOfflineData();
    
    // 2. Coordinate with other parties
    const commitments = await this.gatherCommitments(offlineData.sessionId);
    
    // 3. Execute online signing
    return this.ringtailClient.signOnline(message, offlineData.id, commitments);
  }
}
```

### Phase 4: Smart Contract Updates

#### 4.1 Ringtail Verifier Contract

Create `/contracts/contracts/RingtailVerifier.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract RingtailVerifier {
    struct RingtailParams {
        uint256 ringDegree;
        uint256 modulus;
        uint256 secretDim;
        uint256 publicDim;
    }
    
    struct PublicKey {
        uint256[][] matrixA;
        uint256[] vectorB;
    }
    
    struct Signature {
        uint256[] challenge;
        uint256[] response;
        uint256[] hint;
    }
    
    function verifySignature(
        bytes32 messageHash,
        PublicKey memory pk,
        Signature memory sig,
        RingtailParams memory params
    ) public pure returns (bool) {
        // 1. Recompute h from signature
        uint256[] memory h = computeH(pk, sig, params);
        
        // 2. Verify challenge matches
        uint256[] memory expectedChallenge = hashToChallenge(h, messageHash);
        if (!compareArrays(sig.challenge, expectedChallenge)) {
            return false;
        }
        
        // 3. Verify norm bounds
        if (!checkNormBounds(sig, params)) {
            return false;
        }
        
        return true;
    }
    
    function computeH(
        PublicKey memory pk,
        Signature memory sig,
        RingtailParams memory params
    ) internal pure returns (uint256[] memory) {
        // Matrix-vector multiplication in the ring
        // h = Az - bc + hint
    }
}
```

#### 4.2 Bridge Contract Updates

Update the main bridge contract to support both signature types:

```solidity
contract Bridge {
    enum SignatureType { ECDSA, RINGTAIL }
    
    function verifyAndExecute(
        bytes memory signature,
        SignatureType sigType,
        bytes memory message
    ) external {
        bool valid;
        
        if (sigType == SignatureType.ECDSA) {
            valid = verifyECDSA(signature, message);
        } else if (sigType == SignatureType.RINGTAIL) {
            valid = verifyRingtail(signature, message);
        }
        
        require(valid, "Invalid signature");
        
        // Execute bridge operation
    }
}
```

## Migration Strategy

### 1. Parallel Operation Phase (3-6 months)
- Deploy Ringtail alongside existing GG18
- New assets use Ringtail
- Existing assets continue with ECDSA

### 2. Transition Phase (6-12 months)
- Gradually migrate high-value assets
- Provide tools for voluntary migration
- Monitor performance and security

### 3. Deprecation Phase (12+ months)
- Phase out ECDSA for new operations
- Maintain legacy support for existing assets
- Full transition to post-quantum security

## Performance Optimization

### 1. NTT Optimization
- Use AVX2/AVX512 instructions
- Precompute twiddle factors
- Cache-friendly memory layout

### 2. Parallel Processing
- Parallelize matrix operations
- Batch signature generation
- Optimize network communication

### 3. Preprocessing
- Maintain pool of offline data
- Background generation during idle time
- Efficient storage and retrieval

## Testing Strategy

### 1. Unit Tests
- Ring arithmetic correctness
- Gaussian sampling distribution
- Protocol state machines

### 2. Integration Tests
- Multi-party protocol execution
- Network failure scenarios
- Concurrent signing sessions

### 3. Benchmarks
- Signature generation time
- Verification gas costs
- Network bandwidth usage

## Security Considerations

### 1. Side-Channel Protection
- Constant-time implementations
- Memory access patterns
- Power analysis resistance

### 2. Randomness Quality
- Secure random number generation
- Entropy pool management
- Deterministic testing mode

### 3. Protocol Security
- Formal verification of critical paths
- Fuzzing campaign
- External security audit

## Timeline

### Month 1-2: Core Development
- Ring arithmetic implementation
- Gaussian sampling
- Basic protocol structure

### Month 3-4: Integration
- Node.js wrapper
- P2P communication
- State management

### Month 5-6: Smart Contracts
- Verifier implementation
- Gas optimization
- Testing on testnet

### Month 7-8: Testing & Optimization
- Performance tuning
- Security hardening
- Documentation

### Month 9-12: Deployment
- Gradual rollout
- Monitoring
- Migration tools

This implementation plan provides a roadmap for integrating Ringtail into the existing Lux Bridge infrastructure while maintaining backwards compatibility and ensuring a smooth transition to post-quantum security.