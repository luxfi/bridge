// Package btc implements the minimal Bitcoin transaction codec the
// bridge needs to release funds from an MPC-controlled release wallet
// to a user-supplied destination address.
//
// Scope (intentionally narrow):
//
//   - INPUT: spends a single P2PKH UTXO. mpcd's BTC keygen produces a
//     P2PKH address (mainnet-format, re-encoded to testnet by
//     internal/mchain/btc_address.go before being shown), so the
//     release wallet's UTXOs are always P2PKH. Legacy (pre-BIP-143)
//     sighash applies.
//
//   - OUTPUTS: two outputs — recipient + change back to the release
//     wallet. Recipient may be any of {P2PKH, P2SH, P2WPKH, P2WSH}
//     since DecodeAddress yields a canonical scriptPubKey for each.
//     The change output is always P2PKH (the release wallet's own
//     address).
//
//   - SIGNING: ECDSA secp256k1 over the legacy P2PKH sighash. The MPC
//     cluster signs the 32-byte sighash and returns 64 raw bytes
//     (r||s); Finalize DER-encodes them, appends SIGHASH_ALL, and
//     assembles the final scriptSig.
//
// Future expansion (NOT in scope for the first pass):
//   - P2WPKH inputs (release wallet on bech32) — different sighash
//     (BIP-143).
//   - Multi-input spending (UTXO consolidation) — straightforward
//     extension of the sighash loop.
//   - P2TR outputs / inputs — requires Schnorr signing in mpcd.
//   - RBF support beyond the always-on opt-in sequence 0xfffffffd.
package btc

import (
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"
	"math/big"
)

// SighashAll is the SIGHASH_ALL flag, the only sighash type this
// codec emits. Appended as a 4-byte little-endian value to the
// preimage before double-SHA-256.
const SighashAll uint32 = 0x01

// SequenceRBF is the input sequence value that opts into BIP-125
// Replace-By-Fee. We use it unconditionally so a stuck fee can be
// bumped without needing protocol changes here.
const SequenceRBF uint32 = 0xfffffffd

// DefaultLockTime is the locktime applied to every release tx. Zero
// means "no locktime"; the tx is valid immediately.
const DefaultLockTime uint32 = 0

// Payment describes one release transaction: spend a single P2PKH
// UTXO from the release wallet, pay the recipient, and optionally
// return change to the release wallet's own P2PKH address.
//
// Recipient and Change values are in satoshis. The implicit fee is
// PrevValue - RecipientValue - ChangeValue and must be >= 0; SigHash
// errors if the arithmetic goes negative.
type Payment struct {
	// Input UTXO.
	PrevTxID    [32]byte // big-endian txid as it appears in block explorers
	PrevVout    uint32   // output index in the previous tx
	PrevValue   uint64   // sats locked in the input
	PrevScript  []byte   // scriptPubKey of the input (P2PKH)
	PubKey      []byte   // 33-byte compressed pubkey of the release wallet

	// Outputs.
	RecipientScript []byte // recipient's scriptPubKey (from DecodeAddress)
	RecipientValue  uint64
	ChangeScript    []byte // release wallet's own P2PKH scriptPubKey; nil = no change output
	ChangeValue     uint64

	// Tx-level.
	LockTime uint32 // 0 unless the caller really wants a timelock
	Sequence uint32 // 0 → SequenceRBF default
}

// SigHash returns the 32-byte legacy ECDSA sighash the MPC cluster
// must sign for the single input. The preimage is the tx serialized
// in "non-witness" form with this input's scriptSig set to the
// prevout's scriptPubKey, followed by a 4-byte little-endian
// SIGHASH_ALL marker, all run through double-SHA-256.
func (p *Payment) SigHash() ([32]byte, error) {
	if err := p.validate(); err != nil {
		return [32]byte{}, err
	}
	seq := p.Sequence
	if seq == 0 {
		seq = SequenceRBF
	}
	var buf bytes.Buffer
	writeUint32LE(&buf, 2) // tx version

	// Inputs: 1 (single input being signed).
	writeVarInt(&buf, 1)
	writeBytes(&buf, reverseBytes(p.PrevTxID[:])) // tx serialization uses little-endian txid
	writeUint32LE(&buf, p.PrevVout)
	// scriptSig = prevout scriptPubKey for the input being signed.
	writeVarInt(&buf, uint64(len(p.PrevScript)))
	writeBytes(&buf, p.PrevScript)
	writeUint32LE(&buf, seq)

	// Outputs: 1 or 2.
	outs := 1
	if len(p.ChangeScript) > 0 && p.ChangeValue > 0 {
		outs = 2
	}
	writeVarInt(&buf, uint64(outs))

	writeUint64LE(&buf, p.RecipientValue)
	writeVarInt(&buf, uint64(len(p.RecipientScript)))
	writeBytes(&buf, p.RecipientScript)
	if outs == 2 {
		writeUint64LE(&buf, p.ChangeValue)
		writeVarInt(&buf, uint64(len(p.ChangeScript)))
		writeBytes(&buf, p.ChangeScript)
	}

	writeUint32LE(&buf, p.LockTime)
	writeUint32LE(&buf, SighashAll)
	return sha256d(buf.Bytes()), nil
}

// Finalize attaches the signature to the input scriptSig and returns
// the wire-ready raw transaction (hex-encoded) plus its txid (big-
// endian hex as block explorers display it).
//
// signature is the raw 64 bytes (r||s) the MPC cluster returns. The
// optional `v` (recovery byte) is ignored — Bitcoin doesn't use it.
// The function DER-encodes (r, s), appends SIGHASH_ALL, and builds
// scriptSig = `<push sig> <push pubkey>`.
//
// Low-s canonicalization is applied to keep the tx valid under
// BIP-146 / Bitcoin's STANDARD policy (since 2015) — without it,
// CGGMP21's high-s output would be accepted into mempools that
// honor IsStandard checks but rejected by relay nodes.
func (p *Payment) Finalize(signature []byte) (rawHex, txid string, err error) {
	if err := p.validate(); err != nil {
		return "", "", err
	}
	if len(signature) < 64 {
		return "", "", fmt.Errorf("btc: signature must be at least 64 bytes (r||s), got %d", len(signature))
	}
	r := new(big.Int).SetBytes(signature[:32])
	s := new(big.Int).SetBytes(signature[32:64])
	s = canonicalizeLowS(s)
	derSig := derEncode(r, s)
	derSig = append(derSig, byte(SighashAll&0xff))

	// scriptSig = <push derSig> <push pubkey>
	var script bytes.Buffer
	writeOpPush(&script, derSig)
	writeOpPush(&script, p.PubKey)
	scriptSig := script.Bytes()

	seq := p.Sequence
	if seq == 0 {
		seq = SequenceRBF
	}

	var tx bytes.Buffer
	writeUint32LE(&tx, 2)
	writeVarInt(&tx, 1)
	writeBytes(&tx, reverseBytes(p.PrevTxID[:]))
	writeUint32LE(&tx, p.PrevVout)
	writeVarInt(&tx, uint64(len(scriptSig)))
	writeBytes(&tx, scriptSig)
	writeUint32LE(&tx, seq)

	outs := 1
	if len(p.ChangeScript) > 0 && p.ChangeValue > 0 {
		outs = 2
	}
	writeVarInt(&tx, uint64(outs))
	writeUint64LE(&tx, p.RecipientValue)
	writeVarInt(&tx, uint64(len(p.RecipientScript)))
	writeBytes(&tx, p.RecipientScript)
	if outs == 2 {
		writeUint64LE(&tx, p.ChangeValue)
		writeVarInt(&tx, uint64(len(p.ChangeScript)))
		writeBytes(&tx, p.ChangeScript)
	}
	writeUint32LE(&tx, p.LockTime)

	raw := tx.Bytes()
	digest := sha256d(raw)
	idBytes := reverseBytes(digest[:])
	return fmt.Sprintf("%x", raw), fmt.Sprintf("%x", idBytes), nil
}

// FeeSats reports the implicit fee (input − outputs) for the payment.
// Useful for logging and pre-broadcast checks.
func (p *Payment) FeeSats() (int64, error) {
	if err := p.validate(); err != nil {
		return 0, err
	}
	fee := int64(p.PrevValue) - int64(p.RecipientValue) - int64(p.ChangeValue)
	if fee < 0 {
		return 0, fmt.Errorf("btc: negative fee (input=%d recipient=%d change=%d)",
			p.PrevValue, p.RecipientValue, p.ChangeValue)
	}
	return fee, nil
}

func (p *Payment) validate() error {
	if p == nil {
		return errors.New("btc: nil Payment")
	}
	if p.PrevValue == 0 {
		return errors.New("btc: PrevValue must be > 0")
	}
	if len(p.PrevScript) == 0 {
		return errors.New("btc: PrevScript required for legacy sighash")
	}
	if len(p.PubKey) != 33 {
		return fmt.Errorf("btc: PubKey must be 33 bytes (compressed), got %d", len(p.PubKey))
	}
	if len(p.RecipientScript) == 0 {
		return errors.New("btc: RecipientScript required")
	}
	if p.RecipientValue == 0 {
		return errors.New("btc: RecipientValue must be > 0")
	}
	if len(p.ChangeScript) > 0 && p.ChangeValue == 0 {
		return errors.New("btc: ChangeScript set but ChangeValue is 0")
	}
	if p.RecipientValue+p.ChangeValue > p.PrevValue {
		return fmt.Errorf("btc: outputs (%d) exceed input (%d)",
			p.RecipientValue+p.ChangeValue, p.PrevValue)
	}
	return nil
}

// ===== Wire helpers =====

func writeUint32LE(w *bytes.Buffer, v uint32) {
	var b [4]byte
	binary.LittleEndian.PutUint32(b[:], v)
	_, _ = w.Write(b[:])
}

func writeUint64LE(w *bytes.Buffer, v uint64) {
	var b [8]byte
	binary.LittleEndian.PutUint64(b[:], v)
	_, _ = w.Write(b[:])
}

func writeBytes(w *bytes.Buffer, b []byte) {
	_, _ = w.Write(b)
}

func writeVarInt(w *bytes.Buffer, v uint64) {
	switch {
	case v < 0xfd:
		_ = w.WriteByte(byte(v))
	case v <= 0xffff:
		_ = w.WriteByte(0xfd)
		var b [2]byte
		binary.LittleEndian.PutUint16(b[:], uint16(v))
		_, _ = w.Write(b[:])
	case v <= 0xffffffff:
		_ = w.WriteByte(0xfe)
		var b [4]byte
		binary.LittleEndian.PutUint32(b[:], uint32(v))
		_, _ = w.Write(b[:])
	default:
		_ = w.WriteByte(0xff)
		var b [8]byte
		binary.LittleEndian.PutUint64(b[:], v)
		_, _ = w.Write(b[:])
	}
}

// writeOpPush emits the Bitcoin Script "push data" opcode for a blob.
// For lengths < 0x4c it uses the single-byte direct-push opcode (the
// length itself); 0x4c–0xff uses OP_PUSHDATA1 + length byte; 0x100+
// uses OP_PUSHDATA2 (we won't hit it for sig+pubkey, but the helper
// stays correct).
func writeOpPush(w *bytes.Buffer, data []byte) {
	n := len(data)
	switch {
	case n < 0x4c:
		_ = w.WriteByte(byte(n))
	case n <= 0xff:
		_ = w.WriteByte(0x4c) // OP_PUSHDATA1
		_ = w.WriteByte(byte(n))
	case n <= 0xffff:
		_ = w.WriteByte(0x4d) // OP_PUSHDATA2
		var b [2]byte
		binary.LittleEndian.PutUint16(b[:], uint16(n))
		_, _ = w.Write(b[:])
	default:
		// Shouldn't happen for signature + pubkey blobs.
		panic(fmt.Sprintf("btc: push too large (%d bytes)", n))
	}
	_, _ = w.Write(data)
}

// reverseBytes is the in-place reverse Bitcoin uses to convert
// between display-form txids (big-endian) and wire-form (little-
// endian). Returns a fresh slice so callers can keep the original.
func reverseBytes(b []byte) []byte {
	out := make([]byte, len(b))
	for i, c := range b {
		out[len(b)-1-i] = c
	}
	return out
}

// ===== ECDSA helpers =====

// secp256k1N is the order of the secp256k1 generator point. Used by
// canonicalizeLowS to flip high-s signatures to their low-s
// equivalents — Bitcoin's STANDARD policy rejects high-s since
// BIP-146 (2015).
var secp256k1N, _ = new(big.Int).SetString(
	"fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141", 16)

var secp256k1HalfN = new(big.Int).Rsh(secp256k1N, 1)

// canonicalizeLowS replaces s with n − s when s > n/2. Matches the
// txassembler.Assembler.ParseRSV behaviour but stays inside this
// package so the BTC path doesn't drag in EVM imports.
func canonicalizeLowS(s *big.Int) *big.Int {
	if s.Cmp(secp256k1HalfN) > 0 {
		return new(big.Int).Sub(secp256k1N, s)
	}
	return s
}

// derEncode emits the DER form of an (r, s) ECDSA signature per
// BIP-66 strict canonical encoding:
//
//	0x30 <total-len> 0x02 <r-len> <r-bytes> 0x02 <s-len> <s-bytes>
//
// r/s bytes have a leading 0x00 sentinel when their high bit is set
// (so DER reads them as unsigned).
func derEncode(r, s *big.Int) []byte {
	rb := encodeASN1Int(r)
	sb := encodeASN1Int(s)
	out := make([]byte, 0, 6+len(rb)+len(sb))
	out = append(out, 0x30, byte(2+len(rb)+2+len(sb)))
	out = append(out, 0x02, byte(len(rb)))
	out = append(out, rb...)
	out = append(out, 0x02, byte(len(sb)))
	out = append(out, sb...)
	return out
}

func encodeASN1Int(n *big.Int) []byte {
	b := n.Bytes()
	if len(b) == 0 {
		return []byte{0x00}
	}
	if b[0]&0x80 != 0 {
		// Prepend 0x00 so the value is interpreted as positive.
		out := make([]byte, len(b)+1)
		copy(out[1:], b)
		return out
	}
	return b
}
