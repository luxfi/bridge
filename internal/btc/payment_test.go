package btc

import (
	"encoding/hex"
	"strings"
	"testing"
)

// ───────────────────────────────────────────────────────────────────
// Address codec round-trips
// ───────────────────────────────────────────────────────────────────

func TestDecodeAddress_P2WPKHTestnet(t *testing.T) {
	// The Xverse wallet's BIP-84 idx[0] address we already use for
	// smoke testing. Round-trip from address → hash160 → address.
	addr := "tb1q20uepfp8mvj7tckntaajcrsuvsjwlealv9knsd"
	dec, err := DecodeAddress(addr, TestnetParams)
	if err != nil {
		t.Fatalf("DecodeAddress: %v", err)
	}
	if dec.Kind != ScriptP2WPKH {
		t.Fatalf("Kind = %s, want P2WPKH", dec.Kind)
	}
	if len(dec.Hash) != 20 {
		t.Fatalf("hash len = %d, want 20", len(dec.Hash))
	}
	// scriptPubKey for P2WPKH is OP_0 (0x00) + push-20 (0x14) + hash.
	if dec.ScriptPubKey[0] != 0x00 || dec.ScriptPubKey[1] != 0x14 {
		t.Fatalf("scriptPubKey[0:2] = %x, want 0014", dec.ScriptPubKey[:2])
	}
	back, err := EncodeP2WPKHAddress(dec.Hash, TestnetParams)
	if err != nil {
		t.Fatalf("EncodeP2WPKHAddress: %v", err)
	}
	if back != addr {
		t.Fatalf("round-trip mismatch: got %s, want %s", back, addr)
	}
}

func TestDecodeAddress_P2PKHTestnet(t *testing.T) {
	// A legacy testnet P2PKH address (the BTC→Lux test deposit we
	// already used). Verifies version byte 0x6f → "m…" / "n…" path.
	addr := "my74vVaJngvfodar1ufLMkkfY1c177bQ9S"
	dec, err := DecodeAddress(addr, TestnetParams)
	if err != nil {
		t.Fatalf("DecodeAddress: %v", err)
	}
	if dec.Kind != ScriptP2PKH {
		t.Fatalf("Kind = %s, want P2PKH", dec.Kind)
	}
	// scriptPubKey: OP_DUP OP_HASH160 push-20 <hash> OP_EQUALVERIFY OP_CHECKSIG
	want := []byte{0x76, 0xa9, 0x14}
	if !startsWith(dec.ScriptPubKey, want) {
		t.Fatalf("scriptPubKey prefix = %x, want %x", dec.ScriptPubKey[:3], want)
	}
	if dec.ScriptPubKey[23] != 0x88 || dec.ScriptPubKey[24] != 0xac {
		t.Fatalf("scriptPubKey suffix = %x, want 88ac", dec.ScriptPubKey[23:25])
	}
	back, err := EncodeP2PKHAddress(dec.Hash, TestnetParams)
	if err != nil {
		t.Fatalf("EncodeP2PKHAddress: %v", err)
	}
	if back != addr {
		t.Fatalf("round-trip mismatch: got %s, want %s", back, addr)
	}
}

func TestDecodeAddress_RejectsWrongNetwork(t *testing.T) {
	// A mainnet bech32 address must not decode under testnet params.
	mainnetBech := "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"
	if _, err := DecodeAddress(mainnetBech, TestnetParams); err == nil {
		t.Fatal("expected error for mainnet bech32 under testnet params")
	}
	// And a testnet bech32 must not decode under mainnet params.
	testnetBech := "tb1q20uepfp8mvj7tckntaajcrsuvsjwlealv9knsd"
	if _, err := DecodeAddress(testnetBech, MainnetParams); err == nil {
		t.Fatal("expected error for testnet bech32 under mainnet params")
	}
}

func TestDecodeAddress_RejectsTaproot(t *testing.T) {
	// Taproot (witness v1) addresses use bech32m, a different polymod
	// constant from v0. Our v0 decoder rejects them via checksum
	// mismatch — that's the correct security behaviour even if the
	// error message doesn't name the cause. Verify the rejection.
	taproot := "tb1pzvvpzq8phesmhlm0js7vtdw382szpjkkwl8n6pzltegc8n8u54ys54k47z"
	if _, err := DecodeAddress(taproot, TestnetParams); err == nil {
		t.Fatal("expected error for Taproot address (bech32m)")
	}
}

// ───────────────────────────────────────────────────────────────────
// Payment sighash + finalize
// ───────────────────────────────────────────────────────────────────

func TestPayment_SigHashDeterministic(t *testing.T) {
	p := makeReferencePayment(t)
	a, err := p.SigHash()
	if err != nil {
		t.Fatalf("SigHash: %v", err)
	}
	b, err := p.SigHash()
	if err != nil {
		t.Fatalf("SigHash 2nd: %v", err)
	}
	if a != b {
		t.Fatalf("sighash not deterministic: %x vs %x", a, b)
	}
	// Trivially non-zero.
	var zero [32]byte
	if a == zero {
		t.Fatal("sighash all zeros — preimage write missing?")
	}
}

func TestPayment_FinalizeNonEmpty(t *testing.T) {
	p := makeReferencePayment(t)
	// A throw-away signature blob — the assembler doesn't verify the
	// sig here; we only care that Finalize wires r||s into a DER
	// container, builds a scriptSig, and produces both raw + txid.
	r := bytes32(0x10)
	s := bytes32(0x20)
	sig := append(r[:], s[:]...)
	rawHex, txid, err := p.Finalize(sig)
	if err != nil {
		t.Fatalf("Finalize: %v", err)
	}
	if len(rawHex) == 0 || len(txid) != 64 {
		t.Fatalf("Finalize result raw=%d txid=%q", len(rawHex), txid)
	}
	// Sanity: the witness-free hex is even-length and pure hex.
	if _, err := hex.DecodeString(rawHex); err != nil {
		t.Fatalf("Finalize hex invalid: %v", err)
	}
	// scriptSig contains a DER signature starting 0x30 — search for
	// the marker so a serialization regression surfaces in the test.
	if !strings.Contains(rawHex, "30") {
		t.Fatal("Finalize hex missing DER 0x30 marker")
	}
}

func TestPayment_RejectsOverpayment(t *testing.T) {
	p := makeReferencePayment(t)
	p.RecipientValue = p.PrevValue + 1
	p.ChangeScript = nil
	p.ChangeValue = 0
	if _, err := p.SigHash(); err == nil {
		t.Fatal("expected error for outputs > inputs")
	}
}

func TestPayment_FeeMath(t *testing.T) {
	p := makeReferencePayment(t)
	fee, err := p.FeeSats()
	if err != nil {
		t.Fatalf("FeeSats: %v", err)
	}
	want := int64(p.PrevValue - p.RecipientValue - p.ChangeValue)
	if fee != want {
		t.Fatalf("FeeSats = %d, want %d", fee, want)
	}
}

// ───────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────

func makeReferencePayment(t *testing.T) *Payment {
	t.Helper()
	// Release wallet (testnet P2PKH).
	releaseAddr := "my74vVaJngvfodar1ufLMkkfY1c177bQ9S"
	releaseDec, err := DecodeAddress(releaseAddr, TestnetParams)
	if err != nil {
		t.Fatalf("decode release: %v", err)
	}
	// Recipient (Xverse P2WPKH).
	recipient := "tb1q20uepfp8mvj7tckntaajcrsuvsjwlealv9knsd"
	recipDec, err := DecodeAddress(recipient, TestnetParams)
	if err != nil {
		t.Fatalf("decode recipient: %v", err)
	}

	var prev [32]byte
	for i := range prev {
		prev[i] = byte(i)
	}
	// A dummy compressed pubkey — not verified by SigHash.
	pubkey := append([]byte{0x02}, make([]byte, 32)...)
	for i := 1; i < len(pubkey); i++ {
		pubkey[i] = byte(i * 7)
	}

	return &Payment{
		PrevTxID:        prev,
		PrevVout:        1,
		PrevValue:       100_000,
		PrevScript:      releaseDec.ScriptPubKey,
		PubKey:          pubkey,
		RecipientScript: recipDec.ScriptPubKey,
		RecipientValue:  10_000,
		ChangeScript:    releaseDec.ScriptPubKey,
		ChangeValue:     89_500,
	}
}

func startsWith(a, b []byte) bool {
	if len(a) < len(b) {
		return false
	}
	for i, c := range b {
		if a[i] != c {
			return false
		}
	}
	return true
}

func bytes32(seed byte) [32]byte {
	var out [32]byte
	for i := range out {
		out[i] = seed
	}
	return out
}
