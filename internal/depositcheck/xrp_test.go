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

// 5_000_000 drops = 5 XRP — meets a 4.5 XRP required amount.
func TestCheck_XRP_Confirmed(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req map[string]any
		_ = json.NewDecoder(r.Body).Decode(&req)
		if req["method"] != "account_info" {
			t.Fatalf("method: got %v want account_info", req["method"])
		}
		params := req["params"].([]any)
		inner := params[0].(map[string]any)
		if inner["account"] != "rDR3ovFUFWw8ojQaXBDBQCQS5eLrZxJuRX" {
			t.Fatalf("account: got %v", inner["account"])
		}
		if inner["ledger_index"] != "validated" {
			t.Fatalf("ledger_index: got %v want validated", inner["ledger_index"])
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"result": map[string]any{
				"account_data": map[string]any{
					"Balance":  "5000000",
					"Sequence": 1,
				},
				"status": "success",
			},
		})
	}))
	t.Cleanup(srv.Close)

	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"XRP_TESTNET": srv.URL,
	}}
	ok, err := c.Check(context.Background(), CheckParams{
		NetworkInternalName: "XRP_TESTNET",
		Address:             "rDR3ovFUFWw8ojQaXBDBQCQS5eLrZxJuRX",
		Asset:               "XRP",
		RequiredAmount:      4.5,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !ok {
		t.Fatal("expected confirmed: 5 XRP >= 4.5")
	}
}

// 1_000_000 drops = 1 XRP — does NOT meet 1.5 XRP required.
func TestCheck_XRP_BelowRequired(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"result": map[string]any{
				"account_data": map[string]any{"Balance": "1000000"},
				"status":       "success",
			},
		})
	}))
	t.Cleanup(srv.Close)

	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"XRP_TESTNET": srv.URL,
	}}
	ok, err := c.Check(context.Background(), CheckParams{
		NetworkInternalName: "XRP_TESTNET",
		Address:             "rDR3",
		RequiredAmount:      1.5,
	})
	if err != nil {
		t.Fatal(err)
	}
	if ok {
		t.Fatal("expected NOT confirmed: 1 XRP < 1.5")
	}
}

// XRPL returns "actNotFound" for unfunded accounts; we treat that as
// zero balance (no error) so the watcher can keep polling while the
// user funds the deposit address.
func TestCheck_XRP_ActNotFoundIsZeroBalance(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"result": map[string]any{
				"status":        "error",
				"error":         "actNotFound",
				"error_message": "Account not found.",
			},
		})
	}))
	t.Cleanup(srv.Close)

	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"XRP_TESTNET": srv.URL,
	}}
	ok, err := c.Check(context.Background(), CheckParams{
		NetworkInternalName: "XRP_TESTNET",
		RequiredAmount:      1,
	})
	if err != nil {
		t.Fatalf("actNotFound should not error: %v", err)
	}
	if ok {
		t.Fatal("actNotFound with required > 0 should be NOT confirmed")
	}
	// Zero required → actNotFound should pass.
	ok, err = c.Check(context.Background(), CheckParams{
		NetworkInternalName: "XRP_TESTNET",
		RequiredAmount:      0,
	})
	if err != nil || !ok {
		t.Fatalf("actNotFound with required=0 should be confirmed: ok=%v err=%v", ok, err)
	}
}

// Non-actNotFound errors must surface as real errors.
func TestCheck_XRP_OtherErrorSurfaces(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"result": map[string]any{
				"status":        "error",
				"error":         "badServer",
				"error_message": "Server unavailable",
			},
		})
	}))
	t.Cleanup(srv.Close)

	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"XRP_TESTNET": srv.URL,
	}}
	_, err := c.Check(context.Background(), CheckParams{
		NetworkInternalName: "XRP_TESTNET",
		RequiredAmount:      1,
	})
	if err == nil || !strings.Contains(err.Error(), "badServer") {
		t.Fatalf("expected badServer error, got %v", err)
	}
}

// Baseline > 0 enforces a delta check: wallet must have GAINED at
// least requiredAmount drops since the snapshot, not just hold them.
// Fixes the shared-wallet-pool false-positive where the deposit
// address already holds release-wallet liquidity.
func TestCheck_XRP_BaselineRejectsPreExistingBalance(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 100 XRP already in the wallet — would pass the v1 check.
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
	})
	if err != nil {
		t.Fatal(err)
	}
	if ok {
		t.Fatal("baseline=current must reject — delta is 0, well below the 1.5 XRP required")
	}
}

// Baseline + an actual incoming deposit passes: delta meets required.
func TestCheck_XRP_BaselineAcceptsNewDeposit(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 100 + 2 XRP after a deposit landed.
		_ = json.NewEncoder(w).Encode(map[string]any{
			"result": map[string]any{
				"account_data": map[string]any{"Balance": "102000000"},
				"status":       "success",
			},
		})
	}))
	t.Cleanup(srv.Close)
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{"XRP_TESTNET": srv.URL}}
	ok, err := c.Check(context.Background(), CheckParams{
		NetworkInternalName: "XRP_TESTNET",
		RequiredAmount:      1.5,
		XRPBaselineDrops:    100_000_000,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !ok {
		t.Fatal("delta 2.0 XRP should clear the 1.5 XRP required")
	}
}

// Underflow guard: baseline > current must not arithmetic-confirm.
func TestCheck_XRP_BaselineUnderflowReturnsZero(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"result": map[string]any{
				"account_data": map[string]any{"Balance": "50000000"},
				"status":       "success",
			},
		})
	}))
	t.Cleanup(srv.Close)
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{"XRP_TESTNET": srv.URL}}
	ok, err := c.Check(context.Background(), CheckParams{
		NetworkInternalName: "XRP_TESTNET",
		RequiredAmount:      1.5,
		XRPBaselineDrops:    100_000_000, // higher than current — wallet was DEBITED
	})
	if err != nil {
		t.Fatal(err)
	}
	if ok {
		t.Fatal("baseline > current must not confirm; delta should clamp to 0")
	}
}

// XRP URLs must be in the default rpcURLs table.
func TestCheck_XRP_DefaultURLConfigured(t *testing.T) {
	if RPCURLFor("XRP_MAINNET") == "" {
		t.Error("XRP_MAINNET missing from rpcURLs map")
	}
	if RPCURLFor("XRP_TESTNET") == "" {
		t.Error("XRP_TESTNET missing from rpcURLs map")
	}
}
