// Tests for the destination broadcast client.

package broadcast

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// ethSendServer returns a stubbed eth_sendRawTransaction handler that
// records the last params + responds with the supplied result/error.
type ethSendServer struct {
	server     *httptest.Server
	resultHash string
	errCode    int
	errMsg     string
	calls      int
	lastParams string
}

func newEthSendServer(t *testing.T, resultHash string) *ethSendServer {
	t.Helper()
	s := &ethSendServer{resultHash: resultHash}
	s.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s.calls++
		if r.Method != http.MethodPost {
			http.Error(w, "method", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			Method string `json:"method"`
			Params []any  `json:"params"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		if len(req.Params) > 0 {
			if str, ok := req.Params[0].(string); ok {
				s.lastParams = str
			}
		}
		w.Header().Set("Content-Type", "application/json")
		if s.errMsg != "" {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"jsonrpc": "2.0", "id": 1,
				"error": map[string]any{"code": s.errCode, "message": s.errMsg},
			})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0", "id": 1, "result": s.resultHash,
		})
	}))
	t.Cleanup(s.server.Close)
	return s
}

// =============================================================================
// Happy path
// =============================================================================

func TestBroadcast_EVM_Confirmed(t *testing.T) {
	srv := newEthSendServer(t, "0xtxhash1234")
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"ETHEREUM_SEPOLIA": srv.server.URL,
	}}
	res, err := c.Broadcast(context.Background(), "ETHEREUM_SEPOLIA", "0xf86d8085...")
	if err != nil {
		t.Fatal(err)
	}
	if res.TxHash != "0xtxhash1234" {
		t.Errorf("TxHash = %q", res.TxHash)
	}
	if srv.calls != 1 {
		t.Errorf("expected 1 RPC call, got %d", srv.calls)
	}
}

func TestBroadcast_AddsZeroXPrefixWhenMissing(t *testing.T) {
	srv := newEthSendServer(t, "0xtxhash")
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"ETHEREUM_SEPOLIA": srv.server.URL,
	}}
	// Pass raw tx WITHOUT 0x prefix.
	if _, err := c.Broadcast(context.Background(), "ETHEREUM_SEPOLIA", "f86d8085"); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(srv.lastParams, "0x") {
		t.Errorf("expected 0x-prefixed params on the wire, got %q", srv.lastParams)
	}
}

// =============================================================================
// Error paths
// =============================================================================

func TestBroadcast_EmptyRawTx(t *testing.T) {
	c := New(time.Second)
	_, err := c.Broadcast(context.Background(), "ETHEREUM_SEPOLIA", "")
	if !errors.Is(err, ErrEmptyRawTx) {
		t.Errorf("expected ErrEmptyRawTx, got %v", err)
	}
}

func TestBroadcast_UnsupportedNetwork(t *testing.T) {
	c := New(time.Second)
	_, err := c.Broadcast(context.Background(), "MARS_MAINNET", "0xabc")
	if !errors.Is(err, ErrUnsupportedNetwork) {
		t.Errorf("expected ErrUnsupportedNetwork, got %v", err)
	}
}

func TestBroadcast_FamilyNotImplemented(t *testing.T) {
	// TON_MAINNET is in mchain's address-type registry as TON, and
	// broadcast/ doesn't implement TON yet (BTC + SOL are wired; TON
	// + XRP + DOT remain pending). Need to add the network to the
	// rpcURLs table so we get past the URL check and hit the family
	// switch.
	c := New(time.Second)
	c.RPCURLOverrides = map[string]string{"TON_MAINNET": "http://unused"}
	_, err := c.Broadcast(context.Background(), "TON_MAINNET", "0xabc")
	if !errors.Is(err, ErrFamilyNotImplemented) {
		t.Errorf("expected ErrFamilyNotImplemented for TON, got %v", err)
	}
}

func TestBroadcast_RPCError(t *testing.T) {
	srv := newEthSendServer(t, "")
	srv.errCode = -32000
	srv.errMsg = "nonce too low"
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"ETHEREUM_SEPOLIA": srv.server.URL,
	}}
	_, err := c.Broadcast(context.Background(), "ETHEREUM_SEPOLIA", "0xabc")
	if err == nil {
		t.Fatal("expected RPC error, got nil")
	}
	var rpcErr *RPCError
	if !errors.As(err, &rpcErr) {
		t.Fatalf("expected *RPCError, got %T", err)
	}
	if rpcErr.Code != -32000 || !strings.Contains(rpcErr.Message, "nonce") {
		t.Errorf("unexpected: %+v", rpcErr)
	}
}

func TestBroadcast_HTTPNon200(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "node overloaded", http.StatusServiceUnavailable)
	}))
	t.Cleanup(srv.Close)
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"ETHEREUM_SEPOLIA": srv.URL,
	}}
	_, err := c.Broadcast(context.Background(), "ETHEREUM_SEPOLIA", "0xabc")
	var rpcErr *RPCError
	if !errors.As(err, &rpcErr) || rpcErr.HTTPStatus != 503 {
		t.Errorf("expected RPCError with HTTPStatus 503, got %v", err)
	}
}

func TestBroadcast_EmptyResult(t *testing.T) {
	srv := newEthSendServer(t, "")
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"ETHEREUM_SEPOLIA": srv.server.URL,
	}}
	_, err := c.Broadcast(context.Background(), "ETHEREUM_SEPOLIA", "0xabc")
	var rpcErr *RPCError
	if !errors.As(err, &rpcErr) || !strings.Contains(rpcErr.Message, "empty tx hash") {
		t.Errorf("expected empty-tx-hash error, got %v", err)
	}
}

// =============================================================================
// Context + timeout
// =============================================================================

func TestBroadcast_ContextCanceled(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-time.After(2 * time.Second):
		}
	}))
	t.Cleanup(srv.Close)
	c := &Client{Timeout: 5 * time.Second, RPCURLOverrides: map[string]string{
		"ETHEREUM_SEPOLIA": srv.URL,
	}}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := c.Broadcast(ctx, "ETHEREUM_SEPOLIA", "0xabc")
	if err == nil {
		t.Fatal("expected cancellation error")
	}
}

func TestBroadcast_TimeoutFires(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-time.After(2 * time.Second):
		}
	}))
	t.Cleanup(srv.Close)
	c := &Client{Timeout: 200 * time.Millisecond, RPCURLOverrides: map[string]string{
		"ETHEREUM_SEPOLIA": srv.URL,
	}}
	start := time.Now()
	_, err := c.Broadcast(context.Background(), "ETHEREUM_SEPOLIA", "0xabc")
	if err == nil || time.Since(start) > time.Second {
		t.Fatalf("expected fast timeout; err=%v dur=%v", err, time.Since(start))
	}
}

// =============================================================================
// RPC URL lookup
// =============================================================================

func TestRPCURLFor(t *testing.T) {
	if RPCURLFor("ETHEREUM_SEPOLIA") == "" {
		t.Error("ETHEREUM_SEPOLIA should be in the table")
	}
	if RPCURLFor("LUX_TESTNET") == "" {
		t.Error("LUX_TESTNET should be in the table")
	}
	if RPCURLFor("MARS_MAINNET") != "" {
		t.Error("unknown network should return empty string")
	}
	if RPCURLFor("BITCOIN_MAINNET") == "" {
		t.Error("BTC mainnet should now be in the broadcast table (registered by btc.go init)")
	}
	if RPCURLFor("BITCOIN_TESTNET") == "" {
		t.Error("BTC testnet should now be in the broadcast table (registered by btc.go init)")
	}
}

func TestRPCURLOverride_TakesPrecedence(t *testing.T) {
	srv := newEthSendServer(t, "0xover")
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"ETHEREUM_MAINNET": srv.server.URL,
	}}
	res, err := c.Broadcast(context.Background(), "ETHEREUM_MAINNET", "0xabc")
	if err != nil {
		t.Fatal(err)
	}
	if res.TxHash != "0xover" {
		t.Errorf("override should route through mock; got %q", res.TxHash)
	}
}

// =============================================================================
// RPCError formatting
// =============================================================================

func TestRPCError_String(t *testing.T) {
	cases := []struct {
		err  *RPCError
		want string
	}{
		{
			&RPCError{Method: "eth_sendRawTransaction", HTTPStatus: 503, Message: "down"},
			"broadcast: eth_sendRawTransaction HTTP 503: down",
		},
		{
			&RPCError{Method: "eth_sendRawTransaction", Code: -32000, Message: "nonce too low"},
			"broadcast: eth_sendRawTransaction rpc -32000: nonce too low",
		},
	}
	for _, tc := range cases {
		if got := tc.err.Error(); got != tc.want {
			t.Errorf("got %q, want %q", got, tc.want)
		}
	}
}
