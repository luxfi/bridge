// Tests for the TON broadcast handler — focuses on response parsing,
// retry classification, payload normalization, and the HTTP wire shape.

package broadcast

import (
	"context"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// tonCenterServer is an httptest.Server mock that records the last
// request and lets a test pin the response shape.
type tonCenterServer struct {
	t           *testing.T
	server      *httptest.Server
	respStatus  int
	respBody    string
	lastBoc     string
	lastAPIKey  string
	gotBodyJSON map[string]any
	calls       int
}

func newTONCenter(t *testing.T) *tonCenterServer {
	t.Helper()
	s := &tonCenterServer{t: t, respStatus: 200}
	s.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s.calls++
		s.lastAPIKey = r.Header.Get("X-API-Key")
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &s.gotBodyJSON)
		if b, ok := s.gotBodyJSON["boc"].(string); ok {
			s.lastBoc = b
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(s.respStatus)
		_, _ = w.Write([]byte(s.respBody))
	}))
	t.Cleanup(s.server.Close)
	return s
}

// =============================================================================
// Happy path
// =============================================================================

func TestBroadcast_TON_Confirmed(t *testing.T) {
	srv := newTONCenter(t)
	srv.respStatus = 200
	srv.respBody = `{"ok":true,"result":{"@type":"ok","hash":"deadbeef"}}`

	c := &Client{
		Timeout:         time.Second,
		RPCURLOverrides: map[string]string{"TON_TESTNET": srv.server.URL},
		TONAPIKeys:      map[string]string{"TON_TESTNET": "tk-secret"},
	}
	res, err := c.Broadcast(context.Background(), "TON_TESTNET", "0xdeadbeefcafe")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.TxHash != "deadbeef" {
		t.Errorf("TxHash = %q, want \"deadbeef\"", res.TxHash)
	}
	if srv.calls != 1 {
		t.Errorf("calls = %d, want 1", srv.calls)
	}
	if srv.lastAPIKey != "tk-secret" {
		t.Errorf("X-API-Key = %q, want \"tk-secret\"", srv.lastAPIKey)
	}
	// hex input should be repackaged as base64.
	if srv.lastBoc == "" {
		t.Error("body missing boc field")
	}
	// Verify the boc is base64 of the original hex bytes.
	want, _ := hex.DecodeString("deadbeefcafe")
	if got, err := base64.StdEncoding.DecodeString(srv.lastBoc); err != nil || string(got) != string(want) {
		t.Errorf("boc = %q (decoded=%x), want %x", srv.lastBoc, got, want)
	}
}

func TestBroadcast_TON_AcceptsBase64Payload(t *testing.T) {
	srv := newTONCenter(t)
	srv.respBody = `{"ok":true,"result":{"hash":"abc"}}`
	c := &Client{
		Timeout:         time.Second,
		RPCURLOverrides: map[string]string{"TON_MAINNET": srv.server.URL},
	}
	// Use a non-hex base64 string so isHexString returns false and the
	// normalizer leaves it intact.
	b64 := base64.StdEncoding.EncodeToString([]byte("not-hex-bytes-some-payload"))
	if _, err := c.Broadcast(context.Background(), "TON_MAINNET", b64); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if srv.lastBoc != b64 {
		t.Errorf("base64 input not passed through: got %q want %q", srv.lastBoc, b64)
	}
}

func TestBroadcast_TON_SetTONAPIKey(t *testing.T) {
	c := New(time.Second)
	c.SetTONAPIKey("TON_MAINNET", "abc-key")
	c.SetTONAPIKey("TON_TESTNET", "xyz-key")
	if c.tonAPIKey("TON_MAINNET") != "abc-key" {
		t.Error("SetTONAPIKey did not persist mainnet key")
	}
	if c.tonAPIKey("TON_TESTNET") != "xyz-key" {
		t.Error("SetTONAPIKey did not persist testnet key")
	}
	if c.tonAPIKey("UNKNOWN") != "" {
		t.Error("unconfigured network should return empty key")
	}
}

// =============================================================================
// Error paths — retry classification
// =============================================================================

func TestBroadcast_TON_RateLimitRetryable(t *testing.T) {
	srv := newTONCenter(t)
	srv.respStatus = 429
	srv.respBody = `{"ok":false,"error":"Too many requests","code":429}`
	c := &Client{
		Timeout:         time.Second,
		RPCURLOverrides: map[string]string{"TON_TESTNET": srv.server.URL},
	}
	_, err := c.Broadcast(context.Background(), "TON_TESTNET", "0xab")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !errors.Is(err, ErrTONRateLimited) {
		t.Errorf("expected ErrTONRateLimited, got %v", err)
	}
}

func TestBroadcast_TON_MalformedBOCFatal(t *testing.T) {
	srv := newTONCenter(t)
	srv.respStatus = 400
	srv.respBody = `{"ok":false,"error":"Bad Request: invalid boc","code":400}`
	c := &Client{
		Timeout:         time.Second,
		RPCURLOverrides: map[string]string{"TON_MAINNET": srv.server.URL},
	}
	_, err := c.Broadcast(context.Background(), "TON_MAINNET", "0xab")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !errors.Is(err, ErrTONMalformedBOC) {
		t.Errorf("expected ErrTONMalformedBOC, got %v", err)
	}
}

func TestBroadcast_TON_AccountNotInitialized(t *testing.T) {
	srv := newTONCenter(t)
	srv.respStatus = 400
	srv.respBody = `{"ok":false,"error":"account is not initialized","code":400}`
	c := &Client{
		Timeout:         time.Second,
		RPCURLOverrides: map[string]string{"TON_TESTNET": srv.server.URL},
	}
	_, err := c.Broadcast(context.Background(), "TON_TESTNET", "0xab")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !errors.Is(err, ErrTONAccountNotInitialized) {
		t.Errorf("expected ErrTONAccountNotInitialized, got %v", err)
	}
}

func TestBroadcast_TON_HTTP502Retryable(t *testing.T) {
	srv := newTONCenter(t)
	srv.respStatus = 502
	srv.respBody = `{"ok":false,"error":"Bad Gateway","code":502}`
	c := &Client{
		Timeout:         time.Second,
		RPCURLOverrides: map[string]string{"TON_MAINNET": srv.server.URL},
	}
	_, err := c.Broadcast(context.Background(), "TON_MAINNET", "0xab")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	var te *TONError
	if !errors.As(err, &te) {
		t.Fatalf("expected *TONError, got %T: %v", err, err)
	}
	if !te.Retryable {
		t.Errorf("HTTP 502 should be Retryable, got %+v", te)
	}
}

// =============================================================================
// Direct response parser tests (no HTTP)
// =============================================================================

func TestParseTONResponse_HashFromHexResult(t *testing.T) {
	body := `{"ok":true,"result":{"hash":"abc123"}}`
	res, err := parseTONResponse(200, []byte(body))
	if err != nil {
		t.Fatalf("unexpected: %v", err)
	}
	if res.TxHash != "abc123" {
		t.Errorf("TxHash = %q", res.TxHash)
	}
}

func TestParseTONResponse_NonJSON5xx(t *testing.T) {
	_, err := parseTONResponse(503, []byte("upstream down"))
	if err == nil {
		t.Fatal("expected error")
	}
	var te *TONError
	if !errors.As(err, &te) || !te.Retryable {
		t.Errorf("non-JSON 5xx should be retryable TONError, got %v", err)
	}
}

func TestParseTONResponse_EmptyHashSynthesized(t *testing.T) {
	// Some forks return ok:true with no hash field. Make sure we
	// synthesize a non-empty identifier so the broadcast driver
	// advances the swap.
	body := `{"ok":true,"result":{"@type":"ok"}}`
	res, err := parseTONResponse(200, []byte(body))
	if err != nil {
		t.Fatal(err)
	}
	if res.TxHash == "" {
		t.Error("expected synthesized hash on missing-hash success response")
	}
	if !strings.HasPrefix(res.TxHash, "ton:sendBoc:") {
		t.Errorf("synthesized hash should be prefixed with ton:sendBoc:, got %q", res.TxHash)
	}
}

// =============================================================================
// Payload normalizer
// =============================================================================

func TestNormalizeTONPayload_Empty(t *testing.T) {
	if _, err := normalizeTONPayload(""); err == nil {
		t.Error("empty input should error")
	}
}

func TestNormalizeTONPayload_HexPrefix(t *testing.T) {
	out, err := normalizeTONPayload("0xdead")
	if err != nil {
		t.Fatal(err)
	}
	want := base64.StdEncoding.EncodeToString([]byte{0xde, 0xad})
	if out != want {
		t.Errorf("got %q want %q", out, want)
	}
}

func TestNormalizeTONPayload_BareHex(t *testing.T) {
	out, err := normalizeTONPayload("cafe")
	if err != nil {
		t.Fatal(err)
	}
	want := base64.StdEncoding.EncodeToString([]byte{0xca, 0xfe})
	if out != want {
		t.Errorf("got %q want %q", out, want)
	}
}

func TestNormalizeTONPayload_Base64PassThrough(t *testing.T) {
	// "te6cck" — typical TON BOC prefix in base64.
	in := "te6ccgEBAQEABgAACAAAAAA="
	out, err := normalizeTONPayload(in)
	if err != nil {
		t.Fatal(err)
	}
	if out != in {
		t.Errorf("base64 input should pass through; got %q", out)
	}
}

// =============================================================================
// Existing-test parity: ErrFamilyNotImplemented should still fire for
// the non-EVM non-TON families.
// =============================================================================

func TestBroadcast_TON_RoutesToTONFamily(t *testing.T) {
	// Without an override URL, the TON network falls through to
	// ErrUnsupportedNetwork (no entry in the rpcURLs table). With an
	// override, the family dispatch kicks in.
	c := New(time.Second)
	c.RPCURLOverrides = map[string]string{"TON_TESTNET": "http://127.0.0.1:0"}
	_, err := c.Broadcast(context.Background(), "TON_TESTNET", "0xab")
	if err == nil {
		t.Fatal("expected an error from unreachable URL")
	}
	// Whatever happens, it must NOT be ErrFamilyNotImplemented (that
	// would mean dispatch didn't route to TON).
	if errors.Is(err, ErrFamilyNotImplemented) {
		t.Errorf("TON family should be implemented; got ErrFamilyNotImplemented: %v", err)
	}
}

// =============================================================================
// Hex helpers
// =============================================================================

func TestIsHexString(t *testing.T) {
	cases := []struct {
		s    string
		want bool
	}{
		{"", false},
		{"a", false},  // odd length
		{"ab", true},  // ok
		{"AB", true},  // upper
		{"xy", false}, // non-hex
		{"abcdef0123456789", true},
	}
	for _, tc := range cases {
		t.Run(tc.s, func(t *testing.T) {
			if got := isHexString(tc.s); got != tc.want {
				t.Errorf("isHexString(%q) = %v, want %v", tc.s, got, tc.want)
			}
		})
	}
}
