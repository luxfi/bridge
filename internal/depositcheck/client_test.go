// Tests for the deposit-check client. Each chain family gets a
// dedicated httptest.Server mock that matches the upstream's wire
// format (eth_getBalance, Blockstream `/address/{addr}`, Solana
// `getBalance`, TON Center `getAddressBalance`). The package's
// RPCURLOverrides hook lets us point the Client at the mocks without
// touching the package-level RPC_URLs map.

package depositcheck

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// =============================================================================
// EVM
// =============================================================================

// ethBalanceServer returns the given balance (in wei) as a 0x-prefixed
// hex string from any eth_getBalance call.
func ethBalanceServer(t *testing.T, balanceWei string) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			Method string `json:"method"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0", "id": 1, "result": balanceWei,
		})
	}))
	t.Cleanup(srv.Close)
	return srv
}

func TestCheck_EVM_Confirmed(t *testing.T) {
	// 0xDE0B6B3A7640000 = 10^18 = 1.0 ETH
	srv := ethBalanceServer(t, "0xDE0B6B3A7640000")
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"ETHEREUM_SEPOLIA": srv.URL,
	}}
	ok, err := c.Check(context.Background(), CheckParams{
		NetworkInternalName: "ETHEREUM_SEPOLIA",
		Address:             "0xabc",
		Asset:               "ETH",
		RequiredAmount:      0.5,
	})
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if !ok {
		t.Fatal("expected confirmed (1 ETH >= 0.5 required)")
	}
}

func TestCheck_EVM_Insufficient(t *testing.T) {
	// 0x2386F26FC10000 = 10^16 = 0.01 ETH
	srv := ethBalanceServer(t, "0x2386F26FC10000")
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"ETHEREUM_SEPOLIA": srv.URL,
	}}
	ok, err := c.Check(context.Background(), CheckParams{
		NetworkInternalName: "ETHEREUM_SEPOLIA",
		Address:             "0xabc",
		Asset:               "ETH",
		RequiredAmount:      0.5,
	})
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if ok {
		t.Fatal("expected NOT confirmed (0.01 ETH < 0.5 required)")
	}
}

func TestCheck_EVM_ZeroBalance(t *testing.T) {
	srv := ethBalanceServer(t, "0x0")
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"ETHEREUM_SEPOLIA": srv.URL,
	}}
	ok, err := c.Check(context.Background(), CheckParams{
		NetworkInternalName: "ETHEREUM_SEPOLIA",
		RequiredAmount:      0.01,
	})
	if err != nil || ok {
		t.Fatalf("expected (false, nil) for 0 wei; got (%v, %v)", ok, err)
	}
}

func TestCheck_EVM_RPCErrorEnvelope(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0", "id": 1,
			"error": map[string]any{"code": -32000, "message": "node overloaded"},
		})
	}))
	t.Cleanup(srv.Close)
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"ETHEREUM_SEPOLIA": srv.URL,
	}}
	_, err := c.Check(context.Background(), CheckParams{
		NetworkInternalName: "ETHEREUM_SEPOLIA",
		RequiredAmount:      0.01,
	})
	if err == nil || !strings.Contains(err.Error(), "node overloaded") {
		t.Fatalf("expected upstream error to surface, got %v", err)
	}
}

func TestCheck_EVM_HTTPNon200(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "rate limited", http.StatusTooManyRequests)
	}))
	t.Cleanup(srv.Close)
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"ETHEREUM_SEPOLIA": srv.URL,
	}}
	_, err := c.Check(context.Background(), CheckParams{
		NetworkInternalName: "ETHEREUM_SEPOLIA",
		RequiredAmount:      0.01,
	})
	if err == nil || !strings.Contains(err.Error(), "HTTP 429") {
		t.Fatalf("expected HTTP 429 surface, got %v", err)
	}
}

func TestCheck_EVM_LargeBalancePrecision(t *testing.T) {
	// 10 ETH = 10 * 1e18 wei = 0x8AC7230489E80000
	srv := ethBalanceServer(t, "0x8AC7230489E80000")
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"LUX_TESTNET": srv.URL,
	}}
	ok, err := c.Check(context.Background(), CheckParams{
		NetworkInternalName: "LUX_TESTNET",
		RequiredAmount:      9.99,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !ok {
		t.Fatal("expected confirmed: 10 ETH >= 9.99")
	}
}

// =============================================================================
// Bitcoin
// =============================================================================

func TestCheck_BTC_Confirmed(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/address/") {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"chain_stats": map[string]any{
				"funded_txo_sum": 200_000, // 0.002 BTC
				"spent_txo_sum":  50_000,  // 0.0005 BTC spent
			},
		})
		// Net: 150_000 sats = 0.0015 BTC
	}))
	t.Cleanup(srv.Close)
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"BITCOIN_TESTNET": srv.URL,
	}}
	ok, err := c.Check(context.Background(), CheckParams{
		NetworkInternalName: "BITCOIN_TESTNET",
		Address:             "tb1qabc",
		Asset:               "BTC",
		RequiredAmount:      0.001,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !ok {
		t.Fatal("expected confirmed: 0.0015 BTC >= 0.001")
	}
}

func TestCheck_BTC_Insufficient(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"chain_stats": map[string]any{
				"funded_txo_sum": 50_000,
				"spent_txo_sum":  0,
			},
		})
	}))
	t.Cleanup(srv.Close)
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"BITCOIN_TESTNET": srv.URL,
	}}
	ok, err := c.Check(context.Background(), CheckParams{
		NetworkInternalName: "BITCOIN_TESTNET",
		RequiredAmount:      0.001,
	})
	if err != nil || ok {
		t.Fatalf("expected (false, nil); got (%v, %v)", ok, err)
	}
}

func TestCheck_BTC_FullySpent_NetZero(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"chain_stats": map[string]any{
				"funded_txo_sum": 100_000,
				"spent_txo_sum":  100_000,
			},
		})
	}))
	t.Cleanup(srv.Close)
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"BITCOIN_TESTNET": srv.URL,
	}}
	ok, err := c.Check(context.Background(), CheckParams{
		NetworkInternalName: "BITCOIN_TESTNET",
		RequiredAmount:      0.0001,
	})
	if err != nil || ok {
		t.Fatalf("expected (false, nil) net-zero; got (%v, %v)", ok, err)
	}
}

// =============================================================================
// Solana
// =============================================================================

func TestCheck_SOL_Confirmed(t *testing.T) {
	// 1_500_000_000 lamports = 1.5 SOL
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0", "id": 1,
			"result": map[string]any{"value": 1_500_000_000, "context": map[string]any{"slot": 1}},
		})
	}))
	t.Cleanup(srv.Close)
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"SOLANA_DEVNET": srv.URL,
	}}
	ok, err := c.Check(context.Background(), CheckParams{
		NetworkInternalName: "SOLANA_DEVNET",
		Address:             "SoLaNa",
		Asset:               "SOL",
		RequiredAmount:      1.0,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !ok {
		t.Fatal("expected confirmed: 1.5 SOL >= 1.0")
	}
}

func TestCheck_SOL_Insufficient(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0", "id": 1,
			"result": map[string]any{"value": 100_000_000},
		})
	}))
	t.Cleanup(srv.Close)
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"SOLANA_DEVNET": srv.URL,
	}}
	ok, err := c.Check(context.Background(), CheckParams{
		NetworkInternalName: "SOLANA_DEVNET",
		RequiredAmount:      1.0,
	})
	if err != nil || ok {
		t.Fatalf("expected (false, nil), got (%v, %v)", ok, err)
	}
}

func TestCheck_SOL_RPCError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0", "id": 1,
			"error": map[string]any{"code": -32602, "message": "invalid address"},
		})
	}))
	t.Cleanup(srv.Close)
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"SOLANA_DEVNET": srv.URL,
	}}
	_, err := c.Check(context.Background(), CheckParams{
		NetworkInternalName: "SOLANA_DEVNET",
		RequiredAmount:      1.0,
	})
	if err == nil || !strings.Contains(err.Error(), "invalid address") {
		t.Fatalf("expected upstream error to surface, got %v", err)
	}
}

// =============================================================================
// TON
// =============================================================================

func TestCheck_TON_Confirmed(t *testing.T) {
	// 5_000_000_000 nanoTON = 5 TON
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/getAddressBalance") {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"ok":     true,
			"result": "5000000000", // TON Center returns string
		})
	}))
	t.Cleanup(srv.Close)
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"TON_TESTNET": srv.URL,
	}}
	ok, err := c.Check(context.Background(), CheckParams{
		NetworkInternalName: "TON_TESTNET",
		Address:             "tonAddr",
		Asset:               "TON",
		RequiredAmount:      4.5,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !ok {
		t.Fatal("expected confirmed: 5 TON >= 4.5")
	}
}

func TestCheck_TON_NumericResult(t *testing.T) {
	// Some shims/forks return number instead of string — make sure we
	// don't blow up on the loosely-typed shape.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"ok":     true,
			"result": 5_000_000_000.0,
		})
	}))
	t.Cleanup(srv.Close)
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"TON_TESTNET": srv.URL,
	}}
	ok, err := c.Check(context.Background(), CheckParams{
		NetworkInternalName: "TON_TESTNET",
		RequiredAmount:      1,
	})
	if err != nil || !ok {
		t.Fatalf("expected confirmed, got (%v, %v)", ok, err)
	}
}

func TestCheck_TON_BadResultType(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"ok":     true,
			"result": map[string]any{"weird": "shape"},
		})
	}))
	t.Cleanup(srv.Close)
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"TON_TESTNET": srv.URL,
	}}
	_, err := c.Check(context.Background(), CheckParams{
		NetworkInternalName: "TON_TESTNET",
		RequiredAmount:      1,
	})
	if err == nil || !strings.Contains(err.Error(), "unexpected TON balance type") {
		t.Fatalf("expected unexpected-type error, got %v", err)
	}
}

// =============================================================================
// Unsupported
// =============================================================================

func TestCheck_UnsupportedNetwork(t *testing.T) {
	c := &Client{Timeout: time.Second}
	_, err := c.Check(context.Background(), CheckParams{
		NetworkInternalName: "MARS_MAINNET",
		RequiredAmount:      1,
	})
	if !errors.Is(err, ErrUnsupportedNetwork) {
		t.Fatalf("expected ErrUnsupportedNetwork, got %v", err)
	}
}

func TestCheck_Substrate_NotImplemented(t *testing.T) {
	c := &Client{Timeout: time.Second}
	_, err := c.Check(context.Background(), CheckParams{
		NetworkInternalName: "POLKADOT_MAINNET",
		RequiredAmount:      1,
	})
	if !errors.Is(err, ErrSubstrateNotImplemented) {
		t.Fatalf("expected ErrSubstrateNotImplemented, got %v", err)
	}
}

func TestCheck_XRP_NotImplemented(t *testing.T) {
	// XRP routes through ErrUnsupportedNetwork rather than its own
	// sentinel — matches the TS legacy "default: warn + return false"
	// branch but with an explicit error type.
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"XRP_TESTNET": "http://unused",
	}}
	_, err := c.Check(context.Background(), CheckParams{
		NetworkInternalName: "XRP_TESTNET",
		RequiredAmount:      1,
	})
	if !errors.Is(err, ErrUnsupportedNetwork) {
		t.Fatalf("expected ErrUnsupportedNetwork for XRP, got %v", err)
	}
}

// =============================================================================
// Context + timeout
// =============================================================================

func TestCheck_ContextCanceled(t *testing.T) {
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
	_, err := c.Check(ctx, CheckParams{
		NetworkInternalName: "ETHEREUM_SEPOLIA",
		RequiredAmount:      1,
	})
	if err == nil {
		t.Fatal("expected cancellation error, got nil")
	}
}

func TestCheck_TimeoutFires(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-time.After(2 * time.Second):
		}
	}))
	t.Cleanup(srv.Close)
	c := &Client{Timeout: 200 * time.Millisecond, RPCURLOverrides: map[string]string{
		"BITCOIN_TESTNET": srv.URL,
	}}
	start := time.Now()
	_, err := c.Check(context.Background(), CheckParams{
		NetworkInternalName: "BITCOIN_TESTNET",
		RequiredAmount:      1,
	})
	if err == nil || time.Since(start) > time.Second {
		t.Fatalf("expected fast timeout, err=%v dur=%v", err, time.Since(start))
	}
}

// =============================================================================
// RPC URL lookup
// =============================================================================

func TestRPCURLFor(t *testing.T) {
	if got := RPCURLFor("ETHEREUM_SEPOLIA"); !strings.Contains(got, "sepolia") {
		t.Errorf("ETHEREUM_SEPOLIA → %q, want a sepolia URL", got)
	}
	if got := RPCURLFor("BITCOIN_MAINNET"); !strings.Contains(got, "blockstream") {
		t.Errorf("BITCOIN_MAINNET → %q, want blockstream", got)
	}
	if got := RPCURLFor("UNKNOWN_NETWORK"); got != "" {
		t.Errorf("UNKNOWN_NETWORK → %q, want empty", got)
	}
}

func TestRPCURLOverride_TakesPrecedence(t *testing.T) {
	// Override should beat the package-level default.
	srv := ethBalanceServer(t, "0x0")
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"ETHEREUM_MAINNET": srv.URL,
	}}
	ok, err := c.Check(context.Background(), CheckParams{
		NetworkInternalName: "ETHEREUM_MAINNET",
		RequiredAmount:      0.01,
	})
	if err != nil || ok {
		t.Fatalf("expected override to route to mock; ok=%v err=%v", ok, err)
	}
}

// Smoke test for the truncate helper (used in error messages).
func TestTruncate(t *testing.T) {
	short := truncate([]byte("hi"), 10)
	if short != "hi" {
		t.Errorf("short = %q", short)
	}
	long := truncate([]byte("abcdefghijklmnop"), 5)
	if !strings.HasPrefix(long, "abcde") || !strings.HasSuffix(long, "…") {
		t.Errorf("long = %q", long)
	}
}

// Reference assertion so the unused-import linter doesn't trip if
// fmt only appears via error formatting (kept for parity with client.go).
var _ = fmt.Sprintf
