package mchain

import (
	"crypto/ed25519"
	"encoding/hex"
	"fmt"
	"strings"

	tonwallet "github.com/xssnick/tonutils-go/ton/wallet"
)

// ton.go: TON address derivation from an MPC-supplied Ed25519 pubkey.
//
// This file is the bridge-side mirror of the cluster's eventual TON
// keygen output. The standard TON v4r2 wallet address is:
//
//	workchain = 0
//	state_init = StateInit { code: V4R2_CODE, data: { seqno=0, subwallet=698983191, pubkey, plugins=null } }
//	addr_data = sha256(StateInit_cell)
//	raw_form = "0:" + hex(addr_data)
//
// We delegate the actual cell encoding + hash to tonutils-go (the
// canonical Go SDK that the txassembler also depends on) so the
// address we surface from a keygen is bit-identical to the address
// the txassembler builds the state_init for in PreSignTON.
//
// Why mchain owns this rather than txassembler:
//   - Address selection happens at keygen time, before any tx
//     assembler is involved (the bridge stores the address and shows
//     it to the SDK + UI before the user ever deposits).
//   - mchain is the canonical "given a keygen result, what's the
//     receive address" function — putting this with the other
//     pickAddress branches keeps that contract in one place.

// deriveTONAddressFromHex parses a hex-encoded Ed25519 public key
// (32 bytes) and returns the v4r2 raw address ("0:<hex>") for that
// pubkey. Returns an error on malformed hex or wrong length.
//
// Hex input may carry a 0x prefix (case-insensitive). Trimmed and
// decoded with encoding/hex.
//
// The "raw form" return is intentional — it's the lowest-common-
// denominator representation. Callers that want the user-friendly
// "EQ..." / "UQ..." form should pull the txassembler helpers
// (TONAddressFromPubKey + .String()).
func deriveTONAddressFromHex(pubkeyHex string) (string, error) {
	pubkeyHex = strings.TrimPrefix(strings.TrimPrefix(pubkeyHex, "0x"), "0X")
	pubkey, err := hex.DecodeString(pubkeyHex)
	if err != nil {
		return "", fmt.Errorf("mchain: ton: decode ed25519 pubkey hex: %w", err)
	}
	if len(pubkey) != ed25519.PublicKeySize {
		return "", fmt.Errorf("mchain: ton: ed25519 pubkey wrong length: got %d want %d",
			len(pubkey), ed25519.PublicKeySize)
	}
	addr, err := tonwallet.AddressFromPubKey(pubkey, tonwallet.V4R2, tonwallet.DefaultSubwallet)
	if err != nil {
		return "", fmt.Errorf("mchain: ton: derive v4r2 address: %w", err)
	}
	return addr.StringRaw(), nil
}
