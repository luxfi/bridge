// Package substrate implements the minimal Substrate / Polkadot
// primitives the bridge needs to assemble + broadcast a signed
// extrinsic for the `balances.transfer_keep_alive` call.
//
// Scope:
//   - SCALE codec primitives (compact ints, fixed-width LE ints, byte
//     concatenation). Enough to encode the ExtrinsicPayloadV4 signing
//     payload + a v4 signed extrinsic. Not a general SCALE encoder —
//     we don't reflectively walk arbitrary Go types.
//   - SS58 address encoding from a 32-byte AccountId32. Per-network
//     prefix byte (Polkadot mainnet = 0, generic substrate / Westend
//     testnet = 42, Kusama = 2).
//   - blake2b_256 hash, used both for the substrate signing-payload
//     digest (when > 256 bytes) and AccountId derivation from a
//     compressed ECDSA pubkey.
//
// Out of scope:
//   - Sr25519 / Ed25519 signing — the bridge uses ECDSA via the MPC
//     cluster's CGGMP21 threshold signer.
//   - Full Metadata-driven call resolution — we hard-code the
//     section_index / method_index for balances.transfer_keep_alive
//     per env (configurable, derived from on-chain metadata in
//     production deployments).
//
// Trust model: this is leaf code with no network IO. Tested against
// known-good vectors from the Polkadot JS SDK + substrate runtime.
//
// Brand: Lux Network surface only.
//
// References:
//   - SCALE spec: https://docs.substrate.io/reference/scale-codec/
//   - SS58 spec:  https://github.com/paritytech/substrate/wiki/External-Address-Format-(SS58)
//   - go-substrate-rpc-client (Apache 2.0): types + scale subpackages —
//     primitives ported here without their go-ethereum dep chain.
package substrate

import (
	"encoding/binary"
	"errors"
	"fmt"
	"math/big"

	"golang.org/x/crypto/blake2b"
)

// =============================================================================
// SCALE compact integer encoding
// =============================================================================
//
// Substrate's "compact" integers pack small numbers into a variable-byte
// representation. The bottom 2 bits of the first byte are the mode:
//
//	mode 0 (00): single-byte mode  — value = first_byte >> 2 (0–63)
//	mode 1 (01): two-byte mode     — value = u16(first_byte | next) >> 2 (0–16383)
//	mode 2 (10): four-byte mode    — value = u32(...) >> 2 (0–1073741823)
//	mode 3 (11): big-int mode      — first_byte >> 2 = (numBytes − 4); then numBytes LE
//
// All multi-byte modes are little-endian. The 4 mode prefix variants
// disambiguate the boundary between "short value" and "long value"
// without needing a length header.

// EncodeCompactU64 SCALE-encodes a non-negative integer in compact
// form. Used for Tip, Value (when fitting in u64), and length prefixes.
// Mirrors substrate's Compact<u64> wire shape.
func EncodeCompactU64(v uint64) []byte {
	switch {
	case v < 1<<6:
		return []byte{byte(v << 2)}
	case v < 1<<14:
		out := make([]byte, 2)
		binary.LittleEndian.PutUint16(out, uint16(v<<2)+0x01)
		return out
	case v < 1<<30:
		out := make([]byte, 4)
		binary.LittleEndian.PutUint32(out, uint32(v<<2)+0x02)
		return out
	default:
		// Big-int mode for values >= 2^30. Even u64 values that fit in
		// 8 bytes can land here.
		return EncodeCompactBig(new(big.Int).SetUint64(v))
	}
}

// EncodeCompactBig SCALE-encodes a big.Int in compact form. Required
// for Balance (u128) values that exceed u64, e.g. 1_000 DOT in planck
// = 1e13 — fits in u64 — but 1 KSM in planck would already need bigint
// math, and Polkadot total issuance crosses u64 boundaries. Always
// safe to call; smaller values fall through to the 1/2/4-byte modes.
func EncodeCompactBig(v *big.Int) []byte {
	if v == nil || v.Sign() < 0 {
		panic("substrate: EncodeCompactBig: nil or negative")
	}
	if v.IsUint64() {
		u := v.Uint64()
		if u < 1<<30 {
			return EncodeCompactU64(u)
		}
	}
	// Big-int mode (mode 3). value's minimal LE bytes; prefix byte =
	// ((numBytes - 4) << 2) | 0b11.
	be := v.Bytes() // big-endian; reverse for LE
	le := make([]byte, len(be))
	for i := range be {
		le[i] = be[len(be)-1-i]
	}
	numBytes := len(le)
	if numBytes < 4 || numBytes > 67 {
		// numBytes must be 4..67 (top-six-bits = numBytes - 4, max 63).
		// 4-byte case shouldn't normally hit big-int mode but we guard.
		if numBytes < 4 {
			pad := make([]byte, 4-numBytes)
			le = append(le, pad...)
			numBytes = 4
		} else {
			panic(fmt.Sprintf("substrate: EncodeCompactBig: too large (%d bytes)", numBytes))
		}
	}
	prefix := byte(((numBytes - 4) << 2) | 0b11)
	out := make([]byte, 0, 1+numBytes)
	out = append(out, prefix)
	out = append(out, le...)
	return out
}

// EncodeU32LE encodes a u32 as little-endian fixed 4 bytes. Used for
// SpecVersion + TransactionVersion in ExtrinsicPayloadV4.
func EncodeU32LE(v uint32) []byte {
	out := make([]byte, 4)
	binary.LittleEndian.PutUint32(out, v)
	return out
}

// EncodeU128LE encodes a u128 as little-endian fixed 16 bytes. Used
// for the Balance argument of balances.transfer (NOT compact-encoded
// when passed as a raw u128; the runtime call definition uses
// `Compact<Balance>` so transfer_keep_alive callers should pass via
// EncodeCompactBig instead). Provided for completeness — some pallet
// args are raw u128.
func EncodeU128LE(v *big.Int) []byte {
	if v == nil || v.Sign() < 0 {
		panic("substrate: EncodeU128LE: nil or negative")
	}
	be := v.Bytes()
	if len(be) > 16 {
		panic("substrate: EncodeU128LE: value exceeds u128")
	}
	out := make([]byte, 16)
	for i, b := range be {
		out[16-len(be)+i] = b
	}
	// Reverse to LE.
	for i, j := 0, 15; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return out
}

// EncodeBytes SCALE-encodes a variable-length byte string: compact
// length prefix + raw bytes.
func EncodeBytes(b []byte) []byte {
	prefix := EncodeCompactU64(uint64(len(b)))
	out := make([]byte, 0, len(prefix)+len(b))
	out = append(out, prefix...)
	out = append(out, b...)
	return out
}

// EncodeBytesBare emits raw bytes without a length prefix — used for
// the Method field of ExtrinsicPayloadV4 (the call bytes are already
// SCALE-encoded internally and the payload format requires NO outer
// length prefix on them).
func EncodeBytesBare(b []byte) []byte { return append([]byte(nil), b...) }

// =============================================================================
// AccountId32 derivation
// =============================================================================
//
// Substrate's canonical AccountId32 is a 32-byte identifier used by
// every relay-chain pallet. Derivation depends on the underlying
// signature scheme:
//
//   - sr25519 / ed25519: AccountId32 = public_key (raw 32 bytes)
//   - ECDSA:             AccountId32 = blake2_256(compressed_pubkey)
//
// The ECDSA case is the one we use — the MPC cluster outputs a 33-byte
// compressed secp256k1 pubkey, and substrate hashes it to a 32-byte
// AccountId. This matches `sp_io::hashing::blake2_256(compressed)`
// in pallet-balances + the runtime's ECDSA AccountId32 conversion.
//
// Counter-example: Frontier (Moonbeam, Astar Shiden) uses an
// ETH-style 20-byte H160 derived from `keccak256(uncompressed[1:])[12:]`.
// That's NOT used here — the bridge targets relay-chain Polkadot
// transfers, which want AccountId32.

// AccountIDFromECDSAPub returns the 32-byte AccountId32 derived from
// a 33-byte compressed secp256k1 public key. Returns an error if the
// input length is wrong.
func AccountIDFromECDSAPub(compressedPub []byte) ([32]byte, error) {
	var out [32]byte
	if len(compressedPub) != 33 {
		return out, fmt.Errorf("substrate: AccountIDFromECDSAPub: want 33-byte compressed pubkey, got %d", len(compressedPub))
	}
	h, err := blake2b.New256(nil)
	if err != nil {
		return out, fmt.Errorf("substrate: blake2b: %w", err)
	}
	_, _ = h.Write(compressedPub)
	copy(out[:], h.Sum(nil))
	return out, nil
}

// Blake2_256 computes the 32-byte blake2b-256 hash of data. Exposed
// for the extrinsic payload hashing rule (>256 bytes → hash before
// signing).
func Blake2_256(data []byte) [32]byte {
	h, _ := blake2b.New256(nil)
	_, _ = h.Write(data)
	var out [32]byte
	copy(out[:], h.Sum(nil))
	return out
}

// =============================================================================
// SS58 encoding
// =============================================================================
//
// SS58 is base58 over an account_id payload prefixed with a network
// identifier byte (or two-byte sequence for prefixes >= 64) and
// suffixed with a 2-byte checksum.
//
// Encoded form:
//   ss58prefix || account_id || checksum[:2]
//
// where checksum = blake2b_512("SS58PRE" || ss58prefix || account_id)[:2].
//
// Single-byte prefix range: 0–63 (Polkadot=0, Kusama=2, generic
// substrate / Westend testnet=42). Two-byte prefixes (64–16383) are
// rare and not implemented here.

// SS58Prefix selects the network for SS58 encoding. Single-byte only.
type SS58Prefix uint8

const (
	// SS58PolkadotMainnet is the canonical Polkadot relay-chain prefix.
	SS58PolkadotMainnet SS58Prefix = 0
	// SS58Kusama is the canonical Kusama relay-chain prefix.
	SS58Kusama SS58Prefix = 2
	// SS58Generic is the generic substrate / Westend testnet prefix.
	// Any chain without a dedicated registry entry uses 42.
	SS58Generic SS58Prefix = 42
)

// ss58PreContext is the domain-separator string substrate prepends
// before computing the checksum hash. Exactly 7 ASCII bytes.
var ss58PreContext = []byte("SS58PRE")

// SS58Encode formats account_id with the given prefix into an SS58
// string. account_id must be exactly 32 bytes (AccountId32).
func SS58Encode(accountID [32]byte, prefix SS58Prefix) (string, error) {
	if prefix >= 64 {
		return "", fmt.Errorf("substrate: SS58Encode: prefix %d not supported (single-byte 0..63)", prefix)
	}
	// payload = prefix_byte || account_id  (no two-byte branch).
	payload := make([]byte, 0, 1+32)
	payload = append(payload, byte(prefix))
	payload = append(payload, accountID[:]...)

	// Checksum = blake2b_512("SS58PRE" || payload)[:2]
	h, _ := blake2b.New512(nil)
	_, _ = h.Write(ss58PreContext)
	_, _ = h.Write(payload)
	cksum := h.Sum(nil)[:2]

	// Concatenate and base58-encode.
	full := append(payload, cksum...)
	return base58Encode(full), nil
}

// SS58Decode parses an SS58-encoded string back into (account_id, prefix).
// Verifies the checksum. Useful for SDK input validation + tests.
func SS58Decode(s string) (accountID [32]byte, prefix SS58Prefix, err error) {
	decoded, derr := base58Decode(s)
	if derr != nil {
		err = fmt.Errorf("substrate: SS58Decode: base58 decode: %w", derr)
		return
	}
	if len(decoded) != 1+32+2 {
		err = fmt.Errorf("substrate: SS58Decode: expected 35 bytes (prefix+account+checksum), got %d", len(decoded))
		return
	}
	prefix = SS58Prefix(decoded[0])
	copy(accountID[:], decoded[1:33])
	// Recompute and compare checksum.
	h, _ := blake2b.New512(nil)
	_, _ = h.Write(ss58PreContext)
	_, _ = h.Write(decoded[:33])
	want := h.Sum(nil)[:2]
	if want[0] != decoded[33] || want[1] != decoded[34] {
		err = errors.New("substrate: SS58Decode: checksum mismatch")
		return
	}
	return
}

// =============================================================================
// Base58 codec (RFC 0009-style, Bitcoin alphabet)
// =============================================================================
//
// Same alphabet substrate uses (Bitcoin's). Standalone — does not
// pull in btcutil to keep the dep graph minimal.

const base58Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

// base58Encode is a straightforward big-int division by 58 with
// leading-zero preservation. Output length differs from input length
// (base 58 vs base 256) — caller doesn't pre-allocate exact size.
func base58Encode(b []byte) string {
	// Count leading zeros — they become leading '1's in the output.
	zeros := 0
	for zeros < len(b) && b[zeros] == 0 {
		zeros++
	}
	// Convert to big-int.
	n := new(big.Int).SetBytes(b)
	div := big.NewInt(58)
	rem := new(big.Int)
	var out []byte
	for n.Sign() > 0 {
		n.DivMod(n, div, rem)
		out = append(out, base58Alphabet[rem.Int64()])
	}
	// Append leading '1's for zero bytes.
	for i := 0; i < zeros; i++ {
		out = append(out, base58Alphabet[0])
	}
	// Reverse — we built lsb-first.
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return string(out)
}

// base58Decode inverts base58Encode. Returns an error on chars outside
// the alphabet.
func base58Decode(s string) ([]byte, error) {
	// Count leading '1's — they become leading zero bytes.
	zeros := 0
	for zeros < len(s) && s[zeros] == base58Alphabet[0] {
		zeros++
	}
	// Convert to big-int.
	n := big.NewInt(0)
	div := big.NewInt(58)
	for i := 0; i < len(s); i++ {
		idx := bytesIndex(base58Alphabet, s[i])
		if idx < 0 {
			return nil, fmt.Errorf("base58: invalid char %q at offset %d", s[i], i)
		}
		n.Mul(n, div)
		n.Add(n, big.NewInt(int64(idx)))
	}
	b := n.Bytes()
	out := make([]byte, 0, zeros+len(b))
	for i := 0; i < zeros; i++ {
		out = append(out, 0)
	}
	out = append(out, b...)
	return out, nil
}

// bytesIndex returns the index of c in s, or -1.
func bytesIndex(s string, c byte) int {
	for i := 0; i < len(s); i++ {
		if s[i] == c {
			return i
		}
	}
	return -1
}
