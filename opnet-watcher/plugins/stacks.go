// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

package plugins

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/big"
	"net/http"
	"time"
)

const StacksChainID uint64 = 4294967440

// StacksPlugin polls a Stacks Blockchain API node for deposit transactions
// from the bridge Clarity contract. Stacks uses secp256k1 signing (Bitcoin-derived).
type StacksPlugin struct {
	apiURL     string
	bridgeAddr string // Clarity contract principal (SP...)
	client     *http.Client
}

func NewStacksPlugin(apiURL, bridgeAddr string) *StacksPlugin {
	return &StacksPlugin{
		apiURL:     apiURL,
		bridgeAddr: bridgeAddr,
		client:     &http.Client{Timeout: 15 * time.Second},
	}
}

func (s *StacksPlugin) Name() string    { return "stacks" }
func (s *StacksPlugin) ChainID() uint64 { return StacksChainID }

// PollDeposits fetches contract_call transactions to the bridge contract since
// the given block height and parses deposit events from the Clarity call args.
func (s *StacksPlugin) PollDeposits(ctx context.Context, fromBlock uint64) ([]DepositEvent, uint64, error) {
	height, err := s.tipHeight(ctx)
	if err != nil {
		return nil, fromBlock, fmt.Errorf("stacks: tip height: %w", err)
	}
	if height <= fromBlock {
		return nil, fromBlock, nil
	}

	txs, err := s.getContractTxs(ctx)
	if err != nil {
		return nil, fromBlock, fmt.Errorf("stacks: get txs: %w", err)
	}

	var events []DepositEvent
	for _, tx := range txs {
		if tx.TxStatus != "success" {
			continue
		}
		if tx.TxType != "contract_call" {
			continue
		}
		if tx.BlockHeight <= fromBlock {
			continue
		}

		deposit, ok := parseStacksDeposit(tx)
		if ok {
			events = append(events, deposit)
		}
	}

	return events, height, nil
}

// QueryBacking calls the read-only get-total-locked function on the bridge contract.
func (s *StacksPlugin) QueryBacking(ctx context.Context) (*big.Int, error) {
	url := fmt.Sprintf("%s/v2/contracts/call-read/%s/get-total-locked",
		s.apiURL, s.bridgeAddr)

	body := map[string]interface{}{
		"sender":    "ST000000000000000000002AMW42H",
		"arguments": []string{},
	}
	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("stacks: marshal call-read body: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("stacks: new request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("stacks: call-read: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("stacks: read response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("stacks: call-read status %d: %s", resp.StatusCode, respBody)
	}

	var result struct {
		Okay   bool   `json:"okay"`
		Result string `json:"result"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("stacks: parse call-read: %w", err)
	}
	if !result.Okay {
		return nil, fmt.Errorf("stacks: call-read not okay: %s", result.Result)
	}

	// Clarity returns uint values as "(ok u12345)" or "0x0100000000000000000000000000003039".
	// The hex representation is a Clarity serialized uint: type prefix 0x01 + 16-byte big-endian.
	val, err := parseClarityUint(result.Result)
	if err != nil {
		return nil, fmt.Errorf("stacks: parse total_locked: %w", err)
	}
	return val, nil
}

// ────────────────────────────────────────────────────────────────────
// Stacks API types and helpers
// ────────────────────────────────────────────────────────────────────

type stacksTx struct {
	TxID        string `json:"tx_id"`
	TxType      string `json:"tx_type"`
	TxStatus    string `json:"tx_status"`
	BlockHeight uint64 `json:"block_height"`
	ContractCall struct {
		ContractID   string `json:"contract_id"`
		FunctionName string `json:"function_name"`
		FunctionArgs []struct {
			Hex  string `json:"hex"`
			Repr string `json:"repr"`
			Name string `json:"name"`
			Type string `json:"type"`
		} `json:"function_args"`
	} `json:"contract_call"`
}

func (s *StacksPlugin) tipHeight(ctx context.Context) (uint64, error) {
	url := fmt.Sprintf("%s/v2/info", s.apiURL)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, err
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return 0, err
	}
	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("status %d: %s", resp.StatusCode, body)
	}

	var info struct {
		StacksTipHeight uint64 `json:"stacks_tip_height"`
	}
	if err := json.Unmarshal(body, &info); err != nil {
		return 0, fmt.Errorf("parse info: %w", err)
	}
	return info.StacksTipHeight, nil
}

func (s *StacksPlugin) getContractTxs(ctx context.Context) ([]stacksTx, error) {
	url := fmt.Sprintf("%s/extended/v1/address/%s/transactions?limit=50&offset=0&type=contract_call",
		s.apiURL, s.bridgeAddr)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("status %d: %s", resp.StatusCode, body)
	}

	var result struct {
		Results []stacksTx `json:"results"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("parse txs: %w", err)
	}
	return result.Results, nil
}

// parseStacksDeposit extracts a DepositEvent from a Stacks contract_call transaction.
// The bridge contract's deposit function has args: nonce (uint), recipient (buff 20), amount (uint).
func parseStacksDeposit(tx stacksTx) (DepositEvent, bool) {
	if tx.ContractCall.FunctionName != "deposit" {
		return DepositEvent{}, false
	}

	args := tx.ContractCall.FunctionArgs
	if len(args) < 3 {
		log.Printf("WARN: stacks: skip tx %s: expected 3+ args, got %d", tx.TxID, len(args))
		return DepositEvent{}, false
	}

	// Build a name->arg map for reliable lookup.
	argMap := make(map[string]struct {
		Hex  string
		Repr string
	}, len(args))
	for _, a := range args {
		argMap[a.Name] = struct {
			Hex  string
			Repr string
		}{a.Hex, a.Repr}
	}

	nonceArg, ok := argMap["nonce"]
	if !ok {
		log.Printf("WARN: stacks: skip tx %s: missing nonce arg", tx.TxID)
		return DepositEvent{}, false
	}
	recipientArg, ok := argMap["recipient"]
	if !ok {
		log.Printf("WARN: stacks: skip tx %s: missing recipient arg", tx.TxID)
		return DepositEvent{}, false
	}
	amountArg, ok := argMap["amount"]
	if !ok {
		log.Printf("WARN: stacks: skip tx %s: missing amount arg", tx.TxID)
		return DepositEvent{}, false
	}

	nonce, err := parseClarityUint(nonceArg.Hex)
	if err != nil {
		log.Printf("WARN: stacks: skip tx %s: parse nonce: %v", tx.TxID, err)
		return DepositEvent{}, false
	}

	amount, err := parseClarityUint(amountArg.Hex)
	if err != nil {
		log.Printf("WARN: stacks: skip tx %s: parse amount: %v", tx.TxID, err)
		return DepositEvent{}, false
	}

	recipient, err := parseClarityBuff(recipientArg.Hex)
	if err != nil || len(recipient) < 20 {
		log.Printf("WARN: stacks: skip tx %s: parse recipient: %v (len=%d)", tx.TxID, err, len(recipient))
		return DepositEvent{}, false
	}

	var recipientAddr [20]byte
	copy(recipientAddr[:], recipient[:20])

	return DepositEvent{
		SrcChainID:  StacksChainID,
		Nonce:       nonce.Uint64(),
		Recipient:   recipientAddr,
		Amount:      amount,
		TxID:        tx.TxID,
		BlockHeight: tx.BlockHeight,
	}, true
}

// parseClarityUint parses a Clarity serialized uint value.
// Hex format: 0x01 + 16-byte big-endian uint128.
// Repr format: "u12345" or "(ok u12345)".
func parseClarityUint(s string) (*big.Int, error) {
	// Try hex format first: type prefix 0x01 + 16 bytes.
	if len(s) >= 2 && s[:2] == "0x" {
		data, err := hexToBytes(s)
		if err != nil {
			return nil, err
		}
		if len(data) >= 17 && data[0] == 0x01 {
			return new(big.Int).SetBytes(data[1:17]), nil
		}
		// Might be raw uint bytes.
		if len(data) > 0 {
			return new(big.Int).SetBytes(data), nil
		}
	}

	// Try repr format: "u12345" or "(ok u12345)".
	str := s
	// Strip wrapping (ok ...) if present.
	if len(str) > 4 && str[:4] == "(ok " && str[len(str)-1] == ')' {
		str = str[4 : len(str)-1]
	}
	// Strip 'u' prefix.
	if len(str) > 1 && str[0] == 'u' {
		str = str[1:]
	}
	val, ok := new(big.Int).SetString(str, 10)
	if !ok {
		return nil, fmt.Errorf("cannot parse clarity uint: %q", s)
	}
	return val, nil
}

// parseClarityBuff parses a Clarity serialized buffer value.
// Hex format: 0x02 + 4-byte big-endian length + raw bytes.
func parseClarityBuff(s string) ([]byte, error) {
	if len(s) >= 2 && s[:2] == "0x" {
		data, err := hexToBytes(s)
		if err != nil {
			return nil, err
		}
		if len(data) >= 5 && data[0] == 0x02 {
			bufLen := int(data[1])<<24 | int(data[2])<<16 | int(data[3])<<8 | int(data[4])
			if len(data) < 5+bufLen {
				return nil, fmt.Errorf("clarity buff truncated: need %d, have %d", 5+bufLen, len(data))
			}
			return data[5 : 5+bufLen], nil
		}
		// Raw hex bytes (no type prefix).
		return data, nil
	}
	return nil, fmt.Errorf("cannot parse clarity buff: %q", s)
}
