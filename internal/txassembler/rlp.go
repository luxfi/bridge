// Package txassembler builds EIP-155 legacy EVM transactions for the
// destination side of a bridge swap. The assembler produces:
//
//   1. PreSign(swap) → (sighash, *Unsigned)  — the keccak256 of the
//      RLP-encoded `[nonce, gasPrice, gas, to, value, data, chainID, 0, 0]`,
//      which is what the MPC threshold quorum signs.
//   2. Finalize(unsigned, r, s, v) → rawTxHex — the RLP-encoded
//      `[nonce, gasPrice, gas, to, value, data, v, r, s]` ready for
//      eth_sendRawTransaction.
//
// Scope:
//   - EIP-155 legacy transactions only. EIP-1559 (type=2) is a
//     straightforward follow-up; the wire is the same shape but the
//     RLP list is prefixed with a `0x02` envelope byte and includes
//     `maxPriorityFeePerGas` + `maxFeePerGas` + `accessList`.
//   - Pure value transfer mode by default (data = empty). Operators
//     can switch to contract-call mode via PerNetwork.BridgeContract.
//   - Native asset only (the gas asset on each chain). ERC-20 release
//     would build calldata for `transfer(recipient, amount)` against
//     the token contract — possible but not yet wired.
//
// Non-goals for v1:
//   - EIP-1559 (post-London) — testnet support is universal for legacy
//     so this is enough to ship a first real transfer.
//   - Access lists — empty.
//   - Replay protection beyond EIP-155 chain id.
package txassembler

import (
	"errors"
	"fmt"
	"math/big"
	"strconv"
)

// =============================================================================
// Minimal RLP encoder
// =============================================================================
//
// RLP rules (per Yellow Paper Appendix B):
//   • A byte string of length 1 with a single byte < 0x80 → that byte alone.
//   • A byte string of length 0–55 → [0x80 + len] || data.
//   • A byte string longer than 55 → [0xb7 + len(len(data))] || be(len(data)) || data.
//   • A list of total encoded-item-length 0–55 → [0xc0 + total] || items…
//   • A list longer than 55 → [0xf7 + len(len(total))] || be(total) || items…
//
// Integers are encoded as their minimal big-endian byte representation
// (no leading zero bytes). Zero is encoded as the empty byte string.

// encodeBytes RLP-encodes a single byte string.
func encodeBytes(b []byte) []byte {
	if len(b) == 1 && b[0] < 0x80 {
		return []byte{b[0]}
	}
	if len(b) <= 55 {
		return append([]byte{0x80 + byte(len(b))}, b...)
	}
	lenBytes := bigEndian(uint64(len(b)))
	out := []byte{0xb7 + byte(len(lenBytes))}
	out = append(out, lenBytes...)
	out = append(out, b...)
	return out
}

// encodeList wraps already-RLP-encoded items in a list header.
func encodeList(items []byte) []byte {
	if len(items) <= 55 {
		return append([]byte{0xc0 + byte(len(items))}, items...)
	}
	lenBytes := bigEndian(uint64(len(items)))
	out := []byte{0xf7 + byte(len(lenBytes))}
	out = append(out, lenBytes...)
	out = append(out, items...)
	return out
}

// encodeUint is the canonical big-int encoding (minimal big-endian).
// Zero → empty byte string (which encodeBytes turns into [0x80]).
func encodeUint(n *big.Int) []byte {
	if n == nil || n.Sign() == 0 {
		return encodeBytes(nil)
	}
	if n.Sign() < 0 {
		// EVM ints are unsigned; refuse to silently corrupt the wire.
		// Callers always pass non-negative values.
		panic("txassembler: encodeUint called with negative integer")
	}
	return encodeBytes(n.Bytes())
}

// bigEndian returns the minimal big-endian representation of n.
func bigEndian(n uint64) []byte {
	if n == 0 {
		return []byte{0}
	}
	var buf [8]byte
	i := 8
	for n > 0 {
		i--
		buf[i] = byte(n & 0xff)
		n >>= 8
	}
	return buf[i:]
}

// rlpList encodes an ordered list of pre-encoded items as a single
// RLP list. Each item must already be RLP-encoded; this just adds
// the list header.
func rlpList(items ...[]byte) []byte {
	var inner []byte
	for _, it := range items {
		inner = append(inner, it...)
	}
	return encodeList(inner)
}

// =============================================================================
// Address helpers
// =============================================================================

// parseAddress accepts a 0x-prefixed hex address and returns the
// 20-byte representation. Case-insensitive. Returns error on bad input.
func parseAddress(addr string) ([]byte, error) {
	if len(addr) >= 2 && (addr[:2] == "0x" || addr[:2] == "0X") {
		addr = addr[2:]
	}
	if len(addr) != 40 {
		return nil, fmt.Errorf("txassembler: invalid address %q: want 40 hex chars, got %d", addr, len(addr))
	}
	out := make([]byte, 20)
	for i := 0; i < 20; i++ {
		hi, ok1 := hexNibble(addr[2*i])
		lo, ok2 := hexNibble(addr[2*i+1])
		if !ok1 || !ok2 {
			return nil, fmt.Errorf("txassembler: invalid hex char in address %q", addr)
		}
		out[i] = hi<<4 | lo
	}
	return out, nil
}

func hexNibble(c byte) (byte, bool) {
	switch {
	case c >= '0' && c <= '9':
		return c - '0', true
	case c >= 'a' && c <= 'f':
		return c - 'a' + 10, true
	case c >= 'A' && c <= 'F':
		return c - 'A' + 10, true
	}
	return 0, false
}

// =============================================================================
// Amount → wei conversion
// =============================================================================

// FloatToBaseUnits is the exported alias for floatToWei. Useful for
// non-EVM assemblers (DOT planck etc.) that share the same
// human-amount → integer scaling logic. Same precision caps + behaviour.
func FloatToBaseUnits(amount float64, decimals int) (*big.Int, error) {
	return floatToWei(amount, decimals)
}

// floatToWei converts a human-readable amount (e.g. 0.1) to a wei
// big.Int using `decimals` (18 for ETH/LUX).
//
// Implementation: format-and-parse with capped resolution. We round
// the float to floatResolutionDigits decimal places (well within
// float64's precision envelope), then concatenate the integer +
// fractional parts as a fixed-point string, then parse as big.Int.
// This avoids the IEEE-754 imprecision that hits straight
// float→big.Float→big.Int paths (`0.1 * 10^18` would otherwise yield
// 100000000000000005 instead of 100000000000000000).
//
// Caps:
//   - 12-decimal-place resolution after the point — finer than any
//     practical bridge amount and well inside float64's ~15 sig figs.
//   - Negative amounts rejected (the bridge never moves negative funds).
//
// Returns 0 wei for amount=0.
func floatToWei(amount float64, decimals int) (*big.Int, error) {
	if amount < 0 {
		return nil, errors.New("txassembler: amount must be non-negative")
	}
	if decimals < 0 || decimals > 30 {
		return nil, fmt.Errorf("txassembler: invalid decimals %d", decimals)
	}
	const floatResolutionDigits = 12
	resolution := floatResolutionDigits
	if resolution > decimals {
		resolution = decimals
	}
	// Format with resolution decimal places so IEEE noise rounds away.
	s := strconvFormatFloat(amount, 'f', resolution, 64)
	intPart, fracPart, _ := splitDecimal(s)
	// Pad fracPart out to `decimals` total digits with zeros.
	if pad := decimals - len(fracPart); pad > 0 {
		fracPart += zeros(pad)
	} else if pad < 0 {
		fracPart = fracPart[:decimals]
	}
	combined := intPart + fracPart
	// Strip leading zeros except keep at least one digit.
	combined = stripLeadingZeros(combined)
	if combined == "" {
		combined = "0"
	}
	out, ok := new(big.Int).SetString(combined, 10)
	if !ok {
		return nil, fmt.Errorf("txassembler: floatToWei: parse %q failed", combined)
	}
	return out, nil
}

// Local helpers — kept here so the imports list stays minimal.
func strconvFormatFloat(f float64, fmtByte byte, prec, bitSize int) string {
	return strconv.FormatFloat(f, fmtByte, prec, bitSize)
}

func splitDecimal(s string) (intPart, fracPart string, hasFrac bool) {
	for i := 0; i < len(s); i++ {
		if s[i] == '.' {
			return s[:i], s[i+1:], true
		}
	}
	return s, "", false
}

func zeros(n int) string {
	if n <= 0 {
		return ""
	}
	b := make([]byte, n)
	for i := range b {
		b[i] = '0'
	}
	return string(b)
}

func stripLeadingZeros(s string) string {
	i := 0
	for i < len(s) && s[i] == '0' {
		i++
	}
	return s[i:]
}
