// Tests for the Solana destination broadcaster.

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

// solSendServer is a minimal httptest harness that handles
// sendTransaction calls and emits a configurable response.
type solSendServer struct {
	server     *httptest.Server
	resultSig  string
	errCode    int
	errMsg     string
	errData    json.RawMessage
	calls      int
	lastTxB64  string
	lastParams []any
}

func newSolSendServer(t *testing.T, resultSig string) *solSendServer {
	t.Helper()
	s := &solSendServer{resultSig: resultSig}
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
		if req.Method != "sendTransaction" {
			http.Error(w, "wrong method "+req.Method, http.StatusBadRequest)
			return
		}
		s.lastParams = req.Params
		if len(req.Params) > 0 {
			if str, ok := req.Params[0].(string); ok {
				s.lastTxB64 = str
			}
		}
		w.Header().Set("Content-Type", "application/json")
		if s.errMsg != "" {
			payload := map[string]any{
				"jsonrpc": "2.0", "id": 1,
				"error": map[string]any{"code": s.errCode, "message": s.errMsg},
			}
			if len(s.errData) > 0 {
				payload["error"].(map[string]any)["data"] = json.RawMessage(s.errData)
			}
			_ = json.NewEncoder(w).Encode(payload)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0", "id": 1, "result": s.resultSig,
		})
	}))
	t.Cleanup(s.server.Close)
	return s
}

// =============================================================================
// Happy path
// =============================================================================

func TestBroadcastSOL_Happy(t *testing.T) {
	srv := newSolSendServer(t, "5J7XU…fakeSig")
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"SOLANA_DEVNET": srv.server.URL,
	}}
	res, err := c.Broadcast(context.Background(), "SOLANA_DEVNET", "BASE64SIGNED_TX==")
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if res.TxHash != "5J7XU…fakeSig" {
		t.Errorf("TxHash = %q", res.TxHash)
	}
	if srv.calls != 1 {
		t.Errorf("calls = %d, want 1", srv.calls)
	}
	// Inspect the params shape: ["<base64>", {encoding, preflightCommitment, skipPreflight}].
	if len(srv.lastParams) != 2 {
		t.Fatalf("params len = %d, want 2", len(srv.lastParams))
	}
	if tx, _ := srv.lastParams[0].(string); tx != "BASE64SIGNED_TX==" {
		t.Errorf("first param = %q, want raw tx b64", tx)
	}
	opts, _ := srv.lastParams[1].(map[string]any)
	if opts == nil {
		t.Fatal("second param must be opts map")
	}
	if got, _ := opts["encoding"].(string); got != "base64" {
		t.Errorf("encoding = %q, want base64", got)
	}
	if got, _ := opts["preflightCommitment"].(string); got != "confirmed" {
		t.Errorf("preflightCommitment = %q, want confirmed", got)
	}
	if got, _ := opts["skipPreflight"].(bool); got != false {
		t.Errorf("skipPreflight = %v, want false", got)
	}
}

// =============================================================================
// Malformed RPC response
// =============================================================================

func TestBroadcastSOL_MalformedResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte("not-json-at-all"))
	}))
	t.Cleanup(srv.Close)
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"SOLANA_DEVNET": srv.URL,
	}}
	_, err := c.Broadcast(context.Background(), "SOLANA_DEVNET", "BASE64==")
	if err == nil {
		t.Fatal("expected malformed-response error")
	}
	if !strings.Contains(err.Error(), "decode") {
		t.Errorf("expected decode error, got %v", err)
	}
}

// =============================================================================
// BlockhashNotFound — retryable
// =============================================================================

func TestBroadcastSOL_BlockhashNotFoundIsRetryable(t *testing.T) {
	srv := newSolSendServer(t, "")
	srv.errCode = -32002
	srv.errMsg = "Blockhash not found"
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"SOLANA_DEVNET": srv.server.URL,
	}}
	_, err := c.Broadcast(context.Background(), "SOLANA_DEVNET", "BASE64==")
	if err == nil {
		t.Fatal("expected blockhash-not-found error")
	}
	var bn *SOLBlockhashNotFoundError
	if !errors.As(err, &bn) {
		t.Fatalf("expected *SOLBlockhashNotFoundError, got %T: %v", err, err)
	}
	if !bn.Retryable() {
		t.Errorf("BlockhashNotFound must be retryable")
	}
	if !IsSOLBlockhashNotFound(err) {
		t.Errorf("IsSOLBlockhashNotFound returned false")
	}
}

// =============================================================================
// SimulationError — fatal
// =============================================================================

func TestBroadcastSOL_SimulationErrorIsFatal(t *testing.T) {
	srv := newSolSendServer(t, "")
	srv.errCode = -32002
	srv.errMsg = "Transaction simulation failed: insufficient funds for fee"
	srv.errData = json.RawMessage(`{"err":"InsufficientFundsForFee","logs":["Program log: hello","Program log: insufficient"]}`)
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"SOLANA_DEVNET": srv.server.URL,
	}}
	_, err := c.Broadcast(context.Background(), "SOLANA_DEVNET", "BASE64==")
	if err == nil {
		t.Fatal("expected simulation error")
	}
	var se *SOLSimulationError
	if !errors.As(err, &se) {
		t.Fatalf("expected *SOLSimulationError, got %T: %v", err, err)
	}
	if se.Retryable() {
		t.Errorf("SimulationError must NOT be retryable")
	}
	if got := len(se.Logs); got != 2 {
		t.Errorf("expected 2 logs extracted from error.data, got %d (logs=%v)", got, se.Logs)
	}
	if !IsSOLSimulationError(err) {
		t.Errorf("IsSOLSimulationError returned false")
	}
}

// =============================================================================
// Empty raw tx
// =============================================================================

func TestBroadcastSOL_EmptyRawTx(t *testing.T) {
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"SOLANA_DEVNET": "http://unused",
	}}
	_, err := c.Broadcast(context.Background(), "SOLANA_DEVNET", "")
	if !errors.Is(err, ErrEmptyRawTx) {
		t.Errorf("expected ErrEmptyRawTx, got %v", err)
	}
}

// =============================================================================
// Empty signature in response
// =============================================================================

func TestBroadcastSOL_EmptySignature(t *testing.T) {
	srv := newSolSendServer(t, "") // resultSig deliberately empty
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"SOLANA_DEVNET": srv.server.URL,
	}}
	_, err := c.Broadcast(context.Background(), "SOLANA_DEVNET", "BASE64==")
	var rpcErr *RPCError
	if !errors.As(err, &rpcErr) {
		t.Fatalf("expected *RPCError, got %T", err)
	}
	if !strings.Contains(rpcErr.Message, "empty signature") {
		t.Errorf("expected empty-signature message, got %q", rpcErr.Message)
	}
}

// =============================================================================
// classifySOLError — direct unit coverage
// =============================================================================

func TestClassifySOLError(t *testing.T) {
	if !IsSOLBlockhashNotFound(classifySOLError("Blockhash not found", nil)) {
		t.Errorf("expected blockhash-not-found classification (exact)")
	}
	if !IsSOLBlockhashNotFound(classifySOLError("BLOCKHASH NOT FOUND on slot 12345", nil)) {
		t.Errorf("classification should be case-insensitive")
	}
	if !IsSOLSimulationError(classifySOLError("Transaction simulation failed: InsufficientFundsForFee", nil)) {
		t.Errorf("expected simulation classification")
	}
	if !IsSOLSimulationError(classifySOLError("preflight failure", nil)) {
		t.Errorf("expected simulation classification on preflight string")
	}
	// Default → generic RPCError.
	err := classifySOLError("node is behind by 50 slots", nil)
	var rpcErr *RPCError
	if !errors.As(err, &rpcErr) {
		t.Errorf("expected generic *RPCError, got %T: %v", err, err)
	}
}

// =============================================================================
// RPC URL table
// =============================================================================

func TestRPCURLFor_SOL(t *testing.T) {
	if RPCURLFor("SOLANA_MAINNET") == "" {
		t.Error("SOLANA_MAINNET should be in the table")
	}
	if RPCURLFor("SOLANA_DEVNET") == "" {
		t.Error("SOLANA_DEVNET should be in the table")
	}
	if RPCURLFor("SOLANA_TESTNET") == "" {
		t.Error("SOLANA_TESTNET should be in the table")
	}
}
