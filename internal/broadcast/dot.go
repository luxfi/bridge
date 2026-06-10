// dot.go: Polkadot / Substrate broadcast handler.
//
// Wire shape: substrate JSON-RPC over HTTP (the WS variant is identical
// at the JSON-RPC envelope level; we use plain HTTP POST so we don't
// need a long-lived connection for one-shot submits).
//
//	POST <network rpc>
//	{"jsonrpc":"2.0","id":N,"method":"author_submitExtrinsic","params":["0x<hex extrinsic>"]}
//	→ {"jsonrpc":"2.0","id":N,"result":"0x<extrinsic hash>"}
//
// On the result branch the upstream returns the extrinsic hash (the
// 0x-prefixed blake2_256 of the encoded extrinsic body). On error,
// the error.message contains a structured failure code that maps to:
//
//	"Invalid::Stale"      — nonce too low; the user already submitted a
//	                        higher-nonce tx. Fatal — needs re-sign.
//	"Invalid::BadProof"   — signature didn't verify against signer
//	                        pubkey. Fatal — keygen / sign-context bug.
//	"Invalid::Future"     — nonce too high; will probably land on a
//	                        future block. Retryable — wait and retry.
//	"Module(...)"         — runtime returned a structured pallet error.
//	                        Usually fatal (e.g. ExistentialDeposit,
//	                        InsufficientBalance), unless the operator
//	                        can fund the wallet — then retry post-fund.
//
// Returning a hash from this layer means "the node accepted the
// extrinsic into its mempool" — NOT "finalized". The destination
// confirmation loop (a separate concern) polls block inclusion.
//
// Brand: Lux Network surface only.

package broadcast

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// =============================================================================
// DOT endpoints — destination-chain RPC URLs
// =============================================================================
//
// Polkadot mainnet uses wss://rpc.polkadot.io for the official feed;
// HTTPS variants exist too and are what we use for one-shot submits
// (no need to keep an open WS for a single author_submitExtrinsic).
//
// Westend is the canonical Polkadot testnet for end-to-end bridge
// dev — Kusama is "canary" production and not appropriate for testing.

func init() {
	// Polkadot mainnet — official RPC, HTTPS.
	rpcURLs["POLKADOT_MAINNET"] = "https://rpc.polkadot.io"
	// Westend — canonical Polkadot testnet.
	rpcURLs["POLKADOT_TESTNET"] = "https://westend-rpc.polkadot.io"
	// Kusama — production canary; included for completeness but the
	// bridge doesn't bootstrap KSM by default.
	rpcURLs["KUSAMA_MAINNET"] = "https://kusama-rpc.polkadot.io"
}

// =============================================================================
// Errors
// =============================================================================

// DOTBroadcastError is the DOT-specific error surface. Like
// BTCBroadcastError, the Retryable bit drives the orchestrator's
// retry vs. fail decision.
//
// Substrate error codes follow a stable taxonomy in
// sp_runtime::transaction_validity::TransactionValidityError. We
// classify them into the (Retryable, Fatal) buckets the orchestrator
// needs without trying to be exhaustive — unknown errors land in the
// fatal bucket by default rather than looping forever.
type DOTBroadcastError struct {
	// Op is "dot_author_submitExtrinsic" for log/metric tagging.
	Op string
	// HTTPStatus is the JSON-RPC envelope's HTTP status. 0 if the
	// request never made it that far.
	HTTPStatus int
	// Code is the substrate RPC error code when known (1010 = invalid
	// tx, 1011 = pool full, 1012 = already-in-pool).
	Code int
	// Message is the chain-side error message (raw text from upstream).
	Message string
	// Retryable indicates whether the orchestrator should leave the
	// swap in broadcasting and try again next tick. Fatal errors
	// require a fresh sign (Stale, BadProof) or a config fix (Module
	// errors that aren't fundable like CannotLookup).
	Retryable bool
}

func (e *DOTBroadcastError) Error() string {
	tag := "broadcast: dot"
	if e.HTTPStatus != 0 {
		tag = fmt.Sprintf("broadcast: dot HTTP %d rpc %d", e.HTTPStatus, e.Code)
	}
	if e.Retryable {
		return tag + " (retryable): " + e.Message
	}
	return tag + " (fatal): " + e.Message
}

// =============================================================================
// broadcastDOT — JSON-RPC submitter
// =============================================================================

// broadcastDOT submits a signed substrate extrinsic via
// author_submitExtrinsic. rawTxHex is the 0x-prefixed wire bytes from
// (*txassembler.DOTAssembler).Finalize().
//
// Returns *BroadcastResult{TxHash: <0x-prefixed extrinsic hash>} on
// success. *DOTBroadcastError on chain-side rejections. *RPCError on
// transport / non-2xx HTTP that doesn't carry a parseable JSON-RPC
// envelope.
func (c *Client) broadcastDOT(ctx context.Context, url, rawTxHex string) (*BroadcastResult, error) {
	rawTxHex = strings.TrimSpace(rawTxHex)
	if rawTxHex == "" {
		return nil, ErrEmptyRawTx
	}
	if !strings.HasPrefix(rawTxHex, "0x") && !strings.HasPrefix(rawTxHex, "0X") {
		rawTxHex = "0x" + rawTxHex
	}

	type rpcErr struct {
		Code    int             `json:"code"`
		Message string          `json:"message"`
		Data    json.RawMessage `json:"data,omitempty"`
	}
	type rpcResp struct {
		Result string  `json:"result"`
		Error  *rpcErr `json:"error,omitempty"`
	}

	body, err := json.Marshal(map[string]any{
		"jsonrpc": "2.0",
		"id":      c.callSeq.Add(1),
		"method":  "author_submitExtrinsic",
		"params":  []string{rawTxHex},
	})
	if err != nil {
		return nil, fmt.Errorf("broadcast: dot marshal: %w", err)
	}

	callCtx, cancel := context.WithTimeout(ctx, c.timeout())
	defer cancel()

	req, err := http.NewRequestWithContext(callCtx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient().Do(req)
	if err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return nil, err
		}
		return nil, &RPCError{Method: "author_submitExtrinsic", Code: -32000, Message: err.Error()}
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		// Try to parse a JSON-RPC error envelope before falling back to
		// a generic RPCError. Some substrate gateways return 4xx with
		// a structured body.
		var parsed rpcResp
		if jerr := json.Unmarshal(respBody, &parsed); jerr == nil && parsed.Error != nil {
			return nil, classifyDOTError(resp.StatusCode, parsed.Error.Code, parsed.Error.Message)
		}
		return nil, &RPCError{
			Method:     "author_submitExtrinsic",
			HTTPStatus: resp.StatusCode,
			Message:    fmt.Sprintf("HTTP %d: %s", resp.StatusCode, truncate(respBody, 200)),
		}
	}

	var parsed rpcResp
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return nil, &RPCError{
			Method:     "author_submitExtrinsic",
			HTTPStatus: resp.StatusCode,
			Message:    fmt.Sprintf("decode response: %v (body=%s)", err, truncate(respBody, 200)),
		}
	}

	if parsed.Error != nil {
		return nil, classifyDOTError(resp.StatusCode, parsed.Error.Code, parsed.Error.Message)
	}

	if parsed.Result == "" {
		return nil, &RPCError{
			Method:  "author_submitExtrinsic",
			Code:    -32603,
			Message: "empty extrinsic hash",
		}
	}

	return &BroadcastResult{TxHash: parsed.Result}, nil
}

// classifyDOTError maps a substrate RPC error code + message into a
// (retryable / fatal) bucket. The classification is conservative: any
// error we can't confidently identify as transient lands in fatal so
// the orchestrator escalates rather than looping.
//
// Substrate error code reference:
//   - 1010: Invalid transaction (see message for sub-classification)
//   - 1011: Pool is full (retry later)
//   - 1012: Already imported / future / transaction outdated
//   - 1013: Transaction has a bad signature (BadProof)
//   - 1014: Transaction would exhaust resources
//   - 1015: Method not found / runtime upgrade in progress (retry)
func classifyDOTError(httpStatus, code int, message string) *DOTBroadcastError {
	lower := strings.ToLower(message)
	retryable := false

	// Code-based first — these are authoritative.
	switch code {
	case 1011: // Pool full
		retryable = true
	case 1015: // Runtime call failed — often transient during upgrade
		retryable = true
	}

	// Message-based — more granular; substrate proxies all funnel into
	// code 1010 with the actual reason in the message.
	switch {
	case strings.Contains(lower, "future"):
		// Invalid::Future — nonce too high, will eventually land.
		retryable = true
	case strings.Contains(lower, "stale"):
		// Invalid::Stale — nonce too low. Caller must re-sign with a
		// fresher nonce; existing signed bytes can never become valid.
		retryable = false
	case strings.Contains(lower, "badproof"),
		strings.Contains(lower, "bad proof"),
		strings.Contains(lower, "bad signature"):
		// Invalid::BadProof — signature didn't verify. Either the
		// signing context was wrong (genesis hash, spec version, etc.)
		// or the wrong recovery byte was used. Re-sign required.
		retryable = false
	case strings.Contains(lower, "alreadyimported"),
		strings.Contains(lower, "already imported"),
		strings.Contains(lower, "already in pool"):
		// The node already has this exact extrinsic in its mempool.
		// Treat as success at the broadcast layer — the inclusion
		// loop will eventually see it landed.
		retryable = true
	case strings.Contains(lower, "pool"),
		strings.Contains(lower, "rate"):
		retryable = true
	case strings.Contains(lower, "module"):
		// Module(*) errors — pallet-level rejections. Examples:
		// ExistentialDeposit, InsufficientBalance, CannotLookup,
		// OutdatedNonce. Most are fatal unless the operator funds the
		// wallet; we let the orchestrator decide whether to keep
		// trying via the signing driver's gas pre-check.
		retryable = false
	}

	return &DOTBroadcastError{
		Op:         "author_submitExtrinsic",
		HTTPStatus: httpStatus,
		Code:       code,
		Message:    message,
		Retryable:  retryable,
	}
}
