// BTC broadcast handler: POST raw hex to mempool.space /tx and return
// the txid the upstream node echoes.
//
// Why a separate file: the EVM/Solana/TON/XRP paths all live in
// client.go, but BTC's wire format (raw hex POST'd as text/plain) is
// distinct enough from the JSON-RPC pattern that pulling it out
// keeps client.go's dispatch logic small.
package broadcast

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// broadcastBTC pushes a wire-form raw transaction (hex string, no 0x
// prefix) to the upstream Bitcoin REST API. The standard for both
// mempool.space and blockstream.info is `POST {base}/tx` with
// Content-Type text/plain and a 64-character-per-32-bytes hex body;
// the upstream returns the canonical txid (display-form) on success
// and a plain-text error body on failure.
func (c *Client) broadcastBTC(ctx context.Context, baseURL, rawTxHex string) (*BroadcastResult, error) {
	rawTxHex = strings.TrimSpace(rawTxHex)
	rawTxHex = strings.TrimPrefix(rawTxHex, "0x")
	if rawTxHex == "" {
		return nil, ErrEmptyRawTx
	}

	callCtx, cancel := context.WithTimeout(ctx, c.timeout())
	defer cancel()

	url := strings.TrimRight(baseURL, "/") + "/tx"
	req, err := http.NewRequestWithContext(callCtx, http.MethodPost, url, strings.NewReader(rawTxHex))
	if err != nil {
		return nil, fmt.Errorf("broadcast: BTC new request: %w", err)
	}
	req.Header.Set("Content-Type", "text/plain")
	req.Header.Set("Accept", "text/plain")

	resp, err := c.httpClient().Do(req)
	if err != nil {
		return nil, &RPCError{
			Method:  "btc:sendrawtransaction",
			Code:    -32000,
			Message: err.Error(),
		}
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	bodyStr := strings.TrimSpace(string(body))

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, &RPCError{
			Method:     "btc:sendrawtransaction",
			HTTPStatus: resp.StatusCode,
			Message:    truncate([]byte(bodyStr), 200),
		}
	}
	// mempool.space returns just the txid (64 hex chars). Anything else
	// is a sign of an unexpected response — refuse to write garbage
	// into the swap row.
	if len(bodyStr) != 64 {
		return nil, &RPCError{
			Method:     "btc:sendrawtransaction",
			HTTPStatus: resp.StatusCode,
			Message:    fmt.Sprintf("unexpected response body %q", truncate([]byte(bodyStr), 80)),
		}
	}
	return &BroadcastResult{TxHash: bodyStr}, nil
}
