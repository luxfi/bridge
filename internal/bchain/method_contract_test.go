// Copyright (C) 2019-2026, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

package bchain

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// served is the exported surface of BridgeVM's Service, which is exactly what
// gorilla/rpc v2 exposes under the "bridge" service. Kept as a literal because
// luxfi/chains is not a dependency here; when a procedure is renamed there,
// the proc that names it stops matching and this says which one.
var served = map[string]bool{
	"CancelRequest":      true,
	"EstimateFee":        true,
	"GetBridgeInfo":      true,
	"GetChainConfig":     true,
	"GetCurrentEpoch":    true,
	"GetMPCPublicKey":    true,
	"GetSignature":       true,
	"GetSignerSetInfo":   true,
	"GetStatus":          true,
	"GetSupportedChains": true,
	"GetWaitlist":        true,
	"HasSigner":          true,
	"Health":             true,
	"RegisterValidator":  true,
	"ReplaceSigner":      true,
	"SlashSigner":        true,
	"SubmitRequest":      true,
}

// declared is every procedure this client can name.
var declared = []proc{
	estimateFee, submitRequest, getStatus, cancelRequest,
	getBridgeInfo, getSupportedChains, getChainConfig, health,
	getMPCPublicKey, getSignature, getSignerSetInfo, getCurrentEpoch,
}

// Every declared procedure must be one BridgeVM serves. The whole surface once
// named procedures no server implements, and nothing noticed because the
// client had never had a chain to talk to: an unset URL and an unreachable
// chain both answer -32601, so "not configured", "not deployed" and "wrong
// name entirely" were a single symptom.
func TestEveryProcIsServed(t *testing.T) {
	for _, p := range declared {
		if p.service != "bridge" {
			t.Errorf("%s addresses service %q; BridgeVM registers as \"bridge\"", p, p.service)
		}
		if !served[p.name] {
			t.Errorf("%s names %q, which BridgeVM's Service does not export", p, p.name)
		}
	}
}

// gorilla dispatches by splitting the wire name on "." and requiring exactly
// two parts (v2/map.go), so a name it cannot split is refused as ill-formed
// before any lookup — it never reaches a handler and cannot be mistaken for an
// unimplemented one. String() is the only place that join happens.
func TestWireNameIsDispatchable(t *testing.T) {
	for _, p := range declared {
		parts := strings.Split(p.String(), ".")
		if len(parts) != 2 {
			t.Errorf("%q does not split into service and procedure", p)
			continue
		}
		if parts[0] != p.service || parts[1] != p.name {
			t.Errorf("%q does not rebuild to (%q, %q)", p, p.service, p.name)
		}
	}
}

// What the type says and what leaves the process must agree. Every call goes
// through one transport, so this checks the join survives marshalling rather
// than restating String().
func TestDeclaredProcsAreWhatGoOnTheWire(t *testing.T) {
	var seen []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Method string `json:"method"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Errorf("undecodable request: %v", err)
			return
		}
		seen = append(seen, req.Method)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"jsonrpc":"2.0","id":1,"result":{}}`)) //nolint:errcheck
	}))
	defer srv.Close()

	c := New(srv.URL, 0)
	ctx := context.Background()

	// One call per bridgeCall site. Errors are ignored deliberately: the
	// assertion is what reached the wire.
	_, _ = c.EstimateFee(ctx, EstimateFeeParams{})
	_, _ = c.SubmitBridgeRequest(ctx, SubmitRequestParams{})
	_, _ = c.GetBridgeStatus(ctx, "req-1")
	_, _ = c.CancelRequest(ctx, "req-1")
	_, _ = c.GetBridgeInfo(ctx)
	_, _ = c.GetSupportedChains(ctx)
	_, _ = c.GetChainConfig(ctx, "96369")
	_, _ = c.Health(ctx)
	_, _ = c.GetMPCPublicKey(ctx)
	_, _ = c.GetBridgeSignature(ctx, "req-1")
	_, _ = c.GetSignerSetInfo(ctx)
	_, _ = c.GetCurrentEpoch(ctx)

	if len(seen) != len(declared) {
		t.Fatalf("expected %d calls on the wire, saw %d: %v", len(declared), len(seen), seen)
	}
	want := make(map[string]bool, len(declared))
	for _, p := range declared {
		want[p.String()] = true
	}
	for _, m := range seen {
		if !want[m] {
			t.Errorf("%q went out but is not a declared proc", m)
		}
	}
}
