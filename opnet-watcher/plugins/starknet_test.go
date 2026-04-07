// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

package plugins

import (
	"math/big"
	"testing"
)

func TestNewStarkNetPlugin(t *testing.T) {
	p := NewStarkNetPlugin("http://starknet:5050", "0xdead")
	if p.Name() != "starknet" {
		t.Errorf("Name() = %q, want starknet", p.Name())
	}
	if p.ChainID() != StarkNetChainID {
		t.Errorf("ChainID() = %d, want %d", p.ChainID(), StarkNetChainID)
	}
}

func TestStarkNetChainIDValue(t *testing.T) {
	// "STK\x00" = 0x53544B00
	const want uint64 = 0x53544B00
	if StarkNetChainID != want {
		t.Errorf("StarkNetChainID = 0x%X, want 0x%X", StarkNetChainID, want)
	}
}

func TestFeltToBigInt(t *testing.T) {
	tests := []struct {
		name    string
		felt    string
		want    *big.Int
		wantErr bool
	}{
		{"zero", "0x0", big.NewInt(0), false},
		{"one", "0x1", big.NewInt(1), false},
		{"large", "0xde0b6b3a7640000", new(big.Int).SetUint64(1_000_000_000_000_000_000), false},
		{"no_prefix", "ff", big.NewInt(255), false},
		{"empty", "0x", big.NewInt(0), false},
		{"invalid", "0xZZ", nil, true},
	}
	for _, tt := range tests {
		got, err := feltToBigInt(tt.felt)
		if tt.wantErr {
			if err == nil {
				t.Errorf("%s: expected error, got nil", tt.name)
			}
			continue
		}
		if err != nil {
			t.Errorf("%s: unexpected error: %v", tt.name, err)
			continue
		}
		if got.Cmp(tt.want) != 0 {
			t.Errorf("%s: got %s, want %s", tt.name, got, tt.want)
		}
	}
}

func TestFeltToRecipient(t *testing.T) {
	tests := []struct {
		name    string
		felt    string
		want    [20]byte
		wantErr bool
	}{
		{
			name: "exact_20_bytes",
			felt: "0xAaBbCcDdEeFf00112233445566778899AaBbCcDd",
			want: [20]byte{0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF, 0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xAA, 0xBB, 0xCC, 0xDD},
		},
		{
			name: "32_byte_felt_takes_last_20",
			felt: "0x000000000000000000000000DeAdBeEf00112233445566778899AaBbCcDdEeFf",
			want: [20]byte{0xDE, 0xAD, 0xBE, 0xEF, 0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF},
		},
		{
			name: "short_felt_padded_left",
			felt: "0x01",
			want: [20]byte{0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x01},
		},
		{
			name:    "empty_felt",
			felt:    "0x",
			wantErr: true,
		},
		{
			name:    "invalid_hex",
			felt:    "0xZZ",
			wantErr: true,
		},
	}
	for _, tt := range tests {
		got, err := feltToRecipient(tt.felt)
		if tt.wantErr {
			if err == nil {
				t.Errorf("%s: expected error, got nil", tt.name)
			}
			continue
		}
		if err != nil {
			t.Errorf("%s: unexpected error: %v", tt.name, err)
			continue
		}
		if got != tt.want {
			t.Errorf("%s: got %x, want %x", tt.name, got, tt.want)
		}
	}
}
