package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/luxfi/bridge/internal/broadcast"
	"github.com/luxfi/bridge/internal/depositcheck"
	"github.com/luxfi/bridge/internal/txassembler"
	"github.com/luxfi/bridge/internal/xrpl"
)

// xrp_provider.go: rippled-side surface the txassembler.PreSignXRP
// path consumes. Implements txassembler.XRPProvider by HTTP POSTing
// rippled JSON-RPC calls.
//
// Wire methods used:
//   • account_info: returns the account's current Sequence + validated
//     ledger index. Used as the basis for Payment.Sequence and
//     LastLedgerSequence.
//   • fee: returns the network's median + open-ledger fee in drops.
//     Pulled here instead of hardcoding 10 drops because rippled bumps
//     the fee proportionally to load (busy ledgers can reach 50+ drops).
//   • account_info (again): the AccountRoot's Balance field is the
//     wallet's XRP balance in drops, used for the gas pre-check.
//
// URL resolution mirrors balance_probe.go and broadcast/client.go:
// overrides → broadcast.RPCURLFor → depositcheck.RPCURLFor.

// XRPProviderClient is the production XRPProvider. Thin HTTP wrapper
// over rippled JSON-RPC.
type XRPProviderClient struct {
	// Overrides shadow the rpcURLs table from broadcast/depositcheck.
	Overrides map[string]string

	// Timeout caps each rippled call. Zero ⇒ 8 s (matches the
	// txassembler RPCProvider default).
	Timeout time.Duration

	// HTTPClient is the underlying http.Client. Zero ⇒ a fresh one
	// built with Timeout.
	HTTPClient *http.Client

	// callSeq is unused (rippled is not JSON-RPC 2.0) but kept for
	// future use if rippled grows id-correlated batch calls.
	callSeq atomic.Uint64
}

// NewXRPProvider builds a rippled-backed XRPProvider.
func NewXRPProvider(overrides map[string]string, timeout time.Duration) *XRPProviderClient {
	if timeout <= 0 {
		timeout = 8 * time.Second
	}
	return &XRPProviderClient{
		Overrides:  overrides,
		Timeout:    timeout,
		HTTPClient: &http.Client{Timeout: timeout},
	}
}

func (c *XRPProviderClient) url(network string) string {
	if u, ok := c.Overrides[network]; ok && u != "" {
		return u
	}
	if u := broadcast.RPCURLFor(network); u != "" {
		return u
	}
	return depositcheck.RPCURLFor(network)
}

// accountInfoResp is the relevant subset of rippled's account_info reply.
type accountInfoResp struct {
	Result struct {
		AccountData struct {
			Account  string `json:"Account"`
			Balance  string `json:"Balance"`
			Sequence uint32 `json:"Sequence"`
		} `json:"account_data"`
		LedgerIndex          uint32 `json:"ledger_index"`
		ValidatedLedgerIndex uint32 `json:"validated_ledger_index"`
		Status               string `json:"status"`
		Error                string `json:"error,omitempty"`
		ErrorMessage         string `json:"error_message,omitempty"`
	} `json:"result"`
}

// feeResp is the relevant subset of rippled's fee reply.
type feeResp struct {
	Result struct {
		Drops struct {
			OpenLedgerFee string `json:"open_ledger_fee"`
			MedianFee     string `json:"median_fee"`
			MinimumFee    string `json:"minimum_fee"`
			BaseFee       string `json:"base_fee"`
		} `json:"drops"`
		Status       string `json:"status"`
		Error        string `json:"error,omitempty"`
		ErrorMessage string `json:"error_message,omitempty"`
	} `json:"result"`
}

// AccountInfo implements XRPProvider. Returns (sequence, validated
// ledger index) on success.
func (c *XRPProviderClient) AccountInfo(ctx context.Context, network, address string) (uint32, uint32, error) {
	url := c.url(network)
	if url == "" {
		return 0, 0, fmt.Errorf("xrp_provider: no RPC URL for %s", network)
	}
	body, _ := json.Marshal(map[string]any{
		"method": "account_info",
		"params": []map[string]any{
			{
				"account":      address,
				"ledger_index": "validated",
				"strict":       true,
			},
		},
	})
	var resp accountInfoResp
	if err := c.do(ctx, url, body, &resp); err != nil {
		return 0, 0, err
	}
	if resp.Result.Error != "" || resp.Result.ErrorMessage != "" {
		return 0, 0, fmt.Errorf("xrp_provider: rippled %s: %s",
			resp.Result.Error, resp.Result.ErrorMessage)
	}
	if resp.Result.AccountData.Sequence == 0 {
		return 0, 0, fmt.Errorf("xrp_provider: account_info returned zero Sequence for %s on %s", address, network)
	}
	vl := resp.Result.ValidatedLedgerIndex
	if vl == 0 {
		vl = resp.Result.LedgerIndex
	}
	return resp.Result.AccountData.Sequence, vl, nil
}

// SuggestFeeDrops implements XRPProvider. Returns the open-ledger
// fee (which is the conservative recommendation), falling back to
// median + base + 10 drops.
func (c *XRPProviderClient) SuggestFeeDrops(ctx context.Context, network string) (int64, error) {
	url := c.url(network)
	if url == "" {
		return 0, fmt.Errorf("xrp_provider: no RPC URL for %s", network)
	}
	body, _ := json.Marshal(map[string]any{
		"method": "fee",
		"params": []map[string]any{{}},
	})
	var resp feeResp
	if err := c.do(ctx, url, body, &resp); err != nil {
		return 0, err
	}
	if resp.Result.Error != "" {
		return 0, fmt.Errorf("xrp_provider: rippled fee %s: %s",
			resp.Result.Error, resp.Result.ErrorMessage)
	}
	candidates := []string{
		resp.Result.Drops.OpenLedgerFee,
		resp.Result.Drops.MedianFee,
		resp.Result.Drops.MinimumFee,
		resp.Result.Drops.BaseFee,
	}
	for _, c := range candidates {
		if c == "" {
			continue
		}
		v, err := strconv.ParseInt(c, 10, 64)
		if err != nil {
			continue
		}
		if v > 0 {
			return v, nil
		}
	}
	return xrpl.XRPLBaseFeeDrops, nil
}

// AccountBalanceDrops implements XRPProvider. Returns the AccountRoot
// Balance field in drops.
func (c *XRPProviderClient) AccountBalanceDrops(ctx context.Context, network, address string) (int64, error) {
	url := c.url(network)
	if url == "" {
		return 0, fmt.Errorf("xrp_provider: no RPC URL for %s", network)
	}
	body, _ := json.Marshal(map[string]any{
		"method": "account_info",
		"params": []map[string]any{
			{
				"account":      address,
				"ledger_index": "validated",
				"strict":       true,
			},
		},
	})
	var resp accountInfoResp
	if err := c.do(ctx, url, body, &resp); err != nil {
		return 0, err
	}
	if resp.Result.Error != "" {
		// "actNotFound" means the wallet hasn't been activated (no
		// AccountRoot exists yet — balance is zero in practical terms).
		// Surface as 0 so the gas pre-check correctly short-circuits
		// with "wallet not activated" semantics.
		if strings.EqualFold(resp.Result.Error, "actNotFound") {
			return 0, nil
		}
		return 0, fmt.Errorf("xrp_provider: rippled %s: %s",
			resp.Result.Error, resp.Result.ErrorMessage)
	}
	bal := resp.Result.AccountData.Balance
	if bal == "" {
		return 0, nil
	}
	v, err := strconv.ParseInt(bal, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("xrp_provider: parse Balance %q: %w", bal, err)
	}
	return v, nil
}

// do POSTs body to url and decodes JSON into out. Returns errors
// matching the broadcast package's style so logs read consistently.
func (c *XRPProviderClient) do(ctx context.Context, url string, body []byte, out any) error {
	callCtx, cancel := context.WithTimeout(ctx, c.Timeout)
	defer cancel()
	req, err := http.NewRequestWithContext(callCtx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	client := c.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: c.Timeout}
	}
	resp, err := client.Do(req)
	if err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return err
		}
		return fmt.Errorf("xrp_provider: transport: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("xrp_provider: HTTP %d: %s", resp.StatusCode, truncXRP(respBody, 200))
	}
	if err := json.Unmarshal(respBody, out); err != nil {
		return fmt.Errorf("xrp_provider: decode: %w (body=%s)", err, truncXRP(respBody, 200))
	}
	return nil
}

func truncXRP(b []byte, n int) string {
	if len(b) <= n {
		return string(b)
	}
	return string(b[:n]) + "…"
}

// Compile-time check: *XRPProviderClient satisfies txassembler.XRPProvider.
var _ txassembler.XRPProvider = (*XRPProviderClient)(nil)
