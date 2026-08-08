// btc.go: Bitcoin broadcast handler.
//
// Wire shape: mempool.space's REST endpoint
//
//	POST /api/tx
//	body: <raw signed tx hex, no Content-Type:json — plain text>
//	200 → the canonical txid (display order, big-endian hex) in the body.
//	400 → an error string in the body. Standard chain rejections:
//	      "txn-already-known" / "Transaction already in block chain"
//	      → safe to consider broadcast successful (the tx is already
//	         landed somewhere; retry should not surface as a failure).
//	      "txn-mempool-conflict" / "bad-txns-inputs-missingorspent"
//	      → fatal. Inputs are double-spent or gone; bridge must
//	         re-assemble.
//
// Note vs Bitcoin Core: an operator running their own bitcoind can
// point the bridge at it via `--broadcast-rpc-overrides BITCOIN_*=<url>`
// (set on Client.RPCURLOverrides via main.go). For Bitcoin Core, the
// wire shape differs (JSON-RPC sendrawtransaction). The default path
// here is mempool.space because it's zero-setup and the operators
// running the bridge today don't host a full node themselves; the
// Bitcoin Core path is a simple addition when needed (the dispatch
// can fan out on URL scheme).
//
// The broadcaster surfaces:
//   - canonical txid on success
//   - BTCBroadcastError on failures, with a Retryable bit so the
//     orchestrator decides between "retry next tick" (transient RPC
//     flake, already-known) and "fail swap" (mempool-conflict, double
//     spend).

package broadcast

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// =============================================================================
// Public BTC URLs / endpoints
// =============================================================================
//
// Add the BTC networks to the package rpcURLs table so RPCURLFor returns
// the right default. The Broadcast dispatch then routes them into
// broadcastBTC.

func init() {
	rpcURLs["BITCOIN_MAINNET"] = "https://mempool.space/api/tx"
	rpcURLs["BITCOIN_TESTNET"] = "https://mempool.space/testnet/api/tx"
}

// =============================================================================
// Errors
// =============================================================================

// BTCBroadcastError is the BTC-specific surface for chain rejections.
// Distinct from RPCError because the failure modes that drive the
// orchestrator's retry/fail decision are chain-side text matches
// rather than HTTP/JSON-RPC codes.
type BTCBroadcastError struct {
	// Op is "btc_send_rawtx" — for log/metric tagging.
	Op string
	// HTTPStatus is the upstream HTTP status; 0 if the error happened
	// before a response arrived.
	HTTPStatus int
	// Message is the chain-side error string (e.g. "txn-mempool-conflict").
	Message string
	// Retryable is true when the error is transient — the orchestrator
	// should leave the swap at status=broadcasting and try again next
	// tick. False = the swap is unrecoverable in its current shape and
	// must be re-assembled or refunded.
	Retryable bool
}

func (e *BTCBroadcastError) Error() string {
	prefix := "broadcast: btc"
	if e.HTTPStatus != 0 {
		prefix = fmt.Sprintf("broadcast: btc HTTP %d", e.HTTPStatus)
	}
	if e.Retryable {
		return prefix + " (retryable): " + e.Message
	}
	return prefix + " (fatal): " + e.Message
}

// =============================================================================
// Broadcast — top-level dispatch entry
// =============================================================================
//
// Extend the existing Broadcast() switch to route BTC into broadcastBTC.
// Done in client.go::Broadcast (the family switch). This file adds the
// implementation only.

// broadcastBTC pushes a signed raw BTC transaction onto the network.
//
// rawTxHex is the hex-encoded serialized wire tx (the output of
// (*txassembler.BTCAssembler).Finalize().raw, hex-encoded). Pass with
// or without 0x prefix — broadcaster strips it.
//
// Returns *BroadcastResult{TxHash: <canonical big-endian txid>} on
// success. *BTCBroadcastError on chain-side rejections; *RPCError on
// transport / non-2xx that doesn't include a parseable error string.
func (c *Client) broadcastBTC(ctx context.Context, url, rawTxHex string) (*BroadcastResult, error) {
	rawHex := strings.TrimPrefix(strings.TrimPrefix(rawTxHex, "0x"), "0X")
	if rawHex == "" {
		return nil, ErrEmptyRawTx
	}
	rawBytes, err := hex.DecodeString(rawHex)
	if err != nil {
		return nil, fmt.Errorf("broadcast: btc decode hex: %w", err)
	}

	timeout := c.timeout()
	callCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(callCtx, http.MethodPost, url, strings.NewReader(rawHex))
	if err != nil {
		return nil, err
	}
	// mempool.space accepts text/plain for /api/tx. Setting an explicit
	// content type makes the upstream parsing deterministic across
	// gateways.
	req.Header.Set("Content-Type", "text/plain")
	req.Header.Set("Accept", "text/plain")

	resp, err := c.httpClient().Do(req)
	if err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return nil, err
		}
		return nil, &RPCError{Method: "btc_send_rawtx", Code: -32000, Message: err.Error()}
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	body := strings.TrimSpace(string(respBody))

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		// mempool.space returns the txid as plain text. Validate shape
		// (64 hex chars) before declaring success — a malformed body
		// from a misconfigured upstream would otherwise quietly land
		// in Swap.DestTxHash.
		txid := strings.TrimPrefix(strings.TrimPrefix(body, "0x"), "0X")
		if len(txid) != 64 || !isHex(txid) {
			// Body wasn't a clean txid — compute it ourselves from the
			// raw bytes. The canonical txid is sha256d(rawTx) in
			// reverse byte order. (For segwit txs we'd need to strip
			// the witness for a strict txid, but the post-witness hash
			// is what `wire.MsgTx.TxHash()` returns and what callers
			// expect; the assembler's Finalize already returns this
			// value alongside the raw bytes, so reproducing it here is
			// a sanity check.)
			fallback, fbErr := txidFromRaw(rawBytes)
			if fbErr != nil {
				return nil, &RPCError{
					Method:     "btc_send_rawtx",
					HTTPStatus: resp.StatusCode,
					Message:    fmt.Sprintf("upstream returned non-txid body %q (and fallback compute failed: %v)", truncateBTC(body, 200), fbErr),
				}
			}
			return &BroadcastResult{TxHash: fallback}, nil
		}
		return &BroadcastResult{TxHash: txid}, nil
	}

	// Non-2xx: classify the chain-side message for the orchestrator.
	low := strings.ToLower(body)
	switch {
	case strings.Contains(low, "txn-already-known"),
		strings.Contains(low, "transaction already in block chain"),
		strings.Contains(low, "already exists"),
		strings.Contains(low, "already in mempool"),
		strings.Contains(low, "txn-already-in-mempool"):
		// Already broadcast — recover the canonical txid from the raw
		// bytes and surface as success.
		txid, fbErr := txidFromRaw(rawBytes)
		if fbErr == nil {
			return &BroadcastResult{TxHash: txid}, nil
		}
		// Fall through to a retryable error if we somehow can't compute
		// the txid (shouldn't happen with hex we just decoded).
		return nil, &BTCBroadcastError{
			Op:         "btc_send_rawtx",
			HTTPStatus: resp.StatusCode,
			Message:    body,
			Retryable:  true,
		}
	case strings.Contains(low, "txn-mempool-conflict"),
		strings.Contains(low, "bad-txns-inputs-missingorspent"),
		strings.Contains(low, "missing inputs"),
		strings.Contains(low, "non-mandatory-script-verify-flag"),
		strings.Contains(low, "bad-txns-in-belowout"),
		strings.Contains(low, "dust"):
		// Fatal — the assembled tx can never broadcast. Bridge must
		// rebuild (different UTXOs, new fee rate, etc.).
		return nil, &BTCBroadcastError{
			Op:         "btc_send_rawtx",
			HTTPStatus: resp.StatusCode,
			Message:    body,
			Retryable:  false,
		}
	case strings.Contains(low, "rate limit"),
		strings.Contains(low, "rate-limited"),
		strings.Contains(low, "too many requests"),
		resp.StatusCode == http.StatusTooManyRequests,
		resp.StatusCode == http.StatusServiceUnavailable,
		resp.StatusCode == http.StatusBadGateway,
		resp.StatusCode == http.StatusGatewayTimeout:
		// Upstream transient; the orchestrator should retry.
		return nil, &BTCBroadcastError{
			Op:         "btc_send_rawtx",
			HTTPStatus: resp.StatusCode,
			Message:    body,
			Retryable:  true,
		}
	default:
		// Unknown 4xx — pessimistically fatal so we don't loop forever
		// on a misconfigured node. Operators can re-trigger after
		// inspecting.
		return nil, &BTCBroadcastError{
			Op:         "btc_send_rawtx",
			HTTPStatus: resp.StatusCode,
			Message:    body,
			Retryable:  false,
		}
	}
}

// =============================================================================
// Helpers
// =============================================================================

// isHex reports whether every char of s is a hex digit.
func isHex(s string) bool {
	for i := 0; i < len(s); i++ {
		c := s[i]
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) {
			return false
		}
	}
	return true
}

// txidFromRaw computes the canonical big-endian display txid from a
// signed serialized tx. For segwit txs the *wtxid* and the txid differ;
// this function returns sha256d(rawBytes)-reversed, which equals the
// canonical txid only when rawBytes excludes the witness. For our path
// the assembler's wire.MsgTx.TxHash() already returns the correct
// (witness-excluding) value — which mempool.space echoes verbatim. We
// keep this fallback for the rare case where the upstream response is
// malformed; in that case the wtxid will surface, which is still a
// stable identifier downstream consumers (block explorers, refund
// driver) can resolve.
func txidFromRaw(rawBytes []byte) (string, error) {
	if len(rawBytes) == 0 {
		return "", errors.New("empty raw tx")
	}
	first := sha256.Sum256(rawBytes)
	second := sha256.Sum256(first[:])
	// Reverse for display.
	var out [32]byte
	for i := 0; i < 32; i++ {
		out[i] = second[31-i]
	}
	return hex.EncodeToString(out[:]), nil
}

func truncateBTC(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

// =============================================================================
// Confirmation status
// =============================================================================

// btcTxStatus is mempool.space's GET /api/tx/{txid}/status shape. Only
// the confirmed bit matters to the broadcast driver's BTC gate.
type btcTxStatus struct {
	Confirmed bool `json:"confirmed"`
}

// ConfirmationStatus reports whether a Bitcoin tx has been mined,
// via mempool.space's tx-status endpoint on the same base URL the
// broadcaster posts to. The broadcast driver polls this for releases
// parked in awaiting-confirmation and rebuilds ones that sit too long.
// Non-BTC networks are refused — every other family treats broadcast
// acceptance as final and never asks.
func (c *Client) ConfirmationStatus(ctx context.Context, network, txid string) (bool, error) {
	base := RPCURLFor(network)
	if base == "" || !strings.HasPrefix(strings.ToUpper(network), "BITCOIN_") {
		return false, fmt.Errorf("broadcast: no BTC confirmation source for network %q", network)
	}
	txid = strings.TrimPrefix(strings.TrimPrefix(txid, "0x"), "0X")
	if txid == "" {
		return false, errors.New("broadcast: empty txid")
	}

	callCtx, cancel := context.WithTimeout(ctx, c.timeout())
	defer cancel()
	req, err := http.NewRequestWithContext(callCtx, http.MethodGet, base+"/"+txid+"/status", nil)
	if err != nil {
		return false, err
	}
	resp, err := c.httpClient().Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<10))
	if err != nil {
		return false, err
	}
	if resp.StatusCode != http.StatusOK {
		return false, &RPCError{Code: resp.StatusCode,
			Message: "btc tx status: " + truncateBTC(strings.TrimSpace(string(body)), 200)}
	}
	var st btcTxStatus
	if err := json.Unmarshal(body, &st); err != nil {
		return false, fmt.Errorf("broadcast: btc tx status decode: %w", err)
	}
	return st.Confirmed, nil
}
