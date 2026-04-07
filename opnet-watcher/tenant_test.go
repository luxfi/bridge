// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

package main

import (
	"os"
	"path/filepath"
	"testing"
)

func setupTestManifests(t *testing.T) (tenantDir, chainDir string) {
	t.Helper()

	base := t.TempDir()
	chainDir = filepath.Join(base, "chains")
	tenantDir = filepath.Join(base, "tenants")

	if err := os.MkdirAll(chainDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(tenantDir, 0o755); err != nil {
		t.Fatal(err)
	}

	// Write chain manifests.
	chains := map[string]string{
		"lux-c.yaml": `
chain_id: 96369
name: "Lux C-Chain"
class: lux_native
tier: yield_enabled
assets:
  - ticker: LUX
    decimals: 18
    recipient_encoding: evm_address
    wrapper:
      symbol: LUX
      contract: "token/LUX.sol"
      decimals: 18
finality:
  mode: instant
  confirmations: 1
`,
		"ethereum.yaml": `
chain_id: 1
name: "Ethereum"
class: evm
tier: yield_enabled
assets:
  - ticker: ETH
    decimals: 18
    recipient_encoding: evm_address
    wrapper:
      symbol: LETH
      contract: "liquid/tokens/LETH.sol"
      decimals: 18
  - ticker: USDC
    decimals: 6
    recipient_encoding: evm_address
    wrapper:
      symbol: LUSD
      contract: "liquid/tokens/LUSD.sol"
      decimals: 18
finality:
  mode: slot_finalized
  confirmations: 64
`,
	}
	for name, content := range chains {
		if err := os.WriteFile(filepath.Join(chainDir, name), []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	// Write tenant manifests.
	tenants := map[string]string{
		"lux.yaml": `
id: lux
name: "Lux Network"
hostnames: ["bridge.lux.network", "bridge.lux.io"]
home_chain_id: 96369
supported_chains: [lux-c, ethereum]
teleporter_addresses:
  "96369": "kms://teleport/lux-c/teleporter"
  "1": "kms://teleport/lux-c/teleporter-eth"
branding:
  logo_url: "/static/lux/logo.svg"
  primary_color: "#E84142"
  theme: dark
features:
  swap: true
  yield: true
  perps: true
`,
		"zoo.yaml": `
id: zoo
name: "Zoo Network"
hostnames: ["bridge.zoo.ngo"]
home_chain_id: 200200
supported_chains: [lux-c]
teleporter_addresses:
  "96369": "kms://teleport/lux-c/teleporter"
branding:
  logo_url: "/static/zoo/logo.svg"
  primary_color: "#10B981"
  theme: dark
features:
  swap: true
  yield: true
  perps: false
`,
		"schema.yaml": `
schema_version: "1.0.0"
`,
	}
	for name, content := range tenants {
		if err := os.WriteFile(filepath.Join(tenantDir, name), []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	return tenantDir, chainDir
}

func TestTenantRegistryLoad(t *testing.T) {
	tenantDir, chainDir := setupTestManifests(t)
	r := NewTenantRegistry(chainDir)
	if err := r.Load(tenantDir); err != nil {
		t.Fatalf("Load: %v", err)
	}

	all := r.AllTenants()
	if len(all) != 2 {
		t.Fatalf("expected 2 tenants, got %d", len(all))
	}
}

func TestTenantForHostname(t *testing.T) {
	tenantDir, chainDir := setupTestManifests(t)
	r := NewTenantRegistry(chainDir)
	if err := r.Load(tenantDir); err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		host     string
		wantID   string
		wantErr  bool
	}{
		{"bridge.lux.network", "lux", false},
		{"bridge.lux.io", "lux", false},
		{"Bridge.Lux.Network", "lux", false},  // case insensitive
		{"bridge.lux.network:443", "lux", false}, // port stripped
		{"bridge.zoo.ngo", "zoo", false},
		{"bridge.unknown.com", "", true},
	}

	for _, tt := range tests {
		tenant, err := r.TenantForHostname(tt.host)
		if tt.wantErr {
			if err == nil {
				t.Errorf("TenantForHostname(%q) expected error", tt.host)
			}
			continue
		}
		if err != nil {
			t.Errorf("TenantForHostname(%q) error: %v", tt.host, err)
			continue
		}
		if tenant.ID != tt.wantID {
			t.Errorf("TenantForHostname(%q) = %q, want %q", tt.host, tenant.ID, tt.wantID)
		}
	}
}

func TestChainsForTenant(t *testing.T) {
	tenantDir, chainDir := setupTestManifests(t)
	r := NewTenantRegistry(chainDir)
	if err := r.Load(tenantDir); err != nil {
		t.Fatal(err)
	}

	chains, err := r.ChainsForTenant("lux")
	if err != nil {
		t.Fatalf("ChainsForTenant(lux): %v", err)
	}
	if len(chains) != 2 {
		t.Fatalf("expected 2 chains for lux, got %d", len(chains))
	}

	chains, err = r.ChainsForTenant("zoo")
	if err != nil {
		t.Fatalf("ChainsForTenant(zoo): %v", err)
	}
	if len(chains) != 1 {
		t.Fatalf("expected 1 chain for zoo, got %d", len(chains))
	}
	if chains[0].ChainID != 96369 {
		t.Errorf("expected chain_id 96369, got %d", chains[0].ChainID)
	}

	_, err = r.ChainsForTenant("nonexistent")
	if err == nil {
		t.Error("ChainsForTenant(nonexistent) expected error")
	}
}

func TestAssetsForTenant(t *testing.T) {
	tenantDir, chainDir := setupTestManifests(t)
	r := NewTenantRegistry(chainDir)
	if err := r.Load(tenantDir); err != nil {
		t.Fatal(err)
	}

	assets, err := r.AssetsForTenant("lux")
	if err != nil {
		t.Fatalf("AssetsForTenant(lux): %v", err)
	}
	// lux-c has 1 asset (LUX), ethereum has 2 (ETH, USDC)
	if len(assets) != 3 {
		t.Fatalf("expected 3 assets for lux, got %d", len(assets))
	}

	assets, err = r.AssetsForTenant("zoo")
	if err != nil {
		t.Fatalf("AssetsForTenant(zoo): %v", err)
	}
	if len(assets) != 1 {
		t.Fatalf("expected 1 asset for zoo, got %d", len(assets))
	}
	if assets[0].Ticker != "LUX" {
		t.Errorf("expected ticker LUX, got %s", assets[0].Ticker)
	}
}

func TestValidateTenantBadChainRef(t *testing.T) {
	base := t.TempDir()
	chainDir := filepath.Join(base, "chains")
	tenantDir := filepath.Join(base, "tenants")
	os.MkdirAll(chainDir, 0o755)
	os.MkdirAll(tenantDir, 0o755)

	// Only lux-c chain exists.
	os.WriteFile(filepath.Join(chainDir, "lux-c.yaml"), []byte(`
chain_id: 96369
name: "Lux C-Chain"
class: lux_native
tier: yield_enabled
assets: [{ticker: LUX, decimals: 18, recipient_encoding: evm_address, wrapper: {symbol: LUX, contract: "t.sol", decimals: 18}}]
finality: {mode: instant, confirmations: 1}
`), 0o644)

	// Tenant references nonexistent chain.
	os.WriteFile(filepath.Join(tenantDir, "bad.yaml"), []byte(`
id: bad
name: "Bad Tenant"
hostnames: ["bad.example.com"]
home_chain_id: 1
supported_chains: [lux-c, nonexistent]
teleporter_addresses: {"96369": "0xdead"}
branding: {logo_url: "/x", primary_color: "#000000", theme: dark}
features: {swap: false, yield: false, perps: false}
`), 0o644)

	r := NewTenantRegistry(chainDir)
	err := r.Load(tenantDir)
	if err == nil {
		t.Fatal("expected error for bad chain reference")
	}
}
