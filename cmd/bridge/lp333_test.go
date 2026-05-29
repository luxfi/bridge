package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/hanzoai/zip"
	middleware "github.com/hanzoai/zip/middleware"
	"github.com/luxfi/bridge/internal/bchain"
)

// mockLP333Server serves a minimal JSON-RPC node that returns scripted
// results for LP-333 methods. Mirrors the pattern in
// internal/bchain/client_test.go but lives here so we can wire it
// into the API rig.
type mockLP333Server struct {
	*httptest.Server
	responses map[string]any
	errors    map[string]struct {
		code int
		msg  string
	}
	calls atomic.Int64
}

func newMockBchain(t *testing.T) *mockLP333Server {
	t.Helper()
	mb := &mockLP333Server{
		responses: map[string]any{},
		errors: map[string]struct {
			code int
			msg  string
		}{},
	}
	mb.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mb.calls.Add(1)
		var req struct {
			JSONRPC string          `json:"jsonrpc"`
			ID      json.RawMessage `json:"id"`
			Method  string          `json:"method"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "bad json", http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")

		if e, ok := mb.errors[req.Method]; ok {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"jsonrpc": "2.0",
				"id":      req.ID,
				"error":   map[string]any{"code": e.code, "message": e.msg},
			})
			return
		}
		resp, ok := mb.responses[req.Method]
		if !ok {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"jsonrpc": "2.0",
				"id":      req.ID,
				"error":   map[string]any{"code": -32601, "message": "method not found"},
			})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0",
			"id":      req.ID,
			"result":  resp,
		})
	}))
	t.Cleanup(mb.Server.Close)
	return mb
}

func (mb *mockLP333Server) onResult(method string, result any) {
	mb.responses[method] = result
}

func (mb *mockLP333Server) onError(method string, code int, msg string) {
	mb.errors[method] = struct {
		code int
		msg  string
	}{code, msg}
}

// lp333Rig wires an API + mock b-chain together so tests can hit
// /v1/bridge/signer-set, /v1/bridge/epoch, the JSON-RPC dispatch, and
// /metrics from one place.
type lp333Rig struct {
	app    *zip.App
	api    *API
	bchain *mockLP333Server
}

func newLP333Rig(t *testing.T) *lp333Rig {
	t.Helper()
	mb := newMockBchain(t)
	bc := &bchain.Client{BridgeRPCURL: mb.URL, Timeout: 2 * time.Second}

	cfg, _ := LoadConfig("")
	store := NewInMemoryStore()
	engine := &QuoteEngine{Feed: NewStaticPriceFeed(defaultPrices())}
	api := NewAPI(cfg, "", bc, nil, nil, store, engine)
	app := zip.New(zip.Config{AppName: "lux-bridge-test-lp333", DisableStartupMessage: true})
	app.Use(middleware.Recover(), middleware.RequestID())
	api.Register(app)
	return &lp333Rig{app: app, api: api, bchain: mb}
}

// TestLP333_SignerSetREST_HappyPath verifies /v1/bridge/signer-set
// returns the b-chain signer set in the SDK envelope shape.
func TestLP333_SignerSetREST_HappyPath(t *testing.T) {
	rig := newLP333Rig(t)
	rig.bchain.onResult("bridge_getSignerSetInfo", bchain.SignerSetInfo{
		Members: []bchain.SignerMember{
			{NodeID: "node-0", PublicKey: "0xAA", Address: "0xa1"},
			{NodeID: "node-1", PublicKey: "0xBB", Address: "0xb2"},
			{NodeID: "node-2", PublicKey: "0xCC", Address: "0xc3"},
		},
		Threshold:      2,
		Total:          3,
		Epoch:          11,
		SignerSetHash:  "0xdeadbeef",
		LastRotationAt: 1730000000,
	})

	status, body := fireRequest(t, rig.app, "GET", "/v1/bridge/signer-set", nil)
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", status, body)
	}
	var env struct {
		Data bchain.SignerSetInfo `json:"data"`
	}
	if err := json.Unmarshal(body, &env); err != nil {
		t.Fatalf("decode body: %v; body=%s", err, body)
	}
	if env.Data.Epoch != 11 || env.Data.Threshold != 2 || env.Data.Total != 3 {
		t.Errorf("unexpected signer set: %+v", env.Data)
	}
	if env.Data.SignerSetHash != "0xdeadbeef" {
		t.Errorf("hash = %q, want 0xdeadbeef", env.Data.SignerSetHash)
	}
	if len(env.Data.Members) != 3 {
		t.Errorf("members = %d, want 3", len(env.Data.Members))
	}
}

// TestLP333_SignerSetREST_NotImplemented covers the back-compat path:
// when upstream returns -32601 (LP-333 not deployed on the BridgeVM),
// the bridge returns 501 Not Implemented — distinguishable from a
// transport-level 502.
func TestLP333_SignerSetREST_NotImplemented(t *testing.T) {
	rig := newLP333Rig(t)
	rig.bchain.onError("bridge_getSignerSetInfo", -32601, "method not found")

	status, body := fireRequest(t, rig.app, "GET", "/v1/bridge/signer-set", nil)
	if status != http.StatusNotImplemented {
		t.Errorf("status = %d, want 501; body=%s", status, body)
	}
}

// TestLP333_EpochREST_HappyPath verifies /v1/bridge/epoch returns the
// current epoch payload.
func TestLP333_EpochREST_HappyPath(t *testing.T) {
	rig := newLP333Rig(t)
	rig.bchain.onResult("bridge_getCurrentEpoch", bchain.CurrentEpoch{
		Epoch:         13,
		SignerSetHash: "0xfeedface",
		StartedAt:     1730000099,
	})

	status, body := fireRequest(t, rig.app, "GET", "/v1/bridge/epoch", nil)
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", status, body)
	}
	var env struct {
		Data bchain.CurrentEpoch `json:"data"`
	}
	if err := json.Unmarshal(body, &env); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if env.Data.Epoch != 13 || env.Data.SignerSetHash != "0xfeedface" {
		t.Errorf("unexpected epoch: %+v", env.Data)
	}
}

// TestLP333_JSONRPC_SignerSetDispatch verifies the JSON-RPC dispatch
// for bridge_getSignerSetInfo passes through to b-chain and returns the
// same result the REST handler does.
func TestLP333_JSONRPC_SignerSetDispatch(t *testing.T) {
	rig := newLP333Rig(t)
	rig.bchain.onResult("bridge_getSignerSetInfo", bchain.SignerSetInfo{
		Threshold: 3,
		Total:     5,
		Epoch:     42,
	})

	body, _ := json.Marshal(map[string]any{
		"jsonrpc": "2.0",
		"id":      "test-1",
		"method":  "bridge_getSignerSetInfo",
	})
	status, respBody := fireRequest(t, rig.app, "POST", "/v1/bridge/rpc", body)
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", status, respBody)
	}
	var resp struct {
		Result bchain.SignerSetInfo `json:"result"`
		Error  *struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		} `json:"error,omitempty"`
	}
	if err := json.Unmarshal(respBody, &resp); err != nil {
		t.Fatalf("decode: %v; body=%s", err, respBody)
	}
	if resp.Error != nil {
		t.Fatalf("unexpected error envelope: %+v", resp.Error)
	}
	if resp.Result.Epoch != 42 || resp.Result.Threshold != 3 || resp.Result.Total != 5 {
		t.Errorf("unexpected result: %+v", resp.Result)
	}
}

// TestLP333_JSONRPC_BChainNotConfigured verifies the dispatch returns
// -32601 (method not found) when bchain is nil, signalling to the SDK
// that this endpoint isn't authoritative on signer-set state.
func TestLP333_JSONRPC_BChainNotConfigured(t *testing.T) {
	cfg, _ := LoadConfig("")
	store := NewInMemoryStore()
	engine := &QuoteEngine{Feed: NewStaticPriceFeed(defaultPrices())}
	// No bchain client wired.
	api := NewAPI(cfg, "", nil, nil, nil, store, engine)
	app := zip.New(zip.Config{AppName: "lux-bridge-test-lp333-nobchain", DisableStartupMessage: true})
	app.Use(middleware.Recover(), middleware.RequestID())
	api.Register(app)

	body, _ := json.Marshal(map[string]any{
		"jsonrpc": "2.0",
		"id":      "test-1",
		"method":  "bridge_getCurrentEpoch",
	})
	status, respBody := fireRequest(t, app, "POST", "/v1/bridge/rpc", body)
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", status, respBody)
	}
	if !strings.Contains(string(respBody), `"code":-32601`) {
		t.Errorf("expected -32601 method-not-found, got body: %s", respBody)
	}
}

// TestLP333_PollerSnapshot exercises the BChainPoller cache + the
// /metrics gauges that read from it. Drives the poller manually
// (one fetchOnce) so the test is deterministic.
func TestLP333_PollerSnapshot(t *testing.T) {
	rig := newLP333Rig(t)
	rig.bchain.onResult("bridge_getSignerSetInfo", bchain.SignerSetInfo{
		Threshold:     2,
		Total:         3,
		Epoch:         17,
		SignerSetHash: "0xcafebabe",
	})

	bcClient := &bchain.Client{BridgeRPCURL: rig.bchain.URL, Timeout: 2 * time.Second}
	poller := NewBChainPoller(bcClient, time.Hour, nil)
	poller.fetchOnce(context.Background())

	snap := poller.Snapshot()
	if !snap.Reachable {
		t.Errorf("Reachable = false, want true; LastError=%q", snap.LastError)
	}
	if snap.Epoch != 17 || snap.Threshold != 2 || snap.Total != 3 {
		t.Errorf("snapshot mismatch: %+v", snap)
	}

	rig.api.SetBChainPoller(poller)
	body := scrapeMetrics(t, &metricsRig{app: rig.app, store: nil, api: rig.api})
	for _, want := range []string{
		"bridge_bchain_reachable 1",
		"bridge_bchain_current_epoch 17",
		"bridge_bchain_signer_set_threshold 2",
		"bridge_bchain_signer_set_size 3",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("missing %q\n--- body ---\n%s", want, body)
		}
	}
}

// TestLP333_PollerStaleOnRPCError verifies the stale-tolerance
// contract: when b-chain blips, the last good values stay visible
// and only Reachable + LastError reflect the failure.
func TestLP333_PollerStaleOnRPCError(t *testing.T) {
	rig := newLP333Rig(t)
	rig.bchain.onResult("bridge_getSignerSetInfo", bchain.SignerSetInfo{
		Threshold: 2, Total: 3, Epoch: 99, SignerSetHash: "0xgood",
	})
	bcClient := &bchain.Client{BridgeRPCURL: rig.bchain.URL, Timeout: 2 * time.Second}
	poller := NewBChainPoller(bcClient, time.Hour, nil)

	// First fetch: good.
	poller.fetchOnce(context.Background())
	if !poller.Snapshot().Reachable {
		t.Fatal("first fetch should have succeeded")
	}

	// Now upstream errors. Snapshot should preserve Epoch/Threshold/Total
	// but flip Reachable to false.
	rig.bchain.onError("bridge_getSignerSetInfo", -32603, "internal error")
	poller.fetchOnce(context.Background())
	snap := poller.Snapshot()
	if snap.Reachable {
		t.Error("Reachable = true, want false after fetch error")
	}
	if snap.Epoch != 99 || snap.Threshold != 2 || snap.Total != 3 {
		t.Errorf("stale values lost: %+v", snap)
	}
	if !strings.Contains(snap.LastError, "internal error") {
		t.Errorf("LastError = %q, want substring 'internal error'", snap.LastError)
	}
}

// TestLP333_Metrics_NoPollerEmitsZeros verifies the nil-safe contract
// for the b-chain gauges: when no poller is wired, gauges report
// reachable=0 + zeros for the rest.
func TestLP333_Metrics_NoPollerEmitsZeros(t *testing.T) {
	rig := newMetricsRig(t) // metrics_test.go helper — no LP-333 wiring
	body := scrapeMetrics(t, rig)
	for _, want := range []string{
		"bridge_bchain_reachable 0",
		"bridge_bchain_current_epoch 0",
		"bridge_bchain_signer_set_threshold 0",
		"bridge_bchain_signer_set_size 0",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("missing %q\n--- body ---\n%s", want, body)
		}
	}
}

// TestLP333_PollerRunStops verifies Run honors context cancellation
// and Stop is idempotent.
func TestLP333_PollerRunStops(t *testing.T) {
	rig := newLP333Rig(t)
	rig.bchain.onResult("bridge_getSignerSetInfo", bchain.SignerSetInfo{Epoch: 1})
	bcClient := &bchain.Client{BridgeRPCURL: rig.bchain.URL, Timeout: time.Second}
	poller := NewBChainPoller(bcClient, 10*time.Millisecond, nil)

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- poller.Run(ctx) }()

	// Wait for poller to be Running.
	deadline := time.Now().Add(time.Second)
	for !poller.Running() && time.Now().Before(deadline) {
		time.Sleep(2 * time.Millisecond)
	}
	if !poller.Running() {
		t.Fatal("poller never started")
	}

	cancel()
	select {
	case err := <-done:
		if err != nil && !errors.Is(err, context.Canceled) {
			t.Errorf("Run err = %v, want context.Canceled or nil", err)
		}
	case <-time.After(time.Second):
		t.Fatal("Run did not return after cancel")
	}

	// Idempotent Stop after cancel.
	poller.Stop()
	poller.Stop()
}

// Avoid unused-import warnings during partial test compilation.
var _ = fmt.Sprintf
