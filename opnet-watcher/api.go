// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

package main

import (
	"encoding/json"
	"log"
	"net/http"
	"time"
)

// API serves tenant-aware bridge configuration over HTTP.
// All endpoints resolve the tenant from the Host header.
type API struct {
	registry  *TenantRegistry
	startTime time.Time
	mux       *http.ServeMux
}

// NewAPI creates the HTTP handler.
func NewAPI(registry *TenantRegistry) *API {
	a := &API{
		registry:  registry,
		startTime: time.Now(),
		mux:       http.NewServeMux(),
	}
	a.mux.HandleFunc("GET /v1/config", a.handleConfig)
	a.mux.HandleFunc("GET /v1/chains", a.handleChains)
	a.mux.HandleFunc("GET /v1/assets", a.handleAssets)
	a.mux.HandleFunc("GET /v1/status", a.handleStatus)
	a.mux.HandleFunc("GET /health", a.handleHealth)
	return a
}

// ServeHTTP implements http.Handler.
func (a *API) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	a.mux.ServeHTTP(w, r)
}

// handleConfig returns the full tenant configuration for the requesting host.
// GET /v1/config
func (a *API) handleConfig(w http.ResponseWriter, r *http.Request) {
	t, err := a.registry.TenantForHostname(r.Host)
	if err != nil {
		writeError(w, http.StatusNotFound, "unknown tenant")
		return
	}
	writeJSON(w, http.StatusOK, t)
}

// handleChains returns the supported chains for the requesting tenant.
// GET /v1/chains
func (a *API) handleChains(w http.ResponseWriter, r *http.Request) {
	t, err := a.registry.TenantForHostname(r.Host)
	if err != nil {
		writeError(w, http.StatusNotFound, "unknown tenant")
		return
	}
	chains, err := a.registry.ChainsForTenant(t.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "chain resolution failed")
		log.Printf("api: chains error tenant=%s: %v", t.ID, err)
		return
	}
	writeJSON(w, http.StatusOK, chains)
}

// handleAssets returns the supported assets for the requesting tenant.
// GET /v1/assets
func (a *API) handleAssets(w http.ResponseWriter, r *http.Request) {
	t, err := a.registry.TenantForHostname(r.Host)
	if err != nil {
		writeError(w, http.StatusNotFound, "unknown tenant")
		return
	}
	assets, err := a.registry.AssetsForTenant(t.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "asset resolution failed")
		log.Printf("api: assets error tenant=%s: %v", t.ID, err)
		return
	}
	writeJSON(w, http.StatusOK, assets)
}

// statusResponse is the shape of GET /v1/status.
type statusResponse struct {
	Tenant  string `json:"tenant"`
	Healthy bool   `json:"healthy"`
	Uptime  string `json:"uptime"`
}

// handleStatus returns bridge status for the requesting tenant.
// GET /v1/status
func (a *API) handleStatus(w http.ResponseWriter, r *http.Request) {
	t, err := a.registry.TenantForHostname(r.Host)
	if err != nil {
		writeError(w, http.StatusNotFound, "unknown tenant")
		return
	}
	resp := statusResponse{
		Tenant:  t.ID,
		Healthy: true,
		Uptime:  time.Since(a.startTime).Truncate(time.Second).String(),
	}
	writeJSON(w, http.StatusOK, resp)
}

// handleHealth is the K8s liveness/readiness probe.
// GET /health
func (a *API) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// writeJSON encodes v as JSON and writes it to w.
func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("api: json encode error: %v", err)
	}
}

// writeError writes a JSON error response.
func writeError(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}
