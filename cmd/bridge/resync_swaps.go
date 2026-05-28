// Copyright (C) 2019-2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

package main

import (
	"context"
	"errors"
	"fmt"

	luxlog "github.com/luxfi/log"

	"github.com/luxfi/bridge/internal/bchain"
)

// resync_swaps.go: reconcile the local swap cache against authoritative
// B-Chain state.
//
// The local swap store is a UX cache (see swap_store.go); B-Chain is
// the source of truth. Operators run --resync-swaps when the local
// cache may have diverged: a restored backup, a switched --data-dir,
// or an offline window during a chain reorg.
//
// The reconcile loop walks every swap in the local store, asks B-Chain
// for the canonical status, and patches the local copy if it lags.
// New swaps that exist on chain but not locally are not enumerated
// here (we lack a list endpoint on the chain side until v1.2.7 ships
// bridge_listRequests); operators with that gap should clear the
// local store entirely and let normal operation backfill from
// observation.
//
// Errors during reconcile are logged but non-fatal — partial progress
// is fine, the next tick will retry the laggers. Only an unreachable
// B-Chain RPC is treated as fatal (and bubbles up to the caller).
func ResyncSwapsFromChain(
	ctx context.Context,
	store SwapStore,
	client *bchain.Client,
	logger luxlog.Logger,
) error {
	if store == nil {
		return errors.New("resync_swaps: nil store")
	}
	if client == nil {
		return errors.New("resync_swaps: nil bchain client")
	}

	// Cheap probe — if the chain isn't reachable we want to fail
	// fast rather than mid-walk.
	if _, err := client.Health(ctx); err != nil {
		return fmt.Errorf("resync_swaps: chain unreachable: %w", err)
	}

	local, err := store.List(ctx, SwapFilter{})
	if err != nil {
		return fmt.Errorf("resync_swaps: local list: %w", err)
	}

	var (
		reconciled int
		laggards   int
		unknown    int
		failed     int
	)
	for _, sw := range local {
		if sw.ID == "" {
			continue
		}
		// Terminal local states don't roll back. If a swap is locally
		// "completed" / "refunded" / "failed" we leave it — those are
		// observations of work the daemon has already done.
		if isTerminalStatus(sw.Status) {
			continue
		}
		req, err := client.GetBridgeStatus(ctx, sw.ID)
		if err != nil {
			// Method not found / not implemented / unknown id — log
			// and continue. Don't fail the whole walk on one swap.
			var rpcErr *bchain.RPCError
			if errors.As(err, &rpcErr) && rpcErr.Code == -32601 {
				unknown++
				continue
			}
			failed++
			logger.Warn("resync_swaps: chain GetBridgeStatus failed",
				"swap", sw.ID,
				"err", err,
			)
			continue
		}
		chainStatus := mapChainStatusToLocal(req.Status)
		if chainStatus == "" || chainStatus == sw.Status {
			continue
		}
		laggards++
		if _, err := store.Patch(ctx, sw.ID, func(s *Swap) {
			s.Status = chainStatus
			if req.SourceTxHash != "" && s.SourceTxHash == "" {
				s.SourceTxHash = req.SourceTxHash
			}
			if req.DestTxHash != "" && s.DestTxHash == "" {
				s.DestTxHash = req.DestTxHash
			}
			if req.Signature != "" && s.Signature == "" {
				s.Signature = req.Signature
			}
			s.LastError = "" // chain win, clear any stale daemon-side error
		}); err != nil {
			failed++
			logger.Warn("resync_swaps: local patch failed",
				"swap", sw.ID,
				"err", err,
			)
			continue
		}
		reconciled++
	}

	logger.Info("resync_swaps: pass complete",
		"local_total", len(local),
		"reconciled", reconciled,
		"laggards_detected", laggards,
		"unknown_to_chain", unknown,
		"errors", failed,
	)
	return nil
}

// isTerminalStatus reports whether a local swap state is terminal and
// must not be rolled back by a chain reconcile.
func isTerminalStatus(s SwapStatus) bool {
	switch s {
	case SwapStatusCompleted,
		SwapStatusRefunded,
		SwapStatusFailed,
		SwapStatusFailedInsufficientReleaseGas,
		SwapStatusCancelled:
		return true
	}
	return false
}

// mapChainStatusToLocal projects a B-Chain BridgeRequestStatus onto
// the daemon's local SwapStatus space. Returns "" when there is no
// canonical mapping (in which case the reconcile leaves the local
// status alone).
func mapChainStatusToLocal(cs bchain.BridgeRequestStatus) SwapStatus {
	switch cs {
	case bchain.StatusPending:
		return SwapStatusUserDepositPending
	case bchain.StatusDeposited:
		return SwapStatusBridgeTransferPending
	case bchain.StatusSigning:
		return SwapStatusSigning
	case bchain.StatusSigned, bchain.StatusReleasing:
		return SwapStatusBroadcasting
	case bchain.StatusCompleted:
		return SwapStatusCompleted
	case bchain.StatusFailed:
		return SwapStatusFailed
	case bchain.StatusCancelled:
		return SwapStatusCancelled
	}
	return ""
}
