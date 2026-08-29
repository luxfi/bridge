package main

import (
	"fmt"
	"os"
	"strings"

	"github.com/luxfi/bridge/internal/mchain"
	"gopkg.in/yaml.v3"
)

// Config is the bridge runtime configuration. The shape mirrors the
// data the Node backend serves from the `Network`/`Currency` Prisma
// tables — keeping it in YAML lets us source-control supported chains
// + tokens and read them natively without spinning up Postgres.
type Config struct {
	Brand     Brand      `yaml:"brand"`
	Networks  []Network  `yaml:"networks"`
	Tokens    []Token    `yaml:"tokens"`
	Limits    Limits     `yaml:"limits"`
	Exchanges []Exchange `yaml:"exchanges"`
}

// Brand controls the SPA's runtime config (window.ENV) and per-host assets.
type Brand struct {
	Name      string `yaml:"name"`
	Title     string `yaml:"title"`
	LogoURL   string `yaml:"logoUrl"`
	IconURL   string `yaml:"iconUrl"`
	BrandHost string `yaml:"brandHost"`
}

// Network is a supported chain. JSON tags use snake_case to match the
// wire contract the SPA's network-mapper consumes
// (pkg/bridge/src/app/lib/network-mapper.ts::ApiNetwork). The legacy
// app/server emitted snake_case (Prisma JSON convention); the embedded
// SPA was written against that shape, so cmd/bridge has to honor it
// even though Go-side fields are PascalCase.
type Network struct {
	InternalName    string `yaml:"internalName"      json:"internal_name"`
	DisplayName     string `yaml:"displayName"       json:"display_name"`
	NativeCurrency  string `yaml:"nativeCurrency"    json:"native_currency"`
	IsTestnet       bool   `yaml:"isTestnet"         json:"is_testnet"`
	IsFeatured      bool   `yaml:"isFeatured"        json:"is_featured"`
	Logo            string `yaml:"logo"              json:"logo,omitempty"`
	ChainID         string `yaml:"chainId"           json:"chain_id"`
	Type            string `yaml:"type"              json:"type"` // evm | substrate | bitcoin | solana | ton | xrp | cardano
	AvgCompletion   string `yaml:"avgCompletion"     json:"average_completion_time"`
	TxExplorerTpl   string `yaml:"txExplorerTpl"     json:"transaction_explorer_template"`
	AddrExplorerTpl string `yaml:"addrExplorerTpl"   json:"account_explorer_template"`
	// Status defaults to "active" at marshal time when empty. The SPA's
	// transformNetworks() drops anything that isn't "active", so an
	// unset status without this default would zero out the chain list.
	Status string `yaml:"status"            json:"status,omitempty"`

	// Broadcast is the per-network broadcast-endpoint configuration.
	// Optional — when unset the bridge falls back to internal default
	// URL tables (see internal/broadcast/client.go::rpcURLs). Today
	// the only consumer is the TON family: TON Center requires an
	// authenticated URL + API key, and the broadcast layer reads
	// both from here.
	Broadcast *NetworkBroadcast `yaml:"broadcast,omitempty" json:"-"`
}

// NetworkBroadcast captures the destination-side broadcast endpoint
// for non-EVM networks. EVM networks use the legacy rpc fields and
// the package's URL table — see internal/broadcast.
type NetworkBroadcast struct {
	// URL is the broadcast endpoint. For TON, the toncenter sendBoc
	// URL (e.g. https://toncenter.com/api/v2/sendBoc). The balance
	// probe derives the getAddressBalance URL by string-replacing
	// /sendBoc → /getAddressBalance, so the same base configures both.
	URL string `yaml:"url" json:"-"`
	// APIKey is the X-API-Key for authenticated requests. Empty ⇒
	// no auth header — works against unauthenticated dev gateways,
	// hits TON Center's 1 req/s rate-limit at production scale.
	APIKey string `yaml:"apiKey" json:"-"`
}

// Token is an asset bridged on one or more networks. JSON tags mirror
// the SPA's ApiCurrency shape so cmd/bridge can synthesize the nested
// `currencies` array on /api/networks responses without a transform
// layer in the handler.
type Token struct {
	Asset    string `yaml:"asset"    json:"asset"`
	Name     string `yaml:"name"     json:"name"`
	Logo     string `yaml:"logo"     json:"logo,omitempty"`
	Decimals int    `yaml:"decimals" json:"decimals"`
	Contract string `yaml:"contract" json:"contract_address,omitempty"`
	Network  string `yaml:"network"  json:"-"` // server-side join key; not surfaced in the per-currency JSON
	// Status defaults to "active" at marshal time when empty.
	Status string `yaml:"status"   json:"status,omitempty"`
	// Deposit / withdrawal flags default to true when YAML omits them
	// (handled in the /networks handler — Go zero-value for bool is
	// false, which would silently disable every currency).
	IsDepositEnabled    *bool `yaml:"isDepositEnabled"    json:"is_deposit_enabled,omitempty"`
	IsWithdrawalEnabled *bool `yaml:"isWithdrawalEnabled" json:"is_withdrawal_enabled,omitempty"`
	IsRefuelEnabled     *bool `yaml:"isRefuelEnabled"     json:"is_refuel_enabled,omitempty"`
}

// findToken resolves the configured Token for a (network, asset) pair
// using the SAME join key the /networks handler + normalizeCurrency use
// (Token.Network == network && Token.Asset == asset). The bool reports
// whether a row exists, so callers can distinguish "configured" from
// "absent".
func (c Config) findToken(network, asset string) (Token, bool) {
	// Case-INSENSITIVE match: the signer dispatch keys on the network alone and
	// case-folds it (mchain.AddressTypeFor uppercases; isBTCNetwork ToUppers),
	// so the gate MUST fold too — otherwise a variant like asset "xrp" or
	// network "bitcoin_testnet" would miss the exact row and dodge the gate
	// while routing still reaches the release pool.
	for _, t := range c.Tokens {
		if strings.EqualFold(t.Network, network) && strings.EqualFold(t.Asset, asset) {
			return t, true
		}
	}
	return Token{}, false
}

// gatedFamily reports whether a network routes to a wired NON-EVM family
// (BTC/SOL/TON/XRP/DOT). Those families are default-DENY for the deposit /
// withdrawal gate: a move REQUIRES an explicitly-enabled (network, asset) row.
// Their signer dispatch keys on the network only, so a variant asset or absent
// row must never fall through to "enabled" — that was the gate-bypass. EVM
// stays default-ON (its many tokens carry no explicit flag). The network is
// upper-cased to match mchain.AddressTypeFor's exact-uppercase routing table.
func gatedFamily(network string) bool {
	// An unknown network is gated. It used to read as EVM and pass, which is
	// the wrong direction for a gate: a family nobody has named is exactly the
	// one to hold, not the one to wave through.
	t, known := mchain.AddressTypeFor(strings.ToUpper(network))
	return !known || t != mchain.AddressTypeETH
}

// WithdrawalEnabled is the authoritative server-side gate behind the
// per-token isWithdrawalEnabled flag: it reports whether the bridge may
// pay OUT (network, asset) on its destination chain. swapsCreateNative
// rejects a create whose destination is disabled, and the signing driver
// skips (never signs/broadcasts) any swap whose destination is disabled —
// so flipping isWithdrawalEnabled:false in networks.{env}.yaml is a real
// kill-switch, not just a /currencies UI hint.
//
// Policy is asymmetric by family (see gatedFamily): wired NON-EVM families
// (BTC/SOL/TON/XRP/DOT) are default-DENY — a payout requires an explicit
// isWithdrawalEnabled:true row, so a variant asset/network-case that misses the
// row is refused rather than slipping through. EVM is default-ON (mirroring
// normalizeCurrency: many EVM tokens carry no explicit flag; only an explicit
// isWithdrawalEnabled:false suppresses one).
func (c Config) WithdrawalEnabled(network, asset string) bool {
	t, ok := c.findToken(network, asset)
	if gatedFamily(network) {
		return ok && t.IsWithdrawalEnabled != nil && *t.IsWithdrawalEnabled
	}
	return !ok || t.IsWithdrawalEnabled == nil || *t.IsWithdrawalEnabled
}

// DepositEnabled is the source-side counterpart of WithdrawalEnabled:
// whether the bridge may accept a DEPOSIT of (network, asset) on its source
// chain. Same single config source and same family-asymmetric policy
// (gatedFamily): non-EVM default-DENY, EVM default-ON. swapsCreateNative
// rejects a create whose source token is deposit-disabled (e.g. SOL/TON on
// mainnet, gated on both legs).
func (c Config) DepositEnabled(network, asset string) bool {
	t, ok := c.findToken(network, asset)
	if gatedFamily(network) {
		return ok && t.IsDepositEnabled != nil && *t.IsDepositEnabled
	}
	return !ok || t.IsDepositEnabled == nil || *t.IsDepositEnabled
}

// Limits are per-token min/max swap caps. Real impl reads from KMS/admin,
// but for the SPA's read paths a static config is fine.
type Limits struct {
	MinUSD float64         `yaml:"minUSD"`
	MaxUSD float64         `yaml:"maxUSD"`
	Per    map[string]Caps `yaml:"per"`
}

type Caps struct {
	MinUSD float64 `yaml:"minUSD"`
	MaxUSD float64 `yaml:"maxUSD"`
}

// Exchange is a CEX integration listing.
type Exchange struct {
	InternalName string `yaml:"internalName"`
	DisplayName  string `yaml:"displayName"`
	Logo         string `yaml:"logo"`
	URL          string `yaml:"url"`
}

func LoadConfig(path string) (Config, error) {
	if path == "" {
		return defaultConfig(), nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return defaultConfig(), nil
		}
		return Config{}, fmt.Errorf("read %s: %w", path, err)
	}
	var c Config
	if err := yaml.Unmarshal(data, &c); err != nil {
		return Config{}, fmt.Errorf("parse %s: %w", path, err)
	}
	return c, nil
}

func defaultConfig() Config {
	return Config{
		Brand: Brand{
			Name:    "Lux Bridge",
			Title:   "Lux Bridge",
			LogoURL: "/logo.svg",
			IconURL: "/icon.svg",
		},
	}
}
