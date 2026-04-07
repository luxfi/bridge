// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

package main

import (
	"context"
	"encoding/json"
	"math/big"
	"os"
	"path/filepath"
	"testing"

	"github.com/luxfi/bridge/opnet-watcher/plugins"
)

// stubPlugin implements plugins.ChainPlugin for testing.
type stubPlugin struct {
	name    string
	chainID uint64
	events  []plugins.DepositEvent
	tip     uint64
}

func (s *stubPlugin) Name() string    { return s.name }
func (s *stubPlugin) ChainID() uint64 { return s.chainID }
func (s *stubPlugin) PollDeposits(_ context.Context, _ uint64) ([]plugins.DepositEvent, uint64, error) {
	return s.events, s.tip, nil
}
func (s *stubPlugin) QueryBacking(_ context.Context) (*big.Int, error) {
	return big.NewInt(0), nil
}

func TestCheckpointSaveLoad(t *testing.T) {
	dir := t.TempDir()
	cpPath := filepath.Join(dir, "cp.json")

	cfg := DefaultConfig()
	cfg.CheckpointPath = cpPath
	cfg.StartBlock = 0
	cfg.SourceRPCURL = "http://localhost"
	cfg.SourceBridgeAddr = "0xdead"
	cfg.TeleporterAddr = "0xbeef"
	cfg.SignerKeyPath = "/dev/null"

	plugin := &stubPlugin{name: "test", chainID: 42}

	// Create watcher, mark some deposits as seen.
	w := &Watcher{
		plugin:  plugin,
		cfg:     cfg,
		lastPos: 100,
		seen:    make(map[uint64]map[uint64]bool),
	}
	w.seen[42] = map[uint64]bool{1: true, 2: true, 5: true}

	// Save checkpoint.
	if err := w.saveCheckpoint(); err != nil {
		t.Fatalf("saveCheckpoint: %v", err)
	}

	// Verify file exists.
	data, err := os.ReadFile(cpPath)
	if err != nil {
		t.Fatalf("read checkpoint: %v", err)
	}
	var cp checkpoint
	if err := json.Unmarshal(data, &cp); err != nil {
		t.Fatalf("unmarshal checkpoint: %v", err)
	}
	if cp.LastPos != 100 {
		t.Errorf("LastPos = %d, want 100", cp.LastPos)
	}
	if !cp.Seen[42][1] || !cp.Seen[42][2] || !cp.Seen[42][5] {
		t.Errorf("seen nonces not persisted: %v", cp.Seen)
	}

	// Create new watcher that loads checkpoint.
	w2 := &Watcher{
		plugin:  plugin,
		cfg:     cfg,
		lastPos: 0,
		seen:    make(map[uint64]map[uint64]bool),
	}
	if err := w2.loadCheckpoint(); err != nil {
		t.Fatalf("loadCheckpoint: %v", err)
	}
	if w2.lastPos != 100 {
		t.Errorf("loaded lastPos = %d, want 100", w2.lastPos)
	}
	if !w2.seen[42][1] || !w2.seen[42][2] || !w2.seen[42][5] {
		t.Errorf("loaded seen nonces wrong: %v", w2.seen)
	}
	// Nonce 3 was never seen.
	if w2.seen[42][3] {
		t.Error("nonce 3 should not be seen")
	}
}

func TestCheckpointEmptyPath(t *testing.T) {
	w := &Watcher{
		cfg:  Config{CheckpointPath: ""},
		seen: make(map[uint64]map[uint64]bool),
	}
	// Should be no-ops, not errors.
	if err := w.saveCheckpoint(); err != nil {
		t.Fatalf("saveCheckpoint with empty path: %v", err)
	}
	if err := w.loadCheckpoint(); err != nil {
		t.Fatalf("loadCheckpoint with empty path: %v", err)
	}
}

func TestCheckpointLoadMissingFile(t *testing.T) {
	w := &Watcher{
		cfg:     Config{CheckpointPath: "/tmp/nonexistent-checkpoint-test.json"},
		lastPos: 50,
		seen:    make(map[uint64]map[uint64]bool),
	}
	// Should return error but not crash. lastPos should remain unchanged.
	err := w.loadCheckpoint()
	if err == nil {
		t.Fatal("expected error for missing file")
	}
	if w.lastPos != 50 {
		t.Errorf("lastPos changed to %d after failed load", w.lastPos)
	}
}

func TestCheckpointAtomicWrite(t *testing.T) {
	dir := t.TempDir()
	cpPath := filepath.Join(dir, "sub", "deep", "cp.json")

	w := &Watcher{
		cfg:     Config{CheckpointPath: cpPath},
		lastPos: 200,
		seen:    make(map[uint64]map[uint64]bool),
	}
	w.seen[1] = map[uint64]bool{10: true}

	// saveCheckpoint should create intermediate dirs.
	if err := w.saveCheckpoint(); err != nil {
		t.Fatalf("saveCheckpoint: %v", err)
	}

	// Tmp file should not exist (renamed).
	if _, err := os.Stat(cpPath + ".tmp"); err == nil {
		t.Error("tmp file should not exist after save")
	}

	// Final file should exist.
	if _, err := os.Stat(cpPath); err != nil {
		t.Fatalf("checkpoint file missing: %v", err)
	}
}

func TestCheckpointPreservesHigherLastPos(t *testing.T) {
	dir := t.TempDir()
	cpPath := filepath.Join(dir, "cp.json")

	// Write checkpoint with lastPos=50.
	data, _ := json.Marshal(checkpoint{LastPos: 50, Seen: nil})
	os.WriteFile(cpPath, data, 0o644)

	// Load into watcher with StartBlock=100 (higher than checkpoint).
	w := &Watcher{
		cfg:     Config{CheckpointPath: cpPath, StartBlock: 100},
		lastPos: 100,
		seen:    make(map[uint64]map[uint64]bool),
	}
	if err := w.loadCheckpoint(); err != nil {
		t.Fatalf("loadCheckpoint: %v", err)
	}
	// lastPos should stay at 100 since it's higher.
	if w.lastPos != 100 {
		t.Errorf("lastPos = %d, want 100 (should not regress)", w.lastPos)
	}
}

func TestDedupSkipsSeen(t *testing.T) {
	plugin := &stubPlugin{name: "test", chainID: 42}
	w := &Watcher{
		plugin: plugin,
		seen:   make(map[uint64]map[uint64]bool),
	}
	// Pre-mark nonce 5 as seen.
	w.seen[42] = map[uint64]bool{5: true}

	ev := plugins.DepositEvent{
		SrcChainID:  42,
		Nonce:       5,
		Amount:      big.NewInt(1000),
		BlockHeight: 10,
	}

	// processDeposit should return nil (skip) without calling relay (which would panic since relay is nil).
	err := w.processDeposit(context.Background(), ev)
	if err != nil {
		t.Fatalf("processDeposit for seen nonce: %v", err)
	}
}
