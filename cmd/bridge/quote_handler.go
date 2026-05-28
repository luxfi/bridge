// Copyright (C) 2019-2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

package main

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/hanzoai/zip"
	"github.com/luxfi/bridge/internal/bchain"
)

// quote_handler.go: thin REST → JSON-RPC pass-through for /v1/bridge/quote.
//
// The bridge is permissionless and non-custodial: the authoritative
// quote engine lives in chains/bridgevm (the B-Chain VM that the
// validator quorum runs collectively). The daemon does NOT replicate
// settlement math here — it would be a centralization vector if it did.
// This handler is the only daemon-side quote code, and it does exactly
// one thing: translate the SDK's REST request into a JSON-RPC call
// against the B-Chain, then map the response back to the legacy
// ServerQuote envelope so the TS SDK works unchanged.
//
// When the operator runs without --bchain-url (no B-Chain RPC
// reachable), the route is not registered — there is no fallback to a
// daemon-local quote engine, because permissionless bridges never let
// any single daemon be the source of truth on what a swap is worth.

// quoteNative answers GET /v1/bridge/quote by calling bridge_estimateFee
// on the configured B-Chain RPC. The on-wire ServerQuote envelope is
// preserved verbatim so the TS SDK consumes it unchanged.
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
	if _, err := strconv.ParseFloat(amt, 64); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error":  "bad_amount",
			"detail": "amount must be a positive number",
		})
	}

	if a.bchain == nil {
		return c.JSON(http.StatusServiceUnavailable, map[string]string{
			"error":  "bchain_unavailable",
			"detail": "set --bchain-url to enable native quotes (B-Chain is the source of truth)",
		})
	}

	est, err := a.bchain.EstimateFee(c.Context(), bchain.EstimateFeeParams{
		SourceChain: src,
		DestChain:   dst,
		SourceAsset: srcTok,
		DestAsset:   dstTok,
		Amount:      amt,
		Refuel:      refuel,
	})
	if err != nil {
		return rpcErrToHTTP(c, err, "estimateFee")
	}
	return c.JSON(http.StatusOK, envelope{Data: map[string]any{
		"quote":  feeEstimateToServerQuote(est),
		"refuel": nil,
		"reward": struct{}{},
	}})
}

// feeEstimateToServerQuote adapts the b-chain FeeEstimate to the wire
// shape the SDK consumes. The chain emits stringified bigint amounts
// (the canonical bridge wire encoding); the SDK works with float64. We
// parse defensively — when the chain returns an unparseable value we
// surface 0, which the SDK already handles as "quote unavailable" via
// its existing min_receive_amount guard.
func feeEstimateToServerQuote(est *bchain.FeeEstimate) serverQuote {
	net := parseAmount(est.NetAmount)
	fee := parseAmount(est.FeeAmount)
	min := net * (1 - DefaultSlippage)
	return serverQuote{
		ReceiveAmount:    net,
		MinReceiveAmount: min,
		ServiceFee:       fee,
		TotalFee:         fee,
		Slippage:         DefaultSlippage,
		AvgCompletion:    DefaultAvgCompletion,
	}
}

// DefaultSlippage is the min-receive ratio the SDK applies (2.5%).
// Surfaces in the envelope so SDK UI shows the right number; the
// chain-side quote engine applies the same constant internally.
const DefaultSlippage = 0.025

// DefaultAvgCompletion is the avg_completion_time string the SDK
// renders when the chain doesn't supply one.
const DefaultAvgCompletion = "00:03:00"

// parseAmount best-effort-parses a stringified amount. Empty / invalid
// → 0. The chain emits these as decimal strings (not hex, not
// scientific notation), so a single ParseFloat round-trip is enough.
func parseAmount(s string) float64 {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0
	}
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0
	}
	return v
}
