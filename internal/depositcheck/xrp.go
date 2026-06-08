// XRP deposit check — queries the XRPL JSON-RPC `account_info` method
// for an r-address's drops balance and compares against the required
// amount in XRP. Wires through the same `Client.Check` dispatcher as
// the other families so cmd/bridge stays family-agnostic.
//
// Why not reuse internal/xrp.Provider? The depositcheck package is
// the dependency boundary for the bridge's "what's in the deposit
// wallet" probe. Pulling in internal/xrp would couple it to the
// signing-side codec, which depositcheck doesn't need. A 30-line
// inline JSON-RPC call keeps the dependency graph one-directional.
//
// XRPL `account_info` returns "actNotFound" when the account hasn't
// been funded yet (no balance has ever hit it). The watcher treats
// that as zero balance — a freshly-minted bridge deposit wallet
// always returns actNotFound until the user funds it.

package depositcheck

import (
	"context"
	"fmt"
	"strconv"

	"github.com/luxfi/bridge/internal/mchain"
)

// xrpDropsPerXRP is the canonical XRP→drops scale. 1 XRP = 10^6 drops.
const xrpDropsPerXRP float64 = 1_000_000

// checkXRP POSTs `account_info` for `address` to the configured
// XRPL JSON-RPC endpoint and returns whether the drops balance
// meets requiredAmountXRP.
//
// Parameters:
//   - rpcURL — the JSON-RPC URL (resolved by the dispatcher from
//     rpcURLs / RPCURLOverrides). Mainnet vs testnet selection
//     happens at the URL level, not in the protocol — XRPL
//     r-addresses are network-agnostic.
//   - network — internal name (XRP_MAINNET / XRP_TESTNET). Kept for
//     diagnostics in the surfaced error, not used to route.
//   - address — the r-address to query.
//   - requiredAmountXRP — the user's required deposit in human XRP.
//   - baselineDrops — drops balance at swap-create time. When > 0,
//     the check uses (current − baseline) ≥ required so a deposit
//     wallet that shares the address pool with a long-lived release
//     wallet doesn't false-positive on the pre-existing balance.
//     Zero ⇒ legacy (current ≥ required) — preserves behaviour for
//     callers that haven't migrated to the snapshot.
func (c *Client) checkXRP(ctx context.Context, rpcURL, network, address string, requiredAmountXRP float64, baselineDrops uint64) (bool, error) {
	if mchain.AddressTypeFor(network) != mchain.AddressTypeXRP {
		// Defensive: dispatcher should have routed correctly already.
		return false, fmt.Errorf("depositcheck: checkXRP called for non-XRP network %s", network)
	}

	type accountData struct {
		Balance string `json:"Balance"`
	}
	type xrpResult struct {
		AccountData  accountData `json:"account_data"`
		Status       string      `json:"status"`
		Error        string      `json:"error"`
		ErrorMessage string      `json:"error_message"`
	}
	type envelope struct {
		Result xrpResult `json:"result"`
	}

	var resp envelope
	if err := c.jsonRPC(ctx, rpcURL, "account_info", []any{
		map[string]any{
			"account":      address,
			"ledger_index": "validated",
		},
	}, &resp); err != nil {
		return false, fmt.Errorf("depositcheck: xrp %s account_info: %w", network, err)
	}

	if resp.Result.Status == "error" || resp.Result.Error != "" {
		// actNotFound = the account has never been funded; treat as
		// zero balance. Any other error is real.
		if resp.Result.Error == "actNotFound" {
			return 0 >= requiredAmountXRP, nil
		}
		return false, fmt.Errorf("depositcheck: xrp %s account_info: %s: %s",
			network, resp.Result.Error, resp.Result.ErrorMessage)
	}

	drops, err := strconv.ParseUint(resp.Result.AccountData.Balance, 10, 64)
	if err != nil {
		return false, fmt.Errorf("depositcheck: xrp %s parse balance %q: %w",
			network, resp.Result.AccountData.Balance, err)
	}
	// Apply the per-swap baseline when supplied. A baseline > current
	// balance means the wallet was DEBITED since the snapshot (refund,
	// XRPL reserve adjustment, etc.) — treat that as zero so the
	// caller never sees a spurious "confirmed" from arithmetic
	// underflow. Plain current ≥ required preserved when no baseline
	// is set, matching the v1 behaviour exactly.
	if baselineDrops > 0 {
		var deltaDrops uint64
		if drops > baselineDrops {
			deltaDrops = drops - baselineDrops
		}
		deltaXRP := float64(deltaDrops) / xrpDropsPerXRP
		return deltaXRP >= requiredAmountXRP, nil
	}
	balanceXRP := float64(drops) / xrpDropsPerXRP
	return balanceXRP >= requiredAmountXRP, nil
}

// FetchXRPDrops returns the current drops balance for an XRPL account.
// Used by the swap-create handler to snapshot a per-swap baseline for
// XRP source swaps (see CheckParams.XRPBaselineDrops). The RPC URL is
// resolved via the same overrides → public-table fallback the rest of
// the package uses.
//
// actNotFound (a never-funded account) returns 0 cleanly. Real upstream
// failures return an error so the caller can fall back to a 0 baseline
// (legacy behaviour) without silently corrupting the snapshot.
func (c *Client) FetchXRPDrops(ctx context.Context, network, address string) (uint64, error) {
	if mchain.AddressTypeFor(network) != mchain.AddressTypeXRP {
		return 0, fmt.Errorf("depositcheck: FetchXRPDrops called for non-XRP network %s", network)
	}
	rpcURL := c.rpcURL(network)
	if rpcURL == "" {
		return 0, fmt.Errorf("%w: %s", ErrUnsupportedNetwork, network)
	}
	type accountData struct {
		Balance string `json:"Balance"`
	}
	type xrpResult struct {
		AccountData accountData `json:"account_data"`
		Status      string      `json:"status"`
		Error       string      `json:"error"`
	}
	type envelope struct {
		Result xrpResult `json:"result"`
	}
	var resp envelope
	if err := c.jsonRPC(ctx, rpcURL, "account_info", []any{
		map[string]any{
			"account":      address,
			"ledger_index": "validated",
		},
	}, &resp); err != nil {
		return 0, fmt.Errorf("depositcheck: xrp %s FetchXRPDrops: %w", network, err)
	}
	if resp.Result.Error == "actNotFound" {
		return 0, nil
	}
	if resp.Result.Status == "error" || resp.Result.Error != "" {
		return 0, fmt.Errorf("depositcheck: xrp %s FetchXRPDrops: %s", network, resp.Result.Error)
	}
	drops, err := strconv.ParseUint(resp.Result.AccountData.Balance, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("depositcheck: xrp %s parse balance %q: %w",
			network, resp.Result.AccountData.Balance, err)
	}
	return drops, nil
}
