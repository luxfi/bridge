package mchain

import (
	"encoding/hex"
	"strings"
	"testing"

	"github.com/luxfi/bridge/internal/solanarpc"
)

// Reference values computed via Python with the same algorithm
// (SHA-256 → RIPEMD-160 → version 0x00 prefix → 4-byte double-SHA-256
// checksum → base58 with the Ripple alphabet):
//
//	pk = bytes(range(32)) i.e. 0x00..0x1F  → rDR3ovFUFWw8ojQaXBDBQCQS5eLrZxJuRX
//	pk = 0x01 + 31 × 0x00                  → r3rAk2rbTQ3inkutmWZcugaFs52BHGVSE8
//
// These act as a behavioural fixture for the algorithm; any change to
// the encoding (alphabet, prefix byte, checksum length) will fail this
// test before it can reach a live Xaman address mismatch in prod.
func TestXRPAddressFromEd25519PubKey_KnownVectors(t *testing.T) {
	cases := []struct {
		name       string
		pubKeyHex  string
		wantAddr   string
	}{
		{
			name:      "pubkey = 0x00..0x1F",
			pubKeyHex: "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
			wantAddr:  "rDR3ovFUFWw8ojQaXBDBQCQS5eLrZxJuRX",
		},
		{
			name:      "pubkey = 0x01 + 31 zeros",
			pubKeyHex: "0100000000000000000000000000000000000000000000000000000000000000",
			wantAddr:  "r3rAk2rbTQ3inkutmWZcugaFs52BHGVSE8",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			raw, err := hex.DecodeString(tc.pubKeyHex)
			if err != nil {
				t.Fatalf("decode hex: %v", err)
			}
			b58 := solanarpc.EncodeBase58(raw)
			got, err := xrpAddressFromEd25519PubKey(b58)
			if err != nil {
				t.Fatalf("derive: %v", err)
			}
			if got != tc.wantAddr {
				t.Fatalf("address mismatch:\n  got:  %s\n  want: %s", got, tc.wantAddr)
			}
		})
	}
}

func TestXRPAddressFromEd25519PubKey_StartsWithR(t *testing.T) {
	// Any 32-byte input must produce an address starting with 'r'.
	// (The version byte 0x00 + Ripple alphabet's first char being 'r'
	// is what gives every XRP account this property.)
	raw := make([]byte, 32)
	for i := range raw {
		raw[i] = byte(i)
	}
	b58 := solanarpc.EncodeBase58(raw)
	addr, err := xrpAddressFromEd25519PubKey(b58)
	if err != nil {
		t.Fatalf("derive: %v", err)
	}
	if !strings.HasPrefix(addr, "r") {
		t.Fatalf("r-address should start with 'r', got: %s", addr)
	}
	// r-addresses are 25-35 chars in practice (the encoded form of a
	// 25-byte AccountID + checksum payload).
	if len(addr) < 25 || len(addr) > 35 {
		t.Fatalf("r-address length out of expected range (25-35), got %d: %s", len(addr), addr)
	}
}

func TestXRPAddressFromEd25519PubKey_Deterministic(t *testing.T) {
	raw := []byte{
		0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
		0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10,
		0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18,
		0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x20,
	}
	b58 := solanarpc.EncodeBase58(raw)
	first, err := xrpAddressFromEd25519PubKey(b58)
	if err != nil {
		t.Fatalf("derive 1: %v", err)
	}
	second, err := xrpAddressFromEd25519PubKey(b58)
	if err != nil {
		t.Fatalf("derive 2: %v", err)
	}
	if first != second {
		t.Fatalf("non-deterministic: %s != %s", first, second)
	}
}

func TestXRPAddressFromEd25519PubKey_DifferentPubkeysDifferentAddresses(t *testing.T) {
	a := make([]byte, 32)
	a[0] = 1
	b := make([]byte, 32)
	b[0] = 2

	aAddr, err := xrpAddressFromEd25519PubKey(solanarpc.EncodeBase58(a))
	if err != nil {
		t.Fatalf("a: %v", err)
	}
	bAddr, err := xrpAddressFromEd25519PubKey(solanarpc.EncodeBase58(b))
	if err != nil {
		t.Fatalf("b: %v", err)
	}
	if aAddr == bAddr {
		t.Fatalf("expected different addresses for different pubkeys, both got %s", aAddr)
	}
}

func TestXRPAddressFromEd25519PubKey_RejectsBadInput(t *testing.T) {
	if _, err := xrpAddressFromEd25519PubKey(""); err == nil {
		t.Fatal("empty input should error")
	}
	// Bad base58 — contains '0' which isn't in the Bitcoin base58 alphabet.
	if _, err := xrpAddressFromEd25519PubKey("0not-base58"); err == nil {
		t.Fatal("invalid base58 should error")
	}
	// Wrong-length pubkey (16 bytes, not 32) — must reject because
	// XRP ed25519 demands a full 32-byte pubkey.
	short := make([]byte, 16)
	if _, err := xrpAddressFromEd25519PubKey(solanarpc.EncodeBase58(short)); err == nil {
		t.Fatal("short pubkey should error")
	}
}

func TestIsXRPTestnet(t *testing.T) {
	if !isXRPTestnet("XRP_TESTNET") {
		t.Fatal("XRP_TESTNET should be testnet")
	}
	if isXRPTestnet("XRP_MAINNET") {
		t.Fatal("XRP_MAINNET should not be testnet")
	}
	if !isXRPTestnet("xrp_testnet") {
		t.Fatal("case should not matter")
	}
}
