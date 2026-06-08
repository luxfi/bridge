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
	"io"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/luxfi/bridge/internal/tokens"
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
// EVM — ERC-20 (eth_call balanceOf)
// =============================================================================

// erc20BalanceServer returns the configured balance from any
// eth_call. It records the call params so we can verify the data
// payload was assembled correctly.
type erc20BalanceServer struct {
	server    *httptest.Server
	balance   string // 0x-prefixed hex of the 32-byte balance
	lastData  string
	lastTo    string
	calls     int
}

func newERC20BalanceServer(t *testing.T, balance string) *erc20BalanceServer {
	t.Helper()
	s := &erc20BalanceServer{balance: balance}
	s.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s.calls++
		body, _ := io.ReadAll(r.Body)
		var req struct {
			Method string `json:"method"`
			Params []any  `json:"params"`
		}
		_ = json.Unmarshal(body, &req)
		if req.Method != "eth_call" {
			t.Errorf("expected eth_call, got %q", req.Method)
		}
		if len(req.Params) > 0 {
			if obj, ok := req.Params[0].(map[string]any); ok {
				s.lastTo, _ = obj["to"].(string)
				s.lastData, _ = obj["data"].(string)
			}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0", "id": 1, "result": s.balance,
		})
	}))
	t.Cleanup(s.server.Close)
	return s
}

func TestCheck_EVM_ERC20_Confirmed(t *testing.T) {
	// 100 USDC = 100 * 10^6 = 100,000,000 base units = 0x5F5E100.
	// 32-byte word: pad to 64 hex chars: 000…000005F5E100
	balance := "0x" + strings.Repeat("0", 56) + "05f5e100"
	srv := newERC20BalanceServer(t, balance)

	reg := tokens.NewRegistry()
	usdcContract := "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"
	_ = reg.Register(tokens.Info{
		Network:  "ETHEREUM_SEPOLIA",
		Asset:    "USDC",
		Contract: usdcContract,
		Decimals: 6,
	})

	c := &Client{
		Timeout:         time.Second,
		RPCURLOverrides: map[string]string{"ETHEREUM_SEPOLIA": srv.server.URL},
		Tokens:          reg,
	}
	ok, err := c.Check(context.Background(), CheckParams{
		NetworkInternalName: "ETHEREUM_SEPOLIA",
		Address:             "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
		Asset:               "USDC",
		RequiredAmount:      50,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !ok {
		t.Fatal("expected confirmed (100 USDC ≥ 50 required)")
	}

	// Verify the wire: `to` is the USDC contract, NOT the holder.
	if !strings.EqualFold(srv.lastTo, usdcContract) {
		t.Errorf("to = %q, want USDC contract %q", srv.lastTo, usdcContract)
	}
	// Data must start with the balanceOf selector (0x70a08231).
	if !strings.HasPrefix(strings.ToLower(srv.lastData), "0x70a08231") {
		t.Errorf("data should start with balanceOf selector 0x70a08231, got %s", srv.lastData)
	}
	// Padded holder address: 0x70a08231 + 12 zero bytes + holder = 68 chars hex + 2 prefix.
	if len(srv.lastData) != 2+(4+32)*2 {
		t.Errorf("data length wrong: %d", len(srv.lastData))
	}
	// Last 40 hex chars should be the holder address (lowercase).
	wantHolder := strings.ToLower("a28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473")
	if !strings.HasSuffix(strings.ToLower(srv.lastData), wantHolder) {
		t.Errorf("holder mismatch in calldata: got %s, want suffix %s", srv.lastData, wantHolder)
	}
}

func TestCheck_EVM_ERC20_Insufficient(t *testing.T) {
	// 25 USDC = 25 * 10^6 = 25,000,000 base units
	balance := "0x" + strings.Repeat("0", 56) + "017d7840"
	srv := newERC20BalanceServer(t, balance)

	reg := tokens.NewRegistry()
	_ = reg.Register(tokens.Info{Network: "ETHEREUM_SEPOLIA", Asset: "USDC", Contract: "0x1c7D", Decimals: 6})

	c := &Client{
		Timeout:         time.Second,
		RPCURLOverrides: map[string]string{"ETHEREUM_SEPOLIA": srv.server.URL},
		Tokens:          reg,
	}
	ok, err := c.Check(context.Background(), CheckParams{
		NetworkInternalName: "ETHEREUM_SEPOLIA",
		Address:             "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
		Asset:               "USDC",
		RequiredAmount:      100,
	})
	if err != nil || ok {
		t.Fatalf("expected (false, nil) for 25 USDC < 100 required; got (%v, %v)", ok, err)
	}
}

func TestCheck_EVM_ERC20_RPCError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0", "id": 1,
			"error": map[string]any{"code": -32000, "message": "execution reverted"},
		})
	}))
	t.Cleanup(srv.Close)
	reg := tokens.NewRegistry()
	_ = reg.Register(tokens.Info{Network: "ETHEREUM_SEPOLIA", Asset: "USDC", Contract: "0x1c7D", Decimals: 6})
	c := &Client{
		Timeout:         time.Second,
		RPCURLOverrides: map[string]string{"ETHEREUM_SEPOLIA": srv.URL},
		Tokens:          reg,
	}
	_, err := c.Check(context.Background(), CheckParams{
		NetworkInternalName: "ETHEREUM_SEPOLIA",
		Address:             "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
		Asset:               "USDC",
		RequiredAmount:      1,
	})
	if err == nil || !strings.Contains(err.Error(), "execution reverted") {
		t.Errorf("expected upstream error to surface, got %v", err)
	}
}

func TestCheck_EVM_NativeWithRegistry_UsesAssetDecimals(t *testing.T) {
	// Native ETH with the registry attached: should STILL use
	// eth_getBalance (Contract is empty in the registry), and the
	// asset's Decimals=18 means standard wei → ether scaling.
	srv := ethBalanceServer(t, "0xDE0B6B3A7640000") // 1 ETH
	reg := tokens.NewRegistry()
	_ = reg.Register(tokens.Info{Network: "ETHEREUM_SEPOLIA", Asset: "ETH", Decimals: 18})
	c := &Client{
		Timeout:         time.Second,
		RPCURLOverrides: map[string]string{"ETHEREUM_SEPOLIA": srv.URL},
		Tokens:          reg,
	}
	ok, err := c.Check(context.Background(), CheckParams{
		NetworkInternalName: "ETHEREUM_SEPOLIA",
		Address:             "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
		Asset:               "ETH",
		RequiredAmount:      0.5,
	})
	if err != nil || !ok {
		t.Fatalf("expected confirmed; got (%v, %v)", ok, err)
	}
}

func TestCheck_EVM_UnknownAsset_FallsBackToNative(t *testing.T) {
	// Registry has no entry for "WEIRDO" → falls back to native path
	// with 18 decimals (backward compat).
	srv := ethBalanceServer(t, "0xDE0B6B3A7640000") // 1 ETH
	reg := tokens.NewRegistry() // empty
	c := &Client{
		Timeout:         time.Second,
		RPCURLOverrides: map[string]string{"ETHEREUM_SEPOLIA": srv.URL},
		Tokens:          reg,
	}
	ok, err := c.Check(context.Background(), CheckParams{
		NetworkInternalName: "ETHEREUM_SEPOLIA",
		Address:             "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
		Asset:               "WEIRDO", // not in registry
		RequiredAmount:      0.5,
	})
	if err != nil || !ok {
		t.Fatalf("unknown asset should fall back to native path; got (%v, %v)", ok, err)
	}
}

func TestCheck_EVM_NoRegistry_BackwardCompat(t *testing.T) {
	// Client.Tokens == nil → all EVM checks use the legacy native path.
	// This proves callers who haven't migrated still get the old behavior.
	srv := ethBalanceServer(t, "0xDE0B6B3A7640000")
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{"ETHEREUM_SEPOLIA": srv.URL}}
	ok, err := c.Check(context.Background(), CheckParams{
		NetworkInternalName: "ETHEREUM_SEPOLIA",
		Asset:               "USDC", // would be ERC-20 with registry
		RequiredAmount:      0.5,
	})
	if err != nil || !ok {
		t.Fatalf("no-registry path should use native; got (%v, %v)", ok, err)
	}
}

func TestCompareBalance(t *testing.T) {
	cases := []struct {
		name     string
		bal      int64
		decimals int
		req      float64
		want     bool
	}{
		{"USDC 100 ≥ 50", 100_000_000, 6, 50, true},
		{"USDC 25 < 50", 25_000_000, 6, 50, false},
		{"1 ETH ≥ 0.5", 1_000_000_000_000_000_000, 18, 0.5, true},
		{"1 ETH ≥ 1.0", 1_000_000_000_000_000_000, 18, 1.0, true},
		{"0.1 ETH < 0.5", 100_000_000_000_000_000, 18, 0.5, false},
		{"required 0", 1, 18, 0, true},
		{"zero balance", 0, 18, 0.001, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := compareBalance(intBig(tc.bal), tc.decimals, tc.req)
			if got != tc.want {
				t.Errorf("got %v, want %v", got, tc.want)
			}
		})
	}
}

func intBig(n int64) *big.Int { return big.NewInt(n) }

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

// Baseline > 0 enforces a delta check for TON: wallet must have GAINED
// at least the required amount since the snapshot. Fixes the
// shared-wallet-pool false-positive when the deposit address already
// holds release-wallet liquidity.
func TestCheck_TON_BaselineRejectsPreExistingBalance(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 5 TON already in the wallet — would pass v1 check.
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "result": "5000000000"})
	}))
	t.Cleanup(srv.Close)
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{"TON_TESTNET": srv.URL}}
	ok, err := c.Check(context.Background(), CheckParams{
		NetworkInternalName: "TON_TESTNET",
		RequiredAmount:      1.0,
		TONBaselineNanotons: 5_000_000_000, // baseline = current → delta is 0
	})
	if err != nil {
		t.Fatal(err)
	}
	if ok {
		t.Fatal("baseline=current must reject — delta is 0, below required")
	}
}

// Baseline + a new deposit accepts: delta meets required.
func TestCheck_TON_BaselineAcceptsNewDeposit(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 5 + 0.3 TON after a deposit landed.
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "result": "5300000000"})
	}))
	t.Cleanup(srv.Close)
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{"TON_TESTNET": srv.URL}}
	ok, err := c.Check(context.Background(), CheckParams{
		NetworkInternalName: "TON_TESTNET",
		RequiredAmount:      0.3,
		TONBaselineNanotons: 5_000_000_000,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !ok {
		t.Fatal("delta 0.3 TON should clear required")
	}
}

// Underflow guard: baseline > current must not arithmetic-confirm.
func TestCheck_TON_BaselineUnderflowReturnsZero(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "result": "1000000000"})
	}))
	t.Cleanup(srv.Close)
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{"TON_TESTNET": srv.URL}}
	ok, err := c.Check(context.Background(), CheckParams{
		NetworkInternalName: "TON_TESTNET",
		RequiredAmount:      1,
		TONBaselineNanotons: 5_000_000_000, // baseline > current
	})
	if err != nil {
		t.Fatal(err)
	}
	if ok {
		t.Fatal("baseline > current must not confirm; delta should clamp to 0")
	}
}

// Regression guard: XRP fix must be unaffected by the TON additions
// (zero TON baseline + non-zero XRP baseline still routes through the
// XRP delta check, never accidentally triggers TON logic).
func TestCheck_XRP_FixUnaffectedByTONBaselineField(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"result": map[string]any{
				"account_data": map[string]any{"Balance": "100000000"},
				"status":       "success",
			},
		})
	}))
	t.Cleanup(srv.Close)
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{"XRP_TESTNET": srv.URL}}
	ok, err := c.Check(context.Background(), CheckParams{
		NetworkInternalName: "XRP_TESTNET",
		RequiredAmount:      1.5,
		XRPBaselineDrops:    100_000_000, // baseline = current → delta is 0
		TONBaselineNanotons: 99_999,      // unrelated TON field — must be ignored
	})
	if err != nil {
		t.Fatal(err)
	}
	if ok {
		t.Fatal("XRP delta check must still reject; TON field must not interfere")
	}
}

// =============================================================================
// SOL baseline tests (mirror XRP/TON — surfaced live 2026-06-08 via a
// deliberate no-deposit SOL→LUX swap that auto-completed and paid LUX
// to the user without any SOL having been sent).
// =============================================================================

// Baseline = current SOL balance: the wallet-pool collision scenario
// where the per-swap deposit wallet's pubkey equals the long-lived
// release-wallet pubkey. Without the fix this auto-confirmed.
func TestCheck_SOL_BaselineRejectsPreExistingBalance(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 5 SOL already in the wallet (5e9 lamports).
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0",
			"id":      1,
			"result":  map[string]any{"value": 5_000_000_000},
		})
	}))
	t.Cleanup(srv.Close)
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{"SOLANA_DEVNET": srv.URL}}
	ok, err := c.Check(context.Background(), CheckParams{
		NetworkInternalName: "SOLANA_DEVNET",
		RequiredAmount:      0.01,
		SOLBaselineLamports: 5_000_000_000, // baseline = current → delta is 0
	})
	if err != nil {
		t.Fatal(err)
	}
	if ok {
		t.Fatal("baseline=current must reject — delta is 0, below required")
	}
}

// Baseline + a new deposit accepts: delta meets required.
func TestCheck_SOL_BaselineAcceptsNewDeposit(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 5 + 0.01 SOL after a deposit landed.
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0",
			"id":      1,
			"result":  map[string]any{"value": 5_010_000_000},
		})
	}))
	t.Cleanup(srv.Close)
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{"SOLANA_DEVNET": srv.URL}}
	ok, err := c.Check(context.Background(), CheckParams{
		NetworkInternalName: "SOLANA_DEVNET",
		RequiredAmount:      0.01,
		SOLBaselineLamports: 5_000_000_000,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !ok {
		t.Fatal("delta 0.01 SOL should clear required")
	}
}

// Underflow guard: baseline > current must not arithmetic-confirm.
func TestCheck_SOL_BaselineUnderflowReturnsZero(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0",
			"id":      1,
			"result":  map[string]any{"value": 1_000_000_000},
		})
	}))
	t.Cleanup(srv.Close)
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{"SOLANA_DEVNET": srv.URL}}
	ok, err := c.Check(context.Background(), CheckParams{
		NetworkInternalName: "SOLANA_DEVNET",
		RequiredAmount:      0.5,
		SOLBaselineLamports: 5_000_000_000, // baseline > current
	})
	if err != nil {
		t.Fatal(err)
	}
	if ok {
		t.Fatal("baseline > current must not confirm; delta should clamp to 0")
	}
}

// Regression guard: XRP/TON fixes must be unaffected by the SOL
// additions. Zero SOL baseline + non-zero XRP baseline still routes
// through the XRP delta check; the new SOL field must not interfere.
func TestCheck_XRP_FixUnaffectedBySOLBaselineField(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"result": map[string]any{
				"account_data": map[string]any{"Balance": "100000000"},
				"status":       "success",
			},
		})
	}))
	t.Cleanup(srv.Close)
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{"XRP_TESTNET": srv.URL}}
	ok, err := c.Check(context.Background(), CheckParams{
		NetworkInternalName: "XRP_TESTNET",
		RequiredAmount:      1.5,
		XRPBaselineDrops:    100_000_000, // baseline = current → delta is 0
		SOLBaselineLamports: 999_999,     // unrelated SOL field — must be ignored
	})
	if err != nil {
		t.Fatal(err)
	}
	if ok {
		t.Fatal("XRP delta check must still reject; SOL field must not interfere")
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
