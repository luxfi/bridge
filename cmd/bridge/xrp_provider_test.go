package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// xrp_provider_test.go: XRPProviderClient HTTP behaviour against a
// rippled-style stub server. Covers account_info, fee, and the
// activation/error paths.

// rippledStub serves canonical rippled-shape replies for the methods
// the provider calls.
type rippledStub struct {
	server   *httptest.Server
	handler  func(method string, params []map[string]interface{}) interface{}
	calls    int
}

func newRippledStub(t *testing.T, handler func(method string, params []map[string]interface{}) interface{}) *rippledStub {
	t.Helper()
	s := &rippledStub{handler: handler}
	s.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s.calls++
		var req struct {
			Method string                   `json:"method"`
			Params []map[string]interface{} `json:"params"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		resp := s.handler(req.Method, req.Params)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	t.Cleanup(s.server.Close)
	return s
}

func TestXRPProvider_AccountInfo(t *testing.T) {
	stub := newRippledStub(t, func(method string, _ []map[string]interface{}) interface{} {
		if method != "account_info" {
			t.Errorf("unexpected method %q", method)
		}
		return map[string]any{
			"result": map[string]any{
				"account_data": map[string]any{
					"Account":  "rTest",
					"Balance":  "100000000",
					"Sequence": 7,
				},
				"validated_ledger_index": 999_999,
				"status":                 "success",
			},
		}
	})
	c := NewXRPProvider(map[string]string{"XRP_TESTNET": stub.server.URL}, time.Second)
	seq, ledger, err := c.AccountInfo(context.Background(), "XRP_TESTNET", "rTest")
	if err != nil {
		t.Fatal(err)
	}
	if seq != 7 {
		t.Errorf("Sequence = %d, want 7", seq)
	}
	if ledger != 999_999 {
		t.Errorf("ledger = %d, want 999999", ledger)
	}
}

func TestXRPProvider_AccountInfo_RippledError(t *testing.T) {
	stub := newRippledStub(t, func(string, []map[string]interface{}) interface{} {
		return map[string]any{
			"result": map[string]any{
				"error":         "actMalformed",
				"error_message": "malformed account",
				"status":        "error",
			},
		}
	})
	c := NewXRPProvider(map[string]string{"XRP_TESTNET": stub.server.URL}, time.Second)
	if _, _, err := c.AccountInfo(context.Background(), "XRP_TESTNET", "rBad"); err == nil {
		t.Error("expected error from rippled actMalformed")
	}
}

func TestXRPProvider_SuggestFeeDrops(t *testing.T) {
	stub := newRippledStub(t, func(_ string, _ []map[string]interface{}) interface{} {
		return map[string]any{
			"result": map[string]any{
				"drops": map[string]any{
					"open_ledger_fee": "15",
					"median_fee":      "10",
					"minimum_fee":     "10",
					"base_fee":        "10",
				},
				"status": "success",
			},
		}
	})
	c := NewXRPProvider(map[string]string{"XRP_TESTNET": stub.server.URL}, time.Second)
	fee, err := c.SuggestFeeDrops(context.Background(), "XRP_TESTNET")
	if err != nil {
		t.Fatal(err)
	}
	if fee != 15 {
		t.Errorf("fee = %d, want 15 (open_ledger_fee)", fee)
	}
}

func TestXRPProvider_SuggestFeeDrops_FallsBackOnEmptyDrops(t *testing.T) {
	stub := newRippledStub(t, func(_ string, _ []map[string]interface{}) interface{} {
		return map[string]any{
			"result": map[string]any{
				"drops":  map[string]any{}, // empty
				"status": "success",
			},
		}
	})
	c := NewXRPProvider(map[string]string{"XRP_TESTNET": stub.server.URL}, time.Second)
	fee, err := c.SuggestFeeDrops(context.Background(), "XRP_TESTNET")
	if err != nil {
		t.Fatal(err)
	}
	if fee != 10 { // XRPLBaseFeeDrops
		t.Errorf("fee = %d, want base 10 drops", fee)
	}
}

func TestXRPProvider_AccountBalanceDrops_ActivatedAccount(t *testing.T) {
	stub := newRippledStub(t, func(_ string, _ []map[string]interface{}) interface{} {
		return map[string]any{
			"result": map[string]any{
				"account_data": map[string]any{
					"Account":  "rTest",
					"Balance":  "20000000",
					"Sequence": 5,
				},
				"validated_ledger_index": 100,
				"status":                 "success",
			},
		}
	})
	c := NewXRPProvider(map[string]string{"XRP_TESTNET": stub.server.URL}, time.Second)
	bal, err := c.AccountBalanceDrops(context.Background(), "XRP_TESTNET", "rTest")
	if err != nil {
		t.Fatal(err)
	}
	if bal != 20_000_000 {
		t.Errorf("balance = %d, want 20000000", bal)
	}
}

func TestXRPProvider_AccountBalanceDrops_ActNotFoundReturnsZero(t *testing.T) {
	stub := newRippledStub(t, func(_ string, _ []map[string]interface{}) interface{} {
		return map[string]any{
			"result": map[string]any{
				"error":         "actNotFound",
				"error_message": "Account not found",
				"status":        "error",
			},
		}
	})
	c := NewXRPProvider(map[string]string{"XRP_TESTNET": stub.server.URL}, time.Second)
	bal, err := c.AccountBalanceDrops(context.Background(), "XRP_TESTNET", "rUnactivated")
	if err != nil {
		t.Fatalf("actNotFound should NOT be a fatal error; got %v", err)
	}
	if bal != 0 {
		t.Errorf("balance = %d, want 0 for unactivated", bal)
	}
}

func TestXRPProvider_NoURL_ReturnsErr(t *testing.T) {
	c := NewXRPProvider(map[string]string{}, time.Second)
	if _, _, err := c.AccountInfo(context.Background(), "XRP_MARS", "rWhatever"); err == nil {
		t.Error("expected error when network has no RPC URL")
	}
}
