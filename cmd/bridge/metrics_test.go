package main

import (
	"strings"
	"testing"
	"time"

	"github.com/zap-proto/zip"
	middleware "github.com/zap-proto/zip/middleware"
)

// metricsRig stands up an API and the operator listener /metrics is served
// from (see wallet_health_poller_test.go for the poller series). The public
// listener does not carry it — listener_test.go states that separately.
type metricsRig struct {
	admin *zip.App
	store *InMemoryStore
	api   *API
}

func newMetricsRig(t *testing.T) *metricsRig {
	t.Helper()
	store := NewInMemoryStore()
	api := NewAPI(Config{}, "", nil, nil, nil, store)
	admin := zip.New(zip.Config{AppName: "lux-bridge-test-metrics", DisableStartupMessage: true})
	admin.Use(middleware.Recover(), middleware.RequestID())
	api.RegisterAdmin(admin)
	return &metricsRig{admin: admin, store: store, api: api}
}

func scrapeMetrics(t *testing.T, rig *metricsRig) string {
	t.Helper()
	_, body := fireRequest(t, rig.admin, "GET", "/metrics", nil)
	return string(body)
}

// TestMetrics_BTCConfirmGateCounters verifies the confirmation-gate
// series surface once a broadcast driver is wired — and are absent
// (not zero-faked) without one.
func TestMetrics_BTCConfirmGateCounters(t *testing.T) {
	rig := newMetricsRig(t)

	body := scrapeMetrics(t, rig)
	if strings.Contains(body, "bridge_btc_confirm_checks_total") {
		t.Errorf("confirm-gate series must be absent with no broadcast driver wired\n--- body ---\n%s", body)
	}

	bd := NewBroadcastDriver(NewInMemoryStore(), newFakeBroadcaster(), time.Hour, nil)
	bd.confirmChecks.Store(9)
	bd.confirmTimeouts.Store(2)
	bd.rebuilds.Store(3)
	rig.api.SetBroadcastDriver(bd)

	body = scrapeMetrics(t, rig)
	for _, want := range []string{
		"bridge_btc_confirm_checks_total 9",
		"bridge_btc_confirm_timeouts_total 2",
		"bridge_broadcast_rebuilds_total 3",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("missing %q\n--- body ---\n%s", want, body)
		}
	}
}
