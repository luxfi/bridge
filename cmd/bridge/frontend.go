package main

import (
	"bytes"
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// staticFS is the embedded SPA. The Dockerfile populates static/ from a
// luxfi/bridge UI build before the Go build runs; for local dev a
// placeholder index.html is committed so go:embed always succeeds.
//
//go:embed all:static
var staticFS embed.FS

// Frontend serves the embedded SPA, runtime config (/envs.js), and per-host
// brand assets (/icon.svg, /logo.svg). Brand assets read from disk on every
// request so a deploy can swap them without rebuilding the binary.
type Frontend struct {
	cfg      Config
	root     fs.FS
	index    []byte
	overlay  string // optional disk dir for SPA + brand override
}

func NewFrontend(cfg Config, overlay string) (*Frontend, error) {
	root, err := fs.Sub(staticFS, "static")
	if err != nil {
		return nil, fmt.Errorf("sub-fs: %w", err)
	}
	idx, err := fs.ReadFile(root, "index.html")
	if err != nil {
		return nil, fmt.Errorf("read index.html: %w", err)
	}
	return &Frontend{cfg: cfg, root: root, index: idx, overlay: overlay}, nil
}

func (f *Frontend) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch r.URL.Path {
	case "/__ENV.js":
		f.serveRuntimeENV(w, r)
		return
	case "/envs.js":
		f.serveEnvs(w, r)
		return
	case "/icon.svg":
		f.serveBrandAsset(w, r, "icon.svg", f.cfg.Brand.IconURL)
		return
	case "/logo.svg":
		f.serveBrandAsset(w, r, "logo.svg", f.cfg.Brand.LogoURL)
		return
	}

	// Try disk overlay first so devs can hot-swap the SPA without rebuild.
	if f.overlay != "" {
		p := filepath.Join(f.overlay, strings.TrimPrefix(r.URL.Path, "/"))
		if data, err := os.ReadFile(p); err == nil {
			http.ServeContent(w, r, p, fileModTime(p), bytes.NewReader(data))
			return
		}
	}

	// Embedded asset?
	cleaned := strings.TrimPrefix(r.URL.Path, "/")
	if cleaned != "" {
		if data, err := fs.ReadFile(f.root, cleaned); err == nil {
			http.ServeContent(w, r, cleaned, time.Time{}, bytes.NewReader(data))
			return
		}
	}

	// SPA fallback — let React Router handle the route.
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write(f.index)
}

// spaEnvKeys are the window.__ENV keys the embedded SPA's bridge.config.ts
// reads at boot (mirrors app/bridge's static __ENV.js). serveRuntimeENV emits
// them from container env so ONE image serves N tenants without a rebuild — the
// static __ENV.js ships all-empty and the SPA falls back to hardcoded defaults
// (e.g. apiHost -> bridge-api.lux.network). Setting BRIDGE_API_HOST here pins a
// tenant's SPA to its own origin instead, which is how the LUX go-live isolates
// itself from the shared bridge-api.lux.network without touching other brands.
var spaEnvKeys = []string{
	"BRIDGE_API_HOST",
	"BRIDGE_ENV",
	"BRIDGE_CLIENT_ID",
	"BRIDGE_IAM_ORG",
	"BRIDGE_LOGO_URL",
	"WC_PROJECT_ID",
	"BRIDGE_WALLET_DEFAULT_CHAIN",
	"BRIDGE_WALLET_SUPPORTED_CHAINS",
	"BRIDGE_MPC_PUBLIC_URL",
	"BRIDGE_MPC_PRIVATE_URL",
	"BRIDGE_MPC_PROTOCOL",
}

// serveRuntimeENV replaces the embedded static /__ENV.js. It emits only the
// SPA's known runtime keys, each from its matching container env var. Unset
// vars are emitted as "" — exactly what the static file does — so the SPA's
// own fallbacks still apply; a non-empty value overrides them. Object.assign
// preserves any window.__ENV an outer wrapper set first.
func (f *Frontend) serveRuntimeENV(w http.ResponseWriter, r *http.Request) {
	env := make(map[string]string, len(spaEnvKeys))
	for _, k := range spaEnvKeys {
		env[k] = os.Getenv(k)
	}
	body, _ := json.Marshal(env)
	w.Header().Set("Content-Type", "application/javascript")
	w.Header().Set("Cache-Control", "no-store")
	fmt.Fprintf(w, "window.__ENV = Object.assign(window.__ENV || {}, %s);", body)
}

func (f *Frontend) serveEnvs(w http.ResponseWriter, r *http.Request) {
	envs := map[string]any{
		"brand": f.cfg.Brand,
		"apiBase": "/v1/bridge",
	}
	body, _ := json.Marshal(envs)
	w.Header().Set("Content-Type", "application/javascript")
	fmt.Fprintf(w, "window.ENV = %s;", body)
}

func (f *Frontend) serveBrandAsset(w http.ResponseWriter, r *http.Request, name, fallback string) {
	if f.overlay != "" {
		if data, err := os.ReadFile(filepath.Join(f.overlay, name)); err == nil {
			w.Header().Set("Content-Type", "image/svg+xml")
			_, _ = w.Write(data)
			return
		}
	}
	if fallback != "" {
		http.Redirect(w, r, fallback, http.StatusFound)
		return
	}
	http.NotFound(w, r)
}

func fileModTime(path string) time.Time {
	if path == "" {
		return time.Time{}
	}
	fi, err := os.Stat(path)
	if err != nil {
		return time.Time{}
	}
	return fi.ModTime()
}
