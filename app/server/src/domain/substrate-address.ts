/**
 * SS58 address encoding/decoding for Substrate-based chains (Polkadot, Kusama, etc).
 *
 * SS58 format: base58(prefix | pubkey | checksum)
 *   - prefix: network byte(s) (0 = Polkadot, 2 = Kusama)
 *   - pubkey: 32 bytes (sr25519 or ed25519)
 *   - checksum: first 2 bytes of blake2b-512("SS58PRE" | prefix | pubkey)
 */

import { createHash } from "crypto"

// SS58 checksum prefix constant
const SS58_PREFIX = new TextEncoder().encode("SS58PRE")

// Base58 alphabet (same as Bitcoin)
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

function base58Encode(data: Uint8Array): string {
  // Count leading zeros
  let zeros = 0
  for (const byte of data) {
    if (byte !== 0) break
    zeros++
  }

  // Convert to bigint for base58 conversion
  let num = BigInt(0)
  for (const byte of data) {
    num = num * 256n + BigInt(byte)
  }

  let encoded = ""
  while (num > 0n) {
    const remainder = Number(num % 58n)
    num = num / 58n
    encoded = BASE58_ALPHABET[remainder] + encoded
  }

  // Prepend '1' for each leading zero byte
  return "1".repeat(zeros) + encoded
}

function base58Decode(str: string): Uint8Array {
  // Count leading '1's
  let zeros = 0
  for (const ch of str) {
    if (ch !== "1") break
    zeros++
  }

  let num = BigInt(0)
  for (const ch of str) {
    const idx = BASE58_ALPHABET.indexOf(ch)
    if (idx < 0) throw new Error(`Invalid base58 character: ${ch}`)
    num = num * 58n + BigInt(idx)
  }

  // Convert bigint to bytes
  const bytes: number[] = []
  while (num > 0n) {
    bytes.unshift(Number(num & 0xffn))
    num = num >> 8n
  }

  // Prepend zero bytes for leading '1's
  const result = new Uint8Array(zeros + bytes.length)
  result.set(new Uint8Array(bytes), zeros)
  return result
}

/**
 * Blake2b-512 hash. Node.js crypto module supports blake2b512.
 */
function blake2b512(data: Uint8Array): Uint8Array {
  const hash = createHash("blake2b512")
  hash.update(data)
  return new Uint8Array(hash.digest())
}

/**
 * Compute SS58 checksum (first 2 bytes of blake2b-512("SS58PRE" | prefix | pubkey)).
 */
function ss58Checksum(prefix: Uint8Array, pubkey: Uint8Array): Uint8Array {
  const input = new Uint8Array(SS58_PREFIX.length + prefix.length + pubkey.length)
  input.set(SS58_PREFIX, 0)
  input.set(prefix, SS58_PREFIX.length)
  input.set(pubkey, SS58_PREFIX.length + prefix.length)
  const hash = blake2b512(input)
  return hash.slice(0, 2)
}

/**
 * Encode a prefix byte array for the given network id.
 * Simple prefix: 0-63 = 1 byte.
 * Full prefix: 64-16383 = 2 bytes (Canary encoding).
 */
function encodePrefix(network: number): Uint8Array {
  if (network < 0 || network > 16383) {
    throw new Error(`SS58 network prefix out of range: ${network}`)
  }
  if (network < 64) {
    return new Uint8Array([network])
  }
  // Two-byte prefix encoding per SS58 spec:
  // ((network & 0xFC) >> 2) | 0x40 for first byte
  // (network >> 8) | ((network & 0x03) << 6) for second byte
  const first = ((network & 0xfc) >> 2) | 0x40
  const second = (network >> 8) | ((network & 0x03) << 6)
  return new Uint8Array([first, second])
}

/**
 * Decode the prefix from raw SS58 bytes. Returns [network, prefixLength].
 */
function decodePrefix(data: Uint8Array): [number, number] {
  if (data.length < 3) {
    throw new Error("SS58 data too short")
  }
  const first = data[0]
  if (first < 64) {
    return [first, 1]
  }
  if (first < 128) {
    if (data.length < 4) {
      throw new Error("SS58 data too short for two-byte prefix")
    }
    const second = data[1]
    const lower = ((first & 0x3f) << 2) | (second >> 6)
    const upper = second & 0x3f
    return [(upper << 8) | lower, 2]
  }
  throw new Error(`Invalid SS58 prefix byte: ${first}`)
}

/**
 * Encode a 32-byte public key to an SS58 address.
 *
 * @param publicKey 32-byte sr25519 or ed25519 public key
 * @param network   SS58 network prefix (0 = Polkadot, 2 = Kusama, 42 = generic Substrate)
 * @returns         SS58-encoded address string
 */
export function encodeSubstrateAddress(publicKey: Uint8Array, network: number = 0): string {
  if (publicKey.length !== 32) {
    throw new Error(`Public key must be 32 bytes, got ${publicKey.length}`)
  }

  const prefix = encodePrefix(network)
  const checksum = ss58Checksum(prefix, publicKey)
  const payload = new Uint8Array(prefix.length + 32 + 2)
  payload.set(prefix, 0)
  payload.set(publicKey, prefix.length)
  payload.set(checksum, prefix.length + 32)
  return base58Encode(payload)
}

/**
 * Decode an SS58 address to its public key and network prefix.
 *
 * @param address SS58-encoded address string
 * @returns       { publicKey: 32-byte Uint8Array, network: number }
 */
export function decodeSubstrateAddress(address: string): { publicKey: Uint8Array; network: number } {
  const data = base58Decode(address)
  const [network, prefixLen] = decodePrefix(data)

  if (data.length !== prefixLen + 32 + 2) {
    throw new Error(`Invalid SS58 address length: expected ${prefixLen + 34}, got ${data.length}`)
  }

  const publicKey = data.slice(prefixLen, prefixLen + 32)
  const checksum = data.slice(prefixLen + 32, prefixLen + 34)
  const prefix = data.slice(0, prefixLen)

  const expectedChecksum = ss58Checksum(prefix, publicKey)
  if (checksum[0] !== expectedChecksum[0] || checksum[1] !== expectedChecksum[1]) {
    throw new Error("Invalid SS58 checksum")
  }

  return { publicKey, network }
}

/**
 * Validate an SS58 address.
 */
export function isValidSubstrateAddress(address: string): boolean {
  try {
    decodeSubstrateAddress(address)
    return true
  } catch {
    return false
  }
}

// Well-known network prefixes
export const SUBSTRATE_NETWORKS = {
  POLKADOT: 0,
  KUSAMA: 2,
  GENERIC: 42,
} as const
