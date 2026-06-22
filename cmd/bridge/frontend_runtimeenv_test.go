package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// newTestFrontend builds a Frontend from the embedded static FS (the committed
// placeholder index.html is enough for these handler tests).
func newTestFrontend(t *testing.T) *Frontend {
	t.Helper()
	f, err := NewFrontend(Config{}, "")
	if err != nil {
		t.Fatalf("NewFrontend: %v", err)
	}
	return f
}

func TestServeRuntimeENV_OverridesAPIHost(t *testing.T) {
	t.Setenv("BRIDGE_API_HOST", "https://bridge.lux.network")

	f := newTestFrontend(t)
	rec := httptest.NewRecorder()
	f.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/__ENV.js", nil))

	if ct := rec.Header().Get("Content-Type"); !strings.Contains(ct, "javascript") {
		t.Fatalf("content-type = %q, want javascript", ct)
	}
	if cc := rec.Header().Get("Cache-Control"); cc != "no-store" {
		t.Fatalf("cache-control = %q, want no-store", cc)
	}
	body := rec.Body.String()
	if !strings.Contains(body, "window.__ENV") {
		t.Fatalf("body missing window.__ENV assignment: %q", body)
	}
	// The set value must be present so the SPA pins its own origin.
	if !strings.Contains(body, `"BRIDGE_API_HOST":"https://bridge.lux.network"`) {
		t.Fatalf("BRIDGE_API_HOST not emitted: %q", body)
	}
}

func TestServeRuntimeENV_UnsetKeysEmpty(t *testing.T) {
	// Ensure a clean slate: with no env set, every known key is emitted as ""
	// so the SPA keeps its built-in fallbacks (current production behavior).
	for _, k := range spaEnvKeys {
		t.Setenv(k, "")
	}
	f := newTestFrontend(t)
	rec := httptest.NewRecorder()
	f.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/__ENV.js", nil))

	body := rec.Body.String()
	for _, k := range spaEnvKeys {
		if !strings.Contains(body, `"`+k+`":""`) {
			t.Errorf("key %s not emitted empty: %q", k, body)
		}
	}
}
