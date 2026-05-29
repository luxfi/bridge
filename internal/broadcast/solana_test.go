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

// =============================================================================
// broadcastSolana — happy path
// =============================================================================

func TestBroadcast_Solana_Success(t *testing.T) {
	const wantSig = "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW"

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req map[string]any
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("server decode: %v", err)
		}
		if req["method"] != "sendTransaction" {
			t.Fatalf("method: got %v want sendTransaction", req["method"])
		}
		params := req["params"].([]any)
		// Param 0 is the base58-encoded raw tx; param 1 is the
		// options object with encoding=base58.
		if params[0].(string) != "abcDEFghi" {
			t.Fatalf("tx bytes: got %v want abcDEFghi", params[0])
		}
		opts := params[1].(map[string]any)
		if opts["encoding"] != "base58" {
			t.Fatalf("encoding: got %v want base58", opts["encoding"])
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0",
			"id":      req["id"],
			"result":  wantSig,
		})
	}))
	defer srv.Close()

	c := New(0)
	c.RPCURLOverrides = map[string]string{"SOLANA_MAINNET": srv.URL}

	got, err := c.Broadcast(context.Background(), "SOLANA_MAINNET", "abcDEFghi")
	if err != nil {
		t.Fatalf("Broadcast: %v", err)
	}
	if got.TxHash != wantSig {
		t.Fatalf("TxHash = %q want %q", got.TxHash, wantSig)
	}
}

// =============================================================================
// broadcastSolana — insufficient-funds error message propagates
// =============================================================================

func TestBroadcast_Solana_InsufficientFunds(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0",
			"error": map[string]any{
				"code":    -32002,
				"message": "Transaction simulation failed: Attempt to debit an account but found no record of a prior credit.",
			},
		})
	}))
	defer srv.Close()

	c := New(0)
	c.RPCURLOverrides = map[string]string{"SOLANA_DEVNET": srv.URL}

	_, err := c.Broadcast(context.Background(), "SOLANA_DEVNET", "tx")
	if err == nil {
		t.Fatal("expected error")
	}
	var rpc *RPCError
	if !errors.As(err, &rpc) {
		t.Fatalf("expected *RPCError, got %T: %v", err, err)
	}
	if rpc.Code != -32002 {
		t.Fatalf("code = %d want -32002", rpc.Code)
	}
	// The operator-facing message must mention the actionable cause.
	// "Attempt to debit ... no record of a prior credit" is Solana's
	// canonical text for an unfunded fee payer.
	if !strings.Contains(rpc.Message, "no record of a prior credit") {
		t.Fatalf("message should propagate verbatim: %q", rpc.Message)
	}
}

// =============================================================================
// Other Solana network names dispatch the same way
// =============================================================================

func TestBroadcast_Solana_DispatchesByFamily(t *testing.T) {
	cases := []string{"SOLANA_MAINNET", "SOLANA_DEVNET", "SOLANA_TESTNET"}
	for _, net := range cases {
		t.Run(net, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				_ = json.NewEncoder(w).Encode(map[string]any{
					"jsonrpc": "2.0",
					"result":  "sig123",
				})
			}))
			defer srv.Close()

			c := New(0)
			c.RPCURLOverrides = map[string]string{net: srv.URL}

			got, err := c.Broadcast(context.Background(), net, "tx")
			if err != nil {
				t.Fatalf("Broadcast: %v", err)
			}
			if got.TxHash != "sig123" {
				t.Fatalf("TxHash = %q want sig123", got.TxHash)
			}
		})
	}
}

// =============================================================================
// Solana mainnet has a default URL — no override needed for the
// dispatch to find SOLANA_MAINNET. Confirms the table addition is
// in place (regression guard for someone deleting the entry).
// =============================================================================

func TestBroadcast_Solana_DefaultURLConfigured(t *testing.T) {
	if RPCURLFor("SOLANA_MAINNET") == "" {
		t.Error("SOLANA_MAINNET missing from rpcURLs map")
	}
	if RPCURLFor("SOLANA_DEVNET") == "" {
		t.Error("SOLANA_DEVNET missing from rpcURLs map")
	}
	if RPCURLFor("SOLANA_TESTNET") == "" {
		t.Error("SOLANA_TESTNET missing from rpcURLs map")
	}
}
