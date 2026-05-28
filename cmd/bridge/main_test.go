package main

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/luxfi/bridge/internal/tenant"
)

// Coverage for the small helpers in main.go. The main() function itself
// isn't easily testable (it owns the process lifecycle); per-helper
// coverage is the right granularity.

var _ = reflect.DeepEqual // keep reflect imported across edits

func TestParseRPCOverrides_Happy(t *testing.T) {
	got, err := parseRPCOverrides("ETHEREUM_SEPOLIA=https://example.test/eth, BITCOIN_TESTNET=https://example.test/btc/api")
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]string{
		"ETHEREUM_SEPOLIA": "https://example.test/eth",
		"BITCOIN_TESTNET":  "https://example.test/btc/api",
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
}

func TestParseRPCOverrides_Empty(t *testing.T) {
	got, err := parseRPCOverrides("")
	if err != nil {
		t.Fatal(err)
	}
	if got != nil {
		t.Errorf("expected nil map for empty input, got %v", got)
	}
	got, err = parseRPCOverrides("   ")
	if err != nil {
		t.Fatal(err)
	}
	if got != nil {
		t.Errorf("expected nil map for whitespace input, got %v", got)
	}
}

func TestParseRPCOverrides_Malformed(t *testing.T) {
	cases := []string{
		"no_equals_here",          // no '='
		"=missing_network",        // empty key
		"NETWORK=",                // empty value
		"=",                       // both empty
		"OK=https://x, BAD",       // mix of good + bad
	}
	for _, c := range cases {
		_, err := parseRPCOverrides(c)
		if err == nil {
			t.Errorf("expected error for %q, got nil", c)
		} else if !strings.Contains(err.Error(), "malformed override") {
			t.Errorf("unexpected error for %q: %v", c, err)
		}
	}
}

func TestParseRPCOverrides_SkipsEmptyTokens(t *testing.T) {
	// Trailing comma + double comma shouldn't error.
	got, err := parseRPCOverrides("ETHEREUM_SEPOLIA=https://x,,")
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got["ETHEREUM_SEPOLIA"] != "https://x" {
		t.Errorf("unexpected: %v", got)
	}
}

func TestParseRPCOverrides_PreservesURLContainingEquals(t *testing.T) {
	// A URL with `?key=value` query string MUST round-trip — we split
	// on the FIRST '=' only.
	got, err := parseRPCOverrides("ETHEREUM_SEPOLIA=https://example.test/?apikey=secret&v=1")
	if err != nil {
		t.Fatal(err)
	}
	want := "https://example.test/?apikey=secret&v=1"
	if got["ETHEREUM_SEPOLIA"] != want {
		t.Errorf("got %q, want %q", got["ETHEREUM_SEPOLIA"], want)
	}
}

// TestTenantConfigFixture loads a complete tenant config from a
// fixture YAML on disk and asserts it parses + validates. Mirrors
// what cmd/bridge main() does on --tenant-config.
func TestTenantConfigFixture(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "tenant.yaml")
	src := []byte(`
brand:
  name: "Lux Bridge"
  slug: "lux-bridge"
  primaryColor: "#7547ff"
  logoURL: /logo.svg
  faviconURL: /icon.svg
  docsURL: https://docs.lux.network
network:
  id: 96369
  name: "Lux Mainnet"
  rpcURL: https://api.lux.network
  explorerURL: https://explorer.lux.network
iam:
  endpoint: https://lux.id
  clientID: lux-bridge
  organization: lux
kms:
  endpoint: https://kms.lux.network
  projectID: lux-bridge
  environment: prod
mpc:
  url: http://mpc.lux-mpc.svc:9800
  orgID: bridge
  threshold: 3
  operators: [n0, n1, n2, n3, n4]
pqProfile: classical-compat
supportedChains: ["eth", "btc", "sol", "ton", "xrp", "dot", "lux"]
basketAllowlist:
  USD: ["USDC", "USDT", "DAI"]
feeReceiverAddr: "0xdEaD000000000000000000000000000000000000"
domain: bridge.lux.network
releasePool:
  evm: { size: 10, mintNetwork: LUX_MAINNET, balanceThreshold: "100000000000000000" }
  sol: { size: 5,  mintNetwork: SOLANA_MAINNET, balanceThreshold: "1000000000" }
  btc: { size: 0,  mintNetwork: "",                balanceThreshold: "" }
  xrp: { size: 5,  mintNetwork: XRP_MAINNET, balanceThreshold: "10000000" }
  dot: { size: 3,  mintNetwork: POLKADOT_MAINNET, balanceThreshold: "100000000000" }
  ton: { size: 0,  mintNetwork: "", balanceThreshold: "" }
`)
	if err := os.WriteFile(path, src, 0o600); err != nil {
		t.Fatal(err)
	}
	tcfg, err := tenant.Load(path)
	if err != nil {
		t.Fatalf("tenant.Load: %v", err)
	}
	if tcfg.Brand.Slug != "lux-bridge" {
		t.Errorf("Brand.Slug = %q", tcfg.Brand.Slug)
	}
	if tcfg.Network.ID != 96369 {
		t.Errorf("Network.ID = %d", tcfg.Network.ID)
	}
	if tcfg.PQProfile != "classical-compat" {
		t.Errorf("PQProfile = %q", tcfg.PQProfile)
	}
	if !tcfg.IsChainSupported("eth") {
		t.Error("eth must be supported")
	}
	if !tcfg.IsBasketAllowed("USD", "USDC") {
		t.Error("USDC must be allowed in USD basket")
	}
}

// TestTenantExampleYAMLLoads parses the repo-root tenant.example.yaml.
// Documents the canonical shape and acts as a CI guardrail against
// drift between the schema and the example.
func TestTenantExampleYAMLLoads(t *testing.T) {
	// repo root from cmd/bridge/main_test.go.
	wd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	root := filepath.Join(wd, "..", "..", "tenant.example.yaml")
	if _, err := os.Stat(root); err != nil {
		t.Skipf("tenant.example.yaml not present at %s: %v", root, err)
	}
	tcfg, err := tenant.Load(root)
	if err != nil {
		t.Fatalf("tenant.Load(%s): %v", root, err)
	}
	if tcfg.Brand.Slug == "" {
		t.Errorf("Brand.Slug empty")
	}
	if tcfg.Network.ID == 0 {
		t.Errorf("Network.ID zero")
	}
}
