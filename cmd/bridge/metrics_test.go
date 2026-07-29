package main

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/hanzoai/zip"
	middleware "github.com/hanzoai/zip/middleware"
	"github.com/luxfi/bridge/internal/mchain"
)

// metricsRig stands up an API with the same default wiring as the
// swap-handler tests, plus access to the underlying store so the test
// can seed swap rows before scraping /metrics.
type metricsRig struct {
	app   *zip.App
	store *InMemoryStore
	api   *API
}

func newMetricsRig(t *testing.T) *metricsRig {
	t.Helper()
	cfg, _ := LoadConfig("")
	store := NewInMemoryStore()
	engine := &QuoteEngine{Feed: NewStaticPriceFeed(defaultPrices())}
	api := NewAPI(cfg, "", nil, nil, nil, store, engine)
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

// TestMetrics_NilDriversEmitZeros confirms the nil-safe contract:
// when no drivers are wired (e.g. --disable-* flags), /metrics still
// returns a 200 + every documented counter at zero. Prometheus
// scrapers fail hard on absent series, so the contract is "always
// emit the label, even when zero."
func TestMetrics_NilDriversEmitZeros(t *testing.T) {
	rig := newMetricsRig(t)
	body := scrapeMetrics(t, rig)

	mustContain := []string{
		// Pre-existing surface (regression guard).
		"bridge_classical_compat_total",
		"bridge_profile_post_quantum_end_to_end",
		// Signing driver.
		"# TYPE bridge_signing_ticks_total counter",
		"bridge_signing_ticks_total 0",
		"bridge_signing_attempts_total 0",
		"bridge_signing_stale_total 0",
		"bridge_signing_running 0",
		// Broadcast driver.
		"bridge_broadcast_ticks_total 0",
		"bridge_broadcast_skipped_no_raw_tx_total 0",
		"bridge_broadcast_running 0",
		"bridge_btc_confirm_checks_total 0",
		"bridge_btc_confirm_timeouts_total 0",
		// Refund driver — including the new hardening counters.
		"bridge_refund_ticks_total 0",
		"bridge_refund_terminal_failures_total 0",
		"bridge_refund_orphans_recovered_total 0",
		"bridge_refund_running 0",
		// Deposit watcher.
		"bridge_deposit_watcher_ticks_total 0",
		"bridge_deposit_watcher_running 0",
		// MPC pool — both gauges 0 when no pool wired.
		"bridge_mpc_keygen_enabled 0",
		"bridge_mpc_pool_split 0",
		// Per-status gauge — labels MUST appear even when count=0.
		`bridge_swaps_by_status{status="user_deposit_pending"} 0`,
		`bridge_swaps_by_status{status="refunding"} 0`,
		`bridge_swaps_by_status{status="failed"} 0`,
	}
	for _, want := range mustContain {
		if !strings.Contains(body, want) {
			t.Errorf("/metrics body missing %q\n--- body ---\n%s", want, body)
		}
	}
}

// TestMetrics_DriverCountersPromote bumps the live atomic counters on
// real driver structs (the drivers are not run; we exercise the Stats
// surface directly) and asserts /metrics picks up the new values.
func TestMetrics_DriverCountersPromote(t *testing.T) {
	rig := newMetricsRig(t)

	// Signing driver — bump every counter through the public Set*
	// helpers + direct atomic writes for the rest. We don't Run the
	// driver; we only need Stats() to return non-zero so the metrics
	// renderer reflects the change.
	sd := NewSigningDriver(rig.store, &fakeSigner{}, time.Hour, nil)
	sd.ticks.Store(7)
	sd.attempts.Store(11)
	sd.successes.Store(5)
	sd.failures.Store(6)
	sd.listErrors.Store(2)
	sd.stale.Store(3)
	rig.api.SetSigningDriver(sd)

	// Broadcast driver.
	bd := NewBroadcastDriver(rig.store, nil, time.Hour, nil)
	bd.ticks.Store(13)
	bd.attempts.Store(17)
	bd.successes.Store(15)
	bd.failures.Store(2)
	bd.skippedNoRawTx.Store(4)
	bd.listErrors.Store(1)
	bd.confirmChecks.Store(9)
	bd.confirmTimeouts.Store(2)
	rig.api.SetBroadcastDriver(bd)

	// Refund driver — most important since we just shipped two
	// hardening passes whose counters live here.
	rd := NewRefundDriver(rig.store, &fakeSigner{}, nil, nil, time.Hour, time.Hour, nil, nil)
	rd.ticks.Store(19)
	rd.candidates.Store(23)
	rd.successes.Store(8)
	rd.failures.Store(5)
	rd.terminalFailures.Store(2)
	rd.orphansRecovered.Store(1)
	rd.listErrors.Store(3)
	rig.api.SetRefundDriver(rd)

	body := scrapeMetrics(t, rig)
	wantPairs := map[string]string{
		"bridge_signing_ticks_total":            "7",
		"bridge_signing_attempts_total":         "11",
		"bridge_signing_stale_total":            "3",
		"bridge_broadcast_ticks_total":          "13",
		"bridge_broadcast_skipped_no_raw_tx_total": "4",
		"bridge_btc_confirm_checks_total":       "9",
		"bridge_btc_confirm_timeouts_total":     "2",
		"bridge_refund_ticks_total":             "19",
		"bridge_refund_terminal_failures_total": "2",
		"bridge_refund_orphans_recovered_total": "1",
	}
	for metric, val := range wantPairs {
		wantLine := metric + " " + val
		if !strings.Contains(body, wantLine) {
			t.Errorf("missing %q in metrics body\n--- body ---\n%s", wantLine, body)
		}
	}
}

// TestMetrics_MPCPoolGauges verifies the split gauge flips correctly
// after SetMPCPool is called with a split pool. Closes the loop on
// the §13.4 SDK contract: an operator can scrape /metrics to confirm
// --mpc-private-url actually took effect.
func TestMetrics_MPCPoolGauges(t *testing.T) {
	rig := newMetricsRig(t)

	// Wire a split pool.
	pub := mchain.New("http://public:9800", time.Second)
	priv := mchain.New("http://private:9800", time.Second)
	rig.api.SetMPCPool(mchain.NewSplitPool(pub, priv))

	body := scrapeMetrics(t, rig)
	for _, want := range []string{
		"bridge_mpc_keygen_enabled 1",
		"bridge_mpc_pool_split 1",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("split pool: missing %q\n--- body ---\n%s", want, body)
		}
	}

	// Single-cluster pool: enabled but not split.
	rig.api.SetMPCPool(mchain.NewPool(pub))
	body = scrapeMetrics(t, rig)
	for _, want := range []string{
		"bridge_mpc_keygen_enabled 1",
		"bridge_mpc_pool_split 0",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("single-cluster pool: missing %q\n--- body ---\n%s", want, body)
		}
	}
}

// TestMetrics_SwapStatusGauge seeds swaps in three statuses and
// asserts the bridge_swaps_by_status gauge reflects the counts. Other
// statuses must still appear with value 0 (Prometheus contract: stable
// label set).
func TestMetrics_SwapStatusGauge(t *testing.T) {
	rig := newMetricsRig(t)
	ctx := context.Background()

	// Seed: 3 user_deposit_pending, 2 broadcasting, 1 refunding.
	seed := []struct {
		id     string
		status SwapStatus
	}{
		{"swap_dep1", SwapStatusUserDepositPending},
		{"swap_dep2", SwapStatusUserDepositPending},
		{"swap_dep3", SwapStatusUserDepositPending},
		{"swap_bc1", SwapStatusBroadcasting},
		{"swap_bc2", SwapStatusBroadcasting},
		{"swap_rf1", SwapStatusRefunding},
	}
	for _, s := range seed {
		sw := &Swap{ID: s.id, Status: s.status}
		if err := rig.store.Create(ctx, sw); err != nil {
			t.Fatalf("seed %s: %v", s.id, err)
		}
	}

	body := scrapeMetrics(t, rig)
	wantLines := []string{
		`bridge_swaps_by_status{status="user_deposit_pending"} 3`,
		`bridge_swaps_by_status{status="bridge_transfer_pending_broadcasting"} 2`,
		`bridge_swaps_by_status{status="refunding"} 1`,
		// Stable label set — other statuses report 0 even when no rows.
		`bridge_swaps_by_status{status="completed"} 0`,
		`bridge_swaps_by_status{status="failed"} 0`,
	}
	for _, want := range wantLines {
		if !strings.Contains(body, want) {
			t.Errorf("missing %q\n--- body ---\n%s", want, body)
		}
	}
}

// TestMetrics_PrometheusFormatPreamble verifies every emitted metric
// has the HELP + TYPE preamble Prometheus requires. Catches a
// regression where someone adds a metric without the boilerplate.
func TestMetrics_PrometheusFormatPreamble(t *testing.T) {
	rig := newMetricsRig(t)
	body := scrapeMetrics(t, rig)

	// Each metric name must appear with both HELP and TYPE lines.
	for _, name := range []string{
		"bridge_signing_attempts_total",
		"bridge_broadcast_failures_total",
		"bridge_refund_orphans_recovered_total",
		"bridge_deposit_watcher_advances_total",
		"bridge_mpc_pool_split",
		"bridge_swaps_by_status",
	} {
		help := "# HELP " + name + " "
		typeLine := "# TYPE " + name + " "
		if !strings.Contains(body, help) {
			t.Errorf("missing HELP preamble for %s", name)
		}
		if !strings.Contains(body, typeLine) {
			t.Errorf("missing TYPE preamble for %s", name)
		}
	}
}

// (fakeSigner is defined in signing_driver_test.go — reused here.)
