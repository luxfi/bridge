// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

package main

import (
	"strings"
	"testing"
)

func TestDefaultConfigValues(t *testing.T) {
	cfg := DefaultConfig()

	// Regression: MaxBackingChangePct was 100 (allowed unlimited minting).
	// Must be 15 (15%) to cap per-attestation backing delta.
	if cfg.MaxBackingChangePct != 15 {
		t.Errorf("MaxBackingChangePct = %d, want 15", cfg.MaxBackingChangePct)
	}

	if cfg.ConfirmationDepth != 6 {
		t.Errorf("ConfirmationDepth = %d, want 6", cfg.ConfirmationDepth)
	}

	if cfg.CheckpointPath == "" {
		t.Error("CheckpointPath is empty; must have a default")
	}

	if cfg.LuxChainIDOverride != LuxChainID {
		t.Errorf("LuxChainIDOverride = %d, want %d", cfg.LuxChainIDOverride, LuxChainID)
	}

	if cfg.BlockPollInterval != DefaultBlockPollInterval {
		t.Errorf("BlockPollInterval = %s, want %s", cfg.BlockPollInterval, DefaultBlockPollInterval)
	}

	if cfg.BackingInterval != DefaultBackingInterval {
		t.Errorf("BackingInterval = %s, want %s", cfg.BackingInterval, DefaultBackingInterval)
	}
}

func TestValidateRejectsEmptySourceRPC(t *testing.T) {
	cfg := validConfig()
	cfg.SourceRPCURL = ""
	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected error for empty SourceRPCURL")
	}
	if !strings.Contains(err.Error(), "source-rpc") {
		t.Errorf("error = %q, want mention of source-rpc", err)
	}
}

func TestValidateRejectsEmptyLuxRPC(t *testing.T) {
	cfg := validConfig()
	cfg.LuxRPCURL = ""
	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected error for empty LuxRPCURL")
	}
}

func TestValidateRejectsEmptyTeleporterAddr(t *testing.T) {
	cfg := validConfig()
	cfg.TeleporterAddr = ""
	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected error for empty TeleporterAddr")
	}
}

func TestValidateRejectsEmptySourceBridgeAddr(t *testing.T) {
	cfg := validConfig()
	cfg.SourceBridgeAddr = ""
	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected error for empty SourceBridgeAddr")
	}
}

func TestValidateRejectsZeroConfirmationDepth(t *testing.T) {
	cfg := validConfig()
	cfg.ConfirmationDepth = 0
	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected error for confirmation depth 0")
	}
	if !strings.Contains(err.Error(), "confirmation-depth") {
		t.Errorf("error = %q, want mention of confirmation-depth", err)
	}
}

func TestValidateRejectsThresholdWithoutKMS(t *testing.T) {
	cfg := validConfig()
	cfg.Threshold = true
	cfg.SignerKeyPath = "" // not needed in threshold mode
	cfg.KMSEndpoint = ""
	cfg.KMSKeyPath = ""
	cfg.TxKeyPath = ""

	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected error for threshold mode without KMS fields")
	}
	if !strings.Contains(err.Error(), "kms") {
		t.Errorf("error = %q, want mention of kms", err)
	}
}

func TestValidateRejectsThresholdWithoutTxKey(t *testing.T) {
	cfg := validConfig()
	cfg.Threshold = true
	cfg.SignerKeyPath = ""
	cfg.KMSEndpoint = "https://kms.hanzo.ai"
	cfg.KMSKeyPath = "/bridge/opnet/share"
	cfg.TxKeyPath = "" // missing

	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected error for threshold mode without TxKeyPath")
	}
	if !strings.Contains(err.Error(), "tx-key-path") {
		t.Errorf("error = %q, want mention of tx-key-path", err)
	}
}

func TestValidateRejectsSingleKeyWithoutPath(t *testing.T) {
	cfg := validConfig()
	cfg.Threshold = false
	cfg.SignerKeyPath = ""
	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected error for single-key mode without SignerKeyPath")
	}
	if !strings.Contains(err.Error(), "signer-key-path") {
		t.Errorf("error = %q, want mention of signer-key-path", err)
	}
}

func TestValidateAcceptsValidSingleKey(t *testing.T) {
	cfg := validConfig()
	err := cfg.Validate()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestValidateAcceptsValidThreshold(t *testing.T) {
	cfg := validConfig()
	cfg.Threshold = true
	cfg.SignerKeyPath = "" // not used
	cfg.KMSEndpoint = "https://kms.hanzo.ai"
	cfg.KMSKeyPath = "/bridge/opnet/share"
	cfg.TxKeyPath = "/var/run/secrets/tx-key"

	err := cfg.Validate()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

// validConfig returns a Config that passes Validate() in single-key mode.
func validConfig() Config {
	cfg := DefaultConfig()
	cfg.SourceRPCURL = "http://opnet:3000"
	cfg.LuxRPCURL = "https://api.lux.network/ext/bc/C/rpc"
	cfg.TeleporterAddr = "0xdead"
	cfg.SourceBridgeAddr = "0xbeef"
	cfg.SignerKeyPath = "/dev/null"
	cfg.ConfirmationDepth = 6
	return cfg
}
