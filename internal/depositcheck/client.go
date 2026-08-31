// Package depositcheck is the Go port of `checkNativeDeposit` and its
// per-chain implementations from `app/server/src/domain/mpc-wallet.ts`
// + `substrate-deposit.ts`.
//
// Given a (network, address, asset, requiredAmount) tuple, the Check
// method dispatches to the chain-appropriate RPC / REST balance probe
// and returns whether the balance at the address meets or exceeds the
// required amount.
//
// Trust model (IMPORTANT — load-bearing): the deposit watcher
// (cmd/bridge/deposit_watcher.go) uses Check to advance a swap from
// user_deposit_pending to bridge_transfer_pending, which drives a
// release-pool payout. So the single upstream RPC per network IS
// trusted at runtime — an RPC that lies about a balance triggers a
// payout for a deposit that never landed. This is identical across
// every chain family here (one hardcoded endpoint, no quorum, no
// confirmation count). Hardening to a multi-RPC quorum / on-chain
// proof is a platform-wide follow-up; until then, only point this at
// trusted endpoints (RPCURLOverrides) in production.
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
	"math"
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
	"ETHEREUM_MAINNET": "https://eth.llamarpc.com",
	"ETHEREUM_SEPOLIA": "https://rpc.sepolia.org",
	"BASE_MAINNET":     "https://mainnet.base.org",
	"BASE_SEPOLIA":     "https://sepolia.base.org",
	"LUX_MAINNET":      "https://api.lux.network/v1/chain/C/rpc",
	"LUX_TESTNET":      "https://api.lux-test.network/v1/chain/C/rpc",
	"ZOO_MAINNET":      "https://api.zoo.network/v1/chain/C/rpc",
	"HANZO_MAINNET":    "https://api.hanzo.network/v1/chain/C/rpc",
	"PARS_MAINNET":     "https://api.pars.network/v1/chain/C/rpc",
	"OSAGE_MAINNET":    "https://api.osage.network/v1/chain/C/rpc",
	"ZOO_TESTNET":      "https://api.zoo-test.network/v1/chain/C/rpc",
	"BSC_MAINNET":      "https://bsc-dataseed.binance.org",
	"BSC_TESTNET":      "https://data-seed-prebsc-1-s1.binance.org:8545",
	"POLYGON_MAINNET":  "https://polygon-rpc.com",
	"ARBITRUM_MAINNET": "https://arb1.arbitrum.io/rpc",
	"OPTIMISM_MAINNET": "https://mainnet.optimism.io",
	"AVAX_MAINNET":     "https://api.avax.network/ext/bc/C/rpc",
	"CELO_MAINNET":     "https://forno.celo.org",
	"GNOSIS_MAINNET":   "https://rpc.gnosischain.com",
	"FANTOM_MAINNET":   "https://rpc.ftm.tools",
	"AURORA_MAINNET":   "https://mainnet.aurora.dev",
	"ZORA_MAINNET":     "https://rpc.zora.energy",
	"BLAST_MAINNET":    "https://rpc.blast.io",
	"LINEA_MAINNET":    "https://rpc.linea.build",
	"HOLESKY_TESTNET":  "https://ethereum-holesky-rpc.publicnode.com",
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
	// Cardano (Koios REST — note: NOT JSON-RPC)
	"CARDANO_MAINNET": "https://api.koios.rest/api/v1",
	// XRP Ledger (rippled JSON-RPC). Same public clusters as the outbound
	// broadcaster (internal/broadcast/client.go) — s1.ripple.com is the
	// load-balanced mainnet cluster, s.altnet the Ripple-hosted testnet;
	// :51234 is rippled's JSON-RPC port. One canonical endpoint per env.
	"XRP_MAINNET": "https://s1.ripple.com:51234/",
	"XRP_TESTNET": "https://s.altnet.rippletest.net:51234/",
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
}

// Check dispatches to the right per-chain probe and returns whether
// the deposit address holds at least `RequiredAmount` of the given
// asset in human-readable units.
func (c *Client) Check(ctx context.Context, p CheckParams) (bool, error) {
	url := c.rpcURL(p.NetworkInternalName)
	if url == "" {
		return false, fmt.Errorf("%w: %s", ErrUnsupportedNetwork, p.NetworkInternalName)
	}

	// Same refusal as the broadcaster: watching an unknown network with the
	// EVM checker reads an 0x address on a chain that has none, and reports
	// "no deposit" forever rather than reporting that it cannot look.
	addrType, known := mchain.AddressTypeFor(p.NetworkInternalName)
	if !known {
		return false, fmt.Errorf("%w: %s", ErrUnsupportedNetwork, p.NetworkInternalName)
	}
	switch addrType {
	case mchain.AddressTypeETH:
		return c.checkEVM(ctx, url, p.NetworkInternalName, p.Address, p.Asset, p.RequiredAmount)
	case mchain.AddressTypeBTC:
		return c.checkBTC(ctx, url, p.Address, p.RequiredAmount)
	case mchain.AddressTypeSOL:
		// TON shares the SOL slot in mchain — but the deposit-check
		// protocols are completely different (RPC vs REST), so we
		// route by network → AddressType, not by SOL/TON family.
		return c.checkSOL(ctx, url, p.Address, p.Asset, p.RequiredAmount)
	case mchain.AddressTypeTON:
		return c.checkTON(ctx, url, p.Address, p.RequiredAmount)
	case mchain.AddressTypeXRP:
		return c.checkXRP(ctx, url, p.Address, p.RequiredAmount)
	case mchain.AddressTypeADA:
		return c.checkADA(ctx, url, p.Address, p.RequiredAmount)
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
//
//	eth_call({ to: contract, data: 0x70a08231 || <addr_padded_32B> }, "latest")
//
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

func (c *Client) checkSOL(ctx context.Context, rpcURL, address, _asset string, requiredAmount float64) (bool, error) {
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
	balSol := float64(resp.Result.Value) / 1e9
	return balSol >= requiredAmount, nil
}

// =============================================================================
// TON — TON Center REST `/getAddressBalance`
// =============================================================================

// checkADA reads an address's balance from Koios, a public read-only API over
// Cardano that needs no key.
//
// An address that has never been used is ABSENT from the response rather than
// present with a zero balance, so an empty array means "nothing here" and not
// an error.
func (c *Client) checkADA(ctx context.Context, apiBase, address string, requiredAmount float64) (bool, error) {
	body := `{"_addresses":["` + address + `"]}`
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		strings.TrimRight(apiBase, "/")+"/address_info", strings.NewReader(body))
	if err != nil {
		return false, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient().Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return false, fmt.Errorf("koios: status %d", resp.StatusCode)
	}

	var rows []struct {
		Balance string `json:"balance"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&rows); err != nil {
		return false, err
	}
	if len(rows) == 0 {
		return false, nil
	}

	// Lovelace is a decimal string because the value exceeds what a JSON
	// number carries exactly. Comparing as integers avoids the rounding a
	// float parse would introduce at the threshold.
	lovelace, ok := new(big.Int).SetString(rows[0].Balance, 10)
	if !ok {
		return false, fmt.Errorf("koios: balance %q is not an integer", rows[0].Balance)
	}
	required := big.NewInt(int64(math.Round(requiredAmount * 1e6)))
	return lovelace.Cmp(required) >= 0, nil
}

func (c *Client) checkTON(ctx context.Context, apiBase, address string, requiredAmount float64) (bool, error) {
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
	balTon := float64(balNano) / 1e9
	return balTon >= requiredAmount, nil
}

// =============================================================================
// XRP — rippled JSON-RPC `account_info` (balance in drops)
// =============================================================================

// xrpDropsDecimals is the drops-per-XRP scale exponent: 1 XRP = 10^6 drops.
// compareBalance(drops, xrpDropsDecimals, want) == (drops/1e6 >= want).
const xrpDropsDecimals = 6

// checkXRP reads the XRP balance of a deposit address from rippled's
// `account_info` against the last *validated* ledger (final, never
// in-flight). rippled returns the balance as a decimal *drops* string
// under result.account_data.Balance.
//
// rippled is JSON-RPC-ish: it ignores the {jsonrpc,id} envelope on the
// request and replies {result:{...}} with no envelope — so the shared
// jsonRPC POST helper works, and we decode rippled's result shape here
// (same division of labour the broadcaster uses for `submit`).
//
// An address that has never received the base reserve is not an account
// yet: rippled replies error="actNotFound". That is "no deposit yet"
// (a zero balance), NOT a failure — it maps to the (false, nil) "not
// enough funds" contract, exactly like a funded-but-too-small balance.
func (c *Client) checkXRP(ctx context.Context, rpcURL, address string, requiredAmount float64) (bool, error) {
	type xrpAccountInfoResp struct {
		Result struct {
			AccountData struct {
				Balance string `json:"Balance"`
			} `json:"account_data"`
			Status       string `json:"status"`
			Error        string `json:"error"`
			ErrorMessage string `json:"error_message"`
		} `json:"result"`
	}
	// strict:true forces `account` to be read as an address (never a
	// username); ledger_index:"validated" reads only finalized state.
	params := []any{map[string]any{
		"account":      address,
		"ledger_index": "validated",
		"strict":       true,
	}}
	var resp xrpAccountInfoResp
	if err := c.jsonRPC(ctx, rpcURL, "account_info", params, &resp); err != nil {
		return false, err
	}
	// Unfunded account ⇒ zero balance ⇒ "no deposit yet" (not an error).
	if resp.Result.Error == "actNotFound" {
		return compareBalance(new(big.Int), xrpDropsDecimals, requiredAmount), nil
	}
	if resp.Result.Error != "" {
		return false, fmt.Errorf("depositcheck: xrp account_info: %s (%s)",
			resp.Result.Error, resp.Result.ErrorMessage)
	}
	if resp.Result.AccountData.Balance == "" {
		return false, fmt.Errorf("depositcheck: xrp account_info: empty balance")
	}
	drops, ok := new(big.Int).SetString(resp.Result.AccountData.Balance, 10)
	if !ok {
		return false, fmt.Errorf("depositcheck: xrp balance not a decimal string: %q",
			resp.Result.AccountData.Balance)
	}
	return compareBalance(drops, xrpDropsDecimals, requiredAmount), nil
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
