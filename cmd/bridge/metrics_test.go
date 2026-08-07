package main

import (
	"testing"

	"github.com/zap-proto/zip"
	middleware "github.com/zap-proto/zip/middleware"
)

// metricsRig stands up an API with default wiring for scraping /metrics
// in tests (see wallet_health_poller_test.go for the poller series).
type metricsRig struct {
	app   *zip.App
	store *InMemoryStore
	api   *API
}

func newMetricsRig(t *testing.T) *metricsRig {
	t.Helper()
	store := NewInMemoryStore()
	api := NewAPI(Config{}, "", nil, nil, nil, store)
	app := zip.New(zip.Config{AppName: "lux-bridge-test-metrics", DisableStartupMessage: true})
	app.Use(middleware.Recover(), middleware.RequestID())
	api.Register(app)
	return &metricsRig{app: app, store: store, api: api}
}

func scrapeMetrics(t *testing.T, rig *metricsRig) string {
	t.Helper()
	_, body := fireRequest(t, rig.app, "GET", "/metrics", nil)
	return string(body)
}
