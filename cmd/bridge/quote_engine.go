package main

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
)

// quote_engine.go: native quote computation for cmd/bridge.
//
// Ports the legacy `getQuote` logic from app/server/src/domain/quote.ts:
//
//	rawReceive   = amount * sourcePrice / destPrice
//	feeRate      = isExitFromLux(src, dst) ? BRIDGE_FEE_RATE : 0
//	serviceFee   = rawReceive * feeRate
//	netReceive   = rawReceive - serviceFee
//	minReceive   = netReceive * 0.975  (2.5% slippage tolerance)
//
// Prices come from a `PriceFeed` interface so the production wiring
// can swap CoinGecko / Pyth / on-chain oracles in without changing
// the engine. `StaticPriceFeed` is the dev default — a map[asset]→USD
// the operator seeds at startup, suitable for testing + first deploys.

// =============================================================================
// PriceFeed
// =============================================================================

// PriceFeed returns USD-denominated spot prices for bridged assets.
// Implementations:
//   - StaticPriceFeed   — map-backed, dev/test
//   - (future) HTTPPriceFeed — CoinGecko or Pyth pull oracle
type PriceFeed interface {
	// Price returns the USD value of one unit of `asset`. Returns an
	// error when the asset is unknown.
	Price(ctx context.Context, asset string) (float64, error)
}

// ErrPriceUnknown is returned by PriceFeed.Price when the asset
// isn't priced. Callers translate to HTTP 503 / 4xx as appropriate.
var ErrPriceUnknown = errors.New("quote_engine: price unknown for asset")

// StaticPriceFeed is a map-backed PriceFeed. Concurrency-safe.
// Asset symbols are matched case-insensitively (so callers can pass
// "ETH", "eth", or "Eth" interchangeably).
type StaticPriceFeed struct {
	mu     sync.RWMutex
	prices map[string]float64
}

// NewStaticPriceFeed builds a feed from an initial price table.
// Pass nil for an empty feed; populate via Set later.
func NewStaticPriceFeed(prices map[string]float64) *StaticPriceFeed {
	f := &StaticPriceFeed{prices: make(map[string]float64, len(prices))}
	for k, v := range prices {
		f.prices[strings.ToUpper(k)] = v
	}
	return f
}

// Set updates / inserts a price. Useful for tests + ops endpoints.
func (f *StaticPriceFeed) Set(asset string, usd float64) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.prices[strings.ToUpper(asset)] = usd
}

// Price returns the USD value of one unit of asset.
func (f *StaticPriceFeed) Price(_ context.Context, asset string) (float64, error) {
	f.mu.RLock()
	defer f.mu.RUnlock()
	if v, ok := f.prices[strings.ToUpper(asset)]; ok {
		return v, nil
	}
	return 0, fmt.Errorf("%w: %s", ErrPriceUnknown, asset)
}

// =============================================================================
// QuoteEngine
// =============================================================================

// DefaultBridgeFeeRate is the legacy 1% applied to exits from Lux.
// Matches BRIDGE_FEE_RATE in app/server/src/domain/quote.ts.
const DefaultBridgeFeeRate = 0.01

// DefaultSlippage is the implicit 2.5% min-receive tolerance the TS
// SDK adapter applies in bridge-rpc.ts::fetchQuoteViaRpc. Preserving
// it here keeps the SDK's UI assumptions stable.
const DefaultSlippage = 0.025

// DefaultAvgCompletion is the avg_completion_time string the SDK
// renders when the upstream doesn't supply one. Three minutes is the
// conservative testnet figure.
const DefaultAvgCompletion = "00:03:00"

// QuoteEngine computes ServerQuote envelopes from price-feed inputs.
// Concurrency-safe — the underlying PriceFeed is the only mutable
// dependency, and that interface contracts for safety.
type QuoteEngine struct {
	Feed PriceFeed
	// FeeRate is applied on "exits from Lux" (swaps where the source
	// network is in luxFamilyNetworks). Zero ⇒ DefaultBridgeFeeRate.
	FeeRate float64
	// Slippage is the min-receive ratio. Zero ⇒ DefaultSlippage.
	Slippage float64
	// AvgCompletion is the avg_completion_time string returned in the
	// envelope. Empty ⇒ DefaultAvgCompletion.
	AvgCompletion string
}

// luxFamilyNetworks is the internal-name set that triggers the bridge
// fee. Matches LUX_ZOO_NETWORKS in app/server/src/domain/quote.ts.
var luxFamilyNetworks = map[string]bool{
	"LUX_MAINNET": true,
	"LUX_TESTNET": true,
	"LUX_DEVNET":  true,
	"ZOO_MAINNET": true,
	"ZOO_TESTNET": true,
	"ZOO_DEVNET":  true,
}

func isExitFromLux(source, _ string) bool {
	// Legacy quote.ts gates on EITHER side being Lux-family; the
	// "exit" framing in the comment is about treasury fee policy
	// (revenue is taken when funds leave the Lux ecosystem) but the
	// actual code applies the fee whenever the source is Lux-family
	// (i.e. funds are LEAVING Lux). Match that.
	return luxFamilyNetworks[source]
}

// QuoteInput is the call payload for QuoteEngine.Quote.
type QuoteInput struct {
	Amount             float64
	SourceNetwork      string
	SourceAsset        string
	DestinationNetwork string
	DestinationAsset   string
	Refuel             bool
}

// QuoteResult is the engine's output. Fields map 1:1 to the legacy
// ServerQuote shape; serverQuote (in swaps_handler.go) wraps these
// into the envelope the SDK consumes.
type QuoteResult struct {
	ReceiveAmount    float64
	MinReceiveAmount float64
	ServiceFee       float64
	TotalFee         float64
	Slippage         float64
	AvgCompletion    string
}

// Quote computes the receive amount + fee for a bridge intent.
func (q *QuoteEngine) Quote(ctx context.Context, in QuoteInput) (*QuoteResult, error) {
	if in.Amount <= 0 {
		return nil, errors.New("quote_engine: amount must be > 0")
	}
	if q.Feed == nil {
		return nil, errors.New("quote_engine: no PriceFeed configured")
	}

	srcUSD, err := q.Feed.Price(ctx, in.SourceAsset)
	if err != nil {
		return nil, fmt.Errorf("source price: %w", err)
	}
	dstUSD, err := q.Feed.Price(ctx, in.DestinationAsset)
	if err != nil {
		return nil, fmt.Errorf("destination price: %w", err)
	}
	if dstUSD <= 0 {
		return nil, fmt.Errorf("quote_engine: destination price must be > 0 (got %v)", dstUSD)
	}

	rawReceive := in.Amount * srcUSD / dstUSD

	feeRate := 0.0
	if isExitFromLux(in.SourceNetwork, in.DestinationNetwork) {
		feeRate = q.feeRate()
	}
	serviceFee := rawReceive * feeRate
	netReceive := rawReceive - serviceFee

	slip := q.slippage()
	avg := q.avgCompletion()
	return &QuoteResult{
		ReceiveAmount:    netReceive,
		MinReceiveAmount: netReceive * (1 - slip),
		ServiceFee:       serviceFee,
		TotalFee:         serviceFee,
		Slippage:         slip,
		AvgCompletion:    avg,
	}, nil
}

func (q *QuoteEngine) feeRate() float64 {
	if q.FeeRate > 0 {
		return q.FeeRate
	}
	return DefaultBridgeFeeRate
}

func (q *QuoteEngine) slippage() float64 {
	if q.Slippage > 0 {
		return q.Slippage
	}
	return DefaultSlippage
}

func (q *QuoteEngine) avgCompletion() string {
	if q.AvgCompletion != "" {
		return q.AvgCompletion
	}
	return DefaultAvgCompletion
}
