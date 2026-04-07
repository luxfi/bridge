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

const StarkNetChainID uint64 = 0x53544B00 // "STK\x00" in Teleporter namespace

// starknetDepositEventKey is the selector for the Deposit event:
// sn_keccak("Deposit") truncated to 252 bits.
const starknetDepositEventKey = "0x009149d2123147c5f43d258257fef0b7b969db78269369ebcf5c9c8f8596f04"

// StarkNetPlugin polls a StarkNet JSON-RPC node for deposit events from the
// bridge contract. StarkNet uses the Stark curve for signing.
type StarkNetPlugin struct {
	rpcURL     string
	bridgeAddr string // StarkNet contract address (0x-prefixed felt)
	client     *http.Client
}

func NewStarkNetPlugin(rpcURL, bridgeAddr string) *StarkNetPlugin {
	return &StarkNetPlugin{
		rpcURL:     rpcURL,
		bridgeAddr: bridgeAddr,
		client:     &http.Client{Timeout: 15 * time.Second},
	}
}

func (s *StarkNetPlugin) Name() string    { return "starknet" }
func (s *StarkNetPlugin) ChainID() uint64 { return StarkNetChainID }

// PollDeposits fetches deposit events from the bridge contract using
// starknet_getEvents with block range filtering.
func (s *StarkNetPlugin) PollDeposits(ctx context.Context, fromBlock uint64) ([]DepositEvent, uint64, error) {
	height, err := s.getBlockNumber(ctx)
	if err != nil {
		return nil, fromBlock, fmt.Errorf("starknet: get block number: %w", err)
	}
	if height <= fromBlock {
		return nil, fromBlock, nil
	}

	events, continuationToken, err := s.getDepositEvents(ctx, fromBlock+1, height, "")
	if err != nil {
		return nil, fromBlock, fmt.Errorf("starknet: get events: %w", err)
	}

	var deposits []DepositEvent
	deposits = append(deposits, events...)

	// Paginate if there are more events.
	for continuationToken != "" {
		var moreEvents []DepositEvent
		moreEvents, continuationToken, err = s.getDepositEvents(ctx, fromBlock+1, height, continuationToken)
		if err != nil {
			return deposits, fromBlock, fmt.Errorf("starknet: get events (continuation): %w", err)
		}
		deposits = append(deposits, moreEvents...)
	}

	return deposits, height, nil
}

// QueryBacking calls get_total_locked() on the bridge contract via starknet_call.
func (s *StarkNetPlugin) QueryBacking(ctx context.Context) (*big.Int, error) {
	// get_total_locked() selector: sn_keccak("get_total_locked")
	const getTotalLockedSelector = "0x004869cb76b122ee5ed0530c00e1e21bfaf18faa3ad5a83e4c81e28bd0e2cfef"

	params := map[string]interface{}{
		"contract_address": s.bridgeAddr,
		"entry_point_selector": getTotalLockedSelector,
		"calldata":         []string{},
	}
	result, err := s.rpcCall(ctx, "starknet_call", []interface{}{params, "latest"})
	if err != nil {
		return nil, fmt.Errorf("starknet: starknet_call get_total_locked: %w", err)
	}

	var feltResults []string
	if err := json.Unmarshal(result, &feltResults); err != nil {
		return nil, fmt.Errorf("starknet: parse get_total_locked: %w", err)
	}

	if len(feltResults) == 0 {
		return nil, fmt.Errorf("starknet: get_total_locked returned empty result")
	}

	// Result is a felt (0x-prefixed hex string).
	total, err := feltToBigInt(feltResults[0])
	if err != nil {
		return nil, fmt.Errorf("starknet: decode total_locked: %w", err)
	}
	return total, nil
}

// ────────────────────────────────────────────────────────────────────
// StarkNet JSON-RPC helpers
// ────────────────────────────────────────────────────────────────────

func (s *StarkNetPlugin) getBlockNumber(ctx context.Context) (uint64, error) {
	result, err := s.rpcCall(ctx, "starknet_blockNumber", nil)
	if err != nil {
		return 0, err
	}
	var blockNum uint64
	if err := json.Unmarshal(result, &blockNum); err != nil {
		return 0, fmt.Errorf("parse blockNumber: %w", err)
	}
	return blockNum, nil
}

func (s *StarkNetPlugin) getDepositEvents(ctx context.Context, fromBlock, toBlock uint64, continuationToken string) ([]DepositEvent, string, error) {
	filter := map[string]interface{}{
		"from_block": map[string]uint64{"block_number": fromBlock},
		"to_block":   map[string]uint64{"block_number": toBlock},
		"address":    s.bridgeAddr,
		"keys":       [][]string{{starknetDepositEventKey}},
		"chunk_size": 100,
	}
	if continuationToken != "" {
		filter["continuation_token"] = continuationToken
	}

	result, err := s.rpcCall(ctx, "starknet_getEvents", []interface{}{filter})
	if err != nil {
		return nil, "", err
	}

	var response struct {
		Events []struct {
			BlockNumber     uint64   `json:"block_number"`
			TransactionHash string   `json:"transaction_hash"`
			Data            []string `json:"data"` // felt values
		} `json:"events"`
		ContinuationToken string `json:"continuation_token"`
	}
	if err := json.Unmarshal(result, &response); err != nil {
		return nil, "", fmt.Errorf("parse events response: %w", err)
	}

	var deposits []DepositEvent
	for _, ev := range response.Events {
		// Deposit event data layout (felt values):
		//   data[0] = nonce (felt)
		//   data[1] = recipient (felt, low 160 bits = EVM address)
		//   data[2] = amount (felt)
		if len(ev.Data) < 3 {
			log.Printf("WARN: starknet: skip event with %d data fields in tx %s", len(ev.Data), ev.TransactionHash)
			continue
		}

		nonce, err := feltToBigInt(ev.Data[0])
		if err != nil {
			log.Printf("WARN: starknet: skip event with bad nonce %q: %v", ev.Data[0], err)
			continue
		}

		recipient, err := feltToRecipient(ev.Data[1])
		if err != nil {
			log.Printf("WARN: starknet: skip event with bad recipient %q: %v", ev.Data[1], err)
			continue
		}

		amount, err := feltToBigInt(ev.Data[2])
		if err != nil {
			log.Printf("WARN: starknet: skip event with bad amount %q: %v", ev.Data[2], err)
			continue
		}

		deposits = append(deposits, DepositEvent{
			SrcChainID:  StarkNetChainID,
			Nonce:       nonce.Uint64(),
			Recipient:   recipient,
			Amount:      amount,
			TxID:        ev.TransactionHash,
			BlockHeight: ev.BlockNumber,
		})
	}

	return deposits, response.ContinuationToken, nil
}

// feltToBigInt converts a StarkNet felt (0x-prefixed hex string) to *big.Int.
func feltToBigInt(felt string) (*big.Int, error) {
	data, err := hexToBytes(felt)
	if err != nil {
		return nil, err
	}
	if len(data) == 0 {
		return big.NewInt(0), nil
	}
	return new(big.Int).SetBytes(data), nil
}

// feltToRecipient converts a StarkNet felt to a [20]byte EVM address.
// The felt is up to 252 bits; the EVM address is the low 160 bits (last 20 bytes).
func feltToRecipient(felt string) ([20]byte, error) {
	var recipient [20]byte
	data, err := hexToBytes(felt)
	if err != nil {
		return recipient, err
	}
	if len(data) == 0 {
		return recipient, fmt.Errorf("empty felt")
	}
	// Take the last 20 bytes (low 160 bits).
	if len(data) > 20 {
		data = data[len(data)-20:]
	}
	copy(recipient[20-len(data):], data)
	return recipient, nil
}

func (s *StarkNetPlugin) rpcCall(ctx context.Context, method string, params interface{}) (json.RawMessage, error) {
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
