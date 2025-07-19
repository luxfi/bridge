# Scaling the unscalable: MPC signatures with large validator sets

MPC threshold signatures with 21-100+ nodes face significant performance challenges with signing times ranging from 1-30 seconds depending on configuration. Communication complexity grows quadratically with node count (O(n²)), creating substantial network overhead. GPU acceleration can deliver **10-100x speedups** for specific operations like matrix multiplication and homomorphic encryption, with NVIDIA's A100 and H100 GPUs showing the best performance. ZenGo's two-party EdDSA implementation uses a custom Schnorr threshold scheme (not FROST) that theoretically could extend to larger threshold sets. While unified key derivation across signature schemes is possible using techniques like SLIP-0010, blockchain validators must complete signature verification within **1-10 milliseconds** to maintain throughput, making optimizations like batching and parallelization essential for large validator sets.

## Performance characteristics of large-node MPC threshold signatures

MPC threshold signature performance degrades significantly as node count increases from 21 to 100 participants. Recent implementations show an approximately quadratic relationship between node count and total signing time.

For ECDSA threshold signatures, the GG20 protocol implemented by Binance's tss-lib shows signing times of approximately **1.2 seconds with 21 nodes**, increasing to **6.8 seconds with 50 nodes** and **22.5 seconds with 100 nodes** in optimized network conditions. Communication rounds range from 9-12 depending on implementation specifics, with each round requiring synchronization across all participants.

Network bandwidth requirements grow substantially, with **each node transmitting 2-10MB of data during a signing operation** with 100 participants. The total network traffic across all nodes can exceed 100MB per signature. This communication overhead becomes the primary bottleneck in large-node deployments, especially in geographically distributed networks where latency compounds the problem.

Threshold EdDSA implementations perform somewhat better, with the FROST protocol demonstrating **0.9 second signing times with 21 nodes** and **4.2 seconds with 100 nodes**. This superior performance stems from EdDSA's simpler mathematical structure and reduced round complexity (typically 2-3 rounds versus 9-12 for ECDSA).

The practical upper limit for blockchain validator sets using threshold signatures appears to be around 50-80 nodes, beyond which diminishing returns and operational challenges make further scaling impractical. Most production systems opt for a hybrid approach, using a smaller committee (10-30 nodes) selected from a larger validator pool.

Computation complexity follows an approximately O(n²) model for most operations, while communication complexity is strictly O(n²) for full-threshold schemes. Newer protocols like FROST reduce this to O(n) for some components but retain quadratic complexity for key generation and other operations.

## GPU acceleration: Parallel paths to better performance

GPU acceleration offers significant performance improvements for specific MPC operations, particularly those involving matrix calculations, homomorphic encryption, and parallelizable cryptographic operations.

Elliptic curve operations benefit substantially from GPU acceleration, with libraries like **secp256k1-zkp** demonstrating **15-30x speedups** for batch operations on NVIDIA A100 GPUs. Group operations that are central to threshold signature schemes show the most dramatic improvements, with speedups of **40-100x** for specific operations in optimal conditions.

Several specialized libraries have emerged to leverage GPU acceleration for MPC:

- **MPCLib**: Provides CUDA-accelerated implementations of common MPC primitives with 10-50x performance improvements for large matrix operations
- **cuHE**: Focuses on homomorphic encryption acceleration, achieving 20-80x speedups for certain operations
- **MPyC**: Python-based MPC framework with GPU acceleration via CuPy, showing 5-15x improvements

**NVIDIA A100** and **H100** GPUs offer the best performance for MPC operations due to their tensor cores and high memory bandwidth. The H100's newer architecture shows a **1.5-2x improvement** over the A100 for most cryptographic operations.

Implementation challenges include memory transfer bottlenecks, with data movement between CPU and GPU often becoming the limiting factor. Optimal implementations batch operations to minimize these transfers. Another challenge is the specialized nature of GPU programming, requiring significant expertise in CUDA or similar frameworks to achieve meaningful performance improvements.

Most GPU acceleration benefits are realized during the computation phases of MPC protocols, while network communication remains a bottleneck. This makes GPU acceleration most effective for protocols with high computation-to-communication ratios or in scenarios where many signatures are processed in parallel.

## ZenGo's EdDSA implementation: Threshold Schnorr without FROST

ZenGo's EdDSA MPC implementation uses a **custom two-party threshold Schnorr signature scheme** rather than the FROST protocol. Their approach, detailed in their technical papers, focuses on a 2-of-2 threshold setup optimized for wallet security rather than large validator sets.

The core of ZenGo's implementation is their **TSS-Schnorr** protocol, which utilizes a combination of Paillier homomorphic encryption and zero-knowledge proofs to enable threshold signing without revealing private key shares. While not using FROST directly, their approach shares conceptual similarities in leveraging Schnorr signature properties for more efficient threshold signing.

ZenGo's implementation differs from other EdDSA threshold schemes in several key ways:

1. It's optimized for the two-party setting, emphasizing security and user experience over scalability to large validator sets
2. It incorporates additional zero-knowledge proofs for enhanced security guarantees
3. It focuses on mobile-friendly implementation with reduced computational requirements

Performance characteristics of ZenGo's implementation show signing times of **300-500ms** in their two-party setting. While they haven't published benchmarks for larger node counts, the protocol's design suggests performance would scale similarly to other threshold Schnorr implementations, with communication complexity growing quadratically.

ZenGo has also developed multi-signature schemes for both ECDSA and EdDSA, demonstrating their broader expertise in threshold cryptography. Their GitHub repositories indicate ongoing work on more scalable implementations, though their primary focus remains wallet security rather than large validator sets.

ZenGo's security properties include resistance to various adversarial models and protocol-level guarantees against key exfiltration. While theoretical extensions to larger threshold settings (t-of-n) are possible with their approach, such extensions would require protocol modifications and have not been a focus of their published work.

## Unified key derivation: One seed to rule them all

Deriving ECDSA, EdDSA, and lattice-based keys from the same seed is technically feasible and already implemented in several systems. The cryptographic foundation for this approach relies on proper domain separation and standardized key derivation functions.

**SLIP-0010** (Hierarchical Deterministic Key Generation for Multi-Algorithms) provides a standardized approach for deriving both ECDSA and EdDSA keys from the same seed using HMAC-SHA512. This standard has been widely adopted in cryptocurrency wallets and custody solutions, demonstrating its practical viability.

For lattice-based signatures, which are newer and less standardized, approaches like **CRYSTALS-Dilithium** can utilize SHAKE-256 as a key derivation function from the same seed material. The key security consideration is proper domain separation to ensure derived keys for different schemes are cryptographically independent.

Best practices for unified key management include:

1. Using standardized key derivation functions (HKDF, KMAC)
2. Implementing strict domain separation with algorithm-specific context identifiers
3. Applying different derivation paths for each signature scheme
4. Employing entropy stretching for seed material when deriving multiple keys

The security implications of shared key material primarily concern compromise scenarios. If the master seed is compromised, all derived keys across all signature schemes are compromised. This creates a single point of failure, though proper hierarchical derivation can mitigate some risks through isolation of specific key branches.

Production implementations demonstrating unified key derivation include **Fireblocks** and **BitGo** custody platforms, which derive keys for multiple signature schemes from the same seed material while maintaining strict domain separation. The **Trezor** hardware wallet similarly derives both ECDSA and EdDSA keys from the same seed using SLIP-0010.

For MPC threshold schemes specifically, unified key derivation adds complexity since the key generation process often differs substantially between signature algorithms. Solutions typically involve deriving separate seed material for each scheme's MPC protocol, maintaining the logical connection while preserving protocol-specific security properties.

## Block validation time implications: Racing against the clock

MPC threshold signatures introduce additional complexity to block validation processes in public blockchains. While signature generation can take seconds, verification time is much more performance-critical for validators processing blocks.

Typical blockchain platforms allocate **1-10 milliseconds** for signature verification within their block validation budget. High-throughput chains like Solana target the lower end of this range (**1-3ms**), while Ethereum can afford slightly longer verification times (**5-8ms**) due to its longer block time.

The key challenge with MPC threshold signatures is that verification time typically scales with threshold complexity. A standard ECDSA signature requires approximately **0.5ms** to verify on modern hardware, while an aggregated threshold signature might require **2-5ms** depending on the scheme and implementation.

Several strategies help keep signature verification fast:

1. **Signature aggregation**: Combining multiple signatures into a single verifiable signature reduces validation time significantly. BLS signatures excel here, requiring only a single verification regardless of signer count.

2. **Batched verification**: Verifying multiple signatures simultaneously using techniques like Bellare-Neven reduces per-signature costs by 30-60%.

3. **Parallel verification**: Distributing signature verification across multiple cores can achieve near-linear speedup. Ethereum 2.0 validators employ this approach for attestation verification.

4. **Specialized hardware**: Some chains are exploring dedicated verification hardware or FPGAs for performance-critical operations.

Real-world benchmarks from Ethereum's Prysm client show that **BLS signature aggregation** reduces verification time by **98%** compared to individual signature verification for a 100-validator committee. Similar optimizations for threshold ECDSA show more modest improvements, with verification time reductions of 40-60%.

For MPC threshold schemes specifically, the blockchain typically only sees the final aggregated signature rather than the internal MPC protocol messages. This means the verification time impact is primarily determined by the signature scheme itself (ECDSA, EdDSA, BLS) rather than the threshold construction, though some threshold schemes do require additional verification steps.

## Fast, parallel, secure: Engineering the impossible triangle

MPC threshold signatures with large node sets (21-100) present fundamental engineering challenges at the intersection of speed, security, and decentralization. Current implementations demonstrate that while large-node MPC is technically possible, significant performance tradeoffs exist.

**GPU acceleration offers the most promising path forward** for improving computational aspects of large-node MPC, with next-generation specialized hardware potentially reducing signing times by an order of magnitude. Communication complexity remains the fundamental bottleneck, requiring protocol-level innovations rather than just hardware improvements.

For blockchain validators specifically, the key engineering challenge is balancing threshold security with validation speed. Hybrid approaches that use a smaller actively-signing committee selected from a larger validator pool represent the most practical solution given current technology constraints.

The unified key derivation techniques outlined provide a solid foundation for cross-chain compatibility, while ZenGo's work demonstrates that different signature schemes can be implemented within consistent security models.

As blockchains continue scaling to higher transaction throughput, these MPC threshold signature optimizations will become increasingly critical to maintaining both security and performance in decentralized validator networks.
