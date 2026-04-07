// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

package plugins

import (
	"context"
	"math/big"
)

// DepositEvent is the canonical deposit event format emitted by all source-chain adapters.
// Maps 1:1 to Teleporter.mintDeposit parameters on Lux C-Chain.
type DepositEvent struct {
	SrcChainID  uint64   // Source chain identifier (OPNET=4294967299, SOLANA=1399811149, TON=1414483791)
	Nonce       uint64   // Monotonic deposit nonce on source chain
	Recipient   [20]byte // Lux C-Chain recipient address (EVM)
	Amount      *big.Int // Deposit amount in source chain native units
	TxID        string   // Source chain transaction identifier
	BlockHeight uint64   // Source chain block/slot height
}

// ChainPlugin abstracts a source-chain block indexer for the Teleport bridge watcher.
// Each implementation polls its chain for deposit events and converts them to the
// canonical format consumed by the signer and relay pipeline.
type ChainPlugin interface {
	// Name returns a human-readable identifier (e.g., "opnet", "solana", "ton").
	Name() string

	// ChainID returns the Teleporter chain identifier for this source chain.
	ChainID() uint64

	// PollDeposits fetches deposit events from fromSlot onward.
	// Returns events found and the latest processed slot/block height.
	// The watcher calls this on each tick interval.
	PollDeposits(ctx context.Context, fromSlot uint64) ([]DepositEvent, uint64, error)

	// QueryBacking returns the total value locked in the bridge contract on this chain.
	// Used for periodic backing attestations to Teleporter.updateBacking.
	QueryBacking(ctx context.Context) (*big.Int, error)
}
