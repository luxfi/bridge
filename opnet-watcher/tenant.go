// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"gopkg.in/yaml.v3"
)

// Tenant represents a white-label bridge deployment loaded from a manifest.
type Tenant struct {
	ID                  string            `yaml:"id" json:"id"`
	Name                string            `yaml:"name" json:"name"`
	Hostnames           []string          `yaml:"hostnames" json:"hostnames"`
	HomeChainID         uint64            `yaml:"home_chain_id" json:"home_chain_id"`
	SupportedChains     []string          `yaml:"supported_chains" json:"supported_chains"`
	TeleporterAddresses map[string]string `yaml:"teleporter_addresses" json:"teleporter_addresses"`
	Branding            Branding          `yaml:"branding" json:"branding"`
	Features            Features          `yaml:"features" json:"features"`
}

// Branding holds UI theme configuration for a tenant.
type Branding struct {
	LogoURL      string `yaml:"logo_url" json:"logo_url"`
	PrimaryColor string `yaml:"primary_color" json:"primary_color"`
	Theme        string `yaml:"theme" json:"theme"`
}

// Features holds feature flags for a tenant.
type Features struct {
	Swap  bool `yaml:"swap" json:"swap"`
	Yield bool `yaml:"yield" json:"yield"`
	Perps bool `yaml:"perps" json:"perps"`
}

// ChainManifest is a minimal representation of a chain manifest for the API.
// Full schema is in manifests/chains/schema.yaml; we only load what the API needs.
type ChainManifest struct {
	ChainID  uint64          `yaml:"chain_id" json:"chain_id"`
	Name     string          `yaml:"name" json:"name"`
	Class    string          `yaml:"class" json:"class"`
	Tier     string          `yaml:"tier" json:"tier"`
	Assets   []AssetManifest `yaml:"assets" json:"assets"`
	Finality struct {
		Mode          string `yaml:"mode" json:"mode"`
		Confirmations int    `yaml:"confirmations" json:"confirmations"`
	} `yaml:"finality" json:"finality"`
}

// AssetManifest is the asset portion of a chain manifest.
type AssetManifest struct {
	Ticker            string `yaml:"ticker" json:"ticker"`
	Decimals          int    `yaml:"decimals" json:"decimals"`
	RecipientEncoding string `yaml:"recipient_encoding" json:"recipient_encoding"`
	Wrapper           struct {
		Symbol   string `yaml:"symbol" json:"symbol"`
		Contract string `yaml:"contract" json:"contract"`
		Decimals int    `yaml:"decimals" json:"decimals"`
	} `yaml:"wrapper" json:"wrapper"`
}

// TenantRegistry loads and indexes tenant and chain manifests.
// Thread-safe after Load completes.
type TenantRegistry struct {
	mu       sync.RWMutex
	tenants  map[string]*Tenant        // id -> Tenant
	byHost   map[string]*Tenant        // hostname -> Tenant
	chains   map[string]*ChainManifest // manifest filename (no ext) -> ChainManifest
	chainDir string
}

// NewTenantRegistry creates an empty registry.
func NewTenantRegistry(chainDir string) *TenantRegistry {
	return &TenantRegistry{
		tenants:  make(map[string]*Tenant),
		byHost:   make(map[string]*Tenant),
		chains:   make(map[string]*ChainManifest),
		chainDir: chainDir,
	}
}

// Load reads all tenant manifests from tenantDir and all chain manifests from chainDir.
func (r *TenantRegistry) Load(tenantDir string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	// Load chain manifests.
	chainFiles, err := filepath.Glob(filepath.Join(r.chainDir, "*.yaml"))
	if err != nil {
		return fmt.Errorf("glob chains: %w", err)
	}
	for _, path := range chainFiles {
		var cm ChainManifest
		data, err := os.ReadFile(path)
		if err != nil {
			return fmt.Errorf("read chain %s: %w", path, err)
		}
		if err := yaml.Unmarshal(data, &cm); err != nil {
			return fmt.Errorf("parse chain %s: %w", path, err)
		}
		key := strings.TrimSuffix(filepath.Base(path), ".yaml")
		r.chains[key] = &cm
	}

	// Load tenant manifests.
	tenantFiles, err := filepath.Glob(filepath.Join(tenantDir, "*.yaml"))
	if err != nil {
		return fmt.Errorf("glob tenants: %w", err)
	}
	for _, path := range tenantFiles {
		base := filepath.Base(path)
		if base == "schema.yaml" {
			continue
		}
		var t Tenant
		data, err := os.ReadFile(path)
		if err != nil {
			return fmt.Errorf("read tenant %s: %w", path, err)
		}
		if err := yaml.Unmarshal(data, &t); err != nil {
			return fmt.Errorf("parse tenant %s: %w", path, err)
		}
		if err := r.validateTenant(&t); err != nil {
			return fmt.Errorf("tenant %s: %w", t.ID, err)
		}
		r.tenants[t.ID] = &t
		for _, h := range t.Hostnames {
			r.byHost[strings.ToLower(h)] = &t
		}
	}

	if len(r.tenants) == 0 {
		return fmt.Errorf("no tenant manifests found in %s", tenantDir)
	}
	return nil
}

// validateTenant checks that a tenant references only known chain manifests.
func (r *TenantRegistry) validateTenant(t *Tenant) error {
	if t.ID == "" {
		return fmt.Errorf("id is required")
	}
	if len(t.Hostnames) == 0 {
		return fmt.Errorf("at least one hostname is required")
	}
	if len(t.SupportedChains) == 0 {
		return fmt.Errorf("at least one supported chain is required")
	}
	for _, ref := range t.SupportedChains {
		if _, ok := r.chains[ref]; !ok {
			return fmt.Errorf("references unknown chain manifest %q", ref)
		}
	}
	return nil
}

// TenantForHostname resolves a hostname to a tenant.
// The hostname is normalized to lowercase and port is stripped.
func (r *TenantRegistry) TenantForHostname(hostname string) (*Tenant, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	// Strip port if present (e.g. "bridge.lux.network:443").
	if idx := strings.IndexByte(hostname, ':'); idx != -1 {
		hostname = hostname[:idx]
	}
	hostname = strings.ToLower(hostname)

	t, ok := r.byHost[hostname]
	if !ok {
		return nil, fmt.Errorf("no tenant for hostname %q", hostname)
	}
	return t, nil
}

// ChainsForTenant returns the chain manifests for a tenant's supported chains.
func (r *TenantRegistry) ChainsForTenant(tenantID string) ([]*ChainManifest, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	t, ok := r.tenants[tenantID]
	if !ok {
		return nil, fmt.Errorf("unknown tenant %q", tenantID)
	}

	out := make([]*ChainManifest, 0, len(t.SupportedChains))
	for _, ref := range t.SupportedChains {
		cm, ok := r.chains[ref]
		if !ok {
			return nil, fmt.Errorf("tenant %s references missing chain %q", tenantID, ref)
		}
		out = append(out, cm)
	}
	return out, nil
}

// AssetsForTenant returns all assets across all supported chains for a tenant.
func (r *TenantRegistry) AssetsForTenant(tenantID string) ([]TenantAsset, error) {
	chains, err := r.ChainsForTenant(tenantID)
	if err != nil {
		return nil, err
	}

	var assets []TenantAsset
	for _, cm := range chains {
		for _, a := range cm.Assets {
			assets = append(assets, TenantAsset{
				ChainID:   cm.ChainID,
				ChainName: cm.Name,
				Ticker:    a.Ticker,
				Decimals:  a.Decimals,
				Wrapper:   a.Wrapper.Symbol,
			})
		}
	}
	return assets, nil
}

// TenantAsset is a flattened asset view for the API.
type TenantAsset struct {
	ChainID   uint64 `json:"chain_id"`
	ChainName string `json:"chain_name"`
	Ticker    string `json:"ticker"`
	Decimals  int    `json:"decimals"`
	Wrapper   string `json:"wrapper"`
}

// AllTenants returns all loaded tenants. Used for health/debug.
func (r *TenantRegistry) AllTenants() []*Tenant {
	r.mu.RLock()
	defer r.mu.RUnlock()

	out := make([]*Tenant, 0, len(r.tenants))
	for _, t := range r.tenants {
		out = append(out, t)
	}
	return out
}
