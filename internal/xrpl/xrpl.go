// Package xrpl is the bridge's XRP Ledger primitives: address derivation
// from a compressed-secp256k1 pubkey, canonical signing-payload assembly
// for a Payment transaction (STX-prefixed SHA-512Half), ECDSA DER
// encoding with low-s normalization, and final signed-tx blob + tx-hash
// computation.
//
// The bridge does NOT hold any XRPL secret material — the MPC cluster
// signs the canonical 32-byte digest produced here and returns (r, s).
// This package then re-encodes the signature in ASN.1 DER (the wire
// format XRPL expects in `TxnSignature`), attaches it to the unsigned
// transaction, and serializes the final binary blob for broadcast.
//
// Why a thin wrapper around rubblelabs/ripple: that library has a
// complete, well-tested binary codec covering every field type XRPL
// has shipped. Re-implementing the codec from scratch would be 1500+
// lines of error-prone serialization for no gain. We use it for codec
// + address-encoding helpers and keep our own signing flow on top.
//
// Scope:
//   - Payment transaction only (native XRP-drops Amount, no IOU paths).
//     TrustSet / OfferCreate / etc. would be additional PreSign variants
//     in this same package using the same MPC entry-point — out of scope
//     for the bridge's initial XRP support.
//   - secp256k1 signatures only. XRPL also supports ed25519 (key-prefix
//     0xED), but the MPC cluster's threshold-ECDSA primitive only emits
//     secp256k1 signatures, so the bridge sticks to ECDSA addresses.
package xrpl

import (
	"crypto/sha256"
	"crypto/sha512"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"

	rcrypto "github.com/rubblelabs/ripple/crypto"
	rippledata "github.com/rubblelabs/ripple/data"

	"golang.org/x/crypto/ripemd160"
)

// =============================================================================
// secp256k1 ECDSA — low-s normalization + DER encoding
// =============================================================================

// secp256k1N is the order of the secp256k1 base point. Used to
// normalize signatures to canonical low-s form (XRPL rejects high-s
// signatures as non-canonical per `tfFullyCanonicalSig`).
var secp256k1N, _ = new(big.Int).SetString(
	"fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141", 16)

// secp256k1HalfN is N/2 — the threshold above which s is "high" and
// must be replaced with N - s for canonical encoding.
var secp256k1HalfN = new(big.Int).Rsh(secp256k1N, 1)

// CanonicalizeS replaces s with (N - s) when s > N/2 so the resulting
// signature is in canonical low-s form. Returns the canonical s.
// Idempotent — passing an already-low-s value returns the same value.
func CanonicalizeS(s *big.Int) *big.Int {
	if s == nil {
		return nil
	}
	if s.Cmp(secp256k1HalfN) > 0 {
		return new(big.Int).Sub(secp256k1N, s)
	}
	return new(big.Int).Set(s)
}

// EncodeDERSignature encodes (r, s) as an ASN.1 DER ECDSA signature:
//
//	0x30 || len || 0x02 || rLen || r || 0x02 || sLen || s
//
// The r and s integers are encoded as minimal big-endian bytes, with
// a leading 0x00 prepended whenever the high bit would otherwise make
// the value look negative under ASN.1 INTEGER's signed interpretation.
// This is the canonical form `rippled` expects in `TxnSignature`.
//
// s is canonicalized to low-s automatically.
func EncodeDERSignature(r, s *big.Int) ([]byte, error) {
	if r == nil || s == nil {
		return nil, errors.New("xrpl: EncodeDERSignature: r and s required")
	}
	if r.Sign() <= 0 || s.Sign() <= 0 {
		return nil, fmt.Errorf("xrpl: EncodeDERSignature: r and s must be positive (got r.Sign()=%d s.Sign()=%d)", r.Sign(), s.Sign())
	}
	if r.Cmp(secp256k1N) >= 0 || s.Cmp(secp256k1N) >= 0 {
		return nil, errors.New("xrpl: EncodeDERSignature: r and s must be < N")
	}
	canonS := CanonicalizeS(s)

	rBytes := minimalDERInt(r)
	sBytes := minimalDERInt(canonS)

	// SEQUENCE: 0x30, len, (INTEGER r), (INTEGER s)
	inner := make([]byte, 0, 4+len(rBytes)+len(sBytes))
	inner = append(inner, 0x02, byte(len(rBytes)))
	inner = append(inner, rBytes...)
	inner = append(inner, 0x02, byte(len(sBytes)))
	inner = append(inner, sBytes...)
	out := make([]byte, 0, 2+len(inner))
	out = append(out, 0x30, byte(len(inner)))
	out = append(out, inner...)
	return out, nil
}

// minimalDERInt converts a big.Int to its ASN.1 DER INTEGER body
// (without the leading 0x02 || length tag). Adds a leading 0x00 when
// the high bit of the first byte is set (DER signed encoding rule).
func minimalDERInt(n *big.Int) []byte {
	b := n.Bytes()
	if len(b) > 0 && b[0]&0x80 != 0 {
		return append([]byte{0x00}, b...)
	}
	return b
}

// =============================================================================
// Address derivation from compressed secp256k1 pubkey
// =============================================================================

// AddressFromPubKey derives the XRPL r-address (base58check, "r..." prefix)
// from a 33-byte compressed-secp256k1 public key.
//
//	accountID  = RIPEMD160(SHA256(pubkey))
//	address    = base58check(0x00 || accountID, xrp_alphabet)
//
// The 0x00 prefix byte and the XRPL-specific base58 alphabet are what
// distinguish r-addresses from Bitcoin addresses (which share the same
// hash function and similar checksum scheme).
//
// The input must be a 33-byte compressed point (starts with 0x02 or
// 0x03 — secp256k1 compressed encoding); a 65-byte uncompressed key
// or any other length is rejected.
func AddressFromPubKey(pubkey []byte) (string, error) {
	if len(pubkey) != 33 {
		return "", fmt.Errorf("xrpl: AddressFromPubKey: want 33-byte compressed pubkey, got %d", len(pubkey))
	}
	if pubkey[0] != 0x02 && pubkey[0] != 0x03 {
		return "", fmt.Errorf("xrpl: AddressFromPubKey: not a compressed-secp256k1 key (leading byte 0x%02x; want 0x02 or 0x03)", pubkey[0])
	}
	accountID := sha256ThenRipemd160(pubkey)
	h, err := rcrypto.NewAccountId(accountID)
	if err != nil {
		return "", fmt.Errorf("xrpl: derive r-address: %w", err)
	}
	return h.String(), nil
}

// AccountIDFromPubKey returns the 20-byte XRPL AccountID — the
// RIPEMD160(SHA256(pubkey)) digest, before base58check encoding. Useful
// when callers want to feed the bytes directly into a transaction's
// Account field without round-tripping through the string form.
func AccountIDFromPubKey(pubkey []byte) ([]byte, error) {
	if len(pubkey) != 33 {
		return nil, fmt.Errorf("xrpl: AccountIDFromPubKey: want 33-byte compressed pubkey, got %d", len(pubkey))
	}
	if pubkey[0] != 0x02 && pubkey[0] != 0x03 {
		return nil, fmt.Errorf("xrpl: AccountIDFromPubKey: not compressed-secp256k1 (leading byte 0x%02x)", pubkey[0])
	}
	return sha256ThenRipemd160(pubkey), nil
}

// sha256ThenRipemd160 is the standard "double-hash" XRPL uses for
// account IDs: SHA-256 first, then RIPEMD-160 over the SHA-256 digest.
// Bitcoin uses the same hashing pipeline; the XRPL difference is the
// version-byte prefix (0x00) and the base58 alphabet, both handled
// by rcrypto.NewAccountId / Hash.String().
func sha256ThenRipemd160(b []byte) []byte {
	s := sha256.Sum256(b)
	h := ripemd160.New()
	_, _ = h.Write(s[:])
	return h.Sum(nil)
}

// =============================================================================
// Payment transaction — signing payload + finalization
// =============================================================================

// HashPrefixTransactionSign is the 4-byte prefix XRPL prepends to a
// transaction's binary body before SHA-512Half hashing for signing.
// Spelled "STX\0" in ASCII (0x53545800). See `rippled/src/ripple/protocol/HashPrefix.h`.
const HashPrefixTransactionSign uint32 = 0x53545800

// HashPrefixTransactionID is the 4-byte prefix XRPL prepends to the
// FULL signed binary body before SHA-512Half hashing for the tx hash.
// "TXN\0" → 0x54584E00.
const HashPrefixTransactionID uint32 = 0x54584E00

// XRPLBaseFeeDrops is the protocol-floor fee for a Payment transaction
// in drops (10 drops = 1e-5 XRP). Operators set higher fees during
// busy ledgers; this is the floor every Payment must pay.
const XRPLBaseFeeDrops int64 = 10

// XRPLBaseReserveDrops is the minimum XRP an account must hold to
// remain alive on the ledger. Currently 10 XRP (10,000,000 drops).
// Release wallets must hold this MUCH more than the per-payment
// amount to keep their AccountRoot from being deleted.
const XRPLBaseReserveDrops int64 = 10_000_000

// DropsPerXRP is 1e6. One XRP = 1,000,000 drops.
const DropsPerXRP int64 = 1_000_000

// CanonicalSigFlag is the recommended Flags bit for every signed
// transaction. Forces strict low-s + low-r canonicalization on the
// server side and rejects malleable signatures.
const CanonicalSigFlag uint32 = 0x80000000

// PaymentUnsigned is the bridge's intent of a native-XRP Payment
// transaction, in human-friendly form. PreSign converts this into the
// canonical signing payload + binary body the MPC quorum signs.
type PaymentUnsigned struct {
	// Account is the sender's r-address (the release-wallet address
	// derived from the MPC pubkey).
	Account string
	// Destination is the recipient r-address.
	Destination string
	// AmountDrops is the value transferred in drops (1 XRP = 1e6 drops).
	// Must be positive and within int64 range — XRPL has no Payment
	// larger than 100B XRP.
	AmountDrops int64
	// FeeDrops is the transaction fee in drops. Pre-XRPL-amendments
	// minimum is 10 drops; the broadcaster bumps this on retry if
	// the load-factor demands it.
	FeeDrops int64
	// Sequence is the next sequence number the Account expects.
	// Source it from rippled's account_info before calling PreSign.
	Sequence uint32
	// LastLedgerSequence bounds tx validity to within ~30 ledgers
	// (≈2 minutes). When omitted the tx never expires — operators
	// should always set this. Zero ⇒ unset.
	LastLedgerSequence uint32
	// SigningPubKey is the 33-byte compressed-secp256k1 pubkey of the
	// signing wallet. XRPL embeds this in the wire payload so any
	// observer can verify the signature against the account.
	SigningPubKey []byte
	// Flags is the optional Flags field (e.g. tfFullyCanonicalSig).
	Flags uint32
	// DestinationTag is the optional 32-bit memo XRP exchanges + custodial
	// services use to route funds to a sub-account. nil ⇒ unset.
	DestinationTag *uint32
}

// SignCtx is the opaque context PreSign returns and Finalize requires.
// It carries the original tx + signing pubkey, so Finalize can produce
// a bit-identical wire body once the MPC signs the digest.
//
// Callers should treat this as a single round-trip handle and not
// inspect its fields.
type SignCtx struct {
	Payment       *rippledata.Payment
	SigningPubKey []byte
}

// PreSign builds a Payment transaction's signing payload and returns
// both the 32-byte digest the MPC quorum must sign (the canonical
// SHA-512Half of `0x53545800 || serialized_body`) and a SignCtx the
// caller will hand back to Finalize once the signature is in.
//
// Mechanics:
//  1. Construct a rubblelabs Payment struct from the bridge's
//     PaymentUnsigned (Account, Destination, AmountDrops, Fee,
//     Sequence, etc.). The library handles every field-id, type-byte,
//     and length-prefix detail of the XRPL binary codec.
//  2. Populate SigningPubKey on the transaction. XRPL requires
//     the pubkey to be on the wire so verifiers can recompute the
//     digest and validate the signature.
//  3. Call rippledata.SigningHash(tx) — emits (hash, msg) where
//     msg is the binary body WITHOUT the prefix and hash is the
//     SHA-512Half of `prefix || msg`. The bridge returns hash as
//     the "signing payload" the MPC signs.
//
// Errors are returned for malformed inputs (bad addresses, negative
// amounts, missing pubkey).
func PreSign(u PaymentUnsigned) ([]byte, *SignCtx, error) {
	if err := validatePayment(u); err != nil {
		return nil, nil, err
	}

	from, err := rippledata.NewAccountFromAddress(u.Account)
	if err != nil {
		return nil, nil, fmt.Errorf("xrpl: parse Account %q: %w", u.Account, err)
	}
	to, err := rippledata.NewAccountFromAddress(u.Destination)
	if err != nil {
		return nil, nil, fmt.Errorf("xrpl: parse Destination %q: %w", u.Destination, err)
	}

	amount, err := rippledata.NewAmount(fmt.Sprintf("%d", u.AmountDrops))
	if err != nil {
		return nil, nil, fmt.Errorf("xrpl: build Amount(%d drops): %w", u.AmountDrops, err)
	}
	fee, err := rippledata.NewValue(fmt.Sprintf("%d", u.FeeDrops), true)
	if err != nil {
		return nil, nil, fmt.Errorf("xrpl: build Fee(%d drops): %w", u.FeeDrops, err)
	}

	tx := &rippledata.Payment{
		TxBase: rippledata.TxBase{
			TransactionType: rippledata.PAYMENT,
			Account:         *from,
			Sequence:        u.Sequence,
			Fee:             *fee,
		},
		Destination: *to,
		Amount:      *amount,
	}
	if u.LastLedgerSequence != 0 {
		v := u.LastLedgerSequence
		tx.LastLedgerSequence = &v
	}
	if u.Flags != 0 {
		f := rippledata.TransactionFlag(u.Flags)
		tx.Flags = &f
	}
	if u.DestinationTag != nil {
		v := *u.DestinationTag
		tx.DestinationTag = &v
	}

	// Embed the signing pubkey on the wire. XRPL verifiers reconstruct
	// the digest from the binary body (which includes this field) and
	// check the signature against this pubkey.
	tx.SigningPubKey = new(rippledata.PublicKey)
	copy(tx.SigningPubKey[:], u.SigningPubKey)

	// SigningHash returns (hash, msg, err) where hash = SHA-512Half of
	// (prefix || msg). That's exactly the message the MPC must sign.
	hash, _, err := rippledata.SigningHash(tx)
	if err != nil {
		return nil, nil, fmt.Errorf("xrpl: compute SigningHash: %w", err)
	}

	pubCopy := make([]byte, len(u.SigningPubKey))
	copy(pubCopy, u.SigningPubKey)
	return hash.Bytes(), &SignCtx{Payment: tx, SigningPubKey: pubCopy}, nil
}

// Finalize attaches a DER-encoded ECDSA signature to the unsigned
// transaction carried in ctx and returns:
//   - signedBlob: the full wire-format binary body (no STX prefix)
//     that goes into `submit`'s tx_blob param as hex.
//   - txHash:     the canonical XRPL transaction hash (SHA-512Half of
//     `0x54584E00 || signedBlob`), uppercase hex per XRPL
//     convention. This is what the rippled `submit` reply echoes back
//     in `result.tx_json.hash` and what users see in explorers.
//
// signatureDER must be the DER-encoded (r, s) signature — produced by
// EncodeDERSignature(r, s) after the MPC returns. Low-s normalization
// is the caller's responsibility (EncodeDERSignature does it).
func Finalize(signatureDER []byte, ctx *SignCtx) ([]byte, string, error) {
	if ctx == nil || ctx.Payment == nil {
		return nil, "", errors.New("xrpl: Finalize: nil SignCtx")
	}
	if len(signatureDER) == 0 {
		return nil, "", errors.New("xrpl: Finalize: empty DER signature")
	}
	// Attach the DER signature to TxnSignature.
	sig := rippledata.VariableLength(append([]byte(nil), signatureDER...))
	ctx.Payment.TxnSignature = &sig

	// Raw(tx) returns:
	//   hash = SHA-512Half(HP_TRANSACTION_ID || encoded_tx_body)
	//   raw  = the encoded tx body itself (no prefix)
	// — exactly what we need.
	hash, raw, err := rippledata.Raw(ctx.Payment)
	if err != nil {
		return nil, "", fmt.Errorf("xrpl: Finalize: encode signed tx: %w", err)
	}
	return raw, hex.EncodeToString(hash.Bytes()), nil
}

// =============================================================================
// Helpers
// =============================================================================

// SHA512Half computes the canonical XRPL hash: SHA-512 of the prefix
// + data, truncated to the first 32 bytes. Exposed so tests can
// independently verify PreSign's digest computation matches the spec.
func SHA512Half(prefix uint32, data []byte) []byte {
	h := sha512.New()
	var p [4]byte
	p[0] = byte(prefix >> 24)
	p[1] = byte(prefix >> 16)
	p[2] = byte(prefix >> 8)
	p[3] = byte(prefix)
	_, _ = h.Write(p[:])
	_, _ = h.Write(data)
	sum := h.Sum(nil)
	out := make([]byte, 32)
	copy(out, sum[:32])
	return out
}

func validatePayment(u PaymentUnsigned) error {
	if u.Account == "" {
		return errors.New("xrpl: PaymentUnsigned.Account required")
	}
	if u.Destination == "" {
		return errors.New("xrpl: PaymentUnsigned.Destination required")
	}
	if u.AmountDrops <= 0 {
		return fmt.Errorf("xrpl: PaymentUnsigned.AmountDrops must be > 0 (got %d)", u.AmountDrops)
	}
	if u.FeeDrops <= 0 {
		return fmt.Errorf("xrpl: PaymentUnsigned.FeeDrops must be > 0 (got %d)", u.FeeDrops)
	}
	if len(u.SigningPubKey) != 33 {
		return fmt.Errorf("xrpl: PaymentUnsigned.SigningPubKey must be 33 bytes (compressed secp256k1); got %d", len(u.SigningPubKey))
	}
	if u.SigningPubKey[0] != 0x02 && u.SigningPubKey[0] != 0x03 {
		return fmt.Errorf("xrpl: PaymentUnsigned.SigningPubKey not compressed (leading byte 0x%02x)", u.SigningPubKey[0])
	}
	return nil
}
