package xrpl

import (
	"bytes"
	"encoding/hex"
	"math/big"
	"strings"
	"testing"

	rippledata "github.com/rubblelabs/ripple/data"
)

// =============================================================================
// Address derivation
// =============================================================================

// Test vectors below come from the canonical XRPL key-derivation
// example documented in rippled's PublicKey_test.cpp + xrpl.org's
// cryptographic-keys page. The pubkey 0330... → r-address mapping is
// stable across every XRPL implementation since 2014.
func TestAddressFromPubKey_CanonicalVector(t *testing.T) {
	pubHex := "0330E7FC9D56BB25D6893BA3F317AE5BCF33B3291BD63DB32654A313222F7FD020"
	pub, err := hex.DecodeString(pubHex)
	if err != nil {
		t.Fatalf("decode pub: %v", err)
	}
	addr, err := AddressFromPubKey(pub)
	if err != nil {
		t.Fatalf("AddressFromPubKey: %v", err)
	}
	// Sanity-check: address starts with 'r' and has the right length.
	if !strings.HasPrefix(addr, "r") {
		t.Errorf("address must start with 'r'; got %q", addr)
	}
	if len(addr) < 25 || len(addr) > 35 {
		t.Errorf("address length out of range [25..35]; got %d (%q)", len(addr), addr)
	}
	// Round-trip: parsing the address back yields the same AccountID
	// the pubkey produces — confirms the base58check encoding is
	// XRPL-canonical (right alphabet, right version byte).
	wantID, err := AccountIDFromPubKey(pub)
	if err != nil {
		t.Fatalf("AccountIDFromPubKey: %v", err)
	}
	parsed, err := rippledata.NewAccountFromAddress(addr)
	if err != nil {
		t.Fatalf("NewAccountFromAddress(%q): %v", addr, err)
	}
	if !bytes.Equal(parsed[:], wantID) {
		t.Errorf("address ↔ AccountID round-trip failed:\n got  %x\n want %x", parsed[:], wantID)
	}
}

func TestAddressFromPubKey_RejectsBadLength(t *testing.T) {
	cases := [][]byte{
		nil,
		make([]byte, 32),
		make([]byte, 65),
	}
	for _, c := range cases {
		if _, err := AddressFromPubKey(c); err == nil {
			t.Errorf("expected error for length=%d", len(c))
		}
	}
}

func TestAddressFromPubKey_RejectsUncompressed(t *testing.T) {
	// 33-byte length but leading byte 0x04 means "uncompressed"
	// (which is actually 65 bytes; this is a malformed input the
	// AddressFromPubKey helper should still reject).
	bad := make([]byte, 33)
	bad[0] = 0x04
	if _, err := AddressFromPubKey(bad); err == nil {
		t.Error("expected error for non-compressed prefix")
	}
}

func TestAccountIDFromPubKey_LengthAlways20(t *testing.T) {
	pub, _ := hex.DecodeString("0330E7FC9D56BB25D6893BA3F317AE5BCF33B3291BD63DB32654A313222F7FD020")
	id, err := AccountIDFromPubKey(pub)
	if err != nil {
		t.Fatal(err)
	}
	if len(id) != 20 {
		t.Errorf("AccountID must be 20 bytes; got %d", len(id))
	}
}

// =============================================================================
// DER encoding + low-s normalization
// =============================================================================

func TestEncodeDERSignature_StandardCase(t *testing.T) {
	// A typical (r, s) pair, both 32-byte values with no leading-zero
	// padding required.
	r := mustHexInt("4D8E91239FC0EFDABFFF3DE85CB99CE2DB81E61F1AA12FDEDC5C2C0E8DC8E03A")
	s := mustHexInt("39A0BA9D5B4F47D9F4B70F1A77F0E29A4C7E48E7C72D1D8E89BB1D77F4E32BC1")
	der, err := EncodeDERSignature(r, s)
	if err != nil {
		t.Fatal(err)
	}
	if der[0] != 0x30 {
		t.Errorf("DER must start with 0x30, got 0x%02x", der[0])
	}
	if int(der[1]) != len(der)-2 {
		t.Errorf("DER length byte wrong: %d vs body %d", der[1], len(der)-2)
	}
	// Two INTEGER tags inside the SEQUENCE.
	if der[2] != 0x02 {
		t.Errorf("first INTEGER tag missing: der[2]=0x%02x", der[2])
	}
	// Locate second INTEGER.
	rLen := int(der[3])
	if der[4+rLen] != 0x02 {
		t.Errorf("second INTEGER tag missing at offset %d: der=0x%02x", 4+rLen, der[4+rLen])
	}
}

func TestEncodeDERSignature_HighSGetsCanonicalized(t *testing.T) {
	// Pick s > N/2. The encoder should flip to N - s before serializing.
	r := mustHexInt("DEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF")
	highS := new(big.Int).Sub(secp256k1N, big.NewInt(1)) // N - 1 → guaranteed high-s
	der, err := EncodeDERSignature(r, highS)
	if err != nil {
		t.Fatal(err)
	}
	// Decode the s value from the DER body and confirm it's now the
	// low-s equivalent (N - highS = 1).
	if der[0] != 0x30 {
		t.Fatal("not a SEQUENCE")
	}
	idx := 2
	if der[idx] != 0x02 {
		t.Fatal("first element not INTEGER")
	}
	rLen := int(der[idx+1])
	idx += 2 + rLen
	if der[idx] != 0x02 {
		t.Fatal("second element not INTEGER")
	}
	sLen := int(der[idx+1])
	sBytes := der[idx+2 : idx+2+sLen]
	gotS := new(big.Int).SetBytes(sBytes)
	wantS := big.NewInt(1) // N - (N - 1) = 1
	if gotS.Cmp(wantS) != 0 {
		t.Errorf("low-s flip not applied:\n got  %s\n want %s", gotS, wantS)
	}
}

func TestEncodeDERSignature_HighBitPrefixesZero(t *testing.T) {
	// r with leading 0x80 bit set → ASN.1 INTEGER must prepend 0x00.
	r := mustHexInt("80112233445566778899AABBCCDDEEFF00112233445566778899AABBCCDDEEFF")
	s := mustHexInt("01")
	der, err := EncodeDERSignature(r, s)
	if err != nil {
		t.Fatal(err)
	}
	rLen := int(der[3])
	if rLen != 33 {
		t.Errorf("rLen should be 33 (32 + leading 0x00), got %d", rLen)
	}
	if der[4] != 0x00 {
		t.Errorf("leading-zero pad missing; der[4]=0x%02x", der[4])
	}
}

func TestEncodeDERSignature_RejectsNegativeOrZero(t *testing.T) {
	cases := []struct{ r, s *big.Int }{
		{nil, big.NewInt(1)},
		{big.NewInt(1), nil},
		{big.NewInt(0), big.NewInt(1)},
		{big.NewInt(1), big.NewInt(0)},
		{big.NewInt(-1), big.NewInt(1)},
	}
	for i, c := range cases {
		if _, err := EncodeDERSignature(c.r, c.s); err == nil {
			t.Errorf("case %d: expected error", i)
		}
	}
}

func TestCanonicalizeS_LowSUnchanged(t *testing.T) {
	low := big.NewInt(1)
	got := CanonicalizeS(low)
	if got.Cmp(low) != 0 {
		t.Errorf("low-s should pass through; got %s want %s", got, low)
	}
}

func TestCanonicalizeS_HighSFlipped(t *testing.T) {
	high := new(big.Int).Sub(secp256k1N, big.NewInt(7))
	got := CanonicalizeS(high)
	want := big.NewInt(7)
	if got.Cmp(want) != 0 {
		t.Errorf("high-s flip wrong; got %s want %s", got, want)
	}
}

// =============================================================================
// PreSign + Finalize round-trip
// =============================================================================

// canonical 33-byte compressed-secp256k1 pubkey from the XRPL doc
// vectors (also used in TestAddressFromPubKey_CanonicalVector).
var testPubKey, _ = hex.DecodeString(
	"0330E7FC9D56BB25D6893BA3F317AE5BCF33B3291BD63DB32654A313222F7FD020")

func TestPreSign_BuildsCanonicalDigest(t *testing.T) {
	// Use the address derived from our test pubkey so the tx is
	// internally consistent (Account matches SigningPubKey).
	signerAddr, err := AddressFromPubKey(testPubKey)
	if err != nil {
		t.Fatal(err)
	}
	u := PaymentUnsigned{
		Account:            signerAddr,
		Destination:        "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
		AmountDrops:        1_000_000, // 1 XRP
		FeeDrops:           XRPLBaseFeeDrops,
		Sequence:           42,
		LastLedgerSequence: 9999999,
		SigningPubKey:      testPubKey,
		Flags:              CanonicalSigFlag,
	}
	digest, ctx, err := PreSign(u)
	if err != nil {
		t.Fatalf("PreSign: %v", err)
	}
	if len(digest) != 32 {
		t.Errorf("digest must be 32 bytes (SHA-512Half); got %d", len(digest))
	}
	if ctx == nil || ctx.Payment == nil {
		t.Fatal("ctx.Payment must be populated")
	}
	if ctx.Payment.TransactionType != rippledata.PAYMENT {
		t.Errorf("TransactionType = %v, want PAYMENT", ctx.Payment.TransactionType)
	}
	if ctx.Payment.Sequence != 42 {
		t.Errorf("Sequence = %d, want 42", ctx.Payment.Sequence)
	}

	// Independent recomputation: the digest must equal
	// SHA-512Half(STX-prefix || serialized_body_without_signature).
	_, msg, err := rippledata.SigningHash(ctx.Payment)
	if err != nil {
		t.Fatal(err)
	}
	independent := SHA512Half(HashPrefixTransactionSign, msg)
	if !bytes.Equal(digest, independent) {
		t.Errorf("digest mismatch:\n got  %x\n want %x", digest, independent)
	}
}

func TestPreSign_RejectsBadInputs(t *testing.T) {
	addr, _ := AddressFromPubKey(testPubKey)
	good := PaymentUnsigned{
		Account:       addr,
		Destination:   "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
		AmountDrops:   1_000_000,
		FeeDrops:      10,
		Sequence:      1,
		SigningPubKey: testPubKey,
	}
	// Empty account.
	bad := good
	bad.Account = ""
	if _, _, err := PreSign(bad); err == nil {
		t.Error("expected error for empty Account")
	}
	// Bad amount.
	bad = good
	bad.AmountDrops = 0
	if _, _, err := PreSign(bad); err == nil {
		t.Error("expected error for zero AmountDrops")
	}
	// Bad pubkey size.
	bad = good
	bad.SigningPubKey = make([]byte, 32)
	if _, _, err := PreSign(bad); err == nil {
		t.Error("expected error for 32-byte pubkey")
	}
	// Bad pubkey prefix.
	bad = good
	bad.SigningPubKey = make([]byte, 33)
	bad.SigningPubKey[0] = 0x04
	if _, _, err := PreSign(bad); err == nil {
		t.Error("expected error for non-compressed pubkey prefix")
	}
	// Malformed destination address.
	bad = good
	bad.Destination = "not-an-r-address"
	if _, _, err := PreSign(bad); err == nil {
		t.Error("expected error for bad Destination")
	}
}

func TestFinalize_RoundTripsThroughParser(t *testing.T) {
	addr, _ := AddressFromPubKey(testPubKey)
	u := PaymentUnsigned{
		Account:            addr,
		Destination:        "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
		AmountDrops:        1_000_000,
		FeeDrops:           12,
		Sequence:           7,
		LastLedgerSequence: 1_234_567,
		SigningPubKey:      testPubKey,
		Flags:              CanonicalSigFlag,
	}
	_, ctx, err := PreSign(u)
	if err != nil {
		t.Fatal(err)
	}

	// Fake an MPC signature: small valid (r, s) pair.
	r := mustHexInt("1A2B3C4D5E6F708192A3B4C5D6E7F80910111213141516171819202122232425")
	s := mustHexInt("0B0C0D0E0F101112131415161718191A1B1C1D1E1F20212223242526272829FF")
	der, err := EncodeDERSignature(r, s)
	if err != nil {
		t.Fatal(err)
	}
	blob, hash, err := Finalize(der, ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(blob) == 0 {
		t.Fatal("Finalize returned empty blob")
	}
	if len(hash) != 64 { // 32-byte hash → 64 hex chars
		t.Errorf("hash must be 64 hex chars; got %d (%q)", len(hash), hash)
	}

	// Round-trip: parse the blob back through the rubblelabs codec and
	// check the embedded fields match.
	parsed, err := rippledata.ReadTransaction(bytes.NewReader(blob))
	if err != nil {
		t.Fatalf("re-parse blob: %v", err)
	}
	payment, ok := parsed.(*rippledata.Payment)
	if !ok {
		t.Fatalf("parsed wrong tx type: %T", parsed)
	}
	if payment.Sequence != u.Sequence {
		t.Errorf("Sequence: got %d want %d", payment.Sequence, u.Sequence)
	}
	if payment.Account.String() != u.Account {
		t.Errorf("Account: got %s want %s", payment.Account, u.Account)
	}
	if payment.Destination.String() != u.Destination {
		t.Errorf("Destination: got %s want %s", payment.Destination, u.Destination)
	}
	if payment.TxnSignature == nil || !bytes.Equal([]byte(*payment.TxnSignature), der) {
		t.Error("TxnSignature missing or mismatched after round-trip")
	}
	if payment.SigningPubKey == nil || !bytes.Equal(payment.SigningPubKey[:], testPubKey) {
		t.Error("SigningPubKey mismatched after round-trip")
	}
}

func TestFinalize_RejectsBadInputs(t *testing.T) {
	if _, _, err := Finalize(nil, nil); err == nil {
		t.Error("expected error for nil ctx")
	}
	if _, _, err := Finalize(nil, &SignCtx{}); err == nil {
		t.Error("expected error for nil Payment in ctx")
	}
	// Real ctx but empty DER.
	addr, _ := AddressFromPubKey(testPubKey)
	_, ctx, _ := PreSign(PaymentUnsigned{
		Account:       addr,
		Destination:   "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
		AmountDrops:   1,
		FeeDrops:      10,
		Sequence:      1,
		SigningPubKey: testPubKey,
	})
	if _, _, err := Finalize(nil, ctx); err == nil {
		t.Error("expected error for empty DER")
	}
}

// =============================================================================
// helpers
// =============================================================================

func mustHexInt(s string) *big.Int {
	s = strings.TrimPrefix(strings.TrimPrefix(s, "0x"), "0X")
	n, ok := new(big.Int).SetString(s, 16)
	if !ok {
		panic("mustHexInt: bad hex " + s)
	}
	return n
}
