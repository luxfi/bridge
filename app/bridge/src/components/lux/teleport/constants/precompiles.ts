/**
 * Canonical chain-native precompile addresses for Lux chains.
 *
 * The teleporter contracts in settings.ts are the user-facing bridge entry
 * points; under the hood they call into the chain's native TELEPORT_BRIDGE
 * precompile when running on a Lux chain. The PQCrypto precompiles back
 * vault attestations and the strict-PQ bridge profile (LUX_STRICT_PQ_BRIDGE).
 *
 * Source of truth: ~/work/lux/precompile/dex/types.go (DEX/bridge block)
 * and ~/work/lux/precompile/{mldsa,mlkem,slhdsa,pulsar,p3q,corona,magnetar,hqc}/contract.go
 * (LP-4200 unified PQCrypto block).
 */

export type Address = `0x${string}`

/**
 * DEX + bridge precompile block (0x0400-0x04FF).
 */
export const DEX_PRECOMPILES = {
  // Core DEX
  POOL_MANAGER: '0x0000000000000000000000000000000000000400' as Address,
  SWAP_ROUTER: '0x0000000000000000000000000000000000000401' as Address,
  HOOKS_REGISTRY: '0x0000000000000000000000000000000000000402' as Address,
  FLASH_LOAN: '0x0000000000000000000000000000000000000403' as Address,
  // Lending
  LENDING_POOL: '0x0000000000000000000000000000000000000410' as Address,
  // Perp
  PERP_ENGINE: '0x0000000000000000000000000000000000000420' as Address,
  // Bridge
  TELEPORT_BRIDGE: '0x0000000000000000000000000000000000000440' as Address,
  OMNICHAIN_ROUTER: '0x0000000000000000000000000000000000000441' as Address,
} as const

/**
 * LP-4200 unified PQCrypto precompile block (0x012201-0x012208).
 * Used by vault attestations under the strict-PQ bridge profile.
 */
export const PQ_CRYPTO_PRECOMPILES = {
  ML_KEM: '0x0000000000000000000000000000000000012201' as Address,    // FIPS 203 KEM
  ML_DSA: '0x0000000000000000000000000000000000012202' as Address,    // FIPS 204 signature
  SLH_DSA: '0x0000000000000000000000000000000000012203' as Address,   // FIPS 205 hash-based signature
  PULSAR: '0x0000000000000000000000000000000000012204' as Address,    // Threshold ML-DSA-65
  P3Q: '0x0000000000000000000000000000000000012205' as Address,       // Strict-PQ STARK verify
  CORONA: '0x0000000000000000000000000000000000012206' as Address,    // Ring-LWE threshold
  MAGNETAR: '0x0000000000000000000000000000000000012207' as Address,  // Public-DKG MPC threshold SLH-DSA
  HQC: '0x0000000000000000000000000000000000012208' as Address,       // Code-based KEM backup
} as const

/**
 * Lux mainnet chain IDs that expose the native precompile set above.
 * Non-Lux chains (Ethereum, BSC, etc.) only have the user-facing
 * teleporter contract from CONTRACTS in settings.ts.
 */
export const LUX_NATIVE_CHAIN_IDS = new Set<number>([
  96369, // Lux Mainnet C-Chain
  96368, // Lux Testnet C-Chain
  200200, // Zoo Mainnet
  200201, // Zoo Testnet
  36963, // Hanzo Mainnet
  36911, // SPC Mainnet
  494949, // Pars Mainnet
])

export function hasNativePrecompiles(chainId: number): boolean {
  return LUX_NATIVE_CHAIN_IDS.has(chainId)
}
