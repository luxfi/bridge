package btc

import (
	"bytes"
	"encoding/hex"
	"testing"
)

// TestHash160_KnownVector pins Hash160 against a published, independently
// computed test vector rather than a self-referential round-trip: the
// compressed secp256k1 generator-point pubkey and its RIPEMD160(SHA256(.))
// digest are widely documented (Bitcoin Wiki "Technical background of
// version 1 Bitcoin addresses"; corresponds to mainnet address
// 1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH). Independently recomputed here via
// Python's hashlib (sha256 + ripemd160) before writing this test, not
// assumed from memory.
//
// This function backs btcHash160Match in internal/txassembler/btc.go --
// the security check that cross-verifies a claimed deposit pubkey against
// the deposit address before a BTC refund/release is allowed to proceed.
// A silently-wrong Hash160 (e.g. hashing in the reverse order, or SHA256
// twice instead of SHA256-then-RIPEMD160) would make that guard either
// reject every legitimate signer or -- far worse -- become a no-op that
// accepts a mismatched pubkey.
func TestHash160_KnownVector(t *testing.T) {
	pubkey, err := hex.DecodeString("0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798")
	if err != nil {
		t.Fatalf("bad test fixture: %v", err)
	}
	const wantHex = "751e76e8199196d454941c45d1b3a323f1433bd6" // 20 bytes
	want, err := hex.DecodeString(wantHex)
	if err != nil {
		t.Fatalf("bad test fixture: %v", err)
	}

	got := Hash160(pubkey)
	if !bytes.Equal(got[:], want) {
		t.Errorf("Hash160(G) = %x, want %x (published test vector)", got, want)
	}
}

// TestHash160_DifferentInputsProduceDifferentOutputs guards against a
// degenerate implementation (e.g. one that ignores its input and returns
// a fixed hash) slipping past the single known-vector test above.
func TestHash160_DifferentInputsProduceDifferentOutputs(t *testing.T) {
	a := Hash160([]byte("input-a"))
	b := Hash160([]byte("input-b"))
	if bytes.Equal(a[:], b[:]) {
		t.Fatal("Hash160 of two different inputs collided -- looks like the input isn't actually being hashed")
	}
}

// TestHash160_EmptyInputIsDeterministicAndNonZero covers the boundary
// case (empty payload) and confirms it doesn't degenerate to an
// all-zero or panicking result.
func TestHash160_EmptyInputIsDeterministicAndNonZero(t *testing.T) {
	got1 := Hash160(nil)
	got2 := Hash160([]byte{})
	if got1 != got2 {
		t.Errorf("Hash160(nil) = %x != Hash160([]byte{}) = %x, want equal", got1, got2)
	}
	var zero [20]byte
	if got1 == zero {
		t.Error("Hash160(empty) produced an all-zero digest -- suspicious for RIPEMD160(SHA256(\"\"))")
	}
}
