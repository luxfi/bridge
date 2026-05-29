// Package solanarpc is a minimal Solana JSON-RPC client for the
// two operations the bridge actually needs to drive a Lux→Sol
// release: fetching a recent blockhash (so PreSign can stamp it on
// the unsigned tx) and broadcasting the signed tx via
// `sendTransaction`. Anything richer (slot subscriptions, websocket
// streams, multi-account fetches) is out of scope — operators
// looking for those should reach for a full client like
// `gagliardetto/solana-go`.
//
// Design notes:
//   - No third-party Solana SDK. Solana's RPC is just JSON over
//     HTTP, and the on-wire encoding for our two methods is small
//     enough to write directly. Keeps cmd/bridge's dep graph tight.
//   - Base58 encode/decode lives here as a single dependency point
//     for the rest of the bridge (txassembler + broadcast both need
//     it). Pure stdlib implementation, ~50 lines.
//   - The client is intentionally one struct with a configurable
//     URL + per-call timeout. We don't bundle commitment levels,
//     skip-preflight switches, or retry policy — the caller drives
//     those concerns at a higher level when they matter.
package solanarpc

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"sync/atomic"
	"time"
)

// DefaultTimeout caps a single RPC call. 15s mirrors the
// broadcast package's default — Solana validators respond in
// <500ms when healthy, but public RPCs occasionally stall.
const DefaultTimeout = 15 * time.Second

// Client speaks JSON-RPC 2.0 to a Solana RPC node.
//
// Zero value is usable — populate URL before calling any method.
// Safe for concurrent use; the only shared mutable state is the
// monotonic JSON-RPC id counter.
type Client struct {
	// URL is the Solana RPC endpoint. Required.
	URL string

	// Timeout caps each individual RPC call. Zero ⇒ DefaultTimeout.
	Timeout time.Duration

	// HTTPClient is the underlying HTTP transport.
	// Zero ⇒ http.DefaultClient.
	HTTPClient *http.Client

	// callSeq is the monotonic JSON-RPC `id` counter.
	callSeq atomic.Uint64
}

// New constructs a Client targeting a specific URL with the
// default timeout.
func New(url string) *Client {
	return &Client{URL: url, Timeout: DefaultTimeout}
}

// =============================================================================
// Errors
// =============================================================================

// ErrEmptyURL — the client wasn't configured. Surfacing distinctly
// so callers can tell "config bug" from "network error".
var ErrEmptyURL = errors.New("solanarpc: client URL not set")

// RPCError wraps a JSON-RPC error reply or a non-2xx HTTP status.
// The destination chain returned something — the request reached
// it — but the cluster rejected it (insufficient funds in the
// release wallet, stale blockhash, signature verification failed,
// etc.). Callers can switch on Code to special-case.
type RPCError struct {
	Method     string
	Code       int
	HTTPStatus int
	Message    string
	Data       json.RawMessage
}

func (e *RPCError) Error() string {
	if e.HTTPStatus != 0 {
		return fmt.Sprintf("solanarpc: %s HTTP %d: %s", e.Method, e.HTTPStatus, e.Message)
	}
	return fmt.Sprintf("solanarpc: %s code=%d: %s", e.Method, e.Code, e.Message)
}

// =============================================================================
// GetLatestBlockhash
// =============================================================================

// LatestBlockhash is the subset of getLatestBlockhash's response we
// care about. lastValidBlockHeight could be used to detect "stale
// before broadcast" but we don't gate on it today.
type LatestBlockhash struct {
	Blockhash            string // base58 32-byte string
	LastValidBlockHeight uint64
}

// GetLatestBlockhash fetches a recent blockhash from the cluster.
// The returned value goes into the message body PreSign assembles;
// the cluster will reject the tx if the blockhash isn't seen within
// ~150 slots (~60s on mainnet), so callers should sign and broadcast
// promptly.
//
// On-wire shape (per Solana JSON-RPC docs):
//
//	{"jsonrpc":"2.0","id":1,"method":"getLatestBlockhash",
//	 "params":[{"commitment":"finalized"}]}
//
//	→ {"jsonrpc":"2.0","result":{"context":{...},
//	    "value":{"blockhash":"<base58>","lastValidBlockHeight":<u64>}},"id":1}
//
// We request "finalized" to avoid signing against a blockhash that
// might disappear in a fork — slower than "confirmed", but the
// trade-off favors not orphaning a release tx.
func (c *Client) GetLatestBlockhash(ctx context.Context) (*LatestBlockhash, error) {
	if c.URL == "" {
		return nil, ErrEmptyURL
	}

	type respValue struct {
		Blockhash            string `json:"blockhash"`
		LastValidBlockHeight uint64 `json:"lastValidBlockHeight"`
	}
	type rpcResp struct {
		Result struct {
			Value respValue `json:"value"`
		} `json:"result"`
		Error *struct {
			Code    int             `json:"code"`
			Message string          `json:"message"`
			Data    json.RawMessage `json:"data,omitempty"`
		} `json:"error,omitempty"`
	}

	var out rpcResp
	if err := c.do(ctx, "getLatestBlockhash",
		[]any{map[string]string{"commitment": "finalized"}}, &out); err != nil {
		return nil, err
	}
	if out.Error != nil {
		return nil, &RPCError{
			Method:  "getLatestBlockhash",
			Code:    out.Error.Code,
			Message: out.Error.Message,
			Data:    out.Error.Data,
		}
	}
	if out.Result.Value.Blockhash == "" {
		return nil, &RPCError{Method: "getLatestBlockhash", Code: -32603, Message: "empty blockhash"}
	}
	return &LatestBlockhash{
		Blockhash:            out.Result.Value.Blockhash,
		LastValidBlockHeight: out.Result.Value.LastValidBlockHeight,
	}, nil
}

// =============================================================================
// SendTransaction
// =============================================================================

// SendTransaction submits a signed transaction to the cluster.
// `txBase58` is the fully-serialized, ed25519-signed transaction
// encoded as base58 (the format Solana expects when params include
// `{"encoding":"base58"}`).
//
// Returns the transaction signature (base58) on success. The
// signature can be used to poll for inclusion via getSignatureStatuses.
//
// We pass `skipPreflight=false` so the cluster catches obvious
// errors (signature mismatch, insufficient funds) BEFORE accepting
// the tx — this surfaces an actionable error in the swap's
// `last_error` field instead of letting the tx sit unconfirmed.
//
// On-wire:
//
//	{"jsonrpc":"2.0","id":1,"method":"sendTransaction",
//	 "params":[<base58_tx>,
//	   {"encoding":"base58","skipPreflight":false,
//	    "preflightCommitment":"confirmed","maxRetries":3}]}
//
//	→ {"jsonrpc":"2.0","result":"<base58_signature>","id":1}
func (c *Client) SendTransaction(ctx context.Context, txBase58 string) (string, error) {
	if c.URL == "" {
		return "", ErrEmptyURL
	}
	if txBase58 == "" {
		return "", errors.New("solanarpc: empty txBase58")
	}

	type rpcResp struct {
		Result string `json:"result"`
		Error  *struct {
			Code    int             `json:"code"`
			Message string          `json:"message"`
			Data    json.RawMessage `json:"data,omitempty"`
		} `json:"error,omitempty"`
	}

	params := []any{
		txBase58,
		map[string]any{
			"encoding":            "base58",
			"skipPreflight":       false,
			"preflightCommitment": "confirmed",
			"maxRetries":          3,
		},
	}
	var out rpcResp
	if err := c.do(ctx, "sendTransaction", params, &out); err != nil {
		return "", err
	}
	if out.Error != nil {
		return "", &RPCError{
			Method:  "sendTransaction",
			Code:    out.Error.Code,
			Message: out.Error.Message,
			Data:    out.Error.Data,
		}
	}
	if out.Result == "" {
		return "", &RPCError{Method: "sendTransaction", Code: -32603, Message: "empty signature"}
	}
	return out.Result, nil
}

// =============================================================================
// HTTP plumbing
// =============================================================================

func (c *Client) do(ctx context.Context, method string, params any, out any) error {
	body, err := json.Marshal(map[string]any{
		"jsonrpc": "2.0",
		"id":      c.callSeq.Add(1),
		"method":  method,
		"params":  params,
	})
	if err != nil {
		return fmt.Errorf("solanarpc: marshal %s: %w", method, err)
	}

	timeout := c.Timeout
	if timeout <= 0 {
		timeout = DefaultTimeout
	}
	callCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(callCtx, http.MethodPost, c.URL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	httpClient := c.HTTPClient
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return err
		}
		return &RPCError{Method: method, Message: err.Error()}
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return &RPCError{
			Method:     method,
			HTTPStatus: resp.StatusCode,
			Message:    string(respBody),
		}
	}
	if err := json.Unmarshal(respBody, out); err != nil {
		return fmt.Errorf("solanarpc: decode %s: %w (body=%s)", method, err, truncate(respBody, 200))
	}
	return nil
}

func truncate(b []byte, n int) string {
	if len(b) <= n {
		return string(b)
	}
	return string(b[:n]) + "..."
}

// =============================================================================
// Base58 (Bitcoin alphabet, also used by Solana)
// =============================================================================

// base58Alphabet is the canonical Bitcoin/Solana alphabet — no
// 0, O, I, or l to avoid visual ambiguity.
const base58Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

// EncodeBase58 returns the base58 encoding of `b`. Leading zero
// bytes are preserved by prepending '1's, matching the canonical
// Solana/Bitcoin encoding.
func EncodeBase58(b []byte) string {
	if len(b) == 0 {
		return ""
	}
	// Count leading zero bytes — they map to leading '1' chars.
	leadingZeros := 0
	for _, c := range b {
		if c != 0 {
			break
		}
		leadingZeros++
	}

	// Convert the rest via base-58 long division on a big.Int.
	x := new(big.Int).SetBytes(b)
	base := big.NewInt(58)
	mod := new(big.Int)
	out := make([]byte, 0, len(b)*2)
	for x.Sign() > 0 {
		x.DivMod(x, base, mod)
		out = append(out, base58Alphabet[mod.Int64()])
	}
	// `out` is little-endian; reverse to get the canonical form.
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	// Prepend leading '1's for each leading zero byte.
	prefix := make([]byte, leadingZeros)
	for i := range prefix {
		prefix[i] = '1'
	}
	return string(append(prefix, out...))
}

// DecodeBase58 decodes a base58-encoded string back to bytes.
// Returns an error if the input contains characters outside the
// alphabet. Empty string → empty slice (no error), matching
// the behaviour of common implementations.
func DecodeBase58(s string) ([]byte, error) {
	if s == "" {
		return nil, nil
	}
	// Count leading '1's — they map back to leading zero bytes.
	leadingOnes := 0
	for _, c := range s {
		if c != '1' {
			break
		}
		leadingOnes++
	}

	x := new(big.Int)
	base := big.NewInt(58)
	for _, c := range s {
		idx := -1
		for i := 0; i < len(base58Alphabet); i++ {
			if base58Alphabet[i] == byte(c) {
				idx = i
				break
			}
		}
		if idx < 0 {
			return nil, fmt.Errorf("solanarpc: invalid base58 character %q", c)
		}
		x.Mul(x, base)
		x.Add(x, big.NewInt(int64(idx)))
	}
	body := x.Bytes()
	out := make([]byte, leadingOnes+len(body))
	// leading zeros are already zero-initialised; just copy the body.
	copy(out[leadingOnes:], body)
	return out, nil
}
