package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"
)

// coingecko_price_feed.go: HTTP PriceFeed backed by CoinGecko's
// simple/price endpoint. Drop-in replacement for StaticPriceFeed.
//
// Behavior:
//   - Symbol → CoinGecko ID translation via IDMap (e.g. "ETH" → "ethereum").
//     Symbols not in IDMap return ErrPriceUnknown (so a FallbackFeed can
//     route them to the static feed — useful for LUX/ZOO which CoinGecko
//     doesn't list).
//   - One batched HTTP call per TTL window covers every configured symbol.
//     Within the window, Price() reads the cache without hitting the
//     network. Default TTL: 30s, well inside CoinGecko's free-tier limits.
//   - On HTTP error (network down, 429, 5xx), all calls return the
//     underlying error. Wrap with FallbackFeed to keep the bridge live
//     during CoinGecko outages.

// =============================================================================
// CoinGeckoFeed
// =============================================================================

// DefaultCoinGeckoBaseURL is the public simple/price endpoint root.
const DefaultCoinGeckoBaseURL = "https://api.coingecko.com/api/v3"

// DefaultCoinGeckoCacheTTL is the freshness window for cached prices.
const DefaultCoinGeckoCacheTTL = 30 * time.Second

// DefaultCoinGeckoTimeout is the per-request HTTP timeout.
const DefaultCoinGeckoTimeout = 5 * time.Second

// DefaultCoinGeckoIDMap is the symbol → CoinGecko ID map seeded for the
// assets the bridge supports today. LUX and ZOO are deliberately absent;
// CoinGecko does not list them, so they must come from a fallback feed.
var DefaultCoinGeckoIDMap = map[string]string{
	"ETH":  "ethereum",
	"BTC":  "bitcoin",
	"SOL":  "solana",
	"TON":  "the-open-network",
	"XRP":  "ripple",
	"USDC": "usd-coin",
	"USDT": "tether",
	"DAI":  "dai",
	"BNB":  "binancecoin",
}

// CoinGeckoFeed pulls USD spot prices from CoinGecko's simple/price
// endpoint. Concurrency-safe.
type CoinGeckoFeed struct {
	// BaseURL is the API root, default DefaultCoinGeckoBaseURL.
	// Tests override this with httptest.NewServer.URL.
	BaseURL string
	// APIKey is the CoinGecko Pro key (x-cg-pro-api-key header). Empty
	// for the free tier; rate limits apply.
	APIKey string
	// HTTPClient is the transport. Defaults to a client with
	// DefaultCoinGeckoTimeout. Tests can swap in a custom client.
	HTTPClient *http.Client
	// CacheTTL is the freshness window. Zero ⇒ DefaultCoinGeckoCacheTTL.
	CacheTTL time.Duration
	// IDMap is the symbol → CoinGecko ID lookup. Zero-value ⇒
	// DefaultCoinGeckoIDMap. Symbol matching is case-insensitive.
	IDMap map[string]string

	mu         sync.Mutex
	cache      map[string]float64 // upper-case symbol → USD
	cachedAt   time.Time
	inFlight   chan struct{} // single-flight gate around HTTP fetch
}

// NewCoinGeckoFeed builds a feed with sensible defaults. Pass nil for
// idMap to use DefaultCoinGeckoIDMap.
func NewCoinGeckoFeed(baseURL, apiKey string, idMap map[string]string) *CoinGeckoFeed {
	if baseURL == "" {
		baseURL = DefaultCoinGeckoBaseURL
	}
	if idMap == nil {
		idMap = DefaultCoinGeckoIDMap
	}
	upper := make(map[string]string, len(idMap))
	for k, v := range idMap {
		upper[strings.ToUpper(k)] = v
	}
	return &CoinGeckoFeed{
		BaseURL:    baseURL,
		APIKey:     apiKey,
		HTTPClient: &http.Client{Timeout: DefaultCoinGeckoTimeout},
		IDMap:      upper,
	}
}

// Price returns the USD value of one unit of asset.
func (f *CoinGeckoFeed) Price(ctx context.Context, asset string) (float64, error) {
	sym := strings.ToUpper(asset)
	if _, ok := f.IDMap[sym]; !ok {
		return 0, fmt.Errorf("%w: %s (not in CoinGecko ID map)", ErrPriceUnknown, asset)
	}

	if v, ok := f.cachedFresh(sym); ok {
		return v, nil
	}

	if err := f.refresh(ctx); err != nil {
		return 0, err
	}

	if v, ok := f.cachedFresh(sym); ok {
		return v, nil
	}
	return 0, fmt.Errorf("%w: %s (CoinGecko response missing this id)", ErrPriceUnknown, asset)
}

func (f *CoinGeckoFeed) cachedFresh(sym string) (float64, bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.cache == nil || time.Since(f.cachedAt) > f.ttl() {
		return 0, false
	}
	v, ok := f.cache[sym]
	return v, ok
}

func (f *CoinGeckoFeed) ttl() time.Duration {
	if f.CacheTTL > 0 {
		return f.CacheTTL
	}
	return DefaultCoinGeckoCacheTTL
}

// refresh fetches every configured symbol's USD price in one HTTP call
// and replaces the cache. Single-flight: concurrent refreshes coalesce
// onto whichever goroutine got there first.
func (f *CoinGeckoFeed) refresh(ctx context.Context) error {
	f.mu.Lock()
	if f.inFlight != nil {
		ch := f.inFlight
		f.mu.Unlock()
		select {
		case <-ch:
			return nil
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	ch := make(chan struct{})
	f.inFlight = ch
	f.mu.Unlock()

	defer func() {
		f.mu.Lock()
		f.inFlight = nil
		close(ch)
		f.mu.Unlock()
	}()

	ids := make([]string, 0, len(f.IDMap))
	for _, v := range f.IDMap {
		ids = append(ids, v)
	}
	sort.Strings(ids) // deterministic URL for caching layers + test reproducibility

	q := url.Values{}
	q.Set("ids", strings.Join(ids, ","))
	q.Set("vs_currencies", "usd")
	endpoint := strings.TrimRight(f.BaseURL, "/") + "/simple/price?" + q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return fmt.Errorf("coingecko: build request: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	if f.APIKey != "" {
		req.Header.Set("x-cg-pro-api-key", f.APIKey)
	}

	client := f.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: DefaultCoinGeckoTimeout}
	}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("coingecko: http: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("coingecko: status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var payload map[string]map[string]float64
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return fmt.Errorf("coingecko: decode: %w", err)
	}

	next := make(map[string]float64, len(f.IDMap))
	for sym, id := range f.IDMap {
		if row, ok := payload[id]; ok {
			if usd, ok := row["usd"]; ok && usd > 0 {
				next[sym] = usd
			}
		}
	}

	f.mu.Lock()
	f.cache = next
	f.cachedAt = time.Now()
	f.mu.Unlock()
	return nil
}

// =============================================================================
// FallbackFeed
// =============================================================================

// FallbackFeed tries Primary first and falls back to Secondary on any
// error. Use it to wrap a CoinGeckoFeed (which doesn't know about LUX /
// ZOO) over a StaticPriceFeed seeded with the missing assets — and to
// keep quoting live during CoinGecko outages.
type FallbackFeed struct {
	Primary   PriceFeed
	Secondary PriceFeed
	// OnFallback is called when Primary errors and Secondary is consulted.
	// Optional; used for ops logging. The error from Primary is passed in.
	OnFallback func(asset string, err error)
}

// Price returns Primary's price, or Secondary's if Primary errored.
func (f *FallbackFeed) Price(ctx context.Context, asset string) (float64, error) {
	if f.Primary != nil {
		v, err := f.Primary.Price(ctx, asset)
		if err == nil {
			return v, nil
		}
		if f.OnFallback != nil {
			f.OnFallback(asset, err)
		}
		if f.Secondary == nil {
			return 0, err
		}
		v2, err2 := f.Secondary.Price(ctx, asset)
		if err2 == nil {
			return v2, nil
		}
		// Both failed. If Primary said ErrPriceUnknown, the Secondary
		// error is what callers want (it explains why the fallback
		// also doesn't know). Otherwise surface the Primary error so
		// network/auth failures aren't masked by "unknown asset".
		if errors.Is(err, ErrPriceUnknown) {
			return 0, err2
		}
		return 0, err
	}
	if f.Secondary == nil {
		return 0, errors.New("fallback_feed: no feeds configured")
	}
	return f.Secondary.Price(ctx, asset)
}
