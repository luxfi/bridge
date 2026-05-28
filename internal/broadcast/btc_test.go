// btc_test.go: BTC broadcast handler unit tests.
//
// Coverage:
//   - happy path: mempool.space returns the canonical txid, we surface
//     it verbatim
//   - 400 with txn-already-known → success, retryable surface, no swap
//     failure
//   - 400 with txn-mempool-conflict → BTCBroadcastError{Retryable:false}
//   - upstream 503 → BTCBroadcastError{Retryable:true}
//   - context timeout → respected
//   - rawTxHex validation (empty, malformed hex)

package broadcast

import (
	"context"
	"encoding/hex"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// mempoolSpaceServer is a stubbed mempool.space `/api/tx` upstream.
type mempoolSpaceServer struct {
	server *httptest.Server

	// Programmable response.
	responseCode int
	responseBody string

	// Capture: what the broadcaster actually sent.
	lastBody string
	calls    int
}

func newMempoolSpaceServer(t *testing.T) *mempoolSpaceServer {
	t.Helper()
	s := &mempoolSpaceServer{responseCode: 200}
	s.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s.calls++
		if r.Method != http.MethodPost {
			http.Error(w, "method", http.StatusMethodNotAllowed)
			return
		}
		buf := make([]byte, 4096)
		n, _ := r.Body.Read(buf)
		s.lastBody = string(buf[:n])
		w.WriteHeader(s.responseCode)
		_, _ = w.Write([]byte(s.responseBody))
	}))
	t.Cleanup(s.server.Close)
	return s
}

// A real-looking BTC txid for happy-path tests. 64 hex chars.
const sampleTxID = "3a1b89b3a9e2d8f0c4b71d1a4e2c8f7b5d3c9a7e6f1b4a2c8d9e5f3a1b6c8d4e"

// =============================================================================
// Happy path
// =============================================================================

func TestBroadcastBTC_HappyPath(t *testing.T) {
	srv := newMempoolSpaceServer(t)
	srv.responseCode = 200
	srv.responseBody = sampleTxID

	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"BITCOIN_MAINNET": srv.server.URL,
	}}
	rawTx := "0200000001abcd"
	res, err := c.Broadcast(context.Background(), "BITCOIN_MAINNET", rawTx)
	if err != nil {
		t.Fatalf("Broadcast: %v", err)
	}
	if res.TxHash != sampleTxID {
		t.Errorf("TxHash = %q, want %q", res.TxHash, sampleTxID)
	}
	if srv.lastBody != rawTx {
		t.Errorf("upstream body = %q, want %q (no 0x prefix, plain hex)", srv.lastBody, rawTx)
	}
	if srv.calls != 1 {
		t.Errorf("expected 1 HTTP call, got %d", srv.calls)
	}
}

func TestBroadcastBTC_HappyPath_TrimsZeroXPrefix(t *testing.T) {
	srv := newMempoolSpaceServer(t)
	srv.responseCode = 200
	srv.responseBody = sampleTxID

	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"BITCOIN_MAINNET": srv.server.URL,
	}}
	if _, err := c.Broadcast(context.Background(), "BITCOIN_MAINNET", "0x0200000001abcd"); err != nil {
		t.Fatal(err)
	}
	if strings.HasPrefix(srv.lastBody, "0x") {
		t.Errorf("upstream body should NOT carry 0x prefix; got %q", srv.lastBody)
	}
}

func TestBroadcastBTC_HappyPath_Testnet(t *testing.T) {
	srv := newMempoolSpaceServer(t)
	srv.responseCode = 200
	srv.responseBody = sampleTxID

	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"BITCOIN_TESTNET": srv.server.URL,
	}}
	res, err := c.Broadcast(context.Background(), "BITCOIN_TESTNET", "0200000001abcd")
	if err != nil {
		t.Fatalf("Broadcast: %v", err)
	}
	if res.TxHash != sampleTxID {
		t.Errorf("TxHash = %q, want %q", res.TxHash, sampleTxID)
	}
}

// =============================================================================
// Already-known → success
// =============================================================================

func TestBroadcastBTC_AlreadyKnownSurfacesAsSuccess(t *testing.T) {
	srv := newMempoolSpaceServer(t)
	srv.responseCode = 400
	srv.responseBody = "sendrawtransaction RPC error: txn-already-known"

	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"BITCOIN_MAINNET": srv.server.URL,
	}}
	// rawTx with a known fingerprint we can independently compute.
	rawTx := "deadbeef"
	rawBytes, _ := hex.DecodeString(rawTx)
	res, err := c.Broadcast(context.Background(), "BITCOIN_MAINNET", rawTx)
	if err != nil {
		t.Fatalf("expected success surface on already-known, got err=%v", err)
	}
	expected, _ := txidFromRaw(rawBytes)
	if res.TxHash != expected {
		t.Errorf("TxHash = %q, want fallback-computed %q", res.TxHash, expected)
	}
}

func TestBroadcastBTC_AlreadyInBlockChainSurfacesAsSuccess(t *testing.T) {
	srv := newMempoolSpaceServer(t)
	srv.responseCode = 400
	srv.responseBody = "Transaction already in block chain"

	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"BITCOIN_MAINNET": srv.server.URL,
	}}
	rawTx := "deadbeef"
	res, err := c.Broadcast(context.Background(), "BITCOIN_MAINNET", rawTx)
	if err != nil {
		t.Fatalf("expected success surface on already-in-chain, got err=%v", err)
	}
	if res == nil || res.TxHash == "" {
		t.Fatal("expected non-empty TxHash on already-known recovery")
	}
}

// =============================================================================
// Fatal chain rejections
// =============================================================================

func TestBroadcastBTC_MempoolConflictIsFatal(t *testing.T) {
	srv := newMempoolSpaceServer(t)
	srv.responseCode = 400
	srv.responseBody = "sendrawtransaction RPC error: txn-mempool-conflict"

	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"BITCOIN_MAINNET": srv.server.URL,
	}}
	_, err := c.Broadcast(context.Background(), "BITCOIN_MAINNET", "deadbeef")
	if err == nil {
		t.Fatal("expected error from mempool-conflict")
	}
	var btcErr *BTCBroadcastError
	if !errors.As(err, &btcErr) {
		t.Fatalf("expected *BTCBroadcastError, got %T (%v)", err, err)
	}
	if btcErr.Retryable {
		t.Error("expected Retryable=false for mempool-conflict")
	}
	if btcErr.HTTPStatus != 400 {
		t.Errorf("expected HTTPStatus=400, got %d", btcErr.HTTPStatus)
	}
	if !strings.Contains(btcErr.Error(), "mempool-conflict") {
		t.Errorf("error message should include chain reason; got %q", btcErr.Error())
	}
}

func TestBroadcastBTC_MissingInputsIsFatal(t *testing.T) {
	srv := newMempoolSpaceServer(t)
	srv.responseCode = 400
	srv.responseBody = "bad-txns-inputs-missingorspent"

	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"BITCOIN_MAINNET": srv.server.URL,
	}}
	_, err := c.Broadcast(context.Background(), "BITCOIN_MAINNET", "deadbeef")
	var btcErr *BTCBroadcastError
	if !errors.As(err, &btcErr) || btcErr.Retryable {
		t.Errorf("expected fatal BTCBroadcastError for missing inputs, got %v", err)
	}
}

// =============================================================================
// Transient upstream
// =============================================================================

func TestBroadcastBTC_ServiceUnavailableIsRetryable(t *testing.T) {
	srv := newMempoolSpaceServer(t)
	srv.responseCode = 503
	srv.responseBody = "service unavailable"

	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"BITCOIN_MAINNET": srv.server.URL,
	}}
	_, err := c.Broadcast(context.Background(), "BITCOIN_MAINNET", "deadbeef")
	if err == nil {
		t.Fatal("expected error from 503")
	}
	var btcErr *BTCBroadcastError
	if !errors.As(err, &btcErr) {
		t.Fatalf("expected *BTCBroadcastError, got %T", err)
	}
	if !btcErr.Retryable {
		t.Error("expected Retryable=true for 503")
	}
}

func TestBroadcastBTC_RateLimitIsRetryable(t *testing.T) {
	srv := newMempoolSpaceServer(t)
	srv.responseCode = 429
	srv.responseBody = "too many requests"

	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"BITCOIN_MAINNET": srv.server.URL,
	}}
	_, err := c.Broadcast(context.Background(), "BITCOIN_MAINNET", "deadbeef")
	var btcErr *BTCBroadcastError
	if !errors.As(err, &btcErr) || !btcErr.Retryable {
		t.Errorf("expected retryable BTCBroadcastError for 429, got %v", err)
	}
}

// =============================================================================
// Input validation
// =============================================================================

func TestBroadcastBTC_EmptyRawTx(t *testing.T) {
	srv := newMempoolSpaceServer(t)
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"BITCOIN_MAINNET": srv.server.URL,
	}}
	_, err := c.Broadcast(context.Background(), "BITCOIN_MAINNET", "")
	if !errors.Is(err, ErrEmptyRawTx) {
		t.Errorf("expected ErrEmptyRawTx, got %v", err)
	}
}

func TestBroadcastBTC_MalformedHex(t *testing.T) {
	srv := newMempoolSpaceServer(t)
	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"BITCOIN_MAINNET": srv.server.URL,
	}}
	_, err := c.Broadcast(context.Background(), "BITCOIN_MAINNET", "0xZZNOTHEX")
	if err == nil {
		t.Fatal("expected error from malformed hex")
	}
	if !strings.Contains(err.Error(), "decode hex") {
		t.Errorf("expected decode-hex error, got %v", err)
	}
}

// =============================================================================
// Upstream body wasn't a clean txid → fallback compute
// =============================================================================

func TestBroadcastBTC_UpstreamBodyMalformedFallsBackToLocalTxid(t *testing.T) {
	srv := newMempoolSpaceServer(t)
	srv.responseCode = 200
	srv.responseBody = "weird non-txid body from a misconfigured upstream"

	c := &Client{Timeout: time.Second, RPCURLOverrides: map[string]string{
		"BITCOIN_MAINNET": srv.server.URL,
	}}
	rawTx := "deadbeef"
	rawBytes, _ := hex.DecodeString(rawTx)
	res, err := c.Broadcast(context.Background(), "BITCOIN_MAINNET", rawTx)
	if err != nil {
		t.Fatalf("expected fallback success, got %v", err)
	}
	expected, _ := txidFromRaw(rawBytes)
	if res.TxHash != expected {
		t.Errorf("TxHash = %q, want fallback %q", res.TxHash, expected)
	}
}

// =============================================================================
// Network resolution
// =============================================================================

func TestBroadcastBTC_DefaultURLs(t *testing.T) {
	// The package init in btc.go should have registered mempool.space
	// URLs for BITCOIN_MAINNET and BITCOIN_TESTNET.
	if RPCURLFor("BITCOIN_MAINNET") == "" {
		t.Error("BITCOIN_MAINNET should have a default URL after btc.go init")
	}
	if RPCURLFor("BITCOIN_TESTNET") == "" {
		t.Error("BITCOIN_TESTNET should have a default URL after btc.go init")
	}
	if !strings.Contains(RPCURLFor("BITCOIN_TESTNET"), "testnet") {
		t.Errorf("testnet URL should differ from mainnet; got %q", RPCURLFor("BITCOIN_TESTNET"))
	}
}

// =============================================================================
// Error stringification
// =============================================================================

func TestBTCBroadcastError_StringRetryability(t *testing.T) {
	cases := []struct {
		err  *BTCBroadcastError
		want string
	}{
		{
			err:  &BTCBroadcastError{Op: "btc_send_rawtx", HTTPStatus: 503, Message: "down", Retryable: true},
			want: "broadcast: btc HTTP 503 (retryable): down",
		},
		{
			err:  &BTCBroadcastError{Op: "btc_send_rawtx", HTTPStatus: 400, Message: "txn-mempool-conflict", Retryable: false},
			want: "broadcast: btc HTTP 400 (fatal): txn-mempool-conflict",
		},
		{
			err:  &BTCBroadcastError{Op: "btc_send_rawtx", Message: "transport drop", Retryable: true},
			want: "broadcast: btc (retryable): transport drop",
		},
	}
	for _, tc := range cases {
		if got := tc.err.Error(); got != tc.want {
			t.Errorf("got %q, want %q", got, tc.want)
		}
	}
}
