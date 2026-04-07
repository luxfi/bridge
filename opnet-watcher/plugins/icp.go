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

const ICPChainID uint64 = 0x49435000 // "ICP\x00" in Teleporter namespace

// ICPPlugin polls the ICP Agent API for deposit events from the bridge
// canister. ICP uses secp256k1 for canister signatures.
type ICPPlugin struct {
	apiURL      string
	canisterID  string
	client      *http.Client
}

func NewICPPlugin(apiURL, canisterID string) *ICPPlugin {
	return &ICPPlugin{
		apiURL:     apiURL,
		canisterID: canisterID,
		client:     &http.Client{Timeout: 15 * time.Second},
	}
}

func (i *ICPPlugin) Name() string    { return "icp" }
func (i *ICPPlugin) ChainID() uint64 { return ICPChainID }

func (i *ICPPlugin) PollDeposits(ctx context.Context, fromBlock uint64) ([]DepositEvent, uint64, error) {
	return nil, fromBlock, fmt.Errorf("icp: not yet implemented")
}

func (i *ICPPlugin) QueryBacking(ctx context.Context) (*big.Int, error) {
	return nil, fmt.Errorf("icp: not yet implemented")
}
