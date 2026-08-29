import { blake2b } from "@noble/hashes/blake2.js"
import { bech32 } from "@scure/base"

/**
 * Cardano addresses from an Ed25519 public key, per CIP-19.
 *
 * The key is the same one Solana uses — Ed25519, signed by FROST, which
 * luxfi/threshold supports natively. Only the address differs: Solana's is the
 * base58 public key itself, Cardano's is a hash of it inside a typed,
 * network-tagged, bech32 envelope. Mapping Cardano to Solana's address type
 * therefore produced a well-formed string that meant nothing on Cardano.
 *
 * An enterprise address is built here — payment credential only, no staking
 * part. It is the right shape for a bridge custody address: funds can be
 * received and spent, and nothing is delegated. A base address would commit to
 * a staking credential the committee does not have.
 *
 *   header  1 byte    type in the high nibble, network in the low
 *   payment 28 bytes  blake2b-224 of the public key
 *   bech32  hrp "addr" on mainnet, "addr_test" elsewhere
 *
 * blake2b-224 is not blake2b-512 truncated. Blake2b takes its digest length
 * into the parameter block, so the two differ from the first byte — which is
 * why Node's fixed-length blake2b512 cannot be used here.
 */

/** Address type 6: payment credential, no staking part. */
const ENTERPRISE = 0b0110

/** Network tag: the low nibble of the header byte. */
export const CardanoNetwork = {
  Mainnet: 1,
  Testnet: 0,
} as const

export type CardanoNetworkID = (typeof CardanoNetwork)[keyof typeof CardanoNetwork]

/** The 28-byte payment credential: blake2b-224 of the public key. */
export function paymentCredential(pubKey: Uint8Array): Uint8Array {
  if (pubKey.length !== 32) {
    throw new Error(`cardano: an Ed25519 public key is 32 bytes, got ${pubKey.length}`)
  }
  return blake2b(pubKey, { dkLen: 28 })
}

/** An enterprise address for this key on this network. */
export function encodeCardanoAddress(
  pubKey: Uint8Array,
  network: CardanoNetworkID = CardanoNetwork.Mainnet,
): string {
  const header = (ENTERPRISE << 4) | network
  const payload = new Uint8Array(29)
  payload[0] = header
  payload.set(paymentCredential(pubKey), 1)

  const hrp = network === CardanoNetwork.Mainnet ? "addr" : "addr_test"
  // Cardano addresses exceed bech32's default 90-character limit, and the
  // spec says to ignore it rather than truncate.
  return bech32.encode(hrp, bech32.toWords(payload), 200)
}

/** The bytes behind an address, for checking what was produced. */
export function decodeCardanoAddress(address: string): {
  network: number
  type: number
  payment: Uint8Array
} {
  const { words } = bech32.decode(address as `${string}1${string}`, 200)
  const bytes = bech32.fromWords(words)
  if (bytes.length !== 29) {
    throw new Error(`cardano: an enterprise address is 29 bytes, got ${bytes.length}`)
  }
  return {
    network: bytes[0]! & 0x0f,
    type: (bytes[0]! >> 4) & 0x0f,
    payment: Uint8Array.from(bytes.slice(1)),
  }
}
