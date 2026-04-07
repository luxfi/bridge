// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

package plugins

import (
	"encoding/base64"
	"encoding/binary"
	"math/big"
	"testing"
)

// buildLockEvent constructs a fake LockEvent borsh payload for testing parseLockEventFromLogs.
//
// Layout after 8-byte discriminator:
//   source_chain: u64   (8)   offset 0
//   dest_chain:   u64   (8)   offset 8
//   nonce:        u64   (8)   offset 16
//   token:        [32]u8      offset 24
//   sender:       [32]u8      offset 56
//   recipient:    [32]u8      offset 88  (EVM addr in last 20 bytes => offset 100..120)
//   amount:       u64   (8)   offset 120
//   fee:          u64   (8)   offset 128
//   timestamp:    i64   (8)   offset 136
//
// Total event body: 144 bytes.  With discriminator: 152 bytes.
func buildLockEvent(srcChain, destChain, nonce, amount, fee uint64, timestamp int64, recipient [20]byte) []byte {
	disc := []byte{0x65, 0xc4, 0x2b, 0x6f, 0x39, 0x48, 0x3e, 0x09}
	buf := make([]byte, 8+144) // discriminator + event body
	copy(buf[:8], disc)

	d := buf[8:] // event body starts here

	binary.LittleEndian.PutUint64(d[0:8], srcChain)
	binary.LittleEndian.PutUint64(d[8:16], destChain)
	binary.LittleEndian.PutUint64(d[16:24], nonce)

	// token (32 bytes at offset 24) -- zero for native SOL
	// sender (32 bytes at offset 56) -- zero for tests

	// recipient: 32-byte field at offset 88; EVM address zero-padded in last 20 bytes.
	// Matches Solidity: abi.encodePacked(bytes12(0), address).
	copy(d[100:120], recipient[:])

	binary.LittleEndian.PutUint64(d[120:128], amount)
	binary.LittleEndian.PutUint64(d[128:136], fee)
	binary.LittleEndian.PutUint64(d[136:144], uint64(timestamp))

	return buf
}

func wrapAsAnchorLog(payload []byte) []string {
	encoded := base64.StdEncoding.EncodeToString(payload)
	return []string{
		"Program log: Instruction: Lock",
		"Program data: " + encoded,
	}
}

func TestParseLockEventFromLogs_BasicVector(t *testing.T) {
	var recipient [20]byte
	for i := range recipient {
		recipient[i] = byte(0xAA + i)
	}
	const (
		nonce  uint64 = 42
		amount uint64 = 1_000_000_000 // 1 SOL in lamports
	)

	payload := buildLockEvent(SolanaChainID, 96369, nonce, amount, 100, 1700000000, recipient)
	logs := wrapAsAnchorLog(payload)

	ev, ok := parseLockEventFromLogs(logs, 500, "txSig123")
	if !ok {
		t.Fatal("parseLockEventFromLogs returned false; expected a deposit event")
	}
	if ev.SrcChainID != SolanaChainID {
		t.Errorf("SrcChainID = %d, want %d", ev.SrcChainID, SolanaChainID)
	}
	if ev.Nonce != nonce {
		t.Errorf("Nonce = %d, want %d", ev.Nonce, nonce)
	}
	if ev.Recipient != recipient {
		t.Errorf("Recipient = %x, want %x", ev.Recipient, recipient)
	}
	if ev.Amount.Uint64() != amount {
		t.Errorf("Amount = %s, want %d", ev.Amount, amount)
	}
	if ev.BlockHeight != 500 {
		t.Errorf("BlockHeight = %d, want 500", ev.BlockHeight)
	}
	if ev.TxID != "txSig123" {
		t.Errorf("TxID = %q, want txSig123", ev.TxID)
	}
}

// Regression: amount was previously read from the wrong offset, confusing recipient
// bytes with amount bytes. Verify two different amounts produce correct results.
func TestParseLockEventFromLogs_AmountOffset(t *testing.T) {
	var recip [20]byte
	recip[19] = 0x01 // minimal address

	tests := []struct {
		name   string
		amount uint64
	}{
		{"1_SOL", 1_000_000_000},
		{"0.001_SOL", 1_000_000},
		{"max_u32", 4_294_967_295},
		{"large", 9_999_999_999_999},
	}

	for _, tt := range tests {
		payload := buildLockEvent(SolanaChainID, 96369, 1, tt.amount, 0, 1700000000, recip)
		logs := wrapAsAnchorLog(payload)

		ev, ok := parseLockEventFromLogs(logs, 100, "tx")
		if !ok {
			t.Fatalf("%s: parseLockEventFromLogs returned false", tt.name)
		}
		if ev.Amount.Uint64() != tt.amount {
			t.Errorf("%s: Amount = %d, want %d", tt.name, ev.Amount.Uint64(), tt.amount)
		}
		if ev.Recipient != recip {
			t.Errorf("%s: Recipient = %x, want %x", tt.name, ev.Recipient, recip)
		}
	}
}

// Verify the amount field is at d[120:128], not confused with any other field.
func TestParseLockEventFromLogs_AmountNotRecipient(t *testing.T) {
	// Set a distinctive recipient where the "last 8 bytes" differ from the amount.
	var recip [20]byte
	recip[0] = 0xFF
	recip[19] = 0xEE

	const amount uint64 = 777_777_777

	payload := buildLockEvent(SolanaChainID, 96369, 10, amount, 50, 1700000000, recip)
	logs := wrapAsAnchorLog(payload)

	ev, ok := parseLockEventFromLogs(logs, 200, "txABC")
	if !ok {
		t.Fatal("parseLockEventFromLogs returned false")
	}

	// Amount must not be equal to any fragment of the recipient field.
	wantAmount := big.NewInt(int64(amount))
	if ev.Amount.Cmp(wantAmount) != 0 {
		t.Errorf("Amount = %s, want %s (may be reading recipient bytes instead)", ev.Amount, wantAmount)
	}
}

func TestParseLockEventFromLogs_WrongDiscriminator(t *testing.T) {
	payload := make([]byte, 152)
	// Wrong discriminator.
	payload[0] = 0x00
	logs := wrapAsAnchorLog(payload)

	_, ok := parseLockEventFromLogs(logs, 100, "tx")
	if ok {
		t.Error("expected false for wrong discriminator")
	}
}

func TestParseLockEventFromLogs_ShortPayload(t *testing.T) {
	disc := []byte{0x65, 0xc4, 0x2b, 0x6f, 0x39, 0x48, 0x3e, 0x09}
	payload := make([]byte, 8+10) // too short
	copy(payload[:8], disc)
	logs := wrapAsAnchorLog(payload)

	_, ok := parseLockEventFromLogs(logs, 100, "tx")
	if ok {
		t.Error("expected false for short payload")
	}
}

func TestParseLockEventFromLogs_NoMatchingLog(t *testing.T) {
	logs := []string{
		"Program log: something else",
		"not a program data line",
	}
	_, ok := parseLockEventFromLogs(logs, 100, "tx")
	if ok {
		t.Error("expected false when no matching log line")
	}
}

func TestParseLockEventFromLogs_EmptyLogs(t *testing.T) {
	_, ok := parseLockEventFromLogs(nil, 100, "tx")
	if ok {
		t.Error("expected false for nil logs")
	}
}

func TestLe64(t *testing.T) {
	tests := []struct {
		name string
		in   [8]byte
		want uint64
	}{
		{"zero", [8]byte{}, 0},
		{"one", [8]byte{1, 0, 0, 0, 0, 0, 0, 0}, 1},
		{"256", [8]byte{0, 1, 0, 0, 0, 0, 0, 0}, 256},
		{"1e9", func() [8]byte {
			var b [8]byte
			binary.LittleEndian.PutUint64(b[:], 1_000_000_000)
			return b
		}(), 1_000_000_000},
		{"max", [8]byte{0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF}, ^uint64(0)},
	}
	for _, tt := range tests {
		got := le64(tt.in[:])
		if got != tt.want {
			t.Errorf("%s: le64(%x) = %d, want %d", tt.name, tt.in, got, tt.want)
		}
	}
}
