package main

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

	"github.com/luxfi/bridge/internal/broadcast"
	"github.com/luxfi/bridge/internal/depositcheck"
)

// balance_probe.go: small wrapper around eth_getBalance used by the
// signing driver's gas pre-check and by the release pool's
// low-balance alerter.
//
// Why a separate file: the refund driver already speaks eth_getBalance
// (refund_driver.go::fetchBalance) but it's coupled to that driver's
// state machine. Pulling it into a free-standing BalanceProbe lets the
// signing driver + release pool reuse the same RPC URL resolution
// policy (overrides → broadcast → depositcheck table) without
// recreating an http.Client every tick.
//
// Wire shape: standard EVM JSON-RPC:
//
//	POST <network rpc>
//	{"jsonrpc":"2.0","id":N,"method":"eth_getBalance","params":[addr,"latest"]}
//	→ {"jsonrpc":"2.0","id":N,"result":"0x<hex>"}
//
// Non-EVM networks return ErrFamilyNotSupportedForBalance — the gas
// pre-check is a no-op on those for now (Bitcoin / Solana / TON each
// have their own balance shape; layered in as those broadcasters land).

// ErrFamilyNotSupportedForBalance is returned by BalanceProbeClient
// for non-EVM networks. Callers MUST treat it as a "skip pre-check"
// signal, not a hard error.
var ErrFamilyNotSupportedForBalance = errors.New("balance_probe: non-EVM family not supported")

// BalanceProbeClient is the production BalanceProbe. Reuses the
// same RPC URL resolution as the broadcast client + refund driver
// (overrides → broadcast.RPCURLFor → depositcheck.RPCURLFor).
type BalanceProbeClient struct {
	// Overrides shadows the package RPC tables (same map the bridge
	// builds from --source-rpc-overrides).
	Overrides map[string]string

	// Timeout caps each individual call. Zero ⇒ 8s.
	Timeout time.Duration

	// HTTPClient is the underlying http.Client. Zero ⇒ a fresh
	// http.Client with Timeout.
	HTTPClient *http.Client

	// callSeq is the JSON-RPC id counter — atomic for concurrent
	// callers (signing driver + release pool both hit this).
	callSeq atomic.Uint64
}

// NewBalanceProbe builds a probe with the supplied URL overrides.
func NewBalanceProbe(overrides map[string]string, timeout time.Duration) *BalanceProbeClient {
	if timeout <= 0 {
		timeout = 8 * time.Second
	}
	return &BalanceProbeClient{
		Overrides:  overrides,
		Timeout:    timeout,
		HTTPClient: &http.Client{Timeout: timeout},
	}
}

func (c *BalanceProbeClient) rpcURL(network string) string {
	if u, ok := c.Overrides[network]; ok && u != "" {
		return u
	}
	if u := broadcast.RPCURLFor(network); u != "" {
		return u
	}
	return depositcheck.RPCURLFor(network)
}

// BalanceAt implements BalanceProbe. Returns the wei balance at
// `address` on `network` (latest block). EVM networks only.
func (c *BalanceProbeClient) BalanceAt(ctx context.Context, network, address string) (*big.Int, error) {
	if network == "" {
		return nil, errors.New("balance_probe: empty network")
	}
	if address == "" {
		return nil, errors.New("balance_probe: empty address")
	}
	// EVM gate. AddressTypeFor lives in mchain — reuse it via the
	// broadcast.RPCURLFor table check below. Non-EVM networks have
	// no entry there, which falls through to the depositcheck table;
	// a non-EVM network with a depositcheck entry would still return
	// data shaped wrong for eth_getBalance, so refuse explicitly
	// for the well-known non-EVM families. (Keeping the EVM gate
	// inline rather than importing mchain.AddressTypeFor — avoids a
	// circular-import risk and keeps balance_probe a leaf package
	// consumer.)
	if isLikelyNonEVMNetwork(network) {
		return nil, ErrFamilyNotSupportedForBalance
	}

	url := c.rpcURL(network)
	if url == "" {
		return nil, fmt.Errorf("balance_probe: no RPC URL configured for %s", network)
	}

	body, _ := json.Marshal(map[string]any{
		"jsonrpc": "2.0",
		"id":      c.callSeq.Add(1),
		"method":  "eth_getBalance",
		"params":  []any{address, "latest"},
	})

	callCtx, cancel := context.WithTimeout(ctx, c.Timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(callCtx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	client := c.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: c.Timeout}
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("balance_probe: %s transport: %w", url, err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("balance_probe: HTTP %d: %s", resp.StatusCode, truncBP(respBody, 200))
	}
	var parsed struct {
		Result string `json:"result"`
		Error  *struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		} `json:"error,omitempty"`
	}
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return nil, fmt.Errorf("balance_probe: decode: %w (body=%s)", err, truncBP(respBody, 200))
	}
	if parsed.Error != nil {
		return nil, fmt.Errorf("balance_probe: rpc %d: %s", parsed.Error.Code, parsed.Error.Message)
	}
	h := strings.TrimPrefix(strings.TrimPrefix(parsed.Result, "0x"), "0X")
	if h == "" {
		return big.NewInt(0), nil
	}
	n, ok := new(big.Int).SetString(h, 16)
	if !ok {
		return nil, fmt.Errorf("balance_probe: invalid hex result %q", parsed.Result)
	}
	return n, nil
}

// isLikelyNonEVMNetwork is a fast gate for the well-known non-EVM
// families. The bridge supports BTC/SOL/TON/XRP/DOT keygen but does
// NOT support those broadcast paths today, so the gas pre-check is
// inapplicable. Returning ErrFamilyNotSupportedForBalance from
// BalanceAt lets the caller skip the pre-check rather than choking.
func isLikelyNonEVMNetwork(network string) bool {
	switch {
	case strings.HasPrefix(network, "BITCOIN_"),
		strings.HasPrefix(network, "SOLANA_"),
		strings.HasPrefix(network, "TON_"),
		strings.HasPrefix(network, "XRP_"),
		strings.HasPrefix(network, "POLKADOT_"),
		strings.HasPrefix(network, "CARDANO_"):
		return true
	}
	return false
}

func truncBP(b []byte, n int) string {
	if len(b) <= n {
		return string(b)
	}
	return string(b[:n]) + "…"
}

// Compile-time check: *BalanceProbeClient satisfies BalanceProbe.
var _ BalanceProbe = (*BalanceProbeClient)(nil)
