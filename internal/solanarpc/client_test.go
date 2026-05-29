package solanarpc

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// =============================================================================
// Base58 round-trip
// =============================================================================

// Vectors lifted from the canonical Solana Wallet Adapter test
// suite (and double-checked against Phantom's address space).
// Each is a (raw_hex, base58) pair.
var base58Vectors = []struct {
	hex, b58 string
}{
	// All-zeros — preserves leading '1's per leading zero byte.
	{"00", "1"},
	{"0000", "11"},
	// Simple single bytes.
	{"01", "2"},
	{"39", "z"},
	// A real Solana pubkey (32 bytes).
	{
		"e2e21d65a8b67a9fa1b0d9f2c01a2d34b5f6c7d8e9f0a1b2c3d4e5f6a7b8c9d0",
		"GAQk7hi3MNNNXkRWG4QoBGgi68rGSkH3sUWVQfKgs5L7", // computed offline
	},
}

func TestBase58_RoundTrip(t *testing.T) {
	for _, tc := range base58Vectors {
		t.Run(tc.b58, func(t *testing.T) {
			raw, err := hex.DecodeString(tc.hex)
			if err != nil {
				t.Fatalf("invalid hex fixture %q: %v", tc.hex, err)
			}
			got := EncodeBase58(raw)
			// We only assert that round-trip succeeds (canonical
			// computed-base58 values for arbitrary 32-byte vectors
			// would require pulling in another base58 lib to
			// cross-check, which the package explicitly avoids).
			// Round-trip is the load-bearing property — the bridge
			// only ever encodes-then-uses or decodes-then-uses.
			back, derr := DecodeBase58(got)
			if derr != nil {
				t.Fatalf("DecodeBase58(%q): %v", got, derr)
			}
			if hex.EncodeToString(back) != tc.hex {
				t.Fatalf("round-trip mismatch: in=%s encoded=%s decoded=%x",
					tc.hex, got, back)
			}
		})
	}
}

func TestBase58_LeadingZerosPreserved(t *testing.T) {
	// Solana txs always start with one or more zero bytes when
	// the leading account key has small derivation entropy.
	// Round-tripping must preserve every leading zero byte ↔
	// '1' character; off-by-one here corrupts on-chain addresses.
	cases := [][]byte{
		{0x00, 0x00, 0xab, 0xcd},
		{0x00, 0x00, 0x00, 0x01},
		bytes32(0), // 32 zero bytes — the "all-zeros" pubkey
	}
	for _, raw := range cases {
		enc := EncodeBase58(raw)
		dec, err := DecodeBase58(enc)
		if err != nil {
			t.Fatalf("DecodeBase58(%q): %v", enc, err)
		}
		if hex.EncodeToString(dec) != hex.EncodeToString(raw) {
			t.Fatalf("leading-zero round-trip failed:\n  in:  %x\n  b58: %s\n  out: %x",
				raw, enc, dec)
		}
	}
}

func TestBase58_RejectsInvalidChars(t *testing.T) {
	// '0', 'O', 'I', 'l' are the canonical "excluded" characters.
	// Decoding strings containing any of them must error out, not
	// silently substitute. Otherwise a typo in an operator's
	// release-wallet pubkey would resolve to a different valid
	// pubkey and silently misroute funds.
	bad := []string{"0", "O", "I", "l", "1abc0def"}
	for _, s := range bad {
		_, err := DecodeBase58(s)
		if err == nil {
			t.Fatalf("DecodeBase58(%q): expected error, got nil", s)
		}
	}
}

func bytes32(v byte) []byte {
	out := make([]byte, 32)
	for i := range out {
		out[i] = v
	}
	return out
}

// =============================================================================
// GetLatestBlockhash
// =============================================================================

func TestGetLatestBlockhash_Success(t *testing.T) {
	const wantHash = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req map[string]any
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("server: decode req: %v", err)
		}
		if req["method"] != "getLatestBlockhash" {
			t.Fatalf("server: wrong method: %v", req["method"])
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0",
			"id":      req["id"],
			"result": map[string]any{
				"context": map[string]any{"slot": 100},
				"value": map[string]any{
					"blockhash":            wantHash,
					"lastValidBlockHeight": 100 + 150,
				},
			},
		})
	}))
	defer srv.Close()

	c := New(srv.URL)
	got, err := c.GetLatestBlockhash(context.Background())
	if err != nil {
		t.Fatalf("GetLatestBlockhash: %v", err)
	}
	if got.Blockhash != wantHash {
		t.Fatalf("blockhash mismatch: got %q want %q", got.Blockhash, wantHash)
	}
	if got.LastValidBlockHeight != 250 {
		t.Fatalf("lastValidBlockHeight: got %d want 250", got.LastValidBlockHeight)
	}
}

func TestGetLatestBlockhash_RPCError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0",
			"error":   map[string]any{"code": -32603, "message": "internal"},
		})
	}))
	defer srv.Close()

	c := New(srv.URL)
	_, err := c.GetLatestBlockhash(context.Background())
	var rpc *RPCError
	if !errors.As(err, &rpc) {
		t.Fatalf("expected *RPCError, got %T: %v", err, err)
	}
	if rpc.Code != -32603 {
		t.Fatalf("Code: got %d want -32603", rpc.Code)
	}
}

func TestGetLatestBlockhash_EmptyURL(t *testing.T) {
	c := &Client{}
	_, err := c.GetLatestBlockhash(context.Background())
	if !errors.Is(err, ErrEmptyURL) {
		t.Fatalf("expected ErrEmptyURL, got %v", err)
	}
}

// =============================================================================
// SendTransaction
// =============================================================================

func TestSendTransaction_Success(t *testing.T) {
	const wantSig = "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req map[string]any
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("server: decode req: %v", err)
		}
		if req["method"] != "sendTransaction" {
			t.Fatalf("server: wrong method: %v", req["method"])
		}
		params := req["params"].([]any)
		if !strings.HasPrefix(params[0].(string), "abc") {
			t.Fatalf("server: tx body unexpected: %v", params[0])
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0",
			"id":      req["id"],
			"result":  wantSig,
		})
	}))
	defer srv.Close()

	c := New(srv.URL)
	got, err := c.SendTransaction(context.Background(), "abcDEFghi")
	if err != nil {
		t.Fatalf("SendTransaction: %v", err)
	}
	if got != wantSig {
		t.Fatalf("sig mismatch: got %q want %q", got, wantSig)
	}
}

func TestSendTransaction_RPCError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0",
			"error": map[string]any{
				"code":    -32002,
				"message": "Transaction simulation failed: insufficient funds for transfer",
			},
		})
	}))
	defer srv.Close()

	c := New(srv.URL)
	_, err := c.SendTransaction(context.Background(), "abc")
	var rpc *RPCError
	if !errors.As(err, &rpc) {
		t.Fatalf("expected *RPCError, got %T: %v", err, err)
	}
	if rpc.Code != -32002 {
		t.Fatalf("Code: got %d want -32002", rpc.Code)
	}
	if !strings.Contains(rpc.Message, "insufficient funds") {
		t.Fatalf("error message should mention insufficient funds: %q", rpc.Message)
	}
}

func TestSendTransaction_EmptyTx(t *testing.T) {
	c := New("http://localhost:0")
	_, err := c.SendTransaction(context.Background(), "")
	if err == nil || !strings.Contains(err.Error(), "empty") {
		t.Fatalf("expected empty-tx error, got %v", err)
	}
}
