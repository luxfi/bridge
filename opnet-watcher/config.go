// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

package main

import (
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"time"
)

const (
	// LuxChainID is the Lux mainnet chain ID.
	LuxChainID uint64 = 96369

	// DefaultBlockPollInterval is how often we poll the source chain for new blocks.
	DefaultBlockPollInterval = 5 * time.Second

	// DefaultBackingInterval is how often we submit backing attestations.
	DefaultBackingInterval = 12 * time.Hour
)

// Config holds all runtime configuration for the watcher service.
type Config struct {
	// Source chain RPC/API endpoint.
	SourceRPCURL string

	// Lux C-Chain JSON-RPC endpoint.
	LuxRPCURL string

	// Teleporter contract address on Lux C-Chain (hex, 0x-prefixed).
	TeleporterAddr string

	// Source chain bridge contract/program address.
	SourceBridgeAddr string

	// Solana bridge config PDA (precomputed findProgramAddress(["bridge_config"], programID)).
	// Required when --chain=solana.
	SolanaVaultAddr string

	// Path to file containing the signer private key (hex-encoded, 32 bytes).
	// DEVELOPMENT ONLY -- in production use --threshold with --kms-endpoint.
	SignerKeyPath string

	// NEW-02: Path to hex-encoded tx hot wallet key for transaction submission.
	// Required in threshold mode (MPC signs proofs, hot wallet submits txs).
	TxKeyPath string

	// How often to poll the source chain for new blocks/slots.
	BlockPollInterval time.Duration

	// How often to submit backing attestations.
	BackingInterval time.Duration

	// Block/slot height to start indexing from. 0 = latest.
	StartBlock uint64

	// CRITICAL-02: Number of confirmations before processing a block.
	// Prevents bridge drain via source chain reorgs. Default 6 (BTC-like).
	ConfirmationDepth uint64

	// CRITICAL-04: Use threshold signing (CGGMP21) instead of single key.
	// Single-key mode is for development/testing ONLY.
	Threshold bool

	// CRITICAL-04: KMS endpoint for loading key shares in threshold mode.
	// Example: https://kms.hanzo.ai
	KMSEndpoint string

	// CRITICAL-04: KMS secret path for the key share.
	KMSKeyPath string

	// CRITICAL-03: Lux C-Chain chain ID for EIP-155 signing.
	LuxChainIDOverride uint64

	// HIGH-03: Maximum percentage change in backing per attestation.
	// Prevents unbacked minting via compromised RPC. Default 100 (100%).
	MaxBackingChangePct uint64

	// HIGH-01: Path to checkpoint file for deposit deduplication.
	// Persists lastPos and seen nonces so restarts don't re-process deposits.
	// Only one watcher instance should run per chain.
	CheckpointPath string
}

// DefaultConfig returns a Config with sensible defaults.
// RPC URLs and contract addresses must be overridden.
func DefaultConfig() Config {
	return Config{
		LuxRPCURL:           "https://api.lux.network/ext/bc/C/rpc",
		BlockPollInterval:   DefaultBlockPollInterval,
		BackingInterval:     DefaultBackingInterval,
		ConfirmationDepth:   6,
		MaxBackingChangePct: 15,
		LuxChainIDOverride:  LuxChainID,
		CheckpointPath:      "/data/bridge/checkpoint.json",
	}
}

// Validate checks that all required fields are set.
func (c *Config) Validate() error {
	if c.SourceRPCURL == "" {
		return errors.New("config: source-rpc is required")
	}
	if c.LuxRPCURL == "" {
		return errors.New("config: lux-rpc is required")
	}
	if c.TeleporterAddr == "" {
		return errors.New("config: teleporter-addr is required")
	}
	if c.SourceBridgeAddr == "" {
		return errors.New("config: source-addr is required")
	}
	if c.Threshold {
		if c.KMSEndpoint == "" {
			return errors.New("config: --kms-endpoint is required in threshold mode")
		}
		if c.KMSKeyPath == "" {
			return errors.New("config: --kms-key-path is required in threshold mode")
		}
		if c.TxKeyPath == "" {
			return errors.New("config: --tx-key-path is required in threshold mode (hot wallet for tx submission)")
		}
	} else {
		if c.SignerKeyPath == "" {
			return errors.New("config: signer-key-path is required (or use --threshold with --kms-endpoint)")
		}
	}
	if c.ConfirmationDepth == 0 {
		return errors.New("config: confirmation-depth must be > 0")
	}
	return nil
}

// LoadKeyShareFromKMS fetches threshold key share and group key from KMS.
// Returns (shareBytes, groupKeyBytes, error).
func LoadKeyShareFromKMS(endpoint, keyPath string) ([]byte, []byte, error) {
	url := endpoint + "/v1/secrets/" + keyPath
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, nil, fmt.Errorf("kms request: %w", err)
	}
	// KMS auth via service account token mounted at well-known path.
	tokenBytes, err := os.ReadFile("/var/run/secrets/hanzo/kms-token")
	if err != nil {
		return nil, nil, fmt.Errorf("kms auth token: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+string(tokenBytes))

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, nil, fmt.Errorf("kms fetch: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, nil, fmt.Errorf("kms: status %d", resp.StatusCode)
	}

	var kmsResp struct {
		Share    string `json:"share"`
		GroupKey string `json:"group_key"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&kmsResp); err != nil {
		return nil, nil, fmt.Errorf("kms decode: %w", err)
	}

	share, err := hex.DecodeString(kmsResp.Share)
	if err != nil {
		return nil, nil, fmt.Errorf("kms share hex: %w", err)
	}
	groupKey, err := hex.DecodeString(kmsResp.GroupKey)
	if err != nil {
		return nil, nil, fmt.Errorf("kms group key hex: %w", err)
	}

	return share, groupKey, nil
}

// LoadSignerKey reads the hex-encoded private key from disk.
// Returns raw 32-byte key material. DEVELOPMENT ONLY.
func LoadSignerKey(path string) ([]byte, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("load signer key: %w", err)
	}
	// Strip whitespace/newlines
	hexStr := string(data)
	for len(hexStr) > 0 && (hexStr[len(hexStr)-1] == '\n' || hexStr[len(hexStr)-1] == '\r' || hexStr[len(hexStr)-1] == ' ') {
		hexStr = hexStr[:len(hexStr)-1]
	}
	// Strip 0x prefix if present
	if len(hexStr) >= 2 && hexStr[:2] == "0x" {
		hexStr = hexStr[2:]
	}
	key, err := hex.DecodeString(hexStr)
	if err != nil {
		return nil, fmt.Errorf("load signer key: invalid hex: %w", err)
	}
	if len(key) != 32 {
		return nil, fmt.Errorf("load signer key: expected 32 bytes, got %d", len(key))
	}
	return key, nil
}
