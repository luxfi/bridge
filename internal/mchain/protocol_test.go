// Copyright (C) 2019-2026, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

package mchain

import "testing"

func TestProtocol_String(t *testing.T) {
	cases := []struct {
		p    Protocol
		want string
	}{
		{ProtocolDefault, ""},
		{ProtocolCGGMP21, "cggmp21"},
		{ProtocolFROST, "frost"},
		{ProtocolBLS, "bls"},
		{ProtocolDoerner, "doerner"},
		{ProtocolPulsarM65, "pulsar-m-65"},
		{ProtocolPulsarM87, "pulsar-m-87"},
		{ProtocolCorona, "corona"},
		{ProtocolMagnetar, "magnetar"},
	}
	for _, c := range cases {
		if got := string(c.p); got != c.want {
			t.Errorf("Protocol(%q).String() = %q, want %q", c.p, got, c.want)
		}
	}
}

func TestProtocol_IsPostQuantum(t *testing.T) {
	classical := []Protocol{
		ProtocolDefault,
		ProtocolCGGMP21,
		ProtocolFROST,
		ProtocolBLS,
		ProtocolDoerner,
	}
	pq := []Protocol{
		ProtocolPulsarM65,
		ProtocolPulsarM87,
		ProtocolCorona,
		ProtocolMagnetar,
	}
	for _, p := range classical {
		if p.IsPostQuantum() {
			t.Errorf("Protocol(%q).IsPostQuantum() = true, want false", p)
		}
	}
	for _, p := range pq {
		if !p.IsPostQuantum() {
			t.Errorf("Protocol(%q).IsPostQuantum() = false, want true", p)
		}
	}
}

func TestProtocol_CompatibleCurve(t *testing.T) {
	// Every Pulsar / Corona / Doerner / CGGMP21 produces secp256k1
	// signatures. Only FROST produces Ed25519.
	secp := []Protocol{
		ProtocolDefault,
		ProtocolCGGMP21,
		ProtocolDoerner,
		ProtocolPulsarM65,
		ProtocolPulsarM87,
		ProtocolCorona,
		// BLS and Magnetar conservatively map to secp256k1 by default —
		// callers using them MUST take the dedicated code path (not
		// through Curve), so this default is just "don't blow up".
		ProtocolBLS,
		ProtocolMagnetar,
	}
	for _, p := range secp {
		if got := p.CompatibleCurve(); got != CurveSecp256k1 {
			t.Errorf("Protocol(%q).CompatibleCurve() = %q, want secp256k1", p, got)
		}
	}
	if got := ProtocolFROST.CompatibleCurve(); got != CurveEd25519 {
		t.Errorf("Protocol(frost).CompatibleCurve() = %q, want ed25519", got)
	}
}

func TestProtocolFor(t *testing.T) {
	cases := []struct {
		c    Curve
		want Protocol
	}{
		{CurveSecp256k1, ProtocolCGGMP21},
		{CurveEd25519, ProtocolFROST},
		{Curve("sr25519"), ProtocolDefault}, // unknown → daemon default
		{Curve(""), ProtocolDefault},
	}
	for _, tc := range cases {
		if got := ProtocolFor(tc.c); got != tc.want {
			t.Errorf("ProtocolFor(%q) = %q, want %q", tc.c, got, tc.want)
		}
	}
}

// PQ vs classical wire-shape regression: the empty Protocol string is
// the documented "send no protocol field" sentinel. If anyone ever
// renames it to e.g. "default" the daemon would receive a literal
// "default" string and refuse the request. Lock the wire form.
func TestProtocol_DefaultIsEmptyWireString(t *testing.T) {
	if string(ProtocolDefault) != "" {
		t.Fatalf("ProtocolDefault must serialise to empty string; got %q. "+
			"Changing this breaks the 'protocol omitted from wire' "+
			"contract — every daemon would receive a literal value and "+
			"likely reject it.", string(ProtocolDefault))
	}
}
