package main

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/luxfi/bridge/internal/secrets"
)

// TestFamilyFor pins the routing contract: the three ed25519 families
// (Solana, TON, XRP) — including their release-wallet IDs — go to eddsa;
// everything else (EVM, BTC) goes to ecdsa. Must stay in lockstep with
// cmd/mpcd-single's familyFor.
func TestFamilyFor(t *testing.T) {
	cases := []struct {
		wallet string
		want   string
	}{
		{"bridge-solana_devnet-1780358616618", "eddsa"},
		{"release-wallet-SOLANA_DEVNET", "eddsa"},
		{"bridge-sol_mainnet-1", "eddsa"},
		{"bridge-ton_testnet-1780520000000", "eddsa"},
		{"release-wallet-TON_TESTNET", "eddsa"},
		{"bridge-xrp_testnet-1780600000000", "eddsa"},
		{"release-wallet-XRP_TESTNET", "eddsa"},
		{"bridge-ethereum_sepolia-1780358616634", "ecdsa"},
		{"release-wallet-ETHEREUM_SEPOLIA", "ecdsa"},
		{"bridge-bitcoin_testnet-1", "ecdsa"},
		{"release-wallet-BITCOIN_TESTNET", "ecdsa"},
		{"", "ecdsa"}, // unknown / empty defaults to the ECDSA cluster
	}
	for _, tc := range cases {
		if got := familyFor(tc.wallet); got != tc.want {
			t.Errorf("familyFor(%q) = %q, want %q", tc.wallet, got, tc.want)
		}
	}
}

// backendRig records what a fake MPC backend received so tests can assert
// on routing, body fidelity, and auth headers.
type backendRig struct {
	server   *httptest.Server
	hits     atomic.Int64
	lastBody atomic.Value // string
	lastAuth atomic.Value // string
	status   int
	reply    string
}

func newBackendRig(t *testing.T, status int, reply string) *backendRig {
	t.Helper()
	b := &backendRig{status: status, reply: reply}
	b.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b.hits.Add(1)
		body, _ := io.ReadAll(r.Body)
		b.lastBody.Store(string(body))
		b.lastAuth.Store(r.Header.Get("Authorization"))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(b.status)
		_, _ = w.Write([]byte(b.reply))
	}))
	t.Cleanup(b.server.Close)
	return b
}

func newTestRouter(t *testing.T, eddsa, ecdsa *backendRig, edTok, ecTok string) *router {
	t.Helper()
	return &router{
		eddsaURL:   eddsa.server.URL,
		eddsaToken: edTok,
		ecdsaURL:   ecdsa.server.URL,
		ecdsaToken: ecTok,
		client:     &http.Client{Timeout: 5 * time.Second},
	}
}

func post(t *testing.T, srv *httptest.Server, path, body string) (int, string) {
	t.Helper()
	resp, err := http.Post(srv.URL+path, "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatalf("POST %s: %v", path, err)
	}
	defer func() { _ = resp.Body.Close() }()
	out, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, string(out)
}

// A Solana wallet_id hits the eddsa backend and nothing else; an Ethereum
// wallet_id hits the ecdsa backend and nothing else.
func TestRouter_RoutesByFamily(t *testing.T) {
	eddsa := newBackendRig(t, http.StatusOK, `{"result_type":"success","backend":"eddsa"}`)
	ecdsa := newBackendRig(t, http.StatusOK, `{"result_type":"success","backend":"ecdsa"}`)
	front := httptest.NewServer(newTestRouter(t, eddsa, ecdsa, "", "ecdsa-secret").mux())
	t.Cleanup(front.Close)

	status, body := post(t, front, "/keygen", `{"wallet_id":"bridge-solana_devnet-1","org_id":"o"}`)
	if status != http.StatusOK || !strings.Contains(body, `"backend":"eddsa"`) {
		t.Fatalf("solana keygen: status=%d body=%s, want 200 + eddsa", status, body)
	}
	if eddsa.hits.Load() != 1 || ecdsa.hits.Load() != 0 {
		t.Fatalf("after solana keygen: eddsa=%d ecdsa=%d, want 1/0", eddsa.hits.Load(), ecdsa.hits.Load())
	}

	status, body = post(t, front, "/sign", `{"wallet_id":"release-wallet-ETHEREUM_SEPOLIA","message":"0xdead"}`)
	if status != http.StatusOK || !strings.Contains(body, `"backend":"ecdsa"`) {
		t.Fatalf("eth sign: status=%d body=%s, want 200 + ecdsa", status, body)
	}
	if ecdsa.hits.Load() != 1 || eddsa.hits.Load() != 1 {
		t.Fatalf("after eth sign: eddsa=%d ecdsa=%d, want 1/1", eddsa.hits.Load(), ecdsa.hits.Load())
	}
}

// The chosen backend receives the original body verbatim plus the
// backend-specific bearer token; the no-token backend gets no auth header.
func TestRouter_ForwardsBodyAndToken(t *testing.T) {
	eddsa := newBackendRig(t, http.StatusOK, `{}`)
	ecdsa := newBackendRig(t, http.StatusOK, `{}`)
	front := httptest.NewServer(newTestRouter(t, eddsa, ecdsa, "", "ecdsa-secret").mux())
	t.Cleanup(front.Close)

	ecdsaBody := `{"wallet_id":"bridge-ethereum_sepolia-1","org_id":"o","extra":"keep-me"}`
	post(t, front, "/keygen", ecdsaBody)
	if got := ecdsa.lastBody.Load().(string); got != ecdsaBody {
		t.Errorf("ecdsa backend body = %q, want verbatim %q", got, ecdsaBody)
	}
	if got := ecdsa.lastAuth.Load().(string); got != "Bearer ecdsa-secret" {
		t.Errorf("ecdsa auth = %q, want %q", got, "Bearer ecdsa-secret")
	}

	post(t, front, "/keygen", `{"wallet_id":"bridge-solana_devnet-1"}`)
	if got := eddsa.lastAuth.Load().(string); got != "" {
		t.Errorf("eddsa auth = %q, want empty (mpcd-single needs none)", got)
	}
}

// A backend's non-200 status is passed through unchanged so the bridge can
// distinguish an auth failure from a routing failure.
func TestRouter_PreservesBackendStatus(t *testing.T) {
	eddsa := newBackendRig(t, http.StatusOK, `{}`)
	ecdsa := newBackendRig(t, http.StatusUnauthorized, `{"error":"bad token"}`)
	front := httptest.NewServer(newTestRouter(t, eddsa, ecdsa, "", "wrong").mux())
	t.Cleanup(front.Close)

	status, body := post(t, front, "/sign", `{"wallet_id":"bridge-ethereum_sepolia-1"}`)
	if status != http.StatusUnauthorized || !strings.Contains(body, "bad token") {
		t.Fatalf("status=%d body=%s, want 401 + upstream body", status, body)
	}
}

func TestRouter_Health(t *testing.T) {
	eddsa := newBackendRig(t, http.StatusOK, `{}`)
	ecdsa := newBackendRig(t, http.StatusOK, `{}`)
	front := httptest.NewServer(newTestRouter(t, eddsa, ecdsa, "", "").mux())
	t.Cleanup(front.Close)

	resp, err := http.Get(front.URL + "/healthz")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = resp.Body.Close() }()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK || !strings.Contains(string(body), `"status":"ok"`) {
		t.Fatalf("healthz: status=%d body=%s, want 200 + ok", resp.StatusCode, body)
	}
	// Health must not touch the backends.
	if eddsa.hits.Load() != 0 || ecdsa.hits.Load() != 0 {
		t.Fatalf("healthz probed backends: eddsa=%d ecdsa=%d, want 0/0", eddsa.hits.Load(), ecdsa.hits.Load())
	}
}

// Empty token URI stays empty without a secrets source; an unprefixed
// value resolves to itself (literal back-compat with the smoke default).
func TestResolveToken(t *testing.T) {
	r := secrets.Default()
	got, err := resolveToken(context.Background(), r, "")
	if err != nil || got != "" {
		t.Fatalf("resolveToken(empty) = (%q, %v), want (\"\", nil)", got, err)
	}
	got, err = resolveToken(context.Background(), r, "bridge-testnet-key")
	if err != nil || got != "bridge-testnet-key" {
		t.Fatalf("resolveToken(literal) = (%q, %v), want (bridge-testnet-key, nil)", got, err)
	}
}
