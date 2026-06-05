// XRP broadcast path — submits a signed, hex-encoded XRPL tx_blob to
// the network's JSON-RPC `submit` method and returns the resulting
// transaction hash. The signing driver hands us the blob produced by
// txassembler.Assembler.FinalizeXRP; this file is a thin shim around
// xrp.Provider.SubmitBlob so broadcast.Client's surface stays uniform
// across families.
//
// The XRPL `submit` method returns an engine_result string. Anything
// starting with "tes" (e.g. "tesSUCCESS") is the success case; other
// prefixes — "ter", "tec", "tem", "tef" — indicate retryable, claimed-
// fee-charged, malformed, or fatal failures respectively. We surface
// non-tes results as broadcast.RPCError so the broadcast driver can
// route them through its existing retry / error-reporting plumbing
// without family-specific branches.

package broadcast

import (
	"context"
	"fmt"
	"strings"

	"github.com/luxfi/bridge/internal/xrp"
)

// broadcastXRP submits an uppercase-hex tx_blob to XRPL via the URL
// previously resolved from rpcURLs (or RPCURLOverrides). Both URLs on
// the ad-hoc xrp.Provider are set to the same value — the caller has
// already done the network → URL routing, so urlFor() inside the
// provider needs to be a no-op (whichever network name we pass, it
// returns the URL we want).
func (c *Client) broadcastXRP(ctx context.Context, network, url, txBlobHex string) (*BroadcastResult, error) {
	if txBlobHex == "" {
		return nil, ErrEmptyRawTx
	}

	prov := xrp.NewProvider(url, url, c.timeout())
	prov.SetHTTPClient(c.httpClient())

	result, err := prov.SubmitBlob(ctx, network, txBlobHex)
	if err != nil {
		return nil, &RPCError{
			Method:  "submit",
			Code:    -32000,
			Message: err.Error(),
		}
	}
	// Engine results: anything starting with "tes" is success-ish.
	// "tec" charges the fee but doesn't apply the tx; treat as failure
	// (the swap won't actually move funds) so the driver doesn't
	// happily mark a no-op tx as broadcast-OK.
	if !strings.HasPrefix(result.EngineResult, "tes") {
		return nil, &RPCError{
			Method: "submit",
			Code:   result.EngineResultCode,
			Message: fmt.Sprintf("xrpl engine_result=%s: %s",
				result.EngineResult, result.EngineResultMessage),
		}
	}
	if result.TxJSON.Hash == "" {
		return nil, &RPCError{
			Method:  "submit",
			Code:    -32603,
			Message: "empty tx_json.hash from XRPL submit",
		}
	}
	return &BroadcastResult{TxHash: result.TxJSON.Hash}, nil
}
