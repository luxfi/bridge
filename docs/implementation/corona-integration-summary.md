# Corona Integration Summary for Lux Bridge

## Overview

This document summarizes the integration of the Corona lattice-based threshold signature scheme into the Lux Bridge MPC backend, providing post-quantum security for cross-chain operations.

## Key Components Created

### 1. Documentation
- **`corona-notes.md`**: Comprehensive overview of Corona protocol and how it compares to current GG18
- **`corona-implementation-plan.md`**: Detailed implementation strategy (initially for Rust, but concepts apply to Go)
- **`corona-go-integration.md`**: Specific plan for integrating the existing Go implementation
- **`corona-node-integration.md`**: Step-by-step guide for modifying the Node.js backend

### 2. Service Wrapper
- **`corona-service/main.go`**: HTTP service that wraps the Go Corona implementation
  - Exposes `/sign` endpoint for 2-round signing
  - Manages signing sessions
  - Provides health checks and status monitoring

### 3. Node.js Integration
- **`corona-client.ts`**: TypeScript client for communicating with Corona service
  - Handles Round 1 (offline) and Round 2 (online) phases
  - Manages commitment coordination
  - Provides clean API for the bridge

- **`corona-adapter.ts`**: Adapter that integrates Corona with existing infrastructure
  - Follows same pattern as current GG18 integration
  - Handles signature encoding/decoding
  - Manages party coordination

### 4. Docker Support
- **`corona.Dockerfile`**: Multi-stage build for Corona service
  - Builds both the core Corona and service wrapper
  - Optimized for production deployment
  - Includes health checks

## Architecture Comparison

### Current (GG18 ECDSA)
```
Node.js → Spawn Rust Binary → ECDSA Signature (65 bytes)
```

### New (Corona)
```
Node.js → HTTP/gRPC → Go Service → Lattice Signature (13.4 KB)
```

## Key Advantages of This Approach

1. **Minimal Disruption**: Corona runs alongside existing ECDSA, no breaking changes
2. **Reuses Infrastructure**: Leverages existing P2P communication and state management
3. **Post-Quantum Security**: Future-proof against quantum attacks
4. **2-Round Protocol**: More efficient than current 3+ round GG18
5. **Standard Assumptions**: Based on well-studied LWE/SIS problems

## Integration Steps

### Phase 1: Setup (Week 1-2)
1. Copy Corona Go code to bridge repository
2. Build and test Corona service wrapper
3. Deploy to test environment
4. Verify basic functionality

### Phase 2: Integration (Week 3-4)
1. Update Node.js backend with dual-scheme support
2. Implement commitment coordination
3. Test end-to-end signing flow
4. Add monitoring and metrics

### Phase 3: Testing (Week 5-6)
1. Multi-party integration tests
2. Performance benchmarking
3. Failure scenario testing
4. Security audit preparation

### Phase 4: Deployment (Week 7-8)
1. Deploy to testnet
2. Run parallel with ECDSA
3. Monitor performance
4. Gradual mainnet rollout

## Configuration Example

```yaml
# docker-compose.yml snippet
services:
  mpc-node:
    environment:
      - SIGNATURE_SCHEME=CORONA
      - CORONA_SERVICE_URL=http://corona:8080
    depends_on:
      - corona

  corona:
    build:
      dockerfile: corona.Dockerfile
    environment:
      - PARTY_ID=0
      - THRESHOLD=2
```

## Smart Contract Requirements

Corona signatures require new verifier contracts due to:
- Larger signature size (13.4 KB vs 65 bytes)
- Different verification algorithm (lattice-based)
- Higher gas costs

Example verifier interface:
```solidity
interface ICoronaVerifier {
    function verify(
        bytes calldata signature,
        bytes32 messageHash,
        bytes calldata publicKey
    ) external view returns (bool);
}
```

## Performance Considerations

| Metric | ECDSA (GG18) | Corona |
|--------|--------------|----------|
| Signature Size | 65 bytes | 13.4 KB |
| Rounds | 3+ | 2 (1 offline) |
| Computation | Moderate | Higher |
| Network Traffic | Low | Higher |
| Quantum Secure | No | Yes |

## Migration Strategy

1. **Parallel Operation**: Both schemes active
2. **New Assets First**: Use Corona for new vaults
3. **Gradual Migration**: Move existing assets over time
4. **Maintain Compatibility**: Keep ECDSA for legacy

## Security Benefits

1. **Quantum Resistance**: Secure against Shor's algorithm
2. **Standard Assumptions**: Based on LWE/SIS, not proprietary
3. **Proven Security**: Formal proofs in random oracle model
4. **No Single Point of Failure**: True threshold security

## Next Immediate Steps

1. **Review and Approve Design**
   ```bash
   # Review all documentation
   cd /Users/z/work/lux/bridge/docs
   ls corona-*.md
   ```

2. **Set Up Development Environment**
   ```bash
   # Copy Corona to bridge
   cp -r ~/work/lux/corona /Users/z/work/lux/bridge/mpc-nodes/
   
   # Build service wrapper
   cd /Users/z/work/lux/bridge/mpc-nodes/corona-service
   go mod init corona-service
   go mod tidy
   go build
   ```

3. **Test Basic Integration**
   ```bash
   # Start Corona service
   PARTY_ID=0 THRESHOLD=2 ./corona-service
   
   # Test health check
   curl http://localhost:8080/health
   ```

4. **Implement Coordination Layer**
   - Update the mock coordination in corona-adapter.ts
   - Integrate with existing P2P communication
   - Test multi-party signing

## Conclusion

The Corona integration provides a clear path to post-quantum security for the Lux Bridge while maintaining compatibility with existing infrastructure. The modular design allows for gradual deployment and easy rollback if needed.

The existing Go implementation at `~/work/lux/corona` can be wrapped with minimal modifications and integrated into the bridge backend through a clean HTTP/gRPC interface, following the same patterns as the current GG18 integration.

This approach balances security improvements with practical deployment considerations, ensuring a smooth transition to quantum-resistant signatures.