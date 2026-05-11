// Copyright (C) 2019-2026, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

package main

import (
	"errors"
	"math/big"
	"testing"

	"github.com/luxfi/bridge"
)

// makeTestKey returns a deterministic 32-byte dev key for signing
// tests. Test-only; never reused outside this file.
func makeTestKey() []byte {
	k := make([]byte, 32)
	for i := range k {
		k[i] = byte(i + 1)
	}
	return k
}

// TestSigner_RefusesECDSAUnderStrictPQ — the spec test: a signer
// configured with the strict-PQ bridge profile MUST refuse every
// classical-admin sign call. SignRaw / SignDeposit / SignBacking /
// signEthMessage all consult the gate and return
// ErrBridgeProfileForbidden.
func TestSigner_RefusesECDSAUnderStrictPQ(t *testing.T) {
	s, err := NewSigner(makeTestKey())
	if err != nil {
		t.Fatalf("NewSigner: %v", err)
	}
	p := bridge.LuxStrictPQBridgeProfile
	s.SetProfile(&p)

	// SignRaw must refuse.
	if _, err := s.SignRaw(make([]byte, 32)); err == nil {
		t.Errorf("SignRaw under strict-PQ = nil, want refusal")
	} else if !errors.Is(err, bridge.ErrBridgeProfileForbidden) {
		t.Errorf("SignRaw err = %v, want ErrBridgeProfileForbidden", err)
	}

	// SignDeposit must refuse (routes through signEthMessage gate).
	var recipient [20]byte
	if _, err := s.SignDeposit(1, 42, recipient, big.NewInt(1)); err == nil {
		t.Errorf("SignDeposit under strict-PQ = nil, want refusal")
	} else if !errors.Is(err, bridge.ErrBridgeProfileForbidden) {
		t.Errorf("SignDeposit err = %v, want ErrBridgeProfileForbidden", err)
	}

	// SignBacking must refuse.
	if _, err := s.SignBacking(1, big.NewInt(1000), 1234567890); err == nil {
		t.Errorf("SignBacking under strict-PQ = nil, want refusal")
	} else if !errors.Is(err, bridge.ErrBridgeProfileForbidden) {
		t.Errorf("SignBacking err = %v, want ErrBridgeProfileForbidden", err)
	}

	// SignTransaction must refuse.
	if _, err := s.SignTransaction(make([]byte, 9), 96369); err == nil {
		t.Errorf("SignTransaction under strict-PQ = nil, want refusal")
	} else if !errors.Is(err, bridge.ErrBridgeProfileForbidden) {
		t.Errorf("SignTransaction err = %v, want ErrBridgeProfileForbidden", err)
	}
}

// TestSigner_ProceedsUnderClassicalCompat — the default profile is
// BridgeClassicalCompat; SignDeposit / SignBacking succeed and emit the
// counter. The classical-compat assertion is the dual of
// TestSigner_RefusesECDSAUnderStrictPQ.
func TestSigner_ProceedsUnderClassicalCompat(t *testing.T) {
	s, err := NewSigner(makeTestKey())
	if err != nil {
		t.Fatalf("NewSigner: %v", err)
	}
	// Default profile from NewSigner is BridgeClassicalCompat; verify
	// SignDeposit actually returns a signature.
	var recipient [20]byte
	sig, err := s.SignDeposit(1, 42, recipient, big.NewInt(1))
	if err != nil {
		t.Fatalf("SignDeposit under classical-compat = %v, want nil", err)
	}
	if len(sig) != 65 {
		t.Errorf("signature len = %d, want 65", len(sig))
	}
}

// TestSigner_ClassicalCompatTotalIncrements — every signing call under
// classical-compat increments bridge_classical_compat_total{primitive="admin"}.
func TestSigner_ClassicalCompatTotalIncrements(t *testing.T) {
	s, err := NewSigner(makeTestKey())
	if err != nil {
		t.Fatalf("NewSigner: %v", err)
	}
	before := bridge.ClassicalCompatTotal()["admin"]

	var recipient [20]byte
	if _, err := s.SignDeposit(1, 42, recipient, big.NewInt(1)); err != nil {
		t.Fatalf("SignDeposit: %v", err)
	}

	after := bridge.ClassicalCompatTotal()["admin"]
	if after <= before {
		t.Errorf("classical-compat counter did not advance: before=%d after=%d", before, after)
	}
}

// TestSigner_SetProfile_StrictPQEvenAfterConstruction — verify the
// profile pointer is observed on subsequent sign calls, not snapshotted
// at construction time.
func TestSigner_SetProfile_StrictPQEvenAfterConstruction(t *testing.T) {
	s, err := NewSigner(makeTestKey())
	if err != nil {
		t.Fatalf("NewSigner: %v", err)
	}
	// First call under default (classical-compat) succeeds.
	var recipient [20]byte
	if _, err := s.SignDeposit(1, 42, recipient, big.NewInt(1)); err != nil {
		t.Fatalf("classical-compat SignDeposit: %v", err)
	}
	// Flip to strict-PQ; next call must refuse.
	p := bridge.LuxStrictPQBridgeProfile
	s.SetProfile(&p)
	if _, err := s.SignDeposit(1, 43, recipient, big.NewInt(1)); err == nil {
		t.Errorf("strict-PQ SignDeposit = nil, want refusal")
	} else if !errors.Is(err, bridge.ErrBridgeProfileForbidden) {
		t.Errorf("err = %v, want ErrBridgeProfileForbidden", err)
	}
}
