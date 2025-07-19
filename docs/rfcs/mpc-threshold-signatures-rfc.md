# RFC: Multi-Party Computation Threshold Signatures for Lux Bridge

**Status:** Draft  
**Created:** July 2025  
**Authors:** Lux Engineering Team  

## Abstract

This RFC proposes a comprehensive multi-party computation (MPC) threshold signature system for Lux Bridge, enabling native cross-chain interoperability with all major blockchain networks through their native signature algorithms. The system implements a matrix of signature schemes mapped to threshold/MPC protocols, supporting Bitcoin Taproot, Ethereum/EVM chains, Avalanche, Cosmos, Solana, and other major blockchain families.

## Motivation

Current blockchain bridges face significant limitations in cross-chain interoperability due to incompatible signature schemes. Each blockchain family uses different cryptographic primitives:

- **Bitcoin Taproot**: Schnorr signatures (secp256k1, 64 bytes)
- **Ethereum/EVM**: ECDSA signatures (secp256k1, 65 bytes)  
- **Avalanche**: ECDSA for transactions + BLS12-381 for Warp messages
- **Cosmos/Solana/Near**: Ed25519 signatures (EdDSA, 64 bytes)
- **Polkadot**: Sr25519 (Schnorrkel) signatures

Lux Bridge requires native support for all these schemes to achieve true universal interoperability while maintaining security through distributed threshold cryptography.

## Design Goals

1. **Universal Compatibility**: Support native signature verification on all target blockchains
2. **Threshold Security**: Distributed key management with configurable thresholds
3. **Performance**: Minimize signature size and verification overhead
4. **Quantum Preparedness**: Ringtail integration for post-quantum security
5. **Modular Architecture**: Clean separation between signature schemes and threshold protocols

## Technical Specification

### Chain ↔ Signature ↔ Threshold Protocol Matrix

| Target Chain | Native Signature | Threshold/MPC Protocol | Output Size | Priority |
|--------------|------------------|------------------------|-------------|----------|
| **Lux C-Chain** | ECDSA (secp256k1) | GG-21 | 65 bytes | **Phase 1** |
| Bitcoin Taproot | Schnorr (secp256k1) | FROST-Secp256k1/MuSig2 | 64 bytes | Phase 2 |
| Ethereum/EVM | ECDSA (secp256k1) | GG-21 | 65 bytes | Phase 2 |
| Avalanche Warp | BLS12-381 | Native threshold-BLS | 96 bytes | Phase 2 |
| Cosmos/Tendermint | Ed25519 (EdDSA) | FROST-Ed25519 | 64 bytes | Phase 3 |
| Solana | Ed25519 (EdDSA) | FROST-Ed25519 | 64 bytes | Phase 3 |
| XRPL | ECDSA + Ed25519 | GG-21 / FROST-Ed25519 | 65/64 bytes | Phase 3 |
| Polkadot | Sr25519 (Schnorrkel) | FROST-Sr25519 | 64 bytes | Phase 4 |

### Threshold Schemes Overview

| Scheme | Curve | Rounds | Aggregation Size | Maturity | Suited Chains |
|--------|-------|--------|------------------|----------|---------------|
| **GG-21 (ECDSA)** | secp256k1 | 2 rounds | 65 B | Production | ETH, BSC, AVAX, **Lux** |
| **FROST (Ed25519)** | Ed25519 | 1 round | 64 B | Stable | Cosmos, Solana, Near |
| **FROST-Secp256k1** | secp256k1 | 1 round | 64 B | IETF Draft | Bitcoin Taproot |
| **Threshold-BLS** | BLS12-381 | 0 extra | 96 B | Native AWM | Avalanche Warp |
| **Sr25519 Schnorrkel** | Ristretto | 1-2 rounds | 64 B | Research | Polkadot |

### Architecture Stack Integration

```
┌─────────────────────────────────────────────────────────┐
│ Relayer (Destination Transaction Embedding)            │
├─────────────────────────────────────────────────────────┤
│ Warp Chain (Block Attestation + Message Verification)  │
├─────────────────────────────────────────────────────────┤
│ B-Chain (Share Collection + Signature Aggregation)     │
├─────────────────────────────────────────────────────────┤
│ Hanzo GPU (Accelerated MPC Operations)                 │
├─────────────────────────────────────────────────────────┤
│ Ringtail (Post-Quantum Key Root)                       │
└─────────────────────────────────────────────────────────┘
```

**Key Derivation**: All threshold protocols derive keys from Ringtail's PQ root using `HKDF(curveID || ringtailShare)`, ensuring quantum-safe key anchoring while supporting classical signature schemes.

## Implementation Phases

### Phase 1: Lux C-Chain Integration (Month 1 - Priority)

**Objective**: Enable native threshold ECDSA signatures for Lux C-Chain transactions

**Deliverables**:
- GG-21 ECDSA threshold implementation in Go
- Integration with existing Lux C-Chain infrastructure  
- B-Chain share collection and aggregation
- Comprehensive test suite with Lux C-Chain testnet
- Production deployment pipeline

**Success Criteria**:
- Native Lux C-Chain transaction signing with 65-byte ECDSA signatures
- Configurable threshold (e.g., 5-of-7, 10-of-15) 
- Sub-second signature generation
- Integration with existing Lux validator infrastructure

### Phase 2: Bitcoin & Ethereum Expansion 

**Objective**: Extend support to Bitcoin Taproot and Ethereum mainnet

**Deliverables**:
- FROST-Secp256k1 implementation for Bitcoin Taproot
- Enhanced GG-21 for Ethereum mainnet
- Cross-chain testing between Lux ↔ BTC ↔ ETH

### Phase 3: EdDSA Chain Support

**Objective**: Add Cosmos, Solana, and Near support

**Deliverables**:
- FROST-Ed25519 implementation
- Solana program integration
- Cosmos IBC integration

### Phase 4: Advanced Schemes

**Objective**: Complete protocol matrix with Polkadot and research schemes

**Deliverables**:
- Sr25519 Schnorrkel FROST implementation
- Polkadot/Substrate integration

## Security Framework

### Threat Mitigation

1. **Nonce Reuse Prevention**
   - Deterministic nonce derivation 
   - Optional Hanzo DRBG audit trails
   - Cryptographic nonce uniqueness proofs

2. **Rogue-Key Attack Protection**
   - FROST and GG-21 binding factors
   - Key set proof requirements in meta-chain state
   - Multi-round key verification

3. **Share Corruption Detection**
   - Feldman verification at B-Chain level
   - Zero-knowledge proofs of consistency
   - Automatic dishonest validator slashing

4. **Key Rotation & Recovery**
   - Epoch-based key rotation
   - Ringtail PQ anchor preservation
   - Proactive share refresh protocols

## Testing Strategy

### Unit Testing
```bash
go test ./mpc/... -run TestGG21_MultiParty100
go test ./mpc/... -run TestFROST_Ed25519_Threshold33of50  
go test ./mpc/... -run TestLuxCChain_Integration
```

### End-to-End Testing
- **Lux C-Chain ↔ Lux C-Chain**: Same-chain threshold operations
- **Lux ↔ Bitcoin**: Cross-chain with different signature schemes
- **Lux ↔ Ethereum**: EVM compatibility testing
- **Multi-hop**: Lux → ETH → Solana → Lux

### Performance Benchmarks
- Signature generation latency (target: <1s)
- Throughput (target: >100 sigs/minute)
- Network overhead per signature
- Memory usage per concurrent session

## Risk Analysis

### Technical Risks
- **Cryptographic Implementation**: Use battle-tested libraries (tBTC v2 GG-20, Zcash FROST)
- **Key Management**: Rigorous testing of key derivation and rotation
- **Protocol Complexity**: Incremental rollout with extensive testing

### Operational Risks  
- **Validator Coordination**: Robust network protocols and timeout handling
- **Upgrade Procedures**: Backward-compatible protocol versioning
- **Incident Response**: Comprehensive monitoring and emergency procedures

## Success Metrics

### Phase 1 (Lux C-Chain) Metrics
- ✅ 100% success rate for threshold signature generation
- ✅ <1 second average signature time
- ✅ Support for 5-of-7 and 10-of-15 threshold configurations
- ✅ Zero signature verification failures on Lux C-Chain
- ✅ Successful integration with existing Lux infrastructure

### Long-term Metrics
- Support for 10+ major blockchain families
- 99.9% uptime for signature services  
- <2% fee overhead for cross-chain transactions
- Post-quantum readiness assessment score >90%

## Future Considerations

### Quantum Transition Plan
1. **Hybrid Period**: Classical + PQ signature dual verification
2. **Migration Strategy**: Gradual migration to Ringtail-based schemes
3. **Rollback Capability**: Fallback to classical schemes if needed

### Protocol Extensions
- **Batch Signing**: Multiple signatures in single MPC round
- **Conditional Signatures**: Time-locked and condition-based signing
- **Privacy Enhancements**: Zero-knowledge signature proofs

## Conclusion

This RFC establishes a comprehensive framework for universal blockchain interoperability through native threshold signatures. Phase 1 focuses on critical Lux C-Chain integration, providing immediate value while establishing the foundation for broader cross-chain support.

The modular architecture ensures each signature scheme can be optimized independently while maintaining a unified security model rooted in Ringtail's post-quantum foundation.

---

**Next Steps**: Implementation team to review and provide feedback, followed by creation of detailed implementation issues in Linear project management.
