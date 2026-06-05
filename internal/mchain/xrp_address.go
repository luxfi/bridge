package mchain

import (
	"crypto/ed25519"
	"crypto/sha256"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/ripemd160"

	"github.com/luxfi/bridge/internal/solanarpc"
)

// XRP accounts are identified by an "r-address" — a base58-check-encoded
// 20-byte AccountID under the Ripple alphabet (different from Bitcoin's).
// XRP supports both secp256k1 and ed25519 keys; we use ed25519 to match
// the Sol/TON path through the MPC cluster (the MPC keygen output's
// sol_address slot carries the raw ed25519 pubkey as base58, same as
// it does for TON — see ton_address.go).
//
// XRP-specific quirks:
//   - ed25519 pubkeys are prefixed with byte 0xED to distinguish them
//     from secp256k1 in the on-chain SigningPubKey field. The AccountID
//     hash includes this prefix.
//   - r-address base58 uses the Ripple alphabet, not Bitcoin's.
//     `rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz`
//   - The version byte for AccountIDs is 0x00. Test/mainnet share the
//     same encoding — there is no testnet vs mainnet address prefix
//     (unlike BTC's `m/n/tb1` or TON's `0Q/kQ`). The same r-address is
//     valid on whichever XRPL the user routes their tx to.

// Ripple's base58 alphabet — note this is NOT the Bitcoin alphabet.
// The differences are intentional to prevent accidental cross-use of
// addresses between the two ecosystems.
const rippleAlphabet = "rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz"

// xrpAddressFromEd25519PubKey derives an XRP r-address from a base58
// (Bitcoin alphabet — that's what mpcd hands back) ed25519 pubkey.
// Returns the user-facing string the bridge stores as Wallet.Address
// (always starts with `r`; no separate testnet form).
//
// Algorithm (matches XRPL canonical AccountID derivation for ed25519):
//   1. prefix the 32-byte pubkey with 0xED  → 33 bytes
//   2. SHA-256 then RIPEMD-160              → 20 byte AccountID
//   3. prefix AccountID with version 0x00   → 21 bytes
//   4. append 4-byte checksum (SHA-256 ⊗ 2) → 25 bytes
//   5. base58-encode using the Ripple alphabet
func xrpAddressFromEd25519PubKey(base58PubKey string) (string, error) {
	if base58PubKey == "" {
		return "", errors.New("xrpAddressFromEd25519PubKey: empty pubkey")
	}
	raw, err := solanarpc.DecodeBase58(base58PubKey)
	if err != nil {
		return "", fmt.Errorf("xrpAddressFromEd25519PubKey: decode base58: %w", err)
	}
	if len(raw) != ed25519.PublicKeySize {
		return "", fmt.Errorf("xrpAddressFromEd25519PubKey: want %d-byte pubkey, got %d", ed25519.PublicKeySize, len(raw))
	}

	// 1. prefix with 0xED to mark as ed25519 (33 bytes)
	prefixed := append([]byte{0xED}, raw...)
	// 2. SHA-256 then RIPEMD-160 → AccountID
	sha := sha256.Sum256(prefixed)
	r := ripemd160.New()
	r.Write(sha[:])
	accountID := r.Sum(nil) // 20 bytes

	// 3-4. version byte 0x00 + AccountID + 4-byte double-SHA-256 checksum
	payload := make([]byte, 0, 25)
	payload = append(payload, 0x00)
	payload = append(payload, accountID...)
	chk1 := sha256.Sum256(payload)
	chk2 := sha256.Sum256(chk1[:])
	payload = append(payload, chk2[:4]...)

	// 5. base58 with Ripple alphabet
	return rippleBase58Encode(payload), nil
}

// rippleBase58Encode encodes payload using the Ripple alphabet. The
// algorithm is identical to standard base58: divide by 58 repeatedly,
// substituting digit values via rippleAlphabet. Leading zero bytes in
// the input map to leading `r` characters (the alphabet's character
// for digit 0) — matching the canonical XRPL implementation.
func rippleBase58Encode(payload []byte) string {
	// Count leading zeros — each maps to the alphabet's zero character.
	zeros := 0
	for zeros < len(payload) && payload[zeros] == 0 {
		zeros++
	}

	// big-endian base-58 conversion via byte-by-byte division.
	// Bounded buffer: ceil(log_58(256) * len) ≈ 1.366 * len.
	buf := make([]byte, len(payload)*138/100+1)
	high := len(buf) - 1
	for _, b := range payload {
		carry := int(b)
		idx := len(buf) - 1
		for idx >= 0 && (carry != 0 || idx >= high) {
			carry += 256 * int(buf[idx])
			buf[idx] = byte(carry % 58)
			carry /= 58
			idx--
		}
		high = idx + 1
	}

	// Skip leading zeros in the digit buffer (they're not the same as
	// leading-zero input bytes — those are handled separately below).
	j := 0
	for j < len(buf) && buf[j] == 0 {
		j++
	}

	out := make([]byte, zeros+len(buf)-j)
	for i := 0; i < zeros; i++ {
		out[i] = rippleAlphabet[0] // 'r'
	}
	for k, d := range buf[j:] {
		out[zeros+k] = rippleAlphabet[d]
	}
	return string(out)
}

// isXRPTestnet reports whether an internal network name is the XRPL
// testnet. r-addresses are network-agnostic so this is purely used by
// the bridge's RPC routing layer (deposit watcher + broadcast) to
// pick the altnet endpoint instead of the public cluster.
func isXRPTestnet(networkInternalName string) bool {
	return strings.EqualFold(networkInternalName, "XRP_TESTNET")
}
