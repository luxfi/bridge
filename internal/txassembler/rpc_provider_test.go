package txassembler

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// =============================================================================
// PendingNonce
// =============================================================================

func TestRPCProvider_PendingNonce_HappyPath(t *testing.T) {
	var gotMethod string
	var gotParams []any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var req struct {
			Method string `json:"method"`
			Params []any  `json:"params"`
		}
		_ = json.Unmarshal(body, &req)
		gotMethod = req.Method
		gotParams = req.Params
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0", "id": 1, "result": "0x2a", // 42
		})
	}))
	t.Cleanup(srv.Close)

	p := &RPCProvider{Endpoints: map[string]string{"LUX_TESTNET": srv.URL}, Timeout: time.Second}
	got, err := p.PendingNonce(context.Background(), "LUX_TESTNET", "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473")
	if err != nil {
		t.Fatal(err)
	}
	if got != 42 {
		t.Errorf("got %d, want 42", got)
	}
	if gotMethod != "eth_getTransactionCount" {
		t.Errorf("method = %q, want eth_getTransactionCount", gotMethod)
	}
	if len(gotParams) != 2 ||
		gotParams[0] != "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473" ||
		gotParams[1] != "pending" {
		t.Errorf("params mismatch: %v", gotParams)
	}
}

func TestRPCProvider_PendingNonce_Zero(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0", "id": 1, "result": "0x0",
		})
	}))
	t.Cleanup(srv.Close)
	p := &RPCProvider{Endpoints: map[string]string{"LUX_TESTNET": srv.URL}, Timeout: time.Second}
	n, err := p.PendingNonce(context.Background(), "LUX_TESTNET", "0xabc")
	if err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Errorf("got %d, want 0", n)
	}
}

func TestRPCProvider_PendingNonce_RPCError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0", "id": 1,
			"error": map[string]any{"code": -32000, "message": "method not enabled"},
		})
	}))
	t.Cleanup(srv.Close)
	p := &RPCProvider{Endpoints: map[string]string{"LUX_TESTNET": srv.URL}, Timeout: time.Second}
	_, err := p.PendingNonce(context.Background(), "LUX_TESTNET", "0xabc")
	if err == nil || !strings.Contains(err.Error(), "method not enabled") {
		t.Errorf("expected upstream error to surface, got %v", err)
	}
}

func TestRPCProvider_PendingNonce_NoEndpoint(t *testing.T) {
	p := &RPCProvider{Endpoints: map[string]string{}, Timeout: time.Second}
	_, err := p.PendingNonce(context.Background(), "UNKNOWN_NETWORK", "0xabc")
	if err == nil || !strings.Contains(err.Error(), "no RPC endpoint") {
		t.Errorf("expected no-endpoint error, got %v", err)
	}
}

func TestRPCProvider_PendingNonce_HTTPError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "rate limit", http.StatusTooManyRequests)
	}))
	t.Cleanup(srv.Close)
	p := &RPCProvider{Endpoints: map[string]string{"LUX_TESTNET": srv.URL}, Timeout: time.Second}
	_, err := p.PendingNonce(context.Background(), "LUX_TESTNET", "0xabc")
	if err == nil || !strings.Contains(err.Error(), "HTTP 429") {
		t.Errorf("expected HTTP 429 surface, got %v", err)
	}
}

func TestRPCProvider_PendingNonce_MalformedHex(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0", "id": 1, "result": "0xZZZ",
		})
	}))
	t.Cleanup(srv.Close)
	p := &RPCProvider{Endpoints: map[string]string{"LUX_TESTNET": srv.URL}, Timeout: time.Second}
	_, err := p.PendingNonce(context.Background(), "LUX_TESTNET", "0xabc")
	if err == nil || !strings.Contains(err.Error(), "invalid hex char") {
		t.Errorf("expected parse error, got %v", err)
	}
}

// =============================================================================
// SuggestGasPrice
// =============================================================================

func TestRPCProvider_SuggestGasPrice_HappyPath(t *testing.T) {
	var gotMethod string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Method string `json:"method"`
		}
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &req)
		gotMethod = req.Method
		w.Header().Set("Content-Type", "application/json")
		// 30 gwei = 0x6FC23AC00
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0", "id": 1, "result": "0x6FC23AC00",
		})
	}))
	t.Cleanup(srv.Close)
	p := &RPCProvider{Endpoints: map[string]string{"LUX_TESTNET": srv.URL}, Timeout: time.Second}
	got, err := p.SuggestGasPrice(context.Background(), "LUX_TESTNET")
	if err != nil {
		t.Fatal(err)
	}
	want := big.NewInt(30_000_000_000)
	if got.Cmp(want) != 0 {
		t.Errorf("got %s wei, want %s wei", got, want)
	}
	if gotMethod != "eth_gasPrice" {
		t.Errorf("method = %q, want eth_gasPrice", gotMethod)
	}
}

func TestRPCProvider_SuggestGasPrice_RejectsZero(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0", "id": 1, "result": "0x0",
		})
	}))
	t.Cleanup(srv.Close)
	p := &RPCProvider{Endpoints: map[string]string{"LUX_TESTNET": srv.URL}, Timeout: time.Second}
	_, err := p.SuggestGasPrice(context.Background(), "LUX_TESTNET")
	if err == nil || !strings.Contains(err.Error(), "non-positive") {
		t.Errorf("expected non-positive error, got %v", err)
	}
}

func TestRPCProvider_SuggestGasPrice_LargeValue(t *testing.T) {
	// 1000 gwei = 10^12 wei = 0xE8D4A51000 — needs big.Int (fits in
	// uint64 but we want to verify big.Int handles >32-bit values).
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0", "id": 1, "result": "0xE8D4A51000",
		})
	}))
	t.Cleanup(srv.Close)
	p := &RPCProvider{Endpoints: map[string]string{"LUX_TESTNET": srv.URL}, Timeout: time.Second}
	got, err := p.SuggestGasPrice(context.Background(), "LUX_TESTNET")
	if err != nil {
		t.Fatal(err)
	}
	want, _ := new(big.Int).SetString("1000000000000", 10)
	if got.Cmp(want) != 0 {
		t.Errorf("got %s, want %s", got, want)
	}
}

// =============================================================================
// Constructor + overrides
// =============================================================================

func TestNewRPCProvider_PopulatesDefaults(t *testing.T) {
	p := NewRPCProvider(nil, 5*time.Second)
	if len(p.Endpoints) == 0 {
		t.Fatal("expected default endpoints to populate")
	}
	if p.Endpoints["LUX_TESTNET"] == "" {
		t.Error("LUX_TESTNET should have a default endpoint")
	}
	if p.Timeout != 5*time.Second {
		t.Errorf("Timeout = %v", p.Timeout)
	}
}

func TestRPCProvider_OverrideBeatsEndpoint(t *testing.T) {
	// Default endpoint deliberately invalid; override should win.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0", "id": 1, "result": "0xff",
		})
	}))
	t.Cleanup(srv.Close)

	p := &RPCProvider{
		Endpoints: map[string]string{"LUX_TESTNET": "http://invalid.test:0/"},
		Overrides: map[string]string{"LUX_TESTNET": srv.URL},
		Timeout:   time.Second,
	}
	got, err := p.PendingNonce(context.Background(), "LUX_TESTNET", "0xabc")
	if err != nil {
		t.Fatal(err)
	}
	if got != 255 {
		t.Errorf("got %d, want 255 (override should have routed to mock)", got)
	}
}

func TestDefaultEndpoints_ReturnsCopy(t *testing.T) {
	a := DefaultEndpoints()
	a["MARS_MAINNET"] = "http://example.test"
	b := DefaultEndpoints()
	if _, ok := b["MARS_MAINNET"]; ok {
		t.Error("DefaultEndpoints should return a fresh copy; mutation leaked")
	}
}

// =============================================================================
// parseHex helpers
// =============================================================================

func TestParseHexUint64(t *testing.T) {
	cases := []struct {
		in      string
		want    uint64
		wantErr bool
	}{
		{"0x0", 0, false},
		{"0x", 0, false},
		{"", 0, false},
		{"0x2a", 42, false},
		{"0xFF", 255, false},
		{"0xff", 255, false},
		{"0X10", 16, false},
		{"0xdeadbeef", 0xdeadbeef, false},
		{"0xZZ", 0, true},
	}
	for _, tc := range cases {
		t.Run(tc.in, func(t *testing.T) {
			got, err := parseHexUint64(tc.in)
			if tc.wantErr {
				if err == nil {
					t.Error("expected error")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if got != tc.want {
				t.Errorf("got %d, want %d", got, tc.want)
			}
		})
	}
}

func TestParseHexBigInt(t *testing.T) {
	cases := []struct {
		in   string
		want string // decimal
	}{
		{"0x0", "0"},
		{"", "0"},
		{"0xff", "255"},
		{"0xde0b6b3a7640000", "1000000000000000000"}, // 1 ether
	}
	for _, tc := range cases {
		t.Run(tc.in, func(t *testing.T) {
			got, err := parseHexBigInt(tc.in)
			if err != nil {
				t.Fatal(err)
			}
			if got.String() != tc.want {
				t.Errorf("got %s, want %s", got.String(), tc.want)
			}
		})
	}
	if _, err := parseHexBigInt("0xZZ"); err == nil {
		t.Error("expected error on bad hex")
	}
}

// =============================================================================
// Context + timeout
// =============================================================================

func TestRPCProvider_ContextCanceled(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-time.After(2 * time.Second):
		}
	}))
	t.Cleanup(srv.Close)
	p := &RPCProvider{Endpoints: map[string]string{"X": srv.URL}, Timeout: 5 * time.Second}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := p.PendingNonce(ctx, "X", "0xabc")
	if err == nil {
		t.Fatal("expected cancellation")
	}
	if !errors.Is(err, context.Canceled) {
		t.Errorf("expected context.Canceled, got %T: %v", err, err)
	}
}

func TestRPCProvider_TimeoutFires(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-time.After(2 * time.Second):
		}
	}))
	t.Cleanup(srv.Close)
	p := &RPCProvider{Endpoints: map[string]string{"X": srv.URL}, Timeout: 200 * time.Millisecond}
	start := time.Now()
	_, err := p.PendingNonce(context.Background(), "X", "0xabc")
	dur := time.Since(start)
	if err == nil {
		t.Fatal("expected timeout")
	}
	if dur > time.Second {
		t.Errorf("expected fast timeout, took %v", dur)
	}
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Errorf("expected context.DeadlineExceeded, got %T: %v", err, err)
	}
}
