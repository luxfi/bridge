package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	luxlog "github.com/luxfi/log"
)

// keygenServer stands up a minimal httptest server that satisfies the
// mpcd /keygen contract. It records every hit so a test can assert
// which URL (Public vs Private) the pool actually routed a call to.
type keygenServer struct {
	*httptest.Server
	hits atomic.Int64
}

func newKeygenServer(t *testing.T, address string) *keygenServer {
	t.Helper()
	ks := &keygenServer{}
	ks.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasSuffix(r.URL.Path, "/keygen"):
			ks.hits.Add(1)
			// Real mpcd returns the address on the {address: "..."}
			// field within an eth-flavoured body. The bridge client
			// reads it via Wallet.Address — we just need that field
			// populated to satisfy KeygenForDeposit's response parser.
			body := map[string]any{
				"wallet_id":    "test-wallet",
				"address":      address,
				"eth_address":  address,
				"public_key":   "0x" + strings.Repeat("a", 64),
				"eth_public_key": "0x" + strings.Repeat("a", 64),
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(body)
		case strings.HasSuffix(r.URL.Path, "/sign"):
			ks.hits.Add(1)
			body := map[string]any{
				"signature": "0x" + strings.Repeat("b", 130),
				"r":         "0x" + strings.Repeat("c", 64),
				"s":         "0x" + strings.Repeat("d", 64),
				"v":         27,
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(body)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	t.Cleanup(ks.Server.Close)
	return ks
}

func (k *keygenServer) Hits() int64 { return k.hits.Load() }

// TestMPCPool_SplitRoutesKeygenToCorrectCluster proves the central
// claim: pool.Public.KeygenForDeposit lands on publicURL, NOT on
// privateURL, when the pool is built with --mpc-private-url set.
// Symmetric for pool.Private. This is what closes the "SDK declares
// the split, bridge ignores it" gap from §5.3 + §13.4.
func TestMPCPool_SplitRoutesKeygenToCorrectCluster(t *testing.T) {
	pub := newKeygenServer(t, "0xPUBLIC0000000000000000000000000000000000")
	priv := newKeygenServer(t, "0xPRIVATE000000000000000000000000000000000")

	pool, err := buildMPCPool(
		pub.URL, "", "", "bridge",
		priv.URL, "", "", "",
		5*time.Second,
		luxlog.New("service", "test"),
	)
	if err != nil {
		t.Fatalf("buildMPCPool: %v", err)
	}
	if pool == nil {
		t.Fatal("buildMPCPool returned nil with both URLs set")
	}
	if !pool.IsSplit() {
		t.Fatalf("IsSplit() = false; want true (pub=%s priv=%s)", pub.URL, priv.URL)
	}

	ctx := context.Background()

	// Public-role call: per-swap deposit-wallet keygen.
	if _, err := pool.Public.KeygenForDeposit(ctx, "ETHEREUM_SEPOLIA"); err != nil {
		t.Fatalf("pool.Public.KeygenForDeposit: %v", err)
	}
	if pub.Hits() != 1 {
		t.Errorf("public hits = %d, want 1 after pool.Public keygen", pub.Hits())
	}
	if priv.Hits() != 0 {
		t.Errorf("private hits = %d, want 0 — pool.Public must NOT touch the treasury cluster", priv.Hits())
	}

	// Private-role call: release-wallet keygen (treasury).
	if _, err := pool.Private.KeygenForDeposit(ctx, "ETHEREUM_SEPOLIA"); err != nil {
		t.Fatalf("pool.Private.KeygenForDeposit: %v", err)
	}
	if pub.Hits() != 1 {
		t.Errorf("public hits = %d after pool.Private keygen, want still 1", pub.Hits())
	}
	if priv.Hits() != 1 {
		t.Errorf("private hits = %d, want 1 after pool.Private keygen", priv.Hits())
	}
}

// TestMPCPool_SingleClusterBackCompat verifies a deploy that did not
// set --mpc-private-url continues to route both roles to the same
// cluster. Same flag-shape as every existing deploy.
func TestMPCPool_SingleClusterBackCompat(t *testing.T) {
	srv := newKeygenServer(t, "0xSINGLECLUSTER0000000000000000000000000000")

	pool, err := buildMPCPool(
		srv.URL, "", "", "bridge",
		"", "", "", "",
		5*time.Second,
		luxlog.New("service", "test"),
	)
	if err != nil {
		t.Fatalf("buildMPCPool: %v", err)
	}
	if pool == nil {
		t.Fatal("buildMPCPool returned nil for single-cluster (publicURL set, privateURL empty)")
	}
	if pool.IsSplit() {
		t.Fatal("IsSplit() = true; want false (no --mpc-private-url)")
	}
	if pool.Public != pool.Private {
		t.Fatal("Public and Private should be the same client in single-cluster mode")
	}

	ctx := context.Background()

	// Both roles should hit the one server.
	if _, err := pool.Public.KeygenForDeposit(ctx, "ETHEREUM_SEPOLIA"); err != nil {
		t.Fatalf("pool.Public.KeygenForDeposit: %v", err)
	}
	if _, err := pool.Private.KeygenForDeposit(ctx, "LUX_TESTNET"); err != nil {
		t.Fatalf("pool.Private.KeygenForDeposit: %v", err)
	}
	if srv.Hits() != 2 {
		t.Errorf("hits = %d, want 2 (both public + private routes hit the single server)", srv.Hits())
	}
}

// TestMPCPool_NoURLReturnsNil verifies the "MPC disabled" path: when
// neither URL is set, the pool is nil and downstream code falls back
// to the same "no mpc keygen" branches it used pre-pool.
func TestMPCPool_NoURLReturnsNil(t *testing.T) {
	pool, err := buildMPCPool("", "", "", "", "", "", "", "", time.Second, luxlog.New("service", "test"))
	if err != nil {
		t.Fatalf("buildMPCPool: %v", err)
	}
	if pool != nil {
		t.Errorf("pool = %+v, want nil — MPC-disabled path", pool)
	}
}

// TestMPCPool_PrivateAuthDefaultsToPublic verifies the auth-fallback
// rule: when --mpc-private-token and --mpc-private-identity-file are
// both empty, the private client inherits the public token. Saves the
// operator from re-declaring the same token twice when both clusters
// share an auth boundary.
func TestMPCPool_PrivateAuthDefaultsToPublic(t *testing.T) {
	// Track the Authorization header each server sees.
	var pubAuth, privAuth atomic.Value
	pubAuth.Store("")
	privAuth.Store("")

	pubSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		pubAuth.Store(r.Header.Get("Authorization"))
		w.WriteHeader(http.StatusNotFound) // we only care about the header capture
	}))
	t.Cleanup(pubSrv.Close)
	privSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		privAuth.Store(r.Header.Get("Authorization"))
		w.WriteHeader(http.StatusNotFound)
	}))
	t.Cleanup(privSrv.Close)

	pool, err := buildMPCPool(
		pubSrv.URL, "the-shared-token", "", "bridge",
		privSrv.URL, "", "", "", // private auth empty → falls back
		2*time.Second,
		luxlog.New("service", "test"),
	)
	if err != nil {
		t.Fatalf("buildMPCPool: %v", err)
	}
	if pool == nil || !pool.IsSplit() {
		t.Fatalf("expected split pool, got %+v", pool)
	}

	// Fire both — we don't care about the responses, only the auth headers.
	_, _ = pool.Public.KeygenForDeposit(context.Background(), "ETHEREUM_SEPOLIA")
	_, _ = pool.Private.KeygenForDeposit(context.Background(), "ETHEREUM_SEPOLIA")

	wantAuth := "Bearer the-shared-token"
	if got := pubAuth.Load().(string); got != wantAuth {
		t.Errorf("public Authorization = %q, want %q", got, wantAuth)
	}
	if got := privAuth.Load().(string); got != wantAuth {
		t.Errorf("private Authorization = %q, want %q — should inherit public token when --mpc-private-token empty", got, wantAuth)
	}
}

// TestMPCPool_PrivateAuthOverrideWins verifies that explicit
// --mpc-private-token suppresses the public-token fallback.
func TestMPCPool_PrivateAuthOverrideWins(t *testing.T) {
	var pubAuth, privAuth atomic.Value
	pubAuth.Store("")
	privAuth.Store("")

	pubSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		pubAuth.Store(r.Header.Get("Authorization"))
		w.WriteHeader(http.StatusNotFound)
	}))
	t.Cleanup(pubSrv.Close)
	privSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		privAuth.Store(r.Header.Get("Authorization"))
		w.WriteHeader(http.StatusNotFound)
	}))
	t.Cleanup(privSrv.Close)

	pool, err := buildMPCPool(
		pubSrv.URL, "public-tok", "", "bridge",
		privSrv.URL, "private-tok", "", "", // private has its own
		2*time.Second,
		luxlog.New("service", "test"),
	)
	if err != nil {
		t.Fatalf("buildMPCPool: %v", err)
	}

	_, _ = pool.Public.KeygenForDeposit(context.Background(), "ETHEREUM_SEPOLIA")
	_, _ = pool.Private.KeygenForDeposit(context.Background(), "ETHEREUM_SEPOLIA")

	if got, want := pubAuth.Load().(string), "Bearer public-tok"; got != want {
		t.Errorf("public Authorization = %q, want %q", got, want)
	}
	if got, want := privAuth.Load().(string), "Bearer private-tok"; got != want {
		t.Errorf("private Authorization = %q, want %q — explicit override should NOT fall back to public", got, want)
	}
}

// TestMPCPool_PrivateOrgIDDefaultsToPublic verifies the org-id
// fallback parallels the auth one.
func TestMPCPool_PrivateOrgIDDefaultsToPublic(t *testing.T) {
	// Inspect the org_id in the request body. mpcd's contract puts
	// org_id in the JSON payload — pool routing must pass it through.
	type seenBody struct {
		OrgID string `json:"org_id"`
	}
	var privSeen atomic.Value
	privSeen.Store(seenBody{})

	pubSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	t.Cleanup(pubSrv.Close)
	privSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var b seenBody
		_ = json.NewDecoder(r.Body).Decode(&b)
		privSeen.Store(b)
		w.WriteHeader(http.StatusNotFound)
	}))
	t.Cleanup(privSrv.Close)

	pool, err := buildMPCPool(
		pubSrv.URL, "tok", "", "treasury-org",
		privSrv.URL, "", "", "", // private org empty → falls back
		2*time.Second,
		luxlog.New("service", "test"),
	)
	if err != nil {
		t.Fatalf("buildMPCPool: %v", err)
	}

	_, _ = pool.Private.KeygenForDeposit(context.Background(), "ETHEREUM_SEPOLIA")

	got := privSeen.Load().(seenBody)
	if got.OrgID != "treasury-org" {
		t.Errorf("private org_id = %q, want %q — should inherit public org-id when --mpc-private-org-id empty", got.OrgID, "treasury-org")
	}
}
