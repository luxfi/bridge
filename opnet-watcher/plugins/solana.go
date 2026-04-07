// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

package plugins

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"time"
)

const SolanaChainID uint64 = 1399811149 // "SOLN" in Teleporter namespace

// SolanaPlugin polls a Solana RPC node for LockEvent logs from the Lux bridge program
// and converts them to canonical DepositEvent format.
type SolanaPlugin struct {
	rpcURL       string
	programID    string // Base58 bridge program address
	vaultAddress string // Base58 bridge config PDA (precomputed, not derived at runtime)
	client       *http.Client
}

func NewSolanaPlugin(rpcURL, programID, vaultAddress string) *SolanaPlugin {
	return &SolanaPlugin{
		rpcURL:       rpcURL,
		programID:    programID,
		vaultAddress: vaultAddress,
		client:       &http.Client{Timeout: 15 * time.Second},
	}
}

func (s *SolanaPlugin) Name() string        { return "solana" }
func (s *SolanaPlugin) ChainID() uint64     { return SolanaChainID }

// PollDeposits fetches confirmed transaction signatures for the bridge program
// starting from the given slot, then parses LockEvent data from each transaction's logs.
func (s *SolanaPlugin) PollDeposits(ctx context.Context, fromSlot uint64) ([]DepositEvent, uint64, error) {
	// Get current slot to bound the search.
	currentSlot, err := s.getSlot(ctx)
	if err != nil {
		return nil, fromSlot, fmt.Errorf("solana: get slot: %w", err)
	}
	if currentSlot <= fromSlot {
		return nil, fromSlot, nil
	}

	// Fetch signatures for the bridge program in the slot range.
	sigs, err := s.getSignaturesForAddress(ctx, fromSlot, currentSlot)
	if err != nil {
		return nil, fromSlot, fmt.Errorf("solana: get signatures: %w", err)
	}

	var events []DepositEvent
	for _, sig := range sigs {
		tx, err := s.getTransaction(ctx, sig.Signature)
		if err != nil {
			return events, sig.Slot, fmt.Errorf("solana: get tx %s: %w", sig.Signature, err)
		}

		deposit, ok := parseLockEventFromLogs(tx.Meta.LogMessages, sig.Slot, sig.Signature)
		if ok {
			events = append(events, deposit)
		}
	}

	return events, currentSlot, nil
}

// QueryBacking calls the bridge program's total_locked account data via getAccountInfo.
func (s *SolanaPlugin) QueryBacking(ctx context.Context) (*big.Int, error) {
	// The BridgeConfig PDA stores total locked value.
	// PDA seeds: ["bridge_config"] — derived deterministically from the program ID.
	// For now we read the account and parse the total_locked field from its data.
	configPDA, err := s.deriveBridgeConfigPDA()
	if err != nil {
		return nil, fmt.Errorf("solana: derive config PDA: %w", err)
	}

	info, err := s.getAccountInfo(ctx, configPDA)
	if err != nil {
		return nil, fmt.Errorf("solana: get account info: %w", err)
	}

	data, err := base64.StdEncoding.DecodeString(info.Data[0])
	if err != nil {
		return nil, fmt.Errorf("solana: decode account data: %w", err)
	}

	// BridgeConfig layout (after 8-byte discriminator):
	//   admin:           32 bytes (offset 8)
	//   mpc_signers:     96 bytes (offset 40)
	//   threshold:       1 byte   (offset 136)
	//   fee_bps:         2 bytes  (offset 137)
	//   fee_collector:   32 bytes (offset 139)
	//   paused:          1 byte   (offset 171)
	//   outbound_nonce:  8 bytes  (offset 172)
	//   chain_id:        8 bytes  (offset 180)
	//   bump:            1 byte   (offset 188)
	//
	// Total locked is tracked in the token vault accounts, not in BridgeConfig.
	// Sum vault token balances via getTokenAccountBalance for each registered vault.
	//
	// For the backing attestation, we query vault balance directly.
	_ = data
	return s.queryVaultBalance(ctx)
}

// ────────────────────────────────────────────────────────────────────
// Solana RPC helpers
// ────────────────────────────────────────────────────────────────────

type solanaSignature struct {
	Signature string `json:"signature"`
	Slot      uint64 `json:"slot"`
}

type solanaTx struct {
	Meta struct {
		LogMessages []string `json:"logMessages"`
	} `json:"meta"`
}

type solanaAccountInfo struct {
	Data []string `json:"data"` // [base64_data, encoding]
}

func (s *SolanaPlugin) getSlot(ctx context.Context) (uint64, error) {
	result, err := s.rpcCall(ctx, "getSlot", []interface{}{
		map[string]string{"commitment": "confirmed"},
	})
	if err != nil {
		return 0, err
	}
	var slot uint64
	if err := json.Unmarshal(result, &slot); err != nil {
		return 0, fmt.Errorf("parse slot: %w", err)
	}
	return slot, nil
}

func (s *SolanaPlugin) getSignaturesForAddress(ctx context.Context, minSlot, maxSlot uint64) ([]solanaSignature, error) {
	params := []interface{}{
		s.programID,
		map[string]interface{}{
			"commitment": "confirmed",
			"minContext": map[string]uint64{"slot": minSlot},
		},
	}
	result, err := s.rpcCall(ctx, "getSignaturesForAddress", params)
	if err != nil {
		return nil, err
	}
	var sigs []solanaSignature
	if err := json.Unmarshal(result, &sigs); err != nil {
		return nil, fmt.Errorf("parse signatures: %w", err)
	}
	// Filter to slot range.
	var filtered []solanaSignature
	for _, sig := range sigs {
		if sig.Slot > minSlot && sig.Slot <= maxSlot {
			filtered = append(filtered, sig)
		}
	}
	return filtered, nil
}

func (s *SolanaPlugin) getTransaction(ctx context.Context, sig string) (*solanaTx, error) {
	params := []interface{}{
		sig,
		map[string]interface{}{
			"encoding":                       "json",
			"commitment":                     "confirmed",
			"maxSupportedTransactionVersion": 0,
		},
	}
	result, err := s.rpcCall(ctx, "getTransaction", params)
	if err != nil {
		return nil, err
	}
	var tx solanaTx
	if err := json.Unmarshal(result, &tx); err != nil {
		return nil, fmt.Errorf("parse tx: %w", err)
	}
	return &tx, nil
}

func (s *SolanaPlugin) getAccountInfo(ctx context.Context, address string) (*solanaAccountInfo, error) {
	params := []interface{}{
		address,
		map[string]string{"encoding": "base64", "commitment": "confirmed"},
	}
	result, err := s.rpcCall(ctx, "getAccountInfo", params)
	if err != nil {
		return nil, err
	}
	var wrapper struct {
		Value *solanaAccountInfo `json:"value"`
	}
	if err := json.Unmarshal(result, &wrapper); err != nil {
		return nil, fmt.Errorf("parse account info: %w", err)
	}
	if wrapper.Value == nil {
		return nil, fmt.Errorf("account not found: %s", address)
	}
	return wrapper.Value, nil
}

func (s *SolanaPlugin) queryVaultBalance(ctx context.Context) (*big.Int, error) {
	// Query program token accounts owned by the vault PDA.
	// getTokenAccountsByOwner returns all SPL token accounts.
	// Sum their balances for total backing.
	params := []interface{}{
		s.programID,
		map[string]string{"programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"},
		map[string]string{"encoding": "jsonParsed"},
	}
	result, err := s.rpcCall(ctx, "getTokenAccountsByOwner", params)
	if err != nil {
		return nil, fmt.Errorf("get token accounts: %w", err)
	}

	var wrapper struct {
		Value []struct {
			Account struct {
				Data struct {
					Parsed struct {
						Info struct {
							TokenAmount struct {
								Amount string `json:"amount"`
							} `json:"tokenAmount"`
						} `json:"info"`
					} `json:"parsed"`
				} `json:"data"`
			} `json:"account"`
		} `json:"value"`
	}
	if err := json.Unmarshal(result, &wrapper); err != nil {
		return nil, fmt.Errorf("parse token accounts: %w", err)
	}

	total := new(big.Int)
	for _, acct := range wrapper.Value {
		bal, ok := new(big.Int).SetString(acct.Account.Data.Parsed.Info.TokenAmount.Amount, 10)
		if ok {
			total.Add(total, bal)
		}
	}
	return total, nil
}

func (s *SolanaPlugin) deriveBridgeConfigPDA() (string, error) {
	if s.vaultAddress == "" {
		return "", fmt.Errorf("solana: vaultAddress not configured (set to precomputed findProgramAddress([\"bridge_config\"], programID))")
	}
	return s.vaultAddress, nil
}

// parseLockEventFromLogs extracts a DepositEvent from Anchor program log messages.
// Anchor emits events as base64-encoded borsh in "Program data: <base64>" log lines.
func parseLockEventFromLogs(logs []string, slot uint64, txSig string) (DepositEvent, bool) {
	// Anchor event discriminator for LockEvent: SHA256("event:LockEvent")[:8]
	lockDiscriminator := []byte{0x65, 0xc4, 0x2b, 0x6f, 0x39, 0x48, 0x3e, 0x09}

	for _, line := range logs {
		if len(line) < 15 {
			continue
		}
		// Anchor logs: "Program data: <base64>"
		const prefix = "Program data: "
		idx := 0
		for i := 0; i <= len(line)-len(prefix); i++ {
			if line[i:i+len(prefix)] == prefix {
				idx = i + len(prefix)
				break
			}
		}
		if idx == 0 {
			continue
		}

		data, err := base64.StdEncoding.DecodeString(line[idx:])
		if err != nil || len(data) < 8 {
			continue
		}

		if !bytes.Equal(data[:8], lockDiscriminator) {
			continue
		}

		// LockEvent borsh layout (after 8-byte discriminator):
		//   source_chain: u64   (8 bytes)
		//   dest_chain:   u64   (8 bytes)
		//   nonce:        u64   (8 bytes)
		//   token:        [32]u8
		//   sender:       [32]u8
		//   recipient:    [32]u8  (EVM address zero-padded to 32 bytes)
		//   amount:       u64   (8 bytes)
		//   fee:          u64   (8 bytes)
		//   timestamp:    i64   (8 bytes)
		const eventLen = 8 + 8 + 8 + 32 + 32 + 32 + 8 + 8 + 8 // 144
		if len(data) < 8+eventLen {
			continue
		}
		d := data[8:]

		nonce := le64(d[16:24])
		amount := new(big.Int).SetUint64(le64(d[112:120]))

		var recipient [20]byte
		// EVM address is in the last 20 bytes of the 32-byte recipient field at offset 88
		copy(recipient[:], d[100:120]) // bytes 12-31 of the 32-byte field at offset 88

		return DepositEvent{
			SrcChainID:  SolanaChainID,
			Nonce:       nonce,
			Recipient:   recipient,
			Amount:      amount,
			TxID:        txSig,
			BlockHeight: slot,
		}, true
	}
	return DepositEvent{}, false
}

func le64(b []byte) uint64 {
	_ = b[7]
	return uint64(b[0]) | uint64(b[1])<<8 | uint64(b[2])<<16 | uint64(b[3])<<24 |
		uint64(b[4])<<32 | uint64(b[5])<<40 | uint64(b[6])<<48 | uint64(b[7])<<56
}

func (s *SolanaPlugin) rpcCall(ctx context.Context, method string, params interface{}) (json.RawMessage, error) {
	reqBody := map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  method,
		"params":  params,
	}
	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.rpcURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var rpcResp struct {
		Result json.RawMessage `json:"result"`
		Error  *struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(respBody, &rpcResp); err != nil {
		return nil, fmt.Errorf("rpc decode: %w", err)
	}
	if rpcResp.Error != nil {
		return nil, fmt.Errorf("rpc error %d: %s", rpcResp.Error.Code, rpcResp.Error.Message)
	}
	return rpcResp.Result, nil
}
