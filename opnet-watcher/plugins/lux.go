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

const LuxChainID uint64 = 0x4C555800 // "LUX\x00" in Teleporter namespace

// LuxPlugin watches for deposit events on the Lux C-Chain vault contract.
// Lux C-Chain is EVM-compatible, so this uses eth_getLogs like the generic EVM
// plugin. For intra-Lux transfers, native Warp messaging eliminates the need for
// MPC signatures; however, deposits from external chains into Lux still flow
// through the watcher pipeline.
type LuxPlugin struct {
	rpcURL     string
	bridgeAddr string // Lux C-Chain vault address
	client     *http.Client
}

func NewLuxPlugin(rpcURL, bridgeAddr string) *LuxPlugin {
	return &LuxPlugin{
		rpcURL:     rpcURL,
		bridgeAddr: bridgeAddr,
		client:     &http.Client{Timeout: 15 * time.Second},
	}
}

func (l *LuxPlugin) Name() string    { return "lux" }
func (l *LuxPlugin) ChainID() uint64 { return LuxChainID }

// PollDeposits fetches Deposit event logs from the Lux C-Chain vault contract
// between fromBlock+1 and the current block height via eth_getLogs.
func (l *LuxPlugin) PollDeposits(ctx context.Context, fromBlock uint64) ([]DepositEvent, uint64, error) {
	height, err := l.blockNumber(ctx)
	if err != nil {
		return nil, fromBlock, fmt.Errorf("lux: eth_blockNumber: %w", err)
	}
	if height <= fromBlock {
		return nil, fromBlock, nil
	}

	params := map[string]interface{}{
		"fromBlock": fmt.Sprintf("0x%x", fromBlock+1),
		"toBlock":   fmt.Sprintf("0x%x", height),
		"address":   l.bridgeAddr,
		"topics":    [][]string{{evmDepositTopic}},
	}
	result, err := l.rpcCall(ctx, "eth_getLogs", []interface{}{params})
	if err != nil {
		return nil, fromBlock, fmt.Errorf("lux: eth_getLogs: %w", err)
	}

	var logs []struct {
		TxHash      string `json:"transactionHash"`
		BlockNumber string `json:"blockNumber"`
		Data        string `json:"data"`
	}
	if err := json.Unmarshal(result, &logs); err != nil {
		return nil, fromBlock, fmt.Errorf("lux: parse logs: %w", err)
	}

	var events []DepositEvent
	for _, lg := range logs {
		data, err := hexToBytes(lg.Data)
		if err != nil {
			log.Printf("WARN: lux: skip malformed log in tx %s: %v", lg.TxHash, err)
			continue
		}
		// Deposit event data layout: recipient (32 bytes, address in last 20)
		// + amount (32 bytes) + nonce (32 bytes) = 96 bytes minimum.
		if len(data) < 96 {
			log.Printf("WARN: lux: skip short log data (%d bytes) in tx %s", len(data), lg.TxHash)
			continue
		}

		var recipient [20]byte
		copy(recipient[:], data[12:32])
		amount := new(big.Int).SetBytes(data[32:64])
		nonce := new(big.Int).SetBytes(data[64:96]).Uint64()

		blkNum := new(big.Int)
		blkNum.SetString(lg.BlockNumber, 0)

		events = append(events, DepositEvent{
			SrcChainID:  LuxChainID,
			Nonce:       nonce,
			Recipient:   recipient,
			Amount:      amount,
			TxID:        lg.TxHash,
			BlockHeight: blkNum.Uint64(),
		})
	}
	return events, height, nil
}

// QueryBacking calls totalLocked() on the vault contract via eth_call.
func (l *LuxPlugin) QueryBacking(ctx context.Context) (*big.Int, error) {
	// totalLocked() selector: keccak256("totalLocked()")[:4]
	params := map[string]string{
		"to":   l.bridgeAddr,
		"data": "0xaf29611e",
	}
	result, err := l.rpcCall(ctx, "eth_call", []interface{}{params, "latest"})
	if err != nil {
		return nil, fmt.Errorf("lux: eth_call totalLocked: %w", err)
	}

	var hexResult string
	if err := json.Unmarshal(result, &hexResult); err != nil {
		return nil, fmt.Errorf("lux: parse totalLocked: %w", err)
	}

	data, err := hexToBytes(hexResult)
	if err != nil {
		return nil, fmt.Errorf("lux: decode totalLocked: %w", err)
	}
	if len(data) < 32 {
		return nil, fmt.Errorf("lux: totalLocked too short: %d bytes", len(data))
	}
	return new(big.Int).SetBytes(data[:32]), nil
}

func (l *LuxPlugin) blockNumber(ctx context.Context) (uint64, error) {
	result, err := l.rpcCall(ctx, "eth_blockNumber", nil)
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

func (l *LuxPlugin) rpcCall(ctx context.Context, method string, params interface{}) (json.RawMessage, error) {
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

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, l.rpcURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := l.client.Do(req)
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
