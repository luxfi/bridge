// Package xrp implements just enough of XRPL's canonical binary
// transaction codec to build, sign, and submit a single transaction
// type: Payment with native XRP and ed25519 keys. The general XRPL
// codec covers many tx types and trust-line/issued-currency amounts;
// we implement only the subset the bridge needs for releasing XRP
// from a bridge wallet to a user's r-address.
//
// References:
//   - XRPL Binary Format docs:
//     https://xrpl.org/serialization.html
//   - Field IDs + type codes:
//     https://github.com/XRPLF/rippled/blob/develop/src/ripple/protocol/impl/SField.cpp
//   - Signing prefix (single-sig):
//     https://xrpl.org/transaction-common-fields.html#signing-data
//
// Why a custom codec instead of a third-party Go library: the active
// XRPL Go libraries (Peersyst/xrpl-go, rubblelabs/ripple) either pull
// in heavy crypto deps with their own dep-graph issues, or expose API
// surface much larger than we need for one tx type. Implementing the
// minimal subset keeps this package ~250 lines and zero new go.mod
// dependencies.
package xrp

import (
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
)

// SigningPrefix is the 4-byte tag prepended to the serialized
// transaction before single-signature ed25519 signing. ASCII "STX\0".
//
// For multi-signing the prefix is different ("SMT\0"); we only build
// single-signature txs so the constant suffices.
var SigningPrefix = [4]byte{0x53, 0x54, 0x58, 0x00}

// Payment is the minimal field set needed to release XRP from one
// account to another. All amounts are in drops (1 XRP = 1_000_000
// drops). AccountIDs are r-addresses (decoded later into 20-byte
// canonical form by SerializeForSigning / Serialize).
type Payment struct {
	Account        string // sender r-address
	Destination    string // recipient r-address
	AmountDrops    uint64 // amount in drops
	FeeDrops       uint64 // tx fee in drops (typically 10-12 for current network)
	Sequence       uint32 // sender account sequence (from account_info)
	Flags          uint32 // 0 is fine for ed25519; tfFullyCanonicalSig is secp256k1-only
	SigningPubKey  []byte // 33 bytes: 0xED prefix + 32-byte ed25519 pubkey
	DestinationTag *uint32
	// TxnSignature is appended by FinalizeSigned. Left zero-valued in
	// the input to SerializeForSigning so the bytes-to-sign exclude it.
	TxnSignature []byte // 64-byte ed25519 sig; empty for SerializeForSigning
}

// payment_TransactionType is the canonical value for Payment.
const paymentTransactionType uint16 = 0

// Field IDs for our subset. Each Field ID is (type_code, field_code).
// Type codes used here:
//
//	1 UInt16  (TransactionType)
//	2 UInt32  (Flags, Sequence, DestinationTag)
//	6 Amount  (Amount, Fee)
//	7 Blob    (SigningPubKey, TxnSignature)
//	8 Account (Account, Destination)
//
// Field codes are from XRPL's SField table.
type fieldID struct {
	typeCode  uint8
	fieldCode uint8
}

var (
	fldTransactionType = fieldID{1, 2}
	fldFlags           = fieldID{2, 2}
	fldSequence        = fieldID{2, 4}
	fldDestinationTag  = fieldID{2, 14}
	fldAmount          = fieldID{6, 1}
	fldFee             = fieldID{6, 8}
	fldSigningPubKey   = fieldID{7, 3}
	fldTxnSignature    = fieldID{7, 4}
	fldAccount         = fieldID{8, 1}
	fldDestination     = fieldID{8, 3}
)

// encodeFieldID encodes a (type, field) pair into the 1-3 byte
// canonical Field ID prefix used by the binary codec.
//
// Both nibbles fit in 4 bits → single byte 0xTF.
// Either nibble overflows → emit a marker byte + the overflowing
// half as a separate byte. Both > 15 → 0x00 marker then both bytes.
func encodeFieldID(f fieldID) []byte {
	if f.typeCode < 16 && f.fieldCode < 16 {
		return []byte{(f.typeCode << 4) | f.fieldCode}
	}
	if f.typeCode < 16 {
		return []byte{f.typeCode << 4, f.fieldCode}
	}
	if f.fieldCode < 16 {
		return []byte{f.fieldCode, f.typeCode}
	}
	return []byte{0x00, f.typeCode, f.fieldCode}
}

// encodeVL encodes a Variable-Length blob's length prefix per
// XRPL's three-tier scheme: 1 byte for ≤192, 2 bytes for ≤12480,
// 3 bytes for ≤918744. We only ever emit small blobs (≤64 bytes for
// the AccountID/Signature/PubKey), so the single-byte branch is
// always taken — the others stay correct for future fields.
func encodeVL(length int) []byte {
	switch {
	case length <= 192:
		return []byte{byte(length)}
	case length <= 12480:
		n := length - 193
		return []byte{byte(193 + (n >> 8)), byte(n & 0xff)}
	case length <= 918744:
		n := length - 12481
		return []byte{
			byte(241 + (n >> 16)),
			byte((n >> 8) & 0xff),
			byte(n & 0xff),
		}
	default:
		panic("encodeVL: length too long for XRPL Variable-Length")
	}
}

// encodeAmountXRP encodes a drops amount in canonical XRP-amount
// form: 8 bytes, big-endian, with the high two bits encoding the
// "not an IOU + positive" flags.
//
//	bit 63 = 0 (XRP, not issued currency)
//	bit 62 = 1 (positive)
//	bits 0..61 = drops value
//
// Drops are capped at 100 billion XRP = 10^17 drops, well under 2^61.
func encodeAmountXRP(drops uint64) []byte {
	out := make([]byte, 8)
	binary.BigEndian.PutUint64(out, drops|(uint64(1)<<62))
	return out
}

// serializeFields walks the field set and emits its canonical binary
// representation. Fields must be sorted in (type_code, field_code)
// ascending order. The withSignature flag toggles inclusion of the
// TxnSignature field (false for signing-time, true for broadcast).
func (p *Payment) serializeFields(withSignature bool) ([]byte, error) {
	if len(p.SigningPubKey) != 33 {
		return nil, fmt.Errorf("xrp: SigningPubKey must be 33 bytes, got %d", len(p.SigningPubKey))
	}
	if withSignature && len(p.TxnSignature) != 64 {
		return nil, fmt.Errorf("xrp: TxnSignature must be 64 bytes for ed25519, got %d", len(p.TxnSignature))
	}
	accountID, err := AccountIDFromRAddress(p.Account)
	if err != nil {
		return nil, fmt.Errorf("xrp: decode Account: %w", err)
	}
	destAccountID, err := AccountIDFromRAddress(p.Destination)
	if err != nil {
		return nil, fmt.Errorf("xrp: decode Destination: %w", err)
	}

	out := make([]byte, 0, 200)

	// (1,2) TransactionType — UInt16
	out = append(out, encodeFieldID(fldTransactionType)...)
	out = append(out, byte(paymentTransactionType>>8), byte(paymentTransactionType&0xff))

	// (2,2) Flags — UInt32
	out = append(out, encodeFieldID(fldFlags)...)
	flagsBuf := make([]byte, 4)
	binary.BigEndian.PutUint32(flagsBuf, p.Flags)
	out = append(out, flagsBuf...)

	// (2,4) Sequence — UInt32
	out = append(out, encodeFieldID(fldSequence)...)
	seqBuf := make([]byte, 4)
	binary.BigEndian.PutUint32(seqBuf, p.Sequence)
	out = append(out, seqBuf...)

	// (2,14) DestinationTag — UInt32, optional
	if p.DestinationTag != nil {
		out = append(out, encodeFieldID(fldDestinationTag)...)
		tagBuf := make([]byte, 4)
		binary.BigEndian.PutUint32(tagBuf, *p.DestinationTag)
		out = append(out, tagBuf...)
	}

	// (6,1) Amount — XRP amount (8 bytes)
	out = append(out, encodeFieldID(fldAmount)...)
	out = append(out, encodeAmountXRP(p.AmountDrops)...)

	// (6,8) Fee — XRP amount (8 bytes)
	out = append(out, encodeFieldID(fldFee)...)
	out = append(out, encodeAmountXRP(p.FeeDrops)...)

	// (7,3) SigningPubKey — Blob (VL-prefixed)
	out = append(out, encodeFieldID(fldSigningPubKey)...)
	out = append(out, encodeVL(len(p.SigningPubKey))...)
	out = append(out, p.SigningPubKey...)

	// (7,4) TxnSignature — Blob (VL-prefixed). Omitted during signing.
	if withSignature {
		out = append(out, encodeFieldID(fldTxnSignature)...)
		out = append(out, encodeVL(len(p.TxnSignature))...)
		out = append(out, p.TxnSignature...)
	}

	// (8,1) Account — AccountID (always 20 bytes; emitted as VL-prefixed)
	out = append(out, encodeFieldID(fldAccount)...)
	out = append(out, encodeVL(len(accountID))...)
	out = append(out, accountID...)

	// (8,3) Destination — AccountID
	out = append(out, encodeFieldID(fldDestination)...)
	out = append(out, encodeVL(len(destAccountID))...)
	out = append(out, destAccountID...)

	return out, nil
}

// SerializeForSigning returns the bytes the ed25519 private key must
// sign. The bytes are the canonical serialization (minus TxnSignature)
// with the single-signature prefix prepended.
//
// ed25519 over arbitrary-length input is the standard XRPL flow for
// ed25519-keyed accounts (unlike secp256k1, which signs SHA-512-half
// of the same prefix+body). Our MPC cluster signs the full payload.
func (p *Payment) SerializeForSigning() ([]byte, error) {
	body, err := p.serializeFields(false /* withSignature */)
	if err != nil {
		return nil, err
	}
	out := make([]byte, 0, 4+len(body))
	out = append(out, SigningPrefix[:]...)
	out = append(out, body...)
	return out, nil
}

// Serialize returns the signed transaction blob ready for submission
// via XRPL JSON-RPC's submit method (as the tx_blob hex string).
// Requires TxnSignature to be populated (64 bytes ed25519 sig).
func (p *Payment) Serialize() ([]byte, error) {
	return p.serializeFields(true /* withSignature */)
}

// SerializeHex returns Serialize() as an uppercase hex string —
// the form XRPL's submit RPC expects.
func (p *Payment) SerializeHex() (string, error) {
	blob, err := p.Serialize()
	if err != nil {
		return "", err
	}
	return hexUpper(blob), nil
}

func hexUpper(b []byte) string {
	s := hex.EncodeToString(b)
	out := make([]byte, len(s))
	for i, c := range []byte(s) {
		if c >= 'a' && c <= 'f' {
			out[i] = c - ('a' - 'A')
		} else {
			out[i] = c
		}
	}
	return string(out)
}

// ErrBadAccountID is returned when an r-address fails checksum or
// length validation during decode.
var ErrBadAccountID = errors.New("xrp: invalid r-address")
