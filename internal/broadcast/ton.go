package broadcast

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// ton.go: TON Center HTTP broadcaster for signed BOC (Bag of Cells)
// external messages.
//
// Wire shape: TON Center is the standard JSON-over-HTTPS gateway in
// front of TON liteservers. For broadcast, the relevant endpoint is
//
//	POST https://toncenter.com/api/v2/sendBoc          (mainnet)
//	POST https://testnet.toncenter.com/api/v2/sendBoc  (testnet)
//	{"boc": "<base64-encoded BOC>"}
//
// Auth: optional, via X-API-Key header. Unauthenticated callers are
// throttled to ~1 req/s; an API key raises the cap to ~10 req/s and
// is required at any meaningful production rate.
//
// Response shape on success:
//
//	{"ok": true, "result": {"@type":"ok","hash":"<base64 msg hash>"}}
//	(some toncenter forks also surface {"result":{"hash":"<hex>"}})
//
// Response shape on failure:
//
//	{"ok": false, "error": "<human-readable message>", "code": 400}
//
// The BOC accepted is the SERIALIZED EXTERNAL MESSAGE (i.e. the cell
// the wallet contract receives), not the body cell. The bridge's
// txassembler produces exactly that.
//
// "Tx hash" returned here is the IN-MESSAGE hash — the hash of the
// external message payload. To resolve a confirmed transaction hash
// (the on-chain tx record) callers later poll getTransactions and
// match by in_msg.hash. That polling is a separate concern; this
// package returns the in-message hash as the canonical broadcast
// identifier.

// =============================================================================
// Defaults
// =============================================================================
//
// The package-level rpcURLs table does NOT carry TON entries: TON Center
// requires an API key for production use, so the operator must opt in
// via RPCURLOverrides (or networks.yaml configuration) rather than
// implicitly hitting the public, rate-limited gateway. Tests pass an
// httptest.Server URL through RPCURLOverrides.
//
// TONDefaultMainnetURL / TONDefaultTestnetURL document the canonical
// values for operators who want to copy-paste, but they're NOT auto-
// populated.

const (
	// TONDefaultMainnetURL is the canonical TON Center sendBoc URL on
	// mainnet. Operators configure this via --source-rpc-overrides
	// (TON_MAINNET=...) or networks.yaml.
	TONDefaultMainnetURL = "https://toncenter.com/api/v2/sendBoc"

	// TONDefaultTestnetURL is the canonical TON Center sendBoc URL on
	// testnet.
	TONDefaultTestnetURL = "https://testnet.toncenter.com/api/v2/sendBoc"
)

// =============================================================================
// Errors
// =============================================================================

// ErrTONRateLimited surfaces TON Center 429 / "ratelimit" rejections.
// Retryable.
var ErrTONRateLimited = errors.New("broadcast: ton: rate limited")

// ErrTONMalformedBOC surfaces the gateway rejecting the BOC payload
// itself (bad cells, bad signature, bad seqno). NOT retryable — the
// signer would have to re-assemble.
var ErrTONMalformedBOC = errors.New("broadcast: ton: malformed BOC")

// ErrTONAccountNotInitialized — the wallet contract has no state on
// chain yet. The first external message MUST carry state_init; if
// the assembler omitted it the gateway returns "account not
// initialized" and the txassembler must re-build with state_init.
// Retryable from the orchestrator's POV (re-run PreSign → Sign →
// Finalize with init=true).
var ErrTONAccountNotInitialized = errors.New("broadcast: ton: account not initialized")

// TONError is the typed surface for TON Center error responses.
// Inspect Code (HTTP) + Result (textual) to triage.
type TONError struct {
	HTTPStatus int
	Code       int    // toncenter error code (often == HTTP status)
	Result     string // toncenter error message ("Bad Request: invalid boc", etc.)
	Retryable  bool
}

func (e *TONError) Error() string {
	tail := e.Result
	if tail == "" {
		tail = "unknown ton-center error"
	}
	return fmt.Sprintf("broadcast: ton HTTP %d (code=%d): %s", e.HTTPStatus, e.Code, tail)
}

// =============================================================================
// API-key wiring
// =============================================================================

// SetTONAPIKey records the X-API-Key value used when calling toncenter
// for a given network. Concurrent reads via tonAPIKey are safe under
// the same conventions as the rest of *Client (operator configures
// once at startup, then the broadcast driver reads).
func (c *Client) SetTONAPIKey(network, apiKey string) {
	if c.TONAPIKeys == nil {
		c.TONAPIKeys = map[string]string{}
	}
	c.TONAPIKeys[network] = apiKey
}

// tonAPIKey returns the X-API-Key value for `network`. Empty when
// unconfigured.
func (c *Client) tonAPIKey(network string) string {
	if c.TONAPIKeys == nil {
		return ""
	}
	return c.TONAPIKeys[network]
}

// =============================================================================
// Broadcast — TON family
// =============================================================================

// broadcastTON pushes a signed external-message BOC (hex or base64
// encoded) onto the TON network via the configured TON Center
// endpoint.
//
// Idempotency: re-broadcasting the same BOC after a successful first
// submission is a no-op at the gateway — toncenter returns a duplicate
// hash, which we treat as success (same semantics as eth_sendRawTransaction
// returning "already known").
func (c *Client) broadcastTON(ctx context.Context, url, network, raw string) (*BroadcastResult, error) {
	bocB64, err := normalizeTONPayload(raw)
	if err != nil {
		return nil, err
	}

	body, err := json.Marshal(map[string]any{"boc": bocB64})
	if err != nil {
		return nil, fmt.Errorf("broadcast: ton: marshal request: %w", err)
	}

	callCtx, cancel := context.WithTimeout(ctx, c.timeout())
	defer cancel()

	req, err := http.NewRequestWithContext(callCtx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("broadcast: ton: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	if k := c.tonAPIKey(network); k != "" {
		req.Header.Set("X-API-Key", k)
	}

	resp, err := c.httpClient().Do(req)
	if err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return nil, err
		}
		// Wrap transport errors as TONError with Retryable=true so
		// the broadcast driver keeps retrying.
		return nil, &TONError{
			HTTPStatus: 0,
			Result:     fmt.Sprintf("transport: %v", err),
			Retryable:  true,
		}
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	return parseTONResponse(resp.StatusCode, respBody)
}

// parseTONResponse decodes a TON Center sendBoc response. Pulled out
// for tests + so the retry-classification logic is reachable without
// spinning up HTTP.
func parseTONResponse(status int, body []byte) (*BroadcastResult, error) {
	// Two shapes seen across toncenter forks:
	//   1. {"ok":true,"result":{"@type":"ok","hash":"<b64>"}}
	//   2. {"ok":true,"result":{"hash":"<hex>"}}
	//   3. {"ok":false,"error":"<msg>","code":400}
	var parsed struct {
		OK     bool            `json:"ok"`
		Result json.RawMessage `json:"result,omitempty"`
		Error  string          `json:"error,omitempty"`
		Code   int             `json:"code,omitempty"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		// Some gateways return raw text on 5xx — fall back to a clear
		// error rather than blaming the JSON decoder.
		return nil, &TONError{
			HTTPStatus: status,
			Code:       status,
			Result:     truncTON(body, 256),
			Retryable:  isTONHTTPRetryable(status),
		}
	}

	if !parsed.OK || status < 200 || status >= 300 {
		te := &TONError{
			HTTPStatus: status,
			Code:       parsed.Code,
			Result:     parsed.Error,
			Retryable:  isTONHTTPRetryable(status) || isTONErrorRetryable(parsed.Error),
		}
		if te.Code == 0 {
			te.Code = status
		}
		if te.Result == "" {
			te.Result = truncTON(body, 200)
		}
		switch {
		case status == 429, strings.Contains(strings.ToLower(parsed.Error), "rate"):
			return nil, fmt.Errorf("%w: %s", ErrTONRateLimited, te.Error())
		case strings.Contains(strings.ToLower(parsed.Error), "not initialized"),
			strings.Contains(strings.ToLower(parsed.Error), "state_init"):
			return nil, fmt.Errorf("%w: %s", ErrTONAccountNotInitialized, te.Error())
		case isTONMalformedBOCErr(parsed.Error):
			// NOT retryable — the signer has to re-build.
			return nil, fmt.Errorf("%w: %s", ErrTONMalformedBOC, te.Error())
		}
		return nil, te
	}

	// Success path. Hash field can be base64 or hex depending on the
	// gateway; surface verbatim — downstream getTransactions polling
	// must accept the same encoding the gateway returned.
	var res struct {
		Hash string `json:"hash"`
	}
	if len(parsed.Result) > 0 {
		// "@type" field if present we ignore; just need hash.
		if err := json.Unmarshal(parsed.Result, &res); err != nil {
			return nil, &TONError{
				HTTPStatus: status,
				Code:       parsed.Code,
				Result:     fmt.Sprintf("decode result: %v (body=%s)", err, truncTON(body, 200)),
				Retryable:  false,
			}
		}
	}
	if res.Hash == "" {
		// Some toncenter forks omit the hash on success. The bridge
		// must still know SOMETHING canonical to identify the in-flight
		// message; we surface a synthetic placeholder so callers don't
		// see an empty TxHash but the broadcast driver advances the
		// swap. The first getTransactions poll will fill in the real hash.
		res.Hash = fmt.Sprintf("ton:sendBoc:ok:%d", status)
	}
	return &BroadcastResult{TxHash: res.Hash}, nil
}

// normalizeTONPayload accepts either:
//   - base64 (standard or url-safe) of the serialized BOC bytes — pass through;
//   - hex with or without 0x prefix — decode to bytes and base64-encode.
//
// The txassembler currently emits hex (consistent with the EVM raw-tx
// hex convention) so the hex branch is the live one. Operators
// pre-loading raw signed BOCs (e.g. via curl) can still use base64.
func normalizeTONPayload(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", ErrEmptyRawTx
	}
	if strings.HasPrefix(raw, "0x") || strings.HasPrefix(raw, "0X") {
		hexed := raw[2:]
		decoded, err := hexDecodeFlexible(hexed)
		if err != nil {
			return "", fmt.Errorf("broadcast: ton: decode hex payload: %w", err)
		}
		return base64.StdEncoding.EncodeToString(decoded), nil
	}
	// Heuristic: hex strings are even-length and all hex chars. If
	// the input matches that shape, treat it as hex; otherwise assume
	// it's already base64.
	if isHexString(raw) {
		decoded, err := hexDecodeFlexible(raw)
		if err == nil {
			return base64.StdEncoding.EncodeToString(decoded), nil
		}
		// Fall through — wasn't actually hex.
	}
	return raw, nil
}

// isHexString returns true if every char in s is a hex digit AND len
// is even (a real hex byte-string requires both).
func isHexString(s string) bool {
	if len(s) == 0 || len(s)%2 != 0 {
		return false
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c >= '0' && c <= '9':
		case c >= 'a' && c <= 'f':
		case c >= 'A' && c <= 'F':
		default:
			return false
		}
	}
	return true
}

// hexDecodeFlexible decodes a hex string to bytes without panicking on
// non-hex input.
func hexDecodeFlexible(s string) ([]byte, error) {
	if len(s)%2 != 0 {
		return nil, fmt.Errorf("odd-length hex string (%d)", len(s))
	}
	out := make([]byte, len(s)/2)
	for i := 0; i < len(out); i++ {
		hi, ok1 := hexNibble(s[2*i])
		lo, ok2 := hexNibble(s[2*i+1])
		if !ok1 || !ok2 {
			return nil, fmt.Errorf("invalid hex char at %d", 2*i)
		}
		out[i] = byte(hi)<<4 | byte(lo)
	}
	return out, nil
}

func hexNibble(c byte) (int, bool) {
	switch {
	case c >= '0' && c <= '9':
		return int(c - '0'), true
	case c >= 'a' && c <= 'f':
		return int(c-'a') + 10, true
	case c >= 'A' && c <= 'F':
		return int(c-'A') + 10, true
	}
	return 0, false
}

func isTONHTTPRetryable(status int) bool {
	switch status {
	case 429, 500, 502, 503, 504:
		return true
	}
	return false
}

func isTONErrorRetryable(msg string) bool {
	lo := strings.ToLower(msg)
	switch {
	case strings.Contains(lo, "rate"),
		strings.Contains(lo, "limit"),
		strings.Contains(lo, "timeout"),
		strings.Contains(lo, "unavailable"),
		strings.Contains(lo, "internal error"):
		return true
	}
	return false
}

// isTONMalformedBOCErr returns true for the canonical malformed-BOC
// error strings toncenter surfaces (each fork phrases them slightly
// differently). These are NOT retryable.
func isTONMalformedBOCErr(msg string) bool {
	lo := strings.ToLower(msg)
	switch {
	case strings.Contains(lo, "invalid boc"),
		strings.Contains(lo, "malformed"),
		strings.Contains(lo, "wrong signature"),
		strings.Contains(lo, "invalid signature"),
		strings.Contains(lo, "invalid external message"):
		return true
	}
	return false
}

func truncTON(b []byte, n int) string {
	if len(b) <= n {
		return string(b)
	}
	return string(b[:n]) + "…"
}
