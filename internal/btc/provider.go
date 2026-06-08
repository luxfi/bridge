// HTTP client for the mempool.space REST API. Used by the bridge to
// fetch UTXOs and broadcast signed transactions for BTC destinations.
//
// Endpoints used:
//   - GET /api/address/{addr}/utxo
//   - GET /api/v1/fees/recommended
//   - POST /api/tx                              (raw hex body)
//   - GET /api/tx/{txid}/status
//
// URL bases (set at construction):
//
//	mainnet: https://mempool.space/api
//	testnet3: https://mempool.space/testnet/api
//
// The HTTP transport is shared across networks; only the base URL is
// switched per request. Errors include the upstream status + body to
// make broadcast failures (insufficient fee, bad inputs) easy to
// triage from logs.
package btc

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Provider is a thin REST client around mempool.space. Construct with
// NewProvider; one instance can serve both mainnet and testnet, with
// the per-call network selecting which base URL is used. MainnetURL +
// TestnetURL are exported so the main entrypoint can echo them in
// startup logs without poking at unexported state.
type Provider struct {
	MainnetURL string
	TestnetURL string
	http       *http.Client
}

// NewProvider returns a Provider with the given base URLs and HTTP
// timeout. Empty URLs are allowed (the caller may want only one
// network configured) — requests against an unconfigured network
// return ErrNetworkNotConfigured loudly.
func NewProvider(mainnetURL, testnetURL string, timeout time.Duration) *Provider {
	if timeout == 0 {
		timeout = 15 * time.Second
	}
	return &Provider{
		MainnetURL: strings.TrimSuffix(mainnetURL, "/"),
		TestnetURL: strings.TrimSuffix(testnetURL, "/"),
		http:       &http.Client{Timeout: timeout},
	}
}

// ErrNetworkNotConfigured is returned when a request targets a network
// whose base URL was left empty in NewProvider.
var ErrNetworkNotConfigured = errors.New("btc: network base URL not configured")

func (p *Provider) baseURL(network string) (string, error) {
	switch strings.ToUpper(network) {
	case "BITCOIN_MAINNET":
		if p.MainnetURL == "" {
			return "", ErrNetworkNotConfigured
		}
		return p.MainnetURL, nil
	case "BITCOIN_TESTNET", "BITCOIN_TESTNET3":
		if p.TestnetURL == "" {
			return "", ErrNetworkNotConfigured
		}
		return p.TestnetURL, nil
	default:
		return "", fmt.Errorf("btc: unknown network %q (want BITCOIN_MAINNET / BITCOIN_TESTNET)", network)
	}
}

// UTXO is one unspent output as returned by mempool.space. Value is
// satoshis; Status.Confirmed is the on-chain confirmation flag.
type UTXO struct {
	TxID   string `json:"txid"`
	Vout   uint32 `json:"vout"`
	Value  uint64 `json:"value"`
	Status struct {
		Confirmed   bool   `json:"confirmed"`
		BlockHeight uint64 `json:"block_height"`
	} `json:"status"`
}

// ListUTXOs returns the address's unspent outputs, sorted by value
// descending (so the caller can pick the largest with utxos[0]).
// Only CONFIRMED UTXOs are returned — mempool entries are filtered
// out to avoid spending a deposit the operator hasn't confirmed yet.
func (p *Provider) ListUTXOs(ctx context.Context, network, address string) ([]UTXO, error) {
	base, err := p.baseURL(network)
	if err != nil {
		return nil, err
	}
	url := fmt.Sprintf("%s/address/%s/utxo", base, address)
	body, err := p.doGET(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("ListUTXOs(%s): %w", address, err)
	}
	var all []UTXO
	if err := json.Unmarshal(body, &all); err != nil {
		return nil, fmt.Errorf("ListUTXOs decode: %w", err)
	}
	out := make([]UTXO, 0, len(all))
	for _, u := range all {
		if u.Status.Confirmed {
			out = append(out, u)
		}
	}
	sortUTXOsDescending(out)
	return out, nil
}

// FeeRates exposes the four recommended sat/vB values mempool.space
// publishes. The bridge picks one based on its target completion time.
type FeeRates struct {
	Fastest  uint64 `json:"fastestFee"`
	HalfHour uint64 `json:"halfHourFee"`
	Hour     uint64 `json:"hourFee"`
	Economy  uint64 `json:"economyFee"`
	Minimum  uint64 `json:"minimumFee"`
}

// RecommendedFees pulls /api/v1/fees/recommended for the chosen
// network. Returns sat/vB values; callers multiply by the estimated
// vsize to size the on-chain fee.
func (p *Provider) RecommendedFees(ctx context.Context, network string) (*FeeRates, error) {
	base, err := p.baseURL(network)
	if err != nil {
		return nil, err
	}
	url := fmt.Sprintf("%s/v1/fees/recommended", base)
	body, err := p.doGET(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("RecommendedFees: %w", err)
	}
	var f FeeRates
	if err := json.Unmarshal(body, &f); err != nil {
		return nil, fmt.Errorf("RecommendedFees decode: %w", err)
	}
	if f.HalfHour == 0 {
		// testnet sometimes returns zeros — fall back to a sane default
		// so the fee math doesn't divide by nothing.
		f.HalfHour = 1
	}
	return &f, nil
}

// Broadcast submits a raw hex transaction and returns the resulting
// txid as reported by the upstream node. Returns the raw upstream
// body in the error so broadcast failures ("min relay fee not met",
// "missing inputs", etc.) reach the logs verbatim.
func (p *Provider) Broadcast(ctx context.Context, network, rawHex string) (string, error) {
	base, err := p.baseURL(network)
	if err != nil {
		return "", err
	}
	url := fmt.Sprintf("%s/tx", base)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, strings.NewReader(rawHex))
	if err != nil {
		return "", fmt.Errorf("Broadcast new request: %w", err)
	}
	req.Header.Set("Content-Type", "text/plain")
	resp, err := p.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("Broadcast POST: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode/100 != 2 {
		return "", fmt.Errorf("Broadcast HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	txid := strings.TrimSpace(string(body))
	// mempool.space returns just the txid on success; sanity-check the
	// length so a stray HTML 200 doesn't poison the swap row.
	if len(txid) != 64 {
		return "", fmt.Errorf("Broadcast: unexpected response body %q", txid)
	}
	return txid, nil
}

// TxStatus exposes whether a tx is confirmed and at what block height.
// Used by the smoke test driver to wait for confirmation; production
// observability uses depositcheck for the source side.
type TxStatus struct {
	Confirmed   bool   `json:"confirmed"`
	BlockHeight uint64 `json:"block_height"`
}

// GetTxStatus polls /api/tx/{txid}/status.
func (p *Provider) GetTxStatus(ctx context.Context, network, txid string) (*TxStatus, error) {
	base, err := p.baseURL(network)
	if err != nil {
		return nil, err
	}
	url := fmt.Sprintf("%s/tx/%s/status", base, txid)
	body, err := p.doGET(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("GetTxStatus(%s): %w", txid, err)
	}
	var s TxStatus
	if err := json.Unmarshal(body, &s); err != nil {
		return nil, fmt.Errorf("GetTxStatus decode: %w", err)
	}
	return &s, nil
}

func (p *Provider) doGET(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := p.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode/100 != 2 {
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	return body, nil
}

func sortUTXOsDescending(u []UTXO) {
	for i := 1; i < len(u); i++ {
		j := i
		for j > 0 && u[j-1].Value < u[j].Value {
			u[j-1], u[j] = u[j], u[j-1]
			j--
		}
	}
}
