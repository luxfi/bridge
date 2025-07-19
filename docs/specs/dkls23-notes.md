# Analysis of DKLs23

Utila chose the DKLs23 protocol for their MPC-ECDSA implementation primarily due to its minimal security assumptions, requiring nothing beyond what's already assumed for standard ECDSA, and its efficient three-round communication pattern. This selection offers valuable insights for Lux Network's bridge implementation, as both projects need secure, efficient cross-chain transaction signing. DKLs23's advantages over homomorphic encryption-based alternatives like CGGMP20 include dramatically faster computation (often 2-3 orders of magnitude) and fewer cryptographic assumptions, making it ideal for resource-constrained environments like mobile devices. For Lux Network's unified MPC library supporting both ECDSA and EdDSA signatures, a modular architecture with protocol-specific modules, unified key management, and clear separation between cryptographic primitives provides the most effective approach.

## Utila's protocol selection process reveals cross-chain priorities

Utila's approach to MPC-ECDSA implementation focuses on distributing private keys between Utila and clients to eliminate single points of failure. Their selection process prioritized security above all other considerations, followed by efficiency metrics including computational complexity, communication overhead, and round complexity.

When evaluating protocols, Utila compared two primary families: those based on linear homomorphic encryption (like CGGMP20) and those based on Oblivious Transfers (like DKLs19 and DKLs23). They ultimately selected DKLs23 for several compelling reasons:

**Minimal security assumptions** proved decisive in Utila's selection. DKLs23 requires no additional cryptographic assumptions beyond what's already needed for standard ECDSA. In contrast, CGGMP20 relies on additional assumptions including "strong RSA," "semantic security of Paillier encryption," and "an enhanced variant of existential unforgeability of ECDSA."

**Round efficiency** was another critical factor, with DKLs23 requiring only 3 communication rounds compared to DKLs19's 5 rounds. Utila identified this as "the most important efficiency factor when dealing with high-latency networks" – a common consideration for global blockchain applications.

Before implementation, Utila's cryptography team "thoroughly reviewed and re-validated the security proof of DKLs23" and even "provided an independent proof of security," demonstrating their commitment to security verification before production deployment.

## Protocol comparison reveals stark performance differences

The three protocols – CGGMP20, DKLs19, and DKLs23 – represent different approaches to solving the challenge of MPC-ECDSA implementation, with significant differences in performance, security properties, and implementation complexity.

### Performance characteristics

| Protocol | Communication Rounds | Computational Complexity | Message Complexity |
|----------|----------------------|--------------------------|-------------------|
| CGGMP20  | 4 rounds total       | High (Paillier operations) | O(n²) for identifiable abort |
| DKLs19   | log(t) + 6 rounds    | Lower than CGGMP20        | Lower than CGGMP20 |
| DKLs23   | 3 rounds total       | Similar to DKLs19         | Lower than both previous protocols |

**Round complexity** shows a clear advantage for DKLs23 with just 3 communication rounds, compared to 4 rounds for CGGMP20 and log(t)+6 rounds for DKLs19 (where t is the threshold). This difference becomes especially important for high-latency networks where each round adds significant delay.

**Computational efficiency** heavily favors both DKLs protocols. CGGMP20 requires expensive Paillier operations and zero-knowledge proofs, while DKLs protocols rely primarily on hashing operations and are often 2-3 orders of magnitude faster in practice.

### Security properties

All three protocols provide security in the Universal Composability (UC) framework against malicious adversaries with dishonest majority, but their security assumptions differ significantly:

- **CGGMP20** requires Strong RSA, Decisional Diffie-Hellman (DDH), semantic security of Paillier encryption, and an enhanced variant of ECDSA unforgeability
- **DKLs19** requires only the Computational Diffie-Hellman (CDH) Assumption in the Global Random Oracle model
- **DKLs23** is information-theoretically UC-secure, requiring only ideal commitment and two-party multiplication primitives

**Advanced security features** vary between protocols. CGGMP20 provides proactive security with periodic key refresh and identifiable abort to identify malicious parties. The DKLs protocols focus on minimal assumptions and efficiency but may require extensions for similar advanced features.

### Implementation complexity

**Implementation difficulty** is highest for CGGMP20 due to complex zero-knowledge proofs and Paillier key generation. DKLs protocols are generally simpler to implement and maintain, with DKLs23 offering a particularly streamlined key generation procedure using a commit-release-and-complain approach.

**Platform requirements** also differ significantly. CGGMP20 is more resource-intensive and may struggle on low-power devices, while both DKLs protocols can run efficiently on standard hardware and even smartphones.

## Linear homomorphic encryption vs. oblivious transfers: tradeoffs impact deployment

The fundamental technical difference between these protocol families revolves around how they implement secure multiplication, a core operation required for MPC-ECDSA due to ECDSA's non-linear signing equation.

### Linear homomorphic encryption (LHE) approach

Protocols like CGGMP20 use Paillier cryptosystem, which enables:
- Additive homomorphism: ability to compute an encryption of m₁+m₂ directly from encryptions of m₁ and m₂
- Implementation using large modulus integers based on factoring-based cryptography
- Verification through extensive zero-knowledge proofs

### Oblivious transfer (OT) approach

Protocols like DKLs19 and DKLs23 use OT, where:
- A sender with two messages m₀, m₁ and a receiver with choice bit b interact such that the receiver gets m_b without learning m_{1-b}, and the sender doesn't learn b
- Implementation leverages OT extension to efficiently generate many OTs
- Verification uses simpler statistical consistency checks instead of zero-knowledge proofs

### Performance tradeoffs between approaches

**Computational requirements** heavily favor OT-based approaches, which are typically 2-3 orders of magnitude faster than LHE-based protocols. LHE requires expensive modular exponentiations with large integers and zero-knowledge proofs, while OT uses mostly hash functions.

**Bandwidth usage** favors LHE-based approaches, which typically have lower communication complexity. OT protocols require more data transmission but compensate with dramatically faster computation.

**Implementation complexity** is generally lower for OT-based protocols, which use the same elliptic curve and hash functions as ECDSA itself. LHE-based approaches require separate cryptographic primitives including safe biprimes, which are resource-intensive to generate.

### When to choose which approach

For a bridge implementation like Lux Network's, the choice depends on specific deployment characteristics:

- **OT-based approaches** (DKLs23) provide better performance for resource-constrained devices and environments where computation is more limited than bandwidth
- **LHE-based approaches** (CGGMP20) may be preferred in bandwidth-constrained environments or when advanced features like proactive security with identifiable abort are essential

## Utila's selection informs Lux Network's implementation strategy

Utila's rationale for selecting DKLs23 offers several valuable insights for Lux Network's MPC bridge implementation:

### Priority alignment for bridge requirements

Utila prioritized **security with minimal assumptions**, an approach particularly relevant for cross-chain bridges where security is paramount. By adopting protocols with fewer cryptographic assumptions, Lux Network can reduce potential attack vectors.

**Network efficiency considerations** that drove Utila to select a protocol with minimal communication rounds apply equally to bridge implementations. Cross-chain transactions often involve high-latency communications across global networks, making DKLs23's three-round approach particularly valuable.

### Implementation considerations

For Lux Network, Utila's focus on **device compatibility** suggests a similar consideration: bridge validators and relayers may run on diverse hardware, making DKLs23's lower computational requirements advantageous.

Utila's implementation includes **separated offline and online phases**, enabling "the online phase to be as quick as sending a single [message]." This approach could significantly improve bridge transaction throughput by moving preprocessing work offline.

Utila's emphasis on a **comprehensive security model** beyond just the cryptographic protocol provides a template for Lux Network. This includes device management, administrator approvals, and recovery mechanisms – all crucial for bridge security.

## Best practices for a unified MPC library supporting ECDSA and EdDSA

Implementing a unified MPC library supporting both ECDSA (for EVM chains) and EdDSA (for non-EVM chains like Solana) presents several challenges and opportunities:

### Architectural approaches

**Modular architecture** provides the most effective framework for supporting multiple signature schemes:
- Core cryptographic layer with shared primitives (hash functions, random number generation)
- Protocol-specific modules for ECDSA and EdDSA
- Common interface abstracting underlying signature differences

**Unified key management** simplifies cross-chain operations:
- Common distributed key generation (DKG) mechanism
- Single secure storage system with appropriate metadata
- Unified HD key derivation across schemes

### Technical challenges

The fundamental challenge stems from the **different mathematical structures** of the signature schemes:
- ECDSA has a non-linear signing equation requiring specialized protocols
- EdDSA (based on Schnorr signatures) has a linear structure making implementation more straightforward

**Curve compatibility** issues arise from the different elliptic curves:
- ECDSA typically uses secp256k1 (Bitcoin, Ethereum) or NIST P-256
- EdDSA uses edwards25519 curve (Solana, Cardano, Stellar) or edwards448

### Performance optimizations

**Offline/online protocol separation** offers significant performance benefits:
- Compute-intensive preprocessing done before transaction signing
- Fast execution when a signature is actually required
- Both DKLs23 and CGGMP20 protocols support this approach

**Batching optimizations** can dramatically improve throughput:
- Batch range proofs improve ECDSA performance by 2.0-2.4x in bandwidth and 1.5-2.1x in computation
- Vectorized multiplication in DKLs23 enhances performance for multiple signatures

## Recent DKLs23 developments show continued innovation

Since Utila's implementation, DKLs23 has continued to mature and gain adoption:

### Protocol innovations

Published in IEEE Symposium on Security and Privacy 2024, DKLs23 provides:
- **Three-round efficiency** (reduced from 5 rounds in DKLs19)
- **Information-theoretic security** with UC-security assuming only ideal commitment and two-party multiplication primitives
- **Simplified security assumptions** relying only on the same assumptions as ECDSA itself

### Production implementations

Several major organizations have implemented DKLs23:
- **Utila**: Selected after comparing with other protocols
- **BlockDaemon**: Implementing alongside other DKLs protocols
- **Copper**: Using for their MPC implementation
- **0xPass**: Passport Protocol highlights its performance advantages

### Future directions

Recent research building on DKLs23 shows continued innovation:
- **RompSig**: A robust threshold ECDSA scheme matching DKLs23's three rounds while adding robustness against misbehaving parties
- **Batch range proofs**: New techniques for improving efficiency in threshold ECDSA implementations

## Conclusion

For Lux Network's bridge implementation, DKLs23 offers compelling advantages for the ECDSA component of a unified MPC library. Its minimal round complexity, lower computational requirements, and fewer security assumptions make it well-suited for cross-chain applications where security and performance are equally critical.

When building a unified MPC library supporting both ECDSA and EdDSA, a modular architecture with protocol-specific modules and unified key management provides the most effective approach. By implementing appropriate performance optimizations like offline/online separation and batching, Lux Network can create a high-performance bridge solution supporting both EVM and non-EVM chains.
