// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

package plugins

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/big"
	"net/http"
	"strconv"
	"time"
)

const CosmosChainID uint64 = 0x434F534D // "COSM" in Teleporter namespace

// CosmosPlugin polls a Cosmos/IBC Tendermint RPC node for deposit events
// from the bridge module. Uses secp256k1 signing and IBC event attributes.
type CosmosPlugin struct {
	rpcURL     string
	bridgeAddr string // Bech32 contract address
	client     *http.Client
}

func NewCosmosPlugin(rpcURL, bridgeAddr string) *CosmosPlugin {
	return &CosmosPlugin{
		rpcURL:     rpcURL,
		bridgeAddr: bridgeAddr,
		client:     &http.Client{Timeout: 15 * time.Second},
	}
}

func (c *CosmosPlugin) Name() string    { return "cosmos" }
func (c *CosmosPlugin) ChainID() uint64 { return CosmosChainID }

// PollDeposits fetches deposit events from the bridge module via Tendermint
// tx_search RPC, scanning blocks from fromBlock+1 to the current height.
func (c *CosmosPlugin) PollDeposits(ctx context.Context, fromBlock uint64) ([]DepositEvent, uint64, error) {
	height, err := c.getLatestHeight(ctx)
	if err != nil {
		return nil, fromBlock, fmt.Errorf("cosmos: get height: %w", err)
	}
	if height <= fromBlock {
		return nil, fromBlock, nil
	}

	txs, err := c.txSearch(ctx, fromBlock+1)
	if err != nil {
		return nil, fromBlock, fmt.Errorf("cosmos: tx_search: %w", err)
	}

	var events []DepositEvent
	for _, tx := range txs {
		deposit, ok := c.parseDepositFromTxResult(tx)
		if ok {
			events = append(events, deposit)
		}
	}

	return events, height, nil
}

// QueryBacking calls the CosmWasm bridge contract query to get total locked value.
func (c *CosmosPlugin) QueryBacking(ctx context.Context) (*big.Int, error) {
	queryData := `{"get_total_locked":{}}`
	queryHex := hex.EncodeToString([]byte(queryData))
	path := "/cosmwasm.wasm.v1.Query/SmartContractState"

	params := map[string]interface{}{
		"path": path,
		"data": queryHex,
	}

	result, err := c.rpcCall(ctx, "abci_query", params)
	if err != nil {
		return nil, fmt.Errorf("cosmos: abci_query total_locked: %w", err)
	}

	var queryResp struct {
		Response struct {
			Value string `json:"value"` // base64-encoded response
			Code  int    `json:"code"`
			Log   string `json:"log"`
		} `json:"response"`
	}
	if err := json.Unmarshal(result, &queryResp); err != nil {
		return nil, fmt.Errorf("cosmos: parse abci_query: %w", err)
	}
	if queryResp.Response.Code != 0 {
		return nil, fmt.Errorf("cosmos: abci_query error code %d: %s", queryResp.Response.Code, queryResp.Response.Log)
	}

	// Response value is base64-encoded JSON: {"total_locked":"123456"}
	valueBytes, err := base64.StdEncoding.DecodeString(queryResp.Response.Value)
	if err != nil {
		return nil, fmt.Errorf("cosmos: decode query value: %w", err)
	}

	var lockResp struct {
		TotalLocked string `json:"total_locked"`
	}
	if err := json.Unmarshal(valueBytes, &lockResp); err != nil {
		return nil, fmt.Errorf("cosmos: parse total_locked response: %w", err)
	}

	amount, ok := new(big.Int).SetString(lockResp.TotalLocked, 10)
	if !ok {
		return nil, fmt.Errorf("cosmos: invalid total_locked value: %s", lockResp.TotalLocked)
	}
	return amount, nil
}

// ────────────────────────────────────────────────────────────────────
// Cosmos Tendermint RPC types and helpers
// ────────────────────────────────────────────────────────────────────

type cosmosTxResult struct {
	Hash     string `json:"hash"`
	Height   string `json:"height"`
	TxResult struct {
		Events []cosmosEvent `json:"events"`
	} `json:"tx_result"`
}

type cosmosEvent struct {
	Type       string            `json:"type"`
	Attributes []cosmosAttribute `json:"attributes"`
}

type cosmosAttribute struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

func (c *CosmosPlugin) getLatestHeight(ctx context.Context) (uint64, error) {
	result, err := c.rpcCall(ctx, "status", nil)
	if err != nil {
		return 0, err
	}

	var status struct {
		SyncInfo struct {
			LatestBlockHeight string `json:"latest_block_height"`
		} `json:"sync_info"`
	}
	if err := json.Unmarshal(result, &status); err != nil {
		return 0, fmt.Errorf("parse status: %w", err)
	}

	height, err := strconv.ParseUint(status.SyncInfo.LatestBlockHeight, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("parse height: %w", err)
	}
	return height, nil
}

func (c *CosmosPlugin) txSearch(ctx context.Context, fromBlock uint64) ([]cosmosTxResult, error) {
	query := fmt.Sprintf("tx.height>%d AND message.module='bridge'", fromBlock-1)

	var allTxs []cosmosTxResult
	page := 1

	for {
		params := map[string]interface{}{
			"query":    query,
			"order_by": "asc",
			"per_page": "100",
			"page":     strconv.Itoa(page),
		}

		result, err := c.rpcCall(ctx, "tx_search", params)
		if err != nil {
			return allTxs, fmt.Errorf("tx_search page %d: %w", page, err)
		}

		var searchResp struct {
			Txs        []cosmosTxResult `json:"txs"`
			TotalCount string           `json:"total_count"`
		}
		if err := json.Unmarshal(result, &searchResp); err != nil {
			return allTxs, fmt.Errorf("parse tx_search: %w", err)
		}

		allTxs = append(allTxs, searchResp.Txs...)

		totalCount, _ := strconv.Atoi(searchResp.TotalCount)
		if len(allTxs) >= totalCount || len(searchResp.Txs) == 0 {
			break
		}
		page++
	}

	return allTxs, nil
}

func (c *CosmosPlugin) parseDepositFromTxResult(tx cosmosTxResult) (DepositEvent, bool) {
	for _, ev := range tx.TxResult.Events {
		if ev.Type != "deposit" {
			continue
		}

		attrs := make(map[string]string)
		for _, attr := range ev.Attributes {
			attrs[attr.Key] = attr.Value
		}

		nonceStr, ok := attrs["nonce"]
		if !ok {
			continue
		}
		recipientHex, ok := attrs["recipient"]
		if !ok {
			continue
		}
		amountStr, ok := attrs["amount"]
		if !ok {
			continue
		}

		nonce, err := strconv.ParseUint(nonceStr, 10, 64)
		if err != nil {
			log.Printf("WARN: cosmos: skip tx %s: invalid nonce %q: %v", tx.Hash, nonceStr, err)
			continue
		}

		amount, amtOk := new(big.Int).SetString(amountStr, 10)
		if !amtOk {
			log.Printf("WARN: cosmos: skip tx %s: invalid amount %q", tx.Hash, amountStr)
			continue
		}

		var recipient [20]byte
		recipientBytes, err := hexToBytes(recipientHex)
		if err != nil || len(recipientBytes) < 20 {
			log.Printf("WARN: cosmos: skip tx %s: invalid recipient %q", tx.Hash, recipientHex)
			continue
		}
		copy(recipient[:], recipientBytes[len(recipientBytes)-20:])

		height, _ := strconv.ParseUint(tx.Height, 10, 64)

		return DepositEvent{
			SrcChainID:  CosmosChainID,
			Nonce:       nonce,
			Recipient:   recipient,
			Amount:      amount,
			TxID:        tx.Hash,
			BlockHeight: height,
		}, true
	}
	return DepositEvent{}, false
}

func (c *CosmosPlugin) rpcCall(ctx context.Context, method string, params interface{}) (json.RawMessage, error) {
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

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.rpcURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.client.Do(req)
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
