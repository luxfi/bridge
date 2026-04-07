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

// Deposit(address recipient, uint256 amount, uint64 nonce)
// keccak256 topic: 0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c
const evmDepositTopic = "0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c"

// EVMPlugin is a generic EVM chain plugin that polls eth_getLogs for Deposit
// events from a vault contract. Works for any EVM-compatible chain.
type EVMPlugin struct {
	name      string
	chainID   uint64
	rpcURL    string
	vaultAddr string
	client    *http.Client
}

// NewEVMPlugin creates a plugin for any EVM chain. The name and chainID
// identify the chain in the Teleporter namespace; rpcURL is the JSON-RPC
// endpoint; vaultAddr is the bridge vault contract address.
func NewEVMPlugin(name string, chainID uint64, rpcURL, vaultAddr string) *EVMPlugin {
	return &EVMPlugin{
		name:      name,
		chainID:   chainID,
		rpcURL:    rpcURL,
		vaultAddr: vaultAddr,
		client:    &http.Client{Timeout: 15 * time.Second},
	}
}

func (e *EVMPlugin) Name() string    { return e.name }
func (e *EVMPlugin) ChainID() uint64 { return e.chainID }

// PollDeposits fetches Deposit event logs from the vault contract between
// fromBlock+1 and the current block height via eth_getLogs.
func (e *EVMPlugin) PollDeposits(ctx context.Context, fromBlock uint64) ([]DepositEvent, uint64, error) {
	height, err := e.blockNumber(ctx)
	if err != nil {
		return nil, fromBlock, fmt.Errorf("%s: eth_blockNumber: %w", e.name, err)
	}
	if height <= fromBlock {
		return nil, fromBlock, nil
	}

	params := map[string]interface{}{
		"fromBlock": fmt.Sprintf("0x%x", fromBlock+1),
		"toBlock":   fmt.Sprintf("0x%x", height),
		"address":   e.vaultAddr,
		"topics":    [][]string{{evmDepositTopic}},
	}
	result, err := e.rpcCall(ctx, "eth_getLogs", []interface{}{params})
	if err != nil {
		return nil, fromBlock, fmt.Errorf("%s: eth_getLogs: %w", e.name, err)
	}

	var logs []struct {
		TxHash      string `json:"transactionHash"`
		BlockNumber string `json:"blockNumber"`
		Data        string `json:"data"`
	}
	if err := json.Unmarshal(result, &logs); err != nil {
		return nil, fromBlock, fmt.Errorf("%s: parse logs: %w", e.name, err)
	}

	var events []DepositEvent
	for _, l := range logs {
		data, err := hexToBytes(l.Data)
		if err != nil {
			log.Printf("WARN: %s: skip malformed log in tx %s: %v", e.name, l.TxHash, err)
			continue
		}
		// Deposit event data layout: recipient (32 bytes, address in last 20)
		// + amount (32 bytes) + nonce (32 bytes) = 96 bytes minimum.
		if len(data) < 96 {
			log.Printf("WARN: %s: skip short log data (%d bytes) in tx %s", e.name, len(data), l.TxHash)
			continue
		}

		var recipient [20]byte
		copy(recipient[:], data[12:32])
		amount := new(big.Int).SetBytes(data[32:64])
		nonce := new(big.Int).SetBytes(data[64:96]).Uint64()

		blkNum := new(big.Int)
		blkNum.SetString(l.BlockNumber, 0)

		events = append(events, DepositEvent{
			SrcChainID:  e.chainID,
			Nonce:       nonce,
			Recipient:   recipient,
			Amount:      amount,
			TxID:        l.TxHash,
			BlockHeight: blkNum.Uint64(),
		})
	}
	return events, height, nil
}

// QueryBacking calls totalLocked() on the vault contract via eth_call.
func (e *EVMPlugin) QueryBacking(ctx context.Context) (*big.Int, error) {
	// totalLocked() selector: keccak256("totalLocked()")[:4]
	params := map[string]string{
		"to":   e.vaultAddr,
		"data": "0xaf29611e",
	}
	result, err := e.rpcCall(ctx, "eth_call", []interface{}{params, "latest"})
	if err != nil {
		return nil, fmt.Errorf("%s: eth_call totalLocked: %w", e.name, err)
	}

	var hexResult string
	if err := json.Unmarshal(result, &hexResult); err != nil {
		return nil, fmt.Errorf("%s: parse totalLocked: %w", e.name, err)
	}

	data, err := hexToBytes(hexResult)
	if err != nil {
		return nil, fmt.Errorf("%s: decode totalLocked: %w", e.name, err)
	}
	if len(data) < 32 {
		return nil, fmt.Errorf("%s: totalLocked too short: %d bytes", e.name, len(data))
	}
	return new(big.Int).SetBytes(data[:32]), nil
}

func (e *EVMPlugin) blockNumber(ctx context.Context) (uint64, error) {
	result, err := e.rpcCall(ctx, "eth_blockNumber", nil)
	if err != nil {
		return 0, err
	}
	var hex string
	if err := json.Unmarshal(result, &hex); err != nil {
		return 0, fmt.Errorf("parse blockNumber: %w", err)
	}
	n := new(big.Int)
	n.SetString(hex, 0)
	return n.Uint64(), nil
}

func (e *EVMPlugin) rpcCall(ctx context.Context, method string, params interface{}) (json.RawMessage, error) {
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

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, e.rpcURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := e.client.Do(req)
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
