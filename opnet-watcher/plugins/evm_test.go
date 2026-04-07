// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

package plugins

import (
	"encoding/hex"
	"testing"
)

func TestNewEVMPlugin(t *testing.T) {
	p := NewEVMPlugin("ethereum", 1, "http://localhost:8545", "0xdead")
	if p.Name() != "ethereum" {
		t.Errorf("Name() = %q, want ethereum", p.Name())
	}
	if p.ChainID() != 1 {
		t.Errorf("ChainID() = %d, want 1", p.ChainID())
	}
}

func TestNewEVMPlugin_CustomChain(t *testing.T) {
	p := NewEVMPlugin("arbitrum", 42161, "http://arb:8545", "0xbeef")
	if p.Name() != "arbitrum" {
		t.Errorf("Name() = %q, want arbitrum", p.Name())
	}
	if p.ChainID() != 42161 {
		t.Errorf("ChainID() = %d, want 42161", p.ChainID())
	}
}

func TestHexToBytes(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    string // hex-encoded expected output
		wantErr bool
	}{
		{
			name:  "with_0x_prefix",
			input: "0xdeadbeef",
			want:  "deadbeef",
		},
		{
			name:  "without_prefix",
			input: "deadbeef",
			want:  "deadbeef",
		},
		{
			name:  "odd_length_padded",
			input: "0xf",
			want:  "0f",
		},
		{
			name:  "odd_no_prefix",
			input: "abc",
			want:  "0abc",
		},
		{
			name:  "empty",
			input: "",
			want:  "",
		},
		{
			name:  "just_0x",
			input: "0x",
			want:  "",
		},
		{
			name:  "uppercase",
			input: "0xDEAD",
			want:  "dead",
		},
		{
			name:  "mixed_case",
			input: "0xDeAdBe",
			want:  "deadbe",
		},
		{
			name:  "single_zero",
			input: "0x0",
			want:  "00",
		},
		{
			name:  "32_bytes",
			input: "0x" + "ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00",
			want:  "ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00",
		},
		{
			name:    "invalid_hex_char",
			input:   "0xGG",
			wantErr: true,
		},
		{
			name:    "invalid_mixed",
			input:   "0xzz11",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		got, err := hexToBytes(tt.input)
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
		gotHex := hex.EncodeToString(got)
		if gotHex != tt.want {
			t.Errorf("%s: hexToBytes(%q) = %q, want %q", tt.name, tt.input, gotHex, tt.want)
		}
	}
}

func TestNewSolanaPlugin(t *testing.T) {
	p := NewSolanaPlugin("http://sol:8899", "BridgeProg111", "VaultPDA111")
	if p.Name() != "solana" {
		t.Errorf("Name() = %q, want solana", p.Name())
	}
	if p.ChainID() != SolanaChainID {
		t.Errorf("ChainID() = %d, want %d", p.ChainID(), SolanaChainID)
	}
}

func TestNewTONPlugin(t *testing.T) {
	p := NewTONPlugin("http://ton:8080/api/v2", "EQ...")
	if p.Name() != "ton" {
		t.Errorf("Name() = %q, want ton", p.Name())
	}
	if p.ChainID() != TONChainID {
		t.Errorf("ChainID() = %d, want %d", p.ChainID(), TONChainID)
	}
}

func TestNewOPNETPlugin(t *testing.T) {
	p := NewOPNETPlugin("http://opnet:3000", "0xbridge")
	if p.Name() != "opnet" {
		t.Errorf("Name() = %q, want opnet", p.Name())
	}
	if p.ChainID() != OPNETChainID {
		t.Errorf("ChainID() = %d, want %d", p.ChainID(), OPNETChainID)
	}
}
