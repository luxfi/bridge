import assert from "node:assert/strict"
import { test } from "node:test"
import { accountID, encodeXRPAddress, isXRPAddress, XRPL_ALPHABET } from "./xrp-address.js"

/**
 * The XRPL test vector everyone checks against: the genesis account.
 * secp256k1 public key -> rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh
 */
const GENESIS_PUBKEY = Uint8Array.from(
  Buffer.from("0330E7FC9D56BB25D6893BA3F317AE5BCF33B3291BD63DB32654A313222F7FD020", "hex"),
)
const GENESIS_ADDRESS = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh"

test("the published genesis vector", () => {
  // The one check that proves interoperability rather than self-consistency.
  // Without it this file only proves the encoder agrees with itself.
  assert.equal(encodeXRPAddress(GENESIS_PUBKEY), GENESIS_ADDRESS)
  assert.ok(isXRPAddress(GENESIS_ADDRESS))
})

test("the alphabet is XRPL's, not Bitcoin's", () => {
  // The trap: the standard base58 alphabet produces a well-formed string that
  // names a DIFFERENT account. Nothing rejects it; it just points elsewhere.
  assert.equal(XRPL_ALPHABET[0], "r")
  assert.notEqual(XRPL_ALPHABET[0], "1")
  assert.ok(encodeXRPAddress(GENESIS_PUBKEY).startsWith("r"))
})

test("an ed25519 key gets its 0xED prefix", () => {
  // 32 bytes is Ed25519 and must be prefixed to 33 before hashing. Hashing the
  // bare 32 gives a valid-looking address for an account nobody controls.
  const ed = new Uint8Array(32).fill(0xab)
  const prefixed = new Uint8Array(33)
  prefixed[0] = 0xed
  prefixed.set(ed, 1)
  assert.deepEqual(accountID(ed), accountID(prefixed))
  assert.ok(isXRPAddress(encodeXRPAddress(ed)))
})

test("the address is not the ethereum address", () => {
  // The bug this replaces: XRP fell through to wallet.ethAddress, so anyone
  // bridging to XRP was told to send it to an 0x string.
  const addr = encodeXRPAddress(GENESIS_PUBKEY)
  assert.ok(!addr.startsWith("0x"))
  assert.equal(addr.length >= 25 && addr.length <= 35, true)
})

test("a corrupted address fails its checksum", () => {
  const good = GENESIS_ADDRESS
  const bad = good.slice(0, -1) + (good.at(-1) === "h" ? "j" : "h")
  assert.ok(isXRPAddress(good))
  assert.ok(!isXRPAddress(bad), "a one-character change passed the checksum")
})

test("a key that is neither 32 nor 33 bytes is refused", () => {
  for (const n of [0, 20, 31, 34, 64]) {
    assert.throws(() => encodeXRPAddress(new Uint8Array(n)), /33 bytes|32 bytes/)
  }
})
