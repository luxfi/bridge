package broadcast

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// =============================================================================
// broadcastBTC — happy path
// =============================================================================

func TestBroadcast_BTC_Success(t *testing.T) {
	wantTxID := strings.Repeat("e08d6e97", 8) // 64 hex chars — mempool.space's txid length
	var gotMethod, gotPath, gotContentType, gotBody string

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod = r.Method
		gotPath = r.URL.Path
		gotContentType = r.Header.Get("Content-Type")
		b, _ := io.ReadAll(r.Body)
		gotBody = string(b)
		_, _ = w.Write([]byte(wantTxID))
	}))
	defer srv.Close()

	c := New(0)
	c.RPCURLOverrides = map[string]string{"BITCOIN_TESTNET": srv.URL}

	got, err := c.Broadcast(context.Background(), "BITCOIN_TESTNET", "deadbeef")
	if err != nil {
		t.Fatalf("Broadcast: %v", err)
	}
	if got.TxHash != wantTxID {
		t.Fatalf("TxHash = %q, want %q", got.TxHash, wantTxID)
	}
	if gotMethod != http.MethodPost || gotPath != "/tx" {
		t.Errorf("request = %s %s, want POST /tx", gotMethod, gotPath)
	}
	if gotContentType != "text/plain" {
		t.Errorf("Content-Type = %q, want text/plain", gotContentType)
	}
	if gotBody != "deadbeef" {
		t.Errorf("body = %q, want the raw hex verbatim", gotBody)
	}
}

// =============================================================================
// broadcastBTC — 0x-prefix stripping
// =============================================================================

// TestBroadcast_BTC_StripsZeroXPrefix confirms an 0x-prefixed input (the
// EVM/Solana convention some callers might reuse out of habit) is sent
// to mempool.space as bare hex — the upstream API rejects a 0x prefix
// as invalid transaction hex.
func TestBroadcast_BTC_StripsZeroXPrefix(t *testing.T) {
	var gotBody string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		gotBody = string(b)
		_, _ = w.Write([]byte(strings.Repeat("a", 64)))
	}))
	defer srv.Close()

	c := New(0)
	c.RPCURLOverrides = map[string]string{"BITCOIN_TESTNET": srv.URL}

	if _, err := c.Broadcast(context.Background(), "BITCOIN_TESTNET", "0xdeadbeef"); err != nil {
		t.Fatalf("Broadcast: %v", err)
	}
	if gotBody != "deadbeef" {
		t.Errorf("body = %q, want 0x prefix stripped", gotBody)
	}
}

// =============================================================================
// broadcastBTC — error paths
// =============================================================================

// A rawTx that's non-empty at the Broadcast() gate but resolves to empty
// after trimming whitespace/0x must still be rejected as ErrEmptyRawTx,
// not sent upstream as an empty POST body.
func TestBroadcast_BTC_WhitespaceOnlyRawTxRejected(t *testing.T) {
	c := New(0)
	c.RPCURLOverrides = map[string]string{"BITCOIN_TESTNET": "http://unused"}

	// "0x" alone: non-empty string reaches broadcastBTC, but strips down
	// to "" internally.
	_, err := c.Broadcast(context.Background(), "BITCOIN_TESTNET", "0x")
	if err != ErrEmptyRawTx {
		t.Fatalf("err = %v, want ErrEmptyRawTx", err)
	}
}

func TestBroadcast_BTC_NonOKStatusSurfacesBody(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte("bad-txns-inputs-missingorspent"))
	}))
	defer srv.Close()

	c := New(0)
	c.RPCURLOverrides = map[string]string{"BITCOIN_TESTNET": srv.URL}

	_, err := c.Broadcast(context.Background(), "BITCOIN_TESTNET", "deadbeef")
	if err == nil {
		t.Fatal("expected an error, got nil")
	}
	if !strings.Contains(err.Error(), "bad-txns-inputs-missingorspent") {
		t.Errorf("error %q does not surface the upstream rejection reason", err.Error())
	}
}

// A 200 response whose body isn't a bare 64-char txid (an HTML error
// page, a JSON envelope from a misconfigured proxy, etc.) must be
// rejected rather than written into the swap row as a fake tx hash —
// mempool.space's actual success contract is "txid and nothing else."
func TestBroadcast_BTC_UnexpectedResponseBodyRejected(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("<html>502 Bad Gateway</html>"))
	}))
	defer srv.Close()

	c := New(0)
	c.RPCURLOverrides = map[string]string{"BITCOIN_TESTNET": srv.URL}

	_, err := c.Broadcast(context.Background(), "BITCOIN_TESTNET", "deadbeef")
	if err == nil {
		t.Fatal("expected an error for a non-txid response body, got nil")
	}
}

func TestBroadcast_BTC_DefaultURLConfigured(t *testing.T) {
	if RPCURLFor("BITCOIN_MAINNET") == "" {
		t.Error("BITCOIN_MAINNET missing from rpcURLs map")
	}
	if RPCURLFor("BITCOIN_TESTNET") == "" {
		t.Error("BITCOIN_TESTNET missing from rpcURLs map")
	}
}
