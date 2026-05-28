package mchain

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// Reference: the v4r2 address derivation is well-defined; we don't
// need to hard-code a fixture as long as we know:
//   - same pubkey → same address (deterministic)
//   - the returned address is "0:<64 hex chars>"
//   - different pubkeys → different addresses

func TestDeriveTONAddressFromHex_Deterministic(t *testing.T) {
	// 32 bytes of 0x42.
	pkHex := strings.Repeat("42", 32)
	a1, err := deriveTONAddressFromHex(pkHex)
	if err != nil {
		t.Fatal(err)
	}
	a2, err := deriveTONAddressFromHex("0x" + pkHex)
	if err != nil {
		t.Fatal(err)
	}
	if a1 != a2 {
		t.Errorf("non-deterministic across 0x prefix variants: %q vs %q", a1, a2)
	}
	if !strings.HasPrefix(a1, "0:") {
		t.Errorf("raw form should start with 0:, got %q", a1)
	}
	if len(strings.TrimPrefix(a1, "0:")) != 64 {
		t.Errorf("hex address data wrong length in %q", a1)
	}
}

func TestDeriveTONAddressFromHex_DifferentPubkeysDifferentAddresses(t *testing.T) {
	pk1 := strings.Repeat("01", 32)
	pk2 := strings.Repeat("02", 32)
	a1, _ := deriveTONAddressFromHex(pk1)
	a2, _ := deriveTONAddressFromHex(pk2)
	if a1 == a2 {
		t.Errorf("different pubkeys should yield different addresses: %s vs %s", a1, a2)
	}
}

func TestDeriveTONAddressFromHex_RejectsBadInput(t *testing.T) {
	cases := []struct{ name, in string }{
		{"empty", ""},
		{"short", "abcd"},
		{"non-hex", "zzzz" + strings.Repeat("00", 30)},
		{"odd length", "abc" + strings.Repeat("00", 30)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := deriveTONAddressFromHex(tc.in); err == nil {
				t.Errorf("expected error for %q", tc.in)
			}
		})
	}
}

// TestKeygen_TON_WithEdDSAPubKey_DerivesV4R2Address verifies the
// updated pickAddress branch: when the cluster surfaces EDDSAPubKey
// alongside the legacy SOL slot, we PREFER the v4r2-derived address.
func TestKeygen_TON_WithEdDSAPubKey_DerivesV4R2Address(t *testing.T) {
	// Fixed 32-byte Ed25519 pubkey for a deterministic address.
	pubkey := strings.Repeat("42", 32)
	pubkeyBytes, _ := hex.DecodeString(pubkey)
	_ = pubkeyBytes

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"wallet_id":     "bridge-ton_testnet-1718000000",
			"eth_address":   "0xshould_be_ignored",
			"sol_address":   "legacy_sol_slot_placeholder",
			"eddsa_pub_key": pubkey,
			"result_type":   "success",
		})
	}))
	defer srv.Close()

	c := &Client{APIURL: srv.URL, OrgID: "bridge", Timeout: time.Second}
	w, err := c.KeygenForDeposit(context.Background(), "TON_TESTNET")
	if err != nil {
		t.Fatalf("KeygenForDeposit: %v", err)
	}
	if w.AddressType != AddressTypeTON {
		t.Errorf("AddressType = %q, want %q", w.AddressType, AddressTypeTON)
	}
	if !strings.HasPrefix(w.Address, "0:") {
		t.Errorf("Address should be raw-form v4r2 (0:<hex>), got %q", w.Address)
	}
	if w.Address == "legacy_sol_slot_placeholder" {
		t.Error("when EDDSAPubKey is available, address should be derived, not pulled from SOL slot")
	}
	if w.EDDSAPubKey != pubkey {
		t.Errorf("EDDSAPubKey not surfaced on Wallet: got %q want %q", w.EDDSAPubKey, pubkey)
	}
}

// TestKeygen_TON_FallsBackToSOLSlot keeps the legacy behaviour
// alive for mpcd versions that don't yet emit eddsa_pub_key.
func TestKeygen_TON_FallsBackToSOLSlot(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"wallet_id":   "bridge-ton_testnet-1718000000",
			"sol_address": "ton_placeholder_from_sol_slot",
			"result_type": "success",
		})
	}))
	defer srv.Close()

	c := &Client{APIURL: srv.URL, OrgID: "bridge", Timeout: time.Second}
	w, err := c.KeygenForDeposit(context.Background(), "TON_TESTNET")
	if err != nil {
		t.Fatal(err)
	}
	if w.Address != "ton_placeholder_from_sol_slot" {
		t.Errorf("legacy fallback failed: got %q", w.Address)
	}
}

// TestKeygen_TON_SurfacesPubKeysOnWallet verifies the pubkey
// passthrough so downstream code (signing_driver, refund_driver) can
// recompute the on-chain address without re-querying mpcd.
func TestKeygen_TON_SurfacesPubKeysOnWallet(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"wallet_id":     "wid",
			"ecdsa_pub_key": "0xecdsa_hex",
			"eddsa_pub_key": "0xeddsa_hex_32bytes_should_be_64_hex_chars_here_yes",
			"sol_address":   "fallback",
			"result_type":   "success",
		})
	}))
	defer srv.Close()
	c := &Client{APIURL: srv.URL, OrgID: "bridge", Timeout: time.Second}
	w, err := c.KeygenForDeposit(context.Background(), "TON_TESTNET")
	if err != nil {
		t.Fatal(err)
	}
	if w.ECDSAPubKey != "0xecdsa_hex" {
		t.Errorf("ECDSAPubKey not surfaced: %q", w.ECDSAPubKey)
	}
	if w.EDDSAPubKey == "" {
		t.Error("EDDSAPubKey not surfaced")
	}
}
