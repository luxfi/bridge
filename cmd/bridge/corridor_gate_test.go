// Tests for the server-side corridor enable-flag gate (corridorLeg /
// corridorDisabled). The gate enforces is_deposit_enabled (source leg) and
// is_withdrawal_enabled (destination leg) in quoteNative + swapsCreateNative
// so a direct API caller can't bypass the SPA picker's client-side filter
// and act on a corridor an operator has disabled (e.g. SOL/TON/XRP before
// the ed25519 signer is deployed). See architecture_enable_flags_spa_gate_only.

package main

import (
	"encoding/json"
	"net/http"
	"testing"
)

// gbool returns a pointer to b, for the *bool enable flags in test config.
func gbool(b bool) *bool { return &b }

// gateCfg exercises every branch of the gate: ETH explicitly enabled, LUX
// enabled via nil flags (default-on path), SOL deposits+withdrawals
// disabled (the Phase-1 ed25519 posture). BSC is intentionally absent so
// the "unlisted corridor is not blocked" policy can be asserted.
func gateCfg() Config {
	return Config{
		Networks: []Network{
			{InternalName: "ETHEREUM_MAINNET", DisplayName: "Ethereum", Type: "evm", Status: "active", NativeCurrency: "ETH"},
			{InternalName: "LUX_MAINNET", DisplayName: "Lux", Type: "evm", Status: "active", NativeCurrency: "LUX"},
			{InternalName: "SOLANA_MAINNET", DisplayName: "Solana", Type: "solana", Status: "active", NativeCurrency: "SOL"},
		},
		Tokens: []Token{
			{Asset: "ETH", Name: "Ether", Network: "ETHEREUM_MAINNET", IsDepositEnabled: gbool(true), IsWithdrawalEnabled: gbool(true)},
			{Asset: "LUX", Name: "Lux", Network: "LUX_MAINNET"}, // nil flags -> default-on
			{Asset: "SOL", Name: "Solana", Network: "SOLANA_MAINNET", IsDepositEnabled: gbool(false), IsWithdrawalEnabled: gbool(false)},
		},
	}
}

// gateRig is a rig wired with gateCfg so the enable-flag gate is live.
func gateRig(t *testing.T) *testRig {
	t.Helper()
	rig := newRig(t, nil, nil, nil)
	rig.api.cfg = gateCfg()
	return rig
}

func errCode(t *testing.T, body []byte) string {
	t.Helper()
	var e struct {
		Error string `json:"error"`
	}
	_ = json.Unmarshal(body, &e)
	return e.Error
}

func TestQuoteGate_DisabledCorridorRefused(t *testing.T) {
	rig := gateRig(t)
	cases := []struct {
		name, query, wantCode string
	}{
		{
			"destination withdrawal disabled (LUX->SOL)",
			"source_network=LUX_MAINNET&source_token=LUX&destination_network=SOLANA_MAINNET&destination_token=SOL&amount=10",
			"destination_withdrawal_disabled",
		},
		{
			"source deposit disabled (SOL->LUX)",
			"source_network=SOLANA_MAINNET&source_token=SOL&destination_network=LUX_MAINNET&destination_token=LUX&amount=10",
			"source_deposit_disabled",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			status, body := fireRequest(t, rig.app, http.MethodGet, "/v1/bridge/quote?"+tc.query, nil)
			if status != http.StatusForbidden {
				t.Fatalf("status = %d, want 403; body=%s", status, body)
			}
			if got := errCode(t, body); got != tc.wantCode {
				t.Fatalf("error = %q, want %q; body=%s", got, tc.wantCode, body)
			}
		})
	}
}

func TestQuoteGate_EnabledCorridorAllowed(t *testing.T) {
	rig := gateRig(t)
	cases := []struct {
		name, query string
	}{
		{"both explicitly enabled (ETH->LUX dest is default-on)", "source_network=ETHEREUM_MAINNET&source_token=ETH&destination_network=LUX_MAINNET&destination_token=LUX&amount=1"},
		{"source default-on (LUX->ETH)", "source_network=LUX_MAINNET&source_token=LUX&destination_network=ETHEREUM_MAINNET&destination_token=ETH&amount=1000"},
		{"unlisted corridor not blocked (BSC->LUX)", "source_network=BSC_MAINNET&source_token=BNB&destination_network=LUX_MAINNET&destination_token=LUX&amount=1"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			status, body := fireRequest(t, rig.app, http.MethodGet, "/v1/bridge/quote?"+tc.query, nil)
			if status != http.StatusOK {
				t.Fatalf("status = %d, want 200; body=%s", status, body)
			}
		})
	}
}

func TestCreateGate_DisabledCorridorRefused(t *testing.T) {
	rig := gateRig(t)
	cases := []struct {
		name, srcNet, srcAsset, dstNet, dstAsset, dstAddr, wantCode string
	}{
		{
			"destination withdrawal disabled (LUX->SOL)",
			"LUX_MAINNET", "LUX", "SOLANA_MAINNET", "SOL",
			"So11111111111111111111111111111111111111112",
			"destination_withdrawal_disabled",
		},
		{
			"source deposit disabled (SOL->LUX)",
			"SOLANA_MAINNET", "SOL", "LUX_MAINNET", "LUX",
			"0x1111111111111111111111111111111111111111",
			"source_deposit_disabled",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			body, _ := json.Marshal(map[string]any{
				"source_network":      tc.srcNet,
				"source_asset":        tc.srcAsset,
				"destination_network": tc.dstNet,
				"destination_asset":   tc.dstAsset,
				"destination_address": tc.dstAddr,
				"amount":              10,
				"use_deposit_address": false,
			})
			status, resp := fireRequest(t, rig.app, http.MethodPost, "/v1/bridge/swaps", body)
			if status != http.StatusForbidden {
				t.Fatalf("status = %d, want 403; body=%s", status, resp)
			}
			if got := errCode(t, resp); got != tc.wantCode {
				t.Fatalf("error = %q, want %q; body=%s", got, tc.wantCode, resp)
			}
			// The gate must fire before any swap row is persisted.
			got, err := rig.store.List(t.Context(), SwapFilter{})
			if err != nil {
				t.Fatalf("store.List: %v", err)
			}
			if len(got) != 0 {
				t.Fatalf("blocked create persisted %d swap(s), want 0", len(got))
			}
		})
	}
}

func TestCreateGate_EnabledCorridorAllowed(t *testing.T) {
	rig := gateRig(t)
	body, _ := json.Marshal(map[string]any{
		"source_network":      "ETHEREUM_MAINNET",
		"source_asset":        "ETH",
		"destination_network": "LUX_MAINNET",
		"destination_asset":   "LUX",
		"destination_address": "0x1111111111111111111111111111111111111111",
		"sender":              "0x2222222222222222222222222222222222222222",
		"amount":              1,
		"use_deposit_address": false,
	})
	status, resp := fireRequest(t, rig.app, http.MethodPost, "/v1/bridge/swaps", body)
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200 (gate must pass enabled corridor); body=%s", status, resp)
	}
}
