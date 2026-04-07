// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func newTestAPI(t *testing.T) *API {
	t.Helper()
	tenantDir, chainDir := setupTestManifests(t)
	r := NewTenantRegistry(chainDir)
	if err := r.Load(tenantDir); err != nil {
		t.Fatal(err)
	}
	return NewAPI(r)
}

func TestAPIConfig(t *testing.T) {
	api := newTestAPI(t)

	req := httptest.NewRequest(http.MethodGet, "/v1/config", nil)
	req.Host = "bridge.lux.network"
	rec := httptest.NewRecorder()
	api.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status %d, want 200", rec.Code)
	}
	var tenant Tenant
	if err := json.NewDecoder(rec.Body).Decode(&tenant); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if tenant.ID != "lux" {
		t.Errorf("id = %q, want lux", tenant.ID)
	}
	if tenant.HomeChainID != 96369 {
		t.Errorf("home_chain_id = %d, want 96369", tenant.HomeChainID)
	}
}

func TestAPIConfigUnknownHost(t *testing.T) {
	api := newTestAPI(t)

	req := httptest.NewRequest(http.MethodGet, "/v1/config", nil)
	req.Host = "bridge.unknown.com"
	rec := httptest.NewRecorder()
	api.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status %d, want 404", rec.Code)
	}
}

func TestAPIChains(t *testing.T) {
	api := newTestAPI(t)

	req := httptest.NewRequest(http.MethodGet, "/v1/chains", nil)
	req.Host = "bridge.lux.network"
	rec := httptest.NewRecorder()
	api.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status %d, want 200", rec.Code)
	}
	var chains []ChainManifest
	if err := json.NewDecoder(rec.Body).Decode(&chains); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(chains) != 2 {
		t.Errorf("got %d chains, want 2", len(chains))
	}
}

func TestAPIChainsZoo(t *testing.T) {
	api := newTestAPI(t)

	req := httptest.NewRequest(http.MethodGet, "/v1/chains", nil)
	req.Host = "bridge.zoo.ngo"
	rec := httptest.NewRecorder()
	api.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status %d, want 200", rec.Code)
	}
	var chains []ChainManifest
	if err := json.NewDecoder(rec.Body).Decode(&chains); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(chains) != 1 {
		t.Errorf("got %d chains, want 1", len(chains))
	}
}

func TestAPIAssets(t *testing.T) {
	api := newTestAPI(t)

	req := httptest.NewRequest(http.MethodGet, "/v1/assets", nil)
	req.Host = "bridge.lux.network"
	rec := httptest.NewRecorder()
	api.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status %d, want 200", rec.Code)
	}
	var assets []TenantAsset
	if err := json.NewDecoder(rec.Body).Decode(&assets); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(assets) != 3 {
		t.Errorf("got %d assets, want 3", len(assets))
	}
}

func TestAPIStatus(t *testing.T) {
	api := newTestAPI(t)

	req := httptest.NewRequest(http.MethodGet, "/v1/status", nil)
	req.Host = "bridge.zoo.ngo"
	rec := httptest.NewRecorder()
	api.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status %d, want 200", rec.Code)
	}
	var status statusResponse
	if err := json.NewDecoder(rec.Body).Decode(&status); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if status.Tenant != "zoo" {
		t.Errorf("tenant = %q, want zoo", status.Tenant)
	}
	if !status.Healthy {
		t.Error("expected healthy=true")
	}
}

func TestAPIHealth(t *testing.T) {
	api := newTestAPI(t)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	api.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status %d, want 200", rec.Code)
	}
}
