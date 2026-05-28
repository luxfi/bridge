// Tests for the Polkadot / Substrate broadcast handler.
//
// We mock the substrate JSON-RPC server with httptest. Each case
// pins:
//   - a fixed response shape (success / error code / error message)
//   - the expected classification (success, fatal, retryable)
// so a future change to classifyDOTError can't silently flip the
// retry behaviour of the orchestrator.

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

// dotMockServer wraps an httptest.Server with knobs to control the
// next JSON-RPC response shape.
type dotMockServer struct {
	server *httptest.Server
	calls  int
	// On success: returned in result field.
	resultHash string
	// On error: code + message returned in error field. errCode != 0
	// turns the response into an error envelope.
	errCode    int
	errMessage string
	// HTTP-level status override (defaults to 200).
	httpStatus int
	// Captured params for assertion.
	lastParams string
}

func newDOTMockServer(t *testing.T) *dotMockServer {
	t.Helper()
	m := &dotMockServer{}
	m.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		m.calls++
		var req struct {
			Method string   `json:"method"`
			Params []string `json:"params"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		if len(req.Params) > 0 {
			m.lastParams = req.Params[0]
		}
		w.Header().Set("Content-Type", "application/json")
		if m.httpStatus != 0 {
			w.WriteHeader(m.httpStatus)
		}
		body := map[string]any{
			"jsonrpc": "2.0",
			"id":      1,
		}
		if m.errCode != 0 || m.errMessage != "" {
			body["error"] = map[string]any{
				"code":    m.errCode,
				"message": m.errMessage,
			}
		} else {
			body["result"] = m.resultHash
		}
		_ = json.NewEncoder(w).Encode(body)
	}))
	t.Cleanup(m.server.Close)
	return m
}

// =============================================================================
// Happy path
// =============================================================================

func TestBroadcastDOT_Confirmed(t *testing.T) {
	m := newDOTMockServer(t)
	m.resultHash = "0xdeadbeefcafef00d11223344556677889900aabbccddeeff00112233445566778"
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"POLKADOT_MAINNET": m.server.URL,
	}}
	res, err := c.Broadcast(context.Background(), "POLKADOT_MAINNET", "0xabba")
	if err != nil {
		t.Fatalf("Broadcast: %v", err)
	}
	if res.TxHash != m.resultHash {
		t.Errorf("TxHash = %q, want %q", res.TxHash, m.resultHash)
	}
	if m.calls != 1 {
		t.Errorf("expected 1 RPC call, got %d", m.calls)
	}
	if !strings.HasPrefix(m.lastParams, "0x") {
		t.Errorf("expected 0x-prefixed params, got %q", m.lastParams)
	}
}

func TestBroadcastDOT_AddsZeroXPrefix(t *testing.T) {
	m := newDOTMockServer(t)
	m.resultHash = "0xfeedface"
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"POLKADOT_MAINNET": m.server.URL,
	}}
	// Pass without 0x.
	if _, err := c.Broadcast(context.Background(), "POLKADOT_MAINNET", "abba1234"); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(m.lastParams, "0x") {
		t.Errorf("expected 0x prefix added on wire, got %q", m.lastParams)
	}
}

// =============================================================================
// Error cases — Invalid::Stale / BadProof = fatal
// =============================================================================

func TestBroadcastDOT_StaleIsFatal(t *testing.T) {
	m := newDOTMockServer(t)
	m.errCode = 1010
	m.errMessage = "Invalid Transaction (Stale)"
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"POLKADOT_MAINNET": m.server.URL,
	}}
	_, err := c.Broadcast(context.Background(), "POLKADOT_MAINNET", "0xabba")
	if err == nil {
		t.Fatal("expected error for Stale tx")
	}
	var dotErr *DOTBroadcastError
	if !errors.As(err, &dotErr) {
		t.Fatalf("expected *DOTBroadcastError, got %T", err)
	}
	if dotErr.Retryable {
		t.Error("Stale should be fatal (non-retryable)")
	}
	if !strings.Contains(strings.ToLower(dotErr.Message), "stale") {
		t.Errorf("unexpected message: %q", dotErr.Message)
	}
}

func TestBroadcastDOT_BadProofIsFatal(t *testing.T) {
	m := newDOTMockServer(t)
	m.errCode = 1010
	m.errMessage = "Invalid Transaction: BadProof"
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"POLKADOT_MAINNET": m.server.URL,
	}}
	_, err := c.Broadcast(context.Background(), "POLKADOT_MAINNET", "0xabba")
	var dotErr *DOTBroadcastError
	if !errors.As(err, &dotErr) {
		t.Fatalf("expected *DOTBroadcastError, got %T", err)
	}
	if dotErr.Retryable {
		t.Error("BadProof should be fatal — sign context is wrong")
	}
}

// =============================================================================
// Error cases — Invalid::Future = retryable
// =============================================================================

func TestBroadcastDOT_FutureIsRetryable(t *testing.T) {
	m := newDOTMockServer(t)
	m.errCode = 1010
	m.errMessage = "Invalid Transaction: Future"
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"POLKADOT_MAINNET": m.server.URL,
	}}
	_, err := c.Broadcast(context.Background(), "POLKADOT_MAINNET", "0xabba")
	var dotErr *DOTBroadcastError
	if !errors.As(err, &dotErr) {
		t.Fatalf("expected *DOTBroadcastError, got %T", err)
	}
	if !dotErr.Retryable {
		t.Error("Future nonce should be retryable — will land eventually")
	}
}

func TestBroadcastDOT_AlreadyInPoolIsRetryable(t *testing.T) {
	m := newDOTMockServer(t)
	m.errCode = 1012
	m.errMessage = "Transaction Already Imported"
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"POLKADOT_MAINNET": m.server.URL,
	}}
	_, err := c.Broadcast(context.Background(), "POLKADOT_MAINNET", "0xabba")
	var dotErr *DOTBroadcastError
	if !errors.As(err, &dotErr) {
		t.Fatalf("expected *DOTBroadcastError, got %T", err)
	}
	if !dotErr.Retryable {
		t.Error("AlreadyImported should be retryable — node already has it")
	}
}

func TestBroadcastDOT_PoolFullIsRetryable(t *testing.T) {
	m := newDOTMockServer(t)
	m.errCode = 1011
	m.errMessage = "Transaction Pool is Full"
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"POLKADOT_MAINNET": m.server.URL,
	}}
	_, err := c.Broadcast(context.Background(), "POLKADOT_MAINNET", "0xabba")
	var dotErr *DOTBroadcastError
	if !errors.As(err, &dotErr) {
		t.Fatalf("expected *DOTBroadcastError, got %T", err)
	}
	if !dotErr.Retryable {
		t.Error("Pool full should be retryable")
	}
}

// =============================================================================
// Error cases — Module errors = fatal (usually pallet rejections)
// =============================================================================

func TestBroadcastDOT_ModuleErrorIsFatal(t *testing.T) {
	m := newDOTMockServer(t)
	m.errCode = 1010
	m.errMessage = "Module Error: balances.InsufficientBalance"
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"POLKADOT_MAINNET": m.server.URL,
	}}
	_, err := c.Broadcast(context.Background(), "POLKADOT_MAINNET", "0xabba")
	var dotErr *DOTBroadcastError
	if !errors.As(err, &dotErr) {
		t.Fatalf("expected *DOTBroadcastError, got %T", err)
	}
	if dotErr.Retryable {
		t.Error("Module errors are fatal (pallet rejection)")
	}
}

// =============================================================================
// Error envelopes inside 4xx HTTP — exercised by some substrate proxies
// =============================================================================

func TestBroadcastDOT_4xxWithEnvelope(t *testing.T) {
	m := newDOTMockServer(t)
	m.httpStatus = 400
	m.errCode = 1010
	m.errMessage = "Invalid Transaction (Stale)"
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"POLKADOT_MAINNET": m.server.URL,
	}}
	_, err := c.Broadcast(context.Background(), "POLKADOT_MAINNET", "0xabba")
	var dotErr *DOTBroadcastError
	if !errors.As(err, &dotErr) {
		t.Fatalf("expected *DOTBroadcastError, got %T", err)
	}
	if dotErr.HTTPStatus != 400 {
		t.Errorf("HTTPStatus = %d, want 400", dotErr.HTTPStatus)
	}
	if dotErr.Retryable {
		t.Error("Stale-via-4xx should still be fatal")
	}
}

// =============================================================================
// HTTP 5xx without parseable envelope falls through to RPCError
// =============================================================================

func TestBroadcastDOT_5xxNoEnvelope(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "upstream gateway down", http.StatusBadGateway)
	}))
	t.Cleanup(srv.Close)
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"POLKADOT_MAINNET": srv.URL,
	}}
	_, err := c.Broadcast(context.Background(), "POLKADOT_MAINNET", "0xabba")
	var rpcErr *RPCError
	if !errors.As(err, &rpcErr) {
		t.Fatalf("expected *RPCError fallback, got %T: %v", err, err)
	}
	if rpcErr.HTTPStatus != http.StatusBadGateway {
		t.Errorf("HTTPStatus = %d, want %d", rpcErr.HTTPStatus, http.StatusBadGateway)
	}
}

// =============================================================================
// DOT RPC URL table
// =============================================================================

func TestBroadcastDOT_RPCURLFor(t *testing.T) {
	if RPCURLFor("POLKADOT_MAINNET") == "" {
		t.Error("POLKADOT_MAINNET should be in the table")
	}
	if RPCURLFor("POLKADOT_TESTNET") == "" {
		t.Error("POLKADOT_TESTNET should be in the table")
	}
	if RPCURLFor("KUSAMA_MAINNET") == "" {
		t.Error("KUSAMA_MAINNET should be in the table")
	}
}

// =============================================================================
// Empty response shape
// =============================================================================

func TestBroadcastDOT_EmptyResult(t *testing.T) {
	m := newDOTMockServer(t)
	// Leave resultHash and errMessage both empty → empty result envelope.
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"POLKADOT_MAINNET": m.server.URL,
	}}
	_, err := c.Broadcast(context.Background(), "POLKADOT_MAINNET", "0xabba")
	var rpcErr *RPCError
	if !errors.As(err, &rpcErr) {
		t.Fatalf("expected *RPCError on empty result, got %T", err)
	}
	if !strings.Contains(rpcErr.Message, "empty") {
		t.Errorf("expected 'empty' in message, got %q", rpcErr.Message)
	}
}

// =============================================================================
// DOTBroadcastError formatting
// =============================================================================

func TestDOTBroadcastError_String(t *testing.T) {
	cases := []struct {
		err  *DOTBroadcastError
		want string
	}{
		{
			&DOTBroadcastError{Op: "x", HTTPStatus: 200, Code: 1010, Message: "Stale", Retryable: false},
			"broadcast: dot HTTP 200 rpc 1010 (fatal): Stale",
		},
		{
			&DOTBroadcastError{Op: "x", HTTPStatus: 0, Code: 1010, Message: "Future", Retryable: true},
			"broadcast: dot (retryable): Future",
		},
	}
	for _, tc := range cases {
		if got := tc.err.Error(); got != tc.want {
			t.Errorf("got %q, want %q", got, tc.want)
		}
	}
}
