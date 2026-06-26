// Tests for XRP inbound deposit detection via rippled's account_info.
// A dedicated httptest.Server mocks rippled's result-only envelope and
// asserts the request shape (method=account_info, validated ledger, a
// supplied account). RPCURLOverrides points the Client at the mock.

package depositcheck

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// xrpAccountInfoServer mocks rippled `account_info`. It asserts the
// request method + params, then replies with either a funded
// account_data.Balance (drops) or an actNotFound error envelope.
func xrpAccountInfoServer(t *testing.T, balanceDrops string, notFound bool) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			Method string `json:"method"`
			Params []struct {
				Account     string `json:"account"`
				LedgerIndex string `json:"ledger_index"`
				Strict      bool   `json:"strict"`
			} `json:"params"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "bad json", http.StatusBadRequest)
			return
		}
		if req.Method != "account_info" {
			t.Errorf("rippled method = %q, want account_info", req.Method)
		}
		if len(req.Params) != 1 || req.Params[0].Account == "" {
			t.Errorf("account_info params malformed: %+v", req.Params)
		}
		if req.Params[0].LedgerIndex != "validated" {
			t.Errorf("ledger_index = %q, want validated", req.Params[0].LedgerIndex)
		}
		if !req.Params[0].Strict {
			t.Errorf("strict must be true (address, not username)")
		}
		w.Header().Set("Content-Type", "application/json")
		if notFound {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"result": map[string]any{
					"account":       req.Params[0].Account,
					"error":         "actNotFound",
					"error_code":    19,
					"error_message": "Account not found.",
					"status":        "error",
					"validated":     true,
				},
			})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"result": map[string]any{
				"account_data": map[string]any{
					"Account": req.Params[0].Account,
					"Balance": balanceDrops,
				},
				"status":    "success",
				"validated": true,
			},
		})
	}))
	t.Cleanup(srv.Close)
	return srv
}

func xrpClient(srv *httptest.Server) *Client {
	return &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{"XRP_TESTNET": srv.URL}}
}

func xrpCheck(t *testing.T, c *Client, required float64) (bool, error) {
	t.Helper()
	return c.Check(context.Background(), CheckParams{
		NetworkInternalName: "XRP_TESTNET",
		Address:             "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
		Asset:               "XRP",
		RequiredAmount:      required,
	})
}

// 20 XRP (20_000_000 drops) satisfies a 10-XRP requirement.
func TestCheck_XRP_Confirmed(t *testing.T) {
	c := xrpClient(xrpAccountInfoServer(t, "20000000", false))
	ok, err := xrpCheck(t, c, 10)
	if err != nil || !ok {
		t.Fatalf("20 XRP vs 10 required: ok=%v err=%v", ok, err)
	}
}

// Exactly 10 XRP satisfies a 10-XRP requirement (>= boundary).
func TestCheck_XRP_ExactBoundary(t *testing.T) {
	c := xrpClient(xrpAccountInfoServer(t, "10000000", false))
	ok, err := xrpCheck(t, c, 10)
	if err != nil || !ok {
		t.Fatalf("exactly 10 XRP must satisfy 10 required: ok=%v err=%v", ok, err)
	}
}

// 5 XRP is short of a 10-XRP requirement: (false, nil) — not an error.
func TestCheck_XRP_Insufficient(t *testing.T) {
	c := xrpClient(xrpAccountInfoServer(t, "5000000", false))
	ok, err := xrpCheck(t, c, 10)
	if err != nil {
		t.Fatalf("insufficient balance must not error: %v", err)
	}
	if ok {
		t.Fatalf("5 XRP must not satisfy 10 required")
	}
}

// An unfunded account (actNotFound) is "no deposit yet" — (false, nil),
// NOT an error — for a positive requirement.
func TestCheck_XRP_NotFound_IsNoDepositNotError(t *testing.T) {
	c := xrpClient(xrpAccountInfoServer(t, "", true))
	ok, err := xrpCheck(t, c, 10)
	if err != nil {
		t.Fatalf("actNotFound must not be an error, got %v", err)
	}
	if ok {
		t.Fatalf("actNotFound (zero balance) must not satisfy 10 required")
	}
}

// A zero requirement is satisfied by any balance, including an unfunded
// (actNotFound) account.
func TestCheck_XRP_NotFound_ZeroRequired(t *testing.T) {
	c := xrpClient(xrpAccountInfoServer(t, "", true))
	ok, err := xrpCheck(t, c, 0)
	if err != nil || !ok {
		t.Fatalf("zero-required must be satisfied by any balance: ok=%v err=%v", ok, err)
	}
}

// A non-actNotFound rippled error surfaces as (false, error).
func TestCheck_XRP_RPCError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"result": map[string]any{
				"error":         "invalidParams",
				"error_message": "Missing field 'account'.",
				"status":        "error",
			},
		})
	}))
	t.Cleanup(srv.Close)
	ok, err := xrpCheck(t, xrpClient(srv), 1)
	if err == nil {
		t.Fatalf("rippled invalidParams must surface as an error")
	}
	if ok {
		t.Fatalf("error result must be false")
	}
}

// A non-decimal Balance is a decode failure, not a silent zero.
func TestCheck_XRP_MalformedBalance(t *testing.T) {
	c := xrpClient(xrpAccountInfoServer(t, "not-a-number", false))
	if _, err := xrpCheck(t, c, 1); err == nil {
		t.Fatalf("non-decimal Balance must error")
	}
}
