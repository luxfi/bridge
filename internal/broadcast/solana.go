// Solana broadcast path — submits a fully-signed, base58-encoded
// legacy tx to the cluster's `sendTransaction` JSON-RPC method and
// returns the resulting signature (which doubles as the canonical
// tx identifier on Solana). The signature is stored on
// Swap.DestTxHash; the SDK uses it to render explorer links.
//
// This file is intentionally thin — the heavy lifting (request
// serialization, base58 helpers, timeout policy) lives in the
// `solanarpc` package so a single implementation serves both
// txassembler (blockhash fetch) and broadcast (sendTransaction).

package broadcast

import (
	"context"
	"errors"
	"fmt"

	"github.com/luxfi/bridge/internal/solanarpc"
)

// broadcastSolana wraps solanarpc.Client.SendTransaction so the
// broadcast.Client surface stays uniform for callers. The per-call
// timeout, HTTP client, and error translation match the EVM path,
// which keeps the BroadcastDriver's loop oblivious to family.
//
// Insufficient-funds case: the Solana cluster returns RPC error
// code -32002 with a message like "Transaction simulation failed:
// insufficient funds for instruction". We propagate the error as-is
// so the broadcast driver's `swap.last_error` field carries the
// actionable message — operators reading the swap row immediately
// see "the release wallet needs more SOL" without having to grep
// metrics.
func (c *Client) broadcastSolana(ctx context.Context, url, txBase58 string) (*BroadcastResult, error) {
	sc := &solanarpc.Client{
		URL:        url,
		Timeout:    c.timeout(),
		HTTPClient: c.httpClient(),
	}

	sig, err := sc.SendTransaction(ctx, txBase58)
	if err != nil {
		// Translate solanarpc.RPCError → broadcast.RPCError so the
		// driver can recognize the error uniformly across families.
		var sre *solanarpc.RPCError
		if errors.As(err, &sre) {
			return nil, &RPCError{
				Method:     "sendTransaction",
				Code:       sre.Code,
				HTTPStatus: sre.HTTPStatus,
				Message:    sre.Message,
				Data:       sre.Data,
			}
		}
		// Transport / context errors — let the driver see them
		// verbatim (it has its own backoff / retry policy).
		return nil, fmt.Errorf("broadcast: solana sendTransaction: %w", err)
	}
	return &BroadcastResult{TxHash: sig}, nil
}
