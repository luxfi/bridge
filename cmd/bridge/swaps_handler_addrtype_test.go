// Address-family heuristic checks for addressMatchesType. The handler
// uses this at swap-create time to catch the "user pasted an EVM hex
// where an r-address / TON friendly-form was expected" class of bug
// before the swap reaches the refund driver and bricks.

package main

import (
	"testing"

	"github.com/luxfi/bridge/internal/mchain"
)

func TestAddressMatchesType_XRP(t *testing.T) {
	cases := []struct {
		name string
		addr string
		want bool
	}{
		// Real-looking r-addresses (derived from known test vectors
		// in internal/mchain/xrp_address_test.go).
		{"valid r-address (28 chars)", "rDR3ovFUFWw8ojQaXBDBQCQS5eLrZxJuRX", true},
		{"valid r-address (28 chars #2)", "r3rAk2rbTQ3inkutmWZcugaFs52BHGVSE8", true},
		// Wrong prefix.
		{"EVM hex rejected for XRP", "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473", false},
		{"missing r prefix", "DR3ovFUFWw8ojQaXBDBQCQS5eLrZxJuRX", false},
		// TON addresses also start with letters but have different chars.
		{"TON kQ rejected", "kQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", false},
		// Solana base58 is the same alphabet — but Sol addresses don't
		// start with 'r' (well, they could; that's the trap). The
		// length distinguishes: Sol is 32-44 chars, XRP is 25-35.
		// A 44-char Sol pubkey starting with 'r' would technically
		// match — accepted, surfaced for completeness as a known
		// limitation. We assert the typical short case is rejected
		// when the chars are wrong (capital O in Ripple alphabet
		// would fail).
		{"contains 0 (not in Ripple alphabet)", "r0R3ovFUFWw8ojQaXBDBQCQS5eLrZxJuRX", false},
		{"contains capital O (not in Ripple alphabet)", "rOR3ovFUFWw8ojQaXBDBQCQS5eLrZxJuRX", false},
		{"contains capital I (not in Ripple alphabet)", "rIR3ovFUFWw8ojQaXBDBQCQS5eLrZxJuRX", false},
		{"contains lowercase l (not in Ripple alphabet)", "rlR3ovFUFWw8ojQaXBDBQCQS5eLrZxJuRX", false},
		// Length bounds.
		{"too short", "rDR3", false},
		{"empty", "", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := addressMatchesType(tc.addr, mchain.AddressTypeXRP)
			if got != tc.want {
				t.Errorf("addressMatchesType(%q, XRP) = %v, want %v",
					tc.addr, got, tc.want)
			}
		})
	}
}

// Regression guard: TON addresses must still validate correctly and
// XRP addresses must NOT pass as TON (their formats are disjoint).
func TestAddressMatchesType_TON_XRP_AreDisjoint(t *testing.T) {
	const ton = "kQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
	const xrp = "rDR3ovFUFWw8ojQaXBDBQCQS5eLrZxJuRX"
	if !addressMatchesType(ton, mchain.AddressTypeTON) {
		t.Error("regression: valid TON address rejected by TON matcher")
	}
	if addressMatchesType(ton, mchain.AddressTypeXRP) {
		t.Error("regression: TON address falsely matched XRP")
	}
	if !addressMatchesType(xrp, mchain.AddressTypeXRP) {
		t.Error("regression: valid XRP address rejected by XRP matcher")
	}
	if addressMatchesType(xrp, mchain.AddressTypeTON) {
		t.Error("regression: XRP address falsely matched TON")
	}
}
