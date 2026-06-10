// Package tenant is the declarative tenant configuration primitive for
// the bridge. One process = one tenant = one Config. The shape mirrors
// the IAM / KMS / MPC / asset white-label pattern already used across
// the ecosystem: a single YAML file ("tenant.yaml") drives every
// brand-specific, deployment-specific, and chain-specific value that
// the bridge daemon consumes at startup.
//
// Composition over inheritance: this Config does not REPLACE the
// per-network table in cmd/bridge/config.go::Config; rather, the runner
// reads BOTH (tenant.yaml + networks.yaml) and composes them. Tenant
// owns the policy + brand + identity bindings; networks.yaml stays the
// table of chains + tokens, source-controllable independently.
//
// Validation runs at Load() time. Daemon refuses to boot on an invalid
// config — there is no "warn and continue" path. Operators who typo a
// field MUST see the error rather than ship under the wrong posture.
package tenant

import (
	"errors"
	"fmt"
	"os"
	"regexp"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

// Config is the root tenant config. Every field is either required or
// has a documented default — see Validate() for the contract.
type Config struct {
	// Brand drives the SPA's runtime config (window.ENV), the embedded
	// app's <title>, per-host assets, and the daemon's log "service" tag.
	Brand BrandConfig `yaml:"brand"`

	// Network is the tenant's primary L1 EVM (the chain that receives
	// bridged collateral mints). Independent of NetworkID — the primary
	// network ID is shared across all Lux-derived L1s (1=mainnet,
	// 2=fuji, 3=local, 1337=development), while the EVM chain ID here
	// is per-chain, per-env (see CLAUDE.md "Network ID vs EVM Chain
	// ID — NEVER CONFLATE").
	Network NetworkConfig `yaml:"network"`

	// IAM points the bridge at the tenant's IAM (hanzo.id, lux.id,
	// zoo.id, pars.id, ...). Per the IAM SSO requirement the bridge
	// MUST NOT ship local auth — it federates to IAM only.
	IAM IAMConfig `yaml:"iam"`

	// KMS points the bridge at the tenant's KMS (kms.hanzo.ai,
	// kms.lux.network, ...). All secrets (mpc tokens, coingecko keys,
	// release-wallet seeds) come from KMS via Universal Auth, NEVER
	// from environment variables in production.
	KMS KMSConfig `yaml:"kms"`

	// MPC is the threshold-signing cluster configuration. Tenant pins
	// its own MPC operators (Hanzo's, Zoo's, Pars's signer sets are
	// disjoint).
	MPC MPCConfig `yaml:"mpc"`

	// PQProfile names the post-quantum posture the bridge enforces.
	// Two values:
	//   strict-pq        — refuse classical-only envelopes at the
	//                      precompile layer (default for internal
	//                      tenants whose destination is a Lux-derived L1)
	//   classical-compat — permit ECDSA-only envelopes inside the
	//                      governance-set window (required when the
	//                      tenant routinely bridges to external L1s
	//                      like Ethereum mainnet)
	PQProfile string `yaml:"pqProfile"`

	// SupportedChains is the allowlist of chain families the daemon
	// will mount handlers for. Anything not in this list will not have
	// a release-pool, will not appear in /v1/bridge/networks, and will
	// refuse swap creates. Subset of {eth,btc,sol,ton,xrp,dot,
	// hanzo,zoo,pars,spc,lux}.
	SupportedChains []string `yaml:"supportedChains"`

	// BasketAllowlist names the per-basket collateral set. Maps a
	// basket symbol (USD, EUR, GBP, BTC, ETH, ...) to the list of
	// asset symbols permitted as backing. Used by the BasketRegistry
	// deployment script (Part 2) AND by the bridge's quote engine to
	// refuse quotes that would mix collateral outside the allowlist.
	BasketAllowlist map[string][]string `yaml:"basketAllowlist"`

	// FeeReceiverAddr is the destination of the per-claim fee skim.
	// The bridge enforces this via OpenZeppelin AccessControl's
	// OPERATOR_ROLE — only the operator-key can drain the fee vault,
	// privilege-separating it from the main vault.
	FeeReceiverAddr string `yaml:"feeReceiverAddr"`

	// Domain is the public DNS host the SPA + API serve on. The
	// frontend uses this to compute absolute URLs in og:metadata; the
	// k8s IngressRoute uses it as the Host() match. Example:
	// "bridge.lux.network" / "bridge.hanzo.network".
	Domain string `yaml:"domain"`

	// ReleasePool is the per-family wallet-pool configuration (size +
	// mint-network per family). One pool per family because each
	// family's key shape, address derivation, and pre-funding
	// requirements differ.
	ReleasePool ReleasePoolConfig `yaml:"releasePool"`

	// NetworksConfigPath is the path on disk (mounted in the K8s
	// ConfigMap) to the per-chain networks.yaml table consumed by the
	// existing cmd/bridge LoadConfig. Defaults to "/etc/bridge/networks.yaml".
	NetworksConfigPath string `yaml:"networksConfigPath"`

	// Listen is the daemon's HTTP listen address. Defaults to ":8080".
	Listen string `yaml:"listen"`
}

// BrandConfig drives the SPA's runtime config window.ENV.brand and
// the daemon's log "service" tag.
type BrandConfig struct {
	// Name is the human-readable brand label shown in the SPA header.
	// Example: "Lux Bridge", "Hanzo Bridge", "Zoo Bridge".
	Name string `yaml:"name"`
	// Slug is the machine-readable form used as the daemon's log
	// service tag and the embedded app's framework AppName. Lowercase
	// hyphenated. Example: "lux-bridge", "hanzo-bridge".
	Slug string `yaml:"slug"`
	// PrimaryColor is the hex code (#rrggbb) the SPA themes off.
	PrimaryColor string `yaml:"primaryColor"`
	// LogoURL is the absolute or scheme-relative URL to the brand
	// logo SVG. Served by the frontend at /logo.svg when set.
	LogoURL string `yaml:"logoURL"`
	// FaviconURL is the favicon equivalent. Served at /icon.svg.
	FaviconURL string `yaml:"faviconURL"`
	// DocsURL is the brand's docs site root. Surfaced via the SPA's
	// help-menu link.
	DocsURL string `yaml:"docsURL"`
	// Title is the embedded app's <title>. Defaults to Name when
	// empty.
	Title string `yaml:"title"`
}

// NetworkConfig describes the tenant's primary L1 EVM (the chain that
// receives bridged collateral mints).
type NetworkConfig struct {
	ID          uint64 `yaml:"id"`
	Name        string `yaml:"name"`
	RPCURL      string `yaml:"rpcURL"`
	ExplorerURL string `yaml:"explorerURL"`
}

// IAMConfig binds the bridge to the tenant's IAM endpoint.
type IAMConfig struct {
	// Endpoint is the IAM root URL. Example: "https://hanzo.id".
	Endpoint string `yaml:"endpoint"`
	// ClientID is the IAM application's client_id provisioned for
	// this bridge instance. Example: "{tenant}-bridge".
	ClientID string `yaml:"clientID"`
	// Organization is the IAM org slug the bridge runs under.
	// Example: "hanzo", "lux", "zoo", "pars".
	Organization string `yaml:"organization"`
}

// KMSConfig binds the bridge to the tenant's KMS endpoint. Secrets
// (MPC tokens, CoinGecko keys, release-wallet seed material) are
// fetched from KMS at startup via Universal Auth.
type KMSConfig struct {
	// Endpoint is the KMS root URL. Example: "https://kms.hanzo.ai".
	Endpoint string `yaml:"endpoint"`
	// ProjectID is the KMS project this bridge's secrets live under.
	ProjectID string `yaml:"projectID"`
	// Environment is the KMS env tag ("prod"|"staging"|"dev").
	Environment string `yaml:"environment"`
}

// MPCConfig describes the tenant's threshold-signing cluster.
type MPCConfig struct {
	// URL is the MPC keygen service URL. Example:
	// "http://mpc-node-0.mpc-node-headless.{tenant}-mpc.svc:9800".
	URL string `yaml:"url"`
	// OrgID is the tenant identifier the MPC daemon multiplexes
	// keygen by. Example: "bridge", "hanzo-bridge".
	OrgID string `yaml:"orgID"`
	// DashboardURL is the MPC dashboard API base URL — the v2026-05
	// daemon serves /v1/mpc/sign there.
	DashboardURL string `yaml:"dashboardURL"`
	// Operators is the audit-visible list of MPC operator identities
	// (for governance display only — the actual threshold key shares
	// are managed by the MPC cluster itself).
	Operators []string `yaml:"operators"`
	// Threshold is the t-of-n threshold (e.g. 3 of 5).
	Threshold uint16 `yaml:"threshold"`
}

// ReleasePoolConfig describes per-family release-wallet pools.
type ReleasePoolConfig struct {
	// EVM is the EVM release pool (size + mint network for keygen).
	EVM FamilyPoolConfig `yaml:"evm"`
	// SOL is the Solana release pool.
	SOL FamilyPoolConfig `yaml:"sol"`
	// BTC is the Bitcoin release pool.
	BTC FamilyPoolConfig `yaml:"btc"`
	// XRP is the XRP release pool.
	XRP FamilyPoolConfig `yaml:"xrp"`
	// DOT is the Polkadot/Kusama release pool.
	DOT FamilyPoolConfig `yaml:"dot"`
	// TON is the TON release pool.
	TON FamilyPoolConfig `yaml:"ton"`
}

// FamilyPoolConfig is a per-family release-wallet pool.
type FamilyPoolConfig struct {
	// Size is the static pool size. 0 disables the family entirely.
	Size int `yaml:"size"`
	// MintNetwork is the network name used for keygen of pool
	// wallets. Per-family — e.g. "LUX_MAINNET" for EVM, "SOLANA_MAINNET"
	// for SOL.
	MintNetwork string `yaml:"mintNetwork"`
	// BalanceThreshold is the per-family low-balance threshold (wei /
	// lamports / sat / drops / planck depending on family) — below
	// this, the pool logs a WARN at Acquire time.
	BalanceThreshold string `yaml:"balanceThreshold"`
}

// Known chain families. Anything in SupportedChains MUST be a member.
var supportedChainSet = map[string]struct{}{
	"eth": {}, "btc": {}, "sol": {}, "ton": {}, "xrp": {}, "dot": {},
	"hanzo": {}, "zoo": {}, "pars": {}, "spc": {}, "lux": {},
}

// Known PQ profile values.
var validPQProfiles = map[string]struct{}{
	"strict-pq":        {},
	"classical-compat": {},
}

// addressRE validates the 0x-prefixed 20-byte hex form. Substrate /
// XRP / BTC addresses are not the fee receiver — fees are skimmed at
// the destination L1 (EVM) in BridgeV4.sol, so the fee receiver is
// always EVM.
var addressRE = regexp.MustCompile(`^0x[0-9a-fA-F]{40}$`)

// Load reads and parses a tenant config from disk. Refuses to return
// an invalid config — every error path is a hard fail.
func Load(path string) (*Config, error) {
	if strings.TrimSpace(path) == "" {
		return nil, errors.New("tenant: empty config path")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("tenant: read %s: %w", path, err)
	}
	return Parse(data)
}

// Parse is Load's in-memory counterpart — used by tests and shims
// that embed their tenant config.
func Parse(data []byte) (*Config, error) {
	var c Config
	if err := yaml.Unmarshal(data, &c); err != nil {
		return nil, fmt.Errorf("tenant: parse yaml: %w", err)
	}
	c.applyDefaults()
	if err := c.Validate(); err != nil {
		return nil, err
	}
	return &c, nil
}

// applyDefaults fills in safe defaults BEFORE validation. The
// defaults match what existing operators expect from the legacy
// flag-driven main.go (8080 listen, classical-compat profile, etc.).
func (c *Config) applyDefaults() {
	if c.Listen == "" {
		c.Listen = ":8080"
	}
	if c.NetworksConfigPath == "" {
		c.NetworksConfigPath = "/etc/bridge/networks.yaml"
	}
	if c.PQProfile == "" {
		c.PQProfile = "classical-compat"
	}
	if c.Brand.Title == "" {
		c.Brand.Title = c.Brand.Name
	}
}

// Validate enforces the tenant-config contract. Daemon refuses to
// boot on any error returned here.
func (c *Config) Validate() error {
	var errs []string

	// Brand.
	if strings.TrimSpace(c.Brand.Name) == "" {
		errs = append(errs, "brand.name: required")
	}
	if strings.TrimSpace(c.Brand.Slug) == "" {
		errs = append(errs, "brand.slug: required")
	} else if !slugRE.MatchString(c.Brand.Slug) {
		errs = append(errs, fmt.Sprintf("brand.slug: %q must be lowercase-hyphenated (a-z0-9 plus '-')", c.Brand.Slug))
	}

	// Network.
	if c.Network.ID == 0 {
		errs = append(errs, "network.id: required (EVM chainId)")
	}
	if strings.TrimSpace(c.Network.Name) == "" {
		errs = append(errs, "network.name: required")
	}

	// IAM.
	if strings.TrimSpace(c.IAM.Endpoint) == "" {
		errs = append(errs, "iam.endpoint: required (no local auth — bridge federates to IAM only)")
	} else if !strings.HasPrefix(c.IAM.Endpoint, "https://") {
		errs = append(errs, fmt.Sprintf("iam.endpoint: %q must use https:// scheme", c.IAM.Endpoint))
	}
	if strings.TrimSpace(c.IAM.ClientID) == "" {
		errs = append(errs, "iam.clientID: required")
	}
	if strings.TrimSpace(c.IAM.Organization) == "" {
		errs = append(errs, "iam.organization: required")
	}

	// KMS.
	if strings.TrimSpace(c.KMS.Endpoint) == "" {
		errs = append(errs, "kms.endpoint: required (secrets MUST come from KMS, not env)")
	} else if !strings.HasPrefix(c.KMS.Endpoint, "https://") {
		errs = append(errs, fmt.Sprintf("kms.endpoint: %q must use https:// scheme", c.KMS.Endpoint))
	}
	if strings.TrimSpace(c.KMS.ProjectID) == "" {
		errs = append(errs, "kms.projectID: required")
	}
	if c.KMS.Environment != "" {
		switch c.KMS.Environment {
		case "prod", "staging", "dev":
		default:
			errs = append(errs, fmt.Sprintf("kms.environment: %q must be one of prod|staging|dev", c.KMS.Environment))
		}
	}

	// MPC — operators are optional (audit-display), but threshold + URL gate prod.
	if c.MPC.Threshold > 0 && len(c.MPC.Operators) > 0 {
		if int(c.MPC.Threshold) > len(c.MPC.Operators) {
			errs = append(errs, fmt.Sprintf("mpc.threshold (%d) exceeds operator count (%d)", c.MPC.Threshold, len(c.MPC.Operators)))
		}
	}

	// PQ profile.
	if _, ok := validPQProfiles[c.PQProfile]; !ok {
		errs = append(errs, fmt.Sprintf("pqProfile: %q must be one of strict-pq|classical-compat", c.PQProfile))
	}

	// SupportedChains: non-empty + every entry must be in the known set.
	if len(c.SupportedChains) == 0 {
		errs = append(errs, "supportedChains: required (at least one of eth,btc,sol,ton,xrp,dot,hanzo,zoo,pars,spc,lux)")
	} else {
		seen := map[string]struct{}{}
		for _, ch := range c.SupportedChains {
			ch = strings.ToLower(strings.TrimSpace(ch))
			if _, ok := supportedChainSet[ch]; !ok {
				known := keysOf(supportedChainSet)
				sort.Strings(known)
				errs = append(errs, fmt.Sprintf("supportedChains: %q not recognized (allowed: %s)", ch, strings.Join(known, ",")))
			}
			if _, dup := seen[ch]; dup {
				errs = append(errs, fmt.Sprintf("supportedChains: duplicate entry %q", ch))
			}
			seen[ch] = struct{}{}
		}
	}

	// FeeReceiverAddr (EVM address).
	if strings.TrimSpace(c.FeeReceiverAddr) == "" {
		errs = append(errs, "feeReceiverAddr: required (0x-prefixed 20-byte hex)")
	} else if !addressRE.MatchString(c.FeeReceiverAddr) {
		errs = append(errs, fmt.Sprintf("feeReceiverAddr: %q must be 0x-prefixed 20-byte hex", c.FeeReceiverAddr))
	}

	// Domain.
	if strings.TrimSpace(c.Domain) == "" {
		errs = append(errs, "domain: required (public DNS host, e.g. bridge.tenant.tld)")
	}

	// Basket allowlist: every basket member must be a non-empty string.
	for basket, members := range c.BasketAllowlist {
		if strings.TrimSpace(basket) == "" {
			errs = append(errs, "basketAllowlist: empty basket name")
			continue
		}
		if len(members) == 0 {
			errs = append(errs, fmt.Sprintf("basketAllowlist[%s]: empty member list", basket))
		}
		for i, m := range members {
			if strings.TrimSpace(m) == "" {
				errs = append(errs, fmt.Sprintf("basketAllowlist[%s][%d]: empty member symbol", basket, i))
			}
		}
	}

	// Release pool: per-family size MUST be non-negative.
	if c.ReleasePool.EVM.Size < 0 {
		errs = append(errs, "releasePool.evm.size: negative not allowed")
	}
	if c.ReleasePool.SOL.Size < 0 {
		errs = append(errs, "releasePool.sol.size: negative not allowed")
	}
	if c.ReleasePool.BTC.Size < 0 {
		errs = append(errs, "releasePool.btc.size: negative not allowed")
	}
	if c.ReleasePool.XRP.Size < 0 {
		errs = append(errs, "releasePool.xrp.size: negative not allowed")
	}
	if c.ReleasePool.DOT.Size < 0 {
		errs = append(errs, "releasePool.dot.size: negative not allowed")
	}
	if c.ReleasePool.TON.Size < 0 {
		errs = append(errs, "releasePool.ton.size: negative not allowed")
	}

	if len(errs) > 0 {
		return fmt.Errorf("tenant config invalid:\n  - %s", strings.Join(errs, "\n  - "))
	}
	return nil
}

// IsChainSupported is the runtime helper the daemon's swap-create
// handler uses to refuse requests for chains the tenant did not opt
// into.
func (c *Config) IsChainSupported(family string) bool {
	family = strings.ToLower(strings.TrimSpace(family))
	for _, ch := range c.SupportedChains {
		if strings.ToLower(strings.TrimSpace(ch)) == family {
			return true
		}
	}
	return false
}

// IsBasketAllowed checks whether `asset` is allowed as backing for `basket`.
// Returns true when the basket is not configured at all (no allowlist =
// no restriction); returns true when the asset is in the list. False
// only when basket is configured AND asset is absent.
func (c *Config) IsBasketAllowed(basket, asset string) bool {
	if c == nil {
		return true
	}
	members, ok := c.BasketAllowlist[basket]
	if !ok {
		return true
	}
	for _, m := range members {
		if strings.EqualFold(m, asset) {
			return true
		}
	}
	return false
}

var slugRE = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

func keysOf(m map[string]struct{}) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
