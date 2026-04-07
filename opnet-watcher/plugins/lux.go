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

const LuxChainID uint64 = 0x4C555800 // "LUX\x00" in Teleporter namespace

// LuxPlugin watches for Lux Warp messages from the bridge contract on
// Lux C-Chain. Unlike MPC-signed chains, Lux uses native Warp message
// verification -- no threshold signature is needed.
type LuxPlugin struct {
	rpcURL     string
	bridgeAddr string // Lux C-Chain vault address
	client     *http.Client
}

func NewLuxPlugin(rpcURL, bridgeAddr string) *LuxPlugin {
	return &LuxPlugin{
		rpcURL:     rpcURL,
		bridgeAddr: bridgeAddr,
		client:     &http.Client{Timeout: 15 * time.Second},
	}
}

func (l *LuxPlugin) Name() string    { return "lux" }
func (l *LuxPlugin) ChainID() uint64 { return LuxChainID }

func (l *LuxPlugin) PollDeposits(ctx context.Context, fromBlock uint64) ([]DepositEvent, uint64, error) {
	return nil, fromBlock, fmt.Errorf("lux: not yet implemented (warp message verification)")
}

func (l *LuxPlugin) QueryBacking(ctx context.Context) (*big.Int, error) {
	return nil, fmt.Errorf("lux: not yet implemented (warp message verification)")
}
