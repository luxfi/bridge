package ton

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// =============================================================================
// Pure functions — no HTTP involved.
// =============================================================================

func TestIsTestnetAddress(t *testing.T) {
	cases := []struct {
		addr string
		want bool
	}{
		{"kQAbc123", true},
		{"0QAbc123", true},
		{"EQAbc123", false},
		{"UQAbc123", false},
		{"", false},
		{"k", false}, // too short for a 2-char prefix check
	}
	for _, c := range cases {
		if got := isTestnetAddress(c.addr); got != c.want {
			t.Errorf("isTestnetAddress(%q) = %v, want %v", c.addr, got, c.want)
		}
	}
}

func TestPadHex(t *testing.T) {
	cases := map[string]string{
		"2a":  "2a",  // even length, unchanged
		"a":   "0a",  // odd length, left-padded
		"":    "",    // empty stays empty (even, trivially)
		"abc": "0abc",
	}
	for in, want := range cases {
		if got := padHex(in); got != want {
			t.Errorf("padHex(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestBase64ShortID(t *testing.T) {
	short := "YWJj" // 4 chars
	if got := base64ShortID(short); got != short {
		t.Errorf("short input should pass through unchanged, got %q", got)
	}
	long := strings.Repeat("a", 40)
	got := base64ShortID(long)
	if len(got) != 16 {
		t.Errorf("long input should truncate to 16 chars, got len=%d", len(got))
	}
	if got != long[:16] {
		t.Errorf("truncation should keep the prefix, got %q", got)
	}
}

func TestTruncate(t *testing.T) {
	if got := truncate([]byte("short"), 200); got != "short" {
		t.Errorf("short input should pass through, got %q", got)
	}
	got := truncate([]byte(strings.Repeat("x", 300)), 10)
	if got != strings.Repeat("x", 10)+"..." {
		t.Errorf("truncate should cap at n chars + ellipsis, got %q", got)
	}
}

// =============================================================================
// Construction + routing.
// =============================================================================

func TestNewTonCenterProvider_DefaultsAndTrimsTrailingSlash(t *testing.T) {
	p := NewTonCenterProvider("", "", "")
	if p.MainnetURL != MainnetTonCenter {
		t.Errorf("MainnetURL = %q, want default %q", p.MainnetURL, MainnetTonCenter)
	}
	if p.TestnetURL != TestnetTonCenter {
		t.Errorf("TestnetURL = %q, want default %q", p.TestnetURL, TestnetTonCenter)
	}

	custom := NewTonCenterProvider("https://my-node.example/api/", "https://my-testnet.example/api/", "key123")
	if custom.MainnetURL != "https://my-node.example/api" {
		t.Errorf("MainnetURL trailing slash not trimmed: %q", custom.MainnetURL)
	}
	if custom.TestnetURL != "https://my-testnet.example/api" {
		t.Errorf("TestnetURL trailing slash not trimmed: %q", custom.TestnetURL)
	}
	if custom.APIKey != "key123" {
		t.Errorf("APIKey = %q, want key123", custom.APIKey)
	}
}

func TestBaseFor_RoutesByAddressPrefix(t *testing.T) {
	p := &TonCenterProvider{MainnetURL: "https://mainnet.example", TestnetURL: "https://testnet.example"}
	if got := p.baseFor("kQSomeAddress"); got != "https://testnet.example" {
		t.Errorf("testnet address routed to %q, want testnet URL", got)
	}
	if got := p.baseFor("EQSomeAddress"); got != "https://mainnet.example" {
		t.Errorf("mainnet address routed to %q, want mainnet URL", got)
	}
}

func TestBaseForBroadcast_AlwaysMainnet(t *testing.T) {
	p := &TonCenterProvider{MainnetURL: "https://mainnet.example", TestnetURL: "https://testnet.example"}
	if got := p.baseForBroadcast(); got != "https://mainnet.example" {
		t.Errorf("baseForBroadcast() = %q, want mainnet URL", got)
	}
}

// =============================================================================
// HTTP-backed methods.
// =============================================================================

// tcHandler builds an http.HandlerFunc keyed by exact path, so a single
// test can stand up one server covering multiple toncenter endpoints
// (e.g. GetBalanceNano reuses getAddressInformation).
func tcHandler(t *testing.T, routes map[string]func(w http.ResponseWriter, r *http.Request)) http.HandlerFunc {
	t.Helper()
	return func(w http.ResponseWriter, r *http.Request) {
		fn, ok := routes[r.URL.Path]
		if !ok {
			t.Errorf("unexpected request path %q", r.URL.Path)
			http.NotFound(w, r)
			return
		}
		fn(w, r)
	}
}

func jsonOK(w http.ResponseWriter, result any) {
	w.Header().Set("Content-Type", "application/json")
	env := map[string]any{"ok": true, "result": result}
	_ = json.NewEncoder(w).Encode(env)
}

func newProviderAgainst(url string) *TonCenterProvider {
	return &TonCenterProvider{
		MainnetURL: url,
		TestnetURL: url,
		Client:     &http.Client{Timeout: 5 * time.Second},
	}
}

func TestIsContractActive_Active(t *testing.T) {
	srv := httptest.NewServer(tcHandler(t, map[string]func(w http.ResponseWriter, r *http.Request){
		"/getAddressInformation": func(w http.ResponseWriter, r *http.Request) {
			jsonOK(w, map[string]any{"state": "active", "balance": "0"})
		},
	}))
	t.Cleanup(srv.Close)
	p := newProviderAgainst(srv.URL)

	active, err := p.IsContractActive(context.Background(), "EQtest")
	if err != nil {
		t.Fatalf("IsContractActive: %v", err)
	}
	if !active {
		t.Error("expected active=true")
	}
}

func TestIsContractActive_UninitializedAndFrozenAreBothFalse(t *testing.T) {
	for _, state := range []string{"uninitialized", "frozen"} {
		srv := httptest.NewServer(tcHandler(t, map[string]func(w http.ResponseWriter, r *http.Request){
			"/getAddressInformation": func(w http.ResponseWriter, r *http.Request) {
				jsonOK(w, map[string]any{"state": state, "balance": "0"})
			},
		}))
		active, err := newProviderAgainst(srv.URL).IsContractActive(context.Background(), "EQtest")
		srv.Close()
		if err != nil {
			t.Fatalf("state=%s: IsContractActive: %v", state, err)
		}
		if active {
			t.Errorf("state=%s: expected active=false", state)
		}
	}
}

func TestGetSeqno_HappyPath(t *testing.T) {
	srv := httptest.NewServer(tcHandler(t, map[string]func(w http.ResponseWriter, r *http.Request){
		"/runGetMethod": func(w http.ResponseWriter, r *http.Request) {
			jsonOK(w, map[string]any{
				"stack":     []any{[]any{"num", "0x2a"}},
				"exit_code": 0,
			})
		},
	}))
	t.Cleanup(srv.Close)
	p := newProviderAgainst(srv.URL)

	seq, err := p.GetSeqno(context.Background(), "EQtest")
	if err != nil {
		t.Fatalf("GetSeqno: %v", err)
	}
	if seq != 42 {
		t.Errorf("seqno = %d, want 42", seq)
	}
}

func TestGetSeqno_UninitializedContractReturnsZero(t *testing.T) {
	srv := httptest.NewServer(tcHandler(t, map[string]func(w http.ResponseWriter, r *http.Request){
		"/runGetMethod": func(w http.ResponseWriter, r *http.Request) {
			http.NotFound(w, r)
		},
	}))
	t.Cleanup(srv.Close)
	p := newProviderAgainst(srv.URL)

	seq, err := p.GetSeqno(context.Background(), "EQtest")
	if err != nil {
		t.Fatalf("GetSeqno on 404: %v", err)
	}
	if seq != 0 {
		t.Errorf("seqno = %d, want 0 for an uninitialized contract", seq)
	}
}

// TestGetSeqno_NonZeroExitCodeIgnoresGarbageStack pins the specific bug
// this code guards against: on a non-zero exit_code the TVM bailout
// leaves a random internal value on the stack that looks like a seqno
// but isn't one. Returning it would build a message with a wrong seqno
// that a freshly-deployed wallet rejects with exit 33. Must return 0,
// not the garbage stack value.
func TestGetSeqno_NonZeroExitCodeIgnoresGarbageStack(t *testing.T) {
	srv := httptest.NewServer(tcHandler(t, map[string]func(w http.ResponseWriter, r *http.Request){
		"/runGetMethod": func(w http.ResponseWriter, r *http.Request) {
			jsonOK(w, map[string]any{
				"stack":     []any{[]any{"num", "0x14c97"}}, // looks plausible but isn't a real seqno
				"exit_code": -13,
			})
		},
	}))
	t.Cleanup(srv.Close)
	p := newProviderAgainst(srv.URL)

	seq, err := p.GetSeqno(context.Background(), "EQtest")
	if err != nil {
		t.Fatalf("GetSeqno: %v", err)
	}
	if seq != 0 {
		t.Errorf("seqno = %d, want 0 — a non-zero exit_code stack value must never be treated as a real seqno", seq)
	}
}

func TestGetSeqno_EmptyStackErrors(t *testing.T) {
	srv := httptest.NewServer(tcHandler(t, map[string]func(w http.ResponseWriter, r *http.Request){
		"/runGetMethod": func(w http.ResponseWriter, r *http.Request) {
			jsonOK(w, map[string]any{"stack": []any{}, "exit_code": 0})
		},
	}))
	t.Cleanup(srv.Close)
	p := newProviderAgainst(srv.URL)

	if _, err := p.GetSeqno(context.Background(), "EQtest"); err == nil {
		t.Fatal("expected an error for an empty stack, got nil")
	}
}

func TestGetBalanceNano_HappyPath(t *testing.T) {
	srv := httptest.NewServer(tcHandler(t, map[string]func(w http.ResponseWriter, r *http.Request){
		"/getAddressInformation": func(w http.ResponseWriter, r *http.Request) {
			jsonOK(w, map[string]any{"state": "active", "balance": "1500000000"})
		},
	}))
	t.Cleanup(srv.Close)
	p := newProviderAgainst(srv.URL)

	bal, err := p.GetBalanceNano(context.Background(), "EQtest")
	if err != nil {
		t.Fatalf("GetBalanceNano: %v", err)
	}
	if bal != 1_500_000_000 {
		t.Errorf("balance = %d, want 1.5e9", bal)
	}
}

func TestGetBalanceNano_EmptyBalanceIsZero(t *testing.T) {
	srv := httptest.NewServer(tcHandler(t, map[string]func(w http.ResponseWriter, r *http.Request){
		"/getAddressInformation": func(w http.ResponseWriter, r *http.Request) {
			jsonOK(w, map[string]any{"state": "uninitialized", "balance": ""})
		},
	}))
	t.Cleanup(srv.Close)
	p := newProviderAgainst(srv.URL)

	bal, err := p.GetBalanceNano(context.Background(), "EQtest")
	if err != nil {
		t.Fatalf("GetBalanceNano: %v", err)
	}
	if bal != 0 {
		t.Errorf("balance = %d, want 0", bal)
	}
}

func TestGetBalanceNano_RejectsNonDecimalString(t *testing.T) {
	srv := httptest.NewServer(tcHandler(t, map[string]func(w http.ResponseWriter, r *http.Request){
		"/getAddressInformation": func(w http.ResponseWriter, r *http.Request) {
			jsonOK(w, map[string]any{"state": "active", "balance": "not-a-number"})
		},
	}))
	t.Cleanup(srv.Close)
	p := newProviderAgainst(srv.URL)

	if _, err := p.GetBalanceNano(context.Background(), "EQtest"); err == nil {
		t.Fatal("expected an error for a non-decimal balance string, got nil")
	}
}

func TestBroadcastBoC_RejectsEmptyBoC(t *testing.T) {
	p := newProviderAgainst("http://unused")
	if _, err := p.BroadcastBoC(context.Background(), nil); err == nil {
		t.Fatal("expected an error for an empty BoC, got nil")
	}
}

func TestBroadcastBoC_HappyPath(t *testing.T) {
	var gotBody map[string]any
	srv := httptest.NewServer(tcHandler(t, map[string]func(w http.ResponseWriter, r *http.Request){
		"/sendBoc": func(w http.ResponseWriter, r *http.Request) {
			_ = json.NewDecoder(r.Body).Decode(&gotBody)
			jsonOK(w, map[string]any{"@type": "ok"})
		},
	}))
	t.Cleanup(srv.Close)
	p := newProviderAgainst(srv.URL)

	boc := []byte{0xde, 0xad, 0xbe, 0xef}
	id, err := p.BroadcastBoC(context.Background(), boc)
	if err != nil {
		t.Fatalf("BroadcastBoC: %v", err)
	}
	if id == "" {
		t.Error("expected a non-empty tracking id")
	}
	wantB64 := base64.StdEncoding.EncodeToString(boc)
	if gotBody["boc"] != wantB64 {
		t.Errorf("request boc = %v, want base64 %q", gotBody["boc"], wantB64)
	}
}

// =============================================================================
// Transport-level error handling, shared by every method above.
// =============================================================================

func TestDoGetIntoResult_NonOKEnvelopeSurfacesError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": false, "error": "rate limited"})
	}))
	t.Cleanup(srv.Close)
	p := newProviderAgainst(srv.URL)

	_, err := p.IsContractActive(context.Background(), "EQtest")
	if err == nil || !strings.Contains(err.Error(), "rate limited") {
		t.Errorf("expected error containing 'rate limited', got %v", err)
	}
}

func TestDoPost_NonOKEnvelopeWithUninitMapsToNotFound(t *testing.T) {
	// GetSeqno treats errNotFound as "seqno=0" — confirm the envelope-level
	// "uninitialized" string match (not just an HTTP 404) triggers the
	// same fallback, since toncenter can report this either way.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": false, "error": "contract is uninitialized"})
	}))
	t.Cleanup(srv.Close)
	p := newProviderAgainst(srv.URL)

	seq, err := p.GetSeqno(context.Background(), "EQtest")
	if err != nil {
		t.Fatalf("GetSeqno: %v", err)
	}
	if seq != 0 {
		t.Errorf("seqno = %d, want 0", seq)
	}
}

func TestHTTPNon2xxSurfacesStatusAndBody(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte("upstream down"))
	}))
	t.Cleanup(srv.Close)
	p := newProviderAgainst(srv.URL)

	_, err := p.IsContractActive(context.Background(), "EQtest")
	if err == nil || !strings.Contains(err.Error(), "502") || !strings.Contains(err.Error(), "upstream down") {
		t.Errorf("expected error mentioning HTTP 502 + body, got %v", err)
	}
}

func TestAPIKeyHeaderSetWhenConfigured(t *testing.T) {
	var gotHeader string
	srv := httptest.NewServer(tcHandler(t, map[string]func(w http.ResponseWriter, r *http.Request){
		"/getAddressInformation": func(w http.ResponseWriter, r *http.Request) {
			gotHeader = r.Header.Get("X-API-Key")
			jsonOK(w, map[string]any{"state": "active", "balance": "0"})
		},
	}))
	t.Cleanup(srv.Close)
	p := newProviderAgainst(srv.URL)
	p.APIKey = "secret-key"

	if _, err := p.IsContractActive(context.Background(), "EQtest"); err != nil {
		t.Fatalf("IsContractActive: %v", err)
	}
	if gotHeader != "secret-key" {
		t.Errorf("X-API-Key header = %q, want secret-key", gotHeader)
	}
}

func TestAPIKeyHeaderAbsentWhenNotConfigured(t *testing.T) {
	var sawHeader bool
	srv := httptest.NewServer(tcHandler(t, map[string]func(w http.ResponseWriter, r *http.Request){
		"/getAddressInformation": func(w http.ResponseWriter, r *http.Request) {
			sawHeader = r.Header.Get("X-API-Key") != ""
			jsonOK(w, map[string]any{"state": "active", "balance": "0"})
		},
	}))
	t.Cleanup(srv.Close)
	p := newProviderAgainst(srv.URL) // APIKey left empty

	if _, err := p.IsContractActive(context.Background(), "EQtest"); err != nil {
		t.Fatalf("IsContractActive: %v", err)
	}
	if sawHeader {
		t.Error("X-API-Key header should be absent when APIKey is unconfigured")
	}
}

// =============================================================================
// Compile-time interface check — mirrors the doc comment's claim that
// TonCenterProvider is the production Provider implementation.
// =============================================================================

var _ Provider = (*TonCenterProvider)(nil)
