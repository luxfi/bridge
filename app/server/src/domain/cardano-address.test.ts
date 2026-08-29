import assert from "node:assert/strict"
import { test } from "node:test"
import {
  CardanoNetwork,
  decodeCardanoAddress,
  encodeCardanoAddress,
  paymentCredential,
} from "./cardano-address.js"

/** A fixed key, so every expectation below is about the encoder. */
const key = new Uint8Array(32).fill(0xab)

test("blake2b-224 is not blake2b-512 truncated", async () => {
  // The distinction the whole file rests on. Blake2b takes its digest length
  // into the parameter block, so the two differ from the first byte — and
  // Node's fixed-length blake2b512 is therefore unusable here. If this ever
  // passes, someone has substituted a truncating implementation.
  const { blake2b } = await import("@noble/hashes/blake2.js")
  const short = blake2b(key, { dkLen: 28 })
  const long = blake2b(key, { dkLen: 64 }).slice(0, 28)
  assert.equal(short.length, 28)
  assert.notDeepEqual(short, long, "blake2b-224 equalled truncated blake2b-512")
})

test("a mainnet address is an enterprise address on mainnet", () => {
  const addr = encodeCardanoAddress(key, CardanoNetwork.Mainnet)
  assert.ok(addr.startsWith("addr1"), `mainnet addresses start addr1, got ${addr.slice(0, 12)}`)

  const got = decodeCardanoAddress(addr)
  assert.equal(got.type, 0b0110, "type 6 is payment-only, with no staking part")
  assert.equal(got.network, 1, "mainnet")
  assert.deepEqual(got.payment, paymentCredential(key))
})

test("a testnet address is not a mainnet one", () => {
  // The network tag lives in the header, so an address built for one network
  // is refused by the other rather than silently accepted.
  const test_ = encodeCardanoAddress(key, CardanoNetwork.Testnet)
  assert.ok(test_.startsWith("addr_test1"), test_.slice(0, 12))
  assert.equal(decodeCardanoAddress(test_).network, 0)
  assert.notEqual(test_, encodeCardanoAddress(key, CardanoNetwork.Mainnet))
})

test("the address is not the public key", () => {
  // The bug this replaces: Solana's address IS the key, Cardano's is a hash
  // of it inside an envelope. Any encoder that passes the key through would
  // reproduce exactly the failure that lost the funds.
  const hex = Buffer.from(key).toString("hex")
  const addr = encodeCardanoAddress(key)
  assert.ok(!addr.includes(hex), "the raw key appears in the address")
  assert.notDeepEqual(paymentCredential(key), key)
})

test("a different key gives a different address", () => {
  const other = new Uint8Array(32).fill(0xcd)
  assert.notEqual(encodeCardanoAddress(key), encodeCardanoAddress(other))
})

test("a key that is not 32 bytes is refused", () => {
  // Rather than hashing whatever it was handed and producing a plausible
  // address for a key that does not exist.
  for (const n of [0, 31, 33, 64]) {
    assert.throws(() => encodeCardanoAddress(new Uint8Array(n)), /32 bytes/)
  }
})

test("encode and decode agree", () => {
  const addr = encodeCardanoAddress(key)
  const back = decodeCardanoAddress(addr)
  assert.equal(back.payment.length, 28)
  assert.equal(encodeCardanoAddress(key), addr)
})
