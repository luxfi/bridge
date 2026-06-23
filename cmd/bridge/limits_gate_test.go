// Tests for the server-side per-swap USD limit gate (limitViolation).
// limits.minUSD/maxUSD (and per-asset Per caps) were previously display-only
// (/limits echoed config; nothing enforced it). These assert the notional
// gate now rejects out-of-bounds swaps in quoteNative + swapsCreateNative,
// including the per-asset override and fail-open on an unpriceable asset.
// See architecture_limits_not_enforced_server_side.

package main

import (
	"encoding/json"
	"net/http"
	"testing"
)

// limitsRig wires a rig whose config has all corridors enabled (so only the
// limit gate is exercised) plus a global $10–$100k band and a tighter
// per-asset USDC cap ($10–$50). Prices come from defaultPrices: ETH=$3500,
// LUX=$2.50, USDC=$1.
func limitsRig(t *testing.T) *testRig {
	t.Helper()
	rig := newRig(t, nil, nil, nil)
	rig.api.cfg = Config{
		Networks: []Network{
			{InternalName: "ETHEREUM_MAINNET", DisplayName: "Ethereum", Type: "evm", Status: "active", NativeCurrency: "ETH"},
			{InternalName: "LUX_MAINNET", DisplayName: "Lux", Type: "evm", Status: "active", NativeCurrency: "LUX"},
		},
		Tokens: []Token{
			{Asset: "ETH", Name: "Ether", Network: "ETHEREUM_MAINNET"},
			{Asset: "USDC", Name: "USD Coin", Network: "ETHEREUM_MAINNET"},
			{Asset: "LUX", Name: "Lux", Network: "LUX_MAINNET"},
		},
		Limits: Limits{
			MinUSD: 10,
			MaxUSD: 100000,
			Per:    map[string]Caps{"USDC": {MinUSD: 10, MaxUSD: 50}},
		},
	}
	return rig
}

func TestQuoteLimits(t *testing.T) {
	rig := limitsRig(t)
	const ethLux = "source_network=ETHEREUM_MAINNET&source_token=ETH&destination_network=LUX_MAINNET&destination_token=LUX&amount="
	const usdcLux = "source_network=ETHEREUM_MAINNET&source_token=USDC&destination_network=LUX_MAINNET&destination_token=LUX&amount="
	cases := []struct {
		name       string
		query      string
		wantStatus int
		wantCode   string
	}{
		{"below global min (ETH 0.001 ~ $3.50)", ethLux + "0.001", http.StatusBadRequest, "amount_below_min"},
		{"above global max (ETH 50 ~ $175k)", ethLux + "50", http.StatusBadRequest, "amount_above_max"},
		{"within global band (ETH 1 ~ $3500)", ethLux + "1", http.StatusOK, ""},
		{"per-asset cap beats global (USDC 100 > $50)", usdcLux + "100", http.StatusBadRequest, "amount_above_max"},
		{"within per-asset cap (USDC 30)", usdcLux + "30", http.StatusOK, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			status, body := fireRequest(t, rig.app, http.MethodGet, "/v1/bridge/quote?"+tc.query, nil)
			if status != tc.wantStatus {
				t.Fatalf("status = %d, want %d; body=%s", status, tc.wantStatus, body)
			}
			if tc.wantCode != "" {
				if got := errCode(t, body); got != tc.wantCode {
					t.Fatalf("error = %q, want %q; body=%s", got, tc.wantCode, body)
				}
			}
		})
	}
}

func TestCreateLimits(t *testing.T) {
	rig := limitsRig(t)

	create := func(amount float64) (int, []byte) {
		body, _ := json.Marshal(map[string]any{
			"source_network":      "ETHEREUM_MAINNET",
			"source_asset":        "ETH",
			"destination_network": "LUX_MAINNET",
			"destination_asset":   "LUX",
			"destination_address": "0x1111111111111111111111111111111111111111",
			"sender":              "0x2222222222222222222222222222222222222222",
			"amount":              amount,
			"use_deposit_address": false,
		})
		return fireRequest(t, rig.app, http.MethodPost, "/v1/bridge/swaps", body)
	}

	// Over the global max: rejected before any persist.
	status, resp := create(50) // 50 ETH ~ $175k
	if status != http.StatusBadRequest {
		t.Fatalf("over-max create: status = %d, want 400; body=%s", status, resp)
	}
	if got := errCode(t, resp); got != "amount_above_max" {
		t.Fatalf("over-max create: error = %q, want amount_above_max; body=%s", got, resp)
	}
	if got, _ := rig.store.List(t.Context(), SwapFilter{}); len(got) != 0 {
		t.Fatalf("over-max create persisted %d swap(s), want 0", len(got))
	}

	// Within band: gate passes through to a normal create.
	status, resp = create(1) // 1 ETH ~ $3500
	if status != http.StatusOK {
		t.Fatalf("in-band create: status = %d, want 200; body=%s", status, resp)
	}
}

func TestLimitViolation_FailOpenOnUnknownPrice(t *testing.T) {
	rig := limitsRig(t)
	// No price for "UNPRICED" → notional can't be computed → no violation
	// (the swap can't settle without a price anyway).
	if code, _ := rig.api.limitViolation(t.Context(), "UNPRICED", 1_000_000); code != "" {
		t.Fatalf("expected no violation for unpriced asset, got %q", code)
	}
}
