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

const ICPChainID uint64 = 0x49435000 // "ICP\x00" in Teleporter namespace

// ICPPlugin polls the ICP HTTP gateway for deposit events from the bridge
// canister. Uses the JSON-based query interface to avoid CBOR dependencies.
type ICPPlugin struct {
	apiURL     string
	canisterID string
	client     *http.Client
}

func NewICPPlugin(apiURL, canisterID string) *ICPPlugin {
	return &ICPPlugin{
		apiURL:     apiURL,
		canisterID: canisterID,
		client:     &http.Client{Timeout: 15 * time.Second},
	}
}

func (i *ICPPlugin) Name() string    { return "icp" }
func (i *ICPPlugin) ChainID() uint64 { return ICPChainID }

// PollDeposits queries the bridge canister for deposit events after fromBlock
// via the ICP HTTP gateway's JSON query interface.
func (i *ICPPlugin) PollDeposits(ctx context.Context, fromBlock uint64) ([]DepositEvent, uint64, error) {
	height, err := i.getBlockHeight(ctx)
	if err != nil {
		return nil, fromBlock, fmt.Errorf("icp: get block height: %w", err)
	}
	if height <= fromBlock {
		return nil, fromBlock, nil
	}

	deposits, err := i.queryDeposits(ctx, fromBlock)
	if err != nil {
		return nil, fromBlock, fmt.Errorf("icp: query deposits: %w", err)
	}

	var events []DepositEvent
	for _, d := range deposits {
		recipBytes, err := hexToBytes(d.Recipient)
		if err != nil || len(recipBytes) != 20 {
			log.Printf("WARN: icp: skip deposit nonce %d: invalid recipient %q", d.Nonce, d.Recipient)
			continue
		}
		var recipient [20]byte
		copy(recipient[:], recipBytes)

		amount, ok := new(big.Int).SetString(d.Amount, 10)
		if !ok {
			log.Printf("WARN: icp: skip deposit nonce %d: invalid amount %q", d.Nonce, d.Amount)
			continue
		}

		events = append(events, DepositEvent{
			SrcChainID:  ICPChainID,
			Nonce:       d.Nonce,
			Recipient:   recipient,
			Amount:      amount,
			TxID:        d.TxID,
			BlockHeight: d.BlockHeight,
		})
	}

	return events, height, nil
}

// QueryBacking calls the get_total_locked query method on the bridge canister.
func (i *ICPPlugin) QueryBacking(ctx context.Context) (*big.Int, error) {
	var result struct {
		Value string `json:"value"`
	}
	if err := i.canisterQuery(ctx, "get_total_locked", nil, &result); err != nil {
		return nil, fmt.Errorf("icp: query backing: %w", err)
	}

	val, ok := new(big.Int).SetString(result.Value, 10)
	if !ok {
		return nil, fmt.Errorf("icp: parse total_locked: %s", result.Value)
	}
	return val, nil
}

// ────────────────────────────────────────────────────────────────────
// ICP HTTP gateway types and helpers
// ────────────────────────────────────────────────────────────────────

type icpDeposit struct {
	Nonce       uint64 `json:"nonce"`
	Recipient   string `json:"recipient"`   // hex EVM address
	Amount      string `json:"amount"`      // decimal string
	TxID        string `json:"tx_id"`
	BlockHeight uint64 `json:"block_height"`
}

func (i *ICPPlugin) getBlockHeight(ctx context.Context) (uint64, error) {
	var result struct {
		Height uint64 `json:"height"`
	}
	if err := i.canisterQuery(ctx, "get_block_height", nil, &result); err != nil {
		return 0, err
	}
	return result.Height, nil
}

func (i *ICPPlugin) queryDeposits(ctx context.Context, fromBlock uint64) ([]icpDeposit, error) {
	args := map[string]interface{}{
		"from_block": fromBlock,
	}
	var result struct {
		Deposits []icpDeposit `json:"deposits"`
	}
	if err := i.canisterQuery(ctx, "get_deposits_after", args, &result); err != nil {
		return nil, err
	}
	return result.Deposits, nil
}

// canisterQuery sends a JSON query request to the ICP HTTP gateway.
// The gateway translates JSON to the canister's Candid interface.
// Request format:
//
//	POST /api/v2/canister/{canister_id}/query
//	{
//	  "method_name": "<method>",
//	  "arg": { ... }
//	}
//
// Response format:
//
//	{
//	  "status": "replied",
//	  "reply": { ... }
//	}
func (i *ICPPlugin) canisterQuery(ctx context.Context, method string, args interface{}, dest interface{}) error {
	reqBody := map[string]interface{}{
		"method_name": method,
	}
	if args != nil {
		reqBody["arg"] = args
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return err
	}

	url := fmt.Sprintf("%s/api/v2/canister/%s/query", i.apiURL, i.canisterID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := i.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("icp query %s: %d: %s", method, resp.StatusCode, respBody)
	}

	var envelope struct {
		Status string          `json:"status"`
		Reply  json.RawMessage `json:"reply"`
		Error  string          `json:"error"`
	}
	if err := json.Unmarshal(respBody, &envelope); err != nil {
		return fmt.Errorf("icp: parse response: %w", err)
	}
	if envelope.Status == "rejected" {
		return fmt.Errorf("icp: canister rejected: %s", envelope.Error)
	}
	if envelope.Status != "replied" {
		return fmt.Errorf("icp: unexpected status: %s", envelope.Status)
	}
	if dest != nil {
		return json.Unmarshal(envelope.Reply, dest)
	}
	return nil
}
