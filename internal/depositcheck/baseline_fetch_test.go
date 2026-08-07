// Tests for the three baseline-snapshot balance fetchers
// (FetchSOLLamports / FetchTONNanotons / FetchXRPDrops). These back the
// per-family baseline-snapshot fix (see architecture_mpcd_single_shared_pool
// memory / REQUIREMENTS.md G1(g)): mpcd-single's HKDF derivation gives
// the ed25519 deposit wallet and the long-lived release wallet the SAME
// address within a family, so the swap-create handler snapshots this
// balance at create time and the depositcheck delta-gates against it —
// otherwise a swap could false-positive-confirm off the release
// wallet's pre-existing liquidity. Getting the fetch itself wrong
// (wrong value, silent error swallowed the wrong way) undermines that
// whole fix, so these are worth covering as precisely as the check
// functions they feed.
package depositcheck

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestNew_ConstructsWithTimeout(t *testing.T) {
	c := New(5 * time.Second)
	if c.Timeout != 5*time.Second {
		t.Errorf("Timeout = %v, want 5s", c.Timeout)
	}
}

// =============================================================================
// FetchSOLLamports
// =============================================================================

func TestFetchSOLLamports_HappyPath(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0", "id": 1,
			"result": map[string]any{"value": 2_500_000_000},
		})
	}))
	t.Cleanup(srv.Close)
	c := New(time.Second)
	c.RPCURLOverrides = map[string]string{"SOLANA_DEVNET": srv.URL}

	lamports, err := c.FetchSOLLamports(context.Background(), "SOLANA_DEVNET", "SoLaNaAddr")
	if err != nil {
		t.Fatalf("FetchSOLLamports: %v", err)
	}
	if lamports != 2_500_000_000 {
		t.Errorf("lamports = %d, want 2500000000", lamports)
	}
}

func TestFetchSOLLamports_NeverFundedReturnsZero(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0", "id": 1,
			"result": map[string]any{"value": 0},
		})
	}))
	t.Cleanup(srv.Close)
	c := New(time.Second)
	c.RPCURLOverrides = map[string]string{"SOLANA_DEVNET": srv.URL}

	lamports, err := c.FetchSOLLamports(context.Background(), "SOLANA_DEVNET", "NeverFunded")
	if err != nil {
		t.Fatalf("FetchSOLLamports: %v", err)
	}
	if lamports != 0 {
		t.Errorf("lamports = %d, want 0", lamports)
	}
}

func TestFetchSOLLamports_RPCErrorSurfaces(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0", "id": 1,
			"error": map[string]any{"code": -32602, "message": "Invalid param: WrongSize"},
		})
	}))
	t.Cleanup(srv.Close)
	c := New(time.Second)
	c.RPCURLOverrides = map[string]string{"SOLANA_DEVNET": srv.URL}

	_, err := c.FetchSOLLamports(context.Background(), "SOLANA_DEVNET", "bogus")
	if err == nil || !strings.Contains(err.Error(), "Invalid param") {
		t.Errorf("err = %v, want it to surface the RPC error message", err)
	}
}

func TestFetchSOLLamports_UnsupportedNetworkErrors(t *testing.T) {
	c := New(time.Second)
	_, err := c.FetchSOLLamports(context.Background(), "NOT_A_REAL_NETWORK", "addr")
	if err == nil {
		t.Fatal("expected an error for an unconfigured network, got nil")
	}
}

// =============================================================================
// FetchTONNanotons
// =============================================================================

func TestFetchTONNanotons_HappyPath_StringResult(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "result": "3140000000"})
	}))
	t.Cleanup(srv.Close)
	c := New(time.Second)
	c.RPCURLOverrides = map[string]string{"TON_TESTNET": srv.URL}

	nano, err := c.FetchTONNanotons(context.Background(), "TON_TESTNET", "0QTest")
	if err != nil {
		t.Fatalf("FetchTONNanotons: %v", err)
	}
	if nano != 3_140_000_000 {
		t.Errorf("nano = %d, want 3140000000", nano)
	}
}

func TestFetchTONNanotons_HappyPath_NumericResult(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "result": 500000000})
	}))
	t.Cleanup(srv.Close)
	c := New(time.Second)
	c.RPCURLOverrides = map[string]string{"TON_TESTNET": srv.URL}

	nano, err := c.FetchTONNanotons(context.Background(), "TON_TESTNET", "0QTest")
	if err != nil {
		t.Fatalf("FetchTONNanotons: %v", err)
	}
	if nano != 500_000_000 {
		t.Errorf("nano = %d, want 500000000", nano)
	}
}

func TestFetchTONNanotons_EmptyStringResultIsZero(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "result": ""})
	}))
	t.Cleanup(srv.Close)
	c := New(time.Second)
	c.RPCURLOverrides = map[string]string{"TON_TESTNET": srv.URL}

	nano, err := c.FetchTONNanotons(context.Background(), "TON_TESTNET", "0QNeverFunded")
	if err != nil {
		t.Fatalf("FetchTONNanotons: %v", err)
	}
	if nano != 0 {
		t.Errorf("nano = %d, want 0", nano)
	}
}

func TestFetchTONNanotons_NilResultIsZero(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": false, "result": nil})
	}))
	t.Cleanup(srv.Close)
	c := New(time.Second)
	c.RPCURLOverrides = map[string]string{"TON_TESTNET": srv.URL}

	nano, err := c.FetchTONNanotons(context.Background(), "TON_TESTNET", "0QNeverFunded")
	if err != nil {
		t.Fatalf("FetchTONNanotons: %v", err)
	}
	if nano != 0 {
		t.Errorf("nano = %d, want 0", nano)
	}
}

// TestFetchTONNanotons_NegativeValueClampsToZero guards a case the code
// explicitly handles: a malformed or adversarial upstream response
// reporting a negative balance must never propagate as a huge unsigned
// wraparound value into the baseline snapshot.
func TestFetchTONNanotons_NegativeValueClampsToZero(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "result": "-5000"})
	}))
	t.Cleanup(srv.Close)
	c := New(time.Second)
	c.RPCURLOverrides = map[string]string{"TON_TESTNET": srv.URL}

	nano, err := c.FetchTONNanotons(context.Background(), "TON_TESTNET", "0QWeird")
	if err != nil {
		t.Fatalf("FetchTONNanotons: %v", err)
	}
	if nano != 0 {
		t.Errorf("nano = %d, want 0 (negative balance clamped)", nano)
	}
}

func TestFetchTONNanotons_RejectsNonTONNetwork(t *testing.T) {
	c := New(time.Second)
	_, err := c.FetchTONNanotons(context.Background(), "XRP_TESTNET", "addr")
	if err == nil || !strings.Contains(err.Error(), "non-TON network") {
		t.Errorf("err = %v, want a non-TON-network rejection", err)
	}
}

// =============================================================================
// FetchXRPDrops
// =============================================================================

func TestFetchXRPDrops_HappyPath(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"result": map[string]any{
				"account_data": map[string]any{"Balance": "7500000"},
				"status":       "success",
			},
		})
	}))
	t.Cleanup(srv.Close)
	c := New(time.Second)
	c.RPCURLOverrides = map[string]string{"XRP_TESTNET": srv.URL}

	drops, err := c.FetchXRPDrops(context.Background(), "XRP_TESTNET", "rTest")
	if err != nil {
		t.Fatalf("FetchXRPDrops: %v", err)
	}
	if drops != 7_500_000 {
		t.Errorf("drops = %d, want 7500000", drops)
	}
}

func TestFetchXRPDrops_ActNotFoundReturnsZero(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"result": map[string]any{"status": "error", "error": "actNotFound"},
		})
	}))
	t.Cleanup(srv.Close)
	c := New(time.Second)
	c.RPCURLOverrides = map[string]string{"XRP_TESTNET": srv.URL}

	drops, err := c.FetchXRPDrops(context.Background(), "XRP_TESTNET", "rNeverFunded")
	if err != nil {
		t.Fatalf("FetchXRPDrops: %v", err)
	}
	if drops != 0 {
		t.Errorf("drops = %d, want 0", drops)
	}
}

func TestFetchXRPDrops_RejectsNonXRPNetwork(t *testing.T) {
	c := New(time.Second)
	_, err := c.FetchXRPDrops(context.Background(), "TON_TESTNET", "addr")
	if err == nil || !strings.Contains(err.Error(), "non-XRP network") {
		t.Errorf("err = %v, want a non-XRP-network rejection", err)
	}
}

// A non-actNotFound XRPL error (e.g. malformed account, rate limit)
// must surface as a real error, not be silently swallowed to 0 the
// way actNotFound is -- 0 here would poison a baseline snapshot with
// a false "wallet was empty" reading instead of failing the swap
// creation outright.
func TestFetchXRPDrops_OtherErrorSurfaces(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"result": map[string]any{"status": "error", "error": "invalidParams"},
		})
	}))
	t.Cleanup(srv.Close)
	c := New(time.Second)
	c.RPCURLOverrides = map[string]string{"XRP_TESTNET": srv.URL}

	_, err := c.FetchXRPDrops(context.Background(), "XRP_TESTNET", "rTest")
	if err == nil || !strings.Contains(err.Error(), "invalidParams") {
		t.Errorf("err = %v, want it to surface the XRPL error reason", err)
	}
}

func TestFetchXRPDrops_UnparseableBalanceErrors(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"result": map[string]any{
				"account_data": map[string]any{"Balance": "not-a-number"},
				"status":       "success",
			},
		})
	}))
	t.Cleanup(srv.Close)
	c := New(time.Second)
	c.RPCURLOverrides = map[string]string{"XRP_TESTNET": srv.URL}

	_, err := c.FetchXRPDrops(context.Background(), "XRP_TESTNET", "rTest")
	if err == nil {
		t.Fatal("expected an error for an unparseable balance string, got nil")
	}
}
