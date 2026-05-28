// Package main: mpc-sign-proxy — drop-in replacement for cmd/bridge's
// --mpc-url. Exposes the two endpoints the bridge's mchain.Client
// calls (POST /keygen, POST /sign) on a single host and translates
// each to the appropriate upstream.
//
// =============================================================================
// Why this exists
// =============================================================================
//
// cmd/bridge expects ONE mpc-url that hosts both /keygen and /sign in
// the wire shape baked into `internal/mchain`:
//
//	POST /keygen  {"org_id":"...","wallet_id":"..."}
//	  → {"wallet_id":"...","ecdsa_pub_key":"...","eth_address":"...",..., "result_type":"success"}
//
//	POST /sign    {"org_id":"...","wallet_id":"...","message":"<hex>"}
//	  → {"wallet_id":"...","signature":"<hex>","session_id":"...","result_type":"success"}
//
// The live lux-mpc cluster exposes these in two different places
// depending on its build:
//
//   - mpcd internal API (port :6000): ALWAYS hosts /keygen in the
//     bridge wire shape. Hosts /sign in the bridge wire shape only
//     after commit 0ac96d6 ("feat: add /sign endpoint for bridge
//     signing driver"). Earlier deployments lack /sign here.
//   - mpcd dashboard API (port :8081, JWT-gated): hosts a two-step
//     signing flow (POST /v1/mpc/wallets/{id}/sessions to mint a
//     session, then POST /v1/mpc/sign to consume it). Has NO
//     /keygen-shaped endpoint.
//
// So the realistic deployment matrix is "dashboard for sign, internal
// API for keygen." This proxy supports it natively with two upstream
// URLs:
//
//   --upstream-url         → dashboard (for /sign translation)
//   --keygen-upstream-url  → internal API (for /keygen passthrough);
//                            falls back to --upstream-url when empty.
//
// Operators running a post-0ac96d6 mpcd image can run both upstreams
// against the SAME internal API URL and set --sign-mode=passthrough
// so /sign forwards verbatim instead of dancing through the dashboard.
//
// =============================================================================
// Wire contract surfaced to cmd/bridge
// =============================================================================
//
//	POST /keygen
//	Content-Type: application/json
//	{"org_id":"...","wallet_id":"..."}
//
//	200 OK  {"wallet_id":"...","ecdsa_pub_key":"...","eth_address":"...","result_type":"success"}
//	4xx/5xx {"error":"...","result_type":"error"}     (upstream body, unchanged)
//
//	POST /sign
//	Content-Type: application/json
//	{"org_id":"...","wallet_id":"...","message":"<hex>"}
//
//	200 OK  {"wallet_id":"...","signature":"...","session_id":"...","result_type":"success"}
//	4xx/5xx {"wallet_id":"...","result_type":"error","error":"...","error_code":...}
//
// =============================================================================
// Auth model
// =============================================================================
//
// The proxy holds upstream credentials (one bearer token per upstream)
// that authenticate to the corresponding mpcd surface. It does NOT
// authenticate incoming bridge requests — the proxy is expected to be
// deployed inside the same cluster network namespace as cmd/bridge,
// so the network IS the authentication boundary. If exposed externally,
// front it with an authenticating ingress.

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync/atomic"
	"time"

	luxlog "github.com/luxfi/log"
)

// =============================================================================
// Wire shapes — bridge side
// =============================================================================

// bridgeSignReq is the request shape cmd/bridge's mchain.SignForWallet
// posts. snake_case mirrors the existing TS / Go client contract.
type bridgeSignReq struct {
	OrgID    string `json:"org_id"`
	WalletID string `json:"wallet_id"`
	Message  string `json:"message"`
}

// bridgeSignResp is the response shape the bridge expects. result_type
// is the success/error discriminator (mirrors keygen).
type bridgeSignResp struct {
	WalletID   string `json:"wallet_id"`
	Signature  string `json:"signature,omitempty"`
	SessionID  string `json:"session_id,omitempty"`
	ResultType string `json:"result_type"`
	Error      string `json:"error,omitempty"`
	ErrorCode  int    `json:"error_code,omitempty"`
}

// =============================================================================
// Wire shapes — mpcd dashboard side
// =============================================================================

// mpcdSessionReq is the request body for
// POST /v1/mpc/wallets/{id}/sessions. We always request scope=["sign"]
// and OperationLimit=1 — the session is for exactly one sign call,
// minted just-in-time per bridge /sign request. Keeping the budget
// tight limits blast radius if a session leaks.
type mpcdSessionReq struct {
	Scopes         []string  `json:"scopes"`
	OperationLimit *int      `json:"operationLimit,omitempty"`
	ExpiresAt      time.Time `json:"expiresAt"`
}

// mpcdSessionResp captures the fields we read from
// POST /v1/mpc/wallets/{id}/sessions. The endpoint returns more —
// (createdAt, status, scopes, etc.) — but we only need the id.
type mpcdSessionResp struct {
	SessionID string `json:"sessionId"`
	Status    string `json:"status"`
}

// mpcdSignReq is the body for POST /v1/mpc/sign. encoding=hex matches
// what cmd/bridge sends; mpcd's decodeMessage strips a leading 0x.
type mpcdSignReq struct {
	Message   string `json:"message"`
	Encoding  string `json:"encoding"`
	WalletID  string `json:"walletId"`
	SessionID string `json:"sessionId"`
}

// mpcdSignResp is the success body of POST /v1/mpc/sign. r + s are
// surfaced separately by mpcd; for bridge purposes the concatenated
// `signature` (r||s||v hex) is what we care about. If `signature` is
// empty but r/s are populated we concatenate them; the bridge's tx
// assembler then splits via txassembler.ParseRSV.
type mpcdSignResp struct {
	Signature string `json:"signature"`
	R         string `json:"r"`
	S         string `json:"s"`
}

// mpcdErrorBody is the canonical mpcd error envelope (writeError in
// pkg/api/middleware writes {"error":"..."}). We surface it verbatim
// in the bridge-side error response so operators can correlate logs.
type mpcdErrorBody struct {
	Error string `json:"error"`
}

// =============================================================================
// Proxy
// =============================================================================

// DefaultSessionTTL is the lifetime of each just-in-time session
// minted upstream. Long enough for the sign call to complete (mpcd
// ceremonies typically finish under 60 s); short enough that an
// abandoned session expires quickly.
const DefaultSessionTTL = 90 * time.Second

// DefaultUpstreamTimeout caps each individual upstream call. The
// session mint is fast (<1 s in practice); the sign + keygen calls
// dominate (10–60 s under load — both have ~60 s server-side
// timeouts). Tune via --upstream-timeout.
const DefaultUpstreamTimeout = 75 * time.Second

// SignMode controls how POST /sign is fulfilled.
type SignMode string

const (
	// SignModeTranslate is the default. /sign is fulfilled via the
	// two-step dashboard flow: mint a single-op `sign`-scoped session
	// on POST /v1/mpc/wallets/{id}/sessions, then consume it on
	// POST /v1/mpc/sign. Required when upstream is the mpcd dashboard
	// API. Cluster-side audit records the session grant.
	SignModeTranslate SignMode = "translate"

	// SignModePassthrough forwards POST /sign verbatim to
	// {UpstreamURL}/sign. Requires a modern mpcd image (commit
	// 0ac96d6 or later) where the internal API exposes /sign in the
	// bridge wire shape. Cleaner + faster than Translate, but only
	// works when upstream is the internal API, not the dashboard.
	SignModePassthrough SignMode = "passthrough"
)

// Proxy is the HTTP handler that fronts mpcd for the bridge.
// Concurrency-safe; the underlying http.Client is reused.
type Proxy struct {
	// UpstreamURL is the upstream base for /sign. In Translate mode
	// it must be the mpcd dashboard base URL (e.g.
	// http://mpcd-dashboard.lux-mpc.svc:8081). In Passthrough mode
	// it should be the mpcd internal API URL
	// (e.g. http://mpcd-internal.lux-mpc.svc:6000). Must NOT include
	// a trailing slash — the handler appends paths verbatim.
	UpstreamURL string
	// UpstreamToken is the bearer JWT / API token used for
	// /sign-related upstream calls. Required — mpcd rejects every
	// non-/health endpoint without an authenticated identity.
	UpstreamToken string

	// KeygenUpstreamURL is the upstream base for POST /keygen
	// passthrough. Falls back to UpstreamURL when empty. Most
	// realistic deployments set this to mpcd's internal API URL
	// (the dashboard API doesn't host a bridge-compatible /keygen).
	KeygenUpstreamURL string
	// KeygenUpstreamToken is the bearer for /keygen passthrough.
	// Falls back to UpstreamToken when empty. mpcd's internal API
	// uses a static bearer (internalAPIKey), not the dashboard's
	// per-user JWT, so the two often differ.
	KeygenUpstreamToken string

	// SignMode selects /sign behavior. Zero value defaults to
	// SignModeTranslate.
	SignMode SignMode

	// SessionTTL bounds each just-in-time session's lifetime
	// (Translate mode only — ignored in Passthrough).
	SessionTTL time.Duration

	// HTTPClient is the http.Client used for upstream calls. Zero
	// uses an internally-constructed client with the configured
	// timeout.
	HTTPClient *http.Client
	// Logger is the structured logger for proxy events.
	Logger luxlog.Logger

	// Counters — exposed via /metrics/stats. Atomic uint64 — safe
	// for concurrent updates.
	signRequests    atomic.Uint64
	signSuccess     atomic.Uint64
	signFailures    atomic.Uint64
	sessionErrors   atomic.Uint64
	keygenRequests  atomic.Uint64
	keygenSuccess   atomic.Uint64
	keygenFailures  atomic.Uint64
	upstreamErrs    atomic.Uint64
}

// signMode returns the effective sign mode, defaulting Translate.
func (p *Proxy) signMode() SignMode {
	if p.SignMode == SignModePassthrough {
		return SignModePassthrough
	}
	return SignModeTranslate
}

// keygenUpstream returns the URL + token used for /keygen passthrough,
// falling back to the sign upstream when not overridden.
func (p *Proxy) keygenUpstream() (string, string) {
	url := p.KeygenUpstreamURL
	if url == "" {
		url = p.UpstreamURL
	}
	token := p.KeygenUpstreamToken
	if token == "" {
		token = p.UpstreamToken
	}
	return url, token
}

// Stats is a point-in-time snapshot of the proxy's counters.
type Stats struct {
	SignRequests   uint64 `json:"sign_requests"`
	SignSuccess    uint64 `json:"sign_success"`
	SignFailures   uint64 `json:"sign_failures"`
	SessionErrors  uint64 `json:"session_errors"`
	KeygenRequests uint64 `json:"keygen_requests"`
	KeygenSuccess  uint64 `json:"keygen_success"`
	KeygenFailures uint64 `json:"keygen_failures"`
	UpstreamErrs   uint64 `json:"upstream_errors"`
}

func (p *Proxy) Stats() Stats {
	return Stats{
		SignRequests:   p.signRequests.Load(),
		SignSuccess:    p.signSuccess.Load(),
		SignFailures:   p.signFailures.Load(),
		SessionErrors:  p.sessionErrors.Load(),
		KeygenRequests: p.keygenRequests.Load(),
		KeygenSuccess:  p.keygenSuccess.Load(),
		KeygenFailures: p.keygenFailures.Load(),
		UpstreamErrs:   p.upstreamErrs.Load(),
	}
}

// Routes registers the proxy's HTTP routes on the given mux.
func (p *Proxy) Routes(mux *http.ServeMux) {
	mux.HandleFunc("/sign", p.handleSign)
	mux.HandleFunc("/keygen", p.handleKeygen)
	mux.HandleFunc("/health", p.handleHealth)
	mux.HandleFunc("/metrics/stats", p.handleStats)
}

// handleHealth returns a static OK plus flags showing whether the
// proxy is configured for each upstream. Useful for kubelet liveness
// probes — does NOT call upstream.
func (p *Proxy) handleHealth(w http.ResponseWriter, _ *http.Request) {
	keygenURL, keygenTok := p.keygenUpstream()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"status":                     "ok",
		"sign_upstream_configured":   p.UpstreamURL != "" && p.UpstreamToken != "",
		"keygen_upstream_configured": keygenURL != "" && keygenTok != "",
		"sign_mode":                  string(p.signMode()),
		"stats":                      p.Stats(),
	})
}

// handleStats returns the counters as JSON. Operators scrape this
// from an out-of-band monitor; not Prometheus-exposed by default
// because the proxy is intended to be tiny and dependency-light.
func (p *Proxy) handleStats(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(p.Stats())
}

// handleSign is the bridge-facing /sign endpoint. Branches on
// SignMode:
//   - Translate (default): runs the two-step dashboard flow.
//   - Passthrough:         forwards the original request body to
//                          {UpstreamURL}/sign verbatim.
func (p *Proxy) handleSign(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		p.writeError(w, "", http.StatusMethodNotAllowed, "POST required")
		return
	}
	p.signRequests.Add(1)

	// Drain the body once. We re-decode it for validation; in
	// passthrough mode we also need the original bytes to forward
	// upstream byte-for-byte.
	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil {
		p.signFailures.Add(1)
		p.writeError(w, "", http.StatusBadRequest, "read body: "+err.Error())
		return
	}

	var req bridgeSignReq
	if err := json.Unmarshal(bodyBytes, &req); err != nil {
		p.signFailures.Add(1)
		p.writeError(w, "", http.StatusBadRequest, "decode bridge request: "+err.Error())
		return
	}
	if req.WalletID == "" {
		p.signFailures.Add(1)
		p.writeError(w, "", http.StatusBadRequest, "wallet_id required")
		return
	}
	if req.Message == "" {
		p.signFailures.Add(1)
		p.writeError(w, req.WalletID, http.StatusBadRequest, "message required (hex-encoded)")
		return
	}

	// Defensive: caller may have configured the proxy without an
	// upstream. Surface a clean error rather than a confusing
	// upstream timeout.
	if p.UpstreamURL == "" {
		p.signFailures.Add(1)
		p.writeError(w, req.WalletID, http.StatusServiceUnavailable, "proxy not configured: upstream URL missing")
		return
	}

	ctx := r.Context()

	if p.signMode() == SignModePassthrough {
		p.passthroughSign(ctx, w, req.WalletID, bodyBytes)
		return
	}

	// Translate mode — two-step dashboard flow.
	sessionID, err := p.mintSession(ctx, req.WalletID)
	if err != nil {
		p.sessionErrors.Add(1)
		p.signFailures.Add(1)
		if pe, ok := err.(*upstreamError); ok {
			p.writeUpstreamError(w, req.WalletID, "session_mint", pe)
			return
		}
		p.writeError(w, req.WalletID, http.StatusBadGateway, "mint session: "+err.Error())
		return
	}

	sigHex, err := p.doSign(ctx, req.WalletID, sessionID, req.Message)
	if err != nil {
		p.signFailures.Add(1)
		if pe, ok := err.(*upstreamError); ok {
			p.writeUpstreamError(w, req.WalletID, "sign", pe)
			return
		}
		p.writeError(w, req.WalletID, http.StatusBadGateway, "sign: "+err.Error())
		return
	}

	p.signSuccess.Add(1)
	if p.Logger != nil {
		p.Logger.Info("sign request fulfilled (translate)",
			"wallet_id", req.WalletID,
			"session_id", sessionID,
		)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(bridgeSignResp{
		WalletID:   req.WalletID,
		Signature:  sigHex,
		SessionID:  sessionID,
		ResultType: "success",
	})
}

// passthroughSign forwards the original /sign body to {UpstreamURL}/sign
// verbatim. Used when SignMode is Passthrough — operators with a
// modern mpcd (post-0ac96d6) whose internal API natively exposes /sign
// in the bridge wire shape don't need the two-step dance.
//
// Faithful response forwarding: copies the upstream status code +
// body bytes through unchanged. mchain.SignForWallet does its own
// envelope parsing, so the proxy stays out of the way.
func (p *Proxy) passthroughSign(ctx context.Context, w http.ResponseWriter, walletID string, body []byte) {
	url := strings.TrimRight(p.UpstreamURL, "/") + "/sign"
	respBody, status, err := p.doUpstreamWithToken(ctx, http.MethodPost, url, body, p.UpstreamToken)
	if err != nil {
		p.signFailures.Add(1)
		p.upstreamErrs.Add(1)
		p.writeError(w, walletID, http.StatusBadGateway, "sign passthrough: "+err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(respBody)
	if status >= 200 && status < 300 {
		p.signSuccess.Add(1)
		if p.Logger != nil {
			p.Logger.Info("sign request fulfilled (passthrough)", "wallet_id", walletID)
		}
	} else {
		p.signFailures.Add(1)
		if p.Logger != nil {
			p.Logger.Warn("sign upstream returned non-2xx (passthrough)",
				"wallet_id", walletID,
				"upstream_status", status,
				"detail", truncate(string(respBody), 200),
			)
		}
	}
}

// handleKeygen forwards POST /keygen to the configured keygen
// upstream verbatim. The bridge wire shape matches mpcd's internal
// API output, so the proxy doesn't need to know the body — it just
// streams bytes both ways with the right bearer token attached.
//
// Auth: uses KeygenUpstreamToken if set, else UpstreamToken. mpcd's
// internal API gates /keygen behind a static bearer (internalAPIKey)
// which usually differs from the dashboard's per-user JWT.
func (p *Proxy) handleKeygen(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"POST required"}`, http.StatusMethodNotAllowed)
		return
	}
	p.keygenRequests.Add(1)

	keygenURL, keygenTok := p.keygenUpstream()
	if keygenURL == "" {
		p.keygenFailures.Add(1)
		http.Error(w, `{"error":"proxy not configured: keygen upstream URL missing","result_type":"error"}`,
			http.StatusServiceUnavailable)
		return
	}

	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil {
		p.keygenFailures.Add(1)
		http.Error(w, `{"error":"read body","result_type":"error"}`, http.StatusBadRequest)
		return
	}

	url := strings.TrimRight(keygenURL, "/") + "/keygen"
	respBody, status, err := p.doUpstreamWithToken(r.Context(), http.MethodPost, url, bodyBytes, keygenTok)
	if err != nil {
		p.keygenFailures.Add(1)
		p.upstreamErrs.Add(1)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"error":       "keygen passthrough: " + err.Error(),
			"result_type": "error",
		})
		if p.Logger != nil {
			p.Logger.Warn("keygen upstream call failed", "err", err.Error())
		}
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(respBody)
	if status >= 200 && status < 300 {
		p.keygenSuccess.Add(1)
		if p.Logger != nil {
			p.Logger.Info("keygen request fulfilled (passthrough)")
		}
	} else {
		p.keygenFailures.Add(1)
		if p.Logger != nil {
			p.Logger.Warn("keygen upstream returned non-2xx",
				"upstream_status", status,
				"detail", truncate(string(respBody), 200),
			)
		}
	}
}

// =============================================================================
// Upstream calls
// =============================================================================

// upstreamError carries the mpcd-side status + body so the proxy can
// pass through the original error message to the bridge.
type upstreamError struct {
	Op         string // "session_mint" | "sign"
	HTTPStatus int
	Body       string
}

func (e *upstreamError) Error() string {
	return fmt.Sprintf("upstream %s: HTTP %d: %s", e.Op, e.HTTPStatus, truncate(e.Body, 256))
}

// mintSession runs step 1 of the proxy flow.
func (p *Proxy) mintSession(ctx context.Context, walletID string) (string, error) {
	ttl := p.SessionTTL
	if ttl <= 0 {
		ttl = DefaultSessionTTL
	}
	opLimit := 1
	body, err := json.Marshal(mpcdSessionReq{
		Scopes:         []string{"sign"},
		OperationLimit: &opLimit,
		ExpiresAt:      time.Now().Add(ttl).UTC(),
	})
	if err != nil {
		return "", fmt.Errorf("marshal session req: %w", err)
	}

	url := strings.TrimRight(p.UpstreamURL, "/") + "/v1/mpc/wallets/" + walletID + "/sessions"
	respBody, status, err := p.doUpstream(ctx, http.MethodPost, url, body)
	if err != nil {
		p.upstreamErrs.Add(1)
		return "", err
	}
	if status < 200 || status >= 300 {
		return "", &upstreamError{Op: "session_mint", HTTPStatus: status, Body: string(respBody)}
	}

	var parsed mpcdSessionResp
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", fmt.Errorf("decode session resp: %w (body=%s)", err, truncate(string(respBody), 200))
	}
	if parsed.SessionID == "" {
		return "", fmt.Errorf("upstream returned empty session id (body=%s)", truncate(string(respBody), 200))
	}
	// pending_approval is a known non-active terminal state for sessions
	// that exceed wallet policy. The /sign step will reject it; we
	// surface the precise reason here so the operator log is clearer.
	if parsed.Status != "" && parsed.Status != "active" {
		return "", fmt.Errorf("session minted in non-active state %q (op_limit may exceed policy)", parsed.Status)
	}
	return parsed.SessionID, nil
}

// doSign runs step 2 of the proxy flow.
func (p *Proxy) doSign(ctx context.Context, walletID, sessionID, message string) (string, error) {
	body, err := json.Marshal(mpcdSignReq{
		Message:   message,
		Encoding:  "hex",
		WalletID:  walletID,
		SessionID: sessionID,
	})
	if err != nil {
		return "", fmt.Errorf("marshal sign req: %w", err)
	}

	url := strings.TrimRight(p.UpstreamURL, "/") + "/v1/mpc/sign"
	respBody, status, err := p.doUpstream(ctx, http.MethodPost, url, body)
	if err != nil {
		p.upstreamErrs.Add(1)
		return "", err
	}
	if status < 200 || status >= 300 {
		return "", &upstreamError{Op: "sign", HTTPStatus: status, Body: string(respBody)}
	}

	var parsed mpcdSignResp
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", fmt.Errorf("decode sign resp: %w (body=%s)", err, truncate(string(respBody), 200))
	}
	sig := parsed.Signature
	if sig == "" && parsed.R != "" && parsed.S != "" {
		// mpcd may emit r + s separately when v isn't yet derivable.
		// The bridge's tx assembler expects a 65-byte (r||s||v) blob;
		// without v we can't reconstruct it, so refuse rather than
		// silently corrupt downstream tx assembly.
		return "", fmt.Errorf("upstream returned r+s but no concatenated signature; cannot derive v")
	}
	if sig == "" {
		return "", fmt.Errorf("upstream returned empty signature (body=%s)", truncate(string(respBody), 200))
	}
	return sig, nil
}

// doUpstream is a convenience wrapper around doUpstreamWithToken that
// uses p.UpstreamToken. Used by the Translate-mode signing flow
// (mintSession + doSign) where both legs share the sign upstream's
// credentials.
func (p *Proxy) doUpstream(ctx context.Context, method, url string, body []byte) ([]byte, int, error) {
	return p.doUpstreamWithToken(ctx, method, url, body, p.UpstreamToken)
}

// doUpstreamWithToken is the shared HTTP transport for upstream calls.
// Sets the Authorization header from the supplied token (callers pass
// the appropriate one for the upstream — sign vs keygen may differ),
// applies the per-call timeout, and returns body+status+err.
func (p *Proxy) doUpstreamWithToken(ctx context.Context, method, url string, body []byte, token string) ([]byte, int, error) {
	client := p.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: DefaultUpstreamTimeout}
	}

	req, err := http.NewRequestWithContext(ctx, method, url, bytes.NewReader(body))
	if err != nil {
		return nil, 0, fmt.Errorf("build %s request: %w", method, err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("upstream %s %s: %w", method, url, err)
	}
	defer resp.Body.Close()
	out, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("read upstream body: %w", err)
	}
	return out, resp.StatusCode, nil
}

// =============================================================================
// Error encoding
// =============================================================================

// writeError emits a bridge-shaped error envelope at the given HTTP status.
func (p *Proxy) writeError(w http.ResponseWriter, walletID string, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(bridgeSignResp{
		WalletID:   walletID,
		ResultType: "error",
		Error:      msg,
		ErrorCode:  status,
	})
	if p.Logger != nil {
		p.Logger.Warn("proxy error", "status", status, "msg", msg, "wallet_id", walletID)
	}
}

// writeUpstreamError translates an upstream non-2xx response into the
// bridge error envelope. Preserves the upstream `error` field when
// mpcd emits its canonical {"error":"..."} body.
func (p *Proxy) writeUpstreamError(w http.ResponseWriter, walletID, op string, pe *upstreamError) {
	// Try to extract the upstream "error" field; fall back to body bytes.
	var inner mpcdErrorBody
	upstreamMsg := pe.Body
	if json.Unmarshal([]byte(pe.Body), &inner) == nil && inner.Error != "" {
		upstreamMsg = inner.Error
	}
	// Surface the upstream HTTP status when it's a clear 4xx/5xx;
	// 401/403 from the proxy is meaningful (token is wrong / lacks
	// role); 404 (wallet not found) too. Anything else folds into 502.
	status := http.StatusBadGateway
	switch pe.HTTPStatus {
	case http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound,
		http.StatusBadRequest, http.StatusTooManyRequests, http.StatusConflict:
		status = pe.HTTPStatus
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(bridgeSignResp{
		WalletID:   walletID,
		ResultType: "error",
		Error:      op + ": " + upstreamMsg,
		ErrorCode:  pe.HTTPStatus,
	})
	if p.Logger != nil {
		p.Logger.Warn("upstream error",
			"op", op,
			"upstream_status", pe.HTTPStatus,
			"wallet_id", walletID,
			"detail", truncate(upstreamMsg, 200),
		)
	}
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
