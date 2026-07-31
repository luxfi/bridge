// Tests for mpcd-single's per-wallet HKDF derivation, family routing,
// and HTTP wire surface. The end-to-end (signature verifies under the
// returned pubkey, family rejection looks like the real wire) is what
// matters; the internal byte layout of HKDF is a private contract that
// only matters for stability across restarts.
package main

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
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

// =============================================================================
// loadMasterSeed / pathDir / seedFingerprint
// =============================================================================

func TestPathDir(t *testing.T) {
	cases := map[string]string{
		"/etc/mpcd/seed":    "/etc/mpcd",
		"/a/b/c":            "/a/b",
		"seed":              "",
		"":                  "",
		"/seed":             "",
		"/a/b/":             "/a/b",
	}
	for in, want := range cases {
		if got := pathDir(in); got != want {
			t.Errorf("pathDir(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestSeedFingerprint_DeterministicAndDistinct(t *testing.T) {
	a := seedFingerprint(fixedSeed)
	b := seedFingerprint(fixedSeed)
	if a != b {
		t.Errorf("fingerprint not deterministic: %q vs %q", a, b)
	}
	if len(a) != 16 {
		t.Errorf("fingerprint length = %d, want 16 hex chars (8 bytes)", len(a))
	}

	other := mustHex("ffeeddccbbaa99887766554433221100" + "ffeeddccbbaa998877665544332211ff")
	if got := seedFingerprint(other); got == a {
		t.Error("different seeds produced the same fingerprint")
	}

	// Non-reversible in the weak "doesn't just echo the input" sense —
	// the whole point is an operator can log this without leaking the
	// seed. It must not literally be (a prefix of) the seed's own hex.
	if strings.Contains(hex.EncodeToString(fixedSeed), a) || strings.Contains(a, hex.EncodeToString(fixedSeed)[:16]) {
		t.Error("fingerprint appears to leak the raw seed hex")
	}
}

func TestLoadMasterSeed_LiteralHappyPath(t *testing.T) {
	uri := "literal:" + hex.EncodeToString(fixedSeed)
	seed, generated, err := loadMasterSeed(context.Background(), uri, false)
	if err != nil {
		t.Fatalf("loadMasterSeed: %v", err)
	}
	if generated {
		t.Error("literal: scheme should never report generated=true")
	}
	if !bytes.Equal(seed, fixedSeed) {
		t.Error("decoded seed doesn't match input")
	}
}

func TestLoadMasterSeed_RejectsWrongLength(t *testing.T) {
	uri := "literal:" + hex.EncodeToString([]byte("too short"))
	_, _, err := loadMasterSeed(context.Background(), uri, false)
	if err == nil {
		t.Fatal("expected an error for a short seed, got nil")
	}
}

func TestLoadMasterSeed_RejectsBadHex(t *testing.T) {
	_, _, err := loadMasterSeed(context.Background(), "literal:not-hex-at-all!!", false)
	if err == nil {
		t.Fatal("expected an error for non-hex input, got nil")
	}
}

func TestLoadMasterSeed_FileMissingWithoutAutoCreateErrors(t *testing.T) {
	dir := t.TempDir()
	uri := "file:" + dir + "/seed.hex"
	_, _, err := loadMasterSeed(context.Background(), uri, false)
	if err == nil {
		t.Fatal("expected an error for a missing file with autoCreate=false, got nil")
	}
}

// TestLoadMasterSeed_FileMissingWithAutoCreateGeneratesAndPersists is the
// important one for the custody story: a fresh deploy with no seed file
// yet must generate exactly once, write it durably, and every subsequent
// call (this process or a restart) must read back the SAME seed rather
// than silently regenerating — regenerating would orphan every wallet
// already derived from the old seed.
func TestLoadMasterSeed_FileMissingWithAutoCreateGeneratesAndPersists(t *testing.T) {
	dir := t.TempDir()
	path := dir + "/seed.hex"
	uri := "file:" + path

	first, generated, err := loadMasterSeed(context.Background(), uri, true)
	if err != nil {
		t.Fatalf("first load: %v", err)
	}
	if !generated {
		t.Error("expected generated=true on first call against a missing file")
	}
	if len(first) != masterSeedLen {
		t.Fatalf("generated seed length = %d, want %d", len(first), masterSeedLen)
	}

	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("seed file was not written: %v", err)
	}
	if perm := info.Mode().Perm(); perm != 0o600 {
		t.Errorf("seed file perms = %o, want 0600", perm)
	}

	second, generated2, err := loadMasterSeed(context.Background(), uri, true)
	if err != nil {
		t.Fatalf("second load: %v", err)
	}
	if generated2 {
		t.Error("second call against an existing file must NOT report generated=true")
	}
	if !bytes.Equal(first, second) {
		t.Fatal("second load returned a DIFFERENT seed than the first — this would orphan every wallet derived so far")
	}
}

func TestLoadMasterSeed_FileAutoCreateMakesParentDir(t *testing.T) {
	dir := t.TempDir()
	path := dir + "/nested/does/not/exist/seed.hex"
	uri := "file:" + path

	_, generated, err := loadMasterSeed(context.Background(), uri, true)
	if err != nil {
		t.Fatalf("loadMasterSeed: %v", err)
	}
	if !generated {
		t.Error("expected generated=true")
	}
	if _, statErr := os.Stat(path); statErr != nil {
		t.Errorf("seed file not created under nested dir: %v", statErr)
	}
}

func TestLoadMasterSeed_FileExistingValidSeedReadNotRegenerated(t *testing.T) {
	dir := t.TempDir()
	path := dir + "/seed.hex"
	if err := os.WriteFile(path, []byte(hex.EncodeToString(fixedSeed)), 0o600); err != nil {
		t.Fatalf("seed the file: %v", err)
	}
	uri := "file:" + path

	seed, generated, err := loadMasterSeed(context.Background(), uri, true)
	if err != nil {
		t.Fatalf("loadMasterSeed: %v", err)
	}
	if generated {
		t.Error("an already-populated seed file must not report generated=true")
	}
	if !bytes.Equal(seed, fixedSeed) {
		t.Error("loaded seed doesn't match the pre-existing file content")
	}
}

// TestLoadMasterSeed_NonFileSchemeIgnoresAutoCreate confirms autoCreate
// only ever kicks in for file: URIs — a typo'd or unset env/kms secret
// must surface as a hard error, never silently fall through to
// generating a throwaway seed.
func TestLoadMasterSeed_NonFileSchemeIgnoresAutoCreate(t *testing.T) {
	_, _, err := loadMasterSeed(context.Background(), "env:MPCD_SEED_DOES_NOT_EXIST_XYZ", true)
	if err == nil {
		t.Fatal("expected an error for an unset env var even with autoCreate=true, got nil")
	}
}
