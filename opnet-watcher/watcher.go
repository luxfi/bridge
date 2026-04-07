// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

package main

import (
	"context"
	"log"
	"math/big"
	"time"

	"github.com/luxfi/bridge/opnet-watcher/plugins"
)

// Watcher orchestrates the plugin -> signer -> relay pipeline.
// It runs the block polling loop and the backing attestor as separate goroutines,
// coordinating graceful shutdown via context cancellation.
type Watcher struct {
	plugin      plugins.ChainPlugin
	signer      *Signer
	relay       *Relay
	cfg         Config
	lastPos     uint64   // last processed block/slot/lt
	lastBacking *big.Int // HIGH-03: last attested backing for sanity check
}

// NewWatcher assembles the full pipeline from config.
func NewWatcher(cfg Config, plugin plugins.ChainPlugin, signer *Signer, relay *Relay) *Watcher {
	return &Watcher{
		plugin:  plugin,
		signer:  signer,
		relay:   relay,
		cfg:     cfg,
		lastPos: cfg.StartBlock,
	}
}

// Run starts the watcher. It blocks until ctx is cancelled.
func (w *Watcher) Run(ctx context.Context) error {
	log.Printf("watcher: starting chain=%s chain_id=%d source=%s lux=%s",
		w.plugin.Name(), w.plugin.ChainID(), w.cfg.SourceRPCURL, w.cfg.LuxRPCURL)
	log.Printf("watcher: teleporter=%s bridge=%s poll=%s backing=%s depth=%d",
		w.cfg.TeleporterAddr, w.cfg.SourceBridgeAddr, w.cfg.BlockPollInterval, w.cfg.BackingInterval, w.cfg.ConfirmationDepth)

	// Start backing attestor in background.
	go w.runBackingLoop(ctx)

	// Main event loop: poll blocks, process events.
	ticker := time.NewTicker(w.cfg.BlockPollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("watcher: shutting down")
			return ctx.Err()
		case <-ticker.C:
			w.pollAndRelay(ctx)
		}
	}
}

// pollAndRelay fetches new deposit events from the plugin and relays them.
// CRITICAL-02: Only processes blocks with sufficient confirmations to prevent reorg-based drain.
func (w *Watcher) pollAndRelay(ctx context.Context) {
	events, newPos, err := w.plugin.PollDeposits(ctx, w.lastPos)
	if err != nil {
		log.Printf("watcher: poll error: %v", err)
		return
	}

	// CRITICAL-02: Only process blocks with confirmationDepth confirmations.
	if newPos <= w.cfg.ConfirmationDepth {
		return
	}
	confirmedPos := newPos - w.cfg.ConfirmationDepth

	var confirmed []plugins.DepositEvent
	for _, ev := range events {
		if ev.BlockHeight <= confirmedPos {
			confirmed = append(confirmed, ev)
		}
	}

	for _, ev := range confirmed {
		if err := w.processDeposit(ctx, ev); err != nil {
			log.Printf("watcher: deposit error block=%d nonce=%d: %v", ev.BlockHeight, ev.Nonce, err)
		}
	}

	if confirmedPos > w.lastPos {
		if len(confirmed) > 0 {
			log.Printf("watcher: processed %d deposits through pos=%d (tip=%d depth=%d)",
				len(confirmed), confirmedPos, newPos, w.cfg.ConfirmationDepth)
		}
		w.lastPos = confirmedPos
	}
}

// processDeposit signs a deposit proof and submits it to Teleporter.mintDeposit.
func (w *Watcher) processDeposit(ctx context.Context, ev plugins.DepositEvent) error {
	log.Printf("watcher: deposit block=%d nonce=%d recipient=%x amount=%s",
		ev.BlockHeight, ev.Nonce, ev.Recipient, ev.Amount.String())

	chainID := w.plugin.ChainID()

	sig, err := w.signer.SignDeposit(chainID, ev.Nonce, ev.Recipient, ev.Amount)
	if err != nil {
		return err
	}

	txHash, err := w.relay.SubmitDeposit(ctx, chainID, ev.Nonce, ev.Recipient, ev.Amount, sig)
	if err != nil {
		return err
	}

	log.Printf("watcher: deposit relayed nonce=%d tx=%s", ev.Nonce, txHash)
	return nil
}

// runBackingLoop periodically queries total locked from the source chain
// and submits backing attestations to Teleporter.updateBacking.
func (w *Watcher) runBackingLoop(ctx context.Context) {
	w.attestBacking(ctx)

	ticker := time.NewTicker(w.cfg.BackingInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("backing: shutting down")
			return
		case <-ticker.C:
			w.attestBacking(ctx)
		}
	}
}

func (w *Watcher) attestBacking(ctx context.Context) {
	totalLocked, err := w.plugin.QueryBacking(ctx)
	if err != nil {
		log.Printf("backing: query failed: %v", err)
		return
	}

	// HIGH-03: Sanity check — backing cannot change by more than MaxBackingChangePct per attestation.
	if w.lastBacking != nil && w.lastBacking.Sign() > 0 {
		maxChange := new(big.Int).Mul(w.lastBacking, new(big.Int).SetUint64(w.cfg.MaxBackingChangePct))
		maxChange.Div(maxChange, big.NewInt(100))
		diff := new(big.Int).Sub(totalLocked, w.lastBacking)
		if diff.Sign() < 0 {
			diff.Neg(diff)
		}
		if diff.Cmp(maxChange) > 0 {
			log.Printf("backing: REJECTED — change too large: %s -> %s (max %d%% = %s)",
				w.lastBacking.String(), totalLocked.String(), w.cfg.MaxBackingChangePct, maxChange.String())
			return
		}
		// Log significant changes as warnings even within bounds.
		tenPct := new(big.Int).Div(w.lastBacking, big.NewInt(10))
		if diff.Cmp(tenPct) > 0 {
			log.Printf("backing: WARNING — significant change: %s -> %s", w.lastBacking.String(), totalLocked.String())
		}
	}

	chainID := w.plugin.ChainID()
	timestamp := uint64(time.Now().Unix())

	sig, err := w.signer.SignBacking(chainID, totalLocked, timestamp)
	if err != nil {
		log.Printf("backing: sign failed: %v", err)
		return
	}

	// CRITICAL-01: Pass timestamp to SubmitBacking (signed by MPC, validated on-chain).
	txHash, err := w.relay.SubmitBacking(ctx, chainID, totalLocked, timestamp, sig)
	if err != nil {
		log.Printf("backing: submit failed: %v", err)
		return
	}

	w.lastBacking = totalLocked
	log.Printf("backing: attested chain=%s total=%s tx=%s", w.plugin.Name(), totalLocked.String(), txHash)
}
