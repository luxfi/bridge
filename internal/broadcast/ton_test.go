package broadcast

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// =============================================================================
// broadcastTON — happy path (base64 BoC, the normal wire format)
// =============================================================================

func TestBroadcast_TON_Success_Base64(t *testing.T) {
	boc := []byte{0xb5, 0xee, 0x9c, 0x72, 0x01, 0x02, 0x03}
	rawTx := base64.StdEncoding.EncodeToString(boc)
	wantDigest := sha256.Sum256(boc)
	wantTxHash := hex.EncodeToString(wantDigest[:])

	var gotPath, gotBoc string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		var req struct {
			Boc string `json:"boc"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		gotBoc = req.Boc
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"ok":     true,
			"result": map[string]any{"@type": "ok"},
		})
	}))
	defer srv.Close()

	c := New(0)
	c.RPCURLOverrides = map[string]string{"TON_TESTNET": srv.URL}

	got, err := c.Broadcast(context.Background(), "TON_TESTNET", rawTx)
	if err != nil {
		t.Fatalf("Broadcast: %v", err)
	}
	if got.TxHash != wantTxHash {
		t.Errorf("TxHash = %q, want sha256(boc) = %q", got.TxHash, wantTxHash)
	}
	if gotPath != "/sendBoc" {
		t.Errorf("path = %q, want /sendBoc", gotPath)
	}
	if gotBoc != rawTx {
		t.Errorf("request boc = %q, want %q (re-encoded round-trip)", gotBoc, rawTx)
	}
}

// TestBroadcast_TON_AcceptsHexFallback covers the lenient decode path:
// a caller that sent hex instead of base64 (e.g. for EVM/SOL-style
// consistency) must still work, keyed off the decoded bytes rather than
// the input string.
func TestBroadcast_TON_AcceptsHexFallback(t *testing.T) {
	// 3 bytes -> 6 hex chars, deliberately NOT a multiple of 4 so
	// base64.StdEncoding rejects it outright (invalid padding length)
	// and the code falls through to the hex decode. A 4-byte/8-hex-char
	// value like "deadbeef" is the wrong choice here: it happens to
	// ALSO be valid (if different) base64, so it would silently decode
	// as base64 first and never exercise the fallback this test exists
	// to cover.
	boc := []byte{0xde, 0xad, 0xbe}
	rawTx := hex.EncodeToString(boc) // NOT valid base64 — pure hex input
	wantDigest := sha256.Sum256(boc)
	wantTxHash := hex.EncodeToString(wantDigest[:])

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"ok":     true,
			"result": map[string]any{"@type": "ok"},
		})
	}))
	defer srv.Close()

	c := New(0)
	c.RPCURLOverrides = map[string]string{"TON_TESTNET": srv.URL}

	got, err := c.Broadcast(context.Background(), "TON_TESTNET", rawTx)
	if err != nil {
		t.Fatalf("Broadcast: %v", err)
	}
	if got.TxHash != wantTxHash {
		t.Errorf("TxHash = %q, want %q", got.TxHash, wantTxHash)
	}
}

func TestBroadcast_TON_RejectsUnparseableInput(t *testing.T) {
	c := New(0)
	c.RPCURLOverrides = map[string]string{"TON_TESTNET": "http://unused"}

	// Not valid base64 (bad padding/chars) AND not valid hex (odd length,
	// non-hex char) — must fail before ever making an HTTP call.
	_, err := c.Broadcast(context.Background(), "TON_TESTNET", "!!!not-base64-or-hex!!!")
	if err == nil {
		t.Fatal("expected an error for unparseable input, got nil")
	}
}

func TestBroadcast_TON_EnvelopeErrorSurfaces(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"ok":    false,
			"error": "cannot apply external message to shard",
			"code":  -32000,
		})
	}))
	defer srv.Close()

	c := New(0)
	c.RPCURLOverrides = map[string]string{"TON_TESTNET": srv.URL}

	_, err := c.Broadcast(context.Background(), "TON_TESTNET", base64.StdEncoding.EncodeToString([]byte{0x01}))
	if err == nil {
		t.Fatal("expected an error, got nil")
	}
	if !strings.Contains(err.Error(), "cannot apply external message to shard") {
		t.Errorf("error %q does not surface toncenter's rejection reason", err.Error())
	}
}

func TestBroadcast_TON_NonOKHTTPStatus(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte("rate limited"))
	}))
	defer srv.Close()

	c := New(0)
	c.RPCURLOverrides = map[string]string{"TON_TESTNET": srv.URL}

	_, err := c.Broadcast(context.Background(), "TON_TESTNET", base64.StdEncoding.EncodeToString([]byte{0x01}))
	if err == nil {
		t.Fatal("expected an error, got nil")
	}
	if !strings.Contains(err.Error(), "rate limited") {
		t.Errorf("error %q does not surface the HTTP body", err.Error())
	}
}

func TestBroadcast_TON_MalformedJSONResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte("{not valid json"))
	}))
	defer srv.Close()

	c := New(0)
	c.RPCURLOverrides = map[string]string{"TON_TESTNET": srv.URL}

	_, err := c.Broadcast(context.Background(), "TON_TESTNET", base64.StdEncoding.EncodeToString([]byte{0x01}))
	if err == nil {
		t.Fatal("expected a decode error, got nil")
	}
}

func TestBroadcast_TON_DefaultURLConfigured(t *testing.T) {
	if RPCURLFor("TON_MAINNET") == "" {
		t.Error("TON_MAINNET missing from rpcURLs map")
	}
	if RPCURLFor("TON_TESTNET") == "" {
		t.Error("TON_TESTNET missing from rpcURLs map")
	}
}
