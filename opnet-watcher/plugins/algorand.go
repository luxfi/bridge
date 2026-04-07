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

const AlgorandChainID uint64 = 0x414C474F // "ALGO" in Teleporter namespace

// AlgorandPlugin polls the Algod API for deposit transactions from the
// bridge application. Algorand uses ed25519 signing.
type AlgorandPlugin struct {
	apiURL  string
	appID   string // Application ID
	apiKey  string
	client  *http.Client
}

func NewAlgorandPlugin(apiURL, appID, apiKey string) *AlgorandPlugin {
	return &AlgorandPlugin{
		apiURL: apiURL,
		appID:  appID,
		apiKey: apiKey,
		client: &http.Client{Timeout: 15 * time.Second},
	}
}

func (a *AlgorandPlugin) Name() string    { return "algorand" }
func (a *AlgorandPlugin) ChainID() uint64 { return AlgorandChainID }

func (a *AlgorandPlugin) PollDeposits(ctx context.Context, fromRound uint64) ([]DepositEvent, uint64, error) {
	return nil, fromRound, fmt.Errorf("algorand: not yet implemented")
}

func (a *AlgorandPlugin) QueryBacking(ctx context.Context) (*big.Int, error) {
	return nil, fmt.Errorf("algorand: not yet implemented")
}
