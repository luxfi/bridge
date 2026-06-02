package main

import (
	"fmt"
	"os"

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
