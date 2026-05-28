package broadcast

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// xrp_test.go: tests for the XRP-family broadcaster.
//
// rippled's `submit` returns an `engine_result` code we classify into
// success / retryable / fatal. Each test covers one class so the
// broadcast driver's retry policy stays correct.

// rippledMock is a stub rippled server. It returns whatever envelope
// the test pre-populates.
type rippledMock struct {
	server      *httptest.Server
	calls       int
	lastTxBlob  string
	resBody     []byte
	statusCode  int
}

func newRippledMock(t *testing.T) *rippledMock {
	t.Helper()
	m := &rippledMock{statusCode: 200}
	m.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		m.calls++
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		// Read + capture the submitted tx_blob so tests can verify
		// the body shape (rippled-style "method"/"params").
		body, _ := io.ReadAll(r.Body)
		var req struct {
			Method string                   `json:"method"`
			Params []map[string]interface{} `json:"params"`
		}
		_ = json.Unmarshal(body, &req)
		if len(req.Params) > 0 {
			if v, ok := req.Params[0]["tx_blob"].(string); ok {
				m.lastTxBlob = v
			}
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(m.statusCode)
		_, _ = w.Write(m.resBody)
	}))
	t.Cleanup(m.server.Close)
	return m
}

// setEngineResult formats a canonical rippled `submit` reply with the
// given engine_result + tx hash and stashes it in the mock for the
// next call.
func (m *rippledMock) setEngineResult(t *testing.T, engineResult, txHash string) {
	t.Helper()
	body, err := json.Marshal(map[string]any{
		"result": map[string]any{
			"engine_result":         engineResult,
			"engine_result_code":    0,
			"engine_result_message": "OK",
			"tx_json":               map[string]any{"hash": txHash},
			"status":                "success",
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	m.resBody = body
}

// setHighLevelError simulates rippled returning a top-level error
// (e.g. amendmentBlocked) — distinct from an engine_result rejection.
func (m *rippledMock) setHighLevelError(t *testing.T, errStr, msg string) {
	t.Helper()
	body, _ := json.Marshal(map[string]any{
		"result": map[string]any{
			"error":         errStr,
			"error_code":    99,
			"error_message": msg,
			"status":        "error",
		},
	})
	m.resBody = body
}

// =============================================================================
// Happy path
// =============================================================================

func TestBroadcastXRP_TesSUCCESS(t *testing.T) {
	m := newRippledMock(t)
	const wantHash = "ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890"
	m.setEngineResult(t, "tesSUCCESS", wantHash)

	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"XRP_TESTNET": m.server.URL,
	}}
	res, err := c.Broadcast(context.Background(), "XRP_TESTNET", "120000220000000024000000")
	if err != nil {
		t.Fatalf("Broadcast: %v", err)
	}
	if res.TxHash != wantHash {
		t.Errorf("tx hash: got %q want %q", res.TxHash, wantHash)
	}
	if m.calls != 1 {
		t.Errorf("expected 1 RPC call, got %d", m.calls)
	}
	// 0x prefix is stripped before going on the wire — rippled rejects
	// 0x-prefixed blobs.
	if strings.HasPrefix(m.lastTxBlob, "0x") {
		t.Errorf("0x prefix should be stripped before submit; got %q", m.lastTxBlob)
	}
}

func TestBroadcastXRP_StripsZeroXPrefixAndUppercases(t *testing.T) {
	m := newRippledMock(t)
	m.setEngineResult(t, "tesSUCCESS", "F00DBABE")
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"XRP_TESTNET": m.server.URL,
	}}
	// Caller passed a 0x-prefixed blob (other broadcasters in this
	// package emit them); the XRP path must strip.
	if _, err := c.Broadcast(context.Background(), "XRP_TESTNET", "0xDEADBEEF"); err != nil {
		t.Fatal(err)
	}
	if m.lastTxBlob != "DEADBEEF" {
		t.Errorf("on-wire tx_blob = %q, want DEADBEEF", m.lastTxBlob)
	}
}

// =============================================================================
// Retryable + fatal classification
// =============================================================================

func TestBroadcastXRP_TerQueued_Retryable(t *testing.T) {
	m := newRippledMock(t)
	m.setEngineResult(t, "terQUEUED", "")

	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"XRP_TESTNET": m.server.URL,
	}}
	_, err := c.Broadcast(context.Background(), "XRP_TESTNET", "ABCD")
	if err == nil {
		t.Fatal("expected RPC error for terQUEUED")
	}
	var rpcErr *RPCError
	if !errors.As(err, &rpcErr) {
		t.Fatalf("expected *RPCError, got %T", err)
	}
	if !strings.Contains(rpcErr.Message, "retryable") {
		t.Errorf("error should say retryable; got %q", rpcErr.Message)
	}
	if !strings.Contains(rpcErr.Message, "terQUEUED") {
		t.Errorf("error should mention engine_result code; got %q", rpcErr.Message)
	}
}

func TestBroadcastXRP_TecInsufficientFunds_Fatal(t *testing.T) {
	m := newRippledMock(t)
	m.setEngineResult(t, "tecINSUFFICIENT_FUNDS", "")

	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"XRP_TESTNET": m.server.URL,
	}}
	_, err := c.Broadcast(context.Background(), "XRP_TESTNET", "ABCD")
	if err == nil {
		t.Fatal("expected RPC error for tecINSUFFICIENT_FUNDS")
	}
	var rpcErr *RPCError
	if !errors.As(err, &rpcErr) {
		t.Fatalf("expected *RPCError, got %T", err)
	}
	if !strings.Contains(rpcErr.Message, "fatal") {
		t.Errorf("error should say fatal; got %q", rpcErr.Message)
	}
}

func TestBroadcastXRP_TemMalformed_Fatal(t *testing.T) {
	m := newRippledMock(t)
	m.setEngineResult(t, "temBAD_AMOUNT", "")
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"XRP_TESTNET": m.server.URL,
	}}
	_, err := c.Broadcast(context.Background(), "XRP_TESTNET", "ABCD")
	if err == nil {
		t.Fatal("expected RPC error for temBAD_AMOUNT")
	}
	var rpcErr *RPCError
	if !errors.As(err, &rpcErr) {
		t.Fatalf("expected *RPCError, got %T", err)
	}
	if !strings.Contains(rpcErr.Message, "fatal") {
		t.Errorf("error should say fatal; got %q", rpcErr.Message)
	}
	if !strings.Contains(rpcErr.Message, "temBAD_AMOUNT") {
		t.Errorf("expected temBAD_AMOUNT in error; got %q", rpcErr.Message)
	}
}

// =============================================================================
// Other paths
// =============================================================================

func TestBroadcastXRP_TecNoDst_Fatal(t *testing.T) {
	m := newRippledMock(t)
	m.setEngineResult(t, "tecNO_DST", "")
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"XRP_TESTNET": m.server.URL,
	}}
	_, err := c.Broadcast(context.Background(), "XRP_TESTNET", "ABCD")
	var rpcErr *RPCError
	if !errors.As(err, &rpcErr) || !strings.Contains(rpcErr.Message, "fatal") {
		t.Errorf("expected fatal RPCError; got %v", err)
	}
}

func TestBroadcastXRP_TelLocalError_Retryable(t *testing.T) {
	m := newRippledMock(t)
	m.setEngineResult(t, "telINSUF_FEE_P", "")
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"XRP_TESTNET": m.server.URL,
	}}
	_, err := c.Broadcast(context.Background(), "XRP_TESTNET", "ABCD")
	var rpcErr *RPCError
	if !errors.As(err, &rpcErr) || !strings.Contains(rpcErr.Message, "retryable") {
		t.Errorf("expected retryable RPCError for telINSUF_FEE_P; got %v", err)
	}
}

func TestBroadcastXRP_NetworkError(t *testing.T) {
	// Server that closes the connection mid-request → transport error.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hj, ok := w.(http.Hijacker)
		if !ok {
			http.Error(w, "no hijacker", 500)
			return
		}
		conn, _, err := hj.Hijack()
		if err != nil {
			return
		}
		_ = conn.Close()
	}))
	t.Cleanup(srv.Close)
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"XRP_TESTNET": srv.URL,
	}}
	_, err := c.Broadcast(context.Background(), "XRP_TESTNET", "ABCD")
	if err == nil {
		t.Fatal("expected transport error")
	}
	// Either *RPCError (transport-wrapped) or net error — both are acceptable.
}

func TestBroadcastXRP_HighLevelError(t *testing.T) {
	m := newRippledMock(t)
	m.setHighLevelError(t, "amendmentBlocked", "Server is amendment-blocked")
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"XRP_TESTNET": m.server.URL,
	}}
	_, err := c.Broadcast(context.Background(), "XRP_TESTNET", "ABCD")
	var rpcErr *RPCError
	if !errors.As(err, &rpcErr) {
		t.Fatalf("expected *RPCError, got %T", err)
	}
	if !strings.Contains(rpcErr.Message, "amendmentBlocked") {
		t.Errorf("error should surface high-level rippled error; got %q", rpcErr.Message)
	}
}

func TestBroadcastXRP_SuccessWithoutTxHash_Fails(t *testing.T) {
	// Engine returns tesSUCCESS but tx_json.hash is missing —
	// broadcaster should refuse rather than fabricate a hash.
	m := newRippledMock(t)
	m.resBody, _ = json.Marshal(map[string]any{
		"result": map[string]any{
			"engine_result":         "tesSUCCESS",
			"engine_result_code":    0,
			"engine_result_message": "OK",
			"tx_json":               map[string]any{},
			"status":                "success",
		},
	})
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"XRP_TESTNET": m.server.URL,
	}}
	_, err := c.Broadcast(context.Background(), "XRP_TESTNET", "ABCD")
	if err == nil {
		t.Fatal("expected error when tx_json.hash absent")
	}
	if !strings.Contains(err.Error(), "tx_json.hash") {
		t.Errorf("error should mention missing hash; got %q", err)
	}
}

// =============================================================================
// classifyEngineResult unit table
// =============================================================================

func TestClassifyEngineResult(t *testing.T) {
	cases := []struct {
		code string
		want xrpClass
	}{
		{"", xrpClassUnknown},
		{"tesSUCCESS", xrpClassSuccess},
		{"terQUEUED", xrpClassRetryable},
		{"terNO_ACCOUNT", xrpClassRetryable},
		{"terNO_LINE", xrpClassRetryable},
		{"tecNO_DST", xrpClassFatal},
		{"tecINSUFFICIENT_FUNDS", xrpClassFatal},
		{"tecUNFUNDED", xrpClassFatal},
		{"temBAD_AMOUNT", xrpClassFatal},
		{"temINVALID_FLAG", xrpClassFatal},
		{"tefPAST_SEQ", xrpClassFatal},
		{"tefALREADY", xrpClassFatal},
		{"telINSUF_FEE_P", xrpClassRetryable},
		{"telCAN_NOT_QUEUE", xrpClassRetryable},
		{"unknownPrefix", xrpClassUnknown},
		{"ts", xrpClassUnknown}, // too short
	}
	for _, c := range cases {
		got := classifyEngineResult(c.code)
		if got != c.want {
			t.Errorf("%q: got %d, want %d", c.code, got, c.want)
		}
	}
}

// =============================================================================
// extractXRPTxHash
// =============================================================================

func TestExtractXRPTxHash(t *testing.T) {
	cases := []struct {
		name    string
		body    string
		wantTx  string
		wantErr bool
	}{
		{"empty", "", "", true},
		{"missing hash", `{}`, "", true},
		{"valid", fmt.Sprintf(`{"hash":"%s"}`, strings.Repeat("A", 64)), strings.Repeat("A", 64), false},
		{"bad json", `{not json`, "", true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			hash, err := extractXRPTxHash(json.RawMessage(c.body))
			if (err != nil) != c.wantErr {
				t.Errorf("err = %v wantErr=%v", err, c.wantErr)
			}
			if hash != c.wantTx {
				t.Errorf("hash = %q want %q", hash, c.wantTx)
			}
		})
	}
}
