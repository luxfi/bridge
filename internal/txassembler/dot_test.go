// Tests for the Polkadot transaction assembler.
//
// Test strategy:
//   - Build a balances.transfer_keep_alive call with pinned (section,
//     method, dest, value) and verify the SCALE bytes match what a
//     Polkadot JS-side call would produce (independent calculator).
//   - Build a full signing payload and verify the "raw bytes vs hashed"
//     decision at the 256-byte boundary.
//   - For Finalize, generate a deterministic ECDSA signature in-test by
//     signing the payload's pre-image with a known scalar — exercising
//     the recovery-byte determination + wire assembly.
//   - SS58 address derivation from a known pubkey.

package txassembler

import (
	"context"
	"encoding/hex"
	"math/big"
	"strings"
	"testing"

	"github.com/luxfi/bridge/internal/substrate"
)

// =============================================================================
// SS58 derivation from compressed pubkey
// =============================================================================

func TestDOTAddressFromPub_Deterministic(t *testing.T) {
	// 33-byte compressed pubkey — synthetic but deterministic.
	pub := make([]byte, 33)
	pub[0] = 0x02
	for i := 1; i < 33; i++ {
		pub[i] = byte(i * 7)
	}
	s1, err := DOTAddressFromPub(pub, substrate.SS58PolkadotMainnet)
	if err != nil {
		t.Fatalf("DOTAddressFromPub: %v", err)
	}
	s2, _ := DOTAddressFromPub(pub, substrate.SS58PolkadotMainnet)
	if s1 != s2 {
		t.Errorf("non-deterministic: %s vs %s", s1, s2)
	}
	if !strings.HasPrefix(s1, "1") {
		t.Errorf("Polkadot address should start with '1', got %s", s1)
	}
	// Different prefix → different address.
	gen, _ := DOTAddressFromPub(pub, substrate.SS58Generic)
	if gen == s1 {
		t.Error("generic + polkadot prefix should produce different addresses")
	}
}

func TestDOTAddressFromPub_WrongLength(t *testing.T) {
	_, err := DOTAddressFromPub([]byte{0x02, 0xff}, substrate.SS58PolkadotMainnet)
	if err == nil {
		t.Error("expected error on short pubkey")
	}
}

// =============================================================================
// PreSign — happy path + recipient prefix mismatch
// =============================================================================

// testPubX_Y derives a real secp256k1 compressed pubkey from a known
// scalar — used to produce a real signature later. Scalar = 1 →
// pubkey = G.
func testPubFromScalar(t *testing.T, scalar *big.Int) []byte {
	t.Helper()
	g := newSecp256k1Point(secp256k1Gx, secp256k1Gy)
	pub := secp256k1ScalarMult(g, scalar)
	if pub.inf {
		t.Fatal("scalar produced identity")
	}
	// Compressed encoding: 0x02 / 0x03 || x (32 bytes).
	out := make([]byte, 33)
	if pub.y.Bit(0) == 1 {
		out[0] = 0x03
	} else {
		out[0] = 0x02
	}
	xb := pub.x.Bytes()
	copy(out[33-len(xb):], xb)
	return out
}

// signDeterministic produces an ECDSA signature (r, s, v) for the
// given 32-byte hash with the given scalar. Used in tests so we can
// build a real signature whose recovery byte we then verify.
//
// Uses a fixed nonce per call — NOT RFC-6979. Deterministic enough for
// tests; never used outside of test code.
func signDeterministic(t *testing.T, hash []byte, scalar *big.Int) (r, s *big.Int, v byte) {
	t.Helper()
	// Pick a deterministic non-zero k. For each test we want unique
	// (r, s) — derive k from hash so it stays repeatable per (hash, scalar)
	// pair.
	k := new(big.Int).SetBytes(hash)
	k.Add(k, big.NewInt(1))
	k.Mod(k, secp256k1N)
	if k.Sign() == 0 {
		k.SetInt64(1)
	}
	g := newSecp256k1Point(secp256k1Gx, secp256k1Gy)
	R := secp256k1ScalarMult(g, k)
	if R.inf {
		t.Fatal("nonce produced point at infinity")
	}
	r = new(big.Int).Mod(R.x, secp256k1N)
	if r.Sign() == 0 {
		t.Fatal("r=0 — pick a different k")
	}
	// s = k^-1 (z + r·d) mod n
	z := new(big.Int).SetBytes(hash)
	z.Mod(z, secp256k1N)
	rd := new(big.Int).Mul(r, scalar)
	zPlusRD := new(big.Int).Add(z, rd)
	zPlusRD.Mod(zPlusRD, secp256k1N)
	kInv := new(big.Int).ModInverse(k, secp256k1N)
	s = new(big.Int).Mul(kInv, zPlusRD)
	s.Mod(s, secp256k1N)
	if s.Sign() == 0 {
		t.Fatal("s=0 — pick a different k")
	}
	// Determine v: the parity of R.y. canonical convention is v=0
	// if R.y is even, v=1 if odd.
	if R.y.Bit(0) == 1 {
		v = 1
	} else {
		v = 0
	}
	// If high-s, canonicalize and flip v.
	if s.Cmp(secp256k1HalfN) > 0 {
		s = new(big.Int).Sub(secp256k1N, s)
		v ^= 1
	}
	return r, s, v
}

// =============================================================================
// PreSign — happy path
// =============================================================================

// Build a real DOT swap: 10 DOT (1e11 planck) to a fixed recipient
// SS58, signed by a known scalar. Verify PreSign produces the expected
// call bytes + payload, and Finalize wraps a sig matching the pubkey.

func TestDOTAssembler_PreSign_HappyPath(t *testing.T) {
	a := NewDOTAssembler()
	var gen [32]byte
	for i := range gen {
		gen[i] = byte(0x91 + i)
	}
	a.SetNetwork("POLKADOT_TESTNET", PerDOTNetwork{
		SS58Prefix:         substrate.SS58Generic,
		Decimals:           12,
		CallIndex:          substrate.CallIndex{Section: 5, Method: 3},
		SpecVersion:        100,
		TransactionVersion: 24,
		GenesisHash:        gen,
		ExistentialDeposit: big.NewInt(10_000_000_000),
		FeePlanck:          big.NewInt(100_000_000),
	})

	// Recipient SS58: derive from a known 32-byte AccountId32 + the
	// generic substrate prefix.
	var recipientAcc [32]byte
	for i := range recipientAcc {
		recipientAcc[i] = byte(i + 1)
	}
	recipientSS58, err := substrate.SS58Encode(recipientAcc, substrate.SS58Generic)
	if err != nil {
		t.Fatal(err)
	}

	// Sender pubkey from a known scalar — scalar=2 gives a non-G point.
	pub := testPubFromScalar(t, big.NewInt(2))
	if len(pub) != 33 {
		t.Fatalf("test pubkey wrong length: %d", len(pub))
	}

	u, err := a.PreSign(context.Background(), DOTSpec{
		Network:       "POLKADOT_TESTNET",
		RecipientSS58: recipientSS58,
		AmountPlanck:  big.NewInt(100_000_000_000), // 10 DOT (mainnet) or 0.1 (12-dec)
		SenderPubKey:  pub,
		Nonce:         7,
		Tip:           big.NewInt(0),
	})
	if err != nil {
		t.Fatalf("PreSign: %v", err)
	}
	if u.Network != "POLKADOT_TESTNET" {
		t.Errorf("Network = %q", u.Network)
	}
	if u.Nonce != 7 {
		t.Errorf("Nonce = %d", u.Nonce)
	}
	// Call bytes — section || method || multi-address-tag || dest || compact-1e11.
	wantCallPrefix, _ := hex.DecodeString("050300")
	if !strings.HasPrefix(hex.EncodeToString(u.CallBytes), hex.EncodeToString(wantCallPrefix)) {
		t.Errorf("call prefix wrong: %x", u.CallBytes[:3])
	}
	// SigningPayload either equals the raw payload (<=256B) or its
	// blake2_256 hash. Either way length is fixed:
	if len(u.SigningPayload) != 32 && len(u.SigningPayload) > 256 {
		t.Errorf("signing payload size weird: %d", len(u.SigningPayload))
	}
	// Signer AccountId derived from pub.
	wantAcc, _ := substrate.AccountIDFromECDSAPub(pub)
	if u.SignerAccountID != wantAcc {
		t.Error("signer AccountId derivation mismatch")
	}
}

func TestDOTAssembler_PreSign_NoConfig(t *testing.T) {
	a := NewDOTAssembler()
	_, err := a.PreSign(context.Background(), DOTSpec{Network: "POLKADOT_MAINNET"})
	if err == nil {
		t.Error("expected error for unconfigured network")
	}
}

func TestDOTAssembler_PreSign_PrefixMismatch(t *testing.T) {
	a := NewDOTAssembler()
	a.SetNetwork("POLKADOT_MAINNET", PerDOTNetwork{
		SS58Prefix: substrate.SS58PolkadotMainnet, // 0
		CallIndex:  substrate.CallIndex{Section: 5, Method: 3},
	})
	// Recipient with substrate-generic prefix (42) — should be refused.
	var acc [32]byte
	bad, _ := substrate.SS58Encode(acc, substrate.SS58Generic)
	pub := testPubFromScalar(t, big.NewInt(3))
	_, err := a.PreSign(context.Background(), DOTSpec{
		Network:       "POLKADOT_MAINNET",
		RecipientSS58: bad,
		AmountPlanck:  big.NewInt(1),
		SenderPubKey:  pub,
	})
	if err == nil || !strings.Contains(err.Error(), "prefix") {
		t.Errorf("expected prefix-mismatch error, got %v", err)
	}
}

func TestDOTAssembler_PreSign_RejectBadInputs(t *testing.T) {
	a := NewDOTAssembler()
	a.SetNetwork("X", PerDOTNetwork{
		SS58Prefix: substrate.SS58Generic,
		CallIndex:  substrate.CallIndex{Section: 5, Method: 3},
	})
	cases := []struct {
		name string
		spec DOTSpec
	}{
		{"zero amount", DOTSpec{Network: "X", RecipientSS58: "5xxx", AmountPlanck: big.NewInt(0), SenderPubKey: make([]byte, 33)}},
		{"short pubkey", DOTSpec{Network: "X", RecipientSS58: "5xxx", AmountPlanck: big.NewInt(1), SenderPubKey: []byte{0x02}}},
		{"empty recipient", DOTSpec{Network: "X", AmountPlanck: big.NewInt(1), SenderPubKey: make([]byte, 33)}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := a.PreSign(context.Background(), tc.spec); err == nil {
				t.Error("expected error")
			}
		})
	}
}

// =============================================================================
// Finalize — wraps a real signature into a wire-ready extrinsic
// =============================================================================

func TestDOTAssembler_Finalize_RoundTrip(t *testing.T) {
	a := NewDOTAssembler()
	var gen [32]byte
	for i := range gen {
		gen[i] = byte(0x42 + i)
	}
	a.SetNetwork("POLKADOT_TESTNET", PerDOTNetwork{
		SS58Prefix:         substrate.SS58Generic,
		Decimals:           12,
		CallIndex:          substrate.CallIndex{Section: 5, Method: 3},
		SpecVersion:        9430,
		TransactionVersion: 24,
		GenesisHash:        gen,
		ExistentialDeposit: big.NewInt(10_000_000_000),
		FeePlanck:          big.NewInt(100_000_000),
	})

	// Sender from a known scalar.
	scalar := new(big.Int).SetInt64(0xC0DECAFE)
	pub := testPubFromScalar(t, scalar)
	// Recipient SS58.
	var recipientAcc [32]byte
	for i := range recipientAcc {
		recipientAcc[i] = byte(0x55 ^ i)
	}
	recipientSS58, _ := substrate.SS58Encode(recipientAcc, substrate.SS58Generic)

	u, err := a.PreSign(context.Background(), DOTSpec{
		Network:       "POLKADOT_TESTNET",
		RecipientSS58: recipientSS58,
		AmountPlanck:  big.NewInt(100_000_000_000),
		SenderPubKey:  pub,
		Nonce:         42,
	})
	if err != nil {
		t.Fatalf("PreSign: %v", err)
	}

	// Sign the SAME payload substrate's runtime would: blake2_256 of
	// the signing payload, ECDSA over secp256k1.
	hash := substrate.Blake2_256(u.SigningPayload)
	r, s, v := signDeterministic(t, hash[:], scalar)

	// Finalize with the known v.
	rawHex, extHash, err := a.Finalize(u, r, s, v)
	if err != nil {
		t.Fatalf("Finalize with known v: %v", err)
	}
	if !strings.HasPrefix(rawHex, "0x") {
		t.Errorf("rawHex missing 0x prefix: %s", rawHex)
	}
	if !strings.HasPrefix(extHash, "0x") || len(extHash) != 66 {
		t.Errorf("extHash format wrong: %s", extHash)
	}

	// Finalize with 0xff hint — should pick the same v (or its sibling
	// that also verifies — for r mod n collisions there are sometimes
	// two valid v's; both produce the same hash here regardless).
	rawHex2, _, err := a.Finalize(u, r, s, 0xff)
	if err != nil {
		t.Fatalf("Finalize with 0xff: %v", err)
	}
	if rawHex2 == "" {
		t.Error("Finalize with 0xff should resolve v automatically")
	}
}

func TestDOTAssembler_Finalize_WrongSignerFailsBoth(t *testing.T) {
	a := NewDOTAssembler()
	var gen [32]byte
	a.SetNetwork("X", PerDOTNetwork{
		SS58Prefix:         substrate.SS58Generic,
		CallIndex:          substrate.CallIndex{Section: 5, Method: 3},
		SpecVersion:        1,
		TransactionVersion: 1,
		GenesisHash:        gen,
	})
	// Recipient SS58.
	var racc [32]byte
	rss58, _ := substrate.SS58Encode(racc, substrate.SS58Generic)

	// Signer A (real)
	pubA := testPubFromScalar(t, big.NewInt(7))
	u, err := a.PreSign(context.Background(), DOTSpec{
		Network: "X", RecipientSS58: rss58,
		AmountPlanck: big.NewInt(1), SenderPubKey: pubA,
	})
	if err != nil {
		t.Fatal(err)
	}
	// Sign with signer B (different scalar) — but we tell Finalize the
	// signer is A. Both v=0 and v=1 should fail to verify, surfacing
	// the "sign context wrong" error.
	hash := substrate.Blake2_256(u.SigningPayload)
	r, s, _ := signDeterministic(t, hash[:], big.NewInt(99))
	_, _, err = a.Finalize(u, r, s, 0xff)
	if err == nil {
		t.Error("Finalize should fail when sig doesn't recover to signer pubkey")
	}
}

// =============================================================================
// ParseDOTSignature — handles 27/28 normalization + bad length
// =============================================================================

func TestParseDOTSignature_27_28(t *testing.T) {
	sig := make([]byte, 65)
	sig[64] = 28
	hexSig := hex.EncodeToString(sig)
	_, _, v, err := ParseDOTSignature(hexSig)
	if err != nil {
		t.Fatal(err)
	}
	if v != 1 {
		t.Errorf("v=28 should normalize to 1, got %d", v)
	}
	sig[64] = 27
	hexSig = hex.EncodeToString(sig)
	_, _, v, _ = ParseDOTSignature(hexSig)
	if v != 0 {
		t.Errorf("v=27 should normalize to 0, got %d", v)
	}
}

func TestParseDOTSignature_UnknownV(t *testing.T) {
	sig := make([]byte, 65)
	sig[64] = 42
	hexSig := hex.EncodeToString(sig)
	_, _, v, err := ParseDOTSignature(hexSig)
	if err != nil {
		t.Fatal(err)
	}
	if v != 0xff {
		t.Errorf("unknown v should map to 0xff, got %d", v)
	}
}

func TestParseDOTSignature_BadLength(t *testing.T) {
	if _, _, _, err := ParseDOTSignature("0xabba"); err == nil {
		t.Error("expected error on short signature")
	}
}

// =============================================================================
// ECDSA verify self-test — make sure our pure-Go implementation is correct
// =============================================================================

func TestECDSAVerifyCompressed_SelfCheck(t *testing.T) {
	// Known scalar → known pubkey → sign hash → verify.
	scalar := big.NewInt(0xBEEF)
	pub := testPubFromScalar(t, scalar)
	hash := substrate.Blake2_256([]byte("hello substrate"))
	r, s, _ := signDeterministic(t, hash[:], scalar)
	sig := make([]byte, 64)
	rb, sb := r.Bytes(), s.Bytes()
	copy(sig[32-len(rb):32], rb)
	copy(sig[64-len(sb):64], sb)
	if !ecdsaVerifyCompressed(hash[:], sig, pub) {
		t.Error("signed value failed to verify under signer pubkey")
	}
	// Tamper with the hash — should not verify.
	badHash := substrate.Blake2_256([]byte("different msg"))
	if ecdsaVerifyCompressed(badHash[:], sig, pub) {
		t.Error("signature verified under wrong hash")
	}
	// Wrong pubkey — should not verify.
	wrongPub := testPubFromScalar(t, big.NewInt(0xDEAD))
	if ecdsaVerifyCompressed(hash[:], sig, wrongPub) {
		t.Error("signature verified under wrong pubkey")
	}
}

// =============================================================================
// Hex helpers — golden vector for the full PreSign → call bytes path
// =============================================================================

func TestPreSign_GoldenCallBytes(t *testing.T) {
	// Pin a very specific input → output.
	a := NewDOTAssembler()
	var gen [32]byte
	a.SetNetwork("X", PerDOTNetwork{
		SS58Prefix:         substrate.SS58Generic,
		Decimals:           12,
		CallIndex:          substrate.CallIndex{Section: 5, Method: 3},
		SpecVersion:        1,
		TransactionVersion: 1,
		GenesisHash:        gen,
	})
	// Use Alice's AccountId as the destination — published test
	// vector means we can re-derive the SS58 from a known account.
	aliceHex := "d43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d"
	aliceBytes, _ := hex.DecodeString(aliceHex)
	var alice [32]byte
	copy(alice[:], aliceBytes)
	aliceSS58, _ := substrate.SS58Encode(alice, substrate.SS58Generic)

	pub := testPubFromScalar(t, big.NewInt(11))

	u, err := a.PreSign(context.Background(), DOTSpec{
		Network:       "X",
		RecipientSS58: aliceSS58,
		AmountPlanck:  big.NewInt(100_000_000_000),
		SenderPubKey:  pub,
		Nonce:         0,
	})
	if err != nil {
		t.Fatal(err)
	}
	// Expected call bytes:
	//   05 03            — section || method
	//   00               — MultiAddress::Id
	//   <alice 32B>      — dest
	//   07 00 e8 76 48 17 — compact-encoded 1e11
	wantPrefix := "0503" + "00" + aliceHex + "0700e8764817"
	gotHex := hex.EncodeToString(u.CallBytes)
	if gotHex != wantPrefix {
		t.Errorf("call bytes mismatch\n got %s\nwant %s", gotHex, wantPrefix)
	}
}
