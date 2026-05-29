package mchain

import (
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

// auth_test.go: exercises the dashboard-API signing path
// (POST /v1/mpc/wallets/{id}/sessions + POST /v1/mpc/sign).
//
// All tests drive the client against an httptest.Server mock that
// emulates the lux-mpc dashboard's shape:
//   - 201 Created on session create, returns sessionId + expiresAt
//   - 200 OK on /v1/mpc/sign, returns {signature,r,s}
//   - 401/403 paths to verify cache invalidation
//
// The mock counts session creates so tests can assert caching
// (one create → many signs).

// dashMock emulates the dashboard listener.
type dashMock struct {
	t              *testing.T
	server         *httptest.Server
	sessionCreates atomic.Int64
	signCalls      atomic.Int64
	// Programmable: which sessionID to issue, which signature to return.
	sessionID     string
	sessionExpiry time.Time
	signature     string
	r             string
	s             string
	// Programmable: HTTP status to return for the next sign call. 0 = 200.
	nextSignStatus atomic.Int64
	// Programmable: HTTP status to return for the next session call. 0 = 201.
	nextSessionStatus atomic.Int64
	// Last-seen auth header on /v1/mpc/sign — for "did we authenticate" tests.
	lastSignAuth atomic.Value // string

	// Last-seen body on /v1/mpc/sign — for wire-shape regression tests
	// (e.g. protocol opt-in, curve field presence).
	lastSignBody atomic.Value // map[string]any
}

func newDashMock(t *testing.T) *dashMock {
	t.Helper()
	m := &dashMock{t: t}
	m.sessionID = "sess_default"
	m.sessionExpiry = time.Now().Add(time.Hour).UTC()
	m.signature = "0x" + strings.Repeat("ab", 32) + strings.Repeat("cd", 32) + "00"
	m.lastSignAuth.Store("")
	m.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/sessions"):
			m.sessionCreates.Add(1)
			st := int(m.nextSessionStatus.Swap(0))
			if st != 0 {
				w.WriteHeader(st)
				_, _ = w.Write([]byte(`{"error":"forced"}`))
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"sessionId": m.sessionID,
				"walletId":  pathSegmentBefore(r.URL.Path, "/sessions"),
				"scopes":    []string{"sign"},
				"status":    "active",
				"createdAt": time.Now().UTC().Format(time.RFC3339Nano),
				"expiresAt": m.sessionExpiry.Format(time.RFC3339Nano),
			})
		case r.Method == http.MethodPost && r.URL.Path == "/v1/mpc/sign":
			m.signCalls.Add(1)
			m.lastSignAuth.Store(r.Header.Get("Authorization") + "|" + r.Header.Get("X-API-Key"))
			st := int(m.nextSignStatus.Swap(0))
			if st != 0 {
				w.WriteHeader(st)
				_, _ = w.Write([]byte(`{"error":"forced"}`))
				return
			}
			// Validate the body has the required fields.
			body, _ := io.ReadAll(r.Body)
			var req map[string]any
			_ = json.Unmarshal(body, &req)
			m.lastSignBody.Store(req)
			if req["sessionId"] == nil || req["walletId"] == nil || req["message"] == nil {
				w.WriteHeader(http.StatusBadRequest)
				_, _ = w.Write([]byte(`{"error":"missing fields"}`))
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]string{
				"signature": m.signature,
				"r":         m.r,
				"s":         m.s,
			})
		default:
			http.Error(w, "not found: "+r.URL.Path, http.StatusNotFound)
		}
	}))
	t.Cleanup(m.server.Close)
	return m
}

func pathSegmentBefore(path, marker string) string {
	idx := strings.Index(path, marker)
	if idx < 0 {
		return ""
	}
	pre := path[:idx]
	// take the last segment
	last := strings.LastIndex(pre, "/")
	if last < 0 {
		return pre
	}
	return pre[last+1:]
}

// =============================================================================
// Happy path
// =============================================================================

func TestSign_Dashboard_HappyPath(t *testing.T) {
	m := newDashMock(t)

	c := &Client{
		DashboardURL:    m.server.URL,
		DashboardAPIKey: "api-key-xyz",
		OrgID:           "test-org",
		Timeout:         2 * time.Second,
	}

	res, err := c.SignForWallet(context.Background(), "bridge-wallet-1", "0xdeadbeef")
	if err != nil {
		t.Fatalf("SignForWallet: %v", err)
	}
	if res.Signature == "" {
		t.Errorf("expected non-empty signature, got %+v", res)
	}
	if m.sessionCreates.Load() != 1 {
		t.Errorf("expected 1 session create, got %d", m.sessionCreates.Load())
	}
	if m.signCalls.Load() != 1 {
		t.Errorf("expected 1 sign call, got %d", m.signCalls.Load())
	}
	// X-API-Key header path
	auth := m.lastSignAuth.Load().(string)
	if !strings.Contains(auth, "api-key-xyz") {
		t.Errorf("expected X-API-Key header, got %q", auth)
	}
}

func TestSign_Dashboard_CachesSession(t *testing.T) {
	m := newDashMock(t)
	c := &Client{
		DashboardURL:    m.server.URL,
		DashboardAPIKey: "k",
		OrgID:           "test-org",
		Timeout:         2 * time.Second,
	}
	// Three signs against the same wallet — should mint one session.
	for i := 0; i < 3; i++ {
		if _, err := c.SignForWallet(context.Background(), "bridge-wallet-1", "0xabcdef01"); err != nil {
			t.Fatalf("sign %d: %v", i, err)
		}
	}
	if got := m.sessionCreates.Load(); got != 1 {
		t.Errorf("expected 1 session create across 3 signs, got %d", got)
	}
	if got := m.signCalls.Load(); got != 3 {
		t.Errorf("expected 3 sign calls, got %d", got)
	}
}

func TestSign_Dashboard_403_TriggersSessionRenew(t *testing.T) {
	m := newDashMock(t)
	c := &Client{
		DashboardURL:    m.server.URL,
		DashboardAPIKey: "k",
		OrgID:           "test-org",
		Timeout:         2 * time.Second,
	}
	// First sign — happy path.
	if _, err := c.SignForWallet(context.Background(), "w1", "0xaaaa"); err != nil {
		t.Fatalf("sign 1: %v", err)
	}

	// Force the next sign to 403 (simulating session reaped by the
	// dashboard while we slept). The client should drop its cached
	// session, mint a fresh one, retry once, and succeed.
	m.nextSignStatus.Store(http.StatusForbidden)

	if _, err := c.SignForWallet(context.Background(), "w1", "0xbbbb"); err != nil {
		t.Fatalf("sign 2 (with renew): %v", err)
	}
	if m.sessionCreates.Load() != 2 {
		t.Errorf("expected 2 session creates (initial + renew), got %d", m.sessionCreates.Load())
	}
}

// =============================================================================
// Bearer JWT path
// =============================================================================

func TestSign_Dashboard_PrefersBearerOverAPIKey(t *testing.T) {
	m := newDashMock(t)
	c := &Client{
		DashboardURL:    m.server.URL,
		DashboardToken:  "jwt-token-zzz",
		DashboardAPIKey: "api-key-should-be-ignored",
		OrgID:           "test-org",
		Timeout:         2 * time.Second,
	}
	if _, err := c.SignForWallet(context.Background(), "w", "0xabcd"); err != nil {
		t.Fatalf("sign: %v", err)
	}
	auth := m.lastSignAuth.Load().(string)
	if !strings.HasPrefix(auth, "Bearer jwt-token-zzz") {
		t.Errorf("expected Bearer auth, got %q", auth)
	}
	if strings.Contains(auth, "api-key-should-be-ignored") {
		t.Errorf("X-API-Key should not be set when Bearer is configured: %q", auth)
	}
}

// =============================================================================
// Failure modes
// =============================================================================

func TestSign_Dashboard_PendingApproval_Fails(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"sessionId": "sess_pending",
			"status":    "pending_approval",
			"expiresAt": time.Now().Add(time.Hour).Format(time.RFC3339Nano),
		})
	}))
	t.Cleanup(srv.Close)

	c := &Client{
		DashboardURL:    srv.URL,
		DashboardAPIKey: "k",
		OrgID:           "test-org",
		Timeout:         time.Second,
	}
	_, err := c.SignForWallet(context.Background(), "w", "0xab")
	if err == nil {
		t.Fatal("expected error on pending_approval, got nil")
	}
	if !strings.Contains(err.Error(), "pending_approval") {
		t.Errorf("expected pending_approval message, got %q", err.Error())
	}
}

func TestSign_Dashboard_HTTPError(t *testing.T) {
	m := newDashMock(t)
	m.nextSessionStatus.Store(http.StatusInternalServerError)
	c := &Client{
		DashboardURL:    m.server.URL,
		DashboardAPIKey: "k",
		OrgID:           "test-org",
		Timeout:         time.Second,
	}
	_, err := c.SignForWallet(context.Background(), "w", "0xab")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "HTTP 500") {
		t.Errorf("expected HTTP 500 message, got %q", err.Error())
	}
}

func TestSign_Dashboard_NeitherURLConfigured(t *testing.T) {
	c := &Client{OrgID: "t"} // no APIURL, no DashboardURL
	_, err := c.SignForWallet(context.Background(), "w", "0xab")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "neither APIURL nor DashboardURL") {
		t.Errorf("expected misconfig message, got %q", err.Error())
	}
}

// =============================================================================
// r+s composition (when dashboard returns only r/s, not signature)
// =============================================================================

func TestSign_Dashboard_ComposesSignatureFromRS(t *testing.T) {
	m := newDashMock(t)
	m.signature = ""
	m.r = "0xabc1" // short — should be padded
	m.s = "0xdef2"
	c := &Client{
		DashboardURL:    m.server.URL,
		DashboardAPIKey: "k",
		OrgID:           "test-org",
		Timeout:         time.Second,
	}
	res, err := c.SignForWallet(context.Background(), "w", "0xab")
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	if !strings.HasPrefix(res.Signature, "0x") {
		t.Errorf("expected 0x-prefixed signature, got %q", res.Signature)
	}
	// 0x + 32-byte r (64 chars) + 32-byte s (64 chars) + 1-byte v (2 chars) = 132
	if len(res.Signature) != 132 {
		t.Errorf("expected 132-char composed signature, got %d (%q)", len(res.Signature), res.Signature)
	}
	// Leading r component should be zero-padded.
	if !strings.HasPrefix(res.Signature, "0x"+strings.Repeat("0", 60)+"abc1") {
		t.Errorf("r component not zero-padded: %q", res.Signature[:70])
	}
}

// =============================================================================
// Protocol enum wire shape (PR#6)
// =============================================================================

// TestSign_Dashboard_OmitsProtocolByDefault asserts that callers using
// the curve-only sign path (SignForWalletOnCurve / SignForWallet) do
// NOT cause a "protocol" field to appear on the wire. This is the
// backward-compat contract — every dashboard older than the Protocol
// enum keeps receiving the exact body shape it was written against.
func TestSign_Dashboard_OmitsProtocolByDefault(t *testing.T) {
	m := newDashMock(t)
	c := &Client{
		DashboardURL:    m.server.URL,
		DashboardAPIKey: "k",
		OrgID:           "test-org",
		Timeout:         time.Second,
	}
	if _, err := c.SignForWalletOnCurve(context.Background(), "w", "0xab", CurveSecp256k1); err != nil {
		t.Fatalf("sign: %v", err)
	}
	body, ok := m.lastSignBody.Load().(map[string]any)
	if !ok {
		t.Fatal("no body captured")
	}
	if _, present := body["protocol"]; present {
		t.Errorf("protocol field must be omitted by default; got body[\"protocol\"] = %v", body["protocol"])
	}
	// Curve must still be present — pre-Protocol behavior preserved.
	if body["curve"] != string(CurveSecp256k1) {
		t.Errorf("curve field missing or wrong: %v", body["curve"])
	}
}

// TestSign_Dashboard_PassesProtocolWhenSet asserts that opting in to
// a non-default Protocol (e.g. PulsarM65) sends the literal protocol
// string on the wire. mpcd dispatches on this field to route the
// session to the matching threshold-protocol stack.
func TestSign_Dashboard_PassesProtocolWhenSet(t *testing.T) {
	cases := []struct {
		name     string
		protocol Protocol
		want     string
	}{
		{"pulsar-m-65", ProtocolPulsarM65, "pulsar-m-65"},
		{"pulsar-m-87", ProtocolPulsarM87, "pulsar-m-87"},
		{"corona", ProtocolCorona, "corona"},
		{"cggmp21 explicit", ProtocolCGGMP21, "cggmp21"},
		{"frost explicit", ProtocolFROST, "frost"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			m := newDashMock(t)
			c := &Client{
				DashboardURL:    m.server.URL,
				DashboardAPIKey: "k",
				OrgID:           "test-org",
				Timeout:         time.Second,
			}
			if _, err := c.SignForWalletOnProtocol(context.Background(), "w", "0xab", CurveSecp256k1, tc.protocol); err != nil {
				t.Fatalf("sign: %v", err)
			}
			body, _ := m.lastSignBody.Load().(map[string]any)
			if got := body["protocol"]; got != tc.want {
				t.Errorf("body[\"protocol\"] = %v, want %q", got, tc.want)
			}
		})
	}
}

// TestSign_Dashboard_ProtocolDefaultOmits asserts that explicitly
// passing ProtocolDefault (rather than relying on the curve-only path)
// also omits the field. Locks the "" → omit contract from protocol.go.
func TestSign_Dashboard_ProtocolDefaultOmits(t *testing.T) {
	m := newDashMock(t)
	c := &Client{
		DashboardURL:    m.server.URL,
		DashboardAPIKey: "k",
		OrgID:           "test-org",
		Timeout:         time.Second,
	}
	if _, err := c.SignForWalletOnProtocol(context.Background(), "w", "0xab", CurveSecp256k1, ProtocolDefault); err != nil {
		t.Fatalf("sign: %v", err)
	}
	body, _ := m.lastSignBody.Load().(map[string]any)
	if _, present := body["protocol"]; present {
		t.Errorf("ProtocolDefault must omit the field; got body[\"protocol\"] = %v", body["protocol"])
	}
}
