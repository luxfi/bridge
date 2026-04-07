// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

package plugins

import "testing"

func TestNewAptosPlugin(t *testing.T) {
	p := NewAptosPlugin("http://aptos:8080", "0x1")
	if p.Name() != "aptos" {
		t.Errorf("Name() = %q, want aptos", p.Name())
	}
	if p.ChainID() != AptosChainID {
		t.Errorf("ChainID() = %d, want %d", p.ChainID(), AptosChainID)
	}
}

func TestAptosChainIDValue(t *testing.T) {
	// "APT\x00" = 0x41505400
	const want uint64 = 0x41505400
	if AptosChainID != want {
		t.Errorf("AptosChainID = 0x%X, want 0x%X", AptosChainID, want)
	}
}

func TestAptosHexToRecipient(t *testing.T) {
	tests := []struct {
		name    string
		hex     string
		want    [20]byte
		wantErr bool
	}{
		{
			name: "exact_20_bytes",
			hex:  "0xAaBbCcDdEeFf00112233445566778899AaBbCcDd",
			want: [20]byte{0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF, 0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xAA, 0xBB, 0xCC, 0xDD},
		},
		{
			name: "32_bytes_takes_last_20",
			hex:  "0x000000000000000000000000DeAdBeEf00112233445566778899AaBbCcDdEeFf",
			want: [20]byte{0xDE, 0xAD, 0xBE, 0xEF, 0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF},
		},
		{
			name: "short_padded_left",
			hex:  "0x01",
			want: [20]byte{0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x01},
		},
		{
			name:    "empty",
			hex:     "0x",
			wantErr: true,
		},
		{
			name:    "invalid_hex",
			hex:     "0xGG",
			wantErr: true,
		},
	}
	for _, tt := range tests {
		got, err := aptosHexToRecipient(tt.hex)
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
