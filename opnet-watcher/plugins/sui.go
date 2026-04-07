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

const SuiChainID uint64 = 0x53554900 // "SUI\x00" in Teleporter namespace

// SuiPlugin polls a Sui JSON-RPC node for DepositEvent emissions from the
// bridge Move module and converts them to canonical DepositEvent format.
type SuiPlugin struct {
	rpcURL     string
	bridgeAddr string // Move module object ID
	client     *http.Client
}

func NewSuiPlugin(rpcURL, bridgeAddr string) *SuiPlugin {
	return &SuiPlugin{
		rpcURL:     rpcURL,
		bridgeAddr: bridgeAddr,
		client:     &http.Client{Timeout: 15 * time.Second},
	}
}

func (s *SuiPlugin) Name() string    { return "sui" }
func (s *SuiPlugin) ChainID() uint64 { return SuiChainID }

// PollDeposits queries Sui for DepositEvent events emitted by the bridge Move
// module starting from the given checkpoint sequence number. Uses suix_queryEvents
// with a MoveEventType filter.
func (s *SuiPlugin) PollDeposits(ctx context.Context, fromCheckpoint uint64) ([]DepositEvent, uint64, error) {
	currentCP, err := s.latestCheckpoint(ctx)
	if err != nil {
		return nil, fromCheckpoint, fmt.Errorf("sui: get checkpoint: %w", err)
	}
	if currentCP <= fromCheckpoint {
		return nil, fromCheckpoint, nil
	}

	eventType := fmt.Sprintf("%s::bridge::DepositEvent", s.bridgeAddr)
	query := map[string]interface{}{
		"MoveEventType": eventType,
	}
	// suix_queryEvents params: query, cursor (null = start), limit, descending
	params := []interface{}{query, nil, 100, false}
	result, err := s.rpcCall(ctx, "suix_queryEvents", params)
	if err != nil {
		return nil, fromCheckpoint, fmt.Errorf("sui: query events: %w", err)
	}

	var page struct {
		Data []struct {
			ID struct {
				TxDigest string `json:"txDigest"`
				EventSeq string `json:"eventSeq"`
			} `json:"id"`
			TimestampMs string          `json:"timestampMs"`
			ParsedJSON  json.RawMessage `json:"parsedJson"`
		} `json:"data"`
		NextCursor  json.RawMessage `json:"nextCursor"`
		HasNextPage bool            `json:"hasNextPage"`
	}
	if err := json.Unmarshal(result, &page); err != nil {
		return nil, fromCheckpoint, fmt.Errorf("sui: parse events: %w", err)
	}

	var events []DepositEvent
	for _, ev := range page.Data {
		var fields struct {
			Sender    string `json:"sender"`
			Recipient string `json:"recipient"`
			Amount    string `json:"amount"`
			Nonce     string `json:"nonce"`
		}
		if err := json.Unmarshal(ev.ParsedJSON, &fields); err != nil {
			log.Printf("WARN: sui: skip malformed event in tx %s: %v", ev.ID.TxDigest, err)
			continue
		}

		recipient, err := hexToRecipient(fields.Recipient)
		if err != nil {
			log.Printf("WARN: sui: skip bad recipient in tx %s: %v", ev.ID.TxDigest, err)
			continue
		}

		amount, ok := new(big.Int).SetString(fields.Amount, 10)
		if !ok {
			log.Printf("WARN: sui: skip bad amount in tx %s: %s", ev.ID.TxDigest, fields.Amount)
			continue
		}

		nonce, ok := new(big.Int).SetString(fields.Nonce, 10)
		if !ok {
			log.Printf("WARN: sui: skip bad nonce in tx %s: %s", ev.ID.TxDigest, fields.Nonce)
			continue
		}

		events = append(events, DepositEvent{
			SrcChainID:  SuiChainID,
			Nonce:       nonce.Uint64(),
			Recipient:   recipient,
			Amount:      amount,
			TxID:        ev.ID.TxDigest,
			BlockHeight: currentCP,
		})
	}

	return events, currentCP, nil
}

// QueryBacking reads the total_locked field from the bridge module object via
// sui_getObject.
func (s *SuiPlugin) QueryBacking(ctx context.Context) (*big.Int, error) {
	params := []interface{}{
		s.bridgeAddr,
		map[string]interface{}{
			"showContent": true,
		},
	}
	result, err := s.rpcCall(ctx, "sui_getObject", params)
	if err != nil {
		return nil, fmt.Errorf("sui: get object: %w", err)
	}

	var obj struct {
		Data struct {
			Content struct {
				Fields map[string]json.RawMessage `json:"fields"`
			} `json:"content"`
		} `json:"data"`
	}
	if err := json.Unmarshal(result, &obj); err != nil {
		return nil, fmt.Errorf("sui: parse object: %w", err)
	}

	raw, ok := obj.Data.Content.Fields["total_locked"]
	if !ok {
		return nil, fmt.Errorf("sui: total_locked field not found in object %s", s.bridgeAddr)
	}

	// total_locked may be a JSON string (u64 in Move) or number.
	var strVal string
	if err := json.Unmarshal(raw, &strVal); err != nil {
		// Try as number.
		var numVal uint64
		if err2 := json.Unmarshal(raw, &numVal); err2 != nil {
			return nil, fmt.Errorf("sui: parse total_locked: %w", err)
		}
		return new(big.Int).SetUint64(numVal), nil
	}

	val, ok := new(big.Int).SetString(strVal, 10)
	if !ok {
		return nil, fmt.Errorf("sui: parse total_locked string: %s", strVal)
	}
	return val, nil
}

// ────────────────────────────────────────────────────────────────────
// Sui RPC helpers
// ────────────────────────────────────────────────────────────────────

func (s *SuiPlugin) latestCheckpoint(ctx context.Context) (uint64, error) {
	result, err := s.rpcCall(ctx, "sui_getLatestCheckpointSequenceNumber", nil)
	if err != nil {
		return 0, err
	}
	// Returns a string-encoded u64.
	var seq string
	if err := json.Unmarshal(result, &seq); err != nil {
		return 0, fmt.Errorf("parse checkpoint: %w", err)
	}
	n, ok := new(big.Int).SetString(seq, 10)
	if !ok {
		return 0, fmt.Errorf("parse checkpoint number: %s", seq)
	}
	return n.Uint64(), nil
}

// hexToRecipient converts a hex string (with or without 0x prefix) to [20]byte.
func hexToRecipient(hex string) ([20]byte, error) {
	var addr [20]byte
	b, err := hexToBytes(hex)
	if err != nil {
		return addr, err
	}
	if len(b) < 20 {
		return addr, fmt.Errorf("address too short: %d bytes", len(b))
	}
	// Take the last 20 bytes if longer (e.g., 32-byte zero-padded).
	copy(addr[:], b[len(b)-20:])
	return addr, nil
}

func (s *SuiPlugin) rpcCall(ctx context.Context, method string, params interface{}) (json.RawMessage, error) {
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
