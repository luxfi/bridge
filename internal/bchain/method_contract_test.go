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

// BridgeVM serves its RPC through gorilla/rpc v2, registered as
// server.RegisterService(&Service{vm: vm}, "bridge"). That library dispatches
// by splitting the method on a single "." and looking up the Go method name
// verbatim (v2/map.go: strings.Split(method, ".") then s.methods[parts[1]]),
// so the wire names are exactly "bridge.<GoMethodName>". A name without a dot
// is refused as "service/method request ill-formed" before any lookup happens
// — it does not reach a handler and cannot be mistaken for an unimplemented
// one.
//
// vmMethods is the exported surface of bridgevm's Service, which is what
// gorilla exposes. Kept as a literal because luxfi/chains is not a dependency
// here; if a method is renamed there, the corresponding call below stops
// resolving and this test says which one.
var vmMethods = map[string]bool{
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

// dispatcher answers like gorilla does: it records what it was asked for and
// refuses anything the real server would refuse, for the same reason.
type dispatcher struct {
	seen []string
}

func (d *dispatcher) server(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Method string          `json:"method"`
			ID     json.RawMessage `json:"id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Errorf("undecodable request: %v", err)
			return
		}
		d.seen = append(d.seen, req.Method)

		parts := strings.Split(req.Method, ".")
		if len(parts) != 2 {
			t.Errorf("gorilla would refuse %q: service/method request ill-formed", req.Method)
		} else if parts[0] != "bridge" {
			t.Errorf("%q addresses service %q; BridgeVM registers as \"bridge\"", req.Method, parts[0])
		} else if !vmMethods[parts[1]] {
			t.Errorf("%q names %q, which BridgeVM's Service does not export", req.Method, parts[1])
		}

		w.Header().Set("Content-Type", "application/json")
		// An empty object decodes into every reply shape the client uses.
		w.Write([]byte(`{"jsonrpc":"2.0","id":1,"result":{}}`)) //nolint:errcheck
	}))
}

// Every call the client can make must name a method BridgeVM actually serves.
// The whole surface was eth-style (bridge_getInfo) against a gorilla server
// that requires bridge.GetBridgeInfo, so all twelve calls failed before
// reaching a handler — and with no B-Chain deployed, the resulting error was
// indistinguishable from "not deployed yet".
func TestEveryCallNamesAMethodTheVMServes(t *testing.T) {
	d := &dispatcher{}
	srv := d.server(t)
	defer srv.Close()

	c := New(srv.URL, 0)
	ctx := context.Background()

	// One call per bridgeCall site in client.go. Errors are ignored on
	// purpose: the assertion is what went onto the wire, which the
	// dispatcher checks. A transport or decode error would fail the
	// dispatcher's own checks first.
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

	if len(d.seen) != 12 {
		t.Fatalf("expected 12 calls on the wire, saw %d: %v", len(d.seen), d.seen)
	}
}

// The separator is the whole defect: an underscore name carries no service
// part, so gorilla rejects it as ill-formed rather than as unknown. Pinning it
// separately means a regression names the cause instead of a symptom.
func TestUnderscoreNamesAreNotDispatchable(t *testing.T) {
	for _, m := range []string{
		"bridge_getInfo",
		"bridge_getSignerSetInfo",
		"bridge_health",
	} {
		if len(strings.Split(m, ".")) == 2 {
			t.Fatalf("%q unexpectedly splits into service and method", m)
		}
	}
}
