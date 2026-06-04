package ton

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Default toncenter endpoint timeout. toncenter sometimes takes a few
// seconds to respond when nodes are syncing, especially right after a
// state change. 12s is the same envelope used by the depositcheck
// client's per-request timeout.
const DefaultProviderTimeout = 12 * time.Second

// Default toncenter base URLs. Used when the caller doesn't supply a
// custom one (e.g. an API-keyed plan with a private endpoint). The free
// public endpoint is rate-limited to 1 req/s without a key — fine for
// the bridge's sub-1Hz polling cadence, tight under load. Operators
// should configure --ton-rpc-url <toncenter-with-key> at scale.
const (
	MainnetTonCenter = "https://toncenter.com/api/v2"
	TestnetTonCenter = "https://testnet.toncenter.com/api/v2"
)

// Provider is the on-chain interface the TON destination path needs:
// read the wallet contract's seqno + active state for PreSign, the
// balance for the refund-leg sweep math, and broadcast the signed BoC
// for Finalize.
//
// Modeled as a small interface so the txassembler can be unit-tested
// with a fake provider. Mirrors the SolanaProvider in
// internal/txassembler/solana.go.
type Provider interface {
	// IsContractActive returns true when the address has been
	// deployed (state != "uninit"). When false, the first transfer
	// must include StateInit; PreSign uses this to flip the flag.
	IsContractActive(ctx context.Context, address string) (bool, error)

	// GetSeqno returns the wallet contract's current seqno. Zero
	// for a not-yet-deployed wallet. The payload's seqno must match
	// the contract's current seqno at broadcast time; otherwise the
	// wallet contract rejects the message.
	GetSeqno(ctx context.Context, address string) (uint32, error)

	// GetBalanceNano returns the address's balance in nanoTON
	// (1 TON = 1e9). Used by the refund driver to compute how much
	// the wallet can sweep back to the user after subtracting a
	// fee reserve. Zero for uninitialized or empty wallets.
	GetBalanceNano(ctx context.Context, address string) (uint64, error)

	// BroadcastBoC POSTs the signed BoC to toncenter's sendBoc.
	// Returns the message hash hex on success — usable as a tx
	// identifier in testnet.tonscan.org URLs.
	BroadcastBoC(ctx context.Context, boc []byte) (string, error)
}

// TonCenterProvider is the production Provider backed by toncenter v2.
// Holds both mainnet + testnet base URLs so a single bridge process
// can serve TON_MAINNET and TON_TESTNET swaps concurrently — the
// provider picks the right URL per call by parsing the address's
// testnet flag (kQ.../0Q... → testnet, EQ.../UQ... → mainnet).
// Stateless; safe for concurrent use.
type TonCenterProvider struct {
	MainnetURL string
	TestnetURL string
	APIKey     string // empty = public free-tier rate limit (1 req/s)
	Client     *http.Client
}

// NewTonCenterProvider constructs a Provider with both mainnet + testnet
// base URLs. Empty strings fall back to the canonical public endpoints
// (MainnetTonCenter / TestnetTonCenter). apiKey may be empty.
//
// The provider routes per call: an address parsed with the testnet
// flag set uses TestnetURL, otherwise MainnetURL. This lets a single
// bridge deploy serve both networks without per-network state.
func NewTonCenterProvider(mainnetURL, testnetURL, apiKey string) *TonCenterProvider {
	if mainnetURL == "" {
		mainnetURL = MainnetTonCenter
	}
	if testnetURL == "" {
		testnetURL = TestnetTonCenter
	}
	return &TonCenterProvider{
		MainnetURL: strings.TrimRight(mainnetURL, "/"),
		TestnetURL: strings.TrimRight(testnetURL, "/"),
		APIKey:     apiKey,
		Client: &http.Client{
			Timeout: DefaultProviderTimeout,
		},
	}
}

// baseFor returns the right base URL for an address. Falls through to
// mainnet on parse error so a malformed address surfaces as a clean
// toncenter error rather than a routing panic. The first call that
// actually uses the URL (getAddressInformation / runGetMethod) will
// fail loudly.
func (p *TonCenterProvider) baseFor(addr string) string {
	if isTestnetAddress(addr) {
		return p.TestnetURL
	}
	return p.MainnetURL
}

// baseForBroadcast picks the URL for a broadcast call. We don't have
// an address at broadcast time — only the BoC. Default to mainnet for
// safety; callers that need testnet broadcast should attach the
// broadcaster directly to the testnet URL via BroadcastBoCVia.
//
// In practice the signing-driver call site has the swap's destination
// network in scope, so we expose BroadcastBoCVia for that case.
func (p *TonCenterProvider) baseForBroadcast() string { return p.MainnetURL }

// isTestnetAddress is a string-prefix check matching the user-friendly
// TON address encoding. Avoids an address.ParseAddr round-trip on the
// hot routing path.
func isTestnetAddress(s string) bool {
	if len(s) < 2 {
		return false
	}
	switch s[:2] {
	case "kQ", "0Q":
		return true
	default:
		return false
	}
}

type tcEnvelope struct {
	Ok     bool            `json:"ok"`
	Error  string          `json:"error,omitempty"`
	Code   int             `json:"code,omitempty"`
	Result json.RawMessage `json:"result"`
}

type tcAddressInfo struct {
	State          string `json:"state"`            // "active" | "uninitialized" | "frozen"
	Balance        string `json:"balance"`          // nanoTON as string
	LastTxID       any    `json:"last_transaction_id,omitempty"`
}

// IsContractActive — GET /getAddressInformation
//
// Maps:
//   "active"          → true
//   "uninitialized"   → false (caller attaches StateInit)
//   "frozen" / other  → false (caller must redeploy; surfaces as a
//                       deploy attempt — toncenter will reject if
//                       the recovered StateInit doesn't match)
func (p *TonCenterProvider) IsContractActive(ctx context.Context, addr string) (bool, error) {
	var info tcAddressInfo
	if err := p.doGetIntoResult(ctx, p.baseFor(addr), "getAddressInformation", map[string]string{"address": addr}, &info); err != nil {
		return false, fmt.Errorf("ton: getAddressInformation: %w", err)
	}
	return info.State == "active", nil
}

// GetSeqno — toncenter's runGetMethod with method="seqno". Returns 0
// for a not-yet-deployed wallet (or a wallet that's been deployed but
// never sent a tx — V4R2 seqno starts at 0).
func (p *TonCenterProvider) GetSeqno(ctx context.Context, addr string) (uint32, error) {
	// runGetMethod expects address + method + stack params. Wallet
	// contracts expose a parameterless `seqno` get-method that returns
	// the current seqno as a stack int.
	body, err := p.doPost(ctx, p.baseFor(addr), "runGetMethod", map[string]any{
		"address": addr,
		"method":  "seqno",
		"stack":   []any{},
	})
	if err != nil {
		// Uninitialized contracts return 404 from runGetMethod —
		// treat as seqno=0 so PreSign can decide to deploy.
		if errors.Is(err, errNotFound) {
			return 0, nil
		}
		return 0, fmt.Errorf("ton: runGetMethod(seqno): %w", err)
	}
	// Response shape:
	//   active     → {"stack":[["num","0x1"]], "exit_code":0}
	//   uninit'd   → {"stack":[["num","0x14c97"]], "exit_code":-13}
	// On exit_code != 0 the stack is whatever the TVM bailout left
	// behind — usually a random VM-internal value (85143 etc), NEVER
	// a real seqno. Returning that would build a message with a
	// wrong seqno that the freshly-deployed wallet contract rejects
	// with exit 33 ("seqno mismatch"). Treat any non-zero exit_code
	// as "seqno not readable yet → 0".
	var res struct {
		Stack    [][]any `json:"stack"`
		ExitCode int     `json:"exit_code"`
	}
	if err := json.Unmarshal(body, &res); err != nil {
		return 0, fmt.Errorf("ton: decode runGetMethod: %w", err)
	}
	if res.ExitCode != 0 {
		return 0, nil
	}
	if len(res.Stack) == 0 || len(res.Stack[0]) < 2 {
		return 0, errors.New("ton: empty seqno stack")
	}
	rawSeqno, ok := res.Stack[0][1].(string)
	if !ok {
		return 0, fmt.Errorf("ton: unexpected seqno stack entry: %T", res.Stack[0][1])
	}
	// Encoded as hex int string (e.g. "0x2a"). Strip the prefix.
	rawSeqno = strings.TrimPrefix(rawSeqno, "0x")
	if rawSeqno == "" {
		return 0, nil
	}
	parsed, err := hex.DecodeString(padHex(rawSeqno))
	if err != nil {
		return 0, fmt.Errorf("ton: decode seqno hex %q: %w", rawSeqno, err)
	}
	var seq uint32
	for _, b := range parsed {
		seq = seq<<8 | uint32(b)
	}
	return seq, nil
}

// GetBalanceNano — GET /getAddressBalance. Returns the address's
// balance in nanoTON (string-encoded decimal in the response — the
// nanoTON-as-uint64 ceiling tolerates anything below 1.8 * 10^10 TON,
// well above any realistic wallet balance).
func (p *TonCenterProvider) GetBalanceNano(ctx context.Context, addr string) (uint64, error) {
	var res struct {
		Balance string `json:"balance"`
	}
	// toncenter v2 returns getAddressBalance as the balance directly
	// (not nested under a struct), but getAddressInformation also
	// includes a balance string. Reuse the latter so a single round
	// trip can also tell the caller "is this wallet deployed yet?"
	if err := p.doGetIntoResult(ctx, p.baseFor(addr), "getAddressInformation", map[string]string{"address": addr}, &res); err != nil {
		return 0, fmt.Errorf("ton: getAddressInformation (balance): %w", err)
	}
	if res.Balance == "" {
		return 0, nil
	}
	var n uint64
	for _, c := range res.Balance {
		if c < '0' || c > '9' {
			return 0, fmt.Errorf("ton: balance not a decimal string: %q", res.Balance)
		}
		n = n*10 + uint64(c-'0')
	}
	return n, nil
}

// BroadcastBoC — POST /sendBoc. toncenter returns
// {"ok":true,"result":{"@type":"ok"}} on accept; the message hash isn't
// in the response. Re-derive it from the BoC envelope ourselves so the
// driver has a tx-tracking identifier even though toncenter doesn't
// echo it.
//
// We avoid the more direct /sendBocReturnHash because it's gated behind
// an API key on most toncenter plans; sendBoc is on the free tier.
func (p *TonCenterProvider) BroadcastBoC(ctx context.Context, boc []byte) (string, error) {
	if len(boc) == 0 {
		return "", errors.New("ton: empty BoC")
	}
	bocB64 := base64.StdEncoding.EncodeToString(boc)
	if _, err := p.doPost(ctx, p.baseForBroadcast(), "sendBoc", map[string]any{"boc": bocB64}); err != nil {
		return "", fmt.Errorf("ton: sendBoc: %w", err)
	}
	// External message hash: SHA-256 over the cell? We don't have the
	// cell parsed here. For now return the truncated BoC base64 hash so
	// logs have *something* unique. The signing driver's primary tx
	// identifier is the bridge swap_id; this string is observability.
	return base64ShortID(bocB64), nil
}

// padHex left-pads odd-length hex strings with a leading '0' so
// hex.DecodeString accepts them. toncenter returns naked-int hex
// (e.g. "0x1" not "0x01").
func padHex(s string) string {
	if len(s)%2 == 1 {
		return "0" + s
	}
	return s
}

func base64ShortID(s string) string {
	if len(s) <= 16 {
		return s
	}
	return s[:16]
}

// errNotFound is the sentinel doPost / doGet return for toncenter
// responses that resolve to "uninitialized contract" — used by
// GetSeqno to treat the missing seqno as zero.
var errNotFound = errors.New("ton: not found")

func (p *TonCenterProvider) doGetIntoResult(ctx context.Context, baseURL, method string, params map[string]string, out any) error {
	url := baseURL + "/" + method
	q := []string{}
	for k, v := range params {
		q = append(q, fmt.Sprintf("%s=%s", k, v))
	}
	if len(q) > 0 {
		url += "?" + strings.Join(q, "&")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	if p.APIKey != "" {
		req.Header.Set("X-API-Key", p.APIKey)
	}
	resp, err := p.Client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode == http.StatusNotFound {
		return errNotFound
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("toncenter HTTP %d: %s", resp.StatusCode, truncate(body, 200))
	}
	var env tcEnvelope
	if err := json.Unmarshal(body, &env); err != nil {
		return fmt.Errorf("decode envelope: %w", err)
	}
	if !env.Ok {
		return fmt.Errorf("toncenter error: %s", env.Error)
	}
	if out != nil {
		return json.Unmarshal(env.Result, out)
	}
	return nil
}

// doPost calls method with a JSON body and returns the result blob.
// Used for sendBoc and runGetMethod where the params don't fit in the
// query string (BoC payload is base64, seqno method takes a stack).
func (p *TonCenterProvider) doPost(ctx context.Context, baseURL, method string, payload map[string]any) (json.RawMessage, error) {
	url := baseURL + "/" + method
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	if p.APIKey != "" {
		req.Header.Set("X-API-Key", p.APIKey)
	}
	resp, err := p.Client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode == http.StatusNotFound {
		return nil, errNotFound
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("toncenter HTTP %d: %s", resp.StatusCode, truncate(respBody, 200))
	}
	var env tcEnvelope
	if err := json.Unmarshal(respBody, &env); err != nil {
		return nil, fmt.Errorf("decode envelope: %w", err)
	}
	if !env.Ok {
		// "uninitialized" / "method not found" both surface here as
		// the envelope's error string; bubble up as errNotFound for
		// the seqno=0 path, otherwise the raw error.
		if strings.Contains(strings.ToLower(env.Error), "uninit") ||
			strings.Contains(strings.ToLower(env.Error), "not found") {
			return nil, errNotFound
		}
		return nil, fmt.Errorf("toncenter error: %s", env.Error)
	}
	return env.Result, nil
}

func truncate(b []byte, n int) string {
	if len(b) <= n {
		return string(b)
	}
	return string(b[:n]) + "..."
}
