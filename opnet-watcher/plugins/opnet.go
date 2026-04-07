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

const OPNETChainID uint64 = 4294967299 // 0x100000003 in Teleporter namespace

// OPNETPlugin polls an OP_NET node for Lock events from the bridge contract
// and converts them to canonical DepositEvent format.
type OPNETPlugin struct {
	rpcURL     string
	bridgeAddr string
	client     *http.Client
}

func NewOPNETPlugin(rpcURL, bridgeAddr string) *OPNETPlugin {
	return &OPNETPlugin{
		rpcURL:     rpcURL,
		bridgeAddr: bridgeAddr,
		client:     &http.Client{Timeout: 10 * time.Second},
	}
}

func (o *OPNETPlugin) Name() string    { return "opnet" }
func (o *OPNETPlugin) ChainID() uint64 { return OPNETChainID }

// PollDeposits fetches Lock events from the OP_NET bridge contract between
// fromBlock+1 and the current block height.
func (o *OPNETPlugin) PollDeposits(ctx context.Context, fromBlock uint64) ([]DepositEvent, uint64, error) {
	height, err := o.getBlockHeight(ctx)
	if err != nil {
		return nil, fromBlock, fmt.Errorf("opnet: get height: %w", err)
	}
	if height <= fromBlock {
		return nil, fromBlock, nil
	}

	var events []DepositEvent
	for block := fromBlock + 1; block <= height; block++ {
		blockEvents, err := o.getBlockDeposits(ctx, block)
		if err != nil {
			return events, block - 1, fmt.Errorf("opnet: block %d: %w", block, err)
		}
		events = append(events, blockEvents...)
	}
	return events, height, nil
}

// QueryBacking calls totalLocked() on the OP_NET bridge contract.
func (o *OPNETPlugin) QueryBacking(ctx context.Context) (*big.Int, error) {
	// totalLocked() selector
	selector := "0xaf29611e" // keccak256("totalLocked()")[:4]

	params := map[string]string{
		"to":   o.bridgeAddr,
		"data": selector,
	}
	result, err := o.rpcCall(ctx, "opnet_call", []interface{}{params, "latest"})
	if err != nil {
		return nil, fmt.Errorf("query totalLocked: %w", err)
	}

	var hexResult string
	if err := json.Unmarshal(result, &hexResult); err != nil {
		return nil, fmt.Errorf("parse totalLocked: %w", err)
	}

	data, err := hexToBytes(hexResult)
	if err != nil {
		return nil, fmt.Errorf("decode totalLocked: %w", err)
	}
	if len(data) < 32 {
		return nil, fmt.Errorf("totalLocked too short: %d bytes", len(data))
	}
	return new(big.Int).SetBytes(data[:32]), nil
}

// ────────────────────────────────────────────────────────────────────
// OP_NET RPC helpers
// ────────────────────────────────────────────────────────────────────

func (o *OPNETPlugin) getBlockHeight(ctx context.Context) (uint64, error) {
	resp, err := o.rpcCall(ctx, "opnet_blockNumber", nil)
	if err != nil {
		return 0, err
	}
	var height uint64
	if err := json.Unmarshal(resp, &height); err != nil {
		var hexHeight string
		if err2 := json.Unmarshal(resp, &hexHeight); err2 != nil {
			return 0, fmt.Errorf("parse height: %w", err)
		}
		n := new(big.Int)
		n.SetString(hexHeight, 0)
		height = n.Uint64()
	}
	return height, nil
}

func (o *OPNETPlugin) getBlockDeposits(ctx context.Context, blockNum uint64) ([]DepositEvent, error) {
	lockTopic := "0x6c6f636b00000000000000000000000000000000000000000000000000000000"

	params := map[string]interface{}{
		"fromBlock": fmt.Sprintf("0x%x", blockNum),
		"toBlock":   fmt.Sprintf("0x%x", blockNum),
		"address":   o.bridgeAddr,
		"topics":    [][]string{{lockTopic}},
	}

	resp, err := o.rpcCall(ctx, "opnet_getLogs", []interface{}{params})
	if err != nil {
		return nil, err
	}

	var logs []struct {
		TxHash string   `json:"transactionHash"`
		Topics []string `json:"topics"`
		Data   string   `json:"data"`
	}
	if err := json.Unmarshal(resp, &logs); err != nil {
		return nil, fmt.Errorf("parse logs: %w", err)
	}

	var events []DepositEvent
	for _, l := range logs {
		data, err := hexToBytes(l.Data)
		if err != nil {
			log.Printf("WARN: skipping malformed event at block %d: hex decode error: %v", blockNum, err)
			continue
		}
		if len(data) < 160 {
			log.Printf("WARN: skipping malformed event at block %d: data length %d < 160", blockNum, len(data))
			continue
		}

		nonce := new(big.Int).SetBytes(data[64:96]).Uint64()
		var recipient [20]byte
		copy(recipient[:], data[108:128])
		amount := new(big.Int).SetBytes(data[128:160])

		events = append(events, DepositEvent{
			SrcChainID:  OPNETChainID,
			Nonce:       nonce,
			Recipient:   recipient,
			Amount:      amount,
			TxID:        l.TxHash,
			BlockHeight: blockNum,
		})
	}
	return events, nil
}

func (o *OPNETPlugin) rpcCall(ctx context.Context, method string, params interface{}) (json.RawMessage, error) {
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

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, o.rpcURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := o.client.Do(req)
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

func hexToBytes(s string) ([]byte, error) {
	if len(s) >= 2 && s[:2] == "0x" {
		s = s[2:]
	}
	if len(s)%2 != 0 {
		s = "0" + s
	}
	b := make([]byte, len(s)/2)
	for i := 0; i < len(b); i++ {
		hi := unhex(s[2*i])
		lo := unhex(s[2*i+1])
		if hi == 0xff || lo == 0xff {
			return nil, fmt.Errorf("invalid hex at %d", 2*i)
		}
		b[i] = hi<<4 | lo
	}
	return b, nil
}

func unhex(c byte) byte {
	switch {
	case '0' <= c && c <= '9':
		return c - '0'
	case 'a' <= c && c <= 'f':
		return c - 'a' + 10
	case 'A' <= c && c <= 'F':
		return c - 'A' + 10
	default:
		return 0xff
	}
}
