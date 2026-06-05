// Tests for mpcd-single's per-wallet HKDF derivation, family routing,
// and HTTP wire surface. The end-to-end (signature verifies under the
// returned pubkey, family rejection looks like the real wire) is what
// matters; the internal byte layout of HKDF is a private contract that
// only matters for stability across restarts.
package main

import (
	"bytes"
	"crypto/ed25519"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// fixedSeed is a known-good 32-byte master seed used across tests. The
// hex is arbitrary — what matters is that it is the SAME across every
// test so derivation outputs stay table-stable.
var fixedSeed = mustHex("00112233445566778899aabbccddeeff" + "112233445566778899aabbccddeeff00")

func mustHex(s string) []byte {
	b, err := hex.DecodeString(s)
	if err != nil {
		panic(err)
	}
	return b
}

func TestFamilyFor(t *testing.T) {
	cases := []struct {
		wallet string
		want   string
	}{
		// ed25519 family — every chain that uses ed25519 for signing.
		{"bridge-solana_devnet-1780000000", "eddsa"},
		{"bridge-sol_devnet-1780000000", "eddsa"},
		{"release-wallet-SOLANA_DEVNET", "eddsa"},
		{"bridge-ton_testnet-1780000000", "eddsa"},
		{"release-wallet-TON_TESTNET", "eddsa"},
		{"bridge-xrp_testnet-1780000000", "eddsa"},
		{"release-wallet-XRP_TESTNET", "eddsa"},
		// EVM / BTC / unknown → not eddsa.
		{"bridge-ethereum_sepolia-1780000000", "ecdsa"},
		{"bridge-lux_testnet-1780000000", "ecdsa"},
		{"release-wallet-LUX_TESTNET", "ecdsa"},
		{"bridge-btc_mainnet-1780000000", "ecdsa"},
		{"", "ecdsa"},
	}
	for _, tc := range cases {
		t.Run(tc.wallet, func(t *testing.T) {
			if got := familyFor(tc.wallet); got != tc.want {
				t.Fatalf("familyFor(%q) = %q, want %q", tc.wallet, got, tc.want)
			}
		})
	}
}

// TestDeriveEd25519Key_Deterministic locks the restart-safety contract:
// the same (seed, walletID) → the same private key, byte-for-byte. If
// this regresses, every previously-derived deposit address rotates
// without warning.
func TestDeriveEd25519Key_Deterministic(t *testing.T) {
	walletID := "bridge-xrp_testnet-1780600000000"
	priv1 := deriveEd25519Key(fixedSeed, walletID)
	priv2 := deriveEd25519Key(fixedSeed, walletID)
	if !bytes.Equal(priv1, priv2) {
		t.Fatal("deriveEd25519Key not deterministic for same (seed, walletID)")
	}
}

// TestDeriveEd25519Key_PerWalletUnique catches the actual fake-mpcd bug
// this binary was built to fix: two different wallets must NOT share a
// signing key.
func TestDeriveEd25519Key_PerWalletUnique(t *testing.T) {
	a := deriveEd25519Key(fixedSeed, "bridge-xrp_testnet-aaaaaaaaaaaa")
	b := deriveEd25519Key(fixedSeed, "bridge-xrp_testnet-bbbbbbbbbbbb")
	if bytes.Equal(a, b) {
		t.Fatal("deriveEd25519Key collided across two distinct walletIDs — the very bug mpcd-single exists to fix")
	}
}

// TestDeriveEd25519Key_DomainSeparated verifies that the eth_address
// stub and the ed25519 private key don't share derivation output — the
// info-label domain separation must hold.
func TestDeriveEd25519Key_DomainSeparated(t *testing.T) {
	walletID := "bridge-ton_testnet-1780000000"
	priv := deriveEd25519Key(fixedSeed, walletID)
	ethStub := deriveEthAddressStub(fixedSeed, walletID)
	if strings.Contains(strings.ToLower(ethStub), hex.EncodeToString(priv.Seed())[:8]) {
		t.Fatalf("eth stub %q starts with first 4 bytes of ed25519 seed — domain separation appears broken", ethStub)
	}
}

// TestKeygenHandler_RoundTrip validates the wire shape the bridge
// expects (sol_address, eddsa_pub_key, eth_address, result_type) and
// that the returned ed25519 public key actually verifies a signature
// over the returned sol_address. This is end-to-end proof that the
// keygen pubkey and the sign privkey come from the same derivation.
func TestKeygenHandler_RoundTrip(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(keygenHandler(fixedSeed)))
	defer ts.Close()

	body, _ := json.Marshal(map[string]any{
		"org_id":    "test-org",
		"wallet_id": "bridge-xrp_testnet-1780000000",
	})
	resp, err := http.Post(ts.URL, "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("post: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("status %d", resp.StatusCode)
	}
	var got map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	for _, k := range []string{"wallet_id", "sol_address", "eth_address", "eddsa_pub_key", "result_type"} {
		if _, ok := got[k]; !ok {
			t.Errorf("missing %q in response", k)
		}
	}
	if got["result_type"] != "success" {
		t.Errorf("result_type=%v, want success", got["result_type"])
	}

	// The returned eddsa_pub_key must match the locally-derived private
	// key's public half — proves /keygen and the derivation function
	// stay in sync.
	pubHex, _ := got["eddsa_pub_key"].(string)
	wantPub := deriveEd25519Key(fixedSeed, "bridge-xrp_testnet-1780000000").Public().(ed25519.PublicKey)
	if pubHex != hex.EncodeToString(wantPub) {
		t.Fatalf("returned pubkey %q != derived %q", pubHex, hex.EncodeToString(wantPub))
	}
}

// TestSignHandler_Eddsa_VerifiesUnderKeygenPubkey is the cross-handler
// invariant: a signature from /sign must verify under the public key
// /keygen returned for the same wallet_id. This catches drift between
// the two derivations.
func TestSignHandler_Eddsa_VerifiesUnderKeygenPubkey(t *testing.T) {
	walletID := "bridge-xrp_testnet-1780000000"
	msg := []byte("an arbitrary XRPL-style 32-byte digest aaaaaa")[:32]

	ts := httptest.NewServer(http.HandlerFunc(signHandler(fixedSeed)))
	defer ts.Close()

	body, _ := json.Marshal(map[string]any{
		"org_id":    "test-org",
		"wallet_id": walletID,
		"message":   hex.EncodeToString(msg),
	})
	resp, err := http.Post(ts.URL, "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("post: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("status %d", resp.StatusCode)
	}
	var got map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&got)
	sigHex, _ := got["signature"].(string)
	sig, err := hex.DecodeString(sigHex)
	if err != nil {
		t.Fatalf("sig hex: %v", err)
	}
	if len(sig) != ed25519.SignatureSize {
		t.Fatalf("signature length %d, want %d", len(sig), ed25519.SignatureSize)
	}

	pub := deriveEd25519Key(fixedSeed, walletID).Public().(ed25519.PublicKey)
	if !ed25519.Verify(pub, msg, sig) {
		t.Fatal("signature did not verify under the derived pubkey — sign vs keygen derivation drift")
	}
}

// TestSignHandler_RejectsEcdsa pins the EVM-rejection contract: an
// ECDSA-family wallet_id must produce a 400 + structured error, not a
// silently-wrong ed25519 signature over a keccak sighash.
func TestSignHandler_RejectsEcdsa(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(signHandler(fixedSeed)))
	defer ts.Close()

	body, _ := json.Marshal(map[string]any{
		"org_id":    "test-org",
		"wallet_id": "bridge-ethereum_sepolia-1780000000",
		"message":   strings.Repeat("ab", 32),
	})
	resp, err := http.Post(ts.URL, "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("post: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("status %d, want 400", resp.StatusCode)
	}
	var got map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&got)
	if got["error_code"] != "unsupported_scheme" {
		t.Fatalf("error_code=%v, want unsupported_scheme", got["error_code"])
	}
}

// TestSignHandler_XrpFamilyAccepted regression test: the previous
// fake-mpcd's isEd25519 check did not include xrp_; a 32-byte XRPL
// digest from a bridge-xrp_testnet wallet would have been rejected as
// an EVM sighash. Lock that this no longer happens.
func TestSignHandler_XrpFamilyAccepted(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(signHandler(fixedSeed)))
	defer ts.Close()

	body, _ := json.Marshal(map[string]any{
		"org_id":    "test-org",
		"wallet_id": "bridge-xrp_testnet-1780000000",
		"message":   strings.Repeat("ab", 32), // 32 bytes — would-be sighash shape
	})
	resp, err := http.Post(ts.URL, "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("post: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("status %d, want 200 — XRP family must accept 32-byte messages", resp.StatusCode)
	}
}
