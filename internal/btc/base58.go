// Base58check encode/decode for legacy Bitcoin addresses.
//
// Local copy rather than depending on internal/mchain so this package
// keeps its dep surface limited to chain primitives (the assembler and
// txassembler layers above import both).
package btc

import (
	"crypto/sha256"
	"errors"
	"fmt"
	"math/big"
	"strings"
)

const base58Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

// base58CheckEncode returns base58(version || payload || SHA256d(...)[:4]).
func base58CheckEncode(version byte, payload []byte) string {
	full := make([]byte, 0, 1+len(payload)+4)
	full = append(full, version)
	full = append(full, payload...)
	checksum := sha256d(full)
	full = append(full, checksum[:4]...)
	return base58Encode(full)
}

// base58CheckDecode reverses base58CheckEncode. The version byte and
// payload (everything between) are returned; the 4-byte trailing
// checksum is verified and discarded.
func base58CheckDecode(s string) (payload []byte, version byte, err error) {
	raw, err := base58Decode(s)
	if err != nil {
		return nil, 0, err
	}
	if len(raw) < 5 {
		return nil, 0, fmt.Errorf("base58CheckDecode: too short after decode (%d bytes)", len(raw))
	}
	versionAndPayload := raw[:len(raw)-4]
	gotChecksum := raw[len(raw)-4:]
	wantChecksum := sha256d(versionAndPayload)
	for i := 0; i < 4; i++ {
		if gotChecksum[i] != wantChecksum[i] {
			return nil, 0, errors.New("base58CheckDecode: checksum mismatch")
		}
	}
	return versionAndPayload[1:], versionAndPayload[0], nil
}

// sha256d is Bitcoin's "double SHA-256".
func sha256d(data []byte) [32]byte {
	first := sha256.Sum256(data)
	return sha256.Sum256(first[:])
}

func base58Encode(input []byte) string {
	if len(input) == 0 {
		return ""
	}
	zeros := 0
	for _, b := range input {
		if b != 0 {
			break
		}
		zeros++
	}
	n := new(big.Int).SetBytes(input)
	base := big.NewInt(58)
	mod := new(big.Int)
	var encoded []byte
	for n.Sign() > 0 {
		n.DivMod(n, base, mod)
		encoded = append(encoded, base58Alphabet[mod.Int64()])
	}
	for i := 0; i < zeros; i++ {
		encoded = append(encoded, '1')
	}
	for i, j := 0, len(encoded)-1; i < j; i, j = i+1, j-1 {
		encoded[i], encoded[j] = encoded[j], encoded[i]
	}
	return string(encoded)
}

func base58Decode(s string) ([]byte, error) {
	if s == "" {
		return nil, errors.New("base58Decode: empty input")
	}
	zeros := 0
	for i := 0; i < len(s) && s[i] == '1'; i++ {
		zeros++
	}
	n := new(big.Int)
	base := big.NewInt(58)
	digit := new(big.Int)
	for i := 0; i < len(s); i++ {
		idx := strings.IndexByte(base58Alphabet, s[i])
		if idx < 0 {
			return nil, fmt.Errorf("base58Decode: invalid character %q at pos %d", s[i], i)
		}
		n.Mul(n, base)
		digit.SetInt64(int64(idx))
		n.Add(n, digit)
	}
	nb := n.Bytes()
	out := make([]byte, zeros+len(nb))
	copy(out[zeros:], nb)
	return out, nil
}
