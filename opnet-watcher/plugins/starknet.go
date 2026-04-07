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

const StarkNetChainID uint64 = 0x53544B00 // "STK\x00" in Teleporter namespace

// StarkNetPlugin polls a StarkNet JSON-RPC node for deposit events from the
// bridge contract. StarkNet uses the Stark curve for signing.
type StarkNetPlugin struct {
	rpcURL     string
	bridgeAddr string // StarkNet contract address (0x-prefixed felt)
	client     *http.Client
}

func NewStarkNetPlugin(rpcURL, bridgeAddr string) *StarkNetPlugin {
	return &StarkNetPlugin{
		rpcURL:     rpcURL,
		bridgeAddr: bridgeAddr,
		client:     &http.Client{Timeout: 15 * time.Second},
	}
}

func (s *StarkNetPlugin) Name() string    { return "starknet" }
func (s *StarkNetPlugin) ChainID() uint64 { return StarkNetChainID }

func (s *StarkNetPlugin) PollDeposits(ctx context.Context, fromBlock uint64) ([]DepositEvent, uint64, error) {
	return nil, fromBlock, fmt.Errorf("starknet: not yet implemented")
}

func (s *StarkNetPlugin) QueryBacking(ctx context.Context) (*big.Int, error) {
	return nil, fmt.Errorf("starknet: not yet implemented")
}
