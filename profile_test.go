// Copyright (C) 2019-2026, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

package bridge

import (
	"encoding/json"
	"errors"
	"testing"
)

// TestBridgeProfileID_String pins the wire-name table.
func TestBridgeProfileID_String(t *testing.T) {
	cases := []struct {
		id   BridgeProfileID
		want string
	}{
		{BridgeProfileIDNone, "none"},
		{BridgeProfileIDLuxStrictPQ, "lux-strict-pq-bridge"},
		{BridgeProfileIDClassicalCompat, "bridge-classical-compat-unsafe"},
	}
	for _, c := range cases {
		if got := c.id.String(); got != c.want {
			t.Errorf("BridgeProfileID(0x%x).String() = %q, want %q", uint32(c.id), got, c.want)
		}
	}
}

// TestLuxStrictPQBridgeProfile_Fields — every field of the canonical
// strict-PQ profile is pinned.
func TestLuxStrictPQBridgeProfile_Fields(t *testing.T) {
	p := LuxStrictPQBridgeProfile
	if p.ProfileID != 0x01 {
		t.Errorf("ProfileID = 0x%x, want 0x01", p.ProfileID)
	}
	if p.Name != "LUX_STRICT_PQ_BRIDGE" {
		t.Errorf("Name = %q, want LUX_STRICT_PQ_BRIDGE", p.Name)
	}
	if p.SourceFinalityScheme != SchemePulsarM65 {
		t.Errorf("SourceFinalityScheme = %s, want pulsar-m-65", p.SourceFinalityScheme)
	}
	if p.DestFinalityScheme != SchemePulsarM65 {
		t.Errorf("DestFinalityScheme = %s, want pulsar-m-65", p.DestFinalityScheme)
	}
	if p.ProofPolicyID != PolicySTARKFRISHA3PQ {
		t.Errorf("ProofPolicyID = %s, want stark-fri-sha3-pq", p.ProofPolicyID)
	}
	if p.BridgeAdminScheme != AuthMLDSA87 {
		t.Errorf("BridgeAdminScheme = %s, want ml-dsa-87", p.BridgeAdminScheme)
	}
	if p.BridgePauseScheme != AuthMultisigMLDSA {
		t.Errorf("BridgePauseScheme = %s, want multisig-ml-dsa", p.BridgePauseScheme)
	}
	if !p.PostQuantumEndToEnd {
		t.Errorf("PostQuantumEndToEnd = false, want true")
	}
}

// TestBridgeProfile_LuxStrictPQ_AllForbidBitsTrue — every classical-allow
// gate is false on the canonical strict-PQ profile.
func TestBridgeProfile_LuxStrictPQ_AllForbidBitsTrue(t *testing.T) {
	p := LuxStrictPQBridgeProfile
	if p.AllowsClassicalAdmin {
		t.Errorf("AllowsClassicalAdmin = true, want false on strict-PQ")
	}
	if p.AllowsBLSAggregate {
		t.Errorf("AllowsBLSAggregate = true, want false on strict-PQ")
	}
	if p.AllowsKZGCommitment {
		t.Errorf("AllowsKZGCommitment = true, want false on strict-PQ")
	}
	if p.AllowsGroth16Wrap {
		t.Errorf("AllowsGroth16Wrap = true, want false on strict-PQ")
	}
	if p.AllowsPairingPrecompile {
		t.Errorf("AllowsPairingPrecompile = true, want false on strict-PQ")
	}
}

// TestBridgeClassicalCompat_Fields — classical-compat is explicitly
// labelled non-E2E-PQ and every classical gate is open.
func TestBridgeClassicalCompat_Fields(t *testing.T) {
	p := BridgeClassicalCompat
	if p.ProfileID != 0x90 {
		t.Errorf("ProfileID = 0x%x, want 0x90", p.ProfileID)
	}
	if p.PostQuantumEndToEnd {
		t.Errorf("PostQuantumEndToEnd = true, want false")
	}
	if !p.AllowsClassicalAdmin {
		t.Errorf("AllowsClassicalAdmin = false, want true")
	}
	if !p.AllowsBLSAggregate {
		t.Errorf("AllowsBLSAggregate = false, want true")
	}
}

// TestBridgeWithdraw_RefusesECDSAUnderStrictPQ — the spec test name:
// a withdraw handler under strict-PQ MUST refuse ECDSA admin.
func TestBridgeWithdraw_RefusesECDSAUnderStrictPQ(t *testing.T) {
	p := LuxStrictPQBridgeProfile
	if err := p.RefuseClassicalAdmin(); err == nil {
		t.Fatalf("withdraw under strict-PQ did not refuse ECDSA")
	} else if !errors.Is(err, ErrBridgeProfileForbidden) {
		t.Errorf("err = %v, want ErrBridgeProfileForbidden", err)
	}

	compat := BridgeClassicalCompat
	if err := compat.RefuseClassicalAdmin(); err != nil {
		t.Fatalf("withdraw under classical-compat refused ECDSA: %v", err)
	}
}

// TestBridgeProfile_RefuseGates_StrictPQRefusesEachPrimitive — each
// Refuse* gate refuses under strict-PQ; each allows under classical.
func TestBridgeProfile_RefuseGates_StrictPQRefusesEachPrimitive(t *testing.T) {
	strict := LuxStrictPQBridgeProfile
	compat := BridgeClassicalCompat

	for name, fn := range map[string]struct {
		strict func() error
		compat func() error
	}{
		"RefuseClassicalAdmin":    {strict.RefuseClassicalAdmin, compat.RefuseClassicalAdmin},
		"RefuseBLSAggregate":      {strict.RefuseBLSAggregate, compat.RefuseBLSAggregate},
		"RefuseKZGCommitment":     {strict.RefuseKZGCommitment, compat.RefuseKZGCommitment},
		"RefuseGroth16Wrap":       {strict.RefuseGroth16Wrap, compat.RefuseGroth16Wrap},
		"RefusePairingPrecompile": {strict.RefusePairingPrecompile, compat.RefusePairingPrecompile},
	} {
		if err := fn.strict(); err == nil {
			t.Errorf("strict-PQ %s = nil, want refusal", name)
		} else if !errors.Is(err, ErrBridgeProfileForbidden) {
			t.Errorf("strict-PQ %s err = %v, want ErrBridgeProfileForbidden", name, err)
		}

		if err := fn.compat(); err != nil {
			t.Errorf("classical-compat %s = %v, want nil", name, err)
		}
	}
}

// TestBridgeProfile_ClassicalCompatTotal_Increments — every Refuse*
// traversal under classical-compat increments the matching counter.
func TestBridgeProfile_ClassicalCompatTotal_Increments(t *testing.T) {
	before := ClassicalCompatTotal()

	compat := BridgeClassicalCompat
	_ = compat.RefuseClassicalAdmin()
	_ = compat.RefuseBLSAggregate()
	_ = compat.RefuseKZGCommitment()
	_ = compat.RefuseGroth16Wrap()
	_ = compat.RefusePairingPrecompile()

	after := ClassicalCompatTotal()

	if after["admin"] != before["admin"]+1 {
		t.Errorf("admin counter = %d, want %d", after["admin"], before["admin"]+1)
	}
	if after["bls_aggregate"] != before["bls_aggregate"]+1 {
		t.Errorf("bls_aggregate counter = %d, want %d", after["bls_aggregate"], before["bls_aggregate"]+1)
	}
	if after["kzg"] != before["kzg"]+1 {
		t.Errorf("kzg counter = %d, want %d", after["kzg"], before["kzg"]+1)
	}
	if after["groth16"] != before["groth16"]+1 {
		t.Errorf("groth16 counter = %d, want %d", after["groth16"], before["groth16"]+1)
	}
	if after["pairing"] != before["pairing"]+1 {
		t.Errorf("pairing counter = %d, want %d", after["pairing"], before["pairing"]+1)
	}
}

// TestBridgeProfile_NilReceiver — gates on a nil profile must refuse,
// not panic.
func TestBridgeProfile_NilReceiver(t *testing.T) {
	var p *BridgeProfile
	for name, fn := range map[string]func() error{
		"RefuseClassicalAdmin":    p.RefuseClassicalAdmin,
		"RefuseBLSAggregate":      p.RefuseBLSAggregate,
		"RefuseKZGCommitment":     p.RefuseKZGCommitment,
		"RefuseGroth16Wrap":       p.RefuseGroth16Wrap,
		"RefusePairingPrecompile": p.RefusePairingPrecompile,
	} {
		if err := fn(); err == nil {
			t.Errorf("nil-receiver %s = nil, want ErrBridgeProfileNil", name)
		} else if !errors.Is(err, ErrBridgeProfileNil) {
			t.Errorf("nil-receiver %s err = %v, want ErrBridgeProfileNil", name, err)
		}
	}
}

// TestBridgeProfile_Metadata_JSON pins the JSON contract for the
// bridge_getProfile RPC. The fields and the snake-case wire names are
// the public API; auditors filter on these.
func TestBridgeProfile_Metadata_JSON(t *testing.T) {
	p := LuxStrictPQBridgeProfile
	md := p.Metadata()

	b, err := json.Marshal(md)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}

	got := string(b)
	wantSubstrings := []string{
		`"profile_id":"0x01"`,
		`"name":"LUX_STRICT_PQ_BRIDGE"`,
		`"post_quantum_end_to_end":true`,
		`"source_finality_scheme":"PULSAR_M_65"`,
		`"dest_finality_scheme":"PULSAR_M_65"`,
		`"proof_policy_id":"stark-fri-sha3-pq"`,
		`"bridge_admin_scheme":"ml-dsa-87"`,
		`"bridge_pause_scheme":"multisig-ml-dsa"`,
	}
	for _, s := range wantSubstrings {
		if !contains(got, s) {
			t.Errorf("Metadata JSON missing %q\nfull: %s", s, got)
		}
	}
}

// TestBridgeClassicalCompat_Metadata_JSON pins the classical-compat
// label is visible to RPC + explorer consumers.
func TestBridgeClassicalCompat_Metadata_JSON(t *testing.T) {
	p := BridgeClassicalCompat
	md := p.Metadata()

	b, err := json.Marshal(md)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}

	got := string(b)
	wantSubstrings := []string{
		`"profile_id":"0x90"`,
		`"name":"BRIDGE_CLASSICAL_COMPAT_UNSAFE"`,
		`"post_quantum_end_to_end":false`,
		`"source_finality_scheme":"BLS_12_381"`,
		`"dest_finality_scheme":"PULSAR_M_65"`,
	}
	for _, s := range wantSubstrings {
		if !contains(got, s) {
			t.Errorf("Metadata JSON missing %q\nfull: %s", s, got)
		}
	}
}

// TestBridgeProfile_SchemeWireName covers the upper-snake mapping.
func TestBridgeProfile_SchemeWireName(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{SchemePulsarM65, "PULSAR_M_65"},
		{SchemePulsarM87, "PULSAR_M_87"},
		{SchemeMLDSA65, "ML_DSA_65"},
		{SchemeMLDSA87, "ML_DSA_87"},
		{SchemeBLS12381, "BLS_12_381"},
		{"unknown-scheme", "unknown-scheme"},
	}
	for _, c := range cases {
		if got := schemeWireName(c.in); got != c.want {
			t.Errorf("schemeWireName(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

// TestBridgeProfile_IsPostQuantumEndToEnd_Accessor pins the public
// accessor.
func TestBridgeProfile_IsPostQuantumEndToEnd_Accessor(t *testing.T) {
	if !LuxStrictPQBridgeProfile.IsPostQuantumEndToEnd() {
		t.Errorf("strict-PQ IsPostQuantumEndToEnd() = false, want true")
	}
	if BridgeClassicalCompat.IsPostQuantumEndToEnd() {
		t.Errorf("classical-compat IsPostQuantumEndToEnd() = true, want false")
	}
}

func contains(s, substr string) bool {
	for i := 0; i+len(substr) <= len(s); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
