// Package broadcast pushes a signed destination-chain transaction
// onto its target RPC and returns the transaction hash. Wraps the
// chain-specific submission format (EVM eth_sendRawTransaction,
// Bitcoin sendrawtransaction, Solana sendTransaction, etc.) so the
// rest of cmd/bridge can stay chain-agnostic.
//
// Scope:
//   - EVM (Ethereum / Sepolia / Lux / Base / Polygon / Arbitrum /
//     Optimism / Avalanche / BSC / Holesky / Zora / Blast / Linea):
//     implemented via JSON-RPC eth_sendRawTransaction.
//   - TON (mainnet / testnet): implemented via TON Center sendBoc.
//     See ton.go.
//   - Non-EVM, non-TON (BTC / SOL / XRP / DOT): returns
//     ErrFamilyNotImplemented. Adding any one is a straightforward
//     follow-up — different REST/RPC contracts, same shape.
//
// Trust model: the destination RPC is treated as untrusted transport.
// A 200 response means the node ACCEPTED the tx — it does NOT mean
// the tx will be included. Callers should still poll for inclusion;
// that's outside this package's job.
//
// Concurrency: a *Client is safe for concurrent use.
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
	"sync/atomic"
	"time"

	"github.com/luxfi/bridge/internal/mchain"
)

// =============================================================================
// RPC endpoints — destination-chain targets
// =============================================================================

// rpcURLs maps a network internal_name to the JSON-RPC endpoint used
// to broadcast its signed transactions. Distinct from
// depositcheck.rpcURLs because the destination side may use a
// different node (e.g. a write-permissioned validator instead of a
// public read-only endpoint).
var rpcURLs = map[string]string{
	// EVM
	"ETHEREUM_MAINNET": "https://eth.llamarpc.com",
	"ETHEREUM_SEPOLIA": "https://rpc.sepolia.org",
	"BASE_MAINNET":     "https://mainnet.base.org",
	"BASE_SEPOLIA":     "https://sepolia.base.org",
	"LUX_MAINNET":      "https://api.lux.network/ext/bc/C/rpc",
	"LUX_TESTNET":      "https://api.lux-test.network/ext/bc/C/rpc",
	"ZOO_MAINNET":      "https://api.zoo.network/ext/bc/Z/rpc",
	"ZOO_TESTNET":      "https://api.zoo-test.network/ext/bc/Z/rpc",
	"BSC_MAINNET":      "https://bsc-dataseed.binance.org",
	"BSC_TESTNET":      "https://data-seed-prebsc-1-s1.binance.org:8545",
	"POLYGON_MAINNET":  "https://polygon-rpc.com",
	"ARBITRUM_MAINNET": "https://arb1.arbitrum.io/rpc",
	"OPTIMISM_MAINNET": "https://mainnet.optimism.io",
	"AVAX_MAINNET":     "https://api.avax.network/ext/bc/C/rpc",
	"HOLESKY_TESTNET":  "https://ethereum-holesky-rpc.publicnode.com",
	"ZORA_MAINNET":     "https://rpc.zora.energy",
	"BLAST_MAINNET":    "https://rpc.blast.io",
	"LINEA_MAINNET":    "https://rpc.linea.build",
	// Non-EVM are intentionally absent — they need chain-specific
	// broadcast handlers (Bitcoin REST API, Solana JSON-RPC with a
	// different method name, TON Center push endpoint, etc.). Adding
	// any one is a separate impl in this file plus a switch case in
	// Broadcast.
}

// RPCURLFor returns the configured upstream URL for a network. "" if
// not configured.
func RPCURLFor(network string) string { return rpcURLs[network] }

// =============================================================================
// Errors
// =============================================================================

// ErrUnsupportedNetwork — the network isn't in the rpcURLs table.
var ErrUnsupportedNetwork = errors.New("broadcast: unsupported network")

// ErrFamilyNotImplemented — the network's address-family broadcaster
// isn't implemented yet (BTC, SOL, XRP, DOT). EVM and TON are
// implemented in this package today.
var ErrFamilyNotImplemented = errors.New("broadcast: family not implemented")

// ErrEmptyRawTx — the caller passed an empty rawTxHex. Surfacing
// this distinctly so the broadcast driver can tell "missing tx
// assembly" from "RPC failure" and skip rather than retry forever.
var ErrEmptyRawTx = errors.New("broadcast: empty rawTxHex (the tx assembler hasn't populated swap.DestRawTx yet)")

// RPCError surfaces upstream JSON-RPC failures (e.g. nonce already
// used, gas too low, invalid signature). Inspect Code/HTTPStatus.
type RPCError struct {
	Method     string
	Code       int
	HTTPStatus int
	Message    string
	Data       json.RawMessage
}

func (e *RPCError) Error() string {
	if e.HTTPStatus != 0 {
		return fmt.Sprintf("broadcast: %s HTTP %d: %s", e.Method, e.HTTPStatus, e.Message)
	}
	return fmt.Sprintf("broadcast: %s rpc %d: %s", e.Method, e.Code, e.Message)
}

// =============================================================================
// Client
// =============================================================================

// DefaultTimeout is the per-call timeout for a single broadcast.
// 15 s is generous — most destination RPCs respond in <500 ms but
// some testnets are slow.
const DefaultTimeout = 15 * time.Second

// Client is the broadcast client. Zero-value usable; populate URL
// overrides for production keys / private endpoints.
type Client struct {
	// Timeout bounds each individual broadcast call. Zero ⇒ DefaultTimeout.
	Timeout time.Duration

	// HTTPClient is the underlying http.Client. Zero ⇒ http.DefaultClient.
	HTTPClient *http.Client

	// RPCURLOverrides shadows specific networks with custom URLs (e.g.
	// an authenticated provider). Checked before the package table.
	RPCURLOverrides map[string]string

	// TONAPIKeys maps a TON network name (TON_MAINNET / TON_TESTNET) to
	// the X-API-Key value used when calling TON Center. Required at
	// production rates — TON Center throttles unauthenticated callers
	// to ~1 req/s. Populated via SetTONAPIKey (see ton.go) or directly
	// by main.go from networks.yaml.
	TONAPIKeys map[string]string

	// callSeq is a monotonic JSON-RPC `id` counter. Atomic — safe for
	// concurrent use without external locking.
	callSeq atomic.Uint64
}

// New is a convenience constructor.
func New(timeout time.Duration) *Client { return &Client{Timeout: timeout} }

func (c *Client) httpClient() *http.Client {
	if c.HTTPClient != nil {
		return c.HTTPClient
	}
	return http.DefaultClient
}

func (c *Client) timeout() time.Duration {
	if c.Timeout > 0 {
		return c.Timeout
	}
	return DefaultTimeout
}

func (c *Client) rpcURL(network string) string {
	if u, ok := c.RPCURLOverrides[network]; ok && u != "" {
		return u
	}
	return rpcURLs[network]
}

// =============================================================================
// Broadcast — top-level dispatch
// =============================================================================

// BroadcastResult is the success payload — the destination-chain
// transaction hash returned by the upstream node. Callers store this
// in Swap.DestTxHash for SDK consumption.
type BroadcastResult struct {
	// TxHash is the destination-chain transaction hash (0x-prefixed
	// for EVM; chain-specific format otherwise).
	TxHash string `json:"tx_hash"`
}

// Broadcast pushes a signed, raw destination-chain transaction to the
// network's RPC and returns the transaction hash on success.
//
// For EVM, rawTxHex must be the 0x-prefixed RLP-encoded signed tx
// (i.e. the value you'd pass to `eth_sendRawTransaction`).
//
// Errors:
//   - ErrUnsupportedNetwork           network not in the table / overrides.
//   - ErrFamilyNotImplemented         BTC/SOL/TON/XRP/DOT — TODO.
//   - ErrEmptyRawTx                   rawTxHex == "".
//   - *RPCError                       upstream returned a JSON-RPC error
//                                     or non-2xx HTTP.
//   - context.Canceled/DeadlineExceeded on caller or per-call timeout.
func (c *Client) Broadcast(ctx context.Context, network, rawTxHex string) (*BroadcastResult, error) {
	if rawTxHex == "" {
		return nil, ErrEmptyRawTx
	}
	url := c.rpcURL(network)
	if url == "" {
		return nil, fmt.Errorf("%w: %s", ErrUnsupportedNetwork, network)
	}

	// Family dispatch. We use mchain.AddressTypeFor as the canonical
	// network→family mapping (it's already the project's source of
	// truth for which family a network belongs to).
	switch mchain.AddressTypeFor(network) {
	case mchain.AddressTypeETH:
		return c.broadcastEVM(ctx, url, rawTxHex)
	case mchain.AddressTypeTON:
		return c.broadcastTON(ctx, url, network, rawTxHex)
	default:
		return nil, fmt.Errorf("%w: %s", ErrFamilyNotImplemented, network)
	}
}

// =============================================================================
// EVM — eth_sendRawTransaction
// =============================================================================

func (c *Client) broadcastEVM(ctx context.Context, url, rawTxHex string) (*BroadcastResult, error) {
	// Normalize to 0x-prefixed.
	if !strings.HasPrefix(rawTxHex, "0x") && !strings.HasPrefix(rawTxHex, "0X") {
		rawTxHex = "0x" + rawTxHex
	}

	type ethSendResp struct {
		Result string `json:"result"`
		Error  *struct {
			Code    int             `json:"code"`
			Message string          `json:"message"`
			Data    json.RawMessage `json:"data,omitempty"`
		} `json:"error,omitempty"`
	}

	var resp ethSendResp
	if err := c.jsonRPC(ctx, url, "eth_sendRawTransaction",
		[]any{rawTxHex}, &resp); err != nil {
		return nil, err
	}
	if resp.Error != nil {
		return nil, &RPCError{
			Method:  "eth_sendRawTransaction",
			Code:    resp.Error.Code,
			Message: resp.Error.Message,
			Data:    resp.Error.Data,
		}
	}
	if resp.Result == "" {
		return nil, &RPCError{
			Method:  "eth_sendRawTransaction",
			Code:    -32603,
			Message: "empty tx hash",
		}
	}
	return &BroadcastResult{TxHash: resp.Result}, nil
}

// =============================================================================
// HTTP helper
// =============================================================================

// jsonRPC POSTs a JSON-RPC 2.0 call and decodes into out.
func (c *Client) jsonRPC(ctx context.Context, url, method string, params any, out any) error {
	body, err := json.Marshal(map[string]any{
		"jsonrpc": "2.0",
		"id":      c.callSeq.Add(1),
		"method":  method,
		"params":  params,
	})
	if err != nil {
		return fmt.Errorf("broadcast: marshal %s: %w", method, err)
	}

	callCtx, cancel := context.WithTimeout(ctx, c.timeout())
	defer cancel()

	req, err := http.NewRequestWithContext(callCtx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient().Do(req)
	if err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return err
		}
		return &RPCError{Method: method, Code: -32000, Message: err.Error()}
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return &RPCError{
			Method:     method,
			HTTPStatus: resp.StatusCode,
			Message:    fmt.Sprintf("HTTP %d: %s", resp.StatusCode, truncate(respBody, 200)),
		}
	}
	if err := json.Unmarshal(respBody, out); err != nil {
		return &RPCError{
			Method:     method,
			HTTPStatus: resp.StatusCode,
			Message:    fmt.Sprintf("decode response: %v (body=%s)", err, truncate(respBody, 200)),
		}
	}
	return nil
}

func truncate(b []byte, n int) string {
	if len(b) <= n {
		return string(b)
	}
	return string(b[:n]) + "…"
}
