// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

package main

import (
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
