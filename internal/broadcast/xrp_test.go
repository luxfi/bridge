package broadcast

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// XRPL submit happy path: tesSUCCESS + a tx_json.hash.
func TestBroadcast_XRP_Success(t *testing.T) {
	const wantHash = "E08D6E9754025BA2534A78707605E0601F03ACE063687A0CA1BDDACFCD1698C7"

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req map[string]any
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("server decode: %v", err)
		}
		if req["method"] != "submit" {
			t.Fatalf("method: got %v want submit", req["method"])
		}
		// params is a list with a single object containing tx_blob.
		params := req["params"].([]any)
		if len(params) != 1 {
			t.Fatalf("params len: got %d want 1", len(params))
		}
		inner := params[0].(map[string]any)
		if inner["tx_blob"] != "DEADBEEF" {
			t.Fatalf("tx_blob: got %v want DEADBEEF", inner["tx_blob"])
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"result": map[string]any{
				"engine_result":         "tesSUCCESS",
				"engine_result_code":    0,
				"engine_result_message": "The transaction was applied.",
				"tx_json":               map[string]any{"hash": wantHash},
				"status":                "success",
			},
		})
	}))
	defer srv.Close()

	c := New(0)
	c.RPCURLOverrides = map[string]string{"XRP_TESTNET": srv.URL}

	got, err := c.Broadcast(context.Background(), "XRP_TESTNET", "DEADBEEF")
	if err != nil {
		t.Fatalf("Broadcast: %v", err)
	}
	if got.TxHash != wantHash {
		t.Fatalf("TxHash = %q want %q", got.TxHash, wantHash)
	}
}

// Non-"tes" engine results must surface as RPCError so the broadcast
// driver doesn't mark a failed tx as successful.
func TestBroadcast_XRP_TecResultIsFailure(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"result": map[string]any{
				"engine_result":         "tecUNFUNDED_PAYMENT",
				"engine_result_code":    104,
				"engine_result_message": "Insufficient XRP balance to send.",
				"tx_json":               map[string]any{"hash": "ABCDEF"},
				"status":                "success",
			},
		})
	}))
	defer srv.Close()

	c := New(0)
	c.RPCURLOverrides = map[string]string{"XRP_TESTNET": srv.URL}

	_, err := c.Broadcast(context.Background(), "XRP_TESTNET", "AA")
	if err == nil {
		t.Fatal("expected error for tecUNFUNDED_PAYMENT")
	}
	var rpc *RPCError
	if !errors.As(err, &rpc) {
		t.Fatalf("expected *RPCError, got %T: %v", err, err)
	}
	if !strings.Contains(rpc.Message, "tecUNFUNDED_PAYMENT") {
		t.Errorf("message should mention engine_result; got %q", rpc.Message)
	}
}

func TestBroadcast_XRP_EmptyBlobRejected(t *testing.T) {
	c := New(0)
	c.RPCURLOverrides = map[string]string{"XRP_TESTNET": "http://does-not-matter"}
	_, err := c.Broadcast(context.Background(), "XRP_TESTNET", "")
	if !errors.Is(err, ErrEmptyRawTx) {
		t.Fatalf("expected ErrEmptyRawTx, got %v", err)
	}
}

// XRP_MAINNET / XRP_TESTNET must be in the rpcURLs table so dispatch
// finds them without overrides. Regression guard for someone deleting
// the entries.
func TestBroadcast_XRP_DefaultURLConfigured(t *testing.T) {
	if RPCURLFor("XRP_MAINNET") == "" {
		t.Error("XRP_MAINNET missing from rpcURLs map")
	}
	if RPCURLFor("XRP_TESTNET") == "" {
		t.Error("XRP_TESTNET missing from rpcURLs map")
	}
}
