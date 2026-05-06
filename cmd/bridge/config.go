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

// Network is a supported chain. internalName is the slug used by the SPA;
// chainID is the EVM chain ID (or substrate paraID); explorerTpl is the
// {tx} / {addr} URL template the SPA renders.
type Network struct {
	InternalName     string `yaml:"internalName"`
	DisplayName      string `yaml:"displayName"`
	NativeCurrency   string `yaml:"nativeCurrency"`
	IsTestnet        bool   `yaml:"isTestnet"`
	IsFeatured       bool   `yaml:"isFeatured"`
	Logo             string `yaml:"logo"`
	ChainID          string `yaml:"chainId"`
	Type             string `yaml:"type"` // evm | substrate | bitcoin
	AvgCompletion    string `yaml:"avgCompletion"`
	TxExplorerTpl    string `yaml:"txExplorerTpl"`
	AddrExplorerTpl  string `yaml:"addrExplorerTpl"`
}

// Token is an asset bridged on one or more networks. The `decimals` and
// `contract` fields are per-network; expand these once we add multi-chain
// token mapping (matches the Node backend's `Currency` model).
type Token struct {
	Asset    string `yaml:"asset"`
	Name     string `yaml:"name"`
	Logo     string `yaml:"logo"`
	Decimals int    `yaml:"decimals"`
	Contract string `yaml:"contract"`
	Network  string `yaml:"network"`
}

// Limits are per-token min/max swap caps. Real impl reads from KMS/admin,
// but for the SPA's read paths a static config is fine.
type Limits struct {
	MinUSD float64            `yaml:"minUSD"`
	MaxUSD float64            `yaml:"maxUSD"`
	Per    map[string]Caps    `yaml:"per"`
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
