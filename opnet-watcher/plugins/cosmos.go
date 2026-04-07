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

const CosmosChainID uint64 = 0x434F534D // "COSM" in Teleporter namespace

// CosmosPlugin polls a Cosmos/IBC Tendermint RPC node for deposit events
// from the bridge module. Uses secp256k1 signing and IBC event attributes.
type CosmosPlugin struct {
	rpcURL     string
	bridgeAddr string // Bech32 contract address
	client     *http.Client
}

func NewCosmosPlugin(rpcURL, bridgeAddr string) *CosmosPlugin {
	return &CosmosPlugin{
		rpcURL:     rpcURL,
		bridgeAddr: bridgeAddr,
		client:     &http.Client{Timeout: 15 * time.Second},
	}
}

func (c *CosmosPlugin) Name() string    { return "cosmos" }
func (c *CosmosPlugin) ChainID() uint64 { return CosmosChainID }

func (c *CosmosPlugin) PollDeposits(ctx context.Context, fromBlock uint64) ([]DepositEvent, uint64, error) {
	return nil, fromBlock, fmt.Errorf("cosmos: not yet implemented")
}

func (c *CosmosPlugin) QueryBacking(ctx context.Context) (*big.Int, error) {
	return nil, fmt.Errorf("cosmos: not yet implemented")
}
