// Tests for the substrate extrinsic builder + signing payload.

package substrate

import (
	"bytes"
	"encoding/hex"
	"math/big"
	"strings"
	"testing"
)

// =============================================================================
// Call — balances.transfer_keep_alive
// =============================================================================

// TestEncodeBalancesTransferKeepAlive pins the wire format of a
// canonical balances.transfer_keep_alive call. The wire bytes here can
// be re-derived in Polkadot JS via:
//
//	api.tx.balances.transferKeepAlive(dest, value).method.toHex()
//
// Args:
//   - section = 5 (balances pallet index — varies per runtime; pin per-env)
//   - method  = 3 (transfer_keep_alive method index)
//   - dest    = AccountId32 of the recipient (32 bytes)
//   - value   = 100_000_000_000 planck = 10 DOT on Polkadot mainnet
//
// Expected layout:
//
//	05 03           — section || method
//	00              — MultiAddress::Id discriminant
//	<32 dest bytes>
//	<compact-encoded 1e11>  = 07 00 e8 76 48 17
func TestEncodeBalancesTransferKeepAlive(t *testing.T) {
	var dest [32]byte
	for i := range dest {
		dest[i] = byte(i + 1)
	}
	value := big.NewInt(100_000_000_000) // 10 DOT planck

	got := EncodeBalancesTransferKeepAlive(CallIndex{Section: 5, Method: 3}, dest, value)
	gotHex := hex.EncodeToString(got)

	// Section+Method = "0503"
	// Discriminant + dest = "00" + dest
	// Value = "0700e8764817" (compact-encoded 1e11 from earlier test)
	wantHex := "0503" + "00" + hex.EncodeToString(dest[:]) + "0700e8764817"
	if gotHex != wantHex {
		t.Errorf("call bytes mismatch\n got %s\nwant %s", gotHex, wantHex)
	}
}

func TestEncodeBalancesTransferKeepAlive_LargeValue(t *testing.T) {
	// Make sure values that overflow u64 still encode correctly.
	v := new(big.Int)
	v.SetString("100000000000000000", 10) // 1e17, exceeds 2^53
	var dest [32]byte
	got := EncodeBalancesTransferKeepAlive(CallIndex{Section: 5, Method: 3}, dest, v)
	// Length check — section(1) + method(1) + tag(1) + dest(32) +
	// big-int compact (1 prefix + N bytes).
	if len(got) < 35 {
		t.Errorf("call too short: %d bytes", len(got))
	}
	if got[0] != 5 || got[1] != 3 || got[2] != 0x00 {
		t.Errorf("header bytes wrong: %x", got[:3])
	}
}

// =============================================================================
// Signing payload — short payload returned raw, long payload hashed
// =============================================================================

func TestBuildSigningPayload_ShortReturnsRaw(t *testing.T) {
	// Pin canonical inputs.
	callBytes, _ := hex.DecodeString("050300" + "00" + strings.Repeat("00", 32) + "0700e8764817")
	var gen [32]byte
	for i := range gen {
		gen[i] = byte(0x91 + i)
	}
	opts := PayloadOptions{
		Nonce:              0,
		Tip:                big.NewInt(0),
		SpecVersion:        9430,
		TransactionVersion: 24,
		GenesisHash:        gen,
		BlockHash:          gen, // immortal: block_hash == genesis_hash
	}
	payload, raw := BuildSigningPayload(callBytes, opts)
	if !bytes.Equal(payload, raw) {
		t.Error("short payload should be returned as raw, not hashed")
	}
	// Sanity: raw has the expected size:
	//   call(38) + era(1) + nonce(1) + tip(1) + spec(4) + tx(4) + gen(32) + block(32) = 113
	expected := len(callBytes) + 1 + 1 + 1 + 4 + 4 + 32 + 32
	if len(raw) != expected {
		t.Errorf("raw payload size = %d, want %d", len(raw), expected)
	}
	// Tail of the payload must be block_hash.
	if !bytes.Equal(raw[len(raw)-32:], gen[:]) {
		t.Error("payload tail should be block_hash")
	}
}

func TestBuildSigningPayload_LongHashed(t *testing.T) {
	// Make the call >256 bytes so the payload itself > 256.
	bigCall := make([]byte, 300)
	for i := range bigCall {
		bigCall[i] = byte(i)
	}
	var gen [32]byte
	opts := PayloadOptions{
		Nonce:              1,
		Tip:                big.NewInt(0),
		SpecVersion:        100,
		TransactionVersion: 1,
		GenesisHash:        gen,
		BlockHash:          gen,
	}
	payload, raw := BuildSigningPayload(bigCall, opts)
	if len(payload) != 32 {
		t.Errorf("long payload should be hashed to 32 bytes, got %d", len(payload))
	}
	// payload must equal blake2_256(raw).
	want := Blake2_256(raw)
	if !bytes.Equal(payload, want[:]) {
		t.Errorf("hashed payload mismatch\n got %x\nwant %x", payload, want[:])
	}
}

// =============================================================================
// Signed extrinsic — wire shape + extrinsic hash
// =============================================================================

func TestAssembleSignedExtrinsic_ECDSAShape(t *testing.T) {
	var signer [32]byte
	for i := range signer {
		signer[i] = byte(0xA0 + i)
	}
	sig := make([]byte, 65)
	for i := range sig {
		sig[i] = byte(i)
	}
	call, _ := hex.DecodeString("050300" + "00" + strings.Repeat("00", 32) + "0700e8764817")
	wire, err := AssembleSignedExtrinsic(signer, MultiSigEcdsa, sig, call, 7, big.NewInt(0))
	if err != nil {
		t.Fatalf("AssembleSignedExtrinsic: %v", err)
	}
	// The wire should start with a compact length prefix. Then body
	// bytes are:
	//   [version 0x84] [signer-tag 0x00] [signer 32B] [sig-tag 0x02]
	//   [sig 65B] [era 0x00] [nonce compact] [tip compact] [call ...]
	body := stripCompactPrefix(wire)
	if body[0] != signedExtrinsicVersion {
		t.Errorf("version byte = %#x, want 0x84", body[0])
	}
	if body[1] != 0x00 {
		t.Errorf("signer multi-address tag = %#x, want 0x00", body[1])
	}
	if !bytes.Equal(body[2:34], signer[:]) {
		t.Error("signer bytes don't match")
	}
	if body[34] != 0x02 {
		t.Errorf("ECDSA scheme tag = %#x, want 0x02", body[34])
	}
	if !bytes.Equal(body[35:100], sig) {
		t.Error("signature bytes don't match")
	}
	if body[100] != 0x00 {
		t.Errorf("era byte = %#x, want 0x00 (immortal)", body[100])
	}
	// Nonce 7 compact-encoded is 1 byte: 7<<2 = 28 = 0x1c.
	if body[101] != 0x1c {
		t.Errorf("nonce byte = %#x, want 0x1c (7<<2)", body[101])
	}
	// Tip 0 compact-encoded is 1 byte: 0.
	if body[102] != 0x00 {
		t.Errorf("tip byte = %#x, want 0x00", body[102])
	}
	// Then the call follows.
	if !bytes.Equal(body[103:], call) {
		t.Error("call bytes don't match")
	}
}

func TestAssembleSignedExtrinsic_WrongSigSize(t *testing.T) {
	var signer [32]byte
	sig := make([]byte, 32) // not 65 for ECDSA
	_, err := AssembleSignedExtrinsic(signer, MultiSigEcdsa, sig, []byte{}, 0, nil)
	if err == nil {
		t.Error("expected error for wrong signature size")
	}
}

func TestAssembleSignedExtrinsic_Ed25519Shape(t *testing.T) {
	var signer [32]byte
	sig := make([]byte, 64) // ed25519/sr25519 = 64
	call, _ := hex.DecodeString("0503")
	wire, err := AssembleSignedExtrinsic(signer, MultiSigEd25519, sig, call, 0, nil)
	if err != nil {
		t.Fatal(err)
	}
	body := stripCompactPrefix(wire)
	// Scheme tag for Ed25519 is 0x00 (after the signer's 32B + multi-address tag).
	if body[34] != 0x00 {
		t.Errorf("Ed25519 scheme tag = %#x, want 0x00", body[34])
	}
}

func TestExtrinsicHash_Deterministic(t *testing.T) {
	// Two identical builds of the same extrinsic must produce the same
	// extrinsic hash. Hash should match blake2_256 of the body.
	var signer [32]byte
	sig := make([]byte, 65)
	call, _ := hex.DecodeString("050300")
	w1, _ := AssembleSignedExtrinsic(signer, MultiSigEcdsa, sig, call, 0, nil)
	w2, _ := AssembleSignedExtrinsic(signer, MultiSigEcdsa, sig, call, 0, nil)
	h1 := ExtrinsicHash(w1)
	h2 := ExtrinsicHash(w2)
	if h1 != h2 {
		t.Errorf("non-deterministic hash: %s vs %s", h1, h2)
	}
	if !strings.HasPrefix(h1, "0x") || len(h1) != 66 {
		t.Errorf("hash format wrong: %s", h1)
	}
	// Independently verify: hash equals blake2_256(body).
	body := stripCompactPrefix(w1)
	want := Blake2_256(body)
	if h1 != "0x"+hex.EncodeToString(want[:]) {
		t.Errorf("hash != blake2_256(body)\n got %s\nwant 0x%x", h1, want[:])
	}
}

// =============================================================================
// HexEncode / HexDecode
// =============================================================================

func TestHexCodec(t *testing.T) {
	in := []byte{0xde, 0xad, 0xbe, 0xef}
	enc := HexEncode(in)
	if enc != "0xdeadbeef" {
		t.Errorf("HexEncode = %s", enc)
	}
	dec, err := HexDecode(enc)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(dec, in) {
		t.Errorf("HexDecode roundtrip failed: %x", dec)
	}
	// Also accept no-0x.
	dec2, err := HexDecode("deadbeef")
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(dec2, in) {
		t.Error("HexDecode should accept input without 0x prefix")
	}
}
