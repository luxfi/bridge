package mchain

import (
	"bytes"
	"strings"
	"testing"
)

// TestBtcAddressForTestnet_MainnetP2PKH_ConvertsToTestnet uses the
// empirical address mpcd returned for a BITCOIN_TESTNET keygen on
// 2026-05-28. We decode the original to extract the hash160 payload,
// then run the converter and verify the result decodes back to the
// same hash160 with the testnet version byte (0x6f).
func TestBtcAddressForTestnet_MainnetP2PKH_ConvertsToTestnet(t *testing.T) {
	mainnetAddr := "1Ld2qdqUDKhvHZze2bWoZtZxznpZWB65Fi"

	// Decode the mainnet input directly to grab the hash160 we expect
	// the testnet output to carry.
	mainnetPayload, mainnetVersion, err := base58CheckDecode(mainnetAddr)
	if err != nil {
		t.Fatalf("decode mainnet input: %v", err)
	}
	if mainnetVersion != btcP2PKHMainnet {
		t.Fatalf("input version = 0x%02x, want 0x00 (P2PKH mainnet)", mainnetVersion)
	}
	if len(mainnetPayload) != 20 {
		t.Fatalf("input payload length = %d, want 20 (hash160)", len(mainnetPayload))
	}

	got, err := btcAddressForTestnet(mainnetAddr)
	if err != nil {
		t.Fatalf("convert: %v", err)
	}
	// P2PKH testnet addresses start with 'm' or 'n'.
	if got[0] != 'm' && got[0] != 'n' {
		t.Errorf("converted address %q does not start with m/n", got)
	}
	// Round-trip the converted address and verify same hash160 with the
	// testnet version byte.
	testnetPayload, testnetVersion, err := base58CheckDecode(got)
	if err != nil {
		t.Fatalf("decode converted: %v", err)
	}
	if testnetVersion != btcP2PKHTestnet {
		t.Errorf("output version = 0x%02x, want 0x6f (P2PKH testnet)", testnetVersion)
	}
	if !bytes.Equal(testnetPayload, mainnetPayload) {
		t.Errorf("payload changed: in=%x out=%x", mainnetPayload, testnetPayload)
	}
}

// TestBtcAddressForTestnet_AlreadyTestnetP2PKH_Unchanged confirms
// idempotency. The bridge calls btcAddressForTestnet unconditionally
// when network is BITCOIN_TESTNET — once mpcd is fixed to return the
// right address up-front, the call becomes a no-op.
func TestBtcAddressForTestnet_AlreadyTestnetP2PKH_Unchanged(t *testing.T) {
	// First convert the mainnet input to grab a real testnet address
	// (avoids depending on an external test vector that could be stale).
	mainnet := "1Ld2qdqUDKhvHZze2bWoZtZxznpZWB65Fi"
	testnet, err := btcAddressForTestnet(mainnet)
	if err != nil {
		t.Fatalf("seed conversion: %v", err)
	}
	// Second call must return the input unchanged.
	got, err := btcAddressForTestnet(testnet)
	if err != nil {
		t.Fatalf("idempotent call: %v", err)
	}
	if got != testnet {
		t.Errorf("got %q, want %q (unchanged)", got, testnet)
	}
}

// TestBtcAddressForTestnet_MainnetP2SH_ConvertsToTestnet covers the
// defensive P2SH branch. P2SH mainnet (version 0x05, starts with '3')
// becomes P2SH testnet (version 0xc4, starts with '2'). We synthesize
// a P2SH mainnet address from the empirical P2PKH payload by re-
// encoding with version 0x05, then run the converter.
func TestBtcAddressForTestnet_MainnetP2SH_ConvertsToTestnet(t *testing.T) {
	// Grab a known 20-byte hash160 by decoding the empirical input.
	payload, _, err := base58CheckDecode("1Ld2qdqUDKhvHZze2bWoZtZxznpZWB65Fi")
	if err != nil {
		t.Fatalf("seed decode: %v", err)
	}
	mainnetP2SH := base58CheckEncode(btcP2SHMainnet, payload)
	if !strings.HasPrefix(mainnetP2SH, "3") {
		t.Fatalf("synthesized mainnet P2SH should start with '3', got %q", mainnetP2SH)
	}

	got, err := btcAddressForTestnet(mainnetP2SH)
	if err != nil {
		t.Fatalf("convert P2SH: %v", err)
	}
	if !strings.HasPrefix(got, "2") {
		t.Errorf("testnet P2SH should start with '2', got %q", got)
	}
	testnetPayload, testnetVersion, err := base58CheckDecode(got)
	if err != nil {
		t.Fatalf("decode converted P2SH: %v", err)
	}
	if testnetVersion != btcP2SHTestnet {
		t.Errorf("version = 0x%02x, want 0xc4", testnetVersion)
	}
	if !bytes.Equal(testnetPayload, payload) {
		t.Errorf("payload changed: in=%x out=%x", payload, testnetPayload)
	}
}

// TestBtcAddressForTestnet_Bech32Testnet_Unchanged confirms that
// bech32 testnet addresses (tb1…) pass through unchanged. This is
// the path the existing mchain test relies on
// (client_test.go:155 uses BTCAddress="tb1qbtcaddress").
func TestBtcAddressForTestnet_Bech32Testnet_Unchanged(t *testing.T) {
	in := "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx"
	got, err := btcAddressForTestnet(in)
	if err != nil {
		t.Fatalf("convert bech32 testnet: %v", err)
	}
	if got != in {
		t.Errorf("got %q, want %q (unchanged)", got, in)
	}
}

// TestBtcAddressForTestnet_Bech32Mainnet_Errors confirms that
// mainnet bech32 (bc1…) is rejected with a clear error rather than
// silently returned — we don't expect mpcd to produce these, so
// catching it loudly is the safer default.
func TestBtcAddressForTestnet_Bech32Mainnet_Errors(t *testing.T) {
	in := "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"
	_, err := btcAddressForTestnet(in)
	if err == nil {
		t.Errorf("expected error for mainnet bech32, got nil")
	}
}

// TestBtcAddressForTestnet_BadChecksum_Errors corrupts the last
// character of a valid mainnet address. Decode should detect the
// checksum mismatch.
func TestBtcAddressForTestnet_BadChecksum_Errors(t *testing.T) {
	// Last char flipped from 'i' to 'j'.
	in := "1Ld2qdqUDKhvHZze2bWoZtZxznpZWB65Fj"
	_, err := btcAddressForTestnet(in)
	if err == nil {
		t.Errorf("expected checksum mismatch error, got nil")
	}
	if !strings.Contains(err.Error(), "checksum") {
		t.Errorf("error should mention checksum, got %v", err)
	}
}

// TestBtcAddressForTestnet_Empty_Errors covers the empty-input guard.
func TestBtcAddressForTestnet_Empty_Errors(t *testing.T) {
	_, err := btcAddressForTestnet("")
	if err == nil {
		t.Errorf("expected error for empty input")
	}
}

// TestBase58Encode_LeadingZerosToOnes verifies the leading-zero
// preservation property. Every leading 0x00 byte in the input must
// produce one leading '1' character in the output.
func TestBase58Encode_LeadingZerosToOnes(t *testing.T) {
	for _, n := range []int{1, 2, 5} {
		in := make([]byte, n+1)
		in[n] = 0x01 // one non-zero byte after the leading zeros
		out := base58Encode(in)
		got := 0
		for ; got < len(out) && out[got] == '1'; got++ {
		}
		if got != n {
			t.Errorf("input with %d leading zeros: encoded with %d leading '1's: %q", n, got, out)
		}
	}
}

// TestBase58Decode_LeadingOnesToZeros verifies the inverse property.
func TestBase58Decode_LeadingOnesToZeros(t *testing.T) {
	// Encode 0x00 0x00 0x42 → expect '1' '1' + base58(0x42)
	encoded := base58Encode([]byte{0x00, 0x00, 0x42})
	out, err := base58Decode(encoded)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(out) < 2 || out[0] != 0 || out[1] != 0 {
		t.Errorf("decoded %x, expected two leading zeros", out)
	}
}

// TestBase58Decode_InvalidChar errors on characters outside the
// Bitcoin base58 alphabet (0, O, I, l are excluded).
func TestBase58Decode_InvalidChar(t *testing.T) {
	for _, bad := range []string{"abc0def", "abcOdef", "abcIdef", "abclef"} {
		if _, err := base58Decode(bad); err == nil {
			t.Errorf("expected error for input with disallowed char: %q", bad)
		}
	}
}

// TestIsBTCTestnet covers the network-name gate.
func TestIsBTCTestnet(t *testing.T) {
	cases := map[string]bool{
		"BITCOIN_TESTNET": true,
		"bitcoin_testnet": true, // case-insensitive
		"BITCOIN_SIGNET":  true,
		"BITCOIN_REGTEST": true,
		"BITCOIN_MAINNET": false,
		"ETHEREUM_SEPOLIA": false,
		"":                false,
	}
	for net, want := range cases {
		if got := isBTCTestnet(net); got != want {
			t.Errorf("isBTCTestnet(%q) = %v, want %v", net, got, want)
		}
	}
}
