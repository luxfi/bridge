// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

package plugins

import (
	"context"
	"fmt"
	"math/big"
	"net/http"
	"time"
)

const FuelChainID uint64 = 4294967520

// FuelPlugin polls a Fuel GraphQL API for deposit receipts from the bridge
// Sway contract. Fuel uses secp256k1 signing.
type FuelPlugin struct {
	apiURL     string
	bridgeAddr string // Fuel contract ID (0x-prefixed)
	client     *http.Client
}

func NewFuelPlugin(apiURL, bridgeAddr string) *FuelPlugin {
	return &FuelPlugin{
		apiURL:     apiURL,
		bridgeAddr: bridgeAddr,
		client:     &http.Client{Timeout: 15 * time.Second},
	}
}

func (f *FuelPlugin) Name() string    { return "fuel" }
func (f *FuelPlugin) ChainID() uint64 { return FuelChainID }

func (f *FuelPlugin) PollDeposits(ctx context.Context, fromBlock uint64) ([]DepositEvent, uint64, error) {
	return nil, fromBlock, fmt.Errorf("fuel: not yet implemented")
}

func (f *FuelPlugin) QueryBacking(ctx context.Context) (*big.Int, error) {
	return nil, fmt.Errorf("fuel: not yet implemented")
}
