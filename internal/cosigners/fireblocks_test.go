package cosigners

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// ───────────────────────────────────────────────────────────────────────
//  Test fixtures + helpers
// ───────────────────────────────────────────────────────────────────────

// generateTestKey makes a fresh RSA-2048 key and returns it both as
// the parsed *rsa.PrivateKey and PEM-encoded form. The PEM is what a
// real SecretStore would hand to RunFireblocks.
func generateTestKey(t *testing.T) (*rsa.PrivateKey, string) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate rsa key: %v", err)
	}
	pkcs1 := x509.MarshalPKCS1PrivateKey(key)
	pemBytes := pem.EncodeToMemory(&pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: pkcs1,
	})
	return key, string(pemBytes)
}

// fbMockState is the in-memory FSM the mock server walks. Tests
// program it before each request.
type fbMockState struct {
	mu sync.Mutex

	// nextStatuses is consumed on each poll. The first call to
	// /v1/transactions/{id} returns nextStatuses[0], the second returns
	// nextStatuses[1], etc. When the slice is exhausted the mock
	// repeats the last value.
	nextStatuses []string

	// finalSig is what the mock embeds in signedMessages[0]
	// .signature.fullSig once the status reaches one of the terminal-
	// approved set. Empty leaves the field out (tests the
	// "missing-sig" branch).
	finalSig string

	// subStatus, when non-empty, is attached to every poll response.
	subStatus string

	// recordedCreateBodies holds the bodies of every POST
	// /v1/transactions for assertion. Cleared per test.
	recordedCreateBodies []map[string]any

	// recordedJWTs holds the JWT for each request. Allows tests to
	// decode and assert claim fields.
	recordedJWTs []string

	// pollIndex tracks which entry of nextStatuses to serve next.
	pollIndex int

	// createTxID is the id the mock returns from POST. Tests can
	// override; default is "tx-mock-0".
	createTxID string

	// createStatusCode overrides the create response's HTTP status.
	// 0 ⇒ 200.
	createStatusCode int

	// pollStatusCode, when non-zero, makes every poll respond with this
	// HTTP code (and a non-JSON body). Used to test 4xx/5xx polling.
	pollStatusCode int

	// pollGetCount counts polls; tests can assert non-zero.
	pollGetCount atomic.Int32
}

// newFBMock returns a programmable Fireblocks mock backed by httptest.
// Caller programs `state` before calling RunFireblocks, then closes
// the server via t.Cleanup.
func newFBMock(t *testing.T) (*httptest.Server, *fbMockState) {
	t.Helper()
	state := &fbMockState{createTxID: "tx-mock-0"}
	mux := http.NewServeMux()

	mux.HandleFunc("POST /v1/transactions", func(w http.ResponseWriter, r *http.Request) {
		state.mu.Lock()
		defer state.mu.Unlock()
		auth := r.Header.Get("Authorization")
		state.recordedJWTs = append(state.recordedJWTs, strings.TrimPrefix(auth, "Bearer "))
		body, _ := io.ReadAll(r.Body)
		var parsed map[string]any
		_ = json.Unmarshal(body, &parsed)
		state.recordedCreateBodies = append(state.recordedCreateBodies, parsed)

		if state.createStatusCode != 0 && state.createStatusCode != 200 {
			http.Error(w, "mock_error", state.createStatusCode)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]string{"id": state.createTxID})
	})

	mux.HandleFunc("GET /v1/transactions/", func(w http.ResponseWriter, r *http.Request) {
		state.pollGetCount.Add(1)
		state.mu.Lock()
		defer state.mu.Unlock()
		auth := r.Header.Get("Authorization")
		state.recordedJWTs = append(state.recordedJWTs, strings.TrimPrefix(auth, "Bearer "))

		if state.pollStatusCode != 0 && state.pollStatusCode != 200 {
			http.Error(w, "mock_poll_error", state.pollStatusCode)
			return
		}
		// pick the next status; sticky on exhaustion
		var status string
		if state.pollIndex < len(state.nextStatuses) {
			status = state.nextStatuses[state.pollIndex]
			state.pollIndex++
		} else if len(state.nextStatuses) > 0 {
			status = state.nextStatuses[len(state.nextStatuses)-1]
		}

		resp := getTransactionResponse{
			ID:        state.createTxID,
			Status:    status,
			SubStatus: state.subStatus,
		}
		if _, terminal := fireblocksTerminalApprove[status]; terminal && state.finalSig != "" {
			resp.SignedMessages = []signedMessageResponse{
				{Signature: signatureContainer{FullSig: state.finalSig}},
			}
		}
		_ = json.NewEncoder(w).Encode(resp)
	})

	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv, state
}

// newFamilyForTest wires a Fireblocks family that points at the mock,
// uses no sleep, and pins time. Returns the family and a context
// pre-populated with the test's deadline.
func newFamilyForTest(t *testing.T, srv *httptest.Server) FireblocksRESTFamily {
	t.Helper()
	return FireblocksRESTFamily{
		HTTPClient:   srv.Client(),
		PollInterval: 1 * time.Millisecond,
		Timeout:      2 * time.Second,
		Sleep:        func(time.Duration) {}, // no wall-clock delay in tests
		Now:          func() time.Time { return time.Unix(1_780_000_000, 0).UTC() },
		Nonce:        func() string { return "deterministic-nonce" },
	}
}

func makeIntent(srv *httptest.Server) *FireblocksIntent {
	return &FireblocksIntent{
		APIKey:         "test-api-key",
		APIHost:        srv.URL,
		VaultAccountID: "42",
	}
}

func makeOpts(swapID, txHash string) DispatchOptions {
	return DispatchOptions{
		SwapID:          swapID,
		NativeSignature: "0xdeadbeef",
		TxHash:          txHash,
		Cosigners:       []Intent{{Kind: KindFireblocks}},
	}
}

// ───────────────────────────────────────────────────────────────────────
//  Tests — RunFireblocks happy + terminal-status paths
// ───────────────────────────────────────────────────────────────────────

func TestFireblocks_HappyPath_PollsThroughToCompleted(t *testing.T) {
	_, pem := generateTestKey(t)
	srv, state := newFBMock(t)
	state.nextStatuses = []string{
		"SUBMITTED",
		"QUEUED",
		"PENDING_AUTHORIZATION",
		"PENDING_SIGNATURE",
		"COMPLETED",
	}
	state.finalSig = "0xabcd1234"

	fam := newFamilyForTest(t, srv)
	got := fam.RunFireblocks(context.Background(), makeIntent(srv), pem, makeOpts("swap_h", "0x1111"))

	if got.Status != StatusApproved {
		t.Fatalf("expected StatusApproved, got %s — reason=%q", got.Status, got.Reason)
	}
	if got.Signature != "0xabcd1234" {
		t.Errorf("expected signature 0xabcd1234, got %q", got.Signature)
	}
	if got.ExternalID != "tx-mock-0" {
		t.Errorf("expected ExternalID=tx-mock-0, got %q", got.ExternalID)
	}
	if state.pollGetCount.Load() < 5 {
		t.Errorf("expected at least 5 polls, got %d", state.pollGetCount.Load())
	}
}

func TestFireblocks_TerminalApprove_Variants(t *testing.T) {
	for _, status := range []string{"COMPLETED", "BROADCASTING", "CONFIRMING"} {
		t.Run(status, func(t *testing.T) {
			_, pem := generateTestKey(t)
			srv, state := newFBMock(t)
			state.nextStatuses = []string{status}
			state.finalSig = "0xfeedface"
			fam := newFamilyForTest(t, srv)
			got := fam.RunFireblocks(context.Background(), makeIntent(srv), pem,
				makeOpts("swap_"+status, "0x2222"))
			if got.Status != StatusApproved {
				t.Errorf("status=%s: expected StatusApproved, got %s reason=%q", status, got.Status, got.Reason)
			}
		})
	}
}

func TestFireblocks_TerminalReject_Variants(t *testing.T) {
	for _, status := range []string{"REJECTED", "CANCELLED", "BLOCKED"} {
		t.Run(status, func(t *testing.T) {
			_, pem := generateTestKey(t)
			srv, state := newFBMock(t)
			state.nextStatuses = []string{status}
			state.subStatus = "USER_DENIED"
			fam := newFamilyForTest(t, srv)
			got := fam.RunFireblocks(context.Background(), makeIntent(srv), pem,
				makeOpts("swap_rej", "0x3333"))
			if got.Status != StatusRejected {
				t.Fatalf("status=%s: expected StatusRejected, got %s reason=%q", status, got.Status, got.Reason)
			}
			if !strings.Contains(got.Reason, status) {
				t.Errorf("reason should mention status %q, got %q", status, got.Reason)
			}
			if !strings.Contains(got.Reason, "USER_DENIED") {
				t.Errorf("reason should include subStatus, got %q", got.Reason)
			}
		})
	}
}

func TestFireblocks_TerminalFail_Variants(t *testing.T) {
	for _, status := range []string{"FAILED", "TIMEOUT"} {
		t.Run(status, func(t *testing.T) {
			_, pem := generateTestKey(t)
			srv, state := newFBMock(t)
			state.nextStatuses = []string{status}
			fam := newFamilyForTest(t, srv)
			got := fam.RunFireblocks(context.Background(), makeIntent(srv), pem,
				makeOpts("swap_fail", "0x4444"))
			if got.Status != StatusFailed {
				t.Errorf("status=%s: expected StatusFailed, got %s reason=%q", status, got.Status, got.Reason)
			}
		})
	}
}

func TestFireblocks_CompletedButNoSignature_Failed(t *testing.T) {
	_, pem := generateTestKey(t)
	srv, state := newFBMock(t)
	state.nextStatuses = []string{"COMPLETED"}
	state.finalSig = "" // intentionally missing
	fam := newFamilyForTest(t, srv)
	got := fam.RunFireblocks(context.Background(), makeIntent(srv), pem,
		makeOpts("swap_nosig", "0x5555"))
	if got.Status != StatusFailed {
		t.Fatalf("expected StatusFailed when sig missing, got %s", got.Status)
	}
	if !strings.Contains(got.Reason, "signedMessages[0].signature.fullSig") {
		t.Errorf("reason should mention the missing field, got %q", got.Reason)
	}
}

// ───────────────────────────────────────────────────────────────────────
//  Failure-mode tests — HTTP / network / parse / timeout
// ───────────────────────────────────────────────────────────────────────

func TestFireblocks_CreateHTTPError_Failed(t *testing.T) {
	_, pem := generateTestKey(t)
	srv, state := newFBMock(t)
	state.createStatusCode = 401
	fam := newFamilyForTest(t, srv)
	got := fam.RunFireblocks(context.Background(), makeIntent(srv), pem,
		makeOpts("swap_401", "0x6666"))
	if got.Status != StatusFailed {
		t.Fatalf("expected StatusFailed on 401, got %s", got.Status)
	}
	if !strings.Contains(got.Reason, "401") {
		t.Errorf("reason should mention HTTP 401, got %q", got.Reason)
	}
	if got.ExternalID != "" {
		t.Errorf("ExternalID should be empty when create fails, got %q", got.ExternalID)
	}
}

func TestFireblocks_PollHTTPError_KeepsPollingUntilTimeout(t *testing.T) {
	_, pem := generateTestKey(t)
	srv, state := newFBMock(t)
	state.pollStatusCode = 500
	fam := newFamilyForTest(t, srv)
	fam.Timeout = 50 * time.Millisecond
	// Timeout tests need the deadline to advance through real time.
	// The default pinned Now would make c.now().Before(deadline) true
	// forever and the loop would never exit.
	fam.Now = nil
	got := fam.RunFireblocks(context.Background(), makeIntent(srv), pem,
		makeOpts("swap_pollerr", "0x7777"))
	if got.Status != StatusFailed {
		t.Fatalf("expected StatusFailed on poll timeout, got %s", got.Status)
	}
	if !strings.Contains(got.Reason, "timed out") {
		t.Errorf("reason should mention timeout, got %q", got.Reason)
	}
	if got.ExternalID != "tx-mock-0" {
		t.Errorf("ExternalID should carry the tx-id even on timeout, got %q", got.ExternalID)
	}
	if state.pollGetCount.Load() < 1 {
		t.Errorf("expected at least 1 poll attempt, got %d", state.pollGetCount.Load())
	}
}

func TestFireblocks_NeverTerminal_TimesOut(t *testing.T) {
	_, pem := generateTestKey(t)
	srv, state := newFBMock(t)
	state.nextStatuses = []string{"PENDING_AUTHORIZATION"} // sticks forever
	fam := newFamilyForTest(t, srv)
	fam.Timeout = 25 * time.Millisecond
	// Use real-time Now so the deadline actually advances.
	fam.Now = nil
	got := fam.RunFireblocks(context.Background(), makeIntent(srv), pem,
		makeOpts("swap_to", "0x8888"))
	if got.Status != StatusFailed {
		t.Fatalf("expected StatusFailed on timeout, got %s", got.Status)
	}
	if !strings.Contains(got.Reason, "timed out") {
		t.Errorf("reason should mention timeout, got %q", got.Reason)
	}
}

func TestFireblocks_ContextCancelled_Failed(t *testing.T) {
	_, pem := generateTestKey(t)
	srv, state := newFBMock(t)
	state.nextStatuses = []string{"PENDING_AUTHORIZATION"}

	fam := newFamilyForTest(t, srv)
	fam.Timeout = 5 * time.Second
	// Make the sleep block so context cancellation gets observed at the
	// loop boundary.
	fam.Sleep = func(d time.Duration) { time.Sleep(d) }

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()
	got := fam.RunFireblocks(ctx, makeIntent(srv), pem, makeOpts("swap_ctx", "0x9999"))
	if got.Status != StatusFailed {
		t.Fatalf("expected StatusFailed on cancellation, got %s", got.Status)
	}
	if !strings.Contains(got.Reason, "context") {
		t.Errorf("reason should mention context cancellation, got %q", got.Reason)
	}
}

func TestFireblocks_MalformedPEM_Failed(t *testing.T) {
	fam := FireblocksRESTFamily{
		Sleep:        func(time.Duration) {},
		PollInterval: 1 * time.Millisecond,
		Timeout:      1 * time.Second,
	}
	got := fam.RunFireblocks(context.Background(),
		&FireblocksIntent{APIKey: "k"}, "not-a-pem",
		makeOpts("swap_pem", "0xaaaa"))
	if got.Status != StatusFailed {
		t.Fatalf("expected StatusFailed on bad PEM, got %s", got.Status)
	}
	if !strings.Contains(got.Reason, "PEM") {
		t.Errorf("reason should mention PEM, got %q", got.Reason)
	}
}

func TestFireblocks_EmptyTxHash_Failed(t *testing.T) {
	_, pem := generateTestKey(t)
	fam := FireblocksRESTFamily{Sleep: func(time.Duration) {}}
	got := fam.RunFireblocks(context.Background(),
		&FireblocksIntent{APIKey: "k"}, pem,
		makeOpts("swap_emptyhash", ""))
	if got.Status != StatusFailed {
		t.Fatalf("expected StatusFailed on empty TxHash, got %s", got.Status)
	}
	if !strings.Contains(got.Reason, "TxHash") {
		t.Errorf("reason should mention empty TxHash, got %q", got.Reason)
	}
}

func TestFireblocks_NilIntent_Failed(t *testing.T) {
	_, pem := generateTestKey(t)
	fam := FireblocksRESTFamily{Sleep: func(time.Duration) {}}
	got := fam.RunFireblocks(context.Background(), nil, pem, makeOpts("swap_nil", "0xbbbb"))
	if got.Status != StatusFailed {
		t.Fatalf("expected StatusFailed on nil intent, got %s", got.Status)
	}
}

// ───────────────────────────────────────────────────────────────────────
//  Wire-shape + auth assertions — confirm Fireblocks gets what it expects
// ───────────────────────────────────────────────────────────────────────

func TestFireblocks_CreateBody_RAWSignShape(t *testing.T) {
	_, pem := generateTestKey(t)
	srv, state := newFBMock(t)
	state.nextStatuses = []string{"COMPLETED"}
	state.finalSig = "0xsig"
	fam := newFamilyForTest(t, srv)
	intent := &FireblocksIntent{APIKey: "k", APIHost: srv.URL, VaultAccountID: "vault-7"}
	got := fam.RunFireblocks(context.Background(), intent, pem,
		makeOpts("swap_body", "0xff00"))

	if got.Status != StatusApproved {
		t.Fatalf("preflight: expected StatusApproved, got %s reason=%q", got.Status, got.Reason)
	}
	state.mu.Lock()
	defer state.mu.Unlock()
	if len(state.recordedCreateBodies) != 1 {
		t.Fatalf("expected 1 create body recorded, got %d", len(state.recordedCreateBodies))
	}
	body := state.recordedCreateBodies[0]
	if body["operation"] != "RAW" {
		t.Errorf("operation = %v, want RAW", body["operation"])
	}
	src, _ := body["source"].(map[string]any)
	if src["type"] != "VAULT_ACCOUNT" {
		t.Errorf("source.type = %v, want VAULT_ACCOUNT", src["type"])
	}
	if src["id"] != "vault-7" {
		t.Errorf("source.id = %v, want vault-7", src["id"])
	}
	note, _ := body["note"].(string)
	if !strings.Contains(note, "swap_body") {
		t.Errorf("note should mention swap id, got %q", note)
	}
	ep, _ := body["extraParameters"].(map[string]any)
	rmd, _ := ep["rawMessageData"].(map[string]any)
	msgs, _ := rmd["messages"].([]any)
	if len(msgs) != 1 {
		t.Fatalf("expected 1 message, got %d", len(msgs))
	}
	msg, _ := msgs[0].(map[string]any)
	if msg["content"] != "ff00" {
		t.Errorf("message.content = %v, want ff00 (0x-stripped)", msg["content"])
	}
}

func TestFireblocks_DefaultVaultAccount_WhenIntentBlank(t *testing.T) {
	_, pem := generateTestKey(t)
	srv, state := newFBMock(t)
	state.nextStatuses = []string{"COMPLETED"}
	state.finalSig = "0xsig"
	fam := newFamilyForTest(t, srv)
	intent := &FireblocksIntent{APIKey: "k", APIHost: srv.URL} // no VaultAccountID

	_ = fam.RunFireblocks(context.Background(), intent, pem,
		makeOpts("swap_dvault", "0xcccc"))

	state.mu.Lock()
	defer state.mu.Unlock()
	if len(state.recordedCreateBodies) != 1 {
		t.Fatalf("expected create body recorded")
	}
	src, _ := state.recordedCreateBodies[0]["source"].(map[string]any)
	if src["id"] != FireblocksDefaultVaultAccount {
		t.Errorf("expected default vault %q, got %v", FireblocksDefaultVaultAccount, src["id"])
	}
}

func TestFireblocks_RequestCarriesValidJWT(t *testing.T) {
	key, pem := generateTestKey(t)
	srv, state := newFBMock(t)
	state.nextStatuses = []string{"COMPLETED"}
	state.finalSig = "0xsig"
	fam := newFamilyForTest(t, srv)

	got := fam.RunFireblocks(context.Background(), makeIntent(srv), pem,
		makeOpts("swap_jwt", "0xdddd"))
	if got.Status != StatusApproved {
		t.Fatalf("preflight: %s reason=%q", got.Status, got.Reason)
	}

	state.mu.Lock()
	jwts := append([]string(nil), state.recordedJWTs...)
	state.mu.Unlock()
	if len(jwts) < 1 {
		t.Fatalf("expected at least one JWT recorded")
	}
	for _, jwt := range jwts {
		assertJWTValid(t, jwt, &key.PublicKey)
	}
}

// assertJWTValid decodes the JWT, asserts the alg/header, claim
// signatures, and that the signature verifies against the test's
// public key.
func assertJWTValid(t *testing.T, jwt string, pub *rsa.PublicKey) {
	t.Helper()
	parts := strings.Split(jwt, ".")
	if len(parts) != 3 {
		t.Fatalf("jwt should have 3 segments, got %d", len(parts))
	}

	headerJSON, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		t.Fatalf("decode header: %v", err)
	}
	var header struct{ Alg, Typ string }
	if err := json.Unmarshal(headerJSON, &header); err != nil {
		t.Fatalf("parse header: %v", err)
	}
	if header.Alg != "RS256" || header.Typ != "JWT" {
		t.Errorf("unexpected header: %+v", header)
	}

	claimsJSON, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		t.Fatalf("decode claims: %v", err)
	}
	var claims fireblocksJWTClaims
	if err := json.Unmarshal(claimsJSON, &claims); err != nil {
		t.Fatalf("parse claims: %v", err)
	}
	if claims.Subject != "test-api-key" {
		t.Errorf("sub = %q, want test-api-key", claims.Subject)
	}
	if claims.Nonce != "deterministic-nonce" {
		t.Errorf("nonce = %q, want deterministic-nonce", claims.Nonce)
	}
	if claims.URI == "" {
		t.Errorf("uri claim missing")
	}
	if claims.BodyHash == "" {
		t.Errorf("bodyHash claim missing — should be sha256 of body, even when empty")
	}
	if claims.Expires <= claims.IssuedAt {
		t.Errorf("exp (%d) should be > iat (%d)", claims.Expires, claims.IssuedAt)
	}

	// Signature verification — replicate the signing input and call rsa.VerifyPKCS1v15.
	signingInput := parts[0] + "." + parts[1]
	sigBytes, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		t.Fatalf("decode sig: %v", err)
	}
	if err := verifyRS256(pub, []byte(signingInput), sigBytes); err != nil {
		t.Errorf("jwt signature does not verify against the test key: %v", err)
	}
}

func verifyRS256(pub *rsa.PublicKey, signingInput, sig []byte) error {
	hashed := sha256.Sum256(signingInput)
	return rsa.VerifyPKCS1v15(pub, crypto.SHA256, hashed[:], sig)
}

// ───────────────────────────────────────────────────────────────────────
//  Utila delegation — confirm RunUtila falls through to a delegate
// ───────────────────────────────────────────────────────────────────────

func TestFireblocks_RunUtila_DelegatesToStubByDefault(t *testing.T) {
	got := FireblocksRESTFamily{}.RunUtila(context.Background(),
		&UtilaIntent{OrgID: "o", ClientID: "c"}, "secret",
		makeOpts("swap_u", "0xeeee"))
	if got.Status != StatusFailed {
		t.Errorf("default delegate = stub, expected StatusFailed, got %s", got.Status)
	}
	if !strings.Contains(got.Reason, "not yet implemented") {
		t.Errorf("expected stub's 'not yet implemented' reason, got %q", got.Reason)
	}
}

func TestFireblocks_RunUtila_CustomDelegate(t *testing.T) {
	approving := approvingUtilaDelegate{}
	fam := FireblocksRESTFamily{UtilaDelegate: approving}
	got := fam.RunUtila(context.Background(),
		&UtilaIntent{OrgID: "o", ClientID: "c"}, "secret",
		makeOpts("swap_u2", "0xffff"))
	if got.Status != StatusApproved {
		t.Errorf("custom delegate should approve, got %s reason=%q", got.Status, got.Reason)
	}
}

// approvingUtilaDelegate is a test-only FamilyDispatcher that approves
// Utila calls and ignores Fireblocks (panics if called).
type approvingUtilaDelegate struct{}

func (approvingUtilaDelegate) RunUtila(_ context.Context, intent *UtilaIntent, _ string, _ DispatchOptions) Result {
	return Result{
		Intent:     Intent{Kind: KindUtila, Utila: intent},
		Status:     StatusApproved,
		Signature:  "utila-mock-sig",
		ExternalID: "utila-mock-ext",
	}
}
func (approvingUtilaDelegate) RunFireblocks(_ context.Context, _ *FireblocksIntent, _ string, _ DispatchOptions) Result {
	panic("approvingUtilaDelegate.RunFireblocks should not be called")
}
