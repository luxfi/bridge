// Package depositcheck is the Go port of `checkNativeDeposit` and its
// per-chain implementations from `app/server/src/domain/mpc-wallet.ts`
// + `substrate-deposit.ts`.
//
// Given a (network, address, asset, requiredAmount) tuple, the Check
// method dispatches to the chain-appropriate RPC / REST balance probe
// and returns whether the balance at the address meets or exceeds the
// required amount.
//
// Trust model: each upstream RPC / REST endpoint is treated as
// best-effort transport. The authoritative "swap can advance to
// signing" decision is made by b-chain (BridgeVM); this package is
// only useful for ops diagnostics, latency monitoring, or as a
// secondary verification layer. Production swap-state advancement
// belongs to BridgeVM's own watcher, not to anything in here.
//
// Returns from `Check`:
//   - (true, nil)  — confirmed deposit
//   - (false, nil) — no error, just not enough funds yet
//   - (false, err) — RPC failure / decode failure / unsupported chain
//
// Big-number handling: balances come back as wei / lamports / planck
// (very large integers). We keep them in math/big until the very last
// step (comparison against requiredAmount) where we convert to
// float64. For the human-scale amounts the bridge cares about
// (≤ ~1e9 of any unit) float64 has more than enough precision.
//
// Substrate (DOT) checks are unimplemented — returns
// ErrSubstrateNotImplemented. Add SS58 + an AccountInfo decoder to
// finish that case.

package depositcheck

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"strings"
	"time"

	"github.com/luxfi/bridge/internal/mchain"
	"github.com/luxfi/bridge/internal/tokens"
)

// =============================================================================
// RPC URL registry — mirrors RPC_URLS in mpc-wallet.ts + substrate-deposit.ts
// =============================================================================

// rpcURLs is the canonical (network → upstream URL) table. Keep in sync
// with the TS RPC_URLS map; the Go server reads this table for every
// Check call.
var rpcURLs = map[string]string{
	// EVM
	"ETHEREUM_MAINNET":  "https://eth.llamarpc.com",
	"ETHEREUM_SEPOLIA":  "https://rpc.sepolia.org",
	"BASE_MAINNET":      "https://mainnet.base.org",
	"BASE_SEPOLIA":      "https://sepolia.base.org",
	"LUX_MAINNET":       "https://api.lux.network/ext/bc/C/rpc",
	"LUX_TESTNET":       "https://api.lux-test.network/ext/bc/C/rpc",
	"ZOO_MAINNET":       "https://api.zoo.network/ext/bc/Z/rpc",
	"ZOO_TESTNET":       "https://api.zoo-test.network/ext/bc/Z/rpc",
	"BSC_MAINNET":       "https://bsc-dataseed.binance.org",
	"BSC_TESTNET":       "https://data-seed-prebsc-1-s1.binance.org:8545",
	"POLYGON_MAINNET":   "https://polygon-rpc.com",
	"ARBITRUM_MAINNET":  "https://arb1.arbitrum.io/rpc",
	"OPTIMISM_MAINNET":  "https://mainnet.optimism.io",
	"AVAX_MAINNET":      "https://api.avax.network/ext/bc/C/rpc",
	"HOLESKY_TESTNET":   "https://ethereum-holesky-rpc.publicnode.com",
	// Bitcoin (Blockstream REST API base — note: NOT JSON-RPC)
	"BITCOIN_MAINNET": "https://blockstream.info/api",
	"BITCOIN_TESTNET": "https://blockstream.info/testnet/api",
	// Solana (JSON-RPC)
	"SOLANA_MAINNET": "https://api.mainnet-beta.solana.com",
	"SOLANA_DEVNET":  "https://api.devnet.solana.com",
	// TON (TON Center REST API)
	"TON_MAINNET": "https://toncenter.com/api/v2",
	"TON_TESTNET": "https://testnet.toncenter.com/api/v2",
	// Polkadot
	"POLKADOT_MAINNET": "https://rpc.polkadot.io",
}

// RPCURLFor returns the configured upstream URL for a network. Unknown
// → "" (caller surfaces ErrUnsupportedNetwork).
func RPCURLFor(network string) string {
	return rpcURLs[network]
}

// =============================================================================
// Sentinel errors
// =============================================================================

// ErrUnsupportedNetwork is returned when the network is not in the
// rpcURLs table (or its address family has no deposit-check
// implementation in Go yet).
var ErrUnsupportedNetwork = errors.New("depositcheck: unsupported network")

// ErrSubstrateNotImplemented is returned for Polkadot / substrate
// deposit checks. SS58 decoding + AccountInfo storage read against
// the polkadot RPC are not implemented in Go yet; routed callers
// should fall back to bchain's own watcher or polling tooling.
var ErrSubstrateNotImplemented = errors.New(
	"depositcheck: substrate (dot) deposit check not implemented; needs SS58 decode + AccountInfo storage read",
)

// =============================================================================
// Client
// =============================================================================

// DefaultTimeout caps every individual RPC / REST call. Conservative:
// public RPCs are sometimes slow. Caller context can tighten it.
const DefaultTimeout = 10 * time.Second

// Client holds the HTTP transport + timeouts used by Check.
// The zero value is usable — RPC URLs come from the package-level table.
type Client struct {
	// Timeout bounds each individual upstream call. Zero ⇒ DefaultTimeout.
	Timeout time.Duration

	// HTTPClient is the underlying http.Client. Zero ⇒ http.DefaultClient.
	HTTPClient *http.Client

	// RPCURLOverrides lets callers point at custom endpoints (e.g. a
	// privately-hosted Sepolia mirror) instead of the public defaults.
	// Looked up before the package-level table.
	RPCURLOverrides map[string]string

	// Tokens, when set, drives ERC-20 detection: assets registered
	// with a non-empty Contract use `eth_call balanceOf(addr)` against
	// that contract; native-token assets continue to use eth_getBalance.
	// Asset decimals are pulled from the registry too (no more
	// hardcoded 18). When nil, every EVM check uses the legacy
	// native-only path with 18 decimals — backward compat for callers
	// that haven't migrated to the registry yet.
	Tokens *tokens.Registry
}

// New is a convenience constructor.
func New(timeout time.Duration) *Client {
	return &Client{Timeout: timeout}
}

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

// rpcURL resolves the upstream URL for a network, checking overrides
// first. Returns "" if not configured.
func (c *Client) rpcURL(network string) string {
	if u, ok := c.RPCURLOverrides[network]; ok && u != "" {
		return u
	}
	return rpcURLs[network]
}

// =============================================================================
// Check — top-level dispatch
// =============================================================================

// CheckParams is the input to Check. Lifted directly from the TS
// `checkNativeDeposit` parameter object — same field names + semantics.
type CheckParams struct {
	NetworkInternalName string
	Address             string
	Asset               string
	RequiredAmount      float64

	// SOLBaselineLamports is the lamport balance the SOL source deposit
	// wallet held at swap-create time. When > 0 and the source is SOL,
	// checkSOL compares (current − baseline) to the required amount
	// instead of plain (current ≥ required). Fixes a false-positive
	// "deposit confirmed" when mpcd-single's HKDF ed25519 keygen returns
	// the SAME pubkey for the per-swap deposit wallet and the long-lived
	// release wallet (deposit==release under single-signer custody), so
	// the standing release-wallet liquidity would otherwise look like a
	// funded deposit on the first poll. Zero ⇒ legacy behaviour
	// (preserves the pre-baseline check for swaps minted without a
	// snapshot, and for real threshold custody where the collision
	// doesn't occur). See G8 in REQUIREMENTS §13.7.
	SOLBaselineLamports uint64

	// TONBaselineNanotons mirrors SOLBaselineLamports for TON sources.
	// mpcd-single's TON keygen has the same shared-address-pool quirk
	// (the per-swap deposit wallet is the same V4R2 contract address as
	// the long-lived release wallet, which holds standing liquidity).
	// When > 0 and the source is TON, checkTON compares (current −
	// baseline) to required instead of plain (current ≥ required).
	// Zero ⇒ legacy behaviour.
	TONBaselineNanotons uint64
}

// Check dispatches to the right per-chain probe and returns whether
// the deposit address holds at least `RequiredAmount` of the given
// asset in human-readable units.
func (c *Client) Check(ctx context.Context, p CheckParams) (bool, error) {
	url := c.rpcURL(p.NetworkInternalName)
	if url == "" {
		return false, fmt.Errorf("%w: %s", ErrUnsupportedNetwork, p.NetworkInternalName)
	}

	addrType := mchain.AddressTypeFor(p.NetworkInternalName)
	switch addrType {
	case mchain.AddressTypeETH:
		return c.checkEVM(ctx, url, p.NetworkInternalName, p.Address, p.Asset, p.RequiredAmount)
	case mchain.AddressTypeBTC:
		return c.checkBTC(ctx, url, p.Address, p.RequiredAmount)
	case mchain.AddressTypeSOL:
		// TON shares the SOL slot in mchain — but the deposit-check
		// protocols are completely different (RPC vs REST), so we
		// route by network → AddressType, not by SOL/TON family.
		return c.checkSOL(ctx, url, p.Address, p.Asset, p.RequiredAmount, p.SOLBaselineLamports)
	case mchain.AddressTypeTON:
		return c.checkTON(ctx, url, p.Address, p.RequiredAmount, p.TONBaselineNanotons)
	case mchain.AddressTypeXRP:
		// XRP deposit detection not implemented in TS either (the
		// mpc-wallet.ts default falls through to a warn-and-return-false).
		// Mirror that behaviour with an explicit error.
		return false, fmt.Errorf("%w: xrp deposit check not implemented", ErrUnsupportedNetwork)
	case mchain.AddressTypeDOT:
		return false, ErrSubstrateNotImplemented
	default:
		return false, fmt.Errorf("%w: address type %q has no deposit-check impl",
			ErrUnsupportedNetwork, addrType)
	}
}

// =============================================================================
// EVM — eth_getBalance for natives, eth_call balanceOf for ERC-20
// =============================================================================

// erc20BalanceOfSelector is the first 4 bytes of
// keccak256("balanceOf(address)") — the canonical ERC-20 selector for
// reading a holder's balance. Constant per the Solidity ABI.
var erc20BalanceOfSelector = [4]byte{0x70, 0xa0, 0x82, 0x31}

func (c *Client) checkEVM(ctx context.Context, rpcURL, network, address, asset string, requiredAmount float64) (bool, error) {
	// Decide the path: native (eth_getBalance) vs ERC-20 (eth_call).
	// Registry lookup gives us the per-asset Contract + Decimals.
	var (
		contract string
		decimals = 18 // default — fits ETH/LUX/BNB/etc. (most native gas tokens)
	)
	if c.Tokens != nil {
		if info, ok := c.Tokens.Lookup(network, asset); ok {
			contract = info.Contract
			decimals = info.Decimals
		}
	}

	if contract == "" {
		return c.checkEVMNative(ctx, rpcURL, address, decimals, requiredAmount)
	}
	return c.checkEVMERC20(ctx, rpcURL, contract, address, decimals, requiredAmount)
}

// checkEVMNative queries eth_getBalance for the chain's native asset.
func (c *Client) checkEVMNative(ctx context.Context, rpcURL, address string, decimals int, requiredAmount float64) (bool, error) {
	type ethBalanceResp struct {
		Result string `json:"result"`
		Error  *struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		} `json:"error,omitempty"`
	}
	var resp ethBalanceResp
	if err := c.jsonRPC(ctx, rpcURL, "eth_getBalance",
		[]any{address, "latest"}, &resp); err != nil {
		return false, err
	}
	if resp.Error != nil {
		return false, fmt.Errorf("depositcheck: eth_getBalance rpc %d: %s", resp.Error.Code, resp.Error.Message)
	}
	if resp.Result == "" {
		return false, fmt.Errorf("depositcheck: eth_getBalance: empty result")
	}
	bal, err := parseHexBalance(resp.Result)
	if err != nil {
		return false, fmt.Errorf("depositcheck: eth_getBalance: %w", err)
	}
	return compareBalance(bal, decimals, requiredAmount), nil
}

// checkEVMERC20 queries `balanceOf(address)` on the token contract
// via eth_call.
//
// Call shape:
//   eth_call({ to: contract, data: 0x70a08231 || <addr_padded_32B> }, "latest")
// Response: 0x-prefixed hex of the 32-byte balance word.
func (c *Client) checkEVMERC20(ctx context.Context, rpcURL, contract, holder string, decimals int, requiredAmount float64) (bool, error) {
	holderBytes, err := parseAddress20(holder)
	if err != nil {
		return false, fmt.Errorf("depositcheck: ERC-20 holder address: %w", err)
	}
	// data = selector || abi.encode(address) — address is 12 leading zero
	// bytes followed by the 20-byte address.
	data := make([]byte, 0, 4+32)
	data = append(data, erc20BalanceOfSelector[:]...)
	var addrWord [32]byte
	copy(addrWord[12:], holderBytes)
	data = append(data, addrWord[:]...)

	callObj := map[string]string{
		"to":   contract,
		"data": "0x" + hex.EncodeToString(data),
	}

	type ethCallResp struct {
		Result string `json:"result"`
		Error  *struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		} `json:"error,omitempty"`
	}
	var resp ethCallResp
	if err := c.jsonRPC(ctx, rpcURL, "eth_call",
		[]any{callObj, "latest"}, &resp); err != nil {
		return false, err
	}
	if resp.Error != nil {
		return false, fmt.Errorf("depositcheck: eth_call balanceOf rpc %d: %s", resp.Error.Code, resp.Error.Message)
	}
	if resp.Result == "" {
		return false, fmt.Errorf("depositcheck: eth_call balanceOf: empty result")
	}
	bal, err := parseHexBalance(resp.Result)
	if err != nil {
		return false, fmt.Errorf("depositcheck: eth_call balanceOf: %w", err)
	}
	return compareBalance(bal, decimals, requiredAmount), nil
}

// parseHexBalance decodes a 0x-prefixed hex string into a big.Int.
// Empty / "0x" / "0x0" → 0. Whitespace tolerated.
func parseHexBalance(s string) (*big.Int, error) {
	s = strings.TrimSpace(s)
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

// compareBalance scales a base-unit balance (wei, base-uint256 token
// units, etc.) by 10^decimals and compares to requiredAmount.
func compareBalance(bal *big.Int, decimals int, requiredAmount float64) bool {
	if requiredAmount <= 0 {
		return bal.Sign() >= 0
	}
	scale := new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(decimals)), nil)
	balFloat := new(big.Float).Quo(
		new(big.Float).SetInt(bal),
		new(big.Float).SetInt(scale),
	)
	out, _ := balFloat.Float64()
	return out >= requiredAmount
}

// parseAddress20 decodes a 0x-prefixed hex address to 20 bytes.
func parseAddress20(addr string) ([]byte, error) {
	addr = strings.TrimPrefix(strings.TrimPrefix(addr, "0x"), "0X")
	if len(addr) != 40 {
		return nil, fmt.Errorf("invalid address length %d (want 40 hex chars)", len(addr))
	}
	out, err := hex.DecodeString(addr)
	if err != nil {
		return nil, fmt.Errorf("invalid hex: %w", err)
	}
	return out, nil
}

// =============================================================================
// Bitcoin — Blockstream REST `/address/{addr}`
// =============================================================================

func (c *Client) checkBTC(ctx context.Context, apiBase, address string, requiredAmount float64) (bool, error) {
	url := strings.TrimRight(apiBase, "/") + "/address/" + address
	var resp struct {
		ChainStats struct {
			FundedTxoSum int64 `json:"funded_txo_sum"`
			SpentTxoSum  int64 `json:"spent_txo_sum"`
		} `json:"chain_stats"`
	}
	if err := c.getJSON(ctx, url, &resp); err != nil {
		return false, err
	}
	balSats := resp.ChainStats.FundedTxoSum - resp.ChainStats.SpentTxoSum
	if balSats < 0 {
		balSats = 0
	}
	balBtc := float64(balSats) / 1e8
	return balBtc >= requiredAmount, nil
}

// =============================================================================
// Solana — JSON-RPC `getBalance`
// =============================================================================

func (c *Client) checkSOL(ctx context.Context, rpcURL, address, _asset string, requiredAmount float64, baselineLamports uint64) (bool, error) {
	type solBalanceResp struct {
		Result struct {
			Value uint64 `json:"value"`
		} `json:"result"`
		Error *struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		} `json:"error,omitempty"`
	}
	var resp solBalanceResp
	if err := c.jsonRPC(ctx, rpcURL, "getBalance",
		[]any{address}, &resp); err != nil {
		return false, err
	}
	if resp.Error != nil {
		return false, fmt.Errorf("depositcheck: solana getBalance rpc %d: %s",
			resp.Error.Code, resp.Error.Message)
	}
	balLamports := resp.Result.Value
	// Baseline-aware delta when supplied. Underflow guard: a baseline
	// above the current balance (wallet debited since snapshot) clamps
	// the delta to zero so uint subtraction never wraps into a spurious
	// confirm. Zero baseline ⇒ legacy current ≥ required.
	if baselineLamports > 0 {
		var deltaLamports uint64
		if balLamports > baselineLamports {
			deltaLamports = balLamports - baselineLamports
		}
		deltaSol := float64(deltaLamports) / 1e9
		return deltaSol >= requiredAmount, nil
	}
	balSol := float64(balLamports) / 1e9
	return balSol >= requiredAmount, nil
}

// FetchSOLLamports returns the current lamport balance at a Solana
// address. Used by the swap-create handler to snapshot the deposit
// wallet's balance into Swap.SOLSourceBaselineLamports so subsequent
// checkSOL calls can apply the delta-based confirmation above (vs the
// legacy current ≥ required which false-positives when mpcd-single's
// keygen returns the long-lived release-wallet address as the per-swap
// deposit wallet). Returns 0 (not an error) when the account hasn't
// been touched yet — a fresh deposit wallet must not fail swap creation.
func (c *Client) FetchSOLLamports(ctx context.Context, network, address string) (uint64, error) {
	url := c.rpcURL(network)
	if url == "" {
		return 0, fmt.Errorf("%w: %s", ErrUnsupportedNetwork, network)
	}
	type solBalanceResp struct {
		Result struct {
			Value uint64 `json:"value"`
		} `json:"result"`
		Error *struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		} `json:"error,omitempty"`
	}
	var resp solBalanceResp
	if err := c.jsonRPC(ctx, url, "getBalance", []any{address}, &resp); err != nil {
		return 0, err
	}
	if resp.Error != nil {
		return 0, fmt.Errorf("depositcheck: solana getBalance rpc %d: %s",
			resp.Error.Code, resp.Error.Message)
	}
	return resp.Result.Value, nil
}

// =============================================================================
// TON — TON Center REST `/getAddressBalance`
// =============================================================================

func (c *Client) checkTON(ctx context.Context, apiBase, address string, requiredAmount float64, baselineNanotons uint64) (bool, error) {
	url := strings.TrimRight(apiBase, "/") + "/getAddressBalance?address=" + address
	// TON Center returns balances as a *string* (decimal), not a number;
	// also returns an `ok: bool` envelope. We accept either flat or
	// envelope shapes.
	var raw struct {
		OK     bool        `json:"ok"`
		Result interface{} `json:"result"`
	}
	if err := c.getJSON(ctx, url, &raw); err != nil {
		return false, err
	}
	if raw.OK == false && raw.Result == nil {
		return false, fmt.Errorf("depositcheck: TON center response missing result")
	}
	var balNano int64
	switch v := raw.Result.(type) {
	case string:
		balBig, ok := new(big.Int).SetString(v, 10)
		if !ok {
			return false, fmt.Errorf("depositcheck: TON balance not a decimal string: %q", v)
		}
		balNano = balBig.Int64()
	case float64:
		balNano = int64(v)
	default:
		return false, fmt.Errorf("depositcheck: unexpected TON balance type %T", v)
	}
	// Baseline-aware delta when supplied. Underflow guard mirrors
	// checkSOL: a baseline above the current balance clamps to zero so
	// uint subtraction never wraps into a spurious confirm. Zero
	// baseline ⇒ legacy current ≥ required.
	if baselineNanotons > 0 {
		var balUnsigned uint64
		if balNano > 0 {
			balUnsigned = uint64(balNano)
		}
		var deltaNano uint64
		if balUnsigned > baselineNanotons {
			deltaNano = balUnsigned - baselineNanotons
		}
		deltaTon := float64(deltaNano) / 1e9
		return deltaTon >= requiredAmount, nil
	}
	balTon := float64(balNano) / 1e9
	return balTon >= requiredAmount, nil
}

// FetchTONNanotons returns the current nanoton balance for a TON
// account. Used by the swap-create handler to snapshot the baseline.
// actNotFound / never-funded accounts return 0 without error so a
// fresh deposit wallet doesn't fail swap creation.
func (c *Client) FetchTONNanotons(ctx context.Context, network, address string) (uint64, error) {
	if mchain.AddressTypeFor(network) != mchain.AddressTypeTON {
		return 0, fmt.Errorf("depositcheck: FetchTONNanotons called for non-TON network %s", network)
	}
	apiBase := c.rpcURL(network)
	if apiBase == "" {
		return 0, fmt.Errorf("%w: %s", ErrUnsupportedNetwork, network)
	}
	url := strings.TrimRight(apiBase, "/") + "/getAddressBalance?address=" + address
	var raw struct {
		OK     bool        `json:"ok"`
		Result interface{} `json:"result"`
	}
	if err := c.getJSON(ctx, url, &raw); err != nil {
		return 0, fmt.Errorf("depositcheck: ton %s FetchTONNanotons: %w", network, err)
	}
	if raw.Result == nil {
		return 0, nil
	}
	switch v := raw.Result.(type) {
	case string:
		if v == "" {
			return 0, nil
		}
		balBig, ok := new(big.Int).SetString(v, 10)
		if !ok {
			return 0, fmt.Errorf("depositcheck: TON balance not a decimal string: %q", v)
		}
		if balBig.Sign() < 0 {
			return 0, nil
		}
		return balBig.Uint64(), nil
	case float64:
		if v < 0 {
			return 0, nil
		}
		return uint64(v), nil
	default:
		return 0, fmt.Errorf("depositcheck: unexpected TON balance type %T", v)
	}
}

// =============================================================================
// HTTP helpers
// =============================================================================

// jsonRPC POSTs a single JSON-RPC 2.0 call and decodes the response
// into `out`. The response envelope (jsonrpc/id/result/error) is the
// caller's struct — different chains have slightly different shapes.
func (c *Client) jsonRPC(ctx context.Context, url, method string, params any, out any) error {
	body, err := json.Marshal(map[string]any{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  method,
		"params":  params,
	})
	if err != nil {
		return fmt.Errorf("depositcheck: marshal %s: %w", method, err)
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
		return err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("depositcheck: %s HTTP %d: %s", method, resp.StatusCode, truncate(respBody, 200))
	}
	if err := json.Unmarshal(respBody, out); err != nil {
		return fmt.Errorf("depositcheck: %s decode: %w (body=%s)", method, err, truncate(respBody, 200))
	}
	return nil
}

// getJSON GETs a URL and decodes JSON into out.
func (c *Client) getJSON(ctx context.Context, url string, out any) error {
	callCtx, cancel := context.WithTimeout(ctx, c.timeout())
	defer cancel()

	req, err := http.NewRequestWithContext(callCtx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient().Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("depositcheck: GET HTTP %d: %s", resp.StatusCode, truncate(respBody, 200))
	}
	if err := json.Unmarshal(respBody, out); err != nil {
		return fmt.Errorf("depositcheck: GET decode: %w (body=%s)", err, truncate(respBody, 200))
	}
	return nil
}

func truncate(b []byte, n int) string {
	if len(b) <= n {
		return string(b)
	}
	return string(b[:n]) + "…"
}
