package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/luxfi/bridge/internal/mchain"
)

// stubLister is a minimal in-memory mchain.ReleaseWalletLister for
// tests that don't need the real FileReleaseStore's persistence.
type stubLister struct {
	wallets map[string]mchain.Wallet
}

func (s *stubLister) ListReleaseWallets() map[string]mchain.Wallet {
	out := make(map[string]mchain.Wallet, len(s.wallets))
	for k, v := range s.wallets {
		out[k] = v
	}
	return out
}

// signStubServer serves /sign, either always succeeding or always
// failing (per-wallet-id override supported for mixed scenarios), and
// counts calls per wallet.
type signStubServer struct {
	*httptest.Server
	calls   atomic.Int64
	failFor map[string]bool
	delay   time.Duration
}

func newSignStubServer(t *testing.T, failFor map[string]bool, delay time.Duration) *signStubServer {
	t.Helper()
	s := &signStubServer{failFor: failFor, delay: delay}
	s.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s.calls.Add(1)
		if s.delay > 0 {
			time.Sleep(s.delay)
		}
		var body struct {
			WalletID string `json:"wallet_id"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		w.Header().Set("Content-Type", "application/json")
		if s.failFor[body.WalletID] {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"wallet_id":   body.WalletID,
				"result_type": "error",
				"error":       "no quorum",
			})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"wallet_id":   body.WalletID,
			"signature":   "0xdeadbeef",
			"result_type": "success",
		})
	}))
	t.Cleanup(s.Server.Close)
	return s
}

func TestWalletHealthPoller_CheckAll_SignableAndUnsignable(t *testing.T) {
	srv := newSignStubServer(t, map[string]bool{"wallet-ton": true}, 0)
	client := &mchain.Client{APIURL: srv.URL, OrgID: "bridge", Timeout: time.Second}
	lister := &stubLister{wallets: map[string]mchain.Wallet{
		"SOLANA_MAINNET": {Name: "wallet-sol", Address: "sol-addr"},
		"TON_MAINNET":    {Name: "wallet-ton", Address: "ton-addr"},
	}}

	poller := NewWalletHealthPoller(client, lister, time.Hour, nil)
	poller.checkAll(context.Background())

	snap := poller.Snapshot()
	if len(snap) != 2 {
		t.Fatalf("snapshot len = %d, want 2: %+v", len(snap), snap)
	}
	sol := snap["SOLANA_MAINNET"]
	if !sol.Signable || sol.LastError != "" || sol.WalletID != "wallet-sol" {
		t.Errorf("SOL health = %+v, want Signable=true no error", sol)
	}
	ton := snap["TON_MAINNET"]
	if ton.Signable || !strings.Contains(ton.LastError, "no quorum") {
		t.Errorf("TON health = %+v, want Signable=false with 'no quorum' error", ton)
	}
	if srv.calls.Load() != 2 {
		t.Errorf("sign calls = %d, want 2", srv.calls.Load())
	}
}

func TestWalletHealthPoller_CanaryDoesNotBroadcastOrStateChange(t *testing.T) {
	// The canary sign must be indistinguishable from a no-op to
	// anything downstream of SignForWallet — this test just pins that
	// the poller discards the returned signature and never calls
	// anything but /sign (no broadcast/keygen endpoints hit).
	var hitPaths []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hitPaths = append(hitPaths, r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"wallet_id": "w", "signature": "0xabc", "result_type": "success",
		})
	}))
	t.Cleanup(srv.Close)

	client := &mchain.Client{APIURL: srv.URL, OrgID: "bridge", Timeout: time.Second}
	lister := &stubLister{wallets: map[string]mchain.Wallet{
		"XRP_MAINNET": {Name: "w", Address: "r..."},
	}}
	poller := NewWalletHealthPoller(client, lister, time.Hour, nil)
	poller.checkAll(context.Background())

	if len(hitPaths) != 1 || hitPaths[0] != "/sign" {
		t.Errorf("hit paths = %v, want exactly one call to /sign", hitPaths)
	}
}

func TestWalletHealthPoller_TimeoutSurfacesAsUnsignable(t *testing.T) {
	srv := newSignStubServer(t, nil, 50*time.Millisecond)
	client := &mchain.Client{APIURL: srv.URL, OrgID: "bridge", Timeout: time.Second}
	lister := &stubLister{wallets: map[string]mchain.Wallet{
		"TON_MAINNET": {Name: "wallet-ton"},
	}}
	poller := NewWalletHealthPoller(client, lister, time.Hour, nil)
	poller.timeout = 5 * time.Millisecond // force the canary call to time out

	poller.checkAll(context.Background())
	h := poller.Snapshot()["TON_MAINNET"]
	if h.Signable {
		t.Errorf("expected Signable=false on timeout, got %+v", h)
	}
	if h.LastError == "" {
		t.Error("expected a non-empty LastError on timeout")
	}
}

func TestWalletHealthPoller_NilClientOrLister_RunIsNoop(t *testing.T) {
	lister := &stubLister{wallets: map[string]mchain.Wallet{"X": {Name: "w"}}}
	p1 := NewWalletHealthPoller(nil, lister, time.Millisecond, nil)
	if err := p1.Run(context.Background()); err != nil {
		t.Errorf("Run with nil client: err = %v, want nil", err)
	}
	if p1.Running() {
		t.Error("nil-client poller should never report Running")
	}

	client := &mchain.Client{APIURL: "http://unused", OrgID: "bridge", Timeout: time.Second}
	p2 := NewWalletHealthPoller(client, nil, time.Millisecond, nil)
	if err := p2.Run(context.Background()); err != nil {
		t.Errorf("Run with nil lister: err = %v, want nil", err)
	}
}

func TestWalletHealthPoller_RunTicksAndStops(t *testing.T) {
	srv := newSignStubServer(t, nil, 0)
	client := &mchain.Client{APIURL: srv.URL, OrgID: "bridge", Timeout: time.Second}
	lister := &stubLister{wallets: map[string]mchain.Wallet{"SOLANA_MAINNET": {Name: "wallet-sol"}}}
	poller := NewWalletHealthPoller(client, lister, 10*time.Millisecond, nil)

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- poller.Run(ctx) }()

	deadline := time.Now().Add(time.Second)
	for !poller.Running() && time.Now().Before(deadline) {
		time.Sleep(2 * time.Millisecond)
	}
	if !poller.Running() {
		t.Fatal("poller never started")
	}
	// Give it a couple of ticks.
	time.Sleep(30 * time.Millisecond)
	if srv.calls.Load() < 2 {
		t.Errorf("sign calls = %d, want >= 2 after multiple ticks", srv.calls.Load())
	}

	cancel()
	select {
	case err := <-done:
		if err != nil && !errors.Is(err, context.Canceled) {
			t.Errorf("Run err = %v, want context.Canceled or nil", err)
		}
	case <-time.After(time.Second):
		t.Fatal("Run did not return after cancel")
	}
	poller.Stop()
	poller.Stop() // idempotent
}

func TestWalletHealthPoller_Metrics_Wiring(t *testing.T) {
	srv := newSignStubServer(t, map[string]bool{"wallet-ton": true}, 0)
	client := &mchain.Client{APIURL: srv.URL, OrgID: "bridge", Timeout: time.Second}
	lister := &stubLister{wallets: map[string]mchain.Wallet{
		"SOLANA_MAINNET": {Name: "wallet-sol"},
		"TON_MAINNET":    {Name: "wallet-ton"},
	}}
	poller := NewWalletHealthPoller(client, lister, time.Hour, nil)
	poller.checkAll(context.Background())

	rig := newMetricsRig(t)
	rig.api.SetWalletHealthPoller(poller)
	body := scrapeMetrics(t, rig)

	for _, want := range []string{
		`bridge_release_wallet_signable{network="SOLANA_MAINNET",wallet_id="wallet-sol"} 1`,
		`bridge_release_wallet_signable{network="TON_MAINNET",wallet_id="wallet-ton"} 0`,
		"bridge_release_wallet_sign_latency_ms{network=",
		"bridge_release_wallet_last_check_age_seconds{network=",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("missing %q\n--- body ---\n%s", want, body)
		}
	}
}

func TestMetrics_NoWalletHealthPoller_EmitsNoSignableSeries(t *testing.T) {
	rig := newMetricsRig(t)
	body := scrapeMetrics(t, rig)
	if strings.Contains(body, "bridge_release_wallet_signable{") {
		t.Errorf("expected no bridge_release_wallet_signable series when no poller is wired\n--- body ---\n%s", body)
	}
	if !strings.Contains(body, "bridge_wallet_health_poller_running 0") {
		t.Errorf("missing bridge_wallet_health_poller_running 0\n--- body ---\n%s", body)
	}
}
