package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// =============================================================================
// fakeMpcd — minimal upstream stub
// =============================================================================

// fakeMpcd mimics the two endpoints the proxy hits:
//
//	POST /v1/mpc/wallets/{id}/sessions
//	POST /v1/mpc/sign
//
// Each test configures behavior by flipping flags on the stub. The
// stub asserts (a) the bearer token matches what the proxy was
// configured with, and (b) request bodies decode to the expected
// shape. Anything else fails the test fast.
type fakeMpcd struct {
	server *httptest.Server

	expectedToken string

	// flags
	sessionFails atomic.Bool
	signFails    atomic.Bool
	sessionCode  int    // override status code for session
	signCode     int    // override status code for sign
	sessionBody  []byte // override body for session (raw)
	signBody     []byte // override body for sign (raw)

	// invariants captured by handlers
	lastSessionScopes []string
	lastSignReq       mpcdSignReq

	sessionCalls atomic.Uint64
	signCalls    atomic.Uint64

	fixedSessionID string
	fixedSig       string
}

func newFakeMpcd(t *testing.T, token string) *fakeMpcd {
	t.Helper()
	f := &fakeMpcd{
		expectedToken:  token,
		fixedSessionID: "ses-abc123",
		fixedSig: "0x" +
			"1111111111111111111111111111111111111111111111111111111111111111" +
			"2222222222222222222222222222222222222222222222222222222222222222" +
			"00",
	}
	f.server = httptest.NewServer(http.HandlerFunc(f.handle))
	t.Cleanup(f.server.Close)
	return f
}

func (f *fakeMpcd) URL() string { return f.server.URL }

func (f *fakeMpcd) handle(w http.ResponseWriter, r *http.Request) {
	// Bearer token check — every protected endpoint must carry it.
	if f.expectedToken != "" {
		got := r.Header.Get("Authorization")
		want := "Bearer " + f.expectedToken
		if got != want {
			http.Error(w, `{"error":"unauthorized: bad bearer"}`, http.StatusUnauthorized)
			return
		}
	}
	switch {
	case strings.HasSuffix(r.URL.Path, "/sessions") && strings.HasPrefix(r.URL.Path, "/v1/mpc/wallets/"):
		f.handleSession(w, r)
	case r.URL.Path == "/v1/mpc/sign":
		f.handleSign(w, r)
	default:
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
	}
}

func (f *fakeMpcd) handleSession(w http.ResponseWriter, r *http.Request) {
	f.sessionCalls.Add(1)
	if f.sessionFails.Load() {
		code := f.sessionCode
		if code == 0 {
			code = http.StatusForbidden
		}
		w.WriteHeader(code)
		if len(f.sessionBody) > 0 {
			_, _ = w.Write(f.sessionBody)
		} else {
			_, _ = w.Write([]byte(`{"error":"session denied (test stub)"}`))
		}
		return
	}
	var req mpcdSessionReq
	_ = json.NewDecoder(r.Body).Decode(&req)
	f.lastSessionScopes = req.Scopes
	if req.ExpiresAt.IsZero() || !req.ExpiresAt.After(time.Now()) {
		http.Error(w, `{"error":"expiresAt must be in the future"}`, http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(mpcdSessionResp{
		SessionID: f.fixedSessionID,
		Status:    "active",
	})
}

func (f *fakeMpcd) handleSign(w http.ResponseWriter, r *http.Request) {
	f.signCalls.Add(1)
	if f.signFails.Load() {
		code := f.signCode
		if code == 0 {
			code = http.StatusInternalServerError
		}
		w.WriteHeader(code)
		if len(f.signBody) > 0 {
			_, _ = w.Write(f.signBody)
		} else {
			_, _ = w.Write([]byte(`{"error":"sign denied (test stub)"}`))
		}
		return
	}
	_ = json.NewDecoder(r.Body).Decode(&f.lastSignReq)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(mpcdSignResp{
		Signature: f.fixedSig,
	})
}

// newProxyAgainst wires a Proxy against the given fake mpcd.
func newProxyAgainst(f *fakeMpcd) *Proxy {
	return &Proxy{
		UpstreamURL:   f.URL(),
		UpstreamToken: f.expectedToken,
		SessionTTL:    30 * time.Second,
		HTTPClient:    &http.Client{Timeout: 5 * time.Second},
	}
}

// postBridgeSign drives one /sign call against the proxy and returns
// the status code + decoded bridge-shape response.
func postBridgeSign(t *testing.T, p *Proxy, req bridgeSignReq) (int, bridgeSignResp) {
	t.Helper()
	body, _ := json.Marshal(req)
	r := httptest.NewRequest(http.MethodPost, "/sign", bytes.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	p.handleSign(w, r)
	out, _ := io.ReadAll(w.Body)
	var resp bridgeSignResp
	if err := json.Unmarshal(out, &resp); err != nil {
		t.Fatalf("decode proxy resp: %v body=%s", err, out)
	}
	return w.Code, resp
}

// =============================================================================
// Happy path
// =============================================================================

func TestProxy_HappyPath(t *testing.T) {
	fake := newFakeMpcd(t, "proxy-token-xyz")
	p := newProxyAgainst(fake)

	status, resp := postBridgeSign(t, p, bridgeSignReq{
		OrgID:    "bridge",
		WalletID: "wallet-abc",
		Message:  "0xdeadbeef" + strings.Repeat("00", 28), // 32-byte sighash
	})
	if status != http.StatusOK {
		t.Fatalf("status=%d, resp=%+v", status, resp)
	}
	if resp.ResultType != "success" {
		t.Errorf("result_type=%q want success", resp.ResultType)
	}
	if resp.Signature != fake.fixedSig {
		t.Errorf("signature=%q want %q", resp.Signature, fake.fixedSig)
	}
	if resp.SessionID != fake.fixedSessionID {
		t.Errorf("session_id=%q want %q", resp.SessionID, fake.fixedSessionID)
	}
	if resp.WalletID != "wallet-abc" {
		t.Errorf("wallet_id=%q want wallet-abc", resp.WalletID)
	}
	if fake.sessionCalls.Load() != 1 || fake.signCalls.Load() != 1 {
		t.Errorf("expected 1 session + 1 sign call, got %d/%d",
			fake.sessionCalls.Load(), fake.signCalls.Load())
	}
	if len(fake.lastSessionScopes) != 1 || fake.lastSessionScopes[0] != "sign" {
		t.Errorf("session scopes=%v want [sign]", fake.lastSessionScopes)
	}
	if fake.lastSignReq.SessionID != fake.fixedSessionID {
		t.Errorf("sign call session_id=%q want %q",
			fake.lastSignReq.SessionID, fake.fixedSessionID)
	}
	if fake.lastSignReq.Encoding != "hex" {
		t.Errorf("sign encoding=%q want hex", fake.lastSignReq.Encoding)
	}
	if got := p.Stats(); got.SignSuccess != 1 || got.SignRequests != 1 {
		t.Errorf("stats=%+v", got)
	}
}

// =============================================================================
// Request validation
// =============================================================================

func TestProxy_RejectsMissingWalletID(t *testing.T) {
	fake := newFakeMpcd(t, "")
	p := newProxyAgainst(fake)

	status, resp := postBridgeSign(t, p, bridgeSignReq{Message: "0xab"})
	if status != http.StatusBadRequest {
		t.Fatalf("status=%d want 400", status)
	}
	if resp.ResultType != "error" || !strings.Contains(resp.Error, "wallet_id") {
		t.Errorf("resp=%+v", resp)
	}
	if fake.sessionCalls.Load() != 0 {
		t.Errorf("upstream was called for invalid request")
	}
}

func TestProxy_RejectsMissingMessage(t *testing.T) {
	fake := newFakeMpcd(t, "")
	p := newProxyAgainst(fake)

	status, resp := postBridgeSign(t, p, bridgeSignReq{WalletID: "w-1"})
	if status != http.StatusBadRequest {
		t.Fatalf("status=%d want 400", status)
	}
	if resp.ResultType != "error" || !strings.Contains(resp.Error, "message") {
		t.Errorf("resp=%+v", resp)
	}
}

func TestProxy_503WhenUpstreamNotConfigured(t *testing.T) {
	p := &Proxy{} // no UpstreamURL
	status, resp := postBridgeSign(t, p, bridgeSignReq{WalletID: "w", Message: "0xab"})
	if status != http.StatusServiceUnavailable {
		t.Fatalf("status=%d want 503", status)
	}
	if !strings.Contains(resp.Error, "not configured") {
		t.Errorf("error msg=%q", resp.Error)
	}
}

// =============================================================================
// Upstream failure passthrough
// =============================================================================

func TestProxy_SessionDeniedSurfacesAs403(t *testing.T) {
	fake := newFakeMpcd(t, "tok")
	fake.sessionFails.Store(true)
	fake.sessionCode = http.StatusForbidden
	fake.sessionBody = []byte(`{"error":"requested session grant exceeds wallet policy"}`)
	p := newProxyAgainst(fake)

	status, resp := postBridgeSign(t, p, bridgeSignReq{WalletID: "w", Message: "0xab"})
	if status != http.StatusForbidden {
		t.Fatalf("status=%d want 403", status)
	}
	if !strings.Contains(resp.Error, "session_mint") {
		t.Errorf("error should label upstream op: %q", resp.Error)
	}
	if !strings.Contains(resp.Error, "exceeds wallet policy") {
		t.Errorf("upstream detail not preserved: %q", resp.Error)
	}
	if fake.signCalls.Load() != 0 {
		t.Errorf("sign should not be called when session mint fails")
	}
	if got := p.Stats(); got.SessionErrors != 1 || got.SignFailures != 1 {
		t.Errorf("stats=%+v", got)
	}
}

func TestProxy_SignFailureSurfacesAs502(t *testing.T) {
	fake := newFakeMpcd(t, "tok")
	fake.signFails.Store(true)
	fake.signCode = http.StatusInternalServerError
	fake.signBody = []byte(`{"error":"signing failed: ceremony aborted"}`)
	p := newProxyAgainst(fake)

	status, resp := postBridgeSign(t, p, bridgeSignReq{WalletID: "w", Message: "0xab"})
	if status != http.StatusBadGateway {
		t.Fatalf("status=%d want 502 (upstream 5xx folds to 502)", status)
	}
	if resp.ErrorCode != http.StatusInternalServerError {
		t.Errorf("error_code=%d want upstream 500", resp.ErrorCode)
	}
	if !strings.Contains(resp.Error, "ceremony aborted") {
		t.Errorf("upstream detail not preserved: %q", resp.Error)
	}
}

func TestProxy_UpstreamAuthFailureSurfacesAs401(t *testing.T) {
	fake := newFakeMpcd(t, "real-token")
	p := newProxyAgainst(fake)
	p.UpstreamToken = "wrong-token" // proxy was misconfigured

	status, resp := postBridgeSign(t, p, bridgeSignReq{WalletID: "w", Message: "0xab"})
	if status != http.StatusUnauthorized {
		t.Fatalf("status=%d want 401 (auth failure passes through)", status)
	}
	if !strings.Contains(resp.Error, "session_mint") {
		t.Errorf("auth failure should be labelled session_mint (first call): %q", resp.Error)
	}
}

// =============================================================================
// Signature shape — guard against silent corruption
// =============================================================================

func TestProxy_RejectsResponseWithRSButNoConcatenatedSignature(t *testing.T) {
	fake := newFakeMpcd(t, "tok")
	// Override sign body to return r + s but no `signature` field.
	fake.signBody, _ = json.Marshal(mpcdSignResp{
		R: "0xaa",
		S: "0xbb",
	})
	fake.signCode = http.StatusOK
	// Custom handler that emits the override body even on success.
	old := fake.server.Config.Handler
	fake.server.Config.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/mpc/sign" {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write(fake.signBody)
			return
		}
		old.ServeHTTP(w, r)
	})

	p := newProxyAgainst(fake)
	status, resp := postBridgeSign(t, p, bridgeSignReq{WalletID: "w", Message: "0xab"})
	if status != http.StatusBadGateway {
		t.Fatalf("status=%d want 502 (cannot derive v)", status)
	}
	if !strings.Contains(resp.Error, "cannot derive v") {
		t.Errorf("error should explain missing v byte: %q", resp.Error)
	}
}

// =============================================================================
// Concurrency
// =============================================================================

func TestProxy_ConcurrentSignsBothSucceed(t *testing.T) {
	fake := newFakeMpcd(t, "tok")
	p := newProxyAgainst(fake)

	const N = 10
	errs := make(chan error, N)
	for i := 0; i < N; i++ {
		go func() {
			body, _ := json.Marshal(bridgeSignReq{
				WalletID: "w-cc",
				Message:  "0xab",
			})
			r := httptest.NewRequest(http.MethodPost, "/sign", bytes.NewReader(body))
			w := httptest.NewRecorder()
			p.handleSign(w, r)
			if w.Code != http.StatusOK {
				errs <- httpErr(w.Code)
				return
			}
			errs <- nil
		}()
	}
	deadline := time.After(5 * time.Second)
	for i := 0; i < N; i++ {
		select {
		case err := <-errs:
			if err != nil {
				t.Errorf("concurrent call %d failed: %v", i, err)
			}
		case <-deadline:
			t.Fatalf("concurrent calls didn't finish in time (received %d/%d)", i, N)
		}
	}
	if fake.sessionCalls.Load() != N || fake.signCalls.Load() != N {
		t.Errorf("expected %d/%d upstream calls, got %d/%d",
			N, N, fake.sessionCalls.Load(), fake.signCalls.Load())
	}
	if got := p.Stats(); got.SignSuccess != N {
		t.Errorf("success count=%d want %d", got.SignSuccess, N)
	}
}

// =============================================================================
// Method gate + health
// =============================================================================

func TestProxy_RejectsGET(t *testing.T) {
	fake := newFakeMpcd(t, "tok")
	p := newProxyAgainst(fake)
	r := httptest.NewRequest(http.MethodGet, "/sign", nil)
	w := httptest.NewRecorder()
	p.handleSign(w, r)
	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status=%d want 405", w.Code)
	}
}

func TestProxy_HealthDoesNotCallUpstream(t *testing.T) {
	fake := newFakeMpcd(t, "tok")
	p := newProxyAgainst(fake)
	r := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()
	p.handleHealth(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d want 200", w.Code)
	}
	var body map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	if got, _ := body["sign_upstream_configured"].(bool); !got {
		t.Errorf("expected sign_upstream_configured=true, body=%v", body)
	}
	if got, _ := body["keygen_upstream_configured"].(bool); !got {
		t.Errorf("expected keygen_upstream_configured=true (falls back to sign upstream), body=%v", body)
	}
	if mode, _ := body["sign_mode"].(string); mode != "translate" {
		t.Errorf("default sign_mode=%q want translate", mode)
	}
	if fake.sessionCalls.Load() != 0 || fake.signCalls.Load() != 0 {
		t.Errorf("/health must not call upstream")
	}
}

// =============================================================================
// Context cancellation
// =============================================================================

func TestProxy_RespectsCallerContextCancel(t *testing.T) {
	// A fake mpcd that hangs on the sign call simulates a slow ceremony.
	hang := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/mpc/wallets/w/sessions":
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(mpcdSessionResp{SessionID: "s", Status: "active"})
		case "/v1/mpc/sign":
			<-hang
		}
	}))
	defer srv.Close()
	defer close(hang)

	p := &Proxy{
		UpstreamURL:   srv.URL,
		UpstreamToken: "tok",
		SessionTTL:    30 * time.Second,
		HTTPClient:    &http.Client{Timeout: 5 * time.Second},
	}

	body, _ := json.Marshal(bridgeSignReq{WalletID: "w", Message: "0xab"})
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	r := httptest.NewRequest(http.MethodPost, "/sign", bytes.NewReader(body)).WithContext(ctx)
	w := httptest.NewRecorder()

	done := make(chan struct{})
	go func() {
		p.handleSign(w, r)
		close(done)
	}()

	select {
	case <-done:
		// Ctx-cancel means we return 502 (upstream error wrap from
		// the underlying http.Do failure). The exact code is less
		// important than the fact that we don't hang forever.
		if w.Code == http.StatusOK {
			t.Errorf("expected non-200 after cancel, got 200")
		}
	case <-time.After(2 * time.Second):
		t.Fatalf("handler did not return after context cancel")
	}
}

// =============================================================================
// fakeKeygenUpstream — minimal /keygen stub
// =============================================================================

// fakeKeygenUpstream serves POST /keygen in the bridge wire shape
// (mirrors mpcd's internal API at port :6000). Tests configure
// behavior by flipping flags before issuing a request.
type fakeKeygenUpstream struct {
	server *httptest.Server

	expectedToken string

	keygenFails atomic.Bool
	keygenCode  int    // override status code on failure
	keygenBody  []byte // override body (success or failure)

	calls atomic.Uint64

	// last request observed — for assertions on passthrough fidelity.
	lastReqBody atomic.Value // []byte
}

func newFakeKeygenUpstream(t *testing.T, token string) *fakeKeygenUpstream {
	t.Helper()
	f := &fakeKeygenUpstream{expectedToken: token}
	f.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if f.expectedToken != "" {
			got := r.Header.Get("Authorization")
			want := "Bearer " + f.expectedToken
			if got != want {
				http.Error(w, `{"error":"unauthorized: bad bearer"}`, http.StatusUnauthorized)
				return
			}
		}
		if r.URL.Path != "/keygen" {
			http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
			return
		}
		f.calls.Add(1)
		body, _ := io.ReadAll(r.Body)
		f.lastReqBody.Store(body)

		if f.keygenFails.Load() {
			code := f.keygenCode
			if code == 0 {
				code = http.StatusServiceUnavailable
			}
			w.WriteHeader(code)
			if len(f.keygenBody) > 0 {
				_, _ = w.Write(f.keygenBody)
			} else {
				_, _ = w.Write([]byte(`{"error":"peers not ready","result_type":"error"}`))
			}
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if len(f.keygenBody) > 0 {
			_, _ = w.Write(f.keygenBody)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"wallet_id":     "bridge-it-1",
			"ecdsa_pub_key": "04aabb",
			"eddsa_pub_key": "0001",
			"eth_address":   "0x1111111111111111111111111111111111111111",
			"btc_address":   "tb1qfakeaddress",
			"sol_address":   "SolFake111",
			"result_type":   "success",
		})
	}))
	t.Cleanup(f.server.Close)
	return f
}

func (f *fakeKeygenUpstream) URL() string { return f.server.URL }
func (f *fakeKeygenUpstream) LastReqBody() []byte {
	if v := f.lastReqBody.Load(); v != nil {
		return v.([]byte)
	}
	return nil
}

// postBridgeKeygen drives one /keygen call against the proxy and
// returns the raw status + body (the proxy passes body through
// verbatim, so we don't decode into a typed struct).
func postBridgeKeygen(t *testing.T, p *Proxy, body []byte) (int, []byte) {
	t.Helper()
	r := httptest.NewRequest(http.MethodPost, "/keygen", bytes.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	p.handleKeygen(w, r)
	out, _ := io.ReadAll(w.Body)
	return w.Code, out
}

// =============================================================================
// /keygen passthrough — happy path
// =============================================================================

func TestProxy_KeygenPassthroughSuccess(t *testing.T) {
	keygenFake := newFakeKeygenUpstream(t, "kg-token")
	signFake := newFakeMpcd(t, "sign-token")

	p := newProxyAgainst(signFake)
	p.KeygenUpstreamURL = keygenFake.URL()
	p.KeygenUpstreamToken = "kg-token"

	reqBody := []byte(`{"org_id":"bridge","wallet_id":""}`)
	status, body := postBridgeKeygen(t, p, reqBody)
	if status != http.StatusOK {
		t.Fatalf("status=%d body=%s", status, body)
	}
	if !strings.Contains(string(body), `"result_type":"success"`) {
		t.Errorf("upstream body not forwarded: %s", body)
	}
	if !strings.Contains(string(body), `"eth_address":"0x1111111111111111111111111111111111111111"`) {
		t.Errorf("expected eth address in body, got %s", body)
	}
	if keygenFake.calls.Load() != 1 {
		t.Errorf("expected 1 keygen upstream call, got %d", keygenFake.calls.Load())
	}
	// Body forwarded verbatim — the bridge passes org_id, we should see it.
	if got := keygenFake.LastReqBody(); string(got) != string(reqBody) {
		t.Errorf("upstream saw body %q, want %q", got, reqBody)
	}
	// Sign upstream untouched.
	if signFake.sessionCalls.Load() != 0 || signFake.signCalls.Load() != 0 {
		t.Errorf("/keygen must not call sign upstream")
	}
	if got := p.Stats(); got.KeygenSuccess != 1 || got.KeygenRequests != 1 {
		t.Errorf("stats=%+v", got)
	}
}

// TestProxy_KeygenFallsBackToSignUpstream confirms that when
// KeygenUpstreamURL is empty, /keygen targets UpstreamURL/keygen with
// the sign upstream's token.
func TestProxy_KeygenFallsBackToSignUpstream(t *testing.T) {
	// Build a single upstream that handles both /keygen AND the
	// sign endpoints — simulates an mpcd internal API serving both.
	keygenFake := newFakeKeygenUpstream(t, "shared-token")
	p := &Proxy{
		UpstreamURL:   keygenFake.URL(),
		UpstreamToken: "shared-token",
		// KeygenUpstreamURL intentionally left empty.
		SessionTTL: 30 * time.Second,
		HTTPClient: &http.Client{Timeout: 5 * time.Second},
	}

	status, body := postBridgeKeygen(t, p, []byte(`{"org_id":"bridge","wallet_id":""}`))
	if status != http.StatusOK {
		t.Fatalf("status=%d body=%s", status, body)
	}
	if keygenFake.calls.Load() != 1 {
		t.Errorf("expected fallback to hit sign upstream's /keygen, got %d calls",
			keygenFake.calls.Load())
	}
}

// =============================================================================
// /keygen passthrough — failure forwarding
// =============================================================================

func TestProxy_KeygenForwardsUpstreamErrorVerbatim(t *testing.T) {
	keygenFake := newFakeKeygenUpstream(t, "kg-token")
	keygenFake.keygenFails.Store(true)
	keygenFake.keygenCode = http.StatusServiceUnavailable
	keygenFake.keygenBody = []byte(`{"error":"peers not ready","result_type":"error"}`)

	p := &Proxy{
		UpstreamURL:         "ignored-in-this-test",
		UpstreamToken:       "ignored",
		KeygenUpstreamURL:   keygenFake.URL(),
		KeygenUpstreamToken: "kg-token",
		HTTPClient:          &http.Client{Timeout: 5 * time.Second},
	}

	status, body := postBridgeKeygen(t, p, []byte(`{"org_id":"bridge","wallet_id":""}`))
	if status != http.StatusServiceUnavailable {
		t.Fatalf("status=%d want 503 (upstream forwarded verbatim)", status)
	}
	if !strings.Contains(string(body), `"peers not ready"`) {
		t.Errorf("upstream error body not forwarded: %s", body)
	}
	if got := p.Stats(); got.KeygenFailures != 1 {
		t.Errorf("stats=%+v want KeygenFailures=1", got)
	}
}

func TestProxy_KeygenRejectsGET(t *testing.T) {
	keygenFake := newFakeKeygenUpstream(t, "kg-token")
	p := &Proxy{
		UpstreamURL:         "x",
		KeygenUpstreamURL:   keygenFake.URL(),
		KeygenUpstreamToken: "kg-token",
	}
	r := httptest.NewRequest(http.MethodGet, "/keygen", nil)
	w := httptest.NewRecorder()
	p.handleKeygen(w, r)
	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status=%d want 405", w.Code)
	}
	if keygenFake.calls.Load() != 0 {
		t.Errorf("upstream was called on rejected method")
	}
}

func TestProxy_Keygen503WhenNoUpstream(t *testing.T) {
	p := &Proxy{} // no URLs at all
	status, body := postBridgeKeygen(t, p, []byte(`{"org_id":"bridge"}`))
	if status != http.StatusServiceUnavailable {
		t.Fatalf("status=%d want 503", status)
	}
	if !strings.Contains(string(body), "keygen upstream URL missing") {
		t.Errorf("body should explain missing config: %s", body)
	}
}

// =============================================================================
// /sign passthrough mode
// =============================================================================

// fakePassthroughSigner serves POST /sign in the bridge wire shape
// (mirrors mpcd's post-0ac96d6 internal API). Used to verify the
// proxy faithfully forwards both request body and response body.
type fakePassthroughSigner struct {
	server      *httptest.Server
	lastReqBody atomic.Value
	calls       atomic.Uint64
	tok         string
}

func newFakePassthroughSigner(t *testing.T, tok string) *fakePassthroughSigner {
	t.Helper()
	f := &fakePassthroughSigner{tok: tok}
	f.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/sign" {
			http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
			return
		}
		if f.tok != "" && r.Header.Get("Authorization") != "Bearer "+f.tok {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}
		f.calls.Add(1)
		body, _ := io.ReadAll(r.Body)
		f.lastReqBody.Store(body)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"wallet_id":   "w-pt",
			"signature":   "0xdeadbeef",
			"session_id":  "internal-session-1",
			"result_type": "success",
		})
	}))
	t.Cleanup(f.server.Close)
	return f
}

func TestProxy_SignPassthroughMode(t *testing.T) {
	upstream := newFakePassthroughSigner(t, "modern-mpcd-tok")
	p := &Proxy{
		UpstreamURL:   upstream.server.URL,
		UpstreamToken: "modern-mpcd-tok",
		SignMode:      SignModePassthrough,
		HTTPClient:    &http.Client{Timeout: 5 * time.Second},
	}

	status, resp := postBridgeSign(t, p, bridgeSignReq{
		OrgID:    "bridge",
		WalletID: "w-pt",
		Message:  "0xab12",
	})
	if status != http.StatusOK {
		t.Fatalf("status=%d resp=%+v", status, resp)
	}
	if resp.Signature != "0xdeadbeef" {
		t.Errorf("signature=%q want 0xdeadbeef", resp.Signature)
	}
	if resp.SessionID != "internal-session-1" {
		t.Errorf("session_id=%q want internal-session-1", resp.SessionID)
	}
	if resp.ResultType != "success" {
		t.Errorf("result_type=%q want success", resp.ResultType)
	}
	if upstream.calls.Load() != 1 {
		t.Errorf("expected 1 upstream call, got %d", upstream.calls.Load())
	}
	// Body forwarded verbatim — the upstream sees the org_id field
	// that translate mode wouldn't pass through.
	got := upstream.lastReqBody.Load().([]byte)
	if !strings.Contains(string(got), `"org_id":"bridge"`) {
		t.Errorf("upstream didn't see verbatim body (missing org_id): %s", got)
	}
	if !strings.Contains(string(got), `"message":"0xab12"`) {
		t.Errorf("upstream didn't see the message field: %s", got)
	}
	if got := p.Stats(); got.SignSuccess != 1 {
		t.Errorf("stats=%+v", got)
	}
}

func TestProxy_SignPassthroughForwardsUpstreamError(t *testing.T) {
	// Custom upstream that returns a bridge-shape error.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/sign" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte(`{"error":"no signing quorum","result_type":"error"}`))
			return
		}
		http.Error(w, "not found", http.StatusNotFound)
	}))
	defer srv.Close()

	p := &Proxy{
		UpstreamURL:   srv.URL,
		UpstreamToken: "x",
		SignMode:      SignModePassthrough,
	}

	status, resp := postBridgeSign(t, p, bridgeSignReq{
		WalletID: "w",
		Message:  "0xab",
	})
	if status != http.StatusServiceUnavailable {
		t.Fatalf("status=%d want 503 (upstream forwarded)", status)
	}
	if !strings.Contains(resp.Error, "no signing quorum") {
		t.Errorf("upstream error not preserved: %+v", resp)
	}
	if got := p.Stats(); got.SignFailures != 1 {
		t.Errorf("stats=%+v want SignFailures=1", got)
	}
}

// In passthrough mode the proxy must NOT touch the dashboard's
// sessions endpoint — otherwise we'd be doing extra work and
// imposing dashboard auth on a path that should be internal-API-only.
func TestProxy_SignPassthroughDoesNotCallSessionsEndpoint(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "/sessions") {
			t.Errorf("passthrough hit /sessions: %s", r.URL.Path)
		}
		if r.URL.Path == "/sign" {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"signature":"0xab","session_id":"s","result_type":"success"}`))
			return
		}
		http.NotFound(w, r)
	}))
	defer srv.Close()

	p := &Proxy{UpstreamURL: srv.URL, UpstreamToken: "tok", SignMode: SignModePassthrough}
	status, _ := postBridgeSign(t, p, bridgeSignReq{WalletID: "w", Message: "0xab"})
	if status != http.StatusOK {
		t.Fatalf("status=%d want 200", status)
	}
}

// =============================================================================
// httpErr helper
// =============================================================================

// httpErr is a small error helper for concurrent test failures.
type httpErr int

func (e httpErr) Error() string { return "status " + itoa(int(e)) }

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	out := ""
	neg := false
	if n < 0 {
		neg = true
		n = -n
	}
	for n > 0 {
		out = string(rune('0'+n%10)) + out
		n /= 10
	}
	if neg {
		out = "-" + out
	}
	return out
}
