package xrp

import (
	"bytes"
	"crypto/sha256"
	"fmt"
)

// Ripple base58 alphabet — duplicated here so internal/xrp has no
// dependency on internal/mchain (the latter does the address-derive
// at keygen-time; this package does the address-decode at sign-time).
const rippleAlphabet = "rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz"

var rippleAlphabetIndex = func() [256]int8 {
	var idx [256]int8
	for i := range idx {
		idx[i] = -1
	}
	for i, c := range rippleAlphabet {
		idx[c] = int8(i)
	}
	return idx
}()

// AccountIDFromRAddress decodes a user-facing r-address back into the
// canonical 20-byte AccountID used inside serialized transactions.
//
// Round trip with mchain.xrpAddressFromEd25519PubKey:
//
//	r-address → 25-byte payload (version + 20-byte AccountID + 4-byte checksum)
//	verify the 4-byte checksum
//	return the middle 20 bytes
//
// Returns ErrBadAccountID on any decoding/checksum failure so the
// caller can surface a single "invalid r-address" error to the user.
func AccountIDFromRAddress(addr string) ([]byte, error) {
	if len(addr) == 0 {
		return nil, fmt.Errorf("%w: empty", ErrBadAccountID)
	}
	if addr[0] != 'r' {
		return nil, fmt.Errorf("%w: must start with 'r' (got %q)", ErrBadAccountID, addr[0])
	}

	payload, err := rippleBase58Decode(addr)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrBadAccountID, err)
	}
	if len(payload) != 25 {
		return nil, fmt.Errorf("%w: decoded length %d, want 25", ErrBadAccountID, len(payload))
	}
	if payload[0] != 0x00 {
		return nil, fmt.Errorf("%w: version byte = 0x%02x, want 0x00", ErrBadAccountID, payload[0])
	}

	// Verify checksum: first 4 bytes of double SHA-256 over the first
	// 21 bytes (version + AccountID) must match the trailing 4 bytes.
	body := payload[:21]
	want := payload[21:]
	chk1 := sha256.Sum256(body)
	chk2 := sha256.Sum256(chk1[:])
	if !bytes.Equal(want, chk2[:4]) {
		return nil, fmt.Errorf("%w: bad checksum", ErrBadAccountID)
	}
	return body[1:], nil // 20 bytes AccountID
}

// rippleBase58Decode is the inverse of mchain.rippleBase58Encode.
// Same algorithm: convert digit chars back to base-58 number, then
// reconstruct leading-zero bytes from leading 'r' characters.
func rippleBase58Decode(s string) ([]byte, error) {
	zeros := 0
	for zeros < len(s) && s[zeros] == 'r' {
		zeros++
	}

	// Big-endian base-58 reconstruction.
	// Bounded buffer: log_256(58) * len ≈ 0.733 * len.
	buf := make([]byte, len(s)*733/1000+1)
	for _, c := range []byte(s) {
		d := rippleAlphabetIndex[c]
		if d < 0 {
			return nil, fmt.Errorf("not a Ripple-alphabet char: %q", c)
		}
		carry := int(d)
		for i := len(buf) - 1; i >= 0; i-- {
			carry += int(buf[i]) * 58
			buf[i] = byte(carry & 0xff)
			carry >>= 8
		}
		if carry != 0 {
			return nil, fmt.Errorf("input too long to fit in %d bytes", len(buf))
		}
	}

	// Skip leading buffer zeros (they aren't from the input — they're
	// just buffer slack from the over-allocation).
	j := 0
	for j < len(buf) && buf[j] == 0 {
		j++
	}

	out := make([]byte, 0, zeros+len(buf)-j)
	for i := 0; i < zeros; i++ {
		out = append(out, 0)
	}
	out = append(out, buf[j:]...)
	return out, nil
}
