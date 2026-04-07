// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

package plugins

import (
	"encoding/binary"
	"fmt"
	"math/big"
	"testing"
)

func TestNewPolkadotPlugin(t *testing.T) {
	p := NewPolkadotPlugin("http://dot:9933", "5GrwvaEF...")
	if p.Name() != "polkadot" {
		t.Errorf("Name() = %q, want polkadot", p.Name())
	}
	if p.ChainID() != PolkadotChainID {
		t.Errorf("ChainID() = %d, want %d", p.ChainID(), PolkadotChainID)
	}
}

func TestPolkadotChainIDValue(t *testing.T) {
	// "DOT\x00" = 0x444F5400
	const want uint64 = 0x444F5400
	if PolkadotChainID != want {
		t.Errorf("PolkadotChainID = 0x%X, want 0x%X", PolkadotChainID, want)
	}
}

func TestScaleCompactDecode(t *testing.T) {
	tests := []struct {
		name     string
		data     []byte
		wantVal  uint64
		wantLen  int
	}{
		{"single_byte_0", []byte{0x00}, 0, 1},
		{"single_byte_1", []byte{0x04}, 1, 1},
		{"single_byte_42", []byte{0xA8}, 42, 1},
		{"single_byte_63", []byte{0xFC}, 63, 1},
		{"two_byte_64", []byte{0x01, 0x01}, 64, 2},
		{"two_byte_255", []byte{0xFD, 0x03}, 255, 2},
		{"four_byte_16384", []byte{0x02, 0x00, 0x01, 0x00}, 16384, 4},
		{"big_int_mode", []byte{0x03, 0x01, 0x00, 0x00, 0x00, 0x00}, 1, 1 + 4},
		{"empty", nil, 0, 0},
		{"too_short_two_byte", []byte{0x01}, 0, 0},
		{"too_short_four_byte", []byte{0x02, 0x00}, 0, 0},
	}
	for _, tt := range tests {
		val, n := scaleCompactDecode(tt.data)
		if val != tt.wantVal {
			t.Errorf("%s: value = %d, want %d", tt.name, val, tt.wantVal)
		}
		if n != tt.wantLen {
			t.Errorf("%s: consumed = %d, want %d", tt.name, n, tt.wantLen)
		}
	}
}

func TestScaleCompactDecodeUint128(t *testing.T) {
	tests := []struct {
		name    string
		data    []byte
		wantVal *big.Int
		wantLen int
	}{
		{"zero", []byte{0x00}, big.NewInt(0), 1},
		{"one", []byte{0x04}, big.NewInt(1), 1},
		{"two_byte_100", []byte{0x91, 0x01}, big.NewInt(100), 2},
		{"four_byte", []byte{0x02, 0x00, 0x01, 0x00}, new(big.Int).SetUint64(16384), 4},
		{
			"big_int_16_bytes",
			// mode 0x03, byteLen = (0x33>>2)+4 = 12+4 = 16, but let's use 4 bytes
			// (0x03>>2)+4 = 4, data = [0x40, 0x42, 0x0F, 0x00] = 1_000_000 LE
			append([]byte{0x03}, func() []byte {
				b := make([]byte, 4)
				binary.LittleEndian.PutUint32(b, 1_000_000)
				return b
			}()...),
			new(big.Int).SetUint64(1_000_000),
			5,
		},
		{"empty", nil, big.NewInt(0), 0},
	}
	for _, tt := range tests {
		val, n := scaleCompactDecodeUint128(tt.data)
		if val.Cmp(tt.wantVal) != 0 {
			t.Errorf("%s: value = %s, want %s", tt.name, val, tt.wantVal)
		}
		if n != tt.wantLen {
			t.Errorf("%s: consumed = %d, want %d", tt.name, n, tt.wantLen)
		}
	}
}

func TestScaleDecodeUint(t *testing.T) {
	tests := []struct {
		name string
		data []byte
		want *big.Int
	}{
		{"zero", []byte{0x00}, big.NewInt(0)},
		{"one_LE", []byte{0x01, 0x00, 0x00, 0x00}, big.NewInt(1)},
		{"256_LE", []byte{0x00, 0x01, 0x00, 0x00}, big.NewInt(256)},
		{"1e9_LE", func() []byte {
			b := make([]byte, 8)
			binary.LittleEndian.PutUint64(b, 1_000_000_000)
			return b
		}(), new(big.Int).SetUint64(1_000_000_000)},
		{"empty", nil, big.NewInt(0)},
	}
	for _, tt := range tests {
		got := scaleDecodeUint(tt.data)
		if got.Cmp(tt.want) != 0 {
			t.Errorf("%s: scaleDecodeUint = %s, want %s", tt.name, got, tt.want)
		}
	}
}

func TestReverseBytes(t *testing.T) {
	tests := []struct {
		name string
		in   []byte
		want []byte
	}{
		{"empty", nil, nil},
		{"single", []byte{0xAA}, []byte{0xAA}},
		{"pair", []byte{0x01, 0x02}, []byte{0x02, 0x01}},
		{"triple", []byte{0x01, 0x02, 0x03}, []byte{0x03, 0x02, 0x01}},
		{"four", []byte{0xDE, 0xAD, 0xBE, 0xEF}, []byte{0xEF, 0xBE, 0xAD, 0xDE}},
	}
	for _, tt := range tests {
		b := make([]byte, len(tt.in))
		copy(b, tt.in)
		reverseBytes(b)
		if len(b) != len(tt.want) {
			t.Errorf("%s: len = %d, want %d", tt.name, len(b), len(tt.want))
			continue
		}
		for i := range b {
			if b[i] != tt.want[i] {
				t.Errorf("%s: byte %d = 0x%02x, want 0x%02x", tt.name, i, b[i], tt.want[i])
			}
		}
	}
}

// Test parseSubstrateDepositExtrinsic with a hand-crafted unsigned extrinsic.
func TestParseSubstrateDepositExtrinsic_Unsigned(t *testing.T) {
	// Build an unsigned extrinsic:
	//   compact_length + version_byte(0x04, unsigned) + pallet(any) + call(0x00)
	//   + recipient(32) + amount(compact) + nonce(u64 LE)
	var recip [20]byte
	for i := range recip {
		recip[i] = byte(0xA0 + i)
	}

	// Call data: pallet_index=0x05, call_index=0x00
	// recipient: 12 zero bytes + 20 address bytes = 32 bytes
	// amount: compact(1_000_000_000) = 0x02 0x00 0xCA 0x9A (4-byte mode, value >> 2)
	// nonce: 42 as u64 LE
	callData := []byte{0x05, 0x00} // pallet 5, call 0

	recipField := make([]byte, 32)
	copy(recipField[12:], recip[:])
	callData = append(callData, recipField...)

	// Compact encode 1_000_000_000: (1_000_000_000 << 2) | 0x02 = 4_000_000_002
	// = 0xEE6B2802 LE => 0x02, 0x28, 0x6B, 0xEE
	callData = append(callData, 0x02, 0x28, 0x6B, 0xEE)

	nonce := make([]byte, 8)
	binary.LittleEndian.PutUint64(nonce, 42)
	callData = append(callData, nonce...)

	// Version byte: 0x04 (version 4, unsigned)
	body := append([]byte{0x04}, callData...)

	// SCALE compact length prefix for the body.
	bodyLen := len(body)
	var lengthPrefix []byte
	if bodyLen < 64 {
		lengthPrefix = []byte{byte(bodyLen << 2)}
	} else {
		// Two-byte mode
		val := uint16(bodyLen<<2) | 0x01
		lengthPrefix = []byte{byte(val), byte(val >> 8)}
	}

	ext := append(lengthPrefix, body...)

	// Encode as hex string.
	hexStr := "0x"
	for _, b := range ext {
		hexStr += fmt.Sprintf("%02x", b)
	}

	ev, ok := parseSubstrateDepositExtrinsic(hexStr, 100)
	if !ok {
		t.Fatal("parseSubstrateDepositExtrinsic returned false for valid unsigned extrinsic")
	}
	if ev.SrcChainID != PolkadotChainID {
		t.Errorf("SrcChainID = %d, want %d", ev.SrcChainID, PolkadotChainID)
	}
	if ev.Nonce != 42 {
		t.Errorf("Nonce = %d, want 42", ev.Nonce)
	}
	if ev.Recipient != recip {
		t.Errorf("Recipient = %x, want %x", ev.Recipient, recip)
	}
	wantAmount := big.NewInt(1_000_000_000)
	if ev.Amount.Cmp(wantAmount) != 0 {
		t.Errorf("Amount = %s, want %s", ev.Amount, wantAmount)
	}
	if ev.BlockHeight != 100 {
		t.Errorf("BlockHeight = %d, want 100", ev.BlockHeight)
	}
}

func TestParseSubstrateDepositExtrinsic_WrongCallIndex(t *testing.T) {
	// Build an unsigned extrinsic with call_index=0x01 (not deposit).
	callData := make([]byte, 2+32+4+8) // pallet + call + recip + amount + nonce
	callData[0] = 0x05                  // pallet
	callData[1] = 0x01                  // wrong call index

	body := append([]byte{0x04}, callData...)
	lengthPrefix := []byte{byte(len(body) << 2)}
	ext := append(lengthPrefix, body...)

	hexStr := "0x"
	for _, b := range ext {
		hexStr += fmt.Sprintf("%02x", b)
	}

	_, ok := parseSubstrateDepositExtrinsic(hexStr, 100)
	if ok {
		t.Error("expected false for non-deposit call index")
	}
}

func TestParseSubstrateDepositExtrinsic_TooShort(t *testing.T) {
	_, ok := parseSubstrateDepositExtrinsic("0x0401", 100)
	if ok {
		t.Error("expected false for short extrinsic")
	}
}

func TestParseSubstrateDepositExtrinsic_BadHex(t *testing.T) {
	_, ok := parseSubstrateDepositExtrinsic("not-hex", 100)
	if ok {
		t.Error("expected false for bad hex")
	}
}
