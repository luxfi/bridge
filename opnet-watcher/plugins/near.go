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
	"log"
	"math/big"
	"net/http"
	"time"
)

const NEARChainID uint64 = 0x4E454152 // "NEAR" in Teleporter namespace

// NEARPlugin polls a NEAR JSON-RPC node for deposit events from the bridge
// contract. It iterates over blocks and inspects chunks for function calls
// to the bridge contract, then calls a view function for total backing.
type NEARPlugin struct {
	rpcURL     string
	bridgeAddr string // NEAR account ID (e.g., bridge.lux.near)
	client     *http.Client
}

func NewNEARPlugin(rpcURL, bridgeAddr string) *NEARPlugin {
	return &NEARPlugin{
		rpcURL:     rpcURL,
		bridgeAddr: bridgeAddr,
		client:     &http.Client{Timeout: 15 * time.Second},
	}
}

func (n *NEARPlugin) Name() string    { return "near" }
func (n *NEARPlugin) ChainID() uint64 { return NEARChainID }

// PollDeposits fetches deposit events by calling the get_deposits_after(nonce)
// view function on the bridge contract. This avoids complex block/chunk iteration
// by relying on the contract to track deposits with a monotonic nonce.
func (n *NEARPlugin) PollDeposits(ctx context.Context, fromBlock uint64) ([]DepositEvent, uint64, error) {
	height, err := n.blockHeight(ctx)
	if err != nil {
		return nil, fromBlock, fmt.Errorf("near: get block height: %w", err)
	}
	if height <= fromBlock {
		return nil, fromBlock, nil
	}

	// Query deposits from the bridge contract via view function.
	// The contract is expected to implement get_deposits_after(nonce) -> Vec<Deposit>.
	args := map[string]uint64{"nonce": fromBlock}
	argsJSON, err := json.Marshal(args)
	if err != nil {
		return nil, fromBlock, fmt.Errorf("near: marshal args: %w", err)
	}

	result, err := n.viewFunction(ctx, n.bridgeAddr, "get_deposits_after", argsJSON)
	if err != nil {
		// Fallback: if view function is not available, scan blocks directly.
		events, latest, scanErr := n.scanBlocks(ctx, fromBlock, height)
		if scanErr != nil {
			return nil, fromBlock, fmt.Errorf("near: view function failed (%v), block scan: %w", err, scanErr)
		}
		return events, latest, nil
	}

	var deposits []struct {
		Nonce     uint64 `json:"nonce"`
		Recipient string `json:"recipient"`
		Amount    string `json:"amount"`
		TxHash    string `json:"tx_hash"`
		Block     uint64 `json:"block_height"`
	}
	if err := json.Unmarshal(result, &deposits); err != nil {
		return nil, fromBlock, fmt.Errorf("near: parse deposits: %w", err)
	}

	var events []DepositEvent
	for _, d := range deposits {
		recipient, err := hexToBytes(d.Recipient)
		if err != nil || len(recipient) < 20 {
			log.Printf("WARN: near: skip bad recipient in tx %s: %v", d.TxHash, err)
			continue
		}
		var addr [20]byte
		copy(addr[:], recipient[len(recipient)-20:])

		amount, ok := new(big.Int).SetString(d.Amount, 10)
		if !ok {
			log.Printf("WARN: near: skip bad amount in tx %s: %s", d.TxHash, d.Amount)
			continue
		}

		events = append(events, DepositEvent{
			SrcChainID:  NEARChainID,
			Nonce:       d.Nonce,
			Recipient:   addr,
			Amount:      amount,
			TxID:        d.TxHash,
			BlockHeight: d.Block,
		})
	}

	return events, height, nil
}

// QueryBacking calls the get_total_locked() view function on the bridge contract.
// The result is a base64-encoded JSON number or little-endian u128.
func (n *NEARPlugin) QueryBacking(ctx context.Context) (*big.Int, error) {
	result, err := n.viewFunction(ctx, n.bridgeAddr, "get_total_locked", []byte("{}"))
	if err != nil {
		return nil, fmt.Errorf("near: query backing: %w", err)
	}

	// Try parsing as a JSON string number first (most common).
	var strVal string
	if err := json.Unmarshal(result, &strVal); err == nil {
		val, ok := new(big.Int).SetString(strVal, 10)
		if ok {
			return val, nil
		}
	}

	// Try as raw JSON number.
	var numVal json.Number
	if err := json.Unmarshal(result, &numVal); err == nil {
		val, ok := new(big.Int).SetString(numVal.String(), 10)
		if ok {
			return val, nil
		}
	}

	// Try as little-endian u128 bytes (16 bytes).
	if len(result) == 16 {
		return leU128(result), nil
	}

	return nil, fmt.Errorf("near: cannot parse total_locked result")
}

// ────────────────────────────────────────────────────────────────────
// NEAR RPC helpers
// ────────────────────────────────────────────────────────────────────

func (n *NEARPlugin) blockHeight(ctx context.Context) (uint64, error) {
	params := map[string]string{"finality": "final"}
	result, err := n.rpcCall(ctx, "block", params)
	if err != nil {
		return 0, err
	}
	var block struct {
		Header struct {
			Height uint64 `json:"height"`
		} `json:"header"`
	}
	if err := json.Unmarshal(result, &block); err != nil {
		return 0, fmt.Errorf("parse block: %w", err)
	}
	return block.Header.Height, nil
}

// viewFunction calls a NEAR view function and returns the decoded result bytes.
func (n *NEARPlugin) viewFunction(ctx context.Context, account, method string, args []byte) (json.RawMessage, error) {
	params := map[string]interface{}{
		"request_type": "call_function",
		"finality":     "final",
		"account_id":   account,
		"method_name":  method,
		"args_base64":  base64.StdEncoding.EncodeToString(args),
	}
	result, err := n.rpcCall(ctx, "query", params)
	if err != nil {
		return nil, err
	}

	var queryResult struct {
		Result []byte `json:"result"` // JSON-encoded return value as byte array
		Error  string `json:"error"`
	}
	if err := json.Unmarshal(result, &queryResult); err != nil {
		return nil, fmt.Errorf("parse query result: %w", err)
	}
	if queryResult.Error != "" {
		return nil, fmt.Errorf("view call error: %s", queryResult.Error)
	}

	// The result field is a byte array representing the JSON return value.
	return json.RawMessage(queryResult.Result), nil
}

// scanBlocks is a fallback that iterates blocks and checks chunks for bridge
// function calls when the view function is unavailable.
func (n *NEARPlugin) scanBlocks(ctx context.Context, fromBlock, toBlock uint64) ([]DepositEvent, uint64, error) {
	// Cap scan range to prevent excessive RPC calls.
	const maxScanRange = 100
	start := fromBlock + 1
	if toBlock-fromBlock > maxScanRange {
		start = toBlock - maxScanRange + 1
	}

	var events []DepositEvent
	for h := start; h <= toBlock; h++ {
		blockEvents, err := n.scanBlock(ctx, h)
		if err != nil {
			log.Printf("WARN: near: skip block %d: %v", h, err)
			continue
		}
		events = append(events, blockEvents...)
	}
	return events, toBlock, nil
}

func (n *NEARPlugin) scanBlock(ctx context.Context, height uint64) ([]DepositEvent, error) {
	params := map[string]uint64{"block_id": height}
	result, err := n.rpcCall(ctx, "block", params)
	if err != nil {
		return nil, err
	}

	var block struct {
		Header struct {
			Height uint64 `json:"height"`
			Hash   string `json:"hash"`
		} `json:"header"`
		Chunks []struct {
			ChunkHash string `json:"chunk_hash"`
			ShardID   int    `json:"shard_id"`
		} `json:"chunks"`
	}
	if err := json.Unmarshal(result, &block); err != nil {
		return nil, fmt.Errorf("parse block: %w", err)
	}

	var events []DepositEvent
	for _, chunk := range block.Chunks {
		chunkEvents, err := n.scanChunk(ctx, chunk.ChunkHash, height)
		if err != nil {
			log.Printf("WARN: near: skip chunk %s at block %d: %v", chunk.ChunkHash, height, err)
			continue
		}
		events = append(events, chunkEvents...)
	}
	return events, nil
}

func (n *NEARPlugin) scanChunk(ctx context.Context, chunkHash string, height uint64) ([]DepositEvent, error) {
	params := map[string]string{"chunk_id": chunkHash}
	result, err := n.rpcCall(ctx, "chunk", params)
	if err != nil {
		return nil, err
	}

	var chunk struct {
		Transactions []struct {
			Hash       string `json:"hash"`
			ReceiverID string `json:"receiver_id"`
			Actions    []struct {
				FunctionCall *struct {
					MethodName string `json:"method_name"`
					Args       string `json:"args"` // base64-encoded
				} `json:"FunctionCall"`
			} `json:"actions"`
		} `json:"transactions"`
	}
	if err := json.Unmarshal(result, &chunk); err != nil {
		return nil, fmt.Errorf("parse chunk: %w", err)
	}

	var events []DepositEvent
	for _, tx := range chunk.Transactions {
		if tx.ReceiverID != n.bridgeAddr {
			continue
		}
		for _, action := range tx.Actions {
			if action.FunctionCall == nil {
				continue
			}
			if action.FunctionCall.MethodName != "deposit" {
				continue
			}

			argsBytes, err := base64.StdEncoding.DecodeString(action.FunctionCall.Args)
			if err != nil {
				log.Printf("WARN: near: skip bad args in tx %s: %v", tx.Hash, err)
				continue
			}

			var args struct {
				Recipient string `json:"recipient"`
				Amount    string `json:"amount"`
				Nonce     uint64 `json:"nonce"`
			}
			if err := json.Unmarshal(argsBytes, &args); err != nil {
				log.Printf("WARN: near: skip unparseable args in tx %s: %v", tx.Hash, err)
				continue
			}

			recipientBytes, err := hexToBytes(args.Recipient)
			if err != nil || len(recipientBytes) < 20 {
				log.Printf("WARN: near: skip bad recipient in tx %s", tx.Hash)
				continue
			}
			var addr [20]byte
			copy(addr[:], recipientBytes[len(recipientBytes)-20:])

			amount, ok := new(big.Int).SetString(args.Amount, 10)
			if !ok {
				log.Printf("WARN: near: skip bad amount in tx %s: %s", tx.Hash, args.Amount)
				continue
			}

			events = append(events, DepositEvent{
				SrcChainID:  NEARChainID,
				Nonce:       args.Nonce,
				Recipient:   addr,
				Amount:      amount,
				TxID:        tx.Hash,
				BlockHeight: height,
			})
		}
	}
	return events, nil
}

// leU128 interprets 16 bytes as a little-endian unsigned 128-bit integer.
func leU128(b []byte) *big.Int {
	if len(b) < 16 {
		return big.NewInt(0)
	}
	// Reverse to big-endian.
	var be [16]byte
	for i := 0; i < 16; i++ {
		be[15-i] = b[i]
	}
	return new(big.Int).SetBytes(be[:])
}

func (n *NEARPlugin) rpcCall(ctx context.Context, method string, params interface{}) (json.RawMessage, error) {
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

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, n.rpcURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := n.client.Do(req)
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
			Code    int             `json:"code"`
			Message string          `json:"message"`
			Data    json.RawMessage `json:"data"`
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
