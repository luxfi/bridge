// sol.go: Solana destination broadcaster. Hands a signed, base64-
// encoded transaction to a Solana RPC via the standard sendTransaction
// JSON-RPC method.
//
// Wire shape:
//
//	POST <rpc URL>
//	{"jsonrpc":"2.0","id":N,"method":"sendTransaction",
//	 "params":["<base64 tx>",
//	           {"encoding":"base64","preflightCommitment":"confirmed","skipPreflight":false}]}
//
// Success response: {"jsonrpc":"2.0","id":N,"result":"<base58 signature>"}.
// The signature returned by sendTransaction IS the transaction's
// canonical identifier on Solana — no separate "tx hash". Surfaced as
// BroadcastResult.TxHash for consistency with the rest of the bridge
// pipeline.
//
// Error surfacing: sendTransaction's `error.data` is a structured
// object on simulation failures (with `logs`, `unitsConsumed`,
// `accounts`, `err`) and a plain string on transport-level errors. We
// inspect `error.message` for the canonical strings and route to:
//   - SOLBlockhashNotFoundError  → retryable=true, the bridge should
//                                  rebuild + re-sign with a fresh hash.
//   - SOLSimulationError         → retryable=false, the tx is bad
//                                  (e.g. SPL transfer with insufficient
//                                  token balance, malformed instruction).
//   - *RPCError                  → everything else.

package broadcast

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

// =============================================================================
// Errors
// =============================================================================

// SOLBlockhashNotFoundError is returned when the destination node
// rejects the tx because the embedded recent_blockhash is no longer
// in its block cache. Retryable — the signing driver should rebuild
// the unsigned tx with a fresh blockhash and re-run the MPC ceremony.
// (The signature is over the message bytes, which include the
// blockhash, so a stale blockhash means a stale signature.)
type SOLBlockhashNotFoundError struct {
	// Underlying carries the upstream RPC message for triage.
	Underlying string
}

func (e *SOLBlockhashNotFoundError) Error() string {
	return "broadcast: SOL BlockhashNotFound — recent_blockhash expired, rebuild + re-sign: " + e.Underlying
}

// Retryable reports the error to the signing driver as a "build + sign
// again" hint rather than a hard failure. The signing driver should
// re-run PreSign (fresh blockhash) and Finalize (fresh signature) then
// re-broadcast.
func (e *SOLBlockhashNotFoundError) Retryable() bool { return true }

// SOLSimulationError is returned when the cluster's preflight
// simulation rejected the tx. Hard failure — same MPC ceremony will
// keep failing because the simulation result is deterministic given
// the same on-chain state. Operators must inspect logs to determine
// the cause (insufficient SPL balance, ATA owner mismatch, etc.).
type SOLSimulationError struct {
	// Message is the upstream error.message string.
	Message string
	// Logs is the program-log array extracted from error.data.logs
	// when the cluster supplied one. Empty on transport-level errors.
	Logs []string
}

func (e *SOLSimulationError) Error() string {
	if len(e.Logs) == 0 {
		return "broadcast: SOL simulation failed: " + e.Message
	}
	return fmt.Sprintf("broadcast: SOL simulation failed: %s (logs=%d entries)", e.Message, len(e.Logs))
}

// Retryable reports false — simulation failures are deterministic.
func (e *SOLSimulationError) Retryable() bool { return false }

// =============================================================================
// broadcastSOL
// =============================================================================

// broadcastSOL pushes a base64-encoded signed transaction to the
// destination Solana RPC. rawTxB64 must be the base64 string produced
// by txassembler.SOLAssembler.Finalize.
func (c *Client) broadcastSOL(ctx context.Context, url, rawTxB64 string) (*BroadcastResult, error) {
	// Tolerate trim — the txassembler returns vanilla base64 (no
	// padding stripped, no URL encoding) but be defensive about callers
	// that re-encoded it.
	rawTxB64 = strings.TrimSpace(rawTxB64)
	if rawTxB64 == "" {
		return nil, ErrEmptyRawTx
	}

	type solSendResp struct {
		Result string `json:"result"`
		Error  *struct {
			Code    int             `json:"code"`
			Message string          `json:"message"`
			Data    json.RawMessage `json:"data,omitempty"`
		} `json:"error,omitempty"`
	}

	// preflightCommitment=confirmed matches the blockhash commitment
	// the assembler used — keeps both sides in sync so we don't get
	// blockhash-not-found just because preflight ran against a fresher
	// snapshot than the blockhash came from.
	//
	// skipPreflight=false: we want the cluster's simulation surface so
	// BlockhashNotFound and SimulationError both surface here rather
	// than getting silently dropped at first inclusion attempt.
	params := []any{
		rawTxB64,
		map[string]any{
			"encoding":            "base64",
			"preflightCommitment": "confirmed",
			"skipPreflight":       false,
		},
	}

	var resp solSendResp
	if err := c.jsonRPC(ctx, url, "sendTransaction", params, &resp); err != nil {
		return nil, err
	}
	if resp.Error != nil {
		return nil, classifySOLError(resp.Error.Message, resp.Error.Data)
	}
	if resp.Result == "" {
		return nil, &RPCError{
			Method:  "sendTransaction",
			Code:    -32603,
			Message: "empty signature",
		}
	}
	return &BroadcastResult{TxHash: resp.Result}, nil
}

// classifySOLError maps an upstream JSON-RPC error into a typed error
// shape so the signing driver / broadcast driver can branch on:
//   - SOLBlockhashNotFoundError (retryable)
//   - SOLSimulationError (fatal)
//   - generic *RPCError otherwise
//
// Canonical upstream strings (from agave / solana-validator):
//   - "Blockhash not found"               → BlockhashNotFoundError
//   - "Transaction simulation failed: …"  → SimulationError
//   - "Node is behind by N slots"         → generic RPCError (retry)
func classifySOLError(message string, data json.RawMessage) error {
	lc := strings.ToLower(message)
	if strings.Contains(lc, "blockhash not found") {
		return &SOLBlockhashNotFoundError{Underlying: message}
	}
	if strings.Contains(lc, "transaction simulation failed") ||
		strings.Contains(lc, "preflight failure") ||
		strings.Contains(lc, "preflight check") {
		simErr := &SOLSimulationError{Message: message}
		if len(data) > 0 {
			// Try to pull logs out of the {err, logs:[…], …} payload.
			var d struct {
				Logs []string `json:"logs"`
			}
			if json.Unmarshal(data, &d) == nil {
				simErr.Logs = d.Logs
			}
		}
		return simErr
	}
	return &RPCError{
		Method:  "sendTransaction",
		Message: message,
		Data:    data,
	}
}

// IsSOLBlockhashNotFound reports whether err is (or wraps) a
// SOLBlockhashNotFoundError. Convenience for callers that want a
// boolean predicate without errors.As ceremony.
func IsSOLBlockhashNotFound(err error) bool {
	var bn *SOLBlockhashNotFoundError
	return errors.As(err, &bn)
}

// IsSOLSimulationError reports whether err is (or wraps) a
// SOLSimulationError.
func IsSOLSimulationError(err error) bool {
	var se *SOLSimulationError
	return errors.As(err, &se)
}
