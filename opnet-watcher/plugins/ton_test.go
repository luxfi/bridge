// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

package plugins

import (
	"math/big"
	"testing"
)

func TestDecodeVarUInteger16(t *testing.T) {
	tests := []struct {
		name       string
		data       []byte
		offset     int
		wantVal    *big.Int
		wantOffset int
	}{
		{
			name:       "1_byte_small",
			data:       []byte{0x10, 0x01},        // high nibble = 1 -> 1 byte follows: 0x01
			offset:     0,
			wantVal:    big.NewInt(1),
			wantOffset: 2,
		},
		{
			name:       "1_byte_max",
			data:       []byte{0x10, 0xFF},         // 1 byte: 255
			offset:     0,
			wantVal:    big.NewInt(255),
			wantOffset: 2,
		},
		{
			name:       "2_bytes",
			data:       []byte{0x20, 0x03, 0xE8},   // high nibble = 2 -> 2 bytes: 0x03E8 = 1000
			offset:     0,
			wantVal:    big.NewInt(1000),
			wantOffset: 3,
		},
		{
			name: "4_bytes_medium",
			data: []byte{0x40, 0x3B, 0x9A, 0xCA, 0x00}, // 4 bytes: 0x3B9ACA00 = 1e9 (1 TON)
			offset:     0,
			wantVal:    big.NewInt(1_000_000_000),
			wantOffset: 5,
		},
		{
			name: "8_bytes_large",
			data: func() []byte {
				// high nibble = 8, followed by 8 bytes big-endian for 1e18
				b := []byte{0x80, 0x0D, 0xE0, 0xB6, 0xB3, 0xA7, 0x64, 0x00, 0x00}
				return b
			}(),
			offset:     0,
			wantVal:    new(big.Int).SetUint64(1_000_000_000_000_000_000),
			wantOffset: 9,
		},
		{
			name:       "with_offset",
			data:       []byte{0xFF, 0xFF, 0x20, 0x01, 0x00}, // skip first 2 bytes
			offset:     2,
			wantVal:    big.NewInt(256),
			wantOffset: 5,
		},
		{
			name:       "zero_byte_count",
			data:       []byte{0x00}, // high nibble = 0 -> 0 byte count
			offset:     0,
			wantVal:    big.NewInt(0),
			wantOffset: 1,
		},
		{
			name:       "offset_at_end",
			data:       []byte{0x10},
			offset:     0,
			wantVal:    big.NewInt(0), // n=1 but offset+n > len(data)
			wantOffset: 1,
		},
		{
			name:       "offset_past_end",
			data:       []byte{0x10},
			offset:     5,
			wantVal:    big.NewInt(0),
			wantOffset: 5,
		},
		{
			name:       "empty_data",
			data:       nil,
			offset:     0,
			wantVal:    big.NewInt(0),
			wantOffset: 0,
		},
	}

	for _, tt := range tests {
		val, off := decodeVarUInteger16(tt.data, tt.offset)
		if val.Cmp(tt.wantVal) != 0 {
			t.Errorf("%s: value = %s, want %s", tt.name, val, tt.wantVal)
		}
		if off != tt.wantOffset {
			t.Errorf("%s: offset = %d, want %d", tt.name, off, tt.wantOffset)
		}
	}
}

func TestBe32(t *testing.T) {
	tests := []struct {
		in   [4]byte
		want uint32
	}{
		{[4]byte{0, 0, 0, 0}, 0},
		{[4]byte{0, 0, 0, 1}, 1},
		{[4]byte{0x44, 0x45, 0x50, 0x31}, 0x44455031}, // depositOp tag
		{[4]byte{0xFF, 0xFF, 0xFF, 0xFF}, 0xFFFFFFFF},
	}
	for _, tt := range tests {
		got := be32(tt.in[:])
		if got != tt.want {
			t.Errorf("be32(%x) = %d, want %d", tt.in, got, tt.want)
		}
	}
}

func TestBe64(t *testing.T) {
	tests := []struct {
		in   [8]byte
		want uint64
	}{
		{[8]byte{0, 0, 0, 0, 0, 0, 0, 0}, 0},
		{[8]byte{0, 0, 0, 0, 0, 0, 0, 1}, 1},
		{[8]byte{0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF}, ^uint64(0)},
	}
	for _, tt := range tests {
		got := be64(tt.in[:])
		if got != tt.want {
			t.Errorf("be64(%x) = %d, want %d", tt.in, got, tt.want)
		}
	}
}

func TestFindCellData_StandardBOC(t *testing.T) {
	// magic = b5ee9c72, flags&size byte = 0x01 (sizeBytes=1)
	// headerSize = 4 + 1 + 1 + 1 + 1 + 1 + 1 = 10
	// We need at least headerSize+1 bytes so findCellData returns cell data.
	boc := []byte{0xb5, 0xee, 0x9c, 0x72, 0x01, 0x01, 0x01, 0x00, 0x05, 0x00, 0xAA}
	result := findCellData(boc)
	if result == nil {
		t.Fatal("findCellData returned nil for valid BOC")
	}
	// Should return data starting after header (offset 10).
	if result[0] != 0xAA {
		t.Errorf("first cell byte = 0x%02x, want 0xAA", result[0])
	}
}

func TestFindCellData_StandardBOC_TooShort(t *testing.T) {
	// BOC with valid magic but too short (9 bytes < 10 minimum) — returns nil.
	boc := []byte{0xb5, 0xee, 0x9c, 0x72, 0x01, 0x01, 0x01, 0x00, 0x10}
	result := findCellData(boc)
	if result != nil {
		t.Error("expected nil for BOC shorter than 10 bytes")
	}
}

func TestFindCellData_TooShort(t *testing.T) {
	result := findCellData([]byte{0xb5, 0xee})
	if result != nil {
		t.Error("expected nil for short BOC")
	}
}

func TestFindCellData_Nil(t *testing.T) {
	result := findCellData(nil)
	if result != nil {
		t.Error("expected nil for nil input")
	}
}

func TestFindCellData_NonStandardMagic(t *testing.T) {
	// Non-standard magic: should return raw data as fallback.
	data := []byte{0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09}
	result := findCellData(data)
	if len(result) != len(data) {
		t.Errorf("expected raw data (%d bytes), got %d bytes", len(data), len(result))
	}
}
