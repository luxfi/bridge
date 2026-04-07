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

const AptosChainID uint64 = 0x41505400 // "APT\x00" in Teleporter namespace

// AptosPlugin polls the Aptos REST API for deposit events from the bridge
// Move module. Aptos uses ed25519 signing.
type AptosPlugin struct {
	apiURL     string
	bridgeAddr string // Module address (0x-prefixed)
	client     *http.Client
}

func NewAptosPlugin(apiURL, bridgeAddr string) *AptosPlugin {
	return &AptosPlugin{
		apiURL:     apiURL,
		bridgeAddr: bridgeAddr,
		client:     &http.Client{Timeout: 15 * time.Second},
	}
}

func (a *AptosPlugin) Name() string    { return "aptos" }
func (a *AptosPlugin) ChainID() uint64 { return AptosChainID }

func (a *AptosPlugin) PollDeposits(ctx context.Context, fromVersion uint64) ([]DepositEvent, uint64, error) {
	return nil, fromVersion, fmt.Errorf("aptos: not yet implemented")
}

func (a *AptosPlugin) QueryBacking(ctx context.Context) (*big.Int, error) {
	return nil, fmt.Errorf("aptos: not yet implemented")
}
