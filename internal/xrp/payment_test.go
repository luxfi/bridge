package xrp

import (
	"bytes"
	"encoding/hex"
	"strings"
	"testing"
)

// Round-trip check: an r-address derived from a known ed25519 pubkey
// (test vector from mchain.xrp_address_test.go) must decode back to
// the canonical 20-byte AccountID derived by the same algorithm.
// AccountID fixtures verified against a Python reference (SHA-256 →
// RIPEMD-160 of 0xED-prefixed ed25519 pubkey). Each addr was derived
// from a known pubkey via mchain.xrpAddressFromEd25519PubKey; this
// asserts the inverse decode here in internal/xrp recovers the same
// 20-byte AccountID that the encoder hashed.
func TestAccountIDFromRAddress_KnownVectors(t *testing.T) {
	cases := []struct {
		addr          string
		wantAcctIDHex string
	}{
		// derived from pubkey 0x00..0x1F
		{
			addr:          "rDR3ovFUFWw8ojQaXBDBQCQS5eLrZxJuRX",
			wantAcctIDHex: "883202ddcf16efefdea64b6238b80ba2992f88e1",
		},
		// derived from pubkey 0x01 + 31 × 0x00
		{
			addr:          "r3rAk2rbTQ3inkutmWZcugaFs52BHGVSE8",
			wantAcctIDHex: "4cf695a07acd9eb4fe381b2c3f9bace73e444fbe",
		},
	}
	for _, tc := range cases {
		t.Run(tc.addr, func(t *testing.T) {
			got, err := AccountIDFromRAddress(tc.addr)
			if err != nil {
				t.Fatalf("decode %s: %v", tc.addr, err)
			}
			if hex.EncodeToString(got) != tc.wantAcctIDHex {
				t.Fatalf("AccountID mismatch:\n  got:  %x\n  want: %s", got, tc.wantAcctIDHex)
			}
		})
	}
}

func TestAccountIDFromRAddress_RejectsBadInput(t *testing.T) {
	cases := []struct {
		name string
		addr string
	}{
		{"empty", ""},
		{"no r prefix", "X3ovFUFWw8ojQaXBDBQCQS5eLrZxJuRX"},
		{"bad checksum (one char mutated)", "rDR3ovFUFWw8ojQaXBDBQCQS5eLrZxJuRY"},
		{"too short", "rDR3"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := AccountIDFromRAddress(tc.addr); err == nil {
				t.Fatalf("expected error for %q, got nil", tc.addr)
			}
		})
	}
}

// Field-ID encoding spot-checks per XRPL serialization spec.
func TestEncodeFieldID(t *testing.T) {
	cases := []struct {
		f    fieldID
		want []byte
	}{
		{fldTransactionType, []byte{0x12}},
		{fldFlags, []byte{0x22}},
		{fldSequence, []byte{0x24}},
		{fldAmount, []byte{0x61}},
		{fldFee, []byte{0x68}},
		{fldSigningPubKey, []byte{0x73}},
		{fldTxnSignature, []byte{0x74}},
		{fldAccount, []byte{0x81}},
		{fldDestination, []byte{0x83}},
		{fieldID{2, 14}, []byte{0x2E}},
		{fieldID{2, 16}, []byte{0x20, 0x10}},
		{fieldID{16, 1}, []byte{0x01, 0x10}},
		{fieldID{17, 17}, []byte{0x00, 0x11, 0x11}},
	}
	for _, tc := range cases {
		got := encodeFieldID(tc.f)
		if !bytes.Equal(got, tc.want) {
			t.Errorf("encodeFieldID(%+v) = % x, want % x", tc.f, got, tc.want)
		}
	}
}

func TestEncodeVL(t *testing.T) {
	cases := []struct {
		n    int
		want []byte
	}{
		{0, []byte{0x00}},
		{20, []byte{0x14}},
		{33, []byte{0x21}},
		{64, []byte{0x40}},
		{192, []byte{0xc0}},
		{193, []byte{0xc1, 0x00}},
	}
	for _, tc := range cases {
		got := encodeVL(tc.n)
		if !bytes.Equal(got, tc.want) {
			t.Errorf("encodeVL(%d) = % x, want % x", tc.n, got, tc.want)
		}
	}
}

func TestEncodeAmountXRP(t *testing.T) {
	got := encodeAmountXRP(1_000_000)
	want := []byte{0x40, 0x00, 0x00, 0x00, 0x00, 0x0F, 0x42, 0x40}
	if !bytes.Equal(got, want) {
		t.Errorf("encodeAmountXRP(1_000_000) = % x, want % x", got, want)
	}
	if got0 := encodeAmountXRP(0); got0[0] != 0x40 || got0[7] != 0x00 {
		t.Errorf("encodeAmountXRP(0) wrong shape: % x", got0)
	}
}

// End-to-end: serialize a Payment for signing + for broadcast.
func TestPayment_SerializeForSigning_StructuralShape(t *testing.T) {
	// 33-byte ed25519 SigningPubKey: ED prefix + 32 bytes of test data.
	pk := append([]byte{0xED}, bytes.Repeat([]byte{0x00}, 32)...)
	p := &Payment{
		Account:       "rDR3ovFUFWw8ojQaXBDBQCQS5eLrZxJuRX",
		Destination:   "r3rAk2rbTQ3inkutmWZcugaFs52BHGVSE8",
		AmountDrops:   1_000_000,
		FeeDrops:      12,
		Sequence:      1,
		Flags:         0,
		SigningPubKey: pk,
	}
	body, err := p.SerializeForSigning()
	if err != nil {
		t.Fatalf("SerializeForSigning: %v", err)
	}
	if !bytes.HasPrefix(body, SigningPrefix[:]) {
		t.Errorf("missing signing prefix")
	}
	if body[4] != 0x12 {
		t.Errorf("first field id after prefix = 0x%02x, want 0x12 (TransactionType)", body[4])
	}
	if len(body) < 100 || len(body) > 200 {
		t.Errorf("unexpected signing-body length: %d", len(body))
	}
}

func TestPayment_Serialize_RequiresSig(t *testing.T) {
	pk := append([]byte{0xED}, bytes.Repeat([]byte{0x00}, 32)...)
	p := &Payment{
		Account:       "rDR3ovFUFWw8ojQaXBDBQCQS5eLrZxJuRX",
		Destination:   "r3rAk2rbTQ3inkutmWZcugaFs52BHGVSE8",
		AmountDrops:   1_000_000,
		FeeDrops:      12,
		Sequence:      1,
		SigningPubKey: pk,
	}
	if _, err := p.Serialize(); err == nil {
		t.Fatal("Serialize without TxnSignature should error")
	}
	p.TxnSignature = bytes.Repeat([]byte{0xAA}, 64)
	blob, err := p.Serialize()
	if err != nil {
		t.Fatalf("Serialize with sig: %v", err)
	}
	hexStr, err := p.SerializeHex()
	if err != nil {
		t.Fatalf("SerializeHex: %v", err)
	}
	if !strings.HasPrefix(hexStr, "1200") {
		t.Errorf("serialized tx should start with field-id 0x12 + value 0x0000 (Payment), got %q", hexStr[:8])
	}
	if got := strings.ToUpper(hex.EncodeToString(blob)); got != hexStr {
		t.Errorf("SerializeHex disagrees with Serialize+hex.Encode")
	}
}
