package tenant

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// validMinimal returns the smallest tenant config that passes Validate.
// Tests mutate this to exercise specific failure paths without
// inheriting noise from other fields.
func validMinimal() Config {
	return Config{
		Brand: BrandConfig{
			Name: "Test Bridge",
			Slug: "test-bridge",
		},
		Network: NetworkConfig{
			ID:   96369,
			Name: "Test Mainnet",
		},
		IAM: IAMConfig{
			Endpoint:     "https://iam.example.test",
			ClientID:     "test-bridge",
			Organization: "test",
		},
		KMS: KMSConfig{
			Endpoint:    "https://kms.example.test",
			ProjectID:   "test-bridge",
			Environment: "prod",
		},
		PQProfile:       "strict-pq",
		SupportedChains: []string{"eth", "lux"},
		FeeReceiverAddr: "0x000000000000000000000000000000000000dEaD",
		Domain:          "bridge.example.test",
	}
}

func TestDefaultsApplied(t *testing.T) {
	c := validMinimal()
	c.Listen = ""
	c.NetworksConfigPath = ""
	c.PQProfile = ""
	c.Brand.Title = ""

	c.applyDefaults()

	if c.Listen != ":8080" {
		t.Errorf("Listen default: got %q want :8080", c.Listen)
	}
	if c.NetworksConfigPath != "/etc/bridge/networks.yaml" {
		t.Errorf("NetworksConfigPath default: got %q", c.NetworksConfigPath)
	}
	if c.PQProfile != "classical-compat" {
		t.Errorf("PQProfile default: got %q want classical-compat", c.PQProfile)
	}
	if c.Brand.Title != c.Brand.Name {
		t.Errorf("Brand.Title default: got %q want %q", c.Brand.Title, c.Brand.Name)
	}
}

func TestValidateOK(t *testing.T) {
	c := validMinimal()
	c.applyDefaults()
	if err := c.Validate(); err != nil {
		t.Fatalf("validMinimal must validate; got: %v", err)
	}
}

func TestPQProfileRequired(t *testing.T) {
	c := validMinimal()
	c.PQProfile = "what-even"
	c.applyDefaults()
	err := c.Validate()
	if err == nil {
		t.Fatal("invalid PQProfile must fail validation")
	}
	if !strings.Contains(err.Error(), "pqProfile:") {
		t.Errorf("error message should mention pqProfile, got: %v", err)
	}
}

func TestFeeReceiverAddrFormat(t *testing.T) {
	cases := []struct {
		name   string
		addr   string
		wantOK bool
	}{
		{"valid 0x lower", "0x1234567890abcdef1234567890abcdef12345678", true},
		{"valid 0x mixed", "0x1234567890ABCDEFabcd567890ABCDEF12345678", true},
		{"missing 0x", "1234567890abcdef1234567890abcdef12345678", false},
		{"too short", "0x1234", false},
		{"empty", "", false},
		{"not hex", "0xZZZZZZZZ234567890abcdef1234567890abcdef", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c := validMinimal()
			c.FeeReceiverAddr = tc.addr
			c.applyDefaults()
			err := c.Validate()
			if tc.wantOK && err != nil {
				t.Errorf("addr %q expected OK; got: %v", tc.addr, err)
			}
			if !tc.wantOK && err == nil {
				t.Errorf("addr %q expected validation failure; got OK", tc.addr)
			}
		})
	}
}

func TestSupportedChainsSubset(t *testing.T) {
	c := validMinimal()
	c.SupportedChains = []string{"eth", "doge"} // "doge" not in allowed set
	c.applyDefaults()
	err := c.Validate()
	if err == nil {
		t.Fatal("unknown chain family must fail validation")
	}
	if !strings.Contains(err.Error(), "doge") {
		t.Errorf("error should call out the bad value, got: %v", err)
	}
}

func TestSupportedChainsAllowedSet(t *testing.T) {
	// Every value in the spec'd allowed set must validate.
	for _, chain := range []string{"eth", "btc", "sol", "ton", "xrp", "dot", "hanzo", "zoo", "pars", "spc", "lux"} {
		t.Run(chain, func(t *testing.T) {
			c := validMinimal()
			c.SupportedChains = []string{chain}
			c.applyDefaults()
			if err := c.Validate(); err != nil {
				t.Errorf("chain %q should be allowed; got: %v", chain, err)
			}
		})
	}
}

func TestSupportedChainsEmpty(t *testing.T) {
	c := validMinimal()
	c.SupportedChains = nil
	c.applyDefaults()
	err := c.Validate()
	if err == nil || !strings.Contains(err.Error(), "supportedChains") {
		t.Errorf("empty supportedChains must fail, got: %v", err)
	}
}

func TestSupportedChainsDuplicate(t *testing.T) {
	c := validMinimal()
	c.SupportedChains = []string{"eth", "eth"}
	c.applyDefaults()
	err := c.Validate()
	if err == nil || !strings.Contains(err.Error(), "duplicate") {
		t.Errorf("duplicate chain must fail with mention of duplicate, got: %v", err)
	}
}

func TestRequiredFields(t *testing.T) {
	type mut func(*Config)
	cases := []struct {
		field string
		mut   mut
	}{
		{"brand.name", func(c *Config) { c.Brand.Name = "" }},
		{"brand.slug", func(c *Config) { c.Brand.Slug = "" }},
		{"network.id", func(c *Config) { c.Network.ID = 0 }},
		{"network.name", func(c *Config) { c.Network.Name = "" }},
		{"iam.endpoint", func(c *Config) { c.IAM.Endpoint = "" }},
		{"iam.clientID", func(c *Config) { c.IAM.ClientID = "" }},
		{"iam.organization", func(c *Config) { c.IAM.Organization = "" }},
		{"kms.endpoint", func(c *Config) { c.KMS.Endpoint = "" }},
		{"kms.projectID", func(c *Config) { c.KMS.ProjectID = "" }},
		{"feeReceiverAddr", func(c *Config) { c.FeeReceiverAddr = "" }},
		{"domain", func(c *Config) { c.Domain = "" }},
	}
	for _, tc := range cases {
		t.Run(tc.field, func(t *testing.T) {
			c := validMinimal()
			tc.mut(&c)
			c.applyDefaults()
			err := c.Validate()
			if err == nil {
				t.Fatalf("missing %s must fail validation", tc.field)
			}
			if !strings.Contains(err.Error(), tc.field) {
				t.Errorf("error should mention %s, got: %v", tc.field, err)
			}
		})
	}
}

func TestIAMEndpointMustBeHTTPS(t *testing.T) {
	c := validMinimal()
	c.IAM.Endpoint = "http://iam.example.test"
	c.applyDefaults()
	if err := c.Validate(); err == nil || !strings.Contains(err.Error(), "https://") {
		t.Errorf("http:// IAM endpoint must fail validation; got: %v", err)
	}
}

func TestKMSEndpointMustBeHTTPS(t *testing.T) {
	c := validMinimal()
	c.KMS.Endpoint = "http://kms.example.test"
	c.applyDefaults()
	if err := c.Validate(); err == nil || !strings.Contains(err.Error(), "https://") {
		t.Errorf("http:// KMS endpoint must fail validation; got: %v", err)
	}
}

func TestKMSEnvironmentValues(t *testing.T) {
	for _, env := range []string{"prod", "staging", "dev", ""} {
		t.Run("ok-"+env, func(t *testing.T) {
			c := validMinimal()
			c.KMS.Environment = env
			c.applyDefaults()
			if err := c.Validate(); err != nil {
				t.Errorf("env %q should validate; got: %v", env, err)
			}
		})
	}
	t.Run("rejects-unknown", func(t *testing.T) {
		c := validMinimal()
		c.KMS.Environment = "beta"
		c.applyDefaults()
		if err := c.Validate(); err == nil || !strings.Contains(err.Error(), "kms.environment") {
			t.Errorf("kms.environment=beta should fail; got: %v", err)
		}
	})
}

func TestMPCThresholdExceedsOperators(t *testing.T) {
	c := validMinimal()
	c.MPC.Threshold = 5
	c.MPC.Operators = []string{"alice", "bob"}
	c.applyDefaults()
	err := c.Validate()
	if err == nil || !strings.Contains(err.Error(), "threshold") {
		t.Errorf("threshold>operators should fail; got: %v", err)
	}
}

func TestSlugFormat(t *testing.T) {
	bad := []string{"Has Spaces", "UPPER", "trailing-", "-leading", "double--hyphen"}
	for _, s := range bad {
		t.Run("bad-"+s, func(t *testing.T) {
			c := validMinimal()
			c.Brand.Slug = s
			c.applyDefaults()
			if err := c.Validate(); err == nil || !strings.Contains(err.Error(), "brand.slug") {
				t.Errorf("slug %q should fail; got: %v", s, err)
			}
		})
	}
	good := []string{"a", "ab", "lux-bridge", "hanzo-bridge", "zoo-bridge", "tenant1"}
	for _, s := range good {
		t.Run("ok-"+s, func(t *testing.T) {
			c := validMinimal()
			c.Brand.Slug = s
			c.applyDefaults()
			if err := c.Validate(); err != nil {
				t.Errorf("slug %q should pass; got: %v", s, err)
			}
		})
	}
}

func TestBasketAllowlistValidation(t *testing.T) {
	c := validMinimal()
	c.BasketAllowlist = map[string][]string{
		"":    {"USDC"},
		"USD": {""},
	}
	c.applyDefaults()
	err := c.Validate()
	if err == nil {
		t.Fatal("empty basket name + empty member must fail")
	}
	for _, want := range []string{"empty basket name", "empty member symbol"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("missing %q in error: %v", want, err)
		}
	}
}

func TestBasketAllowlistOK(t *testing.T) {
	c := validMinimal()
	c.BasketAllowlist = map[string][]string{
		"USD": {"USDC", "USDT", "DAI"},
		"BTC": {"WBTC", "tBTC"},
	}
	c.applyDefaults()
	if err := c.Validate(); err != nil {
		t.Fatalf("valid basket allowlist must validate; got: %v", err)
	}
}

func TestIsChainSupported(t *testing.T) {
	c := validMinimal()
	c.SupportedChains = []string{"eth", "btc"}
	if !c.IsChainSupported("eth") {
		t.Error("eth should be supported")
	}
	if !c.IsChainSupported("ETH") {
		t.Error("case-insensitive match expected for ETH")
	}
	if c.IsChainSupported("sol") {
		t.Error("sol should not be supported")
	}
}

func TestIsBasketAllowed(t *testing.T) {
	c := validMinimal()
	c.BasketAllowlist = map[string][]string{
		"USD": {"USDC", "USDT"},
	}
	if !c.IsBasketAllowed("USD", "USDC") {
		t.Error("USDC should be allowed in USD basket")
	}
	if !c.IsBasketAllowed("USD", "usdc") {
		t.Error("case-insensitive match expected for usdc")
	}
	if c.IsBasketAllowed("USD", "ETH") {
		t.Error("ETH should not be allowed in USD basket")
	}
	if !c.IsBasketAllowed("UNSET", "ANYTHING") {
		t.Error("unconfigured basket must default to allow-all")
	}

	var nilCfg *Config
	if !nilCfg.IsBasketAllowed("USD", "USDC") {
		t.Error("nil config should default to allow-all")
	}
}

func TestParseRoundTrip(t *testing.T) {
	src := `
brand:
  name: Lux Bridge
  slug: lux-bridge
  primaryColor: "#7547ff"
  logoURL: /logo.svg
  faviconURL: /icon.svg
  docsURL: https://docs.lux.network
network:
  id: 96369
  name: Lux Mainnet
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
  dashboardURL: http://mpc-dashboard.lux-mpc.svc:8081
  operators:
    - lux-mpc-node-0
    - lux-mpc-node-1
    - lux-mpc-node-2
    - lux-mpc-node-3
    - lux-mpc-node-4
  threshold: 3
pqProfile: strict-pq
supportedChains: [eth, btc, sol, ton, xrp, dot, lux]
basketAllowlist:
  USD: [USDC, USDT, DAI]
  BTC: [WBTC]
feeReceiverAddr: "0xdEaD000000000000000000000000000000000000"
domain: bridge.lux.network
releasePool:
  evm:
    size: 10
    mintNetwork: LUX_MAINNET
    balanceThreshold: "100000000000000000"
  sol:
    size: 5
    mintNetwork: SOLANA_MAINNET
    balanceThreshold: "1000000000"
  btc:
    size: 5
    mintNetwork: BITCOIN_MAINNET
    balanceThreshold: "100000"
  xrp:
    size: 5
    mintNetwork: XRP_MAINNET
    balanceThreshold: "10000000"
  dot:
    size: 3
    mintNetwork: POLKADOT_MAINNET
    balanceThreshold: "100000000000"
  ton:
    size: 0
    mintNetwork: ""
    balanceThreshold: ""
listen: ":8080"
networksConfigPath: /etc/bridge/networks.yaml
`
	c, err := Parse([]byte(src))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if c.Brand.Name != "Lux Bridge" {
		t.Errorf("Brand.Name: got %q", c.Brand.Name)
	}
	if c.Network.ID != 96369 {
		t.Errorf("Network.ID: got %d", c.Network.ID)
	}
	if c.MPC.Threshold != 3 || len(c.MPC.Operators) != 5 {
		t.Errorf("MPC: threshold=%d operators=%d", c.MPC.Threshold, len(c.MPC.Operators))
	}
	if c.ReleasePool.EVM.Size != 10 {
		t.Errorf("ReleasePool.EVM.Size: got %d", c.ReleasePool.EVM.Size)
	}
	if !c.IsChainSupported("btc") {
		t.Errorf("expected btc in SupportedChains")
	}
	if !c.IsBasketAllowed("USD", "USDC") {
		t.Errorf("expected USDC in USD basket")
	}
}

func TestLoadMissingFile(t *testing.T) {
	_, err := Load("/nonexistent/tenant.yaml")
	if err == nil {
		t.Fatal("missing file must error")
	}
	if !errors.Is(err, os.ErrNotExist) {
		// not strictly required to be ErrNotExist but error message must contain path.
		if !strings.Contains(err.Error(), "nonexistent") {
			t.Errorf("error should mention path; got: %v", err)
		}
	}
}

func TestLoadFromDisk(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "tenant.yaml")
	src := `
brand:
  name: Test
  slug: test
network:
  id: 1
  name: Test
iam:
  endpoint: https://iam.example.test
  clientID: test
  organization: test
kms:
  endpoint: https://kms.example.test
  projectID: test
pqProfile: strict-pq
supportedChains: [eth]
feeReceiverAddr: "0x0000000000000000000000000000000000000001"
domain: bridge.example.test
`
	if err := os.WriteFile(path, []byte(src), 0o600); err != nil {
		t.Fatal(err)
	}
	c, err := Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if c.Brand.Name != "Test" {
		t.Errorf("Brand.Name: got %q", c.Brand.Name)
	}
}

func TestLoadEmptyPath(t *testing.T) {
	_, err := Load("")
	if err == nil {
		t.Fatal("empty path must error")
	}
}

func TestReleasePoolNegativeSize(t *testing.T) {
	c := validMinimal()
	c.ReleasePool.EVM.Size = -1
	c.applyDefaults()
	if err := c.Validate(); err == nil || !strings.Contains(err.Error(), "releasePool.evm.size") {
		t.Errorf("negative pool size must fail; got: %v", err)
	}
}
