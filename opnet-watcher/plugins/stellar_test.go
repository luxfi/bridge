// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

package plugins

import (
	"math/big"
	"testing"
)

func TestNewStellarPlugin(t *testing.T) {
	p := NewStellarPlugin("https://horizon.stellar.org", "GABC...")
	if p.Name() != "stellar" {
		t.Errorf("Name() = %q, want stellar", p.Name())
	}
	if p.ChainID() != StellarChainID {
		t.Errorf("ChainID() = %d, want %d", p.ChainID(), StellarChainID)
	}
}

func TestStellarChainIDValue(t *testing.T) {
	// "XLM\x00" = 0x584C4D00
	const want uint64 = 0x584C4D00
	if StellarChainID != want {
		t.Errorf("StellarChainID = 0x%X, want 0x%X", StellarChainID, want)
	}
}

func TestParseStroops(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want *big.Int
	}{
		{"1_XLM", "1.0000000", big.NewInt(10000000)},
		{"0.1_XLM", "0.1000000", big.NewInt(1000000)},
		{"0.0000001", "0.0000001", big.NewInt(1)},
		{"100_XLM", "100.0000000", big.NewInt(1000000000)},
		{"integer_only", "42", big.NewInt(420000000)},
		{"zero", "0.0000000", big.NewInt(0)},
		{"large", "999999999.9999999", big.NewInt(9999999999999999)},
		{"short_frac", "1.5", big.NewInt(15000000)},
		{"empty", "", nil},
	}

	for _, tt := range tests {
		got := parseStroops(tt.in)
		if tt.want == nil {
			if got != nil {
				t.Errorf("%s: expected nil, got %s", tt.name, got)
			}
			continue
		}
		if got == nil {
			t.Errorf("%s: expected %s, got nil", tt.name, tt.want)
			continue
		}
		if got.Cmp(tt.want) != 0 {
			t.Errorf("%s: parseStroops(%q) = %s, want %s", tt.name, tt.in, got, tt.want)
		}
	}
}

func TestParseStroopsRoundtrip(t *testing.T) {
	// 1 XLM = 10_000_000 stroops
	got := parseStroops("1.0000000")
	if got == nil || got.Int64() != 10_000_000 {
		t.Errorf("1 XLM should be 10000000 stroops, got %v", got)
	}

	// 0.5 XLM = 5_000_000 stroops
	got = parseStroops("0.5000000")
	if got == nil || got.Int64() != 5_000_000 {
		t.Errorf("0.5 XLM should be 5000000 stroops, got %v", got)
	}
}
