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

const XRPLChainID uint64 = 0x5852504C // "XRPL" in Teleporter namespace

// XRPLPlugin polls an XRPL WebSocket/JSON-RPC node for deposit transactions
// from the bridge account. XRPL supports secp256k1 and ed25519 signing.
type XRPLPlugin struct {
	rpcURL     string
	bridgeAddr string // XRPL classic address (r...)
	client     *http.Client
}

func NewXRPLPlugin(rpcURL, bridgeAddr string) *XRPLPlugin {
	return &XRPLPlugin{
		rpcURL:     rpcURL,
		bridgeAddr: bridgeAddr,
		client:     &http.Client{Timeout: 15 * time.Second},
	}
}

func (x *XRPLPlugin) Name() string    { return "xrpl" }
func (x *XRPLPlugin) ChainID() uint64 { return XRPLChainID }

func (x *XRPLPlugin) PollDeposits(ctx context.Context, fromLedger uint64) ([]DepositEvent, uint64, error) {
	return nil, fromLedger, fmt.Errorf("xrpl: not yet implemented")
}

func (x *XRPLPlugin) QueryBacking(ctx context.Context) (*big.Int, error) {
	return nil, fmt.Errorf("xrpl: not yet implemented")
}
