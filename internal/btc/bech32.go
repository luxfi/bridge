// Bech32 (BIP-173) encode/decode for SegWit v0 Bitcoin addresses.
//
// Only the v0 polymod constant (0x01) is supported here — Taproot
// (v1+) uses bech32m (constant 0x2bc830a3). When we add Schnorr
// signing for P2TR later we'll add a second decoder; today the
// assembler explicitly rejects v1+ programs.
package btc

import (
	"errors"
	"fmt"
	"strings"
)

const bech32Charset = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"

// bech32Decode parses a v0 bech32 address ("bc1q…" / "tb1q…") and
// returns the HRP, the witness version (0-16), and the decoded
// witness program bytes. The checksum is verified against the v0
// polymod constant; bech32m / v1+ addresses error.
func bech32Decode(s string) (hrp string, version byte, program []byte, err error) {
	if s != strings.ToLower(s) && s != strings.ToUpper(s) {
		return "", 0, nil, errors.New("bech32: mixed-case input")
	}
	s = strings.ToLower(s)
	pos := strings.LastIndex(s, "1")
	if pos < 1 || pos+7 > len(s) {
		return "", 0, nil, errors.New("bech32: missing separator or insufficient data")
	}
	hrp = s[:pos]
	data := make([]byte, 0, len(s)-pos-1)
	for _, c := range s[pos+1:] {
		idx := strings.IndexRune(bech32Charset, c)
		if idx < 0 {
			return "", 0, nil, fmt.Errorf("bech32: invalid character %q", c)
		}
		data = append(data, byte(idx))
	}
	if !bech32VerifyChecksum(hrp, data) {
		return "", 0, nil, errors.New("bech32: checksum mismatch (v0 polymod)")
	}
	if len(data) < 7 {
		return "", 0, nil, errors.New("bech32: data too short after HRP")
	}
	version = data[0]
	if version > 16 {
		return "", 0, nil, fmt.Errorf("bech32: witness version %d out of range", version)
	}
	prog, err := bech32ConvertBits(data[1:len(data)-6], 5, 8, false)
	if err != nil {
		return "", 0, nil, fmt.Errorf("bech32: program convert: %w", err)
	}
	return hrp, version, prog, nil
}

// bech32Encode returns the bech32 v0 address for the given HRP,
// witness version and program bytes. Used by EncodeP2WPKHAddress;
// also handy in tests for round-tripping decodes.
func bech32Encode(hrp string, version byte, program []byte) (string, error) {
	if version > 16 {
		return "", fmt.Errorf("bech32: witness version %d out of range", version)
	}
	five, err := bech32ConvertBits(program, 8, 5, true)
	if err != nil {
		return "", fmt.Errorf("bech32: program convert: %w", err)
	}
	data := append([]byte{version}, five...)
	checksum := bech32CreateChecksum(hrp, data)
	full := append(data, checksum...)
	var b strings.Builder
	b.WriteString(hrp)
	b.WriteByte('1')
	for _, d := range full {
		b.WriteByte(bech32Charset[d])
	}
	return b.String(), nil
}

// bech32ConvertBits is the canonical width-changing pack/unpack used
// by all bech32 implementations. fromBits=5, toBits=8 to decode the
// witness program; reverse to encode. pad=true for encoding so the
// result is a whole number of toBits-wide groups.
func bech32ConvertBits(data []byte, fromBits, toBits uint, pad bool) ([]byte, error) {
	var acc uint32
	var bits uint
	maxV := uint32(1<<toBits) - 1
	maxAcc := uint32(1<<(fromBits+toBits-1)) - 1
	out := make([]byte, 0)
	for _, v := range data {
		if uint32(v) >> fromBits != 0 {
			return nil, fmt.Errorf("convertBits: value %d exceeds %d bits", v, fromBits)
		}
		acc = ((acc << fromBits) | uint32(v)) & maxAcc
		bits += fromBits
		for bits >= toBits {
			bits -= toBits
			out = append(out, byte((acc>>bits)&maxV))
		}
	}
	if pad {
		if bits > 0 {
			out = append(out, byte((acc<<(toBits-bits))&maxV))
		}
	} else if bits >= fromBits || ((acc<<(toBits-bits))&maxV) != 0 {
		return nil, errors.New("convertBits: non-zero padding bits")
	}
	return out, nil
}

func bech32Polymod(values []byte) uint32 {
	gen := []uint32{0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3}
	chk := uint32(1)
	for _, v := range values {
		top := chk >> 25
		chk = (chk&0x1ffffff)<<5 ^ uint32(v)
		for i := uint(0); i < 5; i++ {
			if (top>>i)&1 == 1 {
				chk ^= gen[i]
			}
		}
	}
	return chk
}

func bech32HRPExpand(hrp string) []byte {
	out := make([]byte, 0, len(hrp)*2+1)
	for _, c := range hrp {
		out = append(out, byte(c)>>5)
	}
	out = append(out, 0)
	for _, c := range hrp {
		out = append(out, byte(c)&31)
	}
	return out
}

func bech32VerifyChecksum(hrp string, data []byte) bool {
	combined := append(bech32HRPExpand(hrp), data...)
	return bech32Polymod(combined) == 1
}

func bech32CreateChecksum(hrp string, data []byte) []byte {
	values := append(bech32HRPExpand(hrp), data...)
	values = append(values, 0, 0, 0, 0, 0, 0)
	mod := bech32Polymod(values) ^ 1
	out := make([]byte, 6)
	for i := 0; i < 6; i++ {
		out[i] = byte((mod >> uint(5*(5-i))) & 31)
	}
	return out
}
