// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

package plugins

import "testing"

func TestChainIDConstants(t *testing.T) {
	tests := []struct {
		name string
		got  uint64
		want uint64
	}{
		{"OPNETChainID", OPNETChainID, 4294967299},  // 0x100000003 -- NOT the old 1330663759
		{"SolanaChainID", SolanaChainID, 1399811149}, // "SOLN"
		{"TONChainID", TONChainID, 1414483791},       // "TONO"
	}
	for _, tt := range tests {
		if tt.got != tt.want {
			t.Errorf("%s = %d, want %d", tt.name, tt.got, tt.want)
		}
	}
}

// Regression: OPNETChainID was previously 1330663759 (0x4F504E4F).
// Must be 4294967299 (0x100000003) to match the Teleporter namespace.
func TestOPNETChainIDNotOldValue(t *testing.T) {
	const oldBroken uint64 = 1330663759
	if OPNETChainID == oldBroken {
		t.Fatalf("OPNETChainID is the OLD broken value %d; must be 4294967299", oldBroken)
	}
}
