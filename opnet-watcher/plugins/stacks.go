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

const StacksChainID uint64 = 4294967440

// StacksPlugin polls a Stacks node API for deposit transactions from the
// bridge Clarity contract. Stacks uses secp256k1 signing (Bitcoin-derived).
type StacksPlugin struct {
	apiURL     string
	bridgeAddr string // Clarity contract principal (SP...)
	client     *http.Client
}

func NewStacksPlugin(apiURL, bridgeAddr string) *StacksPlugin {
	return &StacksPlugin{
		apiURL:     apiURL,
		bridgeAddr: bridgeAddr,
		client:     &http.Client{Timeout: 15 * time.Second},
	}
}

func (s *StacksPlugin) Name() string    { return "stacks" }
func (s *StacksPlugin) ChainID() uint64 { return StacksChainID }

func (s *StacksPlugin) PollDeposits(ctx context.Context, fromBlock uint64) ([]DepositEvent, uint64, error) {
	return nil, fromBlock, fmt.Errorf("stacks: not yet implemented")
}

func (s *StacksPlugin) QueryBacking(ctx context.Context) (*big.Int, error) {
	return nil, fmt.Errorf("stacks: not yet implemented")
}
