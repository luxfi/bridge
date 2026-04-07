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

const StellarChainID uint64 = 0x584C4D00 // "XLM\x00" in Teleporter namespace

// StellarPlugin polls the Stellar Horizon API for deposit operations
// from the bridge account. Stellar uses ed25519 signing.
type StellarPlugin struct {
	horizonURL string
	bridgeAddr string // Stellar public key (G...)
	client     *http.Client
}

func NewStellarPlugin(horizonURL, bridgeAddr string) *StellarPlugin {
	return &StellarPlugin{
		horizonURL: horizonURL,
		bridgeAddr: bridgeAddr,
		client:     &http.Client{Timeout: 15 * time.Second},
	}
}

func (s *StellarPlugin) Name() string    { return "stellar" }
func (s *StellarPlugin) ChainID() uint64 { return StellarChainID }

func (s *StellarPlugin) PollDeposits(ctx context.Context, fromLedger uint64) ([]DepositEvent, uint64, error) {
	return nil, fromLedger, fmt.Errorf("stellar: not yet implemented")
}

func (s *StellarPlugin) QueryBacking(ctx context.Context) (*big.Int, error) {
	return nil, fmt.Errorf("stellar: not yet implemented")
}
