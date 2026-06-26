package main

import "testing"

// TestGate_NonEVMDefaultDeny_ClosesVariantBypass pins the red HIGH: the gate
// lookup key (network, asset) must align with the signer's routing key (network
// only, case-folded). Before the fix, an asset-case variant ("xrp"), an empty
// asset, or a network-case variant ("bitcoin_testnet") missed the exact row and
// fell through to the old default-ON — dodging an isWithdrawalEnabled:false gate
// while routing still reached the release pool. Now: case-insensitive match +
// default-DENY for wired non-EVM families.
func TestGate_NonEVMDefaultDeny_ClosesVariantBypass(t *testing.T) {
	yes, no := true, false
	cfg := Config{Tokens: []Token{
		{Network: "XRP_MAINNET", Asset: "XRP", IsDepositEnabled: &yes, IsWithdrawalEnabled: &no},
		{Network: "BITCOIN_TESTNET", Asset: "BTC", IsDepositEnabled: &yes, IsWithdrawalEnabled: &no},
		{Network: "XRP_TESTNET", Asset: "XRP", IsDepositEnabled: &yes, IsWithdrawalEnabled: &yes},
	}}

	deny := func(got bool, what string) {
		t.Helper()
		if got {
			t.Errorf("%s must be DENIED", what)
		}
	}
	allow := func(got bool, what string) {
		t.Helper()
		if !got {
			t.Errorf("%s must be ALLOWED", what)
		}
	}

	// Asset-case variance must still match the disabled row (not dodge it).
	deny(cfg.WithdrawalEnabled("XRP_MAINNET", "xrp"), "lowercase asset 'xrp' on disabled XRP_MAINNET")
	// Empty / whitespace asset on a non-EVM family: no row -> default-deny.
	deny(cfg.WithdrawalEnabled("XRP_MAINNET", ""), "empty asset on non-EVM XRP_MAINNET")
	deny(cfg.WithdrawalEnabled("XRP_MAINNET", "XRP "), "trailing-space asset on non-EVM XRP_MAINNET")
	// Network-case variance must match the disabled BTC row.
	deny(cfg.WithdrawalEnabled("bitcoin_testnet", "BTC"), "lowercase network 'bitcoin_testnet'")
	// Unconfigured non-EVM family: default-deny both legs.
	deny(cfg.WithdrawalEnabled("SOLANA_MAINNET", "SOL"), "unconfigured SOLANA_MAINNET withdrawal")
	deny(cfg.DepositEnabled("TON_MAINNET", "TON"), "unconfigured TON_MAINNET deposit")

	// Explicitly-enabled non-EVM stays enabled, even under case variance.
	allow(cfg.WithdrawalEnabled("xrp_testnet", "xrp"), "explicitly-enabled XRP_TESTNET under case variance")
	allow(cfg.DepositEnabled("XRP_MAINNET", "XRP"), "XRP_MAINNET deposit (explicit true)")

	// EVM stays default-ON (no row needed) — no regression.
	allow(cfg.WithdrawalEnabled("ETHEREUM_MAINNET", "ETH"), "EVM ETH withdrawal default-on")
	allow(cfg.DepositEnabled("ETHEREUM_MAINNET", "USDC"), "EVM USDC deposit default-on")

	// An explicit EVM false still suppresses.
	cfg2 := Config{Tokens: []Token{{Network: "ETHEREUM_MAINNET", Asset: "ETH", IsWithdrawalEnabled: &no}}}
	deny(cfg2.WithdrawalEnabled("ETHEREUM_MAINNET", "ETH"), "explicit EVM isWithdrawalEnabled:false")
}
