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

const TezosChainID uint64 = 4294967500

// TezosPlugin polls a Tezos RPC node for deposit operations from the bridge
// Michelson contract. Tezos uses ed25519 signing.
type TezosPlugin struct {
	rpcURL     string
	bridgeAddr string // KT1... contract address
	client     *http.Client
}

func NewTezosPlugin(rpcURL, bridgeAddr string) *TezosPlugin {
	return &TezosPlugin{
		rpcURL:     rpcURL,
		bridgeAddr: bridgeAddr,
		client:     &http.Client{Timeout: 15 * time.Second},
	}
}

func (t *TezosPlugin) Name() string    { return "tezos" }
func (t *TezosPlugin) ChainID() uint64 { return TezosChainID }

func (t *TezosPlugin) PollDeposits(ctx context.Context, fromLevel uint64) ([]DepositEvent, uint64, error) {
	return nil, fromLevel, fmt.Errorf("tezos: not yet implemented")
}

func (t *TezosPlugin) QueryBacking(ctx context.Context) (*big.Int, error) {
	return nil, fmt.Errorf("tezos: not yet implemented")
}
