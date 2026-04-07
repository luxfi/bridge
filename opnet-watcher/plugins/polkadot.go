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

const PolkadotChainID uint64 = 0x444F5400 // "DOT\x00" in Teleporter namespace

// PolkadotPlugin polls a Substrate JSON-RPC node for deposit extrinsics
// from the bridge pallet. Polkadot uses sr25519 signing.
type PolkadotPlugin struct {
	rpcURL     string
	bridgeAddr string // SS58 address
	client     *http.Client
}

func NewPolkadotPlugin(rpcURL, bridgeAddr string) *PolkadotPlugin {
	return &PolkadotPlugin{
		rpcURL:     rpcURL,
		bridgeAddr: bridgeAddr,
		client:     &http.Client{Timeout: 15 * time.Second},
	}
}

func (p *PolkadotPlugin) Name() string    { return "polkadot" }
func (p *PolkadotPlugin) ChainID() uint64 { return PolkadotChainID }

func (p *PolkadotPlugin) PollDeposits(ctx context.Context, fromBlock uint64) ([]DepositEvent, uint64, error) {
	return nil, fromBlock, fmt.Errorf("polkadot: not yet implemented")
}

func (p *PolkadotPlugin) QueryBacking(ctx context.Context) (*big.Int, error) {
	return nil, fmt.Errorf("polkadot: not yet implemented")
}
