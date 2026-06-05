package xrp

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
	"time"
)

// Default upstream endpoints used when the bridge isn't given explicit
// override URLs. xrplcluster.com is the community-run public cluster
// for mainnet; the altnet endpoint is the canonical XRP testnet faucet
// network. Both speak JSON-RPC over HTTPS.
const (
	DefaultMainnetURL = "https://xrplcluster.com"
	DefaultTestnetURL = "https://s.altnet.rippletest.net:51234"
	DefaultTimeout    = 8 * time.Second
)

// Provider talks to an XRPL JSON-RPC endpoint. One Provider can serve
// both mainnet and testnet — the bridge dispatches by network name
// at call sites (mirrors internal/ton.TonCenterProvider).
type Provider struct {
	MainnetURL string
	TestnetURL string
	Timeout    time.Duration
	http       *http.Client
}

func NewProvider(mainnetURL, testnetURL string, timeout time.Duration) *Provider {
	if mainnetURL == "" {
		mainnetURL = DefaultMainnetURL
	}
	if testnetURL == "" {
		testnetURL = DefaultTestnetURL
	}
	if timeout <= 0 {
		timeout = DefaultTimeout
	}
	return &Provider{
		MainnetURL: mainnetURL,
		TestnetURL: testnetURL,
		Timeout:    timeout,
		http:       &http.Client{Timeout: timeout},
	}
}

// urlFor returns the JSON-RPC URL for the given internal network name.
// "XRP_TESTNET" routes to TestnetURL; everything else routes to
// MainnetURL. Network selection is by name, not by address — XRP
// r-addresses are network-agnostic.
func (p *Provider) urlFor(networkInternalName string) string {
	if strings.EqualFold(networkInternalName, "XRP_TESTNET") {
		return p.TestnetURL
	}
	return p.MainnetURL
}

// SetHTTPClient overrides the underlying http.Client. Used by the
// broadcast.Client which wants its own timeout / instrumented client
// shared across families.
func (p *Provider) SetHTTPClient(h *http.Client) {
	if h != nil {
		p.http = h
	}
}

type rpcRequest struct {
	Method string `json:"method"`
	Params []any  `json:"params"`
}

type rpcResponse struct {
	Result json.RawMessage `json:"result"`
}

// AccountInfoResult — the subset of XRPL's account_info response we
// actually consume. account_data holds the live sequence + balance
// (drops as string); status carries "success" or "error" with detail.
type AccountInfoResult struct {
	AccountData struct {
		Account  string `json:"Account"`
		Balance  string `json:"Balance"`  // drops as decimal string
		Sequence uint32 `json:"Sequence"` // current account sequence
	} `json:"account_data"`
	Status            string `json:"status"`
	Error             string `json:"error"`
	ErrorMessage      string `json:"error_message"`
	LedgerCurrentIdx  uint32 `json:"ledger_current_index"`
	LedgerIndex       uint32 `json:"ledger_index"`
	Validated         bool   `json:"validated"`
}

// AccountInfo fetches the current sequence + balance for the given
// r-address on the network identified by networkInternalName.
//
// Returns (info, ok, err) where:
//
//	ok == false means the account doesn't exist yet (XRPL error
//	  "actNotFound") — used by the deposit watcher to treat the
//	  zero-balance pre-funding case as "no balance" without
//	  surfacing a transport error.
//	err != nil means a real failure (HTTP, JSON, unexpected XRPL error).
func (p *Provider) AccountInfo(ctx context.Context, networkInternalName, address string) (*AccountInfoResult, bool, error) {
	req := rpcRequest{
		Method: "account_info",
		Params: []any{
			map[string]any{
				"account":      address,
				"ledger_index": "validated",
			},
		},
	}
	var out AccountInfoResult
	if err := p.do(ctx, networkInternalName, req, &out); err != nil {
		return nil, false, err
	}
	if out.Status == "error" || out.Error != "" {
		if out.Error == "actNotFound" {
			return &out, false, nil
		}
		return nil, false, fmt.Errorf("xrpl account_info: %s: %s", out.Error, out.ErrorMessage)
	}
	return &out, true, nil
}

// BalanceDrops is a convenience wrapper around AccountInfo that returns
// just the balance in drops (1 XRP = 1_000_000 drops). Unfunded
// accounts return 0 instead of an error.
func (p *Provider) BalanceDrops(ctx context.Context, networkInternalName, address string) (uint64, error) {
	info, ok, err := p.AccountInfo(ctx, networkInternalName, address)
	if err != nil {
		return 0, err
	}
	if !ok {
		return 0, nil
	}
	n, err := strconv.ParseUint(info.AccountData.Balance, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("xrpl parse balance %q: %w", info.AccountData.Balance, err)
	}
	return n, nil
}

// SubmitResult — XRPL submit response. engine_result codes starting
// with "tes" indicate success; other prefixes are temporary, claim-
// failures, or permanent failures (see XRPL transaction results).
type SubmitResult struct {
	EngineResult        string `json:"engine_result"`
	EngineResultCode    int    `json:"engine_result_code"`
	EngineResultMessage string `json:"engine_result_message"`
	TxJSON              struct {
		Hash string `json:"hash"`
	} `json:"tx_json"`
	Status       string `json:"status"`
	Error        string `json:"error"`
	ErrorMessage string `json:"error_message"`
	Accepted     bool   `json:"accepted"`
	Applied      bool   `json:"applied"`
}

// SubmitBlob POSTs a signed tx blob (uppercase hex) to XRPL submit and
// returns (txHash, result, err). Caller decides what to do with
// engine_result codes — typically the broadcast driver treats anything
// outside "tesSUCCESS" as failure and routes via the stale/retry path.
func (p *Provider) SubmitBlob(ctx context.Context, networkInternalName, txBlobHex string) (*SubmitResult, error) {
	req := rpcRequest{
		Method: "submit",
		Params: []any{
			map[string]any{"tx_blob": txBlobHex},
		},
	}
	var out SubmitResult
	if err := p.do(ctx, networkInternalName, req, &out); err != nil {
		return nil, err
	}
	if out.Status == "error" || out.Error != "" {
		return nil, fmt.Errorf("xrpl submit: %s: %s", out.Error, out.ErrorMessage)
	}
	return &out, nil
}

// ServerInfoFee returns the network's open_ledger_fee (drops) — the
// recommended minimum fee for the next-included transaction. Falls
// back to 12 drops (the long-standing default) if the field is
// missing or unparseable.
func (p *Provider) ServerInfoFee(ctx context.Context, networkInternalName string) (uint64, error) {
	req := rpcRequest{Method: "server_info", Params: []any{}}
	var out struct {
		Info struct {
			ValidatedLedger struct {
				BaseFeeXRP string `json:"base_fee_xrp"`
			} `json:"validated_ledger"`
			LoadFactor    float64 `json:"load_factor"`
			LoadBase      float64 `json:"load_base"`
		} `json:"info"`
		Status string `json:"status"`
		Error  string `json:"error"`
	}
	if err := p.do(ctx, networkInternalName, req, &out); err != nil {
		return 12, nil
	}
	if out.Status == "error" || out.Error != "" {
		return 12, nil
	}
	// base_fee_xrp comes back as a decimal string like "0.000010"
	// (i.e. 10 drops); multiply by 1e6 to get drops. If load_factor
	// > 1 the network is under load — scale the fee linearly.
	xrpFee, perr := strconv.ParseFloat(out.Info.ValidatedLedger.BaseFeeXRP, 64)
	if perr != nil || xrpFee <= 0 {
		return 12, nil
	}
	loadMult := out.Info.LoadFactor / out.Info.LoadBase
	if loadMult <= 0 || loadMult < 1 {
		loadMult = 1
	}
	drops := uint64(xrpFee * 1_000_000 * loadMult)
	if drops < 10 {
		drops = 10
	}
	return drops, nil
}

func (p *Provider) do(ctx context.Context, network string, payload rpcRequest, dst any) error {
	url := p.urlFor(network)
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("xrpl marshal: %w", err)
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("xrpl req: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "application/json")
	resp, err := p.http.Do(httpReq)
	if err != nil {
		return fmt.Errorf("xrpl http: %w", err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("xrpl read: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("xrpl HTTP %d: %s", resp.StatusCode, truncate(string(raw), 200))
	}
	var env rpcResponse
	if err := json.Unmarshal(raw, &env); err != nil {
		return fmt.Errorf("xrpl decode env: %w", err)
	}
	if len(env.Result) == 0 {
		return errors.New("xrpl: empty result")
	}
	return json.Unmarshal(env.Result, dst)
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
