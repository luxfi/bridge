// btc_address_test.go: bech32 P2WPKH derivation tests.
//
// Coverage:
//   - HASH160(compressed pubkey) → P2WPKH bech32 matches btcutil's
//     reference implementation
//   - 65-byte uncompressed → matches the same derived 33-byte
//     compressed
//   - 64-byte uncompressed without 0x04 marker
//   - 32-byte x-only → defaults to even-y
//   - mainnet vs testnet HRP selection from network internal name
//   - Empty / malformed input returns an error
//   - Keygen → Wallet round-trip prefers the derived P2WPKH over the
//     legacy P2PKH BTCAddress slot when ECDSAPubKey is present

package mchain

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"testing"
	"time"

	"github.com/btcsuite/btcd/btcutil"
	"github.com/btcsuite/btcd/chaincfg"
	"golang.org/x/crypto/ripemd160"
)

// A canonical secp256k1 generator point pubkey (= G * 1).
// Compressed form: 02 79be667e...
// Uncompressed form: 04 79be667e... 483ada77...
const (
	pubKeyGCompressed   = "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"
	pubKeyGUncompressed = "0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798" +
		"483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8"
	pubKeyGRawX = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"
)

// referenceBech32Address returns the P2WPKH bech32 address we'd
// expect for a given compressed pubkey. Computed using btcutil's
// canonical implementation as the oracle.
func referenceBech32Address(t *testing.T, params *chaincfg.Params, compressedHex string) string {
	t.Helper()
	pub, err := hex.DecodeString(compressedHex)
	if err != nil {
		t.Fatal(err)
	}
	sha := sha256.Sum256(pub)
	rip := ripemd160.New()
	rip.Write(sha[:])
	pkh := rip.Sum(nil)
	addr, err := btcutil.NewAddressWitnessPubKeyHash(pkh, params)
	if err != nil {
		t.Fatal(err)
	}
	return addr.EncodeAddress()
}

// =============================================================================
// deriveBTCBech32Address
// =============================================================================

func TestDeriveBTCBech32Address_Mainnet(t *testing.T) {
	want := referenceBech32Address(t, &chaincfg.MainNetParams, pubKeyGCompressed)
	got, err := deriveBTCBech32Address(pubKeyGCompressed, "BITCOIN_MAINNET")
	if err != nil {
		t.Fatalf("derive: %v", err)
	}
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
	if !strings.HasPrefix(got, "bc1q") {
		t.Errorf("mainnet address should start with bc1q; got %q", got)
	}
}

func TestDeriveBTCBech32Address_Testnet(t *testing.T) {
	want := referenceBech32Address(t, &chaincfg.TestNet3Params, pubKeyGCompressed)
	got, err := deriveBTCBech32Address(pubKeyGCompressed, "BITCOIN_TESTNET")
	if err != nil {
		t.Fatalf("derive: %v", err)
	}
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
	if !strings.HasPrefix(got, "tb1q") {
		t.Errorf("testnet address should start with tb1q; got %q", got)
	}
}

func TestDeriveBTCBech32Address_UncompressedInput(t *testing.T) {
	want := referenceBech32Address(t, &chaincfg.MainNetParams, pubKeyGCompressed)
	got, err := deriveBTCBech32Address(pubKeyGUncompressed, "BITCOIN_MAINNET")
	if err != nil {
		t.Fatalf("derive: %v", err)
	}
	if got != want {
		t.Errorf("uncompressed should compress to same address: got %q, want %q", got, want)
	}
}

func TestDeriveBTCBech32Address_XOnlyInput(t *testing.T) {
	// 32-byte x-only defaults to even-y → same as the compressed form
	// for the generator (which has 02 prefix = even).
	want := referenceBech32Address(t, &chaincfg.MainNetParams, pubKeyGCompressed)
	got, err := deriveBTCBech32Address(pubKeyGRawX, "BITCOIN_MAINNET")
	if err != nil {
		t.Fatalf("derive: %v", err)
	}
	if got != want {
		t.Errorf("x-only should match even-y compressed: got %q, want %q", got, want)
	}
}

func TestDeriveBTCBech32Address_Empty(t *testing.T) {
	_, err := deriveBTCBech32Address("", "BITCOIN_MAINNET")
	if err == nil {
		t.Error("expected error for empty pubkey")
	}
}

func TestDeriveBTCBech32Address_MalformedHex(t *testing.T) {
	_, err := deriveBTCBech32Address("zzz", "BITCOIN_MAINNET")
	if err == nil {
		t.Error("expected error for malformed hex")
	}
}

func TestDeriveBTCBech32Address_WrongLength(t *testing.T) {
	// 8 bytes (16 hex chars) — not a valid secp256k1 pubkey shape.
	_, err := deriveBTCBech32Address("0102030405060708", "BITCOIN_MAINNET")
	if err == nil {
		t.Error("expected error for pubkey of wrong length")
	}
}

func TestDeriveBTCBech32Address_UnknownNetworkDefaultsMainnet(t *testing.T) {
	got, err := deriveBTCBech32Address(pubKeyGCompressed, "")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(got, "bc1q") {
		t.Errorf("empty network should default to mainnet; got %q", got)
	}
}

// =============================================================================
// compressSecp256k1Pubkey
// =============================================================================

func TestCompressSecp256k1Pubkey_FromUncompressed(t *testing.T) {
	uncompressed, _ := hex.DecodeString(pubKeyGUncompressed)
	got := compressSecp256k1Pubkey(uncompressed)
	if len(got) != 33 {
		t.Errorf("output length = %d, want 33", len(got))
	}
	want, _ := hex.DecodeString(pubKeyGCompressed)
	if string(got) != string(want) {
		t.Errorf("got %x, want %x", got, want)
	}
}

func TestCompressSecp256k1Pubkey_Passthrough(t *testing.T) {
	compressed, _ := hex.DecodeString(pubKeyGCompressed)
	got := compressSecp256k1Pubkey(compressed)
	if string(got) != string(compressed) {
		t.Errorf("compressed-in should be passed through unchanged")
	}
}

func TestCompressSecp256k1Pubkey_RejectsBadLength(t *testing.T) {
	if got := compressSecp256k1Pubkey([]byte{0x01, 0x02}); got != nil {
		t.Errorf("expected nil for invalid-length input, got %x", got)
	}
}

// =============================================================================
// Keygen integration: ECDSAPubKey present → derived P2WPKH wins
// =============================================================================

func TestKeygen_BTC_DerivedP2WPKHOverridesLegacyP2PKH(t *testing.T) {
	m := newMockCluster(t)
	m.result = &keygenResult{
		WalletID:    "wid",
		ECDSAPubKey: pubKeyGCompressed,
		BTCAddress:  "1LegacyP2PKHAddrShouldNotBePicked", // legacy P2PKH
		ResultType:  "success",
	}
	c := clientFor(m)
	c.Timeout = time.Second // keep test snappy

	w, err := c.KeygenForDepositWithOrg(context.Background(), "BITCOIN_MAINNET", "org-1")
	if err != nil {
		t.Fatalf("KeygenForDeposit: %v", err)
	}
	// Should be the locally-derived bech32 P2WPKH, NOT the legacy P2PKH.
	if !strings.HasPrefix(w.Address, "bc1q") {
		t.Errorf("expected bech32 P2WPKH, got %q", w.Address)
	}
	if len(w.ECDSAPubKey) != 33 {
		t.Errorf("expected 33-byte compressed pubkey on wallet, got %d", len(w.ECDSAPubKey))
	}
}

func TestKeygen_BTC_NoPubKeyFallsBackToLegacyBTCAddress(t *testing.T) {
	m := newMockCluster(t)
	m.result = &keygenResult{
		WalletID:   "wid",
		BTCAddress: "1LegacyP2PKHAddr",
		ResultType: "success",
	}
	c := clientFor(m)
	c.Timeout = time.Second

	w, err := c.KeygenForDepositWithOrg(context.Background(), "BITCOIN_MAINNET", "org-1")
	if err != nil {
		t.Fatalf("KeygenForDeposit: %v", err)
	}
	if w.Address != "1LegacyP2PKHAddr" {
		t.Errorf("expected legacy P2PKH fallback, got %q", w.Address)
	}
}

func TestKeygen_BTC_TestnetDerivation(t *testing.T) {
	m := newMockCluster(t)
	m.result = &keygenResult{
		WalletID:    "wid",
		ECDSAPubKey: pubKeyGCompressed,
		ResultType:  "success",
	}
	c := clientFor(m)
	c.Timeout = time.Second

	w, err := c.KeygenForDepositWithOrg(context.Background(), "BITCOIN_TESTNET", "org-1")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(w.Address, "tb1q") {
		t.Errorf("expected tb1q (testnet hrp), got %q", w.Address)
	}
}
