// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

package main

import (
	"encoding/hex"
	"math/big"
	"testing"
)

func TestAbiEncodeBytes32Tag(t *testing.T) {
	got := abiEncodeBytes32Tag("DEPOSIT")
	// Solidity: bytes32("DEPOSIT") = 0x4445504f534954000000000000000000000000000000000000000000000000000
	// Note: the expected hex in the task description has 65 hex chars (trailing 0).
	// Correct bytes32 is exactly 32 bytes = 64 hex chars.
	want := "4445504f534954000000000000000000000000000000000000000000000000000"
	// Normalize: the expected value has an extra trailing 0 (odd length). Use the
	// canonical 64-char representation.
	wantCanonical := "4445504f53495400000000000000000000000000000000000000000000000000"
	gotHex := hex.EncodeToString(got)
	if gotHex != wantCanonical {
		t.Fatalf("abiEncodeBytes32Tag(\"DEPOSIT\")\n  got:  0x%s\n  want: 0x%s", gotHex, wantCanonical)
	}
	// Also verify the task-provided vector (just trim trailing 0 if odd).
	if len(want)%2 != 0 {
		want = want[:len(want)-1]
	}
	if gotHex != want {
		t.Fatalf("mismatch with task vector: got %s, want %s", gotHex, want)
	}
}

func TestPackDepositKnownVector(t *testing.T) {
	// Known inputs:
	//   tag:        bytes32("DEPOSIT")
	//   srcChainID: 1
	//   nonce:      42
	//   recipient:  0x000000000000000000000000DEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF
	//   amount:     1000000000000000000 (1e18)
	var recipient [20]byte
	hexDecode(t, recipient[:], "DEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF")
	amount := new(big.Int).SetUint64(1_000_000_000_000_000_000)

	packed := packDeposit(1, 42, recipient, amount)

	// Verify structure: 5 * 32 = 160 bytes
	if len(packed) != 160 {
		t.Fatalf("packDeposit length: got %d, want 160", len(packed))
	}

	// Verify first 32 bytes = bytes32("DEPOSIT")
	tagHex := hex.EncodeToString(packed[:32])
	wantTag := "4445504f53495400000000000000000000000000000000000000000000000000"
	if tagHex != wantTag {
		t.Fatalf("deposit tag mismatch:\n  got:  %s\n  want: %s", tagHex, wantTag)
	}

	// Verify srcChainID = 1 (uint256 big-endian)
	chainID := new(big.Int).SetBytes(packed[32:64])
	if chainID.Uint64() != 1 {
		t.Fatalf("srcChainID: got %d, want 1", chainID.Uint64())
	}

	// Verify nonce = 42
	nonce := new(big.Int).SetBytes(packed[64:96])
	if nonce.Uint64() != 42 {
		t.Fatalf("nonce: got %d, want 42", nonce.Uint64())
	}

	// Verify recipient (left-padded to 32 bytes)
	recipientHex := hex.EncodeToString(packed[96:128])
	wantRecipient := "000000000000000000000000deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
	if recipientHex != wantRecipient {
		t.Fatalf("recipient mismatch:\n  got:  %s\n  want: %s", recipientHex, wantRecipient)
	}

	// Verify amount = 1e18
	gotAmount := new(big.Int).SetBytes(packed[128:160])
	if gotAmount.Cmp(amount) != 0 {
		t.Fatalf("amount: got %s, want %s", gotAmount, amount)
	}
}

func hexDecode(t *testing.T, dst []byte, src string) {
	t.Helper()
	b, err := hex.DecodeString(src)
	if err != nil {
		t.Fatal(err)
	}
	copy(dst, b)
}
