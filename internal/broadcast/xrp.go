package broadcast

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

// xrp.go: destination-side broadcaster for the XRP Ledger.
//
// Wire shape: rippled's WebSocket and JSON-RPC interfaces both expose
// the `submit` method. We use the JSON-RPC form because it's plain
// HTTP POST and matches every other broadcaster in this package.
//
//	POST <rippled-rpc-url>
//	{"method":"submit","params":[{"tx_blob":"<hex>"}]}
//	→ {"result":{"engine_result":"tesSUCCESS","tx_json":{"hash":"..."}}}
//
// `tx_blob` is the hex-encoded signed transaction body produced by
// internal/xrpl.Finalize. No 0x prefix, uppercase or lowercase
// accepted by rippled.
//
// Engine-result classification (rippled/src/ripple/protocol/TER.h):
//   - tes*: success (only tesSUCCESS is a real success).
//   - ter*: transient — retry eligible; the tx wasn't applied this
//     round but may be applied in a future round.
//   - tec*: tx was applied and consumed a fee but failed (e.g. no
//     destination account, insufficient reserve). Fatal — do NOT retry.
//   - tem*: malformed. Fatal — the tx is invalid and never will work.
//   - tel*: local error (server-side, e.g. fee too low). Sometimes
//     retryable, sometimes the server's complaint about the request.
//   - tef*: server-side flag, "failed" but not malformed. Mostly fatal.
//
// We surface ter* + tel* + "engine_result not yet known" as retryable
// (the broadcast driver re-submits). tec*, tem*, tef* are fatal —
// the broadcaster's caller surfaces them as a humanized LastError.

// =============================================================================
// XRP-family broadcaster
// =============================================================================

// xrpSubmitResponse decodes the bits of rippled's reply we care about.
// rippled echoes the full submitted tx back under `tx_json`; we only
// need the hash from there. `engine_result` is the classification.
type xrpSubmitResponse struct {
	Result struct {
		EngineResult        string          `json:"engine_result"`
		EngineResultCode    int             `json:"engine_result_code"`
		EngineResultMessage string          `json:"engine_result_message"`
		TxBlob              string          `json:"tx_blob,omitempty"`
		TxJSON              json.RawMessage `json:"tx_json,omitempty"`
		Status              string          `json:"status"`
		Error               string          `json:"error,omitempty"`
		ErrorCode           int             `json:"error_code,omitempty"`
		ErrorMessage        string          `json:"error_message,omitempty"`
	} `json:"result"`
}

// =============================================================================
// engine_result classification
// =============================================================================

// xrpClass is the classification of a rippled engine_result code.
type xrpClass int

const (
	xrpClassUnknown xrpClass = iota
	xrpClassSuccess
	xrpClassRetryable
	xrpClassFatal
)

// classifyEngineResult maps a rippled engine_result string to one of
// the four classifications above.
//
// Logic:
//   - tesSUCCESS — the only "success" — applied + included.
//   - tes* otherwise → unknown (no other tes-prefixed codes exist as
//     of XRPL v2024.10, but defensive future-proofing).
//   - ter* → retryable: tx valid but couldn't be applied this round.
//   - tel* → retryable in MOST cases (telBAD_DOMAIN etc.) — server-side
//     local rejection that may resolve on a fresh submit. The
//     ones that are clearly fatal (telCAN_NOT_QUEUE_FULL etc.) still
//     get retried; the broadcast driver caps retries with refund-after.
//   - tec* → fatal: tx applied + consumed fee but failed. Resubmitting
//     produces a tefPAST_SEQ rejection because the sequence advanced.
//   - tem* → fatal: malformed, never going to work.
//   - tef* → fatal: failed for a server-rejected reason that's not
//     transient (tefPAST_SEQ, tefALREADY, etc.).
//
// Empty / unknown prefix → xrpClassUnknown (treated as retryable by
// callers so the driver tries again).
//
// References:
//   - rippled/src/ripple/protocol/TER.h
//   - https://xrpl.org/transaction-results.html
func classifyEngineResult(code string) xrpClass {
	switch code {
	case "":
		return xrpClassUnknown
	case "tesSUCCESS":
		return xrpClassSuccess
	}
	if len(code) < 3 {
		return xrpClassUnknown
	}
	switch code[:3] {
	case "tes":
		return xrpClassSuccess
	case "ter":
		return xrpClassRetryable
	case "tel":
		return xrpClassRetryable
	case "tec", "tem", "tef":
		return xrpClassFatal
	default:
		return xrpClassUnknown
	}
}

// =============================================================================
// rippled JSON-RPC HTTP — the package's standard JSON-RPC helper
// =============================================================================
//
// rippled is JSON-RPC-ish: it doesn't echo back the standard
// {jsonrpc:"2.0", id, result/error} envelope. Instead it returns
// {result:{...}} directly with no top-level id or jsonrpc field. So
// for the broadcast path we send a plain {method, params} body and
// decode the response shape ourselves.
//
// Why a custom helper instead of reusing jsonRPC: jsonRPC expects the
// JSON-RPC 2.0 envelope, which rippled doesn't speak. Going through
// it would mean wrapping rippled's reply or accepting a "result-only"
// decode mode that would clutter the EVM path.

// xrpJSONRPC performs an HTTP POST against `url` with a rippled-style
// {method, params} body and decodes the response into `out`.
//
// Returns *RPCError on non-2xx HTTP or transport failures.
func (c *Client) xrpJSONRPC(ctx context.Context, url, method string, params []map[string]interface{}, out *xrpSubmitResponse) error {
	body, err := json.Marshal(map[string]any{
		"method": method,
		"params": params,
	})
	if err != nil {
		return fmt.Errorf("broadcast: marshal xrp %s: %w", method, err)
	}
	return doPlainJSON(ctx, c.httpClient(), c.timeout(), url, body, out)
}

// broadcastXRPDirect is the production XRP submit path. It uses
// xrpJSONRPC (rippled's bespoke envelope) instead of the EVM-style
// jsonRPC helper and classifies engine_result into success / retryable
// / fatal so the broadcast driver can humanize accordingly.
//
// This is the function Broadcast() routes XRP_* networks to.
func (c *Client) broadcastXRPDirect(ctx context.Context, url, rawTxHex string) (*BroadcastResult, error) {
	rawTxHex = strings.TrimPrefix(strings.TrimPrefix(rawTxHex, "0x"), "0X")
	if rawTxHex == "" {
		return nil, ErrEmptyRawTx
	}

	var resp xrpSubmitResponse
	params := []map[string]interface{}{{"tx_blob": rawTxHex}}
	if err := c.xrpJSONRPC(ctx, url, "submit", params, &resp); err != nil {
		return nil, err
	}

	if resp.Result.Error != "" || resp.Result.ErrorMessage != "" {
		return nil, &RPCError{
			Method:  "submit",
			Code:    resp.Result.ErrorCode,
			Message: fmt.Sprintf("rippled error %s: %s", resp.Result.Error, resp.Result.ErrorMessage),
		}
	}

	switch classifyEngineResult(resp.Result.EngineResult) {
	case xrpClassSuccess:
		hash, _ := extractXRPTxHash(resp.Result.TxJSON)
		if hash == "" {
			return nil, &RPCError{
				Method:  "submit",
				Code:    -32603,
				Message: fmt.Sprintf("submit %s: response missing tx_json.hash", resp.Result.EngineResult),
			}
		}
		return &BroadcastResult{TxHash: hash}, nil

	case xrpClassRetryable, xrpClassUnknown:
		return nil, &RPCError{
			Method:  "submit",
			Code:    resp.Result.EngineResultCode,
			Message: fmt.Sprintf("retryable engine_result=%s: %s", resp.Result.EngineResult, resp.Result.EngineResultMessage),
		}

	case xrpClassFatal:
		return nil, &RPCError{
			Method:  "submit",
			Code:    resp.Result.EngineResultCode,
			Message: fmt.Sprintf("fatal engine_result=%s: %s", resp.Result.EngineResult, resp.Result.EngineResultMessage),
		}
	}
	return nil, &RPCError{
		Method:  "submit",
		Code:    -32603,
		Message: "unreachable classification branch",
	}
}

// extractXRPTxHash pulls `hash` from a tx_json sub-object. rippled
// echoes the submitted transaction back with its computed canonical
// hash injected. Returns ("", error) on missing/malformed input.
func extractXRPTxHash(rawTxJSON json.RawMessage) (string, error) {
	if len(rawTxJSON) == 0 {
		return "", errors.New("tx_json missing")
	}
	var obj struct {
		Hash string `json:"hash"`
	}
	if err := json.Unmarshal(rawTxJSON, &obj); err != nil {
		return "", fmt.Errorf("tx_json: %w", err)
	}
	if obj.Hash == "" {
		return "", errors.New("tx_json.hash empty")
	}
	return obj.Hash, nil
}
