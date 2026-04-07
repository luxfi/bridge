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

const CardanoChainID uint64 = 0x41444100 // "ADA\x00" in Teleporter namespace

// CardanoPlugin polls the Blockfrost API for deposit transactions
// from the bridge script address. Cardano uses ed25519 signing.
type CardanoPlugin struct {
	apiURL     string
	bridgeAddr string // Bech32 script address
	apiKey     string
	client     *http.Client
}

func NewCardanoPlugin(apiURL, bridgeAddr, apiKey string) *CardanoPlugin {
	return &CardanoPlugin{
		apiURL:     apiURL,
		bridgeAddr: bridgeAddr,
		apiKey:     apiKey,
		client:     &http.Client{Timeout: 15 * time.Second},
	}
}

func (c *CardanoPlugin) Name() string    { return "cardano" }
func (c *CardanoPlugin) ChainID() uint64 { return CardanoChainID }

func (c *CardanoPlugin) PollDeposits(ctx context.Context, fromSlot uint64) ([]DepositEvent, uint64, error) {
	return nil, fromSlot, fmt.Errorf("cardano: not yet implemented")
}

func (c *CardanoPlugin) QueryBacking(ctx context.Context) (*big.Int, error) {
	return nil, fmt.Errorf("cardano: not yet implemented")
}
