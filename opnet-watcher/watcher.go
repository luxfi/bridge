// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

package main

import (
	"context"
	"encoding/json"
	"log"
	"math/big"
	"os"
	"path/filepath"
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

	// HIGH-01: Deposit nonce deduplication.
	// seen[chainID][nonce] = true means this deposit was already relayed.
	seen map[uint64]map[uint64]bool
}

// checkpoint is the on-disk format for watcher state persistence.
type checkpoint struct {
	LastPos uint64                       `json:"last_pos"`
	Seen    map[uint64]map[uint64]bool   `json:"seen"`
}

// NewWatcher assembles the full pipeline from config.
// It loads checkpoint state from disk if available.
func NewWatcher(cfg Config, plugin plugins.ChainPlugin, signer *Signer, relay *Relay) *Watcher {
	w := &Watcher{
		plugin:  plugin,
		signer:  signer,
		relay:   relay,
		cfg:     cfg,
		lastPos: cfg.StartBlock,
		seen:    make(map[uint64]map[uint64]bool),
	}
	// HIGH-01: Restore checkpoint from disk.
	if err := w.loadCheckpoint(); err != nil {
		log.Printf("watcher: no checkpoint loaded: %v", err)
	}
	return w
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
		// HIGH-01: Persist checkpoint after advancing position.
		if err := w.saveCheckpoint(); err != nil {
			log.Printf("watcher: checkpoint save error: %v", err)
		}
	}
}

// processDeposit signs a deposit proof and submits it to Teleporter.mintDeposit.
// HIGH-01: Skips deposits that have already been relayed (dedup by chainID+nonce).
func (w *Watcher) processDeposit(ctx context.Context, ev plugins.DepositEvent) error {
	chainID := w.plugin.ChainID()

	// HIGH-01: Check dedup before signing or relaying.
	if w.seen[chainID] != nil && w.seen[chainID][ev.Nonce] {
		log.Printf("watcher: skipping duplicate deposit chain=%d nonce=%d", chainID, ev.Nonce)
		return nil
	}

	log.Printf("watcher: deposit block=%d nonce=%d recipient=%x amount=%s",
		ev.BlockHeight, ev.Nonce, ev.Recipient, ev.Amount.String())

	sig, err := w.signer.SignDeposit(chainID, ev.Nonce, ev.Recipient, ev.Amount)
	if err != nil {
		return err
	}

	txHash, err := w.relay.SubmitDeposit(ctx, chainID, ev.Nonce, ev.Recipient, ev.Amount, sig)
	if err != nil {
		return err
	}

	// HIGH-01: Mark as seen after successful relay.
	if w.seen[chainID] == nil {
		w.seen[chainID] = make(map[uint64]bool)
	}
	w.seen[chainID][ev.Nonce] = true

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

// loadCheckpoint restores watcher state from the checkpoint file.
// Returns an error if the file doesn't exist or can't be parsed (not fatal).
func (w *Watcher) loadCheckpoint() error {
	if w.cfg.CheckpointPath == "" {
		return nil
	}
	data, err := os.ReadFile(w.cfg.CheckpointPath)
	if err != nil {
		return err
	}
	var cp checkpoint
	if err := json.Unmarshal(data, &cp); err != nil {
		return err
	}
	if cp.LastPos > w.lastPos {
		w.lastPos = cp.LastPos
	}
	if cp.Seen != nil {
		w.seen = cp.Seen
	}
	log.Printf("watcher: checkpoint loaded pos=%d seen_chains=%d", w.lastPos, len(w.seen))
	return nil
}

// maxSeenPerChain limits the seen map to prevent unbounded memory growth.
// Since nonces are monotonically increasing, keeping the last N is sufficient.
const maxSeenPerChain = 10000

// saveCheckpoint writes current watcher state to the checkpoint file.
// Uses atomic write (write to tmp, rename) to avoid partial writes on crash.
// Prunes old nonces to prevent unbounded growth of the seen map.
func (w *Watcher) saveCheckpoint() error {
	if w.cfg.CheckpointPath == "" {
		return nil
	}

	// Prune old nonces to cap memory usage.
	w.pruneSeen()

	cp := checkpoint{
		LastPos: w.lastPos,
		Seen:    w.seen,
	}
	data, err := json.Marshal(cp)
	if err != nil {
		return err
	}
	dir := filepath.Dir(w.cfg.CheckpointPath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	tmp := w.cfg.CheckpointPath + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, w.cfg.CheckpointPath)
}

// pruneSeen removes old nonce entries to prevent unbounded map growth.
// Keeps only the highest maxSeenPerChain nonces per chain.
func (w *Watcher) pruneSeen() {
	for chainID, nonces := range w.seen {
		if len(nonces) <= maxSeenPerChain {
			continue
		}
		// Find the threshold: keep only nonces above (maxNonce - maxSeenPerChain).
		var maxNonce uint64
		for n := range nonces {
			if n > maxNonce {
				maxNonce = n
			}
		}
		threshold := maxNonce - uint64(maxSeenPerChain) + 1
		for n := range nonces {
			if n < threshold {
				delete(nonces, n)
			}
		}
		w.seen[chainID] = nonces
	}
}
