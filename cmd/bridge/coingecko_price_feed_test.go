package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// fakeCG builds an httptest.Server that answers /simple/price with
// the supplied id→usd table and counts requests.
func fakeCG(t *testing.T, prices map[string]float64) (*httptest.Server, *int32) {
	t.Helper()
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		if !strings.HasSuffix(r.URL.Path, "/simple/price") {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		var b strings.Builder
		b.WriteString("{")
		first := true
		for id, usd := range prices {
			if !first {
				b.WriteString(",")
			}
			first = false
			fmt.Fprintf(&b, "%q:{\"usd\":%v}", id, usd)
		}
		b.WriteString("}")
		_, _ = w.Write([]byte(b.String()))
	}))
	t.Cleanup(srv.Close)
	return srv, &calls
}

func TestCoinGeckoFeed_ReturnsMappedPrice(t *testing.T) {
	srv, calls := fakeCG(t, map[string]float64{
		"ethereum": 4200.0,
		"bitcoin":  70000.0,
	})

	f := NewCoinGeckoFeed(srv.URL, "", map[string]string{
		"ETH": "ethereum",
		"BTC": "bitcoin",
	})

	v, err := f.Price(context.Background(), "ETH")
	if err != nil {
		t.Fatalf("ETH: %v", err)
	}
	if v != 4200.0 {
		t.Errorf("ETH = %v, want 4200", v)
	}
	v, err = f.Price(context.Background(), "btc") // case-insensitive
	if err != nil {
		t.Fatalf("BTC: %v", err)
	}
	if v != 70000.0 {
		t.Errorf("BTC = %v, want 70000", v)
	}

	if got := atomic.LoadInt32(calls); got != 1 {
		t.Errorf("expected 1 batched HTTP call, got %d", got)
	}
}

func TestCoinGeckoFeed_UnknownSymbol_ReturnsErrPriceUnknown(t *testing.T) {
	srv, _ := fakeCG(t, map[string]float64{"ethereum": 4200})
	f := NewCoinGeckoFeed(srv.URL, "", map[string]string{"ETH": "ethereum"})

	_, err := f.Price(context.Background(), "LUX")
	if !errors.Is(err, ErrPriceUnknown) {
		t.Fatalf("LUX expected ErrPriceUnknown, got %v", err)
	}
}

func TestCoinGeckoFeed_CachesWithinTTL(t *testing.T) {
	srv, calls := fakeCG(t, map[string]float64{"ethereum": 4200})
	f := NewCoinGeckoFeed(srv.URL, "", map[string]string{"ETH": "ethereum"})
	f.CacheTTL = 5 * time.Second

	for i := 0; i < 5; i++ {
		if _, err := f.Price(context.Background(), "ETH"); err != nil {
			t.Fatal(err)
		}
	}
	if got := atomic.LoadInt32(calls); got != 1 {
		t.Errorf("expected single fetch within TTL, got %d", got)
	}
}

func TestCoinGeckoFeed_HTTPError_Propagates(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "rate limited", http.StatusTooManyRequests)
	}))
	t.Cleanup(srv.Close)

	f := NewCoinGeckoFeed(srv.URL, "", map[string]string{"ETH": "ethereum"})
	_, err := f.Price(context.Background(), "ETH")
	if err == nil {
		t.Fatal("expected error on 429, got nil")
	}
	if !strings.Contains(err.Error(), "429") {
		t.Errorf("expected error to mention 429, got %v", err)
	}
}

func TestCoinGeckoFeed_SendsAPIKeyHeader(t *testing.T) {
	var seenKey string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenKey = r.Header.Get("x-cg-pro-api-key")
		_, _ = w.Write([]byte(`{"ethereum":{"usd":1}}`))
	}))
	t.Cleanup(srv.Close)

	f := NewCoinGeckoFeed(srv.URL, "secret-key", map[string]string{"ETH": "ethereum"})
	if _, err := f.Price(context.Background(), "ETH"); err != nil {
		t.Fatal(err)
	}
	if seenKey != "secret-key" {
		t.Errorf("api key header = %q, want %q", seenKey, "secret-key")
	}
}

func TestFallbackFeed_PrimarySucceeds(t *testing.T) {
	p := NewStaticPriceFeed(map[string]float64{"ETH": 4000})
	s := NewStaticPriceFeed(map[string]float64{"ETH": 100})
	f := &FallbackFeed{Primary: p, Secondary: s}

	v, err := f.Price(context.Background(), "ETH")
	if err != nil || v != 4000 {
		t.Errorf("ETH = %v err=%v, want 4000 nil", v, err)
	}
}

func TestFallbackFeed_FallsBackOnUnknown(t *testing.T) {
	p := NewStaticPriceFeed(nil) // knows nothing
	s := NewStaticPriceFeed(map[string]float64{"LUX": 2.5})

	called := false
	f := &FallbackFeed{
		Primary: p, Secondary: s,
		OnFallback: func(asset string, err error) { called = true },
	}
	v, err := f.Price(context.Background(), "LUX")
	if err != nil || v != 2.5 {
		t.Errorf("LUX = %v err=%v, want 2.5 nil", v, err)
	}
	if !called {
		t.Error("OnFallback hook not called")
	}
}

func TestFallbackFeed_BothFail_SurfacesNetworkError(t *testing.T) {
	// Primary errors with a non-Unknown error (simulating rate-limit /
	// network failure). Secondary doesn't know the asset either. The
	// FallbackFeed should surface the network error, not the asset-
	// unknown one — operators need to see CoinGecko is broken.
	primary := errFeed{err: errors.New("network down")}
	secondary := NewStaticPriceFeed(nil)
	f := &FallbackFeed{Primary: primary, Secondary: secondary}

	_, err := f.Price(context.Background(), "ETH")
	if err == nil || !strings.Contains(err.Error(), "network down") {
		t.Errorf("expected network-down surfaced, got %v", err)
	}
}

type errFeed struct{ err error }

func (e errFeed) Price(_ context.Context, _ string) (float64, error) { return 0, e.err }
