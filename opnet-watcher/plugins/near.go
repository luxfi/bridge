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

const NEARChainID uint64 = 0x4E454152 // "NEAR" in Teleporter namespace

// NEARPlugin polls a NEAR JSON-RPC node for deposit receipts from the bridge contract.
// NEAR uses ed25519 signing and account-based state.
type NEARPlugin struct {
	rpcURL     string
	bridgeAddr string // NEAR account ID (e.g., bridge.lux.near)
	client     *http.Client
}

func NewNEARPlugin(rpcURL, bridgeAddr string) *NEARPlugin {
	return &NEARPlugin{
		rpcURL:     rpcURL,
		bridgeAddr: bridgeAddr,
		client:     &http.Client{Timeout: 15 * time.Second},
	}
}

func (n *NEARPlugin) Name() string    { return "near" }
func (n *NEARPlugin) ChainID() uint64 { return NEARChainID }

func (n *NEARPlugin) PollDeposits(ctx context.Context, fromBlock uint64) ([]DepositEvent, uint64, error) {
	return nil, fromBlock, fmt.Errorf("near: not yet implemented")
}

func (n *NEARPlugin) QueryBacking(ctx context.Context) (*big.Int, error) {
	return nil, fmt.Errorf("near: not yet implemented")
}
