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

const XRPLChainID uint64 = 0x5852504C // "XRPL" in Teleporter namespace

// XRPLPlugin polls an XRPL JSON-RPC node for deposit transactions
// to the bridge account. Deposits are identified by Payment transactions
// with a specific DestinationTag, and the recipient EVM address is
// encoded in the transaction Memos field.
type XRPLPlugin struct {
	rpcURL     string
	bridgeAddr string // XRPL classic address (r...)
	client     *http.Client
}

func NewXRPLPlugin(rpcURL, bridgeAddr string) *XRPLPlugin {
	return &XRPLPlugin{
		rpcURL:     rpcURL,
		bridgeAddr: bridgeAddr,
		client:     &http.Client{Timeout: 15 * time.Second},
	}
}

func (x *XRPLPlugin) Name() string    { return "xrpl" }
func (x *XRPLPlugin) ChainID() uint64 { return XRPLChainID }

// PollDeposits fetches Payment transactions to the bridge account since
// the given ledger index, extracts deposit info from memos and amount.
// XRPL uses ledger_index instead of block height for position tracking.
func (x *XRPLPlugin) PollDeposits(ctx context.Context, fromLedger uint64) ([]DepositEvent, uint64, error) {
	currentLedger, err := x.getCurrentLedger(ctx)
	if err != nil {
		return nil, fromLedger, fmt.Errorf("xrpl: get ledger: %w", err)
	}
	if currentLedger <= fromLedger {
		return nil, fromLedger, nil
	}

	txs, err := x.getAccountTx(ctx, fromLedger+1, currentLedger)
	if err != nil {
		return nil, fromLedger, fmt.Errorf("xrpl: account_tx: %w", err)
	}

	var events []DepositEvent
	for _, tx := range txs {
		deposit, ok := x.parseDepositFromTx(tx)
		if ok {
			events = append(events, deposit)
		}
	}

	return events, currentLedger, nil
}

// QueryBacking returns the XRP balance of the bridge account in drops.
// 1 XRP = 1,000,000 drops.
func (x *XRPLPlugin) QueryBacking(ctx context.Context) (*big.Int, error) {
	params := map[string]interface{}{
		"account":      x.bridgeAddr,
		"strict":       true,
		"ledger_index": "validated",
	}

	result, err := x.rpcCall(ctx, "account_info", params)
	if err != nil {
		return nil, fmt.Errorf("xrpl: account_info: %w", err)
	}

	var resp struct {
		AccountData struct {
			Balance string `json:"Balance"` // Balance in drops
		} `json:"account_data"`
	}
	if err := json.Unmarshal(result, &resp); err != nil {
		return nil, fmt.Errorf("xrpl: parse account_info: %w", err)
	}

	balance, ok := new(big.Int).SetString(resp.AccountData.Balance, 10)
	if !ok {
		return nil, fmt.Errorf("xrpl: invalid balance: %s", resp.AccountData.Balance)
	}
	return balance, nil
}

// ────────────────────────────────────────────────────────────────────
// XRPL JSON-RPC types and helpers
// ────────────────────────────────────────────────────────────────────

type xrplTxEntry struct {
	Tx struct {
		TransactionType string     `json:"TransactionType"`
		Hash            string     `json:"hash"`
		Destination     string     `json:"Destination"`
		DestinationTag  *uint64    `json:"DestinationTag"`
		Amount          xrplAmount `json:"Amount"`
		Memos           []xrplMemo `json:"Memos"`
	} `json:"tx"`
	Meta struct {
		TransactionResult string `json:"TransactionResult"`
	} `json:"meta"`
	Validated    bool   `json:"validated"`
	LedgerIndex  uint64 `json:"ledger_index"`
}

// xrplAmount handles both XRP (string of drops) and issued currency (object).
type xrplAmount json.RawMessage

func (a *xrplAmount) UnmarshalJSON(data []byte) error {
	*a = xrplAmount(data)
	return nil
}

func (a xrplAmount) MarshalJSON() ([]byte, error) {
	return json.RawMessage(a), nil
}

// dropsValue returns the amount in drops for XRP payments.
// Returns nil for issued currency payments (not supported for bridge deposits).
func (a xrplAmount) dropsValue() *big.Int {
	raw := json.RawMessage(a)
	var drops string
	if json.Unmarshal(raw, &drops) == nil {
		val, ok := new(big.Int).SetString(drops, 10)
		if ok {
			return val
		}
	}
	return nil
}

type xrplMemo struct {
	Memo struct {
		MemoData string `json:"MemoData"` // Hex-encoded memo data
		MemoType string `json:"MemoType"` // Hex-encoded memo type
	} `json:"Memo"`
}

// bridgeDepositTag is the DestinationTag that identifies bridge deposits.
const bridgeDepositTag uint64 = 0x4C555842 // "LUXB"

func (x *XRPLPlugin) getCurrentLedger(ctx context.Context) (uint64, error) {
	result, err := x.rpcCall(ctx, "ledger_current", map[string]interface{}{})
	if err != nil {
		return 0, err
	}

	var resp struct {
		LedgerCurrentIndex uint64 `json:"ledger_current_index"`
	}
	if err := json.Unmarshal(result, &resp); err != nil {
		return 0, fmt.Errorf("parse ledger_current: %w", err)
	}
	return resp.LedgerCurrentIndex, nil
}

func (x *XRPLPlugin) getAccountTx(ctx context.Context, minLedger, maxLedger uint64) ([]xrplTxEntry, error) {
	var allTxs []xrplTxEntry
	marker := json.RawMessage("null")
	firstPage := true

	for {
		params := map[string]interface{}{
			"account":          x.bridgeAddr,
			"ledger_index_min": minLedger,
			"ledger_index_max": maxLedger,
			"limit":            100,
			"forward":          true,
		}
		if !firstPage {
			params["marker"] = marker
		}

		result, err := x.rpcCall(ctx, "account_tx", params)
		if err != nil {
			return allTxs, fmt.Errorf("account_tx: %w", err)
		}

		var resp struct {
			Transactions []xrplTxEntry   `json:"transactions"`
			Marker       json.RawMessage `json:"marker"`
		}
		if err := json.Unmarshal(result, &resp); err != nil {
			return allTxs, fmt.Errorf("parse account_tx: %w", err)
		}

		allTxs = append(allTxs, resp.Transactions...)

		if resp.Marker == nil || string(resp.Marker) == "null" || len(resp.Transactions) == 0 {
			break
		}
		marker = resp.Marker
		firstPage = false
	}

	return allTxs, nil
}

func (x *XRPLPlugin) parseDepositFromTx(entry xrplTxEntry) (DepositEvent, bool) {
	tx := entry.Tx

	// Only successful Payment transactions to the bridge account.
	if tx.TransactionType != "Payment" {
		return DepositEvent{}, false
	}
	if entry.Meta.TransactionResult != "tesSUCCESS" {
		return DepositEvent{}, false
	}
	if !entry.Validated {
		return DepositEvent{}, false
	}
	if tx.Destination != x.bridgeAddr {
		return DepositEvent{}, false
	}

	// Must have the bridge deposit DestinationTag.
	if tx.DestinationTag == nil || *tx.DestinationTag != bridgeDepositTag {
		return DepositEvent{}, false
	}

	// Amount must be XRP (string of drops), not issued currency.
	amount := xrplAmount(tx.Amount).dropsValue()
	if amount == nil {
		log.Printf("WARN: xrpl: skip tx %s: non-XRP amount", tx.Hash)
		return DepositEvent{}, false
	}

	// Extract recipient EVM address from Memos.
	// MemoData contains the hex-encoded 20-byte EVM address.
	var recipient [20]byte
	found := false
	for _, m := range tx.Memos {
		data, err := hexToBytes(m.Memo.MemoData)
		if err != nil || len(data) < 20 {
			continue
		}
		copy(recipient[:], data[len(data)-20:])
		found = true
		break
	}
	if !found {
		log.Printf("WARN: xrpl: skip tx %s: no valid recipient memo", tx.Hash)
		return DepositEvent{}, false
	}

	// XRPL does not have a native nonce in Payment transactions.
	// Use the ledger_index as a monotonic position tracker.
	// The watcher deduplicates by TxID.
	return DepositEvent{
		SrcChainID:  XRPLChainID,
		Nonce:       entry.LedgerIndex,
		Recipient:   recipient,
		Amount:      amount,
		TxID:        tx.Hash,
		BlockHeight: entry.LedgerIndex,
	}, true
}

func (x *XRPLPlugin) rpcCall(ctx context.Context, method string, params interface{}) (json.RawMessage, error) {
	reqBody := map[string]interface{}{
		"method": method,
		"params": []interface{}{params},
	}
	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, x.rpcURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := x.client.Do(req)
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
	}
	if err := json.Unmarshal(respBody, &rpcResp); err != nil {
		return nil, fmt.Errorf("rpc decode: %w", err)
	}

	// XRPL JSON-RPC wraps errors inside the result object.
	var errCheck struct {
		Status string `json:"status"`
		Error  string `json:"error"`
	}
	if json.Unmarshal(rpcResp.Result, &errCheck) == nil && errCheck.Status == "error" {
		return nil, fmt.Errorf("xrpl rpc error: %s", errCheck.Error)
	}

	return rpcResp.Result, nil
}
