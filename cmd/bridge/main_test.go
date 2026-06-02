package main

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/luxfi/bridge"
	"github.com/luxfi/bridge/internal/mchain"
	"github.com/luxfi/bridge/pkg/tenant"
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
		"no_equals_here",    // no '='
		"=missing_network",  // empty key
		"NETWORK=",          // empty value
		"=",                 // both empty
		"OK=https://x, BAD", // mix of good + bad
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

// =============================================================================
// Profile → ProtocolFor wiring (PR z/main-protocol-profile)
// =============================================================================

func TestProtocolForScheme_KnownPQ(t *testing.T) {
	cases := []struct {
		scheme string
		want   mchain.Protocol
	}{
		{bridge.SchemePulsarM65, mchain.ProtocolPulsarM65},
		{bridge.SchemePulsarM87, mchain.ProtocolPulsarM87},
		{bridge.SchemeBLS12381, mchain.ProtocolDefault},
		{bridge.SchemeMLDSA65, mchain.ProtocolDefault}, // ml-dsa is a signature, not a threshold-MPC protocol — daemon dispatch
		{"unknown-scheme", mchain.ProtocolDefault},
		{"", mchain.ProtocolDefault},
	}
	for _, tc := range cases {
		if got := protocolForScheme(tc.scheme); got != tc.want {
			t.Errorf("protocolForScheme(%q) = %q, want %q", tc.scheme, got, tc.want)
		}
	}
}

func TestProfileProtocolFor_StrictPQReturnsPulsar(t *testing.T) {
	p := bridge.LuxStrictPQBridgeProfile
	fn := profileProtocolFor(&p)
	if fn == nil {
		t.Fatal("strict-pq profile must produce a non-nil ProtocolFor")
	}
	if got := fn(mchain.CurveSecp256k1); got != mchain.ProtocolPulsarM65 {
		t.Errorf("strict-pq + secp256k1: got %q, want pulsar-m-65", got)
	}
	// Curve hint MUST be ignored under strict-pq today — the profile
	// pins one protocol for every curve. A future per-curve profile
	// will revisit this; for now, all curves route to the same PQ slot.
	if got := fn(mchain.CurveEd25519); got != mchain.ProtocolPulsarM65 {
		t.Errorf("strict-pq + ed25519: got %q, want pulsar-m-65 (curve-agnostic under strict-pq)", got)
	}
}

func TestProfileProtocolFor_ClassicalReturnsNil(t *testing.T) {
	// ClassicalCompat's SourceFinalityScheme is bls12-381 — not a PQ
	// threshold protocol. profileProtocolFor returns nil so the driver
	// skips the upgrade path entirely and curve-dispatch wins.
	p := bridge.BridgeClassicalCompat
	if fn := profileProtocolFor(&p); fn != nil {
		t.Errorf("classical-compat must produce nil ProtocolFor (got non-nil); upgrade path must stay off")
	}
}

func TestProfileProtocolFor_NilProfile(t *testing.T) {
	if fn := profileProtocolFor(nil); fn != nil {
		t.Errorf("nil profile must produce nil ProtocolFor")
	}
}

func TestProtocolForLabel(t *testing.T) {
	strict := bridge.LuxStrictPQBridgeProfile
	classical := bridge.BridgeClassicalCompat
	cases := []struct {
		name string
		p    *bridge.BridgeProfile
		want string
	}{
		{"strict-pq", &strict, "pulsar-m-65"},
		{"classical-compat", &classical, "default"},
		{"nil", nil, "default"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := protocolForLabel(tc.p); got != tc.want {
				t.Errorf("protocolForLabel = %q, want %q", got, tc.want)
			}
		})
	}
}
