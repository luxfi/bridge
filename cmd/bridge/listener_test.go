package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/luxfi/bridge/internal/depositcheck"
)

// The public listener is the one the edge routes: k8s/bridge-deployment.yaml
// sends bridge.lux.network / at it, so every path mounted there answers the
// internet. Swap ids, MPC signatures, signed destination transactions,
// release-wallet ids and a source-chain RPC poll driven by caller-supplied
// arguments are all operator material; they belong on the second listener
// (main.go --admin-addr), which the ingress does not route.
//
// Each case below states one thing the public listener does not serve. The
// matching positive control — the admin listener does serve it — sits beside
// it, so a route that disappears entirely cannot pass this file.

// seedSigned writes a swap carrying both pieces of signed material a caller
// must not be able to read anonymously.
func seedSigned(t *testing.T, rig *testRig) *Swap {
	t.Helper()
	sw := &Swap{
		ID:                 "swap-signed",
		Status:             SwapStatusBroadcasting,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		DestinationNetwork: "LUX_TESTNET",
		DestinationAddress: "0xabc",
		Signature:          "0xdeadbeefsignature",
		DestRawTx:          "0x02f8730180843b9aca00rawtx",
	}
	if err := rig.store.Create(t.Context(), sw); err != nil {
		t.Fatalf("seed swap: %v", err)
	}
	return sw
}

func TestPublicListenerHasNoSwapList(t *testing.T) {
	rig := newRig(t, nil, nil, nil)
	sw := seedSigned(t, rig)

	// Create keeps this path, so a refusal here reads 405 rather than 404.
	for _, path := range []string{"/v1/bridge/swaps", "/api/swaps"} {
		status, body := fireRequest(t, rig.app, http.MethodGet, path, nil)
		if status == http.StatusOK {
			t.Errorf("GET %s on the public listener answered 200; body=%s", path, body)
		}
		if strings.Contains(string(body), sw.ID) || strings.Contains(string(body), sw.DestRawTx) {
			t.Errorf("GET %s handed out a swap id or a signed destination tx: %s", path, body)
		}
	}
}

func TestPublicListenerHasNoMetrics(t *testing.T) {
	rig := newRig(t, nil, nil, nil)
	status, body := fireRequest(t, rig.app, http.MethodGet, "/metrics", nil)
	if status != http.StatusNotFound {
		t.Errorf("GET /metrics on the public listener answered %d; body=%s", status, body)
	}
}

func TestPublicListenerHasNoDepositCheck(t *testing.T) {
	rig := newRig(t, nil, nil, &depositcheck.Client{Timeout: time.Second})
	body, _ := json.Marshal(checkDepositReq{Network: "ETHEREUM_SEPOLIA", Address: "0xabc", Amount: 1})
	status, resp := fireRequest(t, rig.app, http.MethodPost, "/v1/bridge/check-deposit", body)
	if status != http.StatusNotFound {
		t.Errorf("POST /v1/bridge/check-deposit on the public listener answered %d; body=%s", status, resp)
	}
}

// Positive controls. Each of the three above is a route that moved, not a
// route that was deleted: an operator still reads the list, scrapes the
// metrics and runs the deposit poll, on the listener the edge does not route.
func TestOperatorListenerServesWhatThePublicOneWithholds(t *testing.T) {
	rig := newRig(t, nil, nil, &depositcheck.Client{Timeout: time.Second})
	sw := seedSigned(t, rig)

	status, body := fireRequest(t, rig.admin, http.MethodGet, "/v1/bridge/swaps", nil)
	if status != http.StatusOK {
		t.Fatalf("swap list on the operator listener answered %d; body=%s", status, body)
	}
	// The list is where the signed material lives — decoding a rejected
	// destination tx is the reason these fields exist.
	for _, want := range []string{sw.ID, sw.Signature, sw.DestRawTx} {
		if !strings.Contains(string(body), want) {
			t.Errorf("swap list is missing %q: %s", want, body)
		}
	}

	if status, body = fireRequest(t, rig.admin, http.MethodGet, "/metrics", nil); status != http.StatusOK {
		t.Errorf("/metrics on the operator listener answered %d; body=%s", status, body)
	}
	poll, _ := json.Marshal(checkDepositReq{Network: "POLKADOT_MAINNET", Address: "1abc", Amount: 1})
	if status, body = fireRequest(t, rig.admin, http.MethodPost, "/v1/bridge/check-deposit", poll); status == http.StatusNotFound {
		t.Errorf("deposit poll on the operator listener answered 404; body=%s", body)
	}
}

// With no swap store and no b-chain the swap routes reverse-proxy to the
// legacy backend instead, and the list is exposed there the same way. The
// backend records what reaches it, so this reads the forwarding decision
// rather than the response.
func TestPublicListenerDoesNotForwardTheSwapList(t *testing.T) {
	var seen []string
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = append(seen, r.Method+" "+r.URL.Path)
		_, _ = w.Write([]byte(`{"data":[]}`))
	}))
	t.Cleanup(backend.Close)

	api := NewAPI(Config{}, backend.URL, nil, nil, nil, NewInMemoryStore())
	public, admin := listeners(api)

	if _, body := fireRequest(t, public, http.MethodGet, "/api/swaps", nil); strings.Contains(string(body), `"data"`) {
		t.Errorf("public GET /api/swaps was answered by the backend: %s", body)
	}
	// Create still goes through, so the branch under test is wired.
	fireRequest(t, public, http.MethodPost, "/api/swaps", []byte(`{}`))
	fireRequest(t, admin, http.MethodGet, "/api/swaps", nil)

	want := []string{"POST /api/swaps", "GET /api/swaps"}
	if strings.Join(seen, ", ") != strings.Join(want, ", ") {
		t.Errorf("backend saw %v, want %v", seen, want)
	}
}

// A swap id is a capability, and the holder of one is the person who made the
// swap. What they get back is still their swap's progress, not the signature
// the MPC cluster minted or the destination transaction it signed.
func TestSwapReadWithholdsSignedMaterial(t *testing.T) {
	rig := newRig(t, nil, nil, nil)
	sw := seedSigned(t, rig)

	status, body := fireRequest(t, rig.app, http.MethodGet, "/v1/bridge/swaps/"+sw.ID, nil)
	if status != http.StatusOK {
		t.Fatalf("status = %d, body=%s", status, body)
	}
	if strings.Contains(string(body), sw.Signature) {
		t.Errorf("swap read returned the MPC signature: %s", body)
	}
	if strings.Contains(string(body), sw.DestRawTx) {
		t.Errorf("swap read returned the signed destination tx: %s", body)
	}
}
