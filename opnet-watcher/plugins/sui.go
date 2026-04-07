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

const SuiChainID uint64 = 0x53554900 // "SUI\x00" in Teleporter namespace

// SuiPlugin polls a Sui JSON-RPC node for deposit events from the bridge Move module.
// Sui uses ed25519 signing and object-centric state.
type SuiPlugin struct {
	rpcURL     string
	bridgeAddr string // Move module object ID
	client     *http.Client
}

func NewSuiPlugin(rpcURL, bridgeAddr string) *SuiPlugin {
	return &SuiPlugin{
		rpcURL:     rpcURL,
		bridgeAddr: bridgeAddr,
		client:     &http.Client{Timeout: 15 * time.Second},
	}
}

func (s *SuiPlugin) Name() string    { return "sui" }
func (s *SuiPlugin) ChainID() uint64 { return SuiChainID }

func (s *SuiPlugin) PollDeposits(ctx context.Context, fromCheckpoint uint64) ([]DepositEvent, uint64, error) {
	return nil, fromCheckpoint, fmt.Errorf("sui: not yet implemented")
}

func (s *SuiPlugin) QueryBacking(ctx context.Context) (*big.Int, error) {
	return nil, fmt.Errorf("sui: not yet implemented")
}
