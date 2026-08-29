import { ripemd160 } from "@noble/hashes/legacy.js"
import { sha256 } from "@noble/hashes/sha2.js"
import { base58 } from "@scure/base"

/**
 * XRP Ledger classic addresses from a public key.
 *
 * XRPL uses its own base58 alphabet — `r` where Bitcoin has `1` — so an
 * address built with the standard alphabet is a well-formed string that names
 * a different account. That is the trap here: nothing rejects it, it simply
 * points somewhere else.
 *
 *   account id  RIPEMD160(SHA256(pubkey))         20 bytes
 *   payload     0x00 || account id                21 bytes
 *   checksum    first 4 of SHA256(SHA256(payload))
 *   address     base58(payload || checksum) in the XRPL alphabet
 *
 * XRPL accepts both secp256k1 and Ed25519 keys, and the key format differs:
 * secp256k1 is the 33-byte compressed point as-is; Ed25519 is the 32-byte key
 * with a 0xED prefix, making 33 either way. Hashing the wrong form yields a
 * valid-looking address for an account nobody controls.
 */

/** XRPL's base58 alphabet. The ordering is the whole difference. */
const XRPL_ALPHABET = "rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz"

const xrpBase58 = base58 // shape check only; encoding uses the alphabet below

/** Classic addresses carry a 0x00 type prefix. */
const ACCOUNT_PREFIX = 0x00

/** Ed25519 public keys are prefixed 0xED to make 33 bytes, as secp256k1 is. */
const ED25519_PREFIX = 0xed

function encodeBase58(bytes: Uint8Array, alphabet: string): string {
  let n = 0n
  for (const b of bytes) n = (n << 8n) | BigInt(b)
  let out = ""
  const base = BigInt(alphabet.length)
  while (n > 0n) {
    out = alphabet[Number(n % base)] + out
    n /= base
  }
  // Leading zero bytes are not carried by the arithmetic and must be restored.
  for (const b of bytes) {
    if (b !== 0) break
    out = alphabet[0] + out
  }
  return out
}

/** The 20-byte account id behind an address. */
export function accountID(pubKey: Uint8Array): Uint8Array {
  const key = normalise(pubKey)
  return ripemd160(sha256(key))
}

/**
 * A public key in the 33-byte form XRPL hashes.
 *
 * A 32-byte key is Ed25519 and gains its 0xED prefix; a 33-byte key is already
 * either a compressed secp256k1 point or a prefixed Ed25519 one. Anything else
 * is refused rather than padded into something plausible.
 */
function normalise(pubKey: Uint8Array): Uint8Array {
  if (pubKey.length === 33) return pubKey
  if (pubKey.length === 32) {
    const out = new Uint8Array(33)
    out[0] = ED25519_PREFIX
    out.set(pubKey, 1)
    return out
  }
  throw new Error(
    `xrp: a public key is 33 bytes compressed secp256k1 or 32 bytes ed25519, got ${pubKey.length}`,
  )
}

/** The classic r-address for this key. */
export function encodeXRPAddress(pubKey: Uint8Array): string {
  const payload = new Uint8Array(21)
  payload[0] = ACCOUNT_PREFIX
  payload.set(accountID(pubKey), 1)

  const checksum = sha256(sha256(payload)).slice(0, 4)
  const full = new Uint8Array(25)
  full.set(payload)
  full.set(checksum, 21)

  return encodeBase58(full, XRPL_ALPHABET)
}

/** Whether a string is a well-formed classic address, checksum included. */
export function isXRPAddress(address: string): boolean {
  if (!address.startsWith("r")) return false
  let n = 0n
  const base = BigInt(XRPL_ALPHABET.length)
  for (const c of address) {
    const i = XRPL_ALPHABET.indexOf(c)
    if (i < 0) return false
    n = n * base + BigInt(i)
  }
  const bytes: number[] = []
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn))
    n >>= 8n
  }
  for (const c of address) {
    if (c !== XRPL_ALPHABET[0]) break
    bytes.unshift(0)
  }
  if (bytes.length !== 25) return false
  const body = Uint8Array.from(bytes.slice(0, 21))
  const want = sha256(sha256(body)).slice(0, 4)
  return bytes.slice(21).every((b, i) => b === want[i])
}

export { XRPL_ALPHABET, xrpBase58 }
