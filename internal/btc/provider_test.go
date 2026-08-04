package btc

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// =============================================================================
// Construction + network routing.
// =============================================================================

func TestNewProvider_DefaultsTimeoutAndTrimsSlash(t *testing.T) {
	p := NewProvider("https://mempool.space/api/", "https://mempool.space/testnet/api/", 0)
	if p.MainnetURL != "https://mempool.space/api" {
		t.Errorf("MainnetURL = %q, want trailing slash trimmed", p.MainnetURL)
	}
	if p.TestnetURL != "https://mempool.space/testnet/api" {
		t.Errorf("TestnetURL = %q, want trailing slash trimmed", p.TestnetURL)
	}
}

func TestBaseURL_RoutesByNetwork(t *testing.T) {
	p := NewProvider("https://main.example", "https://test.example", time.Second)

	cases := []struct {
		network string
		want    string
	}{
		{"BITCOIN_MAINNET", "https://main.example"},
		{"bitcoin_mainnet", "https://main.example"}, // case-insensitive
		{"BITCOIN_TESTNET", "https://test.example"},
		{"BITCOIN_TESTNET3", "https://test.example"},
	}
	for _, c := range cases {
		got, err := p.baseURL(c.network)
		if err != nil {
			t.Errorf("baseURL(%q): %v", c.network, err)
			continue
		}
		if got != c.want {
			t.Errorf("baseURL(%q) = %q, want %q", c.network, got, c.want)
		}
	}
}

func TestBaseURL_UnconfiguredNetworkErrors(t *testing.T) {
	p := NewProvider("https://main.example", "" /* testnet not configured */, time.Second)
	if _, err := p.baseURL("BITCOIN_TESTNET"); err != ErrNetworkNotConfigured {
		t.Errorf("err = %v, want ErrNetworkNotConfigured", err)
	}
}

func TestBaseURL_UnknownNetworkErrors(t *testing.T) {
	p := NewProvider("https://main.example", "https://test.example", time.Second)
	if _, err := p.baseURL("ETHEREUM_MAINNET"); err == nil {
		t.Fatal("expected an error for an unknown network, got nil")
	}
}

// =============================================================================
// ListUTXOs
// =============================================================================

func TestListUTXOs_FiltersUnconfirmedAndSortsDescending(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/address/bc1qtest/utxo" {
			t.Errorf("path = %q, want /address/bc1qtest/utxo", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode([]map[string]any{
			{"txid": "a", "vout": 0, "value": 5000, "status": map[string]any{"confirmed": true, "block_height": 100}},
			{"txid": "b", "vout": 1, "value": 20000, "status": map[string]any{"confirmed": true, "block_height": 101}},
			{"txid": "c", "vout": 2, "value": 999999, "status": map[string]any{"confirmed": false}}, // mempool-only, excluded
			{"txid": "d", "vout": 3, "value": 10000, "status": map[string]any{"confirmed": true, "block_height": 102}},
		})
	}))
	defer srv.Close()

	p := NewProvider(srv.URL, srv.URL, time.Second)
	utxos, err := p.ListUTXOs(context.Background(), "BITCOIN_MAINNET", "bc1qtest")
	if err != nil {
		t.Fatalf("ListUTXOs: %v", err)
	}
	if len(utxos) != 3 {
		t.Fatalf("len(utxos) = %d, want 3 (unconfirmed excluded)", len(utxos))
	}
	for _, u := range utxos {
		if u.TxID == "c" {
			t.Error("unconfirmed UTXO leaked into the result")
		}
	}
	// Descending by value: b(20000), d(10000), a(5000).
	wantOrder := []string{"b", "d", "a"}
	for i, w := range wantOrder {
		if utxos[i].TxID != w {
			t.Errorf("utxos[%d].TxID = %q, want %q (descending by value)", i, utxos[i].TxID, w)
		}
	}
}

func TestListUTXOs_UnconfiguredNetworkNeverMakesHTTPCall(t *testing.T) {
	p := NewProvider("https://main.example", "" /* testnet unconfigured */, time.Second)
	if _, err := p.ListUTXOs(context.Background(), "BITCOIN_TESTNET", "addr"); err != ErrNetworkNotConfigured {
		t.Errorf("err = %v, want ErrNetworkNotConfigured", err)
	}
}

// =============================================================================
// RecommendedFees
// =============================================================================

func TestRecommendedFees_HappyPath(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"fastestFee": 20, "halfHourFee": 12, "hourFee": 8, "economyFee": 4, "minimumFee": 1,
		})
	}))
	defer srv.Close()

	p := NewProvider(srv.URL, srv.URL, time.Second)
	f, err := p.RecommendedFees(context.Background(), "BITCOIN_MAINNET")
	if err != nil {
		t.Fatalf("RecommendedFees: %v", err)
	}
	if f.HalfHour != 12 || f.Fastest != 20 {
		t.Errorf("fees = %+v, want halfHour=12 fastest=20", f)
	}
}

// TestRecommendedFees_ZeroHalfHourFallsBackToOne pins a real testnet
// quirk noted in the doc comment: testnet sometimes reports zeros, and
// the caller's fee math (feeRate * vsize) would silently build a
// zero-fee transaction if this fallback didn't exist.
func TestRecommendedFees_ZeroHalfHourFallsBackToOne(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"fastestFee": 0, "halfHourFee": 0, "hourFee": 0, "economyFee": 0, "minimumFee": 0,
		})
	}))
	defer srv.Close()

	p := NewProvider(srv.URL, srv.URL, time.Second)
	f, err := p.RecommendedFees(context.Background(), "BITCOIN_MAINNET")
	if err != nil {
		t.Fatalf("RecommendedFees: %v", err)
	}
	if f.HalfHour != 1 {
		t.Errorf("HalfHour = %d, want fallback to 1", f.HalfHour)
	}
}

// =============================================================================
// Broadcast
// =============================================================================

func TestBroadcast_HappyPath(t *testing.T) {
	wantTxID := strings.Repeat("ab", 32) // 64 hex chars
	var gotPath, gotContentType, gotBody string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotContentType = r.Header.Get("Content-Type")
		b, _ := io.ReadAll(r.Body)
		gotBody = string(b)
		_, _ = w.Write([]byte(wantTxID))
	}))
	defer srv.Close()

	p := NewProvider(srv.URL, srv.URL, time.Second)
	txid, err := p.Broadcast(context.Background(), "BITCOIN_MAINNET", "deadbeef")
	if err != nil {
		t.Fatalf("Broadcast: %v", err)
	}
	if txid != wantTxID {
		t.Errorf("txid = %q, want %q", txid, wantTxID)
	}
	if gotPath != "/tx" {
		t.Errorf("path = %q, want /tx", gotPath)
	}
	if gotContentType != "text/plain" {
		t.Errorf("Content-Type = %q, want text/plain", gotContentType)
	}
	if gotBody != "deadbeef" {
		t.Errorf("body = %q, want deadbeef", gotBody)
	}
}

func TestBroadcast_NonOKStatusSurfacesBody(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte("min relay fee not met"))
	}))
	defer srv.Close()

	p := NewProvider(srv.URL, srv.URL, time.Second)
	_, err := p.Broadcast(context.Background(), "BITCOIN_MAINNET", "deadbeef")
	if err == nil || !strings.Contains(err.Error(), "min relay fee not met") {
		t.Errorf("err = %v, want it to surface the upstream rejection reason", err)
	}
}

// A 200 whose body isn't exactly a 64-char txid (e.g. a proxy's HTML
// error page returned with a 200 status) must not be treated as a
// successful broadcast.
func TestBroadcast_UnexpectedBodyLengthRejected(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("not a txid"))
	}))
	defer srv.Close()

	p := NewProvider(srv.URL, srv.URL, time.Second)
	_, err := p.Broadcast(context.Background(), "BITCOIN_MAINNET", "deadbeef")
	if err == nil {
		t.Fatal("expected an error for a non-txid response body, got nil")
	}
}

// =============================================================================
// GetTxStatus
// =============================================================================

func TestGetTxStatus_Confirmed(t *testing.T) {
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"confirmed": true, "block_height": 850000})
	}))
	defer srv.Close()

	p := NewProvider(srv.URL, srv.URL, time.Second)
	status, err := p.GetTxStatus(context.Background(), "BITCOIN_MAINNET", "abcd1234")
	if err != nil {
		t.Fatalf("GetTxStatus: %v", err)
	}
	if !status.Confirmed || status.BlockHeight != 850000 {
		t.Errorf("status = %+v, want confirmed=true block_height=850000", status)
	}
	if gotPath != "/tx/abcd1234/status" {
		t.Errorf("path = %q, want /tx/abcd1234/status", gotPath)
	}
}

func TestGetTxStatus_Unconfirmed(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"confirmed": false})
	}))
	defer srv.Close()

	p := NewProvider(srv.URL, srv.URL, time.Second)
	status, err := p.GetTxStatus(context.Background(), "BITCOIN_MAINNET", "abcd1234")
	if err != nil {
		t.Fatalf("GetTxStatus: %v", err)
	}
	if status.Confirmed {
		t.Error("expected Confirmed=false")
	}
}

// =============================================================================
// Shared transport (doGET) error handling.
// =============================================================================

func TestDoGET_NonOKStatusSurfacesBody(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte("address not found"))
	}))
	defer srv.Close()

	p := NewProvider(srv.URL, srv.URL, time.Second)
	_, err := p.ListUTXOs(context.Background(), "BITCOIN_MAINNET", "bogus")
	if err == nil || !strings.Contains(err.Error(), "address not found") {
		t.Errorf("err = %v, want it to surface the 404 body", err)
	}
}

// =============================================================================
// sortUTXOsDescending — pure function.
// =============================================================================

func TestSortUTXOsDescending(t *testing.T) {
	u := []UTXO{{TxID: "low", Value: 1}, {TxID: "high", Value: 100}, {TxID: "mid", Value: 50}}
	sortUTXOsDescending(u)
	want := []string{"high", "mid", "low"}
	for i, w := range want {
		if u[i].TxID != w {
			t.Errorf("u[%d].TxID = %q, want %q", i, u[i].TxID, w)
		}
	}
}

func TestSortUTXOsDescending_EmptyAndSingle(t *testing.T) {
	empty := []UTXO{}
	sortUTXOsDescending(empty) // must not panic
	single := []UTXO{{TxID: "only", Value: 1}}
	sortUTXOsDescending(single)
	if single[0].TxID != "only" {
		t.Error("single-element slice mutated unexpectedly")
	}
}
