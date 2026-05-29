package cosigners

import (
	"bytes"
	"context"
	"crypto/rsa"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// fireblocks.go — real Fireblocks REST cosigner family.
//
// Wires the Go bridge to Fireblocks's RAW-sign transaction approval
// flow. The bridge POSTs `/v1/transactions` with operation=RAW carrying
// the destination-chain tx hash, then polls `/v1/transactions/{id}`
// until the tx reaches a terminal status. The mapping mirrors the TS
// reference impl at app/server/src/domain/cosigners.ts:344-449 exactly:
//
//	COMPLETED | BROADCASTING | CONFIRMING  → StatusApproved
//	  (signature pulled from signedMessages[0].signature.fullSig;
//	   ExternalID = the Fireblocks tx id, for traceability)
//	REJECTED  | CANCELLED    | BLOCKED     → StatusRejected
//	  (Reason carries `<status>` plus subStatus when present)
//	FAILED    | TIMEOUT                    → StatusFailed
//	  (transient — operator may retry by resubmitting the swap)
//	anything else                          → still in flight, keep polling
//
// Overall timeout matches the TS default (60 s, env-overridable via
// FIREBLOCKS_COSIGNER_TIMEOUT_MS in main.go where the family is
// constructed). Per-poll cadence is 1.5 s — slightly above Fireblocks's
// rate limit, well under the user's patience window.
//
// Authentication: each request signs a fresh JWT with the tenant's
// RSA private key (fetched from KMS via SecretStore.FetchFireblocks).
// See fireblocks_jwt.go for the signing details.
//
// Utila is NOT implemented here — RunUtila delegates to
// UtilaDelegate (or StubFamilyDispatcher as a default) so the family
// can be wired alone without breaking swaps that declare Utila
// intents. A future UtilaConnectRPCFamily will fill that gap.

// FireblocksDefaultPollInterval is how often we poll
// `/v1/transactions/{id}`. The TS reference uses 1500 ms; matching it
// keeps the two implementations' RPC behaviour identical so operators
// see the same Fireblocks-side request count regardless of which
// backend handled the swap.
const FireblocksDefaultPollInterval = 1500 * time.Millisecond

// FireblocksDefaultTimeout caps the entire approval flow (create + all
// polls). Matches the TS default. Operators with slower approval SLAs
// override via the env var the main.go construction site reads.
const FireblocksDefaultTimeout = 60 * time.Second

// FireblocksDefaultAPIHost is Fireblocks's production REST host.
// Tenants on the sandbox plane override via intent.APIHost.
const FireblocksDefaultAPIHost = "https://api.fireblocks.io"

// FireblocksDefaultVaultAccount is what the TS impl sends when the
// intent doesn't specify a vault — Fireblocks's "default" vault.
const FireblocksDefaultVaultAccount = "0"

// Status set partitioning. Mirrors the FB_STATUS_* sets in the TS impl
// at app/server/src/domain/cosigners.ts:344-350.
var (
	fireblocksTerminalApprove = map[string]struct{}{
		"COMPLETED":    {}, // RAW-sign produced a signature
		"BROADCASTING": {}, // signed + tx already pushed (effectively terminal for RAW)
		"CONFIRMING":   {}, // tx in mempool, signature stable
	}
	fireblocksTerminalReject = map[string]struct{}{
		"REJECTED":  {},
		"CANCELLED": {},
		"BLOCKED":   {},
	}
	fireblocksTerminalFail = map[string]struct{}{
		"FAILED":  {},
		"TIMEOUT": {},
	}
)

// FireblocksRESTFamily implements FamilyDispatcher with a real
// Fireblocks REST client. Construct with sensible defaults via the
// zero value or override fields explicitly for tests / non-default
// SLAs.
//
// Concurrency: every method on FireblocksRESTFamily is safe to call
// from multiple goroutines. The underlying *http.Client is reused
// across calls (Go's transport pool gives us free connection reuse).
type FireblocksRESTFamily struct {
	// HTTPClient overrides the http.Client used for both the POST
	// /v1/transactions create and the GET /v1/transactions/{id}
	// polls. Zero value falls back to a *new* http.Client with a 30 s
	// per-request timeout — that covers Fireblocks's typical 5–15 s
	// p99 with comfortable headroom for cold starts.
	HTTPClient *http.Client

	// PollInterval overrides the gap between status polls. Zero ⇒
	// FireblocksDefaultPollInterval. Lower values risk rate-limit
	// (Fireblocks's default is roughly 60 req/min/key); higher values
	// just slow down approvals.
	PollInterval time.Duration

	// Timeout caps the total create-plus-poll wall time. Zero ⇒
	// FireblocksDefaultTimeout. main.go's --enable-fireblocks-cosigner
	// path reads FIREBLOCKS_COSIGNER_TIMEOUT_MS to populate this.
	Timeout time.Duration

	// UtilaDelegate routes RunUtila calls when this family is wired as
	// the bridge's FamilyDispatcher. Zero ⇒ falls back to
	// StubFamilyDispatcher (which fails Utila intents with the
	// "use app/server" reason). Production wiring will set this to a
	// real Utila family once the Connect-RPC port lands.
	UtilaDelegate FamilyDispatcher

	// Now is the time source. Injectable so tests can pin JWT iat / exp
	// and step the deadline deterministically. Zero ⇒ time.Now.
	Now func() time.Time

	// Sleep is how we wait between polls. Injectable so tests can
	// remove the wall-clock delay without losing correctness coverage
	// over the poll loop. Zero ⇒ time.Sleep.
	Sleep func(time.Duration)

	// Nonce supplies the JWT `nonce` claim. Injectable for tests; zero
	// value uses crypto/rand via fireblocksNonce().
	Nonce func() string
}

// RunUtila delegates to UtilaDelegate (or the StubFamilyDispatcher
// default). The real Utila client is the subject of a follow-up port —
// until that lands, every Utila intent gets a clear "not implemented"
// failure that points operators at app/server.
func (f FireblocksRESTFamily) RunUtila(ctx context.Context, intent *UtilaIntent, secret string, opts DispatchOptions) Result {
	delegate := f.UtilaDelegate
	if delegate == nil {
		delegate = StubFamilyDispatcher{}
	}
	return delegate.RunUtila(ctx, intent, secret, opts)
}

// RunFireblocks runs the real RAW-sign flow against the Fireblocks
// REST API. Returns a Result describing the terminal state — never
// blocks past f.timeout(). Errors (network, parse, JWT, REST 4xx /
// 5xx) collapse into StatusFailed with the underlying message
// captured in Reason so operators can debug from the swap row alone.
func (f FireblocksRESTFamily) RunFireblocks(ctx context.Context, intent *FireblocksIntent, secret string, opts DispatchOptions) Result {
	intentWrap := Intent{Kind: KindFireblocks, Fireblocks: intent}

	if intent == nil {
		return Result{Intent: intentWrap, Status: StatusFailed, Reason: "fireblocks: nil intent"}
	}
	if opts.TxHash == "" {
		return Result{Intent: intentWrap, Status: StatusFailed, Reason: "fireblocks: empty TxHash — nothing to attest to"}
	}

	privKey, err := parseRSAPrivateKey(secret)
	if err != nil {
		return Result{Intent: intentWrap, Status: StatusFailed, Reason: fmt.Sprintf("fireblocks: %v", err)}
	}

	c := &fireblocksClient{
		apiBase:    f.apiBase(intent),
		apiKey:     intent.APIKey,
		privateKey: privKey,
		http:       f.httpClient(),
		now:        f.now(),
		nonce:      f.nonce(),
	}

	createResp, err := c.createTransaction(ctx, opts.SwapID, intent.vaultID(), opts.TxHash)
	if err != nil {
		return Result{Intent: intentWrap, Status: StatusFailed, Reason: fmt.Sprintf("fireblocks createTransaction: %v", err)}
	}
	txID := createResp.ID
	if txID == "" {
		return Result{Intent: intentWrap, Status: StatusFailed, Reason: "fireblocks createTransaction: response missing id"}
	}

	pollInterval := f.PollInterval
	if pollInterval <= 0 {
		pollInterval = FireblocksDefaultPollInterval
	}
	timeout := f.Timeout
	if timeout <= 0 {
		timeout = FireblocksDefaultTimeout
	}
	deadline := c.now().Add(timeout)
	sleep := f.Sleep
	if sleep == nil {
		sleep = time.Sleep
	}

	for {
		if ctx.Err() != nil {
			return Result{
				Intent:     intentWrap,
				Status:     StatusFailed,
				Reason:     fmt.Sprintf("fireblocks: context cancelled while polling tx=%s: %v", txID, ctx.Err()),
				ExternalID: txID,
			}
		}
		if !c.now().Before(deadline) {
			return Result{
				Intent:     intentWrap,
				Status:     StatusFailed,
				Reason:     fmt.Sprintf("fireblocks tx %s timed out after %s; manual recheck via getTransactionById may still resolve", txID, timeout),
				ExternalID: txID,
			}
		}

		status, gErr := c.getTransaction(ctx, txID)
		if gErr != nil {
			// Transient — log via caller's logger if any (the
			// dispatcher upstream owns logging). Keep polling until
			// deadline.
			sleep(pollInterval)
			continue
		}

		if _, ok := fireblocksTerminalApprove[status.Status]; ok {
			sig := status.signedMessageSig()
			if sig == "" {
				return Result{
					Intent:     intentWrap,
					Status:     StatusFailed,
					Reason:     fmt.Sprintf("fireblocks tx %s reached %s but signedMessages[0].signature.fullSig is missing", txID, status.Status),
					ExternalID: txID,
				}
			}
			return Result{
				Intent:     intentWrap,
				Status:     StatusApproved,
				Signature:  sig,
				ExternalID: txID,
			}
		}
		if _, ok := fireblocksTerminalReject[status.Status]; ok {
			return Result{
				Intent:     intentWrap,
				Status:     StatusRejected,
				Reason:     fmt.Sprintf("fireblocks %s%s", status.Status, status.subStatusSuffix()),
				ExternalID: txID,
			}
		}
		if _, ok := fireblocksTerminalFail[status.Status]; ok {
			return Result{
				Intent:     intentWrap,
				Status:     StatusFailed,
				Reason:     fmt.Sprintf("fireblocks %s%s", status.Status, status.subStatusSuffix()),
				ExternalID: txID,
			}
		}

		sleep(pollInterval)
	}
}

func (f FireblocksRESTFamily) httpClient() *http.Client {
	if f.HTTPClient != nil {
		return f.HTTPClient
	}
	// 30 s per-request matches the comfortable bound for Fireblocks
	// REST under normal load. The total flow is independently capped
	// by f.Timeout.
	return &http.Client{Timeout: 30 * time.Second}
}

func (f FireblocksRESTFamily) now() func() time.Time {
	if f.Now != nil {
		return f.Now
	}
	return time.Now
}

func (f FireblocksRESTFamily) nonce() func() string {
	if f.Nonce != nil {
		return f.Nonce
	}
	return fireblocksNonce
}

func (f FireblocksRESTFamily) apiBase(intent *FireblocksIntent) string {
	if intent.APIHost != "" {
		return strings.TrimRight(intent.APIHost, "/")
	}
	return FireblocksDefaultAPIHost
}

// =============================================================================
// fireblocksClient — per-call REST + JWT plumbing
// =============================================================================

type fireblocksClient struct {
	apiBase    string
	apiKey     string
	privateKey *rsa.PrivateKey
	http       *http.Client
	now        func() time.Time
	nonce      func() string
}

// =============================================================================
// Wire bodies — keep narrow JSON shapes so we don't depend on the full
// Fireblocks response object surface.
// =============================================================================

// createTransactionBody is the POST /v1/transactions payload for a
// RAW-sign approval. We only populate the fields Fireblocks needs;
// extra unknown fields are tolerated by their API so a future Fireblocks
// version adding optional fields won't break us.
type createTransactionBody struct {
	Operation       string                  `json:"operation"` // always "RAW" for cosigner attestation
	Source          createTransactionSource `json:"source"`
	Note            string                  `json:"note"`
	ExtraParameters extraParameters         `json:"extraParameters"`
}

type createTransactionSource struct {
	Type string `json:"type"` // always "VAULT_ACCOUNT" for cosigner flow
	ID   string `json:"id"`   // vault account id; "0" = Fireblocks default vault
}

type extraParameters struct {
	RawMessageData rawMessageData `json:"rawMessageData"`
}

type rawMessageData struct {
	Messages []rawMessage `json:"messages"`
}

type rawMessage struct {
	Content string `json:"content"` // hex tx hash without 0x prefix (Fireblocks convention)
}

// createTransactionResponse is the create-call response we depend on.
// Fireblocks returns more fields (`status: SUBMITTED`, etc.) but we
// only need the id for the subsequent poll.
type createTransactionResponse struct {
	ID string `json:"id"`
}

// getTransactionResponse is the poll-call response. Same minimal-fields
// principle.
type getTransactionResponse struct {
	ID             string                  `json:"id"`
	Status         string                  `json:"status"`
	SubStatus      string                  `json:"subStatus,omitempty"`
	SignedMessages []signedMessageResponse `json:"signedMessages,omitempty"`
}

type signedMessageResponse struct {
	Content   string             `json:"content,omitempty"`
	Signature signatureContainer `json:"signature"`
}

type signatureContainer struct {
	FullSig string `json:"fullSig"`
	R       string `json:"r,omitempty"`
	S       string `json:"s,omitempty"`
	V       int    `json:"v,omitempty"`
}

func (r getTransactionResponse) signedMessageSig() string {
	if len(r.SignedMessages) == 0 {
		return ""
	}
	return r.SignedMessages[0].Signature.FullSig
}

func (r getTransactionResponse) subStatusSuffix() string {
	if r.SubStatus == "" {
		return ""
	}
	return " subStatus=" + r.SubStatus
}

// =============================================================================
// Client methods — POST create / GET poll
// =============================================================================

// createTransaction issues the RAW-sign approval request. Returns the
// Fireblocks-side transaction id on success.
func (c *fireblocksClient) createTransaction(ctx context.Context, swapID, vaultID, txHash string) (*createTransactionResponse, error) {
	body := createTransactionBody{
		Operation: "RAW",
		Source: createTransactionSource{
			Type: "VAULT_ACCOUNT",
			ID:   vaultID,
		},
		Note: fmt.Sprintf("lux-bridge cosign swap=%s", swapID),
		ExtraParameters: extraParameters{
			RawMessageData: rawMessageData{
				Messages: []rawMessage{{Content: strings.TrimPrefix(txHash, "0x")}},
			},
		},
	}
	bodyJSON, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("marshal create body: %w", err)
	}

	var resp createTransactionResponse
	if err := c.doRequest(ctx, http.MethodPost, "/v1/transactions", bodyJSON, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// getTransaction polls the transaction status.
func (c *fireblocksClient) getTransaction(ctx context.Context, txID string) (*getTransactionResponse, error) {
	if txID == "" {
		return nil, fmt.Errorf("empty txID")
	}
	uri := "/v1/transactions/" + txID
	var resp getTransactionResponse
	if err := c.doRequest(ctx, http.MethodGet, uri, nil, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// doRequest mints a JWT, sets the auth + API-key headers, fires the
// request, and decodes the JSON response. Non-2xx is folded into the
// returned error with the status code + truncated response body for
// debuggability.
func (c *fireblocksClient) doRequest(ctx context.Context, method, uri string, body []byte, into any) error {
	jwt, err := signFireblocksJWT(uri, body, c.apiKey, c.privateKey, c.now(), c.nonce())
	if err != nil {
		return fmt.Errorf("sign jwt: %w", err)
	}

	var reqBody io.Reader
	if body != nil {
		reqBody = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.apiBase+uri, reqBody)
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+jwt)
	req.Header.Set("X-API-Key", c.apiKey)
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	rawBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, truncateBytes(rawBody, 200))
	}
	if into != nil {
		if err := json.Unmarshal(rawBody, into); err != nil {
			return fmt.Errorf("decode response: %w (body=%s)", err, truncateBytes(rawBody, 200))
		}
	}
	return nil
}

// vaultID returns the vault account id to use for the transaction
// request, falling back to FireblocksDefaultVaultAccount when the
// intent doesn't specify one.
func (i *FireblocksIntent) vaultID() string {
	if i.VaultAccountID == "" {
		return FireblocksDefaultVaultAccount
	}
	return i.VaultAccountID
}

func truncateBytes(b []byte, n int) string {
	if len(b) <= n {
		return string(b)
	}
	return string(b[:n]) + "…"
}
