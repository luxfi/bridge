// Package bchain is a JSON-RPC client for the Lux BridgeVM (b-chain).
//
// This is the Go port of `pkg/bridge/src/app/lib/bridge-rpc.ts`. Talks to
// the BridgeVM JSON-RPC interface (`${nodeUrl}/ext/bc/B/rpc`) and, when
// configured, the ThresholdVM interface (`${nodeUrl}/ext/bc/T/rpc`) for
// MPC signature retrieval.
//
// Trust model matches the TS client: the JSON-RPC node is untrusted
// transport. Authoritative settlement decisions (min_receive_amount,
// signature validity) come from the MPC threshold quorum, not from
// anything in this package. Permissionless: any consumer can point at
// any BridgeVM node; there is no central authority on the wire protocol.
//
// Concurrency: a *Client is safe for use by multiple goroutines.
// Cancellation: every method takes a context.Context for caller-driven
// cancellation. A per-request timeout (Client.Timeout) bounds the call
// independently so a hung node can't block forever.
package bchain

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sync/atomic"
	"time"
)

// =============================================================================
// JSON-RPC envelope
// =============================================================================

// jsonrpcRequest is the wire shape for outgoing JSON-RPC calls.
type jsonrpcRequest struct {
	JSONRPC string `json:"jsonrpc"`
	ID      string `json:"id"`
	Method  string `json:"method"`
	Params  any    `json:"params,omitempty"`
}

// jsonrpcResponse is the wire shape for incoming JSON-RPC responses.
// Result is left as RawMessage so each typed method decodes it directly.
type jsonrpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      string          `json:"id"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *jsonrpcError   `json:"error,omitempty"`
}

type jsonrpcError struct {
	Code    int             `json:"code"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data,omitempty"`
}

// RPCError is the typed error returned by every Client method when the
// remote node reports a JSON-RPC error or the transport fails. Inspect
// .Code to dispatch on JSON-RPC error codes (-32601 method-not-found,
// -32602 invalid-params, etc.) and .HTTPStatus for transport-layer
// failures (0 means no HTTP error was involved).
type RPCError struct {
	Method     string
	Code       int
	HTTPStatus int
	Message    string
	Data       json.RawMessage
}

func (e *RPCError) Error() string {
	if e.HTTPStatus != 0 {
		return fmt.Sprintf("bchain: %s HTTP %d: %s", e.Method, e.HTTPStatus, e.Message)
	}
	return fmt.Sprintf("bchain: %s rpc %d: %s", e.Method, e.Code, e.Message)
}

// =============================================================================
// Bridge types — mirror the TS bridge-rpc.ts schema verbatim
// =============================================================================

// BridgeRequestStatus is the lifecycle state of a bridge request.
type BridgeRequestStatus string

const (
	StatusPending   BridgeRequestStatus = "pending"
	StatusDeposited BridgeRequestStatus = "deposited"
	StatusSigning   BridgeRequestStatus = "signing"
	StatusSigned    BridgeRequestStatus = "signed"
	StatusReleasing BridgeRequestStatus = "releasing"
	StatusCompleted BridgeRequestStatus = "completed"
	StatusFailed    BridgeRequestStatus = "failed"
	StatusCancelled BridgeRequestStatus = "cancelled"
)

// BridgeRequest is one bridge intent + its observable lifecycle state.
type BridgeRequest struct {
	RequestID    string              `json:"requestId"`
	SourceChain  string              `json:"sourceChain"`
	DestChain    string              `json:"destChain"`
	SourceAsset  string              `json:"sourceAsset"`
	DestAsset    string              `json:"destAsset"`
	Amount       string              `json:"amount"`
	Recipient    string              `json:"recipient"`
	Sender       string              `json:"sender"`
	Status       BridgeRequestStatus `json:"status"`
	CreatedAt    int64               `json:"createdAt"`
	SourceTxHash string              `json:"sourceTxHash,omitempty"`
	DestTxHash   string              `json:"destTxHash,omitempty"`
	Signature    string              `json:"signature,omitempty"`
	FeeAmount    string              `json:"feeAmount,omitempty"`
	NetAmount    string              `json:"netAmount,omitempty"`
}

// ChainConfig is the per-chain config the BridgeVM reports.
type ChainConfig struct {
	ChainID        string            `json:"chainId"`
	ChainName      string            `json:"chainName"`
	RPCEndpoint    string            `json:"rpcEndpoint"`
	BridgeContract string            `json:"bridgeContract"`
	TokenContracts map[string]string `json:"tokenContracts"`
	NativeCurrency string            `json:"nativeCurrency"`
	BlockTime      int               `json:"blockTime"`
	Confirmations  int               `json:"confirmations"`
	Enabled        bool              `json:"enabled"`
}

// BridgeInfo is node-level info: mpc readiness, threshold, totals.
type BridgeInfo struct {
	Version         string   `json:"version"`
	NodeID          string   `json:"nodeId"`
	ChainID         string   `json:"chainId"`
	MPCReady        bool     `json:"mpcReady"`
	MPCPublicKey    string   `json:"mpcPublicKey"`
	Threshold       int      `json:"threshold"`
	TotalParties    int      `json:"totalParties"`
	SupportedChains []string `json:"supportedChains"`
	TotalBridged    string   `json:"totalBridged"`
	TotalFees       string   `json:"totalFees"`
}

// FeeEstimate is the bridge_estimateFee result.
type FeeEstimate struct {
	FeeAmount     string `json:"feeAmount"`
	NetAmount     string `json:"netAmount"`
	EstimatedTime int    `json:"estimatedTime"`
}

// Health is the bridge_health result.
type Health struct {
	Status   string `json:"status"`
	MPCReady bool   `json:"mpcReady"`
}

// MPCPublicKey is the bridge_getMPCPublicKey result.
type MPCPublicKey struct {
	PublicKey string `json:"publicKey"`
}

// BridgeSignature is the bridge_getSignature result.
type BridgeSignature struct {
	Signature string `json:"signature"`
	SessionID string `json:"sessionId"`
}

// CancelResult is the bridge_cancelRequest result.
type CancelResult struct {
	Success bool `json:"success"`
}

// =============================================================================
// Method param shapes
// =============================================================================

// EstimateFeeParams is the bridge_estimateFee request body.
type EstimateFeeParams struct {
	SourceChain string `json:"sourceChain"`
	DestChain   string `json:"destChain"`
	SourceAsset string `json:"sourceAsset"`
	DestAsset   string `json:"destAsset"`
	Amount      string `json:"amount"`
	Refuel      bool   `json:"refuel,omitempty"`
}

// SubmitRequestParams is the bridge_submitRequest request body.
type SubmitRequestParams struct {
	SourceChain string `json:"sourceChain"`
	DestChain   string `json:"destChain"`
	SourceAsset string `json:"sourceAsset"`
	DestAsset   string `json:"destAsset"`
	Amount      string `json:"amount"`
	Recipient   string `json:"recipient"`
	Sender      string `json:"sender"`
	Refuel      bool   `json:"refuel,omitempty"`
}

// =============================================================================
// Client
// =============================================================================

// Default request timeout when Client.Timeout is zero.
const DefaultTimeout = 10 * time.Second

// Client is a JSON-RPC client for the BridgeVM (b-chain) and, optionally,
// the ThresholdVM (t-chain). Safe for concurrent use.
type Client struct {
	// BridgeRPCURL is the BridgeVM JSON-RPC endpoint
	// (e.g. https://node.lux.network/ext/bc/B/rpc). Required.
	BridgeRPCURL string

	// ThresholdRPCURL is the ThresholdVM JSON-RPC endpoint. Optional;
	// when empty, calls to thresholdCall return an error so the caller
	// gets an obvious "not configured" signal instead of a 404.
	ThresholdRPCURL string

	// Timeout bounds each individual RPC call. Zero means DefaultTimeout.
	// The caller's context.Context cancellation is honored in addition.
	Timeout time.Duration

	// HTTPClient is the underlying http.Client. Zero means http.DefaultClient.
	HTTPClient *http.Client

	// idSeq is a monotonic per-Client counter used for the JSON-RPC `id`
	// field. Combined with the random prefix it gives unique ids for
	// concurrent calls. Atomic so multiple goroutines can call methods
	// at once without external locking.
	idSeq atomic.Uint64

	// idPrefix is the random per-Client suffix appended to ids. Set
	// lazily on first call (via nextID) so a zero-value Client works.
	idPrefix atomic.Pointer[string]
}

// New constructs a Client with sane defaults. NodeURL is a convenience
// that derives both BridgeRPCURL and ThresholdRPCURL from a single
// Lux-node base; for finer control set the fields on a zero-value Client
// directly.
//
//	c := bchain.New("https://api.lux-test.network", 0)
//	info, err := c.GetBridgeInfo(ctx)
func New(nodeURL string, timeout time.Duration) *Client {
	if nodeURL == "" {
		nodeURL = "http://127.0.0.1:9650"
	}
	return &Client{
		BridgeRPCURL:    nodeURL + "/ext/bc/B/rpc",
		ThresholdRPCURL: nodeURL + "/ext/bc/T/rpc",
		Timeout:         timeout,
	}
}

// nextID returns the next JSON-RPC id for this client. Format:
// `<random6>-<monotonic>`. Random portion is generated once per client
// instance on first call.
func (c *Client) nextID() string {
	pfx := c.idPrefix.Load()
	if pfx == nil {
		var buf [3]byte
		if _, err := rand.Read(buf[:]); err == nil {
			s := hex.EncodeToString(buf[:])
			c.idPrefix.CompareAndSwap(nil, &s)
			pfx = c.idPrefix.Load()
		} else {
			// Fallback: zeros. Collisions don't matter — id is for
			// node-side log correlation, not authentication.
			s := "000000"
			c.idPrefix.CompareAndSwap(nil, &s)
			pfx = c.idPrefix.Load()
		}
	}
	n := c.idSeq.Add(1)
	return fmt.Sprintf("%s-%d", *pfx, n)
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

// rpc is the single RPC transport used by every method. The caller's
// context cancels the request; an internal timeout (c.timeout()) bounds
// the call independently so a hung node can't block indefinitely even
// when the caller passed context.Background().
func (c *Client) rpc(ctx context.Context, url, method string, params any, out any) error {
	if url == "" {
		return &RPCError{
			Method:  method,
			Code:    -32601,
			Message: "rpc url not configured (set BridgeRPCURL / ThresholdRPCURL)",
		}
	}

	body, err := json.Marshal(jsonrpcRequest{
		JSONRPC: "2.0",
		ID:      c.nextID(),
		Method:  method,
		Params:  params,
	})
	if err != nil {
		return fmt.Errorf("bchain: marshal %s params: %w", method, err)
	}

	callCtx, cancel := context.WithTimeout(ctx, c.timeout())
	defer cancel()

	req, err := http.NewRequestWithContext(callCtx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("bchain: build request for %s: %w", method, err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient().Do(req)
	if err != nil {
		// Distinguish context cancellation from other transport errors
		// so callers can react (context.Canceled vs RPCError).
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return err
		}
		return &RPCError{
			Method:  method,
			Code:    -32000,
			Message: err.Error(),
		}
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return &RPCError{
			Method:     method,
			HTTPStatus: resp.StatusCode,
			Message:    fmt.Sprintf("read response: %v", err),
		}
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		// Try to surface a JSON-RPC error nested in a non-2xx response.
		var maybeRpc jsonrpcResponse
		if json.Unmarshal(respBody, &maybeRpc) == nil && maybeRpc.Error != nil {
			return &RPCError{
				Method:     method,
				HTTPStatus: resp.StatusCode,
				Code:       maybeRpc.Error.Code,
				Message:    maybeRpc.Error.Message,
				Data:       maybeRpc.Error.Data,
			}
		}
		return &RPCError{
			Method:     method,
			HTTPStatus: resp.StatusCode,
			Message:    fmt.Sprintf("HTTP %d: %s", resp.StatusCode, truncate(respBody, 256)),
		}
	}

	var parsed jsonrpcResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return &RPCError{
			Method:     method,
			HTTPStatus: resp.StatusCode,
			Message:    fmt.Sprintf("decode response: %v (body=%s)", err, truncate(respBody, 200)),
		}
	}
	if parsed.Error != nil {
		return &RPCError{
			Method:  method,
			Code:    parsed.Error.Code,
			Message: parsed.Error.Message,
			Data:    parsed.Error.Data,
		}
	}
	if len(parsed.Result) == 0 || string(parsed.Result) == "null" {
		return &RPCError{
			Method:  method,
			Code:    -32603,
			Message: "empty result",
		}
	}
	if out != nil {
		if err := json.Unmarshal(parsed.Result, out); err != nil {
			return &RPCError{
				Method:  method,
				Code:    -32603,
				Message: fmt.Sprintf("decode result: %v", err),
			}
		}
	}
	return nil
}

// truncate clips a byte slice for inclusion in error messages.
func truncate(b []byte, n int) string {
	if len(b) <= n {
		return string(b)
	}
	return string(b[:n]) + "…"
}

// bridgeCall invokes a method against the BridgeVM endpoint.
func (c *Client) bridgeCall(ctx context.Context, method string, params, out any) error {
	return c.rpc(ctx, c.BridgeRPCURL, method, params, out)
}

// thresholdCall invokes a method against the ThresholdVM endpoint.
// Returns an error tagged with method == "" when no t-chain URL is set,
// so callers don't accidentally fire off to a misconfigured Client.
func (c *Client) thresholdCall(ctx context.Context, method string, params, out any) error {
	if c.ThresholdRPCURL == "" {
		return &RPCError{
			Method:  method,
			Code:    -32601,
			Message: "ThresholdRPCURL not configured",
		}
	}
	return c.rpc(ctx, c.ThresholdRPCURL, method, params, out)
}

// =============================================================================
// Bridge: quote / submit / status / cancel
// =============================================================================

// EstimateFee returns the fee + receive-amount estimate for a bridge intent.
func (c *Client) EstimateFee(ctx context.Context, params EstimateFeeParams) (*FeeEstimate, error) {
	var out FeeEstimate
	if err := c.bridgeCall(ctx, "bridge_estimateFee", params, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// SubmitBridgeRequest creates a new bridge intent server-side. The
// returned record carries the RequestID the caller polls via GetBridgeStatus.
func (c *Client) SubmitBridgeRequest(ctx context.Context, params SubmitRequestParams) (*BridgeRequest, error) {
	var out BridgeRequest
	if err := c.bridgeCall(ctx, "bridge_submitRequest", params, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// GetBridgeStatus reads the current state of a bridge request.
func (c *Client) GetBridgeStatus(ctx context.Context, requestID string) (*BridgeRequest, error) {
	var out BridgeRequest
	if err := c.bridgeCall(ctx, "bridge_getStatus", map[string]string{"requestId": requestID}, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// CancelRequest cancels a pending bridge request.
func (c *Client) CancelRequest(ctx context.Context, requestID string) (*CancelResult, error) {
	var out CancelResult
	if err := c.bridgeCall(ctx, "bridge_cancelRequest", map[string]string{"requestId": requestID}, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// =============================================================================
// Bridge: discovery
// =============================================================================

// GetBridgeInfo reads node-level info (mpc readiness, threshold, totals).
func (c *Client) GetBridgeInfo(ctx context.Context) (*BridgeInfo, error) {
	var out BridgeInfo
	if err := c.bridgeCall(ctx, "bridge_getInfo", nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// GetSupportedChains lists the chains the BridgeVM supports.
func (c *Client) GetSupportedChains(ctx context.Context) ([]ChainConfig, error) {
	var out []ChainConfig
	if err := c.bridgeCall(ctx, "bridge_getSupportedChains", nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// GetChainConfig fetches the per-chain config for the given chain id.
func (c *Client) GetChainConfig(ctx context.Context, chainID string) (*ChainConfig, error) {
	var out ChainConfig
	if err := c.bridgeCall(ctx, "bridge_getChainConfig", map[string]string{"chainId": chainID}, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Health is the BridgeVM liveness probe. Used by the cmd/bridge proxy
// to decide whether RPC is reachable before routing a request.
func (c *Client) Health(ctx context.Context) (*Health, error) {
	var out Health
	if err := c.bridgeCall(ctx, "bridge_health", nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// =============================================================================
// Bridge: MPC (shared signing party)
// =============================================================================

// GetMPCPublicKey returns the active MPC public key.
func (c *Client) GetMPCPublicKey(ctx context.Context) (*MPCPublicKey, error) {
	var out MPCPublicKey
	if err := c.bridgeCall(ctx, "bridge_getMPCPublicKey", nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// GetBridgeSignature retrieves the MPC signature for a completed
// bridge request.
func (c *Client) GetBridgeSignature(ctx context.Context, requestID string) (*BridgeSignature, error) {
	var out BridgeSignature
	if err := c.bridgeCall(ctx, "bridge_getSignature", map[string]string{"requestId": requestID}, &out); err != nil {
		return nil, err
	}
	return &out, nil
}
