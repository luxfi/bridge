package mchain

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// auth.go: dashboard-API session management for the lux-mpc v2026-05
// daemon, where signing lives at
//
//	POST /v1/mpc/sign            with {message, encoding, walletId, sessionId, value}
//
// and every sign call requires a pre-created session minted via
//
//	POST /v1/mpc/wallets/{walletID}/sessions  with {scopes:["sign"], expiresAt}
//
// Both endpoints sit behind JWT (Bearer) or X-API-Key auth on the
// dashboard listener (port 8081). The internal API (port 9800) only
// exposes /keygen — there is no /sign there. Bridge's previous
// SignForWallet path POSTed to ${APIURL}/sign which never existed; it
// timed out at 75 s and the refund driver swept on top of it.
//
// This file owns the dashboard-specific session/sign machinery,
// kept out of client.go so the legacy keygen surface stays simple.
//
// Concurrency: the in-process session cache is sync.RWMutex'd and
// safe for concurrent callers. Each (walletID, orgID) tuple gets its
// own cached session; the cache renews lazily when an existing
// session's renewal deadline passes (15 minutes before declared
// ExpiresAt — buys headroom for clock skew between bridge and mpcd).

// =============================================================================
// Public knobs on *Client
// =============================================================================
//
// The fields below are read every sign call. They live on *Client (not
// on a separate type) so the bridge wiring in cmd/bridge/main.go stays
// in one constructor call.

// DashboardSigning reports whether the client is configured to route
// signing through the dashboard API (DashboardURL set). When false,
// SignForWalletWithOrg falls back to the legacy ${APIURL}/sign path
// (which the live cluster does NOT serve — useful only for in-process
// tests against a custom mock).
func (c *Client) DashboardSigning() bool { return c.DashboardURL != "" }

// dashboardClient picks the auth header style: Bearer when JWT is
// configured, X-API-Key otherwise.
func (c *Client) dashboardAuthHeader(req *http.Request) {
	if c.DashboardToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.DashboardToken)
		return
	}
	if c.DashboardAPIKey != "" {
		req.Header.Set("X-API-Key", c.DashboardAPIKey)
	}
}

// =============================================================================
// Session cache
// =============================================================================

// sessionCacheEntry is the in-memory state of one signing grant.
type sessionCacheEntry struct {
	SessionID string
	WalletID  string
	OrgID     string
	ExpiresAt time.Time
}

// sessionCache stores active sessions per (walletID, orgID). All
// accesses go through the mutex; lazy refresh on Acquire.
type sessionCache struct {
	mu      sync.Mutex
	entries map[string]sessionCacheEntry
}

func newSessionCache() *sessionCache {
	return &sessionCache{entries: map[string]sessionCacheEntry{}}
}

// key joins walletID + orgID so two tenants of the same wallet (only
// possible in test setups) don't share a session.
func cacheKey(orgID, walletID string) string { return orgID + "|" + walletID }

// SessionTTL is how long the bridge requests its dashboard signing
// session grant for. 24 hours is short enough to limit blast radius
// from a leaked JWT and long enough not to thrash the API.
const SessionTTL = 24 * time.Hour

// sessionRenewSkew is the headroom subtracted from ExpiresAt before
// the cached session is considered stale. 15 minutes is well above
// realistic clock-skew between the bridge pod and the mpcd dashboard.
const sessionRenewSkew = 15 * time.Minute

// SessionOperationLimit caps a single session at this many sign
// operations. Tuned to comfortably exceed swap throughput per pool
// rotation without tripping the dashboard's "pending approval" gate
// (server-side ceiling is 1000 per policy). 800 leaves headroom.
const SessionOperationLimit = 800

// =============================================================================
// EnsureDashboardSession
// =============================================================================

// EnsureDashboardSession returns a non-empty sessionID the caller can
// pass to POST /v1/mpc/sign. The session is created on first call per
// (walletID, orgID) and reused across subsequent calls until it
// nears expiry, at which point it's silently renewed.
//
// Errors:
//   - non-nil from the underlying HTTP call (transport, non-2xx)
//   - decode failure on the response body
func (c *Client) EnsureDashboardSession(ctx context.Context, walletID string) (string, error) {
	return c.EnsureDashboardSessionWithOrg(ctx, walletID, c.OrgID)
}

// EnsureDashboardSessionWithOrg is EnsureDashboardSession with an
// explicit per-call orgID, useful when the bridge spans tenants.
func (c *Client) EnsureDashboardSessionWithOrg(ctx context.Context, walletID, orgID string) (string, error) {
	if c.DashboardURL == "" {
		return "", &MPCError{Op: "session", Message: "DashboardURL not configured"}
	}
	if walletID == "" {
		return "", &MPCError{Op: "session", Message: "wallet_id required"}
	}
	if orgID == "" {
		return "", &MPCError{Op: "session", Message: "org_id required"}
	}
	c.sessionsOnce.Do(func() {
		c.sessions = newSessionCache()
	})

	k := cacheKey(orgID, walletID)

	c.sessions.mu.Lock()
	if e, ok := c.sessions.entries[k]; ok {
		if time.Until(e.ExpiresAt) > sessionRenewSkew {
			c.sessions.mu.Unlock()
			return e.SessionID, nil
		}
		// fallthrough: stale, drop the cached entry below
		delete(c.sessions.entries, k)
	}
	c.sessions.mu.Unlock()

	// Mint a fresh session. The dashboard hands sessions back
	// synchronously, so no poll loop.
	id, exp, err := c.createDashboardSession(ctx, walletID, orgID)
	if err != nil {
		return "", err
	}

	c.sessions.mu.Lock()
	c.sessions.entries[k] = sessionCacheEntry{
		SessionID: id,
		WalletID:  walletID,
		OrgID:     orgID,
		ExpiresAt: exp,
	}
	c.sessions.mu.Unlock()

	return id, nil
}

// createDashboardSession is the raw POST /v1/mpc/wallets/{id}/sessions
// call. Returns the session id + its declared expiry.
//
// Body: {"scopes":["sign"], "expiresAt":"<RFC3339>"}.
// No value/operation limits — the bridge does its own gas pre-check
// (see signing_driver.go) and we don't want the dashboard's
// "pending_approval" gate slowing first-time sessions.
//
// Response (201 Created): full sessionResponse including sessionId +
// expiresAt. We trust the server's expiresAt — it may clamp our
// request to a policy ceiling.
func (c *Client) createDashboardSession(ctx context.Context, walletID, orgID string) (string, time.Time, error) {
	body := map[string]any{
		"scopes":         []string{"sign"},
		"expiresAt":      time.Now().UTC().Add(SessionTTL).Format(time.RFC3339Nano),
		"operationLimit": SessionOperationLimit,
	}
	buf, _ := json.Marshal(body)

	callCtx, cancel := context.WithTimeout(ctx, c.timeout())
	defer cancel()

	url := strings.TrimRight(c.DashboardURL, "/") +
		"/v1/mpc/wallets/" + walletID + "/sessions"
	req, err := http.NewRequestWithContext(callCtx, http.MethodPost, url, bytes.NewReader(buf))
	if err != nil {
		return "", time.Time{}, fmt.Errorf("mchain: build session request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	c.dashboardAuthHeader(req)

	resp, err := c.httpClient().Do(req)
	if err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return "", time.Time{}, err
		}
		return "", time.Time{}, &MPCError{Op: "session", Message: err.Error()}
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", time.Time{}, &MPCError{
			Op:         "session",
			HTTPStatus: resp.StatusCode,
			Message: fmt.Sprintf("HTTP %d: %s",
				resp.StatusCode, truncate(respBody, 256)),
		}
	}

	// Dashboard returns the sessionResponse shape with mixed JSON
	// casing (sessionId, expiresAt). Decode into a focused struct.
	var parsed struct {
		SessionID string `json:"sessionId"`
		ExpiresAt string `json:"expiresAt"`
		Status    string `json:"status"`
	}
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", time.Time{}, &MPCError{
			Op:      "session",
			Message: fmt.Sprintf("decode session: %v (body=%s)", err, truncate(respBody, 200)),
		}
	}
	if parsed.SessionID == "" {
		return "", time.Time{}, &MPCError{
			Op:      "session",
			Message: "dashboard returned empty sessionId",
		}
	}
	// Refuse to cache a session that's already pending_approval: it
	// can't sign anything until a human approves it. Callers surface
	// that as a clear error rather than silently failing the next sign.
	if parsed.Status == "pending_approval" {
		return "", time.Time{}, &MPCError{
			Op: "session",
			Message: "dashboard returned pending_approval session — operator must approve before bridge can sign",
		}
	}

	exp, perr := time.Parse(time.RFC3339Nano, parsed.ExpiresAt)
	if perr != nil {
		// Best-effort: if the dashboard returned a non-RFC3339Nano
		// stamp, fall back to RFC3339 and last-resort to now+TTL.
		if exp, perr = time.Parse(time.RFC3339, parsed.ExpiresAt); perr != nil {
			exp = time.Now().UTC().Add(SessionTTL)
		}
	}
	return parsed.SessionID, exp, nil
}

// =============================================================================
// signViaDashboard — POST /v1/mpc/sign
// =============================================================================

// signViaDashboard performs one sign call against the dashboard API.
// It expects EnsureDashboardSession has already been called to seed
// the per-wallet session cache; if missing it bootstraps one inline.
//
// Wire shape: {message:"<hex>", encoding:"hex", walletId:"...", sessionId:"...", value:"0", curve:"..."}.
// Successful response shape: {signature:"<hex>", r:"<hex>", s:"<hex>"}.
//
// "value" is required by the dashboard's session accounting; we pass
// "0" because the bridge attaches no separate value-based session limit
// (the gas pre-check at the signing driver layer is the real cap).
//
// "curve" hints which threshold-signature scheme to use. The dashboard
// routes to ECDSA/secp256k1 by default; SOL/TON/DOT need Ed25519/FROST.
// Older dashboards that don't recognize the field fall back to their
// compile-time default (secp256k1) — the SOL finalizer rejects the
// resulting ECDSA-shaped signature with a clear error, so a deployment
// mismatch surfaces immediately.
func (c *Client) signViaDashboard(ctx context.Context, walletID, messageHex, orgID string, curve Curve, protocol Protocol) (*SignResult, error) {
	sessionID, err := c.EnsureDashboardSessionWithOrg(ctx, walletID, orgID)
	if err != nil {
		return nil, err
	}

	body := map[string]any{
		"message":   strings.TrimPrefix(strings.TrimPrefix(messageHex, "0x"), "0X"),
		"encoding":  "hex",
		"walletId":  walletID,
		"sessionId": sessionID,
		"value":     "0",
		"curve":     string(curve),
	}
	// Protocol hint is opt-in. Empty = the daemon picks based on curve
	// (cggmp21 for secp256k1, frost for ed25519) — preserves backwards
	// compatibility with every caller that pre-dates the Protocol enum.
	// When set, the daemon routes to the named threshold-protocol stack:
	// pulsar-m-65/87 for MLWE, corona for RLWE, etc. Older dashboards
	// ignore the field and silently fall back to curve dispatch.
	if protocol != ProtocolDefault {
		body["protocol"] = string(protocol)
	}
	buf, _ := json.Marshal(body)

	callCtx, cancel := context.WithTimeout(ctx, c.timeout())
	defer cancel()

	url := strings.TrimRight(c.DashboardURL, "/") + "/v1/mpc/sign"
	req, err := http.NewRequestWithContext(callCtx, http.MethodPost, url, bytes.NewReader(buf))
	if err != nil {
		return nil, fmt.Errorf("mchain: build dashboard sign request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	c.dashboardAuthHeader(req)

	resp, err := c.httpClient().Do(req)
	if err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return nil, err
		}
		return nil, &MPCError{Op: "sign", Message: err.Error()}
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	// 403 "session expired/revoked" → drop cache, recurse once. Race
	// case: another caller mid-flight invalidated the session, or the
	// dashboard reaper ran. Single retry is plenty.
	if resp.StatusCode == http.StatusForbidden && c.sessions != nil {
		c.sessions.mu.Lock()
		delete(c.sessions.entries, cacheKey(orgID, walletID))
		c.sessions.mu.Unlock()
		// One retry — propagate any errors from the second attempt
		// without further recursion (the cache is now empty, so an
		// EnsureDashboardSession will mint a fresh entry).
		newSession, sErr := c.EnsureDashboardSessionWithOrg(ctx, walletID, orgID)
		if sErr != nil {
			return nil, &MPCError{
				Op:         "sign",
				HTTPStatus: resp.StatusCode,
				Message:    fmt.Sprintf("HTTP 403 + session renew failed: %v", sErr),
			}
		}
		return c.signViaDashboardWithSession(ctx, walletID, messageHex, newSession, curve, protocol)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, &MPCError{
			Op:         "sign",
			HTTPStatus: resp.StatusCode,
			Message:    fmt.Sprintf("HTTP %d: %s", resp.StatusCode, truncate(respBody, 256)),
		}
	}

	return parseDashboardSignResponse(respBody, resp.StatusCode)
}

// signViaDashboardWithSession is the inner sign call once a session ID
// is known. Pulled out so the 403-retry path doesn't recurse through
// EnsureDashboardSession's cache-fill side effect twice.
func (c *Client) signViaDashboardWithSession(ctx context.Context, walletID, messageHex, sessionID string, curve Curve, protocol Protocol) (*SignResult, error) {
	body := map[string]any{
		"message":   strings.TrimPrefix(strings.TrimPrefix(messageHex, "0x"), "0X"),
		"encoding":  "hex",
		"walletId":  walletID,
		"sessionId": sessionID,
		"value":     "0",
		"curve":     string(curve),
	}
	if protocol != ProtocolDefault {
		body["protocol"] = string(protocol)
	}
	buf, _ := json.Marshal(body)

	callCtx, cancel := context.WithTimeout(ctx, c.timeout())
	defer cancel()

	url := strings.TrimRight(c.DashboardURL, "/") + "/v1/mpc/sign"
	req, err := http.NewRequestWithContext(callCtx, http.MethodPost, url, bytes.NewReader(buf))
	if err != nil {
		return nil, fmt.Errorf("mchain: build dashboard sign retry: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	c.dashboardAuthHeader(req)

	resp, err := c.httpClient().Do(req)
	if err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return nil, err
		}
		return nil, &MPCError{Op: "sign", Message: err.Error()}
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, &MPCError{
			Op:         "sign",
			HTTPStatus: resp.StatusCode,
			Message:    fmt.Sprintf("HTTP %d: %s", resp.StatusCode, truncate(respBody, 256)),
		}
	}
	return parseDashboardSignResponse(respBody, resp.StatusCode)
}

// parseDashboardSignResponse turns the dashboard's {signature, r, s}
// payload into a SignResult. The dashboard does not return a
// session_id on /v1/mpc/sign, so SessionID is left empty — callers
// that need it should fetch it from EnsureDashboardSession.
func parseDashboardSignResponse(respBody []byte, status int) (*SignResult, error) {
	var parsed struct {
		Signature string `json:"signature"`
		R         string `json:"r"`
		S         string `json:"s"`
	}
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return nil, &MPCError{
			Op:         "sign",
			HTTPStatus: status,
			Message:    fmt.Sprintf("decode dashboard sign: %v (body=%s)", err, truncate(respBody, 200)),
		}
	}
	// Compose a 65-byte recoverable EVM signature if the dashboard
	// only returned r+s. v defaults to 27 — the txassembler.ParseRSV
	// path tolerates the canonical-low parity and any malleability
	// would be caught when broadcast rejects the tx.
	if parsed.Signature == "" {
		if parsed.R == "" || parsed.S == "" {
			return nil, &MPCError{
				Op:      "sign",
				Message: "dashboard returned empty signature",
			}
		}
		r := strings.TrimPrefix(strings.TrimPrefix(parsed.R, "0x"), "0X")
		s := strings.TrimPrefix(strings.TrimPrefix(parsed.S, "0x"), "0X")
		// Pad each component to 32 bytes (64 hex chars) so the
		// downstream ParseRSV sees a canonical 65-byte buffer.
		r = padHexLeft(r, 64)
		s = padHexLeft(s, 64)
		parsed.Signature = "0x" + r + s + "00"
	}
	return &SignResult{
		Signature: parsed.Signature,
		SessionID: "", // dashboard /sign doesn't echo session id
	}, nil
}

// padHexLeft pads a hex string with leading zeros to the requested
// width. width is the target number of hex chars (not bytes).
func padHexLeft(h string, width int) string {
	if len(h) >= width {
		return h
	}
	return strings.Repeat("0", width-len(h)) + h
}
