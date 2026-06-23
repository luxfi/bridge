package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/hanzoai/zip"
	"github.com/luxfi/bridge/internal/bchain"
	"github.com/luxfi/bridge/internal/cosigners"
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
	// ReleaseAddress is the destination-network MPC address from which
	// the bridge will pay the user. Surfaced for operator diagnostics
	// (e.g. faucet/funder dashboards) and for the SDK to display the
	// "paid from" leg of the release tx. Empty for swaps created
	// before the release-wallet split landed.
	ReleaseAddress string `json:"release_address,omitempty"`
	// ReceiveAmount is the destination-asset amount the bridge
	// committed to delivering at create time (snapshot of the
	// QuoteEngine output). The signing driver scales the release tx
	// value to match. Surfaced so the SDK + ops tooling can compare
	// committed vs delivered amounts after the destination tx lands.
	ReceiveAmount float64 `json:"receive_amount,omitempty"`
	Signature     string  `json:"signature,omitempty"`
	SourceTxHash   string `json:"source_tx_hash,omitempty"`
	DestTxHash     string `json:"dest_tx_hash,omitempty"`
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
	// DestinationTag is the XRPL DestinationTag (uint32) the bridge
	// will include on the on-chain Payment, if set at swap-create.
	// Echoed back on read so the SPA / SDK can render it for the user
	// (memo line: "Exchange tag: 42") and verify the value the bridge
	// will sign matches what they intended.
	DestinationTag *uint32 `json:"destination_tag,omitempty"`
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
	// Cosigners is the SDK's layered-cosigner declaration — `[{kind:
	// "utila", org_id, client_id, ...}, {kind: "fireblocks", api_key,
	// ...}]`. PUBLIC identifiers only; the bridge fetches matching
	// secrets from KMS at dispatch time. Validated at swap-create via
	// cosigners.ValidateIntents — bad shapes return HTTP 400. Stored
	// on the Swap row and consumed by the signing driver before
	// advancing the swap to broadcasting. Empty / absent → no
	// layered cosign; the native MPC quorum is the only signer.
	Cosigners []any `json:"cosigners,omitempty"`
	// DestinationTag is an optional XRPL DestinationTag (uint32) the
	// release tx carries on its Payment. Exchanges (Binance, Bitstamp,
	// etc.) require it to route deposits to a specific sub-account; if
	// the SPA picker collected one, we propagate it to the assembler
	// so the on-chain Payment includes it. Zero (or absent) ⇒ no tag
	// field on the Payment — same as a regular wallet-to-wallet send.
	// Ignored for non-XRP destinations.
	DestinationTag *uint32 `json:"destination_tag,omitempty"`
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
// assetLabel renders an asset symbol for an error detail, falling back to
// a readable phrase when the caller omitted the token (native-asset swap).
func assetLabel(asset string) string {
	if asset == "" {
		return "the native asset"
	}
	return asset
}

// corridorLeg resolves one leg of a swap — a (network, asset) pair —
// against the YAML config (a.cfg), the SAME source the
// /v1/bridge/networks picker is built from, and reports whether deposits
// and withdrawals are enabled for that leg.
//
// Semantics mirror the picker exactly: a leg is enabled only when its
// network is active, its currency is active, and the directional flag is
// on. The default-on policy for the *bool flags matches normalizeCurrency
// (a nil flag means enabled — YAML that omits the flag is enabled). An
// empty asset resolves to the network's native currency so a native-asset
// swap (token omitted) is gated as its native leg rather than slipping
// through unmatched.
//
// found is false when the pair isn't enumerated in a.cfg at all. Callers
// MUST NOT block a not-found leg: the YAML token list mirrors the SPA
// picker, not the runtime token registry (internal/tokens.DefaultRegistry),
// so a pair the YAML doesn't list may still be a legitimate runtime
// corridor — and the downstream quote/keygen already reject genuinely
// unknown ones. We gate only on a present-and-explicitly-disabled leg,
// which is precisely how an operator turns a corridor off (e.g. SOL/TON/XRP
// ship is{Deposit,Withdrawal}Enabled=false until the ed25519 signer is
// deployed). See the architecture_enable_flags_spa_gate_only memory.
func (a *API) corridorLeg(network, asset string) (deposit, withdrawal, found bool) {
	netActive := false
	for _, n := range a.cfg.Networks {
		if n.InternalName != network {
			continue
		}
		netActive = n.Status == "" || strings.EqualFold(n.Status, "active")
		if asset == "" {
			asset = n.NativeCurrency
		}
		break
	}
	if asset == "" {
		return false, false, false
	}
	for _, t := range a.cfg.Tokens {
		if t.Network != network || !strings.EqualFold(t.Asset, asset) {
			continue
		}
		active := netActive && (t.Status == "" || strings.EqualFold(t.Status, "active"))
		dep := active && (t.IsDepositEnabled == nil || *t.IsDepositEnabled)
		wd := active && (t.IsWithdrawalEnabled == nil || *t.IsWithdrawalEnabled)
		return dep, wd, true
	}
	return false, false, false
}

// corridorDisabled enforces the enable-flag gate for a swap: the source
// leg is a deposit and the destination leg is a withdrawal, so the
// corridor requires the source token's deposit flag AND the destination
// token's withdrawal flag. It returns a non-empty (code, detail) when a
// leg is present in config and explicitly disabled, and "","" when the
// corridor is allowed (or unlisted — see corridorLeg). Enforced
// server-side so a direct API caller can't bypass the SPA picker's
// client-side filter.
func (a *API) corridorDisabled(srcNet, srcAsset, dstNet, dstAsset string) (code, detail string) {
	if dep, _, found := a.corridorLeg(srcNet, srcAsset); found && !dep {
		return "source_deposit_disabled",
			fmt.Sprintf("deposits are disabled for %s on %s", assetLabel(srcAsset), srcNet)
	}
	if _, wd, found := a.corridorLeg(dstNet, dstAsset); found && !wd {
		return "destination_withdrawal_disabled",
			fmt.Sprintf("withdrawals are disabled for %s on %s", assetLabel(dstAsset), dstNet)
	}
	return "", ""
}

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

	// Enable-flag gate: refuse a quote for a corridor an operator has
	// disabled (source deposits / destination withdrawals), so the API
	// surface is consistent with swap-create and doesn't advertise prices
	// for a corridor the bridge won't settle.
	if code, detail := a.corridorDisabled(src, srcTok, dst, dstTok); code != "" {
		return c.JSON(http.StatusForbidden, map[string]string{"error": code, "detail": detail})
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
// Layered-cosigner intents (`cosigners[]`) are now honored as of the
// internal/cosigners port (see SDK v1.0.3 — "since" line in the bridge
// README). The signing driver invokes the dispatcher AFTER the native
// MPC sign and BEFORE advancing to broadcasting; any non-approved
// result fails the swap into refund_pending. Empty / absent cosigners
// keeps the legacy single-signer path.
//
// `use_teleporter` is still accepted but NOT acted on — the MPC
// pipeline supersedes teleporter dispatch (see the
// architecture_mpc_vs_teleporter memory). `app_name` is stored only
// for audit / logging.
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

	// Enable-flag gate (server-side). The source leg is a deposit and the
	// destination leg is a withdrawal, so a swap requires the source
	// token's deposit flag AND the destination token's withdrawal flag.
	// These flags live in a.cfg (the same source as /v1/bridge/networks)
	// and are how an operator turns a corridor off — e.g. SOL/TON/XRP ship
	// disabled until the ed25519 signer is deployed. Enforced here so a
	// direct API caller can't bypass the SPA picker's client-side filter
	// and mint a deposit address (or strand funds) on a corridor the
	// bridge can't settle. See architecture_enable_flags_spa_gate_only.
	if code, detail := a.corridorDisabled(req.SourceNetwork, req.SourceAsset, req.DestinationNetwork, req.DestinationAsset); code != "" {
		fmt.Printf("[swap-create-reject] %s source=%s/%s dst=%s/%s\n",
			code, req.SourceNetwork, req.SourceAsset, req.DestinationNetwork, req.DestinationAsset)
		return c.JSON(http.StatusForbidden, map[string]string{"error": code, "detail": detail})
	}

	// Validate cosigner intents up-front. ValidateIntents enforces the
	// SDK wire shape (kind discriminator, required fields per family,
	// secret-field deny-list). A malformed entry returns HTTP 400 with
	// the offending index — the SDK consumer can surface the error to
	// the developer without leaking server-side detail.
	cosignerIntents, cosignerErr := cosigners.ValidateIntents(req.Cosigners)
	if cosignerErr != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error":  "bad_cosigners",
			"detail": cosignerErr.Error(),
		})
	}

	// Step 0 — snapshot the quote.
	//
	// The QuoteEngine output (ReceiveAmount + MinReceiveAmount +
	// ServiceFee) is the source of truth for what the destination-side
	// release tx will actually pay the user. Without this snapshot the
	// signing driver would fall back to the raw input amount (sw.Amount)
	// and the destination chain would receive 0.01-units-of-native
	// regardless of source/destination price difference — i.e. 0.01 LUX
	// for a 0.01 ETH input, not the ~14 LUX the quote endpoint promised.
	//
	// We fail at create time rather than at signing time: the user has
	// already accepted a quote via GET /v1/bridge/quote, so refusing
	// to commit a fresh server-side quote here means prices flapped
	// during the round-trip — better surfaced now (the SDK can retry)
	// than silently mis-paid later.
	//
	// When a.quote is nil (test rigs that didn't wire one), the snapshot
	// is skipped and the signing driver falls back to sw.Amount —
	// preserves the pre-fix path for tests that don't exercise pricing.
	var quoteRes *QuoteResult
	if a.quote != nil {
		qr, err := a.quote.Quote(c.Context(), QuoteInput{
			Amount:             req.Amount,
			SourceNetwork:      req.SourceNetwork,
			SourceAsset:        req.SourceAsset,
			DestinationNetwork: req.DestinationNetwork,
			DestinationAsset:   req.DestinationAsset,
			Refuel:             req.Refuel,
		})
		if err != nil {
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
		quoteRes = qr
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

	// Step 1b — resolve the destination-side release wallet.
	//
	// Release wallets are long-lived (one per destination network) and
	// pay out from operator-funded liquidity. Unlike the deposit
	// wallet — which is a fresh per-swap keygen — the release wallet
	// is reused across every swap to the same destination network. The
	// store's GetOrCreate mints on first use and caches thereafter, so
	// at most one keygen per network for the lifetime of the bridge
	// process (persisted across restarts when --release-wallets-file
	// is set).
	//
	// Skipped when the release store isn't configured. The signing
	// driver's resolveReleaseSigning() falls back to the deposit
	// wallet in that case — preserves the legacy path so an operator
	// who hasn't migrated their config yet sees the old behavior
	// (which still works for any destination address the operator
	// pre-funded out of band) rather than a hard failure.
	var releaseWallet *mchain.Wallet
	if req.UseDepositAddress && a.releaseStore != nil {
		rw, err := a.releaseStore.GetOrCreate(c.Context(), req.DestinationNetwork)
		if err != nil {
			return mpcErrToHTTP(c, err, "createSwap_release")
		}
		releaseWallet = rw
	}

	// Step 2 — persist the swap. ID is assigned by the store.
	//
	// Sender resolution:
	//   - If the caller provided req.Sender, validate that it matches
	//     the SOURCE chain's address family. The refund driver will
	//     try to send source funds back to this address, so a wrong
	//     family bricks refunds (e.g. "preSign Solana refund: invalid
	//     base58 character '0'" when an EVM hex string accidentally
	//     gets used as a Solana base58 sender).
	//   - If req.Sender is empty, only fall back to DestinationAddress
	//     when source and destination are the SAME family — that's
	//     the self-bridge convention. For cross-family swaps the SPA
	//     MUST supply the source-chain sender; refuse with a clear
	//     error rather than silently substituting the wrong-family
	//     destination address.
	srcAddrType := mchain.AddressTypeFor(req.SourceNetwork)
	dstAddrType := mchain.AddressTypeFor(req.DestinationNetwork)
	// Validate destination_address matches the destination chain family.
	// The signing driver (signing_driver.go::PreSignSolana et al.) will
	// pass DestinationAddress through chain-specific encoders that reject
	// mismatched formats — e.g. an EVM hex string as the Solana recipient
	// produces "DestinationAddress: solanarpc: invalid base58 character".
	// At that point the deposit has already landed, and refund of a Lux
	// source needs a key we don't have in the stub setup, so the deposit
	// gets permanently stuck. Refuse upfront instead.
	if !addressMatchesType(req.DestinationAddress, dstAddrType) {
		fmt.Printf("[swap-create-reject] destination_wrong_chain_family destination=%s dst_addr_type=%s destination_address=%s\n",
			req.DestinationNetwork, dstAddrType, req.DestinationAddress)
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "destination_wrong_chain_family",
			"detail": fmt.Sprintf(
				"destination_address %q is not a valid %s address for destination network %s — supply a %s-formatted address (base58 for svm, 0x… for evm/lux)",
				req.DestinationAddress, dstAddrType, req.DestinationNetwork, dstAddrType,
			),
		})
	}
	sender := req.Sender
	if sender == "" {
		if srcAddrType != dstAddrType {
			fmt.Printf("[swap-create-reject] missing_source_chain_sender source=%s dst=%s dst_addr=%s\n",
				req.SourceNetwork, req.DestinationNetwork, req.DestinationAddress)
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error":  "missing_source_chain_sender",
				"detail": "sender is required for cross-family swaps so the refund leg can return source funds — falling back to destination_address would mix chains",
			})
		}
		sender = req.DestinationAddress
	} else if !addressMatchesType(sender, srcAddrType) {
		fmt.Printf("[swap-create-reject] sender_wrong_chain_family source=%s src_addr_type=%s sender=%s\n",
			req.SourceNetwork, srcAddrType, sender)
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error":  "sender_wrong_chain_family",
			"detail": fmt.Sprintf("sender %q is not a valid %s address for source network %s", sender, srcAddrType, req.SourceNetwork),
		})
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
		Cosigners:          cosignerIntents,
		DestinationTag:     req.DestinationTag,
	}
	if depositWallet != nil {
		swap.DepositAddress = depositWallet.LegacyDepositString()
		swap.DepositPubKey = depositWallet.PubKeyHex
	}
	if releaseWallet != nil {
		swap.ReleaseWalletID = releaseWallet.Name
		swap.ReleaseAddress = releaseWallet.Address
		swap.ReleasePubKey = releaseWallet.PubKeyHex
	}
	// For XRP source swaps, snapshot the deposit wallet's current
	// drops balance so depositcheck.Check can do a delta comparison.
	// mpcd's XRPL keygen reuses the long-lived release wallet's
	// r-address, so the deposit wallet usually has a non-zero starting
	// balance that would otherwise look like a confirmed deposit on
	// the first poll. Baseline failures degrade gracefully to the
	// legacy `current ≥ required` check (zero baseline).
	if srcAddrType == mchain.AddressTypeXRP && a.depcheck != nil && depositWallet != nil {
		baseCtx, cancelBase := context.WithTimeout(c.Context(), 8*time.Second)
		drops, err := a.depcheck.FetchXRPDrops(baseCtx, req.SourceNetwork, depositWallet.Address)
		cancelBase()
		if err == nil {
			swap.XRPSourceBaselineDrops = drops
		} else {
			fmt.Printf("[swap-create-warn] xrp_baseline_fetch_failed swap_pre_id=%s addr=%s err=%v (falling back to legacy current≥required check)\n",
				req.SourceNetwork, depositWallet.Address, err)
		}
	}
	// Same snapshot for TON source swaps — mpcd's V4R2 keygen has the
	// same shared-address-pool quirk as XRPL.
	if srcAddrType == mchain.AddressTypeTON && a.depcheck != nil && depositWallet != nil {
		baseCtx, cancelBase := context.WithTimeout(c.Context(), 8*time.Second)
		nano, err := a.depcheck.FetchTONNanotons(baseCtx, req.SourceNetwork, depositWallet.Address)
		cancelBase()
		if err == nil {
			swap.TONSourceBaselineNanotons = nano
		} else {
			fmt.Printf("[swap-create-warn] ton_baseline_fetch_failed swap_pre_id=%s addr=%s err=%v (falling back to legacy current≥required check)\n",
				req.SourceNetwork, depositWallet.Address, err)
		}
	}
	// Same snapshot for SOL source swaps — mpcd-single's ed25519
	// keygen has the same shared-address-pool quirk (deposit wallet
	// pubkey == long-lived SOL release wallet pubkey).
	if srcAddrType == mchain.AddressTypeSOL && a.depcheck != nil && depositWallet != nil {
		baseCtx, cancelBase := context.WithTimeout(c.Context(), 8*time.Second)
		lamports, err := a.depcheck.FetchSOLLamports(baseCtx, req.SourceNetwork, depositWallet.Address)
		cancelBase()
		if err == nil {
			swap.SOLSourceBaselineLamports = lamports
		} else {
			fmt.Printf("[swap-create-warn] sol_baseline_fetch_failed swap_pre_id=%s addr=%s err=%v (falling back to legacy current≥required check)\n",
				req.SourceNetwork, depositWallet.Address, err)
		}
	}
	if quoteRes != nil {
		swap.ReceiveAmount = quoteRes.ReceiveAmount
		swap.MinReceiveAmount = quoteRes.MinReceiveAmount
		swap.ServiceFee = quoteRes.ServiceFee
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
		ReleaseAddress:     sw.ReleaseAddress,
		ReceiveAmount:      sw.ReceiveAmount,
		Signature:          sw.Signature,
		SourceTxHash:       sw.SourceTxHash,
		DestTxHash:         sw.DestTxHash,
		DestRawTx:          sw.DestRawTx,
		LastError:          sw.LastError,
		RefundTxHash:       sw.RefundTxHash,
		DestinationTag:     sw.DestinationTag,
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
//
// JSON-RPC -32601 (method-not-found) maps to HTTP 501 Not Implemented
// because the upstream BridgeVM literally lacks the method — this is
// the back-compat path for clusters that haven't shipped LP-333 yet.
// Operators distinguish "upstream rejected" (501) from "transport / RPC
// error" (502) by HTTP code without parsing the body.
func rpcErrToHTTP(c *zip.Ctx, err error, op string) error {
	if rpcErr, ok := err.(*bchain.RPCError); ok {
		status := rpcErr.HTTPStatus
		switch {
		case status != 0:
			// HTTP-layer error from the upstream — keep its status.
		case rpcErr.Code == -32601:
			// Method not found — upstream is reachable but doesn't
			// implement the method. 501 is the right semantic.
			status = http.StatusNotImplemented
		default:
			// Other JSON-RPC error — surface as 502 so the SDK can
			// distinguish from validation 4xx.
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

// addressMatchesType reports whether addr has the textual shape of an
// address in the given chain family. Heuristic, not strict validation —
// catches the common cross-family error (sending an EVM hex where a
// Solana base58 was expected) without trying to fully validate every
// chain's address encoding. The refund driver still does protocol-
// level parsing downstream; this is a fast gate at swap-create time.
//
// btc/dot families are not yet wired through the cross-family refund
// path so we conservatively accept any non-empty string for those —
// refusing would block existing same-family flows that never hit a
// refund-family-mismatch bug.
func addressMatchesType(addr string, t mchain.AddressType) bool {
	if addr == "" {
		return false
	}
	switch t {
	case mchain.AddressTypeETH:
		return evmHexAddressRE.MatchString(addr)
	case mchain.AddressTypeSOL:
		return solBase58AddressRE.MatchString(addr)
	case mchain.AddressTypeTON:
		// User-friendly TON addresses are 48-char base64url with a
		// 2-char prefix encoding tag+workchain+network:
		//   EQ / UQ → mainnet (bounceable / non-bounceable)
		//   kQ / 0Q → testnet (bounceable / non-bounceable)
		// Raw form (workchain:hex) is also valid but we don't accept
		// it here — the SPA always submits user-friendly form.
		return tonUserFriendlyAddressRE.MatchString(addr)
	case mchain.AddressTypeXRP:
		// XRPL r-addresses: leading 'r', then 24-34 Ripple-base58
		// chars. Network-agnostic (same address valid on mainnet +
		// testnet — XRPL has no per-network prefix split). Catches
		// the common "user pasted EVM hex into XRP destination" bug.
		return xrpAddressRE.MatchString(addr)
	case mchain.AddressTypeBTC:
		// Cover the four address families across mainnet + testnet:
		//   1… / 3…              — mainnet P2PKH / P2SH (base58)
		//   m… / n… / 2…         — testnet P2PKH / P2SH (base58)
		//   bc1q… / bc1p…        — mainnet bech32 SegWit / Taproot
		//   tb1q… / tb1p…        — testnet bech32 SegWit / Taproot
		// Loose length bounds — bech32 max is 90 chars; base58 P2PKH
		// is 25 bytes ≈ 34 chars.
		return btcBech32AddressRE.MatchString(addr) ||
			btcBase58AddressRE.MatchString(addr)
	default:
		return true
	}
}

var (
	evmHexAddressRE          = regexp.MustCompile(`^0x[0-9a-fA-F]{40}$`)
	solBase58AddressRE       = regexp.MustCompile(`^[1-9A-HJ-NP-Za-km-z]{32,44}$`)
	tonUserFriendlyAddressRE = regexp.MustCompile(`^(EQ|UQ|kQ|0Q)[A-Za-z0-9_-]{46}$`)
	xrpAddressRE             = regexp.MustCompile(`^r[1-9A-HJ-NP-Za-km-z]{24,34}$`)
	btcBech32AddressRE       = regexp.MustCompile(`^(bc1|tb1)[ac-hj-np-z02-9]{6,87}$`)
	btcBase58AddressRE       = regexp.MustCompile(`^[123mn2][1-9A-HJ-NP-Za-km-z]{25,33}$`)
)
