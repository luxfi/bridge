# Lux Bridge MPC Documentation

This directory contains comprehensive documentation for Lux Bridge's Multi-Party Computation (MPC) threshold signature system.

## 🗂️ Documentation Structure

### 📋 RFCs (Request for Comments)
Technical specifications and design proposals for major features:

- **[MPC Threshold Signatures RFC](rfcs/mpc-threshold-signatures-rfc.md)** - Master specification for universal blockchain interoperability
- **[Optimal MPC Strategy](rfcs/optimal-mpc-strategy.md)** - Strategic analysis of MPC protocol selection
- **[Post-Quantum Alternatives Analysis](rfcs/pq-alternatives-analysis.md)** - Quantum-resistant cryptography evaluation

### 📐 Specs (Technical Specifications)
Detailed protocol specifications and cryptographic implementation details:

- **[CGGMP21 Notes](specs/cggmp21-notes.md)** - Modern ECDSA threshold signature protocol
- **[DKLS23 Notes](specs/dkls23-notes.md)** - Advanced threshold ECDSA implementation
- **[HSM6 Notes](specs/hsm6-notes.md)** - Hardware Security Module integration specifications

### 📖 Guides (Implementation Guides)
Step-by-step implementation and integration guides:

- **[Unified MPC Library](guides/unified-mpc-library.md)** - Complete guide for ECDSA/EdDSA integration
- **[EdDSA Guide](guides/eddsa-guide.md)** - Edwards-curve Digital Signature Algorithm implementation
- **[UTXO Guide](guides/utxo-guide.md)** - UTXO-based blockchain integration patterns
- **[Adding New Blockchains](guides/adding-new-blockchains.md)** - How to integrate new blockchain protocols

### 🛠️ Implementation (Development Notes)
Internal development notes and implementation-specific documentation:

- **[Ringtail Integration](implementation/)** - Post-quantum signature integration
  - `ringtail-go-integration.md` - Go language integration
  - `ringtail-implementation-plan.md` - Development roadmap
  - `ringtail-integration-summary.md` - Integration overview
  - `ringtail-node-integration.md` - Node-level integration
  - `ringtail-notes.md` - Technical notes
- **[GPU Scaling](implementation/gpu-scaling.md)** - Hanzo GPU acceleration strategies
- **[TSShock](implementation/tsshock.md)** - Threshold signature shock testing

## 🎯 Phase 1: Lux C-Chain Integration (Month 1)

**Current Priority**: Native threshold ECDSA signatures for Lux C-Chain

### Quick Start for Developers

1. **Read the RFC**: Start with [MPC Threshold Signatures RFC](rfcs/mpc-threshold-signatures-rfc.md)
2. **Review Strategy**: Understand [Optimal MPC Strategy](rfcs/optimal-mpc-strategy.md) 
3. **Implementation Guide**: Follow [Unified MPC Library](guides/unified-mpc-library.md)
4. **Protocol Details**: Deep dive into [CGGMP21 Notes](specs/cggmp21-notes.md)

### Architecture Overview

```
Lux Bridge MPC Stack
├── 🔗 Relayer (Transaction Embedding)
├── 🌐 Warp Chain (Message Verification) 
├── ⚡ B-Chain (Share Aggregation)
├── 🚀 Hanzo GPU (MPC Acceleration)
└── 🔐 Ringtail (PQ Key Root)
```

### Supported Signature Schemes

| Blockchain Family | Signature Scheme | Status | Priority |
|------------------|------------------|---------|----------|
| **Lux C-Chain** | ECDSA (secp256k1) | 🚧 **In Development** | **Phase 1** |
| Bitcoin Taproot | Schnorr (secp256k1) | 📅 Planned | Phase 2 |
| Ethereum/EVM | ECDSA (secp256k1) | 📅 Planned | Phase 2 |
| Avalanche Warp | BLS12-381 | 📅 Planned | Phase 2 |
| Cosmos/Solana | Ed25519 (EdDSA) | 📅 Planned | Phase 3 |
| Polkadot | Sr25519 (Schnorrkel) | 🔬 Research | Phase 4 |

## 🔗 Quick Links

- **GitHub Repository**: [github.com/luxfi/bridge](https://github.com/luxfi/bridge)
- **Linear Project**: [Lux Bridge](https://linear.app/hanzoai/project/lux-bridge-48e8fa96f6b7)
- **Implementation Issues**: See Linear for detailed task breakdown

## 📊 Success Metrics (Phase 1)

- ✅ 100% success rate for threshold signature generation
- ✅ <1 second average signature time  
- ✅ Support for 5-of-7 and 10-of-15 threshold configurations
- ✅ Zero verification failures on Lux C-Chain
- ✅ Production deployment with monitoring

## 🚀 Getting Involved

1. **Review Documentation**: Start with RFCs for high-level understanding
2. **Check Issues**: Review implementation tasks in Linear project
3. **Technical Discussion**: Join engineering discussions for protocol details
4. **Implementation**: Follow guides for hands-on development

---

*Last Updated: July 2025*  
*Maintained by: Lux Engineering Team*
