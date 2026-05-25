// JSON-RPC client tests for the BridgeVM (b-chain) Go port.
//
// BridgeVM isn't deployed on the live Lux nodes yet (verified
// 2026-05-25: 404 on api.lux.network/ext/bc/B/rpc and api.lux-test
// equivalent), so these tests drive the client against httptest.Server
// mocks that return the canonical wire shapes documented in
// pkg/bridge/src/app/lib/bridge-rpc.ts. When BridgeVM lands, a second
// suite hitting the real wire can be added without changing client.go.

package bchain

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// mockNode wraps an httptest.Server with helpers for asserting on the
// JSON-RPC request shape and returning canned responses keyed by method
// name.
type mockNode struct {
	t         *testing.T
	server    *httptest.Server
	responses map[string]func(req *jsonrpcRequest) jsonrpcResponse
	calls     atomic.Int64
	// lastBody is the most recently received raw request body.
	lastBody []byte
}

func newMockNode(t *testing.T) *mockNode {
	t.Helper()
	m := &mockNode{
		t:         t,
		responses: make(map[string]func(*jsonrpcRequest) jsonrpcResponse),
	}
	m.server = httptest.NewServer(http.HandlerFunc(m.handle))
	t.Cleanup(m.server.Close)
	return m
}

func (m *mockNode) on(method string, fn func(*jsonrpcRequest) jsonrpcResponse) {
	m.responses[method] = fn
}

// onResult is a shorthand for "return this static result for this method".
func (m *mockNode) onResult(method string, result any) {
	raw, err := json.Marshal(result)
	if err != nil {
		m.t.Fatalf("mock onResult marshal: %v", err)
	}
	m.on(method, func(req *jsonrpcRequest) jsonrpcResponse {
		return jsonrpcResponse{JSONRPC: "2.0", ID: req.ID, Result: raw}
	})
}

// onError makes the node respond with a JSON-RPC error envelope.
func (m *mockNode) onError(method string, code int, message string) {
	m.on(method, func(req *jsonrpcRequest) jsonrpcResponse {
		return jsonrpcResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Error:   &jsonrpcError{Code: code, Message: message},
		}
	})
}

func (m *mockNode) handle(w http.ResponseWriter, r *http.Request) {
	m.calls.Add(1)
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if got := r.Header.Get("Content-Type"); got != "application/json" {
		m.t.Errorf("mock node: expected Content-Type application/json, got %q", got)
	}
	body, _ := io.ReadAll(r.Body)
	m.lastBody = body
	var req jsonrpcRequest
	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	if req.JSONRPC != "2.0" {
		m.t.Errorf("mock node: expected jsonrpc=2.0, got %q", req.JSONRPC)
	}
	if req.ID == "" {
		m.t.Error("mock node: missing request id")
	}
	fn, ok := m.responses[req.Method]
	if !ok {
		http.Error(w, fmt.Sprintf("no mock for method %q", req.Method), http.StatusNotImplemented)
		return
	}
	resp := fn(&req)
	if resp.ID == "" {
		resp.ID = req.ID
	}
	if resp.JSONRPC == "" {
		resp.JSONRPC = "2.0"
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

// clientForMock builds a Client pointed at the mock. We set the bridge
// URL only (threshold URL stays empty so the thresholdCall guard test
// can fire).
func clientForMock(m *mockNode) *Client {
	return &Client{BridgeRPCURL: m.server.URL, Timeout: 2 * time.Second}
}

// =============================================================================
// Happy-path tests — one per method, mirrors TS bridge-rpc.ts coverage.
// =============================================================================

func TestEstimateFee_HappyPath(t *testing.T) {
	m := newMockNode(t)
	m.onResult("bridge_estimateFee", FeeEstimate{
		FeeAmount:     "0.001",
		NetAmount:     "0.099",
		EstimatedTime: 180,
	})
	c := clientForMock(m)

	got, err := c.EstimateFee(context.Background(), EstimateFeeParams{
		SourceChain: "ETHEREUM_SEPOLIA",
		DestChain:   "LUX_TESTNET",
		SourceAsset: "ETH",
		DestAsset:   "LUX",
		Amount:      "0.1",
		Refuel:      false,
	})
	if err != nil {
		t.Fatalf("EstimateFee err: %v", err)
	}
	if got.FeeAmount != "0.001" || got.NetAmount != "0.099" || got.EstimatedTime != 180 {
		t.Fatalf("unexpected fee estimate: %+v", got)
	}

	// Verify the request body contains the right method + params.
	var req jsonrpcRequest
	if err := json.Unmarshal(m.lastBody, &req); err != nil {
		t.Fatalf("decode last body: %v", err)
	}
	if req.Method != "bridge_estimateFee" {
		t.Errorf("expected method bridge_estimateFee, got %q", req.Method)
	}
	rawParams, _ := json.Marshal(req.Params)
	if !strings.Contains(string(rawParams), `"sourceChain":"ETHEREUM_SEPOLIA"`) {
		t.Errorf("params missing sourceChain: %s", rawParams)
	}
	if !strings.Contains(string(rawParams), `"destChain":"LUX_TESTNET"`) {
		t.Errorf("params missing destChain: %s", rawParams)
	}
}

func TestSubmitBridgeRequest_HappyPath(t *testing.T) {
	m := newMockNode(t)
	m.onResult("bridge_submitRequest", BridgeRequest{
		RequestID:   "req_abc123",
		SourceChain: "ETHEREUM_SEPOLIA",
		DestChain:   "LUX_TESTNET",
		SourceAsset: "ETH",
		DestAsset:   "LUX",
		Amount:      "0.1",
		Recipient:   "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
		Sender:      "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
		Status:      StatusPending,
		CreatedAt:   1718000000,
	})
	c := clientForMock(m)

	got, err := c.SubmitBridgeRequest(context.Background(), SubmitRequestParams{
		SourceChain: "ETHEREUM_SEPOLIA",
		DestChain:   "LUX_TESTNET",
		SourceAsset: "ETH",
		DestAsset:   "LUX",
		Amount:      "0.1",
		Recipient:   "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
		Sender:      "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
	})
	if err != nil {
		t.Fatalf("SubmitBridgeRequest err: %v", err)
	}
	if got.RequestID != "req_abc123" || got.Status != StatusPending {
		t.Fatalf("unexpected request: %+v", got)
	}
}

func TestGetBridgeStatus_PhaseTransition(t *testing.T) {
	m := newMockNode(t)
	// Each call advances the status, mimicking the live polling loop in
	// useTransfers.ts so we exercise the full BridgeRequestStatus enum.
	phases := []BridgeRequestStatus{
		StatusPending, StatusDeposited, StatusSigning,
		StatusSigned, StatusReleasing, StatusCompleted,
	}
	var idx atomic.Int64
	m.on("bridge_getStatus", func(req *jsonrpcRequest) jsonrpcResponse {
		n := idx.Add(1) - 1
		if n >= int64(len(phases)) {
			n = int64(len(phases)) - 1
		}
		raw, _ := json.Marshal(BridgeRequest{
			RequestID: "req_abc123",
			Status:    phases[n],
		})
		return jsonrpcResponse{JSONRPC: "2.0", ID: req.ID, Result: raw}
	})
	c := clientForMock(m)

	for i, want := range phases {
		got, err := c.GetBridgeStatus(context.Background(), "req_abc123")
		if err != nil {
			t.Fatalf("call %d: %v", i, err)
		}
		if got.Status != want {
			t.Errorf("call %d: status = %q, want %q", i, got.Status, want)
		}
	}
}

func TestGetBridgeInfo_HappyPath(t *testing.T) {
	m := newMockNode(t)
	m.onResult("bridge_getInfo", BridgeInfo{
		Version:         "1.0.0",
		NodeID:          "NodeID-XYZ",
		ChainID:         "B",
		MPCReady:        true,
		MPCPublicKey:    "0xdeadbeef",
		Threshold:       3,
		TotalParties:    5,
		SupportedChains: []string{"ETHEREUM_MAINNET", "LUX_MAINNET"},
		TotalBridged:    "1000000",
		TotalFees:       "1000",
	})
	c := clientForMock(m)

	got, err := c.GetBridgeInfo(context.Background())
	if err != nil {
		t.Fatalf("GetBridgeInfo err: %v", err)
	}
	if !got.MPCReady || got.Threshold != 3 || got.TotalParties != 5 {
		t.Fatalf("unexpected info: %+v", got)
	}
	if len(got.SupportedChains) != 2 {
		t.Errorf("expected 2 supported chains, got %d", len(got.SupportedChains))
	}
}

func TestGetSupportedChains_HappyPath(t *testing.T) {
	m := newMockNode(t)
	m.onResult("bridge_getSupportedChains", []ChainConfig{
		{ChainID: "1", ChainName: "Ethereum", Enabled: true,
			TokenContracts: map[string]string{"USDC": "0xa0b8...e3"}},
		{ChainID: "11155111", ChainName: "Sepolia", Enabled: true,
			TokenContracts: map[string]string{}},
	})
	c := clientForMock(m)

	got, err := c.GetSupportedChains(context.Background())
	if err != nil {
		t.Fatalf("GetSupportedChains err: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 chains, got %d", len(got))
	}
	if got[0].ChainID != "1" || got[0].TokenContracts["USDC"] == "" {
		t.Errorf("unexpected first chain: %+v", got[0])
	}
}

func TestHealth_HappyPath(t *testing.T) {
	m := newMockNode(t)
	m.onResult("bridge_health", Health{Status: "ok", MPCReady: true})
	c := clientForMock(m)

	got, err := c.Health(context.Background())
	if err != nil {
		t.Fatalf("Health err: %v", err)
	}
	if got.Status != "ok" || !got.MPCReady {
		t.Fatalf("unexpected health: %+v", got)
	}
}

func TestGetMPCPublicKey_HappyPath(t *testing.T) {
	m := newMockNode(t)
	m.onResult("bridge_getMPCPublicKey", MPCPublicKey{PublicKey: "0xabcdef"})
	c := clientForMock(m)

	got, err := c.GetMPCPublicKey(context.Background())
	if err != nil {
		t.Fatalf("GetMPCPublicKey err: %v", err)
	}
	if got.PublicKey != "0xabcdef" {
		t.Fatalf("unexpected pubkey: %+v", got)
	}
}

func TestGetBridgeSignature_HappyPath(t *testing.T) {
	m := newMockNode(t)
	m.onResult("bridge_getSignature", BridgeSignature{
		Signature: "0x" + strings.Repeat("ab", 32),
		SessionID: "sess_42",
	})
	c := clientForMock(m)

	got, err := c.GetBridgeSignature(context.Background(), "req_abc123")
	if err != nil {
		t.Fatalf("GetBridgeSignature err: %v", err)
	}
	if got.SessionID != "sess_42" || len(got.Signature) != 66 {
		t.Fatalf("unexpected signature: %+v", got)
	}
}

func TestCancelRequest_HappyPath(t *testing.T) {
	m := newMockNode(t)
	m.onResult("bridge_cancelRequest", CancelResult{Success: true})
	c := clientForMock(m)

	got, err := c.CancelRequest(context.Background(), "req_abc123")
	if err != nil {
		t.Fatalf("CancelRequest err: %v", err)
	}
	if !got.Success {
		t.Fatalf("expected success, got %+v", got)
	}
}

// =============================================================================
// Error-path tests
// =============================================================================

func TestRPCError_FromNode(t *testing.T) {
	m := newMockNode(t)
	m.onError("bridge_estimateFee", -32602, "invalid params: amount must be positive")
	c := clientForMock(m)

	_, err := c.EstimateFee(context.Background(), EstimateFeeParams{Amount: "-1"})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	var rpcErr *RPCError
	if !errors.As(err, &rpcErr) {
		t.Fatalf("expected *RPCError, got %T", err)
	}
	if rpcErr.Code != -32602 || !strings.Contains(rpcErr.Message, "invalid params") {
		t.Errorf("unexpected rpc error: %+v", rpcErr)
	}
	if rpcErr.Method != "bridge_estimateFee" {
		t.Errorf("expected method tag bridge_estimateFee, got %q", rpcErr.Method)
	}
}

func TestRPCError_HTTPNon200(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte("upstream unhappy"))
	}))
	t.Cleanup(srv.Close)
	c := &Client{BridgeRPCURL: srv.URL, Timeout: time.Second}

	_, err := c.Health(context.Background())
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	var rpcErr *RPCError
	if !errors.As(err, &rpcErr) {
		t.Fatalf("expected *RPCError, got %T", err)
	}
	if rpcErr.HTTPStatus != http.StatusBadGateway {
		t.Errorf("expected HTTPStatus 502, got %d", rpcErr.HTTPStatus)
	}
	if !strings.Contains(rpcErr.Message, "HTTP 502") {
		t.Errorf("expected message to mention HTTP 502: %q", rpcErr.Message)
	}
}

func TestRPCError_EmptyResult(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"jsonrpc":"2.0","id":"x","result":null}`))
	}))
	t.Cleanup(srv.Close)
	c := &Client{BridgeRPCURL: srv.URL, Timeout: time.Second}

	_, err := c.Health(context.Background())
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	var rpcErr *RPCError
	if !errors.As(err, &rpcErr) || rpcErr.Code != -32603 {
		t.Errorf("expected -32603 empty result, got: %v", err)
	}
}

func TestRPCError_MalformedResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`this is not json`))
	}))
	t.Cleanup(srv.Close)
	c := &Client{BridgeRPCURL: srv.URL, Timeout: time.Second}

	_, err := c.Health(context.Background())
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	var rpcErr *RPCError
	if !errors.As(err, &rpcErr) {
		t.Fatalf("expected *RPCError, got %T", err)
	}
	if !strings.Contains(rpcErr.Message, "decode response") {
		t.Errorf("expected decode-response error, got: %q", rpcErr.Message)
	}
}

func TestContextCanceled(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Block long enough that the canceled context aborts the call.
		select {
		case <-r.Context().Done():
		case <-time.After(2 * time.Second):
		}
	}))
	t.Cleanup(srv.Close)
	c := &Client{BridgeRPCURL: srv.URL, Timeout: 5 * time.Second}

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // already canceled before the call

	_, err := c.Health(ctx)
	if err == nil {
		t.Fatal("expected cancellation error, got nil")
	}
	if !errors.Is(err, context.Canceled) {
		t.Errorf("expected context.Canceled, got %T: %v", err, err)
	}
}

func TestTimeoutFiresWithoutContext(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Sleep longer than the client's per-request timeout.
		select {
		case <-r.Context().Done():
		case <-time.After(2 * time.Second):
		}
	}))
	t.Cleanup(srv.Close)
	c := &Client{BridgeRPCURL: srv.URL, Timeout: 200 * time.Millisecond}

	start := time.Now()
	_, err := c.Health(context.Background())
	dur := time.Since(start)
	if err == nil {
		t.Fatal("expected timeout error, got nil")
	}
	if dur > 1*time.Second {
		t.Errorf("expected timeout < 1s, took %v", dur)
	}
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Errorf("expected context.DeadlineExceeded, got %T: %v", err, err)
	}
}

func TestThresholdCall_NotConfigured(t *testing.T) {
	// BridgeRPCURL set, ThresholdRPCURL deliberately blank.
	c := &Client{BridgeRPCURL: "http://localhost:0", Timeout: time.Second}
	err := c.thresholdCall(context.Background(), "anything", nil, nil)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	var rpcErr *RPCError
	if !errors.As(err, &rpcErr) {
		t.Fatalf("expected *RPCError, got %T", err)
	}
	if !strings.Contains(rpcErr.Message, "ThresholdRPCURL not configured") {
		t.Errorf("unexpected message: %q", rpcErr.Message)
	}
}

// =============================================================================
// Constructor + id generation
// =============================================================================

func TestNew_DerivesURLs(t *testing.T) {
	c := New("https://api.lux-test.network", 0)
	if c.BridgeRPCURL != "https://api.lux-test.network/ext/bc/B/rpc" {
		t.Errorf("BridgeRPCURL: %q", c.BridgeRPCURL)
	}
	if c.ThresholdRPCURL != "https://api.lux-test.network/ext/bc/T/rpc" {
		t.Errorf("ThresholdRPCURL: %q", c.ThresholdRPCURL)
	}
	if c.Timeout != 0 {
		t.Errorf("Timeout should be 0 when unset, got %v", c.Timeout)
	}
}

func TestNew_DefaultsToLocalhost(t *testing.T) {
	c := New("", 5*time.Second)
	if c.BridgeRPCURL != "http://127.0.0.1:9650/ext/bc/B/rpc" {
		t.Errorf("expected localhost default, got %q", c.BridgeRPCURL)
	}
	if c.Timeout != 5*time.Second {
		t.Errorf("Timeout: %v", c.Timeout)
	}
}

func TestNextID_UniqueAndShaped(t *testing.T) {
	c := &Client{}
	seen := map[string]bool{}
	for i := 0; i < 100; i++ {
		id := c.nextID()
		if seen[id] {
			t.Fatalf("duplicate id at iter %d: %q", i, id)
		}
		seen[id] = true
		if !strings.Contains(id, "-") {
			t.Errorf("expected '-' in id %q", id)
		}
	}
}

func TestRPCRoundTrip_RequestShape(t *testing.T) {
	m := newMockNode(t)
	m.onResult("bridge_health", Health{Status: "ok", MPCReady: true})
	c := clientForMock(m)

	if _, err := c.Health(context.Background()); err != nil {
		t.Fatal(err)
	}
	var got jsonrpcRequest
	if err := json.Unmarshal(m.lastBody, &got); err != nil {
		t.Fatalf("decode last body: %v", err)
	}
	if got.JSONRPC != "2.0" {
		t.Errorf("JSONRPC = %q, want 2.0", got.JSONRPC)
	}
	if got.Method != "bridge_health" {
		t.Errorf("Method = %q", got.Method)
	}
	if got.ID == "" {
		t.Error("ID empty")
	}
	if got.Params != nil {
		t.Errorf("Params should be omitted for nil-param method, got %v", got.Params)
	}
	if m.calls.Load() != 1 {
		t.Errorf("expected 1 call, got %d", m.calls.Load())
	}
}

func TestRPCError_String(t *testing.T) {
	cases := []struct {
		name string
		err  *RPCError
		want string
	}{
		{
			name: "with http status",
			err:  &RPCError{Method: "bridge_health", HTTPStatus: 502, Message: "bad gateway"},
			want: "bchain: bridge_health HTTP 502: bad gateway",
		},
		{
			name: "rpc error",
			err:  &RPCError{Method: "bridge_estimateFee", Code: -32602, Message: "invalid params"},
			want: "bchain: bridge_estimateFee rpc -32602: invalid params",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := tc.err.Error(); got != tc.want {
				t.Errorf("got %q, want %q", got, tc.want)
			}
		})
	}
}
