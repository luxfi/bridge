// Tests for GET /api/networks (and the /v1/bridge/networks alias).
//
// The wire contract is what the embedded SPA's useNetworks hook +
// network-mapper.ts consume: a {data: [...]} envelope of snake_case
// ApiNetwork records, each with a nested `currencies` array per the
// Token entries that joined to that network's internal_name.

package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/zap-proto/zip"
	"github.com/zap-proto/zip/middleware"
)

// =============================================================================
// Helpers
// =============================================================================

// testConfigMixed exercises every path the SPA's transformNetworks()
// filter cares about: mainnet + testnet rows, EVM + non-EVM types,
// tokens with and without contract addresses, currencies with explicit
// status overrides, and the deposit/withdrawal default-on logic.
func testConfigMixed() Config {
	disabled := false
	return Config{
		Networks: []Network{
			{
				InternalName:    "ETHEREUM_MAINNET",
				DisplayName:     "Ethereum",
				NativeCurrency:  "ETH",
				ChainID:         "1",
				Type:            "evm",
				IsTestnet:       false,
				IsFeatured:      true,
				AvgCompletion:   "5m",
				TxExplorerTpl:   "https://etherscan.io/tx/{tx}",
				AddrExplorerTpl: "https://etherscan.io/address/{addr}",
				// Status omitted on purpose — handler must default "active".
			},
			{
				InternalName:    "ETHEREUM_SEPOLIA",
				DisplayName:     "Ethereum Sepolia",
				NativeCurrency:  "ETH",
				ChainID:         "11155111",
				Type:            "evm",
				IsTestnet:       true,
				IsFeatured:      true,
				AvgCompletion:   "3m",
				TxExplorerTpl:   "https://sepolia.etherscan.io/tx/{tx}",
				AddrExplorerTpl: "https://sepolia.etherscan.io/address/{addr}",
			},
			{
				InternalName:   "LUX_TESTNET",
				DisplayName:    "Lux Testnet",
				NativeCurrency: "LUX",
				ChainID:        "96368",
				Type:           "evm",
				IsTestnet:      true,
				IsFeatured:     true,
			},
			{
				// Deliberately marked inactive — the handler does NOT
				// emit a `status` field default for empty, but it
				// preserves explicit values, and the SPA filters them.
				InternalName:   "RETIRED_NETWORK",
				DisplayName:    "Retired Net",
				NativeCurrency: "OLD",
				ChainID:        "9999",
				Type:           "evm",
				Status:         "inactive",
			},
		},
		Tokens: []Token{
			{Asset: "ETH", Name: "Ether", Decimals: 18, Network: "ETHEREUM_MAINNET"},
			{
				Asset:    "USDC",
				Name:     "USD Coin",
				Decimals: 6,
				Contract: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
				Network:  "ETHEREUM_MAINNET",
			},
			{Asset: "ETH", Name: "Ether", Decimals: 18, Network: "ETHEREUM_SEPOLIA"},
			{Asset: "LUX", Name: "Lux", Decimals: 18, Network: "LUX_TESTNET"},
			{
				// An explicitly-disabled token: the SPA must NOT see
				// deposit_enabled flipping to true by default-on policy.
				Asset:            "OLD",
				Name:             "Old",
				Decimals:         18,
				Network:          "ETHEREUM_MAINNET",
				IsDepositEnabled: &disabled,
			},
		},
	}
}

func newRigForConfig(t *testing.T, cfg Config) *zip.App {
	t.Helper()
	store := NewInMemoryStore()
	// Networks/tokens handlers don't depend on bchain — pass nil.
	api := NewAPI(cfg, "", nil, nil, nil, store)
	app := zip.New(zip.Config{AppName: "lux-bridge-net-test", DisableStartupMessage: true})
	app.Use(middleware.Recover(), middleware.RequestID())
	api.Register(app)
	return app
}

// decodeNetworks unmarshals the {data: [...]} envelope into a slice of
// generic maps so tests can assert on snake_case keys directly (rather
// than a typed Go struct that would mask key-name regressions).
func decodeNetworks(t *testing.T, body []byte) []map[string]any {
	t.Helper()
	var env struct {
		Data []map[string]any `json:"data"`
	}
	if err := json.Unmarshal(body, &env); err != nil {
		t.Fatalf("decode envelope: %v body=%s", err, body)
	}
	if env.Data == nil {
		t.Fatalf("response missing top-level data array: %s", body)
	}
	return env.Data
}

// =============================================================================
// Wire shape — snake_case + envelope
// =============================================================================

func TestNetworks_EnvelopeAndSnakeCaseKeys(t *testing.T) {
	app := newRigForConfig(t, testConfigMixed())
	status, body := fireRequest(t, app, http.MethodGet, "/api/networks", nil)
	if status != http.StatusOK {
		t.Fatalf("status=%d body=%s", status, body)
	}

	// The SPA expects the {data: [...]} envelope. A bare array would
	// fail json.data lookup in useNetworks().
	if !strings.HasPrefix(strings.TrimSpace(string(body)), `{"data":`) {
		t.Fatalf("response missing {data:...} envelope: %s", body)
	}

	rows := decodeNetworks(t, body)
	if len(rows) == 0 {
		t.Fatalf("expected at least one network, got empty array")
	}

	// Pick the first active EVM row and verify every key the
	// network-mapper looks for is present + snake_case.
	wantKeys := []string{
		"internal_name", "display_name", "native_currency",
		"is_testnet", "is_featured", "chain_id", "type",
		"average_completion_time", "transaction_explorer_template",
		"account_explorer_template", "status", "currencies",
	}
	for _, k := range wantKeys {
		if _, ok := rows[0][k]; !ok {
			t.Errorf("first network missing required field %q. row=%v", k, rows[0])
		}
	}
}

func TestNetworks_DefaultsStatusActiveWhenYAMLOmitsIt(t *testing.T) {
	app := newRigForConfig(t, testConfigMixed())
	_, body := fireRequest(t, app, http.MethodGet, "/api/networks", nil)
	rows := decodeNetworks(t, body)
	for _, row := range rows {
		if row["internal_name"] == "RETIRED_NETWORK" {
			if row["status"] != "inactive" {
				t.Errorf("explicit inactive should be preserved, got %v", row["status"])
			}
			continue
		}
		if row["status"] != "active" {
			t.Errorf("network %v: status=%v want active (default)", row["internal_name"], row["status"])
		}
	}
}

// =============================================================================
// Currencies nesting + deposit/withdrawal defaults
// =============================================================================

func TestNetworks_CurrenciesNestedByInternalName(t *testing.T) {
	app := newRigForConfig(t, testConfigMixed())
	_, body := fireRequest(t, app, http.MethodGet, "/api/networks", nil)
	rows := decodeNetworks(t, body)

	for _, row := range rows {
		if row["internal_name"] != "ETHEREUM_MAINNET" {
			continue
		}
		curs, ok := row["currencies"].([]any)
		if !ok {
			t.Fatalf("ETHEREUM_MAINNET currencies wrong shape: %T", row["currencies"])
		}
		// Three tokens were declared for ETHEREUM_MAINNET in the test
		// config: ETH, USDC, OLD. All three should be present even
		// though OLD has deposit disabled — the SPA does the
		// filtering, the API surfaces ground truth.
		if len(curs) != 3 {
			t.Fatalf("expected 3 currencies on ETHEREUM_MAINNET, got %d", len(curs))
		}
		var sawUSDC, sawOLD bool
		for _, raw := range curs {
			c := raw.(map[string]any)
			switch c["asset"] {
			case "ETH":
				if v, _ := c["is_deposit_enabled"].(bool); !v {
					t.Errorf("ETH: is_deposit_enabled should default true")
				}
				if v, _ := c["is_withdrawal_enabled"].(bool); !v {
					t.Errorf("ETH: is_withdrawal_enabled should default true")
				}
				if v, _ := c["is_refuel_enabled"].(bool); v {
					t.Errorf("ETH: is_refuel_enabled should default false")
				}
			case "USDC":
				sawUSDC = true
				if c["contract_address"] != "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" {
					t.Errorf("USDC contract_address=%v", c["contract_address"])
				}
			case "OLD":
				sawOLD = true
				if v, _ := c["is_deposit_enabled"].(bool); v {
					t.Errorf("OLD: is_deposit_enabled should be false (explicit override)")
				}
				if v, _ := c["is_withdrawal_enabled"].(bool); !v {
					t.Errorf("OLD: is_withdrawal_enabled should default true (not overridden)")
				}
			}
		}
		if !sawUSDC || !sawOLD {
			t.Errorf("missing currency rows: sawUSDC=%v sawOLD=%v", sawUSDC, sawOLD)
		}
		return
	}
	t.Errorf("ETHEREUM_MAINNET row missing from response")
}

func TestNetworks_NoTokensRendersEmptyCurrenciesArray(t *testing.T) {
	// LUX_TESTNET in testConfigMixed has one token (LUX). Build a
	// fresh config with a network that has NO matching tokens — the
	// SPA still expects `currencies` to be present, just empty.
	cfg := Config{
		Networks: []Network{
			{
				InternalName:   "ORPHAN_NET",
				DisplayName:    "Orphan",
				NativeCurrency: "ORP",
				ChainID:        "1234",
				Type:           "evm",
			},
		},
	}
	app := newRigForConfig(t, cfg)
	_, body := fireRequest(t, app, http.MethodGet, "/api/networks", nil)
	rows := decodeNetworks(t, body)
	if len(rows) != 1 {
		t.Fatalf("expected 1 row, got %d. body=%s", len(rows), body)
	}
	curs, ok := rows[0]["currencies"]
	if !ok {
		t.Fatalf("response missing currencies field on orphan network: %s", body)
	}
	if curs == nil {
		// JSON null is not OK — the SPA does `net.currencies ?? []`
		// but a wrong shape (object instead of array) would crash.
		// Confirm it's an empty array, not null.
		t.Fatalf("currencies is nil; want empty array. body=%s", body)
	}
	if got, _ := curs.([]any); got == nil {
		t.Fatalf("currencies wrong type %T. body=%s", curs, body)
	}
}

// =============================================================================
// ?version filter
// =============================================================================

func TestNetworks_VersionTestnetFiltersToTestnetOnly(t *testing.T) {
	app := newRigForConfig(t, testConfigMixed())
	_, body := fireRequest(t, app, http.MethodGet, "/api/networks?version=testnet", nil)
	rows := decodeNetworks(t, body)
	if len(rows) == 0 {
		t.Fatalf("testnet filter returned 0 rows. body=%s", body)
	}
	for _, row := range rows {
		isTestnet, _ := row["is_testnet"].(bool)
		if !isTestnet {
			t.Errorf("non-testnet row leaked through filter: %v", row["internal_name"])
		}
	}

	// Spot-check both expected testnet rows present.
	names := map[string]bool{}
	for _, row := range rows {
		names[row["internal_name"].(string)] = true
	}
	for _, want := range []string{"ETHEREUM_SEPOLIA", "LUX_TESTNET"} {
		if !names[want] {
			t.Errorf("testnet filter missing %s. got=%v", want, names)
		}
	}
}

func TestNetworks_VersionMainnetExcludesTestnet(t *testing.T) {
	app := newRigForConfig(t, testConfigMixed())
	_, body := fireRequest(t, app, http.MethodGet, "/api/networks?version=mainnet", nil)
	rows := decodeNetworks(t, body)
	for _, row := range rows {
		if isTestnet, _ := row["is_testnet"].(bool); isTestnet {
			t.Errorf("mainnet filter leaked testnet row: %v", row["internal_name"])
		}
	}
}

func TestNetworks_NoVersionParamReturnsAllRows(t *testing.T) {
	app := newRigForConfig(t, testConfigMixed())
	_, body := fireRequest(t, app, http.MethodGet, "/api/networks", nil)
	rows := decodeNetworks(t, body)
	// 4 declared networks; none filtered without ?version.
	if len(rows) != 4 {
		t.Fatalf("expected 4 rows without version filter, got %d", len(rows))
	}
}

// =============================================================================
// Alias parity — /api/networks ≡ /v1/bridge/networks
// =============================================================================

func TestNetworks_ApiAliasMatchesV1Bridge(t *testing.T) {
	app := newRigForConfig(t, testConfigMixed())

	statusA, bodyA := fireRequest(t, app, http.MethodGet, "/api/networks?version=testnet", nil)
	statusV, bodyV := fireRequest(t, app, http.MethodGet, "/v1/bridge/networks?version=testnet", nil)
	if statusA != http.StatusOK || statusV != http.StatusOK {
		t.Fatalf("statuses api=%d v1=%d", statusA, statusV)
	}
	if string(bodyA) != string(bodyV) {
		t.Fatalf("/api/networks and /v1/bridge/networks differ:\napi=%s\nv1=%s", bodyA, bodyV)
	}
}
