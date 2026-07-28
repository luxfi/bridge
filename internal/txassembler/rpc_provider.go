package txassembler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"strings"
	"sync/atomic"
	"time"
)

// rpc_provider.go: live-RPC implementation of the Provider interface.
// Queries the destination chain's JSON-RPC for the actual nonce + gas
// price instead of relying on the hardcoded StaticProvider.
//
// Wire methods used:
//   • eth_getTransactionCount(address, "pending") → returns hex string
//     of the next nonce the chain will accept for the given address.
//     "pending" tag (not "latest") so back-to-back txs from the same
//     signer don't collide on the mempool.
//   • eth_gasPrice → returns hex string of the suggested wei/gas.
//
// Concurrency: safe for concurrent use; the underlying http.Client
// already is, the atomic counter for JSON-RPC ids handles its own
// synchronization.

// =============================================================================
// Default endpoints — mirror the broadcast package's table
// =============================================================================
//
// Keep in lockstep with internal/broadcast/client.go::rpcURLs. The
// duplication is intentional: each package stays self-contained and
// operator overrides apply to both via the same --source-rpc-overrides
// flag (main.go forwards the map to both).

var defaultEndpoints = map[string]string{
	"ETHEREUM_MAINNET": "https://eth.llamarpc.com",
	"ETHEREUM_SEPOLIA": "https://rpc.sepolia.org",
	"BASE_MAINNET":     "https://mainnet.base.org",
	"BASE_SEPOLIA":     "https://sepolia.base.org",
	"LUX_MAINNET":      "https://api.lux.network/v1/bc/C/rpc",
	"LUX_TESTNET":      "https://api.lux-test.network/v1/bc/C/rpc",
	"ZOO_MAINNET":      "https://api.zoo.network/v1/bc/C/rpc",
	"ZOO_TESTNET":      "https://api.zoo-test.network/v1/bc/C/rpc",
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
}

// DefaultEndpoints returns a copy of the package's network → URL table.
// Useful for callers that want to inspect or pre-populate overrides.
func DefaultEndpoints() map[string]string {
	out := make(map[string]string, len(defaultEndpoints))
	for k, v := range defaultEndpoints {
		out[k] = v
	}
	return out
}

// =============================================================================
// RPCProvider
// =============================================================================

// DefaultRPCTimeout caps each individual JSON-RPC call. 8 s leaves
// room for slow testnets without holding the assembler hostage.
const DefaultRPCTimeout = 8 * time.Second

// RPCProvider implements Provider by querying the destination chain's
// JSON-RPC endpoint for live nonce + gas-price values.
//
// Construct via NewRPCProvider (which pre-populates defaultEndpoints)
// or by populating fields on a zero-value RPCProvider directly.
type RPCProvider struct {
	// Endpoints is the network → URL table consulted for every call.
	// Defaults to defaultEndpoints when nil (via NewRPCProvider); a
	// caller using the zero value must populate this themselves.
	Endpoints map[string]string

	// Overrides shadow Endpoints — checked first. Operators set these
	// via --source-rpc-overrides when the public defaults are stale
	// or rate-limited (e.g. rpc.sepolia.org returning 404 today).
	Overrides map[string]string

	// Timeout bounds each individual JSON-RPC call. Zero ⇒ DefaultRPCTimeout.
	Timeout time.Duration

	// HTTPClient is the underlying http.Client. Zero ⇒ http.DefaultClient.
	HTTPClient *http.Client

	// callSeq is a monotonic JSON-RPC `id` counter. Atomic — safe
	// for concurrent use without external locking.
	callSeq atomic.Uint64
}

// NewRPCProvider builds a provider with the package's default endpoint
// table + the supplied overrides (may be nil). Pass nil for defaults.
func NewRPCProvider(overrides map[string]string, timeout time.Duration) *RPCProvider {
	return &RPCProvider{
		Endpoints: DefaultEndpoints(),
		Overrides: overrides,
		Timeout:   timeout,
	}
}

func (p *RPCProvider) httpClient() *http.Client {
	if p.HTTPClient != nil {
		return p.HTTPClient
	}
	return http.DefaultClient
}

func (p *RPCProvider) timeout() time.Duration {
	if p.Timeout > 0 {
		return p.Timeout
	}
	return DefaultRPCTimeout
}

func (p *RPCProvider) url(network string) string {
	if u, ok := p.Overrides[network]; ok && u != "" {
		return u
	}
	if p.Endpoints == nil {
		return ""
	}
	return p.Endpoints[network]
}

// =============================================================================
// Provider implementation
// =============================================================================

// PendingNonce queries eth_getTransactionCount(address, "pending").
func (p *RPCProvider) PendingNonce(ctx context.Context, network, address string) (uint64, error) {
	url := p.url(network)
	if url == "" {
		return 0, fmt.Errorf("txassembler: no RPC endpoint configured for %s", network)
	}

	type resp struct {
		Result string `json:"result"`
		Error  *struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		} `json:"error,omitempty"`
	}
	var r resp
	if err := p.jsonRPC(ctx, url, "eth_getTransactionCount",
		[]any{address, "pending"}, &r); err != nil {
		return 0, err
	}
	if r.Error != nil {
		return 0, fmt.Errorf("txassembler: eth_getTransactionCount: rpc %d: %s",
			r.Error.Code, r.Error.Message)
	}
	n, err := parseHexUint64(r.Result)
	if err != nil {
		return 0, fmt.Errorf("txassembler: parse nonce hex %q: %w", r.Result, err)
	}
	return n, nil
}

// SuggestGasPrice queries eth_gasPrice.
func (p *RPCProvider) SuggestGasPrice(ctx context.Context, network string) (*big.Int, error) {
	url := p.url(network)
	if url == "" {
		return nil, fmt.Errorf("txassembler: no RPC endpoint configured for %s", network)
	}
	type resp struct {
		Result string `json:"result"`
		Error  *struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		} `json:"error,omitempty"`
	}
	var r resp
	if err := p.jsonRPC(ctx, url, "eth_gasPrice", []any{}, &r); err != nil {
		return nil, err
	}
	if r.Error != nil {
		return nil, fmt.Errorf("txassembler: eth_gasPrice: rpc %d: %s",
			r.Error.Code, r.Error.Message)
	}
	n, err := parseHexBigInt(r.Result)
	if err != nil {
		return nil, fmt.Errorf("txassembler: parse gas price hex %q: %w", r.Result, err)
	}
	if n.Sign() <= 0 {
		return nil, fmt.Errorf("txassembler: eth_gasPrice returned non-positive value %q", r.Result)
	}
	return n, nil
}

// =============================================================================
// HTTP transport
// =============================================================================

func (p *RPCProvider) jsonRPC(ctx context.Context, url, method string, params any, out any) error {
	body, err := json.Marshal(map[string]any{
		"jsonrpc": "2.0",
		"id":      p.callSeq.Add(1),
		"method":  method,
		"params":  params,
	})
	if err != nil {
		return fmt.Errorf("marshal %s: %w", method, err)
	}

	// Retry transient upstream failures (502/503/504 + network errors).
	// Several public RPC gateways (e.g. krakend in front of
	// api.lux-test.network) return 502 intermittently under bursty
	// load — without retry, every signing tick that catches a 502
	// rolls the swap back and waits 5s+ for the next tick. With
	// retry we usually succeed within the first PreSign call, so
	// the swap advances on the first signing tick instead of the
	// 10th. Exponential backoff: 200ms → 400ms → 800ms (max 3 tries).
	const maxAttempts = 3
	var lastErr error
	for attempt := 0; attempt < maxAttempts; attempt++ {
		if attempt > 0 {
			delay := time.Duration(200*(1<<(attempt-1))) * time.Millisecond
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(delay):
			}
		}
		err := p.jsonRPCOnce(ctx, url, method, body, out)
		if err == nil {
			return nil
		}
		// Don't retry context cancel / deadline.
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return err
		}
		lastErr = err
		// Only retry transient HTTP errors. JSON decode failures + 4xx
		// are not transient — bailing fast surfaces the real problem.
		if !isTransientRPCErr(err) {
			return err
		}
	}
	return lastErr
}

// jsonRPCOnce is one attempt of the JSON-RPC call. The wrapper above
// retries it on transient failures.
func (p *RPCProvider) jsonRPCOnce(ctx context.Context, url, method string, body []byte, out any) error {
	callCtx, cancel := context.WithTimeout(ctx, p.timeout())
	defer cancel()

	req, err := http.NewRequestWithContext(callCtx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := p.httpClient().Do(req)
	if err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return err
		}
		return fmt.Errorf("txassembler: %s transport: %w", method, err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("txassembler: %s HTTP %d: %s",
			method, resp.StatusCode, truncateRPC(respBody, 200))
	}
	if err := json.Unmarshal(respBody, out); err != nil {
		return fmt.Errorf("txassembler: %s decode: %w (body=%s)",
			method, err, truncateRPC(respBody, 200))
	}
	return nil
}

// isTransientRPCErr reports whether err looks like something a quick
// retry might fix — HTTP 502/503/504 from a gateway, or a generic
// network-layer transport error. 4xx and decode errors are NOT
// transient: retrying them just wastes calls.
func isTransientRPCErr(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "HTTP 502") ||
		strings.Contains(msg, "HTTP 503") ||
		strings.Contains(msg, "HTTP 504") ||
		strings.Contains(msg, "transport:")
}

// =============================================================================
// Hex parsing helpers
// =============================================================================

// parseHexUint64 accepts an Ethereum-style "0x..." hex string and
// returns the unsigned 64-bit integer. Empty / "0x" / "0x0" → 0.
func parseHexUint64(s string) (uint64, error) {
	s = strings.TrimPrefix(strings.TrimPrefix(s, "0x"), "0X")
	if s == "" {
		return 0, nil
	}
	var n uint64
	for i := 0; i < len(s); i++ {
		nibble, ok := hexNibble(s[i])
		if !ok {
			return 0, fmt.Errorf("invalid hex char %q", s[i])
		}
		// Reject overflow — 16 hex chars = 64 bits is the max for uint64.
		if n > (1<<60)-1 {
			return 0, errors.New("nonce overflow")
		}
		n = (n << 4) | uint64(nibble)
	}
	return n, nil
}

// parseHexBigInt accepts an Ethereum-style "0x..." hex string and
// returns the value as *big.Int.
func parseHexBigInt(s string) (*big.Int, error) {
	s = strings.TrimPrefix(strings.TrimPrefix(s, "0x"), "0X")
	if s == "" {
		return new(big.Int), nil
	}
	n, ok := new(big.Int).SetString(s, 16)
	if !ok {
		return nil, fmt.Errorf("invalid hex %q", s)
	}
	return n, nil
}

func truncateRPC(b []byte, n int) string {
	if len(b) <= n {
		return string(b)
	}
	return string(b[:n]) + "…"
}
