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

	// TONBalanceURLs maps a TON network to its TON Center
	// /getAddressBalance endpoint. Distinct from Overrides because
	// the sendBoc URL and the getAddressBalance URL are different
	// paths under the same toncenter base (e.g.
	// `https://toncenter.com/api/v2/getAddressBalance` vs
	// `/api/v2/sendBoc`). Operators configure both via networks.yaml.
	TONBalanceURLs map[string]string

	// TONAPIKeys mirrors broadcast.Client.TONAPIKeys — the same
	// X-API-Key value is reused for the balance lookup. Optional.
	TONAPIKeys map[string]string

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

// BalanceAt implements BalanceProbe. Returns the native-asset balance
// at `address` on `network`, in the chain's base unit (wei for EVM,
// lamports for Solana, nanoton for TON). The unit is consistent with
// the assembler's gas calculation for that family — see
// signing_driver.gasPrecheck / gasPrecheckSOL / gasPrecheckTON.
func (c *BalanceProbeClient) BalanceAt(ctx context.Context, network, address string) (*big.Int, error) {
	if network == "" {
		return nil, errors.New("balance_probe: empty network")
	}
	if address == "" {
		return nil, errors.New("balance_probe: empty address")
	}
	// Branch on family.
	//  - Solana: getBalance JSON-RPC (lamports as JSON number, not hex)
	//  - TON: GET getAddressBalance REST (nanoton as decimal string)
	//  - other non-EVM families (BTC / XRP / DOT / Cardano) don't have
	//    a gas pre-check implementation yet → return
	//    ErrFamilyNotSupportedForBalance and the signing driver skips
	//    the generic pre-check (each family handles its own).
	switch {
	case strings.HasPrefix(network, "SOLANA_"):
		return c.balanceSOL(ctx, network, address)
	case strings.HasPrefix(network, "TON_"):
		return c.balanceAtTON(ctx, network, address)
	case strings.HasPrefix(network, "BITCOIN_"),
		strings.HasPrefix(network, "XRP_"),
		strings.HasPrefix(network, "POLKADOT_"),
		strings.HasPrefix(network, "CARDANO_"):
		return nil, ErrFamilyNotSupportedForBalance
	}
	return c.balanceEVM(ctx, network, address)
}

// balanceEVM is the eth_getBalance path. Returns wei.
func (c *BalanceProbeClient) balanceEVM(ctx context.Context, network, address string) (*big.Int, error) {
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

	respBody, status, err := c.doRPC(ctx, url, body)
	if err != nil {
		return nil, err
	}
	if status < 200 || status >= 300 {
		return nil, fmt.Errorf("balance_probe: HTTP %d: %s", status, truncBP(respBody, 200))
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

// balanceSOL is the getBalance path for Solana. Returns lamports.
// Wire shape:
//
//	{"jsonrpc":"2.0","id":N,"method":"getBalance","params":["<pubkey>"]}
//	→ {"jsonrpc":"2.0","id":N,"result":{"context":{...},"value":<lamports as JSON number>}}
//
// Note: value is a plain JSON number, not hex. Solana's lamports easily
// fit in a uint64; we decode through json.Number → *big.Int for safety
// against any unusual fixture sizes.
func (c *BalanceProbeClient) balanceSOL(ctx context.Context, network, address string) (*big.Int, error) {
	url := c.rpcURL(network)
	if url == "" {
		return nil, fmt.Errorf("balance_probe: no RPC URL configured for %s", network)
	}
	body, _ := json.Marshal(map[string]any{
		"jsonrpc": "2.0",
		"id":      c.callSeq.Add(1),
		"method":  "getBalance",
		"params":  []any{address, map[string]any{"commitment": "confirmed"}},
	})
	respBody, status, err := c.doRPC(ctx, url, body)
	if err != nil {
		return nil, err
	}
	if status < 200 || status >= 300 {
		return nil, fmt.Errorf("balance_probe: HTTP %d: %s", status, truncBP(respBody, 200))
	}
	var parsed struct {
		Result struct {
			Value json.Number `json:"value"`
		} `json:"result"`
		Error *struct {
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
	if parsed.Result.Value == "" {
		return big.NewInt(0), nil
	}
	n, ok := new(big.Int).SetString(parsed.Result.Value.String(), 10)
	if !ok {
		return nil, fmt.Errorf("balance_probe: invalid lamports result %q", parsed.Result.Value)
	}
	return n, nil
}

// doRPC is the shared JSON-RPC POST. Extracted so balanceEVM and
// balanceSOL can share transport boilerplate without duplicating http
// client management.
func (c *BalanceProbeClient) doRPC(ctx context.Context, url string, body []byte) ([]byte, int, error) {
	callCtx, cancel := context.WithTimeout(ctx, c.Timeout)
	defer cancel()
	req, err := http.NewRequestWithContext(callCtx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	client := c.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: c.Timeout}
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("balance_probe: %s transport: %w", url, err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	return respBody, resp.StatusCode, nil
}

// isLikelyNonEVMNetwork is a fast gate for the well-known non-EVM
// families. Used by external callers (the historical predicate); the
// BalanceAt switch routes Solana + TON to dedicated handlers BEFORE
// this gate fires, so both DO work via this client — see balanceSOL
// and balanceAtTON.
func isLikelyNonEVMNetwork(network string) bool {
	switch {
	case strings.HasPrefix(network, "BITCOIN_"),
		strings.HasPrefix(network, "SOLANA_"),
		strings.HasPrefix(network, "XRP_"),
		strings.HasPrefix(network, "POLKADOT_"),
		strings.HasPrefix(network, "CARDANO_"):
		return true
	}
	return false
}

// balanceAtTON queries TON Center for the nanoton balance at `address`
// on `network`. Returns *big.Int of nanoton (1 TON = 1e9 nanoton).
//
// Wire shape: GET <toncenter>/getAddressBalance?address=<addr>
//   - X-API-Key from c.TONAPIKeys[network] if configured.
//   - Response: {"ok":true,"result":"<nanoton as decimal string>"}.
//   - Errors mirror sendBoc's shape; we surface them as plain errors
//     since the signing driver already treats balance-probe errors as
//     best-effort (logs + continues — see gasPrecheck).
func (c *BalanceProbeClient) balanceAtTON(ctx context.Context, network, addressStr string) (*big.Int, error) {
	url := c.tonBalanceURL(network)
	if url == "" {
		return nil, ErrFamilyNotSupportedForBalance
	}
	// Toncenter accepts user-friendly (UQ/EQ) AND raw addresses
	// transparently. We pass the address through verbatim.
	sep := "?"
	if strings.Contains(url, "?") {
		sep = "&"
	}
	full := url + sep + "address=" + addressStr

	callCtx, cancel := context.WithTimeout(ctx, c.tonTimeout())
	defer cancel()

	req, err := http.NewRequestWithContext(callCtx, http.MethodGet, full, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	if k := c.tonAPIKey(network); k != "" {
		req.Header.Set("X-API-Key", k)
	}

	client := c.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: c.tonTimeout()}
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("balance_probe: ton transport: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("balance_probe: ton HTTP %d: %s", resp.StatusCode, truncBP(body, 200))
	}
	var parsed struct {
		OK     bool   `json:"ok"`
		Result string `json:"result"`
		Error  string `json:"error,omitempty"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("balance_probe: ton decode: %w (body=%s)", err, truncBP(body, 200))
	}
	if !parsed.OK {
		return nil, fmt.Errorf("balance_probe: ton: %s", parsed.Error)
	}
	if parsed.Result == "" {
		return big.NewInt(0), nil
	}
	n, ok := new(big.Int).SetString(parsed.Result, 10)
	if !ok {
		return nil, fmt.Errorf("balance_probe: ton: invalid decimal %q", parsed.Result)
	}
	return n, nil
}

func (c *BalanceProbeClient) tonBalanceURL(network string) string {
	if c.TONBalanceURLs == nil {
		return ""
	}
	return c.TONBalanceURLs[network]
}

func (c *BalanceProbeClient) tonAPIKey(network string) string {
	if c.TONAPIKeys == nil {
		return ""
	}
	return c.TONAPIKeys[network]
}

func (c *BalanceProbeClient) tonTimeout() time.Duration {
	if c.Timeout > 0 {
		return c.Timeout
	}
	return 8 * time.Second
}

func truncBP(b []byte, n int) string {
	if len(b) <= n {
		return string(b)
	}
	return string(b[:n]) + "…"
}

// Compile-time check: *BalanceProbeClient satisfies BalanceProbe.
var _ BalanceProbe = (*BalanceProbeClient)(nil)
