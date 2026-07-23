package mchain

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"
)

// keygenStub returns a fake mpcd /keygen endpoint that hands back a
// pre-canned response and counts the number of times it was hit.
// Wallet IDs are derived from the count so a test can prove that
// GetOrCreate isn't minting twice.
func keygenStub(t *testing.T) (*httptest.Server, *int64) {
	t.Helper()
	var calls int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/keygen" {
			http.NotFound(w, r)
			return
		}
		n := atomic.AddInt64(&calls, 1)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"wallet_id":   "release-test-" + itoa(int(n)),
			"eth_address": "0xE000000000000000000000000000000000000000",
			"result_type": "success",
		})
	}))
	t.Cleanup(srv.Close)
	return srv, &calls
}

func itoa(n int) string {
	const digits = "0123456789"
	if n == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = digits[n%10]
		n /= 10
	}
	return string(buf[i:])
}

func newClientForStub(srv *httptest.Server) *Client {
	return &Client{
		APIURL:  srv.URL,
		OrgID:   "test-org",
		Timeout: 2 * time.Second,
	}
}

func TestFileReleaseStore_GetOrCreate_IsIdempotent(t *testing.T) {
	srv, calls := keygenStub(t)
	client := newClientForStub(srv)

	store, err := NewFileReleaseStore(client, "")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	ctx := context.Background()
	w1, err := store.GetOrCreate(ctx, "LUX_TESTNET")
	if err != nil {
		t.Fatalf("first GetOrCreate: %v", err)
	}
	w2, err := store.GetOrCreate(ctx, "LUX_TESTNET")
	if err != nil {
		t.Fatalf("second GetOrCreate: %v", err)
	}
	if w1.Name != w2.Name || w1.Address != w2.Address {
		t.Errorf("expected same wallet on second call, got %+v vs %+v", w1, w2)
	}
	if got := atomic.LoadInt64(calls); got != 1 {
		t.Errorf("expected exactly 1 keygen call, got %d", got)
	}
}

func TestFileReleaseStore_ListReleaseWallets(t *testing.T) {
	srv, _ := keygenStub(t)
	store, _ := NewFileReleaseStore(newClientForStub(srv), "")

	if got := store.ListReleaseWallets(); len(got) != 0 {
		t.Fatalf("expected empty list before any mint, got %+v", got)
	}

	ctx := context.Background()
	lux, err := store.GetOrCreate(ctx, "LUX_TESTNET")
	if err != nil {
		t.Fatalf("GetOrCreate LUX_TESTNET: %v", err)
	}
	base, err := store.GetOrCreate(ctx, "BASE_SEPOLIA")
	if err != nil {
		t.Fatalf("GetOrCreate BASE_SEPOLIA: %v", err)
	}

	got := store.ListReleaseWallets()
	if len(got) != 2 {
		t.Fatalf("expected 2 wallets, got %d: %+v", len(got), got)
	}
	if got["LUX_TESTNET"].Name != lux.Name || got["BASE_SEPOLIA"].Name != base.Name {
		t.Errorf("listed wallets don't match minted wallets: %+v", got)
	}

	// Mutating the returned map must not affect the store's cache —
	// callers (e.g. a health poller on a timer) get a defensive copy.
	entry := got["LUX_TESTNET"]
	entry.Name = "tampered"
	got["LUX_TESTNET"] = entry
	fresh := store.ListReleaseWallets()
	if fresh["LUX_TESTNET"].Name != lux.Name {
		t.Errorf("mutating the returned map leaked into the store: got %+v", fresh["LUX_TESTNET"])
	}
}

func TestFileReleaseStore_DistinctNetworks_DistinctWallets(t *testing.T) {
	srv, _ := keygenStub(t)
	store, _ := NewFileReleaseStore(newClientForStub(srv), "")

	ctx := context.Background()
	lux, _ := store.GetOrCreate(ctx, "LUX_TESTNET")
	base, _ := store.GetOrCreate(ctx, "BASE_SEPOLIA")
	if lux.Name == base.Name {
		t.Errorf("expected distinct wallet IDs across networks, both = %q", lux.Name)
	}
}

func TestFileReleaseStore_PersistsAcrossInstances(t *testing.T) {
	srv, calls := keygenStub(t)
	client := newClientForStub(srv)

	dir := t.TempDir()
	path := filepath.Join(dir, "release-wallets.json")

	first, err := NewFileReleaseStore(client, path)
	if err != nil {
		t.Fatalf("new first store: %v", err)
	}
	w1, err := first.GetOrCreate(context.Background(), "LUX_TESTNET")
	if err != nil {
		t.Fatalf("first mint: %v", err)
	}

	// New store at the same path simulates a process restart.
	second, err := NewFileReleaseStore(client, path)
	if err != nil {
		t.Fatalf("new second store: %v", err)
	}
	w2, err := second.GetOrCreate(context.Background(), "LUX_TESTNET")
	if err != nil {
		t.Fatalf("second mint: %v", err)
	}
	if w1.Name != w2.Name || w1.Address != w2.Address {
		t.Errorf("wallet did not survive restart: %+v vs %+v", w1, w2)
	}
	if got := atomic.LoadInt64(calls); got != 1 {
		t.Errorf("expected the persisted wallet to be reused (1 keygen call), got %d", got)
	}
}

func TestFileReleaseStore_RejectsEmptyNetwork(t *testing.T) {
	srv, _ := keygenStub(t)
	store, _ := NewFileReleaseStore(newClientForStub(srv), "")
	_, err := store.GetOrCreate(context.Background(), "")
	if err == nil {
		t.Fatal("expected an error for empty network, got nil")
	}
}

func TestFileReleaseStore_LoadIgnoresMissingFile(t *testing.T) {
	srv, _ := keygenStub(t)
	// Point at a path that doesn't exist yet — constructor should
	// succeed (missing file = no wallets minted yet).
	dir := t.TempDir()
	path := filepath.Join(dir, "does-not-exist.json")
	_, err := NewFileReleaseStore(newClientForStub(srv), path)
	if err != nil {
		t.Fatalf("expected nil err for missing file, got %v", err)
	}
}

func TestFileReleaseStore_PersistFileShape(t *testing.T) {
	srv, _ := keygenStub(t)
	dir := t.TempDir()
	path := filepath.Join(dir, "release-wallets.json")
	store, _ := NewFileReleaseStore(newClientForStub(srv), path)
	if _, err := store.GetOrCreate(context.Background(), "LUX_TESTNET"); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read persisted file: %v", err)
	}
	var doc struct {
		Version int                `json:"version"`
		Wallets map[string]*Wallet `json:"wallets"`
	}
	if err := json.Unmarshal(data, &doc); err != nil {
		t.Fatalf("decode persisted file: %v\n%s", err, data)
	}
	if doc.Version != releaseStoreVersion {
		t.Errorf("file version = %d, want %d", doc.Version, releaseStoreVersion)
	}
	if w := doc.Wallets["LUX_TESTNET"]; w == nil || w.Address == "" {
		t.Errorf("LUX_TESTNET wallet missing/empty in persisted file: %+v", doc.Wallets)
	}
}

func TestFileReleaseStore_NilClientRejected(t *testing.T) {
	_, err := NewFileReleaseStore(nil, "")
	if err == nil {
		t.Fatal("expected an error for nil client, got nil")
	}
}
