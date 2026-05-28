package substrate

import (
	"bytes"
	"encoding/hex"
	"fmt"
	"math/big"
	"strings"
)

// =============================================================================
// Call — section + method index + args
// =============================================================================
//
// A substrate Call is a 2-byte CallIndex (pallet section, method) followed
// by the SCALE-encoded args. Resolving the (section, method) tuple
// generally requires a Metadata query against the chain, but for
// well-known pallets the indices are stable across runtime upgrades —
// pallet authors avoid changing them once published.
//
// For Polkadot mainnet's balances pallet (per the Polkadot Wiki +
// canonical runtime sources), the well-known indices used here:
//
//	balances pallet section index:  5  (some runtimes use 6/4 — caller passes the index)
//	method index transfer_keep_alive: 3
//
// Bridge config supplies the indices explicitly per network so a
// runtime-upgrade that bumps the section can be handled by re-emitting
// the YAML, not by code change.

// CallIndex pairs a pallet (section) index with a method index inside
// that pallet. SCALE-encoded as `section_byte || method_byte`.
type CallIndex struct {
	Section uint8
	Method  uint8
}

// Encode returns the 2-byte SCALE encoding (section || method).
func (c CallIndex) Encode() []byte { return []byte{c.Section, c.Method} }

// EncodeBalancesTransferKeepAlive returns the SCALE-encoded Call bytes
// for `balances.transfer_keep_alive(dest: MultiAddress::Id(AccountId32), value: Compact<Balance>)`.
//
// dest is the recipient AccountId32. valuePlanck is the amount in
// the chain's smallest unit (planck for Polkadot, 1 DOT = 10^10 planck).
// callIdx pins the runtime-version-specific (section, method) tuple.
//
// Layout:
//
//	section_byte || method_byte                                — call header (2B)
//	MultiAddress::Id tag (0x00) || account_id (32B)             — dest (33B)
//	compact-encoded value                                       — Compact<Balance>
func EncodeBalancesTransferKeepAlive(
	callIdx CallIndex, dest [32]byte, valuePlanck *big.Int,
) []byte {
	out := make([]byte, 0, 2+33+9)
	out = append(out, callIdx.Encode()...)
	// dest = MultiAddress::Id(AccountId32). Enum discriminant 0x00.
	out = append(out, 0x00)
	out = append(out, dest[:]...)
	// value = Compact<Balance>. Always compact-encoded — even if it
	// fits in u64, the runtime call type is Compact<u128>.
	out = append(out, EncodeCompactBig(valuePlanck)...)
	return out
}

// =============================================================================
// Era — extrinsic mortality
// =============================================================================
//
// Era controls how long an extrinsic is valid for inclusion. Immortal
// (single 0x00 byte) is the simplest and what we use — once signed,
// the extrinsic remains valid until reorg drops it. Mortal eras are
// 2 bytes encoding period + phase but require knowing the latest
// block hash to anchor the phase.

// EraImmortal is the canonical immortal-era SCALE encoding.
var EraImmortal = []byte{0x00}

// =============================================================================
// ExtrinsicPayloadV4 — what the signer signs
// =============================================================================
//
// The substrate signing payload is a fixed sequence of fields:
//
//	bytes_bare(method)         — the SCALE-encoded Call, no length prefix
//	era                         — 1 or 2 bytes (immortal = 0x00)
//	compact(nonce)              — Compact<u32>
//	compact(tip)                — Compact<u128>
//	u32_le(spec_version)        — chain runtime spec version
//	u32_le(transaction_version) — chain runtime transaction version
//	h256(genesis_hash)          — 32 bytes
//	h256(block_hash)            — 32 bytes; equals genesis_hash for immortal eras
//
// If the resulting payload exceeds 256 bytes, substrate signs the
// blake2_256 hash of the payload INSTEAD of the raw payload. This is
// a security/efficiency split — fixed-size messages on the wire for
// large transactions, exact messages for short ones.

// PayloadOptions wires up the per-chain parameters needed to build
// the signing payload. spec_version + transaction_version come from
// `state_getRuntimeVersion`; genesis_hash from `chain_getBlockHash(0)`.
type PayloadOptions struct {
	// Nonce is the signer's transaction count. Query via
	// `system_accountNextIndex`.
	Nonce uint32
	// Tip is the fee tip in the chain's smallest unit. 0 = no tip,
	// standard validator behaviour. SCALE-encoded as Compact<u128>.
	Tip *big.Int
	// SpecVersion is the runtime spec version. From
	// `state_getRuntimeVersion`.
	SpecVersion uint32
	// TransactionVersion is the transaction format version. Also from
	// state_getRuntimeVersion. Important — different runtimes ship
	// distinct values, and signing-payload checks reject mismatches.
	TransactionVersion uint32
	// GenesisHash is the 32-byte chain genesis block hash. From
	// `chain_getBlockHash(0)`.
	GenesisHash [32]byte
	// BlockHash is the block at which the era anchors. For immortal
	// extrinsics, set this to GenesisHash. Required because the runtime
	// rejects payloads where the block hash doesn't match the era window.
	BlockHash [32]byte
}

// BuildSigningPayload assembles the bytes the signer must produce a
// signature over. If the payload exceeds 256 bytes, the returned
// `payloadOrHash` is blake2_256(payload); otherwise it's the raw
// payload bytes. `rawPayload` is always the un-hashed concatenation —
// callers may want it for debug logs / tests.
func BuildSigningPayload(callBytes []byte, opts PayloadOptions) (payloadOrHash, rawPayload []byte) {
	if opts.Tip == nil {
		opts.Tip = big.NewInt(0)
	}
	var buf bytes.Buffer
	buf.Write(EncodeBytesBare(callBytes))
	buf.Write(EraImmortal)
	buf.Write(EncodeCompactU64(uint64(opts.Nonce)))
	buf.Write(EncodeCompactBig(opts.Tip))
	buf.Write(EncodeU32LE(opts.SpecVersion))
	buf.Write(EncodeU32LE(opts.TransactionVersion))
	buf.Write(opts.GenesisHash[:])
	buf.Write(opts.BlockHash[:])
	rawPayload = buf.Bytes()
	if len(rawPayload) > 256 {
		h := Blake2_256(rawPayload)
		return h[:], rawPayload
	}
	return rawPayload, rawPayload
}

// =============================================================================
// SignedExtrinsic assembly — v4 wire shape
// =============================================================================
//
// A signed extrinsic on the wire is a SCALE-encoded byte string with
// a compact length prefix:
//
//	compact_length || extrinsic_body
//
// The extrinsic_body is itself the concatenation of:
//
//	version_byte                — 0x84 = (0x80 signed-bit | 0x04 V4)
//	multi_address(signer)       — 0x00 || account_id (33 B for ::Id)
//	multi_signature(scheme,sig) — 0x02 || sig (66 B for ECDSA r||s||v)
//	era                         — 1 or 2 bytes (immortal = 0x00)
//	compact(nonce)              — Compact<u32>
//	compact(tip)                — Compact<u128>
//	method                      — SCALE-encoded Call (raw bytes)
//
// The signer field carries the *signer's* identity, not the chain's
// runtime metadata — so the bridge can construct it client-side
// without an on-chain lookup.

// MultiSignatureScheme tags which signature scheme the bytes that
// follow it use. The values are SCALE enum discriminants matching the
// substrate `MultiSignature` enum in `sp_runtime::MultiSignature`.
type MultiSignatureScheme uint8

const (
	// MultiSigEd25519 — bytes are a 64-byte Ed25519 signature.
	MultiSigEd25519 MultiSignatureScheme = 0
	// MultiSigSr25519 — bytes are a 64-byte Sr25519 signature.
	MultiSigSr25519 MultiSignatureScheme = 1
	// MultiSigEcdsa — bytes are a 65-byte ECDSA (r || s || v) signature
	// over secp256k1.
	MultiSigEcdsa MultiSignatureScheme = 2
)

// signedExtrinsicVersion is the canonical v4 signed prefix:
// the high bit (0x80) marks "signed", low nibble holds the version.
const signedExtrinsicVersion byte = 0x84

// AssembleSignedExtrinsic builds the wire-ready bytes for a v4 signed
// extrinsic.
//
//	signerAccountID — 32-byte AccountId32 of the signer
//	sigScheme       — MultiSigEcdsa for our path
//	signature       — 65 bytes for ECDSA (r || s || v)
//	callBytes       — SCALE-encoded Call (from EncodeBalances...)
//	era,nonce,tip   — same values used to build the signing payload
//
// Returns the SCALE-prefixed (compact length || body) bytes ready to
// pass to `author_submitExtrinsic` as 0x-prefixed hex.
func AssembleSignedExtrinsic(
	signerAccountID [32]byte,
	sigScheme MultiSignatureScheme,
	signature []byte,
	callBytes []byte,
	nonce uint32,
	tip *big.Int,
) ([]byte, error) {
	if err := validateSignatureSize(sigScheme, signature); err != nil {
		return nil, err
	}
	if tip == nil {
		tip = big.NewInt(0)
	}
	var body bytes.Buffer
	// 1. version byte
	body.WriteByte(signedExtrinsicVersion)
	// 2. signer — MultiAddress::Id(AccountId32). Tag 0x00 + 32 B.
	body.WriteByte(0x00)
	body.Write(signerAccountID[:])
	// 3. signature — MultiSignature::Scheme(<sig>). Tag = scheme byte.
	body.WriteByte(byte(sigScheme))
	body.Write(signature)
	// 4. era — immortal
	body.Write(EraImmortal)
	// 5. nonce — Compact<u32>
	body.Write(EncodeCompactU64(uint64(nonce)))
	// 6. tip — Compact<u128>
	body.Write(EncodeCompactBig(tip))
	// 7. method — raw SCALE-encoded Call
	body.Write(callBytes)

	// Length-prefix the whole body — this is what gets hex-encoded
	// onto the wire.
	out := append(EncodeCompactU64(uint64(body.Len())), body.Bytes()...)
	return out, nil
}

// validateSignatureSize refuses a signature length that doesn't match
// the declared scheme. Surfaces wire-format bugs early.
func validateSignatureSize(scheme MultiSignatureScheme, sig []byte) error {
	switch scheme {
	case MultiSigEd25519, MultiSigSr25519:
		if len(sig) != 64 {
			return fmt.Errorf("substrate: %d sig must be 64 bytes, got %d", scheme, len(sig))
		}
	case MultiSigEcdsa:
		if len(sig) != 65 {
			return fmt.Errorf("substrate: ECDSA sig must be 65 bytes (r||s||v), got %d", len(sig))
		}
	default:
		return fmt.Errorf("substrate: unknown signature scheme %d", scheme)
	}
	return nil
}

// =============================================================================
// Extrinsic hash
// =============================================================================
//
// The canonical extrinsic hash substrate's RPC + block explorers
// reference is blake2_256 of the encoded body (NOT the length-prefixed
// wire form). When `author_submitExtrinsic` returns a hash, this is
// what it returns.

// ExtrinsicHash computes the canonical 0x-prefixed extrinsic hash
// from the wire-ready bytes (output of AssembleSignedExtrinsic).
func ExtrinsicHash(wireBytes []byte) string {
	// Strip the leading compact length prefix; hash only the body.
	body := stripCompactPrefix(wireBytes)
	h := Blake2_256(body)
	return "0x" + hex.EncodeToString(h[:])
}

// stripCompactPrefix peels off the leading compact length prefix
// produced by AssembleSignedExtrinsic. Robust to any compact mode the
// caller might land in. Returns the body bytes (or the original input
// if no plausible prefix is detected — wire bugs surface elsewhere).
func stripCompactPrefix(b []byte) []byte {
	if len(b) == 0 {
		return b
	}
	mode := b[0] & 0b11
	switch mode {
	case 0:
		return b[1:]
	case 1:
		return b[2:]
	case 2:
		return b[4:]
	case 3:
		numBytes := int(b[0]>>2) + 4
		if 1+numBytes > len(b) {
			return b
		}
		return b[1+numBytes:]
	}
	return b
}

// =============================================================================
// Utility — hex encoding of the wire bytes
// =============================================================================

// HexEncode returns "0x"+hex(b). Convenience for the broadcast layer
// where the substrate RPC `author_submitExtrinsic` takes a single
// 0x-prefixed hex string parameter.
func HexEncode(b []byte) string { return "0x" + hex.EncodeToString(b) }

// HexDecode parses an optionally-0x-prefixed hex string. Surfaces a
// clear error on malformed input.
func HexDecode(s string) ([]byte, error) {
	s = strings.TrimPrefix(strings.TrimPrefix(s, "0x"), "0X")
	return hex.DecodeString(s)
}
