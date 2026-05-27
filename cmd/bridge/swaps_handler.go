package main

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/hanzoai/zip"
	"github.com/luxfi/bridge/internal/bchain"
	"github.com/luxfi/bridge/internal/depositcheck"
	"github.com/luxfi/bridge/internal/mchain"
)

// swaps_handler.go wires the native swap CRUD into cmd/bridge.
//
// Native handlers OWN swap state:
//   - GET  /v1/bridge/quote       quoteNative       — QuoteEngine
//   - POST /v1/bridge/swaps       swapsCreateNative — SwapStore + mchain
//   - GET  /v1/bridge/swaps       swapsListNative   — SwapStore
//   - GET  /v1/bridge/swaps/:id   swapsGetNative    — SwapStore
//   - POST /v1/bridge/check-deposit checkDepositNative — depositcheck
//   - GET  /v1/bridge/info        infoNative        — bchain (signer-set info)
//
// BridgeVM (b-chain) does NOT host swap CRUD per LP-333 — those
// methods don't exist on the chain. The legacy reverse-proxy still
// runs only when no SwapStore/QuoteEngine are configured.

// Wire contract: the legacy app/server REST shape is preserved so the
// existing TS SDK (pkg/bridge/src/app/lib/bridge-api.ts) works against
// this Go binary without modification.

// =============================================================================
// Wire-shape adapters
// =============================================================================

// serverQuote mirrors `ServerQuote` in pkg/bridge/src/app/lib/bridge-api.ts.
// The TS SDK consumes this shape via `fetchQuoteViaRest`; preserving it
// here means a tenant that flips its `BRIDGE_API_HOST` from the legacy
// Express server to this Go binary needs zero SDK changes.
type serverQuote struct {
	ReceiveAmount    float64 `json:"receive_amount"`
	MinReceiveAmount float64 `json:"min_receive_amount"`
	BlockchainFee    float64 `json:"blockchain_fee"`
	ServiceFee       float64 `json:"service_fee"`
	AvgCompletion    string  `json:"avg_completion_time"`
	TotalFee         float64 `json:"total_fee"`
	TotalFeeInUsd    float64 `json:"total_fee_in_usd"`
	Slippage         float64 `json:"slippage"`
}

// serverSwap mirrors `ServerSwap` in bridge-api.ts. The id + status
// fields are required; deposit_address surfaces the MPC-derived
// hot-wallet address when use_deposit_address=true.
type serverSwap struct {
	ID                 string `json:"id"`
	Status             string `json:"status,omitempty"`
	SourceNetwork      string `json:"source_network,omitempty"`
	DestinationNetwork string `json:"destination_network,omitempty"`
	DepositAddress     string `json:"deposit_address,omitempty"`
	Signature          string `json:"signature,omitempty"`
	SourceTxHash       string `json:"source_tx_hash,omitempty"`
	DestTxHash         string `json:"dest_tx_hash,omitempty"`
	// DestRawTx is the wire-ready signed destination tx. Surfaced
	// for operator diagnostics — useful for decoding the tx fields
	// and verifying ECDSA recovery against the expected sender when
	// a destination chain rejects with "invalid sender".
	DestRawTx string `json:"dest_raw_tx,omitempty"`
	// LastError is the most-recent transient driver error. The swap
	// is still progressing (the drivers retry); the UI uses this to
	// tell the user what's blocking — e.g. "insufficient funds for
	// gas" before they sit through a 5-minute spinner.
	LastError string `json:"last_error,omitempty"`
	// RefundTxHash is the source-chain tx hash of the refund sweep
	// once the refund driver lands it. Populated together with
	// status=refunded.
	RefundTxHash string `json:"refund_tx_hash,omitempty"`
}

// createSwapReq mirrors the POST body sent by the TS SDK
// (`bridge-api.ts::createSwapViaRest`). Snake-case JSON tags.
type createSwapReq struct {
	Amount             float64 `json:"amount"`
	SourceNetwork      string  `json:"source_network"`
	SourceAsset        string  `json:"source_asset"`
	DestinationNetwork string  `json:"destination_network"`
	DestinationAsset   string  `json:"destination_asset"`
	DestinationAddress string  `json:"destination_address"`
	Sender             string  `json:"sender,omitempty"`
	Refuel             bool    `json:"refuel"`
	UseDepositAddress  bool    `json:"use_deposit_address"`
	UseTeleporter      bool    `json:"use_teleporter"`
	AppName            string  `json:"app_name"`
}

// envelope is the canonical `{data: ...}` wrapper the legacy server
// emits and the TS SDK unwraps.
type envelope struct {
	Data any `json:"data"`
}

// =============================================================================
// Native handlers (bchain-backed)
// =============================================================================

// quoteNative answers GET /v1/bridge/quote by running the native
// QuoteEngine over the configured PriceFeed. The legacy ServerQuote
// envelope is preserved so the TS SDK consumes it unchanged.
//
// Required query params: source_network, source_token,
// destination_network, destination_token, amount. Optional: refuel.
func (a *API) quoteNative(c *zip.Ctx) error {
	src := c.Query("source_network")
	srcTok := c.Query("source_token")
	dst := c.Query("destination_network")
	dstTok := c.Query("destination_token")
	amt := c.Query("amount")
	refuel := c.Query("refuel") == "1" || strings.EqualFold(c.Query("refuel"), "true")

	if src == "" || srcTok == "" || dst == "" || dstTok == "" || amt == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error":  "missing_params",
			"detail": "required: source_network, source_token, destination_network, destination_token, amount",
		})
	}
	amountF, err := strconv.ParseFloat(amt, 64)
	if err != nil || amountF <= 0 {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error":  "bad_amount",
			"detail": "amount must be a positive number",
		})
	}

	res, err := a.quote.Quote(c.Context(), QuoteInput{
		Amount:             amountF,
		SourceNetwork:      src,
		SourceAsset:        srcTok,
		DestinationNetwork: dst,
		DestinationAsset:   dstTok,
		Refuel:             refuel,
	})
	if err != nil {
		// Unknown price → 503 (transient — feed may rehydrate);
		// other errors → 400 (validation).
		if errors.Is(err, ErrPriceUnknown) {
			return c.JSON(http.StatusServiceUnavailable, map[string]string{
				"error":  "price_unknown",
				"detail": err.Error(),
			})
		}
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error":  "quote_failed",
			"detail": err.Error(),
		})
	}

	q := serverQuote{
		ReceiveAmount:    res.ReceiveAmount,
		MinReceiveAmount: res.MinReceiveAmount,
		BlockchainFee:    0,
		ServiceFee:       res.ServiceFee,
		AvgCompletion:    res.AvgCompletion,
		TotalFee:         res.TotalFee,
		TotalFeeInUsd:    0,
		Slippage:         res.Slippage,
	}
	return c.JSON(http.StatusOK, envelope{Data: map[string]any{
		"quote":  q,
		"refuel": nil,
		"reward": struct{}{},
	}})
}

// swapsCreateNative answers POST /v1/bridge/swaps by:
//  1. Validating the request.
//  2. (Optional) minting an MPC-derived deposit address via
//     mchain.KeygenForDeposit when use_deposit_address=true.
//  3. Persisting the swap natively in the SwapStore (no b-chain call —
//     BridgeVM is the LP-333 signer-set manager, not a swap API).
//  4. Returning the legacy ServerSwap envelope so the TS SDK works unchanged.
//
// State machine: new swaps start at SwapStatusUserDepositPending. A
// future deposit-watcher will advance them through bridge_transfer_pending
// → signing → broadcasting → completed.
//
// Legacy POST body fields use_teleporter, app_name, cosigners are
// accepted (so the TS SDK works unchanged) but NOT acted on — the
// MPC pipeline supersedes the teleporter dispatch (see
// architecture_mpc_vs_teleporter memory).
func (a *API) swapsCreateNative(c *zip.Ctx) error {
	var req createSwapReq
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error":  "bad_request",
			"detail": err.Error(),
		})
	}
	if req.SourceNetwork == "" || req.DestinationNetwork == "" || req.DestinationAddress == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error":  "missing_params",
			"detail": "required: source_network, destination_network, destination_address",
		})
	}
	if req.Amount <= 0 {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error":  "bad_amount",
			"detail": "amount must be > 0",
		})
	}

	// Step 1 — optional MPC keygen for the deposit address.
	var depositWallet *mchain.Wallet
	if req.UseDepositAddress {
		if a.mchain == nil {
			return c.JSON(http.StatusServiceUnavailable, map[string]string{
				"error":  "mpc_unavailable",
				"detail": "use_deposit_address=true requires --mpc-url; configure the MPC keygen URL or set use_deposit_address=false",
			})
		}
		w, err := a.mchain.KeygenForDeposit(c.Context(), req.SourceNetwork)
		if err != nil {
			return mpcErrToHTTP(c, err, "createSwap")
		}
		depositWallet = w
	}

	// Step 2 — persist the swap. ID is assigned by the store.
	sender := req.Sender
	if sender == "" {
		sender = req.DestinationAddress
	}
	swap := &Swap{
		Status:             SwapStatusUserDepositPending,
		Amount:             req.Amount,
		SourceNetwork:      req.SourceNetwork,
		SourceAsset:        req.SourceAsset,
		DestinationNetwork: req.DestinationNetwork,
		DestinationAsset:   req.DestinationAsset,
		DestinationAddress: req.DestinationAddress,
		Sender:             sender,
		Refuel:             req.Refuel,
		UseDepositAddress:  req.UseDepositAddress,
		UseTeleporter:      false, // teleporter dispatch is off the happy path per architecture_mpc_vs_teleporter
		AppName:            req.AppName,
	}
	if depositWallet != nil {
		swap.DepositAddress = depositWallet.LegacyDepositString()
	}
	if err := a.store.Create(c.Context(), swap); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error":  "store_failed",
			"detail": err.Error(),
		})
	}
	return c.JSON(http.StatusOK, envelope{Data: swapToServerShape(swap)})
}

// swapsListNative answers GET /v1/bridge/swaps?status=…&source_network=…&limit=…
// with a paginated, newest-first list of swaps from the store.
func (a *API) swapsListNative(c *zip.Ctx) error {
	filter := SwapFilter{
		Status:        SwapStatus(c.Query("status")),
		SourceNetwork: c.Query("source_network"),
	}
	if lim := c.Query("limit"); lim != "" {
		if n, err := strconv.Atoi(lim); err == nil && n > 0 {
			filter.Limit = n
		}
	}
	swaps, err := a.store.List(c.Context(), filter)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error":  "store_failed",
			"detail": err.Error(),
		})
	}
	out := make([]serverSwap, 0, len(swaps))
	for _, sw := range swaps {
		out = append(out, swapToServerShape(sw))
	}
	return c.JSON(http.StatusOK, envelope{Data: out})
}

// swapToServerShape collapses the internal Swap into the legacy
// ServerSwap envelope the TS SDK consumes.
func swapToServerShape(sw *Swap) serverSwap {
	return serverSwap{
		ID:                 sw.ID,
		Status:             string(sw.Status),
		SourceNetwork:      sw.SourceNetwork,
		DestinationNetwork: sw.DestinationNetwork,
		DepositAddress:     sw.DepositAddress,
		Signature:          sw.Signature,
		SourceTxHash:       sw.SourceTxHash,
		DestTxHash:         sw.DestTxHash,
		DestRawTx:          sw.DestRawTx,
		LastError:          sw.LastError,
		RefundTxHash:       sw.RefundTxHash,
	}
}

// =============================================================================
// Deposit check (ops diagnostic)
// =============================================================================

// checkDepositReq is the POST body for /v1/bridge/check-deposit.
type checkDepositReq struct {
	Network string  `json:"network"`
	Address string  `json:"address"`
	Asset   string  `json:"asset"`
	Amount  float64 `json:"amount"`
}

// checkDepositNative answers POST /v1/bridge/check-deposit with a
// confirmed/not-confirmed verdict from the source-chain RPC. Useful
// for ops + monitoring; NOT a substitute for BridgeVM's own watcher.
//
// Response shape:
//
//	{"confirmed": bool, "network": string, "address": string,
//	 "asset": string, "required_amount": number}
//
// Errors (4xx/5xx): {"error": "...", "detail": "..."}.
func (a *API) checkDepositNative(c *zip.Ctx) error {
	var req checkDepositReq
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error":  "bad_request",
			"detail": err.Error(),
		})
	}
	if req.Network == "" || req.Address == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error":  "missing_params",
			"detail": "required: network, address",
		})
	}
	if req.Amount < 0 {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error":  "bad_amount",
			"detail": "amount must be >= 0",
		})
	}

	confirmed, err := a.depcheck.Check(c.Context(), depositcheck.CheckParams{
		NetworkInternalName: req.Network,
		Address:             req.Address,
		Asset:               req.Asset,
		RequiredAmount:      req.Amount,
	})
	if err != nil {
		// Unsupported network / substrate-not-implemented → 501; all
		// other errors → 502 (the SDK can distinguish "wrong call"
		// from "transient upstream failure").
		if errors.Is(err, depositcheck.ErrUnsupportedNetwork) ||
			errors.Is(err, depositcheck.ErrSubstrateNotImplemented) {
			return c.JSON(http.StatusNotImplemented, map[string]string{
				"error":  "unsupported_network",
				"detail": err.Error(),
			})
		}
		return c.JSON(http.StatusBadGateway, map[string]string{
			"error":  "upstream_failed",
			"detail": err.Error(),
		})
	}
	return c.JSON(http.StatusOK, map[string]any{
		"confirmed":       confirmed,
		"network":         req.Network,
		"address":         req.Address,
		"asset":           req.Asset,
		"required_amount": req.Amount,
	})
}

// mpcErrToHTTP maps an mchain error to an HTTP envelope similar to
// rpcErrToHTTP but with mpc-specific framing so SDK callers can
// distinguish keygen failures from bchain failures.
func mpcErrToHTTP(c *zip.Ctx, err error, op string) error {
	// ErrSubstrateNotImplemented → 501 so the SDK distinguishes "not
	// supported" from "transient failure".
	if errors.Is(err, mchain.ErrSubstrateNotImplemented) {
		return c.JSON(http.StatusNotImplemented, map[string]string{
			"error":  op + "_unsupported_chain",
			"detail": err.Error(),
		})
	}
	var mpcErr *mchain.MPCError
	if errors.As(err, &mpcErr) {
		status := mpcErr.HTTPStatus
		if status == 0 {
			status = http.StatusBadGateway
		}
		return c.JSON(status, map[string]string{
			"error":  op + "_keygen_failed",
			"detail": mpcErr.Message,
		})
	}
	return c.JSON(http.StatusBadGateway, map[string]string{
		"error":  op + "_keygen_failed",
		"detail": err.Error(),
	})
}

// adminInjectRawTxReq is the body for POST /admin/swaps/:id/inject-raw-tx.
type adminInjectRawTxReq struct {
	DestRawTx string `json:"dest_raw_tx"`
}

// swapsInjectRawTxNative answers POST /admin/swaps/:id/inject-raw-tx
// by writing a caller-supplied DestRawTx into the swap and advancing
// status to broadcasting. Used when the bridge's signing driver
// can't be re-run (e.g. mpcd refuses a duplicate sign request), but
// the operator has already derived a valid signed raw tx out of
// band — for example, by canonicalizing a previously-emitted high-s
// signature to its low-s equivalent.
//
// Operator-only; do not expose externally.
func (a *API) swapsInjectRawTxNative(c *zip.Ctx) error {
	id := c.Param("id")
	if id == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "missing_id"})
	}
	var req adminInjectRawTxReq
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "bad_request", "detail": err.Error()})
	}
	if req.DestRawTx == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "dest_raw_tx required"})
	}
	sw, err := a.store.Patch(c.Context(), id, func(s *Swap) {
		s.DestRawTx = req.DestRawTx
		s.DestTxHash = ""
		s.Status = SwapStatusBroadcasting
	})
	if err != nil {
		if errors.Is(err, ErrSwapNotFound) {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "not_found"})
		}
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	return c.JSON(http.StatusOK, envelope{Data: swapToServerShape(sw)})
}

// swapsResetNative answers POST /admin/swaps/:id/reset by clearing
// the swap's Signature, MPCSessionID, DestRawTx, and DestTxHash and
// transitioning Status back to bridge_transfer_pending. The signing
// driver will then re-mint the signature on the next tick. Useful
// when the destination chain rejected a previously-built raw tx
// (e.g. EIP-2 high-s canonicalization changed) and you want to
// force a re-sign without recreating the swap from scratch.
//
// This is an operator-only endpoint — it has no auth and is intended
// for local debugging. Do not expose externally.
func (a *API) swapsResetNative(c *zip.Ctx) error {
	id := c.Param("id")
	if id == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "missing_id"})
	}
	sw, err := a.store.Patch(c.Context(), id, func(s *Swap) {
		s.Status = SwapStatusBridgeTransferPending
		s.Signature = ""
		s.MPCSessionID = ""
		s.DestRawTx = ""
		s.DestTxHash = ""
	})
	if err != nil {
		if errors.Is(err, ErrSwapNotFound) {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "not_found"})
		}
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	return c.JSON(http.StatusOK, envelope{Data: swapToServerShape(sw)})
}

// swapsGetNative answers GET /v1/bridge/swaps/:id from the swap store.
func (a *API) swapsGetNative(c *zip.Ctx) error {
	id := c.Param("id")
	if id == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error":  "missing_id",
			"detail": "GET /v1/bridge/swaps/:id requires a swap id",
		})
	}
	sw, err := a.store.Get(c.Context(), id)
	if err != nil {
		if errors.Is(err, ErrSwapNotFound) {
			return c.JSON(http.StatusNotFound, map[string]string{
				"error":  "not_found",
				"detail": "no swap with id " + id,
			})
		}
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error":  "store_failed",
			"detail": err.Error(),
		})
	}
	return c.JSON(http.StatusOK, envelope{Data: swapToServerShape(sw)})
}

// rpcErrToHTTP maps a bchain.RPCError to an HTTP status + JSON envelope
// that matches what the legacy Express server emitted (preserves the
// TS SDK's existing error-handling assumptions in BridgeApiError).
func rpcErrToHTTP(c *zip.Ctx, err error, op string) error {
	if rpcErr, ok := err.(*bchain.RPCError); ok {
		status := rpcErr.HTTPStatus
		if status == 0 {
			// JSON-RPC error without HTTP context — surface as 502 so the
			// SDK can distinguish from validation 4xx.
			status = http.StatusBadGateway
		}
		return c.JSON(status, map[string]any{
			"error":  fmt.Sprintf("%s_failed", op),
			"code":   rpcErr.Code,
			"detail": rpcErr.Message,
		})
	}
	return c.JSON(http.StatusBadGateway, map[string]string{
		"error":  fmt.Sprintf("%s_failed", op),
		"detail": err.Error(),
	})
}
