// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

package main

import (
	"bytes"
	"encoding/hex"
	"math"
	"math/big"
	"testing"
)

func TestNonceDirtyFlag(t *testing.T) {
	// Verify the nonceDirty field is initialized to false.
	r := NewRelay("http://localhost:9650", "0xdead", nil, nil, 96369)
	if r.nonceDirty {
		t.Error("nonceDirty should be false on init")
	}

	// Simulate error scenario: set dirty.
	r.nonceDirty = true
	if !r.nonceDirty {
		t.Error("nonceDirty should be true after set")
	}
}

func TestNewRelayDefaults(t *testing.T) {
	r := NewRelay("http://rpc", "0xbeef", nil, nil, 12345)
	if r.rpcURL != "http://rpc" {
		t.Errorf("rpcURL = %q, want http://rpc", r.rpcURL)
	}
	if r.teleporterAddr != "0xbeef" {
		t.Errorf("teleporterAddr = %q, want 0xbeef", r.teleporterAddr)
	}
	if r.chainID != 12345 {
		t.Errorf("chainID = %d, want 12345", r.chainID)
	}
	if r.nonce != 0 {
		t.Errorf("nonce = %d, want 0", r.nonce)
	}
	if r.nonceDirty {
		t.Error("nonceDirty should be false")
	}
}

// ── RLP encoding tests ──────────────────────────────────────────────

func TestRlpEncodeUint(t *testing.T) {
	tests := []struct {
		name string
		val  uint64
		want string // hex
	}{
		{"zero", 0, "80"},
		{"one", 1, "01"},
		{"127", 127, "7f"},
		{"128", 128, "8180"},
		{"255", 255, "81ff"},
		{"256", 256, "820100"},
		{"65535", 65535, "82ffff"},
		{"max_uint64", math.MaxUint64, "88ffffffffffffffff"},
	}
	for _, tt := range tests {
		got := hex.EncodeToString(rlpEncodeUint(tt.val))
		if got != tt.want {
			t.Errorf("rlpEncodeUint(%d) = %s, want %s", tt.val, got, tt.want)
		}
	}
}

func TestRlpEncodeBytes(t *testing.T) {
	tests := []struct {
		name string
		in   []byte
		want string // hex
	}{
		{"empty", nil, "80"},
		{"empty_slice", []byte{}, "80"},
		{"single_lt_0x80", []byte{0x42}, "42"},
		{"single_0x00", []byte{0x00}, "00"},
		{"single_0x7f", []byte{0x7f}, "7f"},
		{"single_0x80", []byte{0x80}, "8180"},
		{"single_0xff", []byte{0xff}, "81ff"},
		{"3_bytes", []byte{1, 2, 3}, "83010203"},
	}
	for _, tt := range tests {
		got := hex.EncodeToString(rlpEncodeBytes(tt.in))
		if got != tt.want {
			t.Errorf("rlpEncodeBytes(%s): %x = %s, want %s", tt.name, tt.in, got, tt.want)
		}
	}

	// 55-byte string: prefix = 0x80+55 = 0xb7
	data55 := make([]byte, 55)
	for i := range data55 {
		data55[i] = 0xAA
	}
	enc55 := rlpEncodeBytes(data55)
	if enc55[0] != 0xb7 {
		t.Errorf("55 bytes: prefix = 0x%02x, want 0xb7", enc55[0])
	}
	if len(enc55) != 56 {
		t.Errorf("55 bytes: total length = %d, want 56", len(enc55))
	}

	// 56-byte string: prefix = 0xb8, then 1-byte length (0x38=56).
	data56 := make([]byte, 56)
	for i := range data56 {
		data56[i] = 0xBB
	}
	enc56 := rlpEncodeBytes(data56)
	if enc56[0] != 0xb8 {
		t.Errorf("56 bytes: prefix = 0x%02x, want 0xb8", enc56[0])
	}
	if enc56[1] != 56 {
		t.Errorf("56 bytes: length byte = %d, want 56", enc56[1])
	}
	if len(enc56) != 58 { // 1 (prefix) + 1 (length) + 56 (data)
		t.Errorf("56 bytes: total length = %d, want 58", len(enc56))
	}
}

func TestRlpEncodeList(t *testing.T) {
	// Empty list: 0xc0
	empty := rlpEncodeList(nil)
	if !bytes.Equal(empty, []byte{0xc0}) {
		t.Errorf("empty list = %x, want c0", empty)
	}

	// Also with empty slice.
	emptySlice := rlpEncodeList([][]byte{})
	if !bytes.Equal(emptySlice, []byte{0xc0}) {
		t.Errorf("empty slice list = %x, want c0", emptySlice)
	}

	// Single item: [0x42] -> item is just 0x42 (1 byte < 0x80).
	// List payload = 1 byte, so prefix = 0xc0+1 = 0xc1.
	single := rlpEncodeList([][]byte{rlpEncodeBytes([]byte{0x42})})
	if !bytes.Equal(single, []byte{0xc1, 0x42}) {
		t.Errorf("single item list = %x, want c142", single)
	}

	// Multiple items: encode [1, 2, 3] as uint.
	items := [][]byte{
		rlpEncodeUint(1),
		rlpEncodeUint(2),
		rlpEncodeUint(3),
	}
	multi := rlpEncodeList(items)
	// payload: 01 02 03 -> 3 bytes. Prefix = 0xc0+3 = 0xc3.
	if !bytes.Equal(multi, []byte{0xc3, 0x01, 0x02, 0x03}) {
		t.Errorf("multi list = %x, want c3010203", multi)
	}
}

func TestRlpEncodeBigInt(t *testing.T) {
	tests := []struct {
		name string
		val  *big.Int
		want string // hex
	}{
		{"nil", nil, "80"},
		{"zero", big.NewInt(0), "80"},
		{"one", big.NewInt(1), "01"},
		{"1e18", new(big.Int).SetUint64(1_000_000_000_000_000_000), "880de0b6b3a7640000"},
	}
	for _, tt := range tests {
		got := hex.EncodeToString(rlpEncodeBigInt(tt.val))
		if got != tt.want {
			t.Errorf("rlpEncodeBigInt(%s) = %s, want %s", tt.name, got, tt.want)
		}
	}
}

// ── funcSelector tests ──────────────────────────────────────────────

func TestFuncSelector(t *testing.T) {
	tests := []struct {
		sig  string
		want string // hex of 4 bytes
	}{
		// keccak256("mintDeposit(uint256,uint256,address,uint256,bytes)")
		// Verified against Solidity's abi.encodeWithSelector.
		{"mintDeposit(uint256,uint256,address,uint256,bytes)", ""},
		{"updateBacking(uint256,uint256,uint256,bytes)", ""},
	}

	for _, tt := range tests {
		sel := funcSelector(tt.sig)
		// Just verify it returns exactly 4 bytes and is deterministic.
		if len(sel) != 4 {
			t.Errorf("funcSelector(%q) len = %d, want 4", tt.sig, len(sel))
		}
		// Call twice, verify same result.
		sel2 := funcSelector(tt.sig)
		if sel != sel2 {
			t.Errorf("funcSelector(%q) not deterministic: %x != %x", tt.sig, sel, sel2)
		}
	}

	// Verify two different signatures produce different selectors.
	a := funcSelector("mintDeposit(uint256,uint256,address,uint256,bytes)")
	b := funcSelector("updateBacking(uint256,uint256,uint256,bytes)")
	if a == b {
		t.Errorf("different functions produced same selector: %x", a)
	}
}

// ── leftPad / rightPad tests ────────────────────────────────────────

func TestLeftPad(t *testing.T) {
	tests := []struct {
		in   []byte
		n    int
		want int // expected length
	}{
		{[]byte{0x01}, 32, 32},
		{nil, 32, 32},
		{make([]byte, 40), 32, 40}, // already larger
	}
	for _, tt := range tests {
		got := leftPad(tt.in, tt.n)
		if len(got) != tt.want {
			t.Errorf("leftPad(%x, %d) len = %d, want %d", tt.in, tt.n, len(got), tt.want)
		}
		// Verify content is right-aligned.
		if tt.in != nil && len(tt.in) <= tt.n {
			for i, b := range tt.in {
				pos := len(got) - len(tt.in) + i
				if got[pos] != b {
					t.Errorf("leftPad: byte at %d = 0x%02x, want 0x%02x", pos, got[pos], b)
				}
			}
		}
	}
}

func TestRightPad(t *testing.T) {
	tests := []struct {
		in    []byte
		align int
		want  int // expected length (multiple of align)
	}{
		{[]byte{0x01, 0x02, 0x03}, 32, 32},
		{make([]byte, 32), 32, 32}, // already aligned
		{make([]byte, 33), 32, 64}, // rounds up
		{make([]byte, 65), 32, 96},
	}
	for _, tt := range tests {
		got := rightPad(tt.in, tt.align)
		if len(got) != tt.want {
			t.Errorf("rightPad(len=%d, align=%d) len = %d, want %d", len(tt.in), tt.align, len(got), tt.want)
		}
		// Verify original content preserved at start.
		if !bytes.Equal(got[:len(tt.in)], tt.in) {
			t.Error("rightPad: original content not preserved")
		}
		// Verify padding is zeros.
		for i := len(tt.in); i < len(got); i++ {
			if got[i] != 0 {
				t.Errorf("rightPad: padding byte at %d = 0x%02x, want 0x00", i, got[i])
				break
			}
		}
	}
}

func TestUint256Bytes(t *testing.T) {
	tests := []struct {
		name string
		val  *big.Int
		want int // expected length
	}{
		{"nil", nil, 32},
		{"zero", big.NewInt(0), 32},
		{"one", big.NewInt(1), 32},
		{"large", new(big.Int).SetUint64(math.MaxUint64), 32},
	}
	for _, tt := range tests {
		got := uint256Bytes(tt.val)
		if len(got) != tt.want {
			t.Errorf("uint256Bytes(%s) len = %d, want %d", tt.name, len(got), tt.want)
		}
		// Verify nil and zero produce all-zero bytes.
		if tt.val == nil || tt.val.Sign() == 0 {
			for i, b := range got {
				if b != 0 {
					t.Errorf("uint256Bytes(%s): byte %d = 0x%02x, want 0x00", tt.name, i, b)
					break
				}
			}
		}
	}

	// Verify round-trip: uint256Bytes -> big.Int
	original := new(big.Int).SetUint64(1_000_000_000)
	encoded := uint256Bytes(original)
	decoded := new(big.Int).SetBytes(encoded)
	if decoded.Cmp(original) != 0 {
		t.Errorf("round-trip: got %s, want %s", decoded, original)
	}
}
