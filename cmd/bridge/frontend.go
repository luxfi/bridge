package main

import (
	"bytes"
	"embed"
	"encoding/json"
	"fmt"
	"html"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/luxfi/bridge/pkg/tenant"
)

// titleRe / descRe locate the SPA's build-time (Lux) <title> and meta
// description so the server can rewrite them per-tenant. applyBrandMetadata()
// already fixes these at runtime for browsers; rewriting the served HTML also
// covers non-JS consumers (crawlers, social-card unfurlers) so a white-label
// deployment never surfaces the upstream brand name in its page source.
var (
	titleRe   = regexp.MustCompile(`<title>[^<]*</title>`)
	descRe    = regexp.MustCompile(`(<meta name="description" content=")[^"]*(")`)
	faviconRe = regexp.MustCompile(`(<link rel="icon"[^>]*?href=")[^"]*(")`)
)

// brandIndex rewrites the embedded index.html's title + description from the
// tenant brand. No tenant → returned unchanged (canonical Lux build).
func brandIndex(idx []byte, tcfg *tenant.Config) []byte {
	if tcfg == nil {
		return idx
	}
	name := tcfg.Brand.Title
	if name == "" {
		name = tcfg.Brand.Name
	}
	if name == "" {
		return idx
	}
	s := string(idx)
	s = titleRe.ReplaceAllString(s, "<title>"+html.EscapeString(name)+"</title>")
	s = descRe.ReplaceAllString(s, "${1}"+html.EscapeString(name)+"${2}")
	if fav := tcfg.Brand.FaviconURL; fav != "" {
		s = faviconRe.ReplaceAllString(s, "${1}"+strings.ReplaceAll(fav, "$", "$$")+"${2}")
	}
	return []byte(s)
}

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
	cfg        Config
	root       fs.FS
	index      []byte
	overlay    string            // optional disk dir for SPA + brand override
	runtimeEnv map[string]string // window.__ENV served at /__ENV.js (tenant brand)
}

func NewFrontend(cfg Config, overlay string, tcfg *tenant.Config) (*Frontend, error) {
	root, err := fs.Sub(staticFS, "static")
	if err != nil {
		return nil, fmt.Errorf("sub-fs: %w", err)
	}
	idx, err := fs.ReadFile(root, "index.html")
	if err != nil {
		return nil, fmt.Errorf("read index.html: %w", err)
	}
	return &Frontend{cfg: cfg, root: root, index: brandIndex(idx, tcfg), overlay: overlay, runtimeEnv: buildRuntimeEnv(tcfg)}, nil
}

// buildRuntimeEnv projects the tenant brand + IAM config into the window.__ENV
// keys the SPA's bridge.config.ts reads (BRIDGE_*). When there is no tenant
// (the canonical Lux deployment), it returns an empty map so the SPA falls
// back to its build-time @luxfi/brand defaults — Lux is unchanged. White-label
// shims ship a tenant.yaml and get their brand applied at runtime, one image.
func buildRuntimeEnv(tcfg *tenant.Config) map[string]string {
	e := map[string]string{}
	if tcfg == nil {
		return e
	}
	set := func(k, v string) {
		if v != "" {
			e[k] = v
		}
	}
	b := tcfg.Brand
	set("BRIDGE_BRAND_NAME", b.Name)
	set("BRIDGE_LOGO_URL", b.LogoURL)
	set("BRIDGE_FAVICON_URL", b.FaviconURL)
	set("BRIDGE_PRIMARY_COLOR", b.PrimaryColor)
	set("BRIDGE_DOCS_URL", b.DocsURL)
	set("BRIDGE_IAM_ORG", tcfg.IAM.Organization)
	set("BRIDGE_CLIENT_ID", tcfg.IAM.ClientID)
	return e
}

func (f *Frontend) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch r.URL.Path {
	case "/__ENV.js":
		f.serveRuntimeEnv(w, r)
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

// serveRuntimeEnv emits window.__ENV — the runtime brand/config the embedded
// SPA loads via <script src="/__ENV.js"> before its main bundle. This is the
// tenant→frontend brand bridge: bridge.config.ts reads these BRIDGE_* keys and
// applyBrandMetadata() applies name/favicon/logo/color to the document.
func (f *Frontend) serveRuntimeEnv(w http.ResponseWriter, r *http.Request) {
	body, _ := json.Marshal(f.runtimeEnv)
	w.Header().Set("Content-Type", "application/javascript")
	w.Header().Set("Cache-Control", "no-store")
	fmt.Fprintf(w, "window.__ENV = %s;", body)
}

func (f *Frontend) serveEnvs(w http.ResponseWriter, r *http.Request) {
	envs := map[string]any{
		"brand":   f.cfg.Brand,
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
