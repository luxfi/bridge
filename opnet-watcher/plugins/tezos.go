// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

package plugins

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/big"
	"net/http"
	"time"
)

const TezosChainID uint64 = 4294967500

// TezosPlugin polls a Tezos RPC node for deposit operations from the bridge
// Michelson contract. Tezos uses ed25519 signing.
type TezosPlugin struct {
	rpcURL     string
	bridgeAddr string // KT1... contract address
	client     *http.Client
}

func NewTezosPlugin(rpcURL, bridgeAddr string) *TezosPlugin {
	return &TezosPlugin{
		rpcURL:     rpcURL,
		bridgeAddr: bridgeAddr,
		client:     &http.Client{Timeout: 15 * time.Second},
	}
}

func (t *TezosPlugin) Name() string    { return "tezos" }
func (t *TezosPlugin) ChainID() uint64 { return TezosChainID }

// PollDeposits fetches manager operations from Tezos blocks since the given level,
// filters for transactions to the bridge contract's deposit entrypoint,
// and converts them to canonical DepositEvent format.
func (t *TezosPlugin) PollDeposits(ctx context.Context, fromLevel uint64) ([]DepositEvent, uint64, error) {
	headLevel, err := t.headLevel(ctx)
	if err != nil {
		return nil, fromLevel, fmt.Errorf("tezos: head level: %w", err)
	}
	if headLevel <= fromLevel {
		return nil, fromLevel, nil
	}

	var events []DepositEvent

	// Scan blocks from fromLevel+1 to headLevel.
	// Cap scan window to avoid unbounded requests on first run.
	start := fromLevel + 1
	if headLevel-start > 50 {
		start = headLevel - 50
	}

	for level := start; level <= headLevel; level++ {
		ops, err := t.getManagerOps(ctx, level)
		if err != nil {
			log.Printf("WARN: tezos: skip level %d: %v", level, err)
			continue
		}

		for _, op := range ops {
			for _, content := range op.Contents {
				if content.Kind != "transaction" {
					continue
				}
				if content.Destination != t.bridgeAddr {
					continue
				}
				deposit, ok := parseTezosDeposit(content, level, op.Hash)
				if ok {
					events = append(events, deposit)
				}
			}
		}
	}

	return events, headLevel, nil
}

// QueryBacking reads the bridge contract's storage to get the total_locked value.
func (t *TezosPlugin) QueryBacking(ctx context.Context) (*big.Int, error) {
	url := fmt.Sprintf("%s/chains/main/blocks/head/context/contracts/%s/storage",
		t.rpcURL, t.bridgeAddr)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("tezos: new request: %w", err)
	}

	resp, err := t.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("tezos: get storage: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("tezos: read storage: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("tezos: storage status %d: %s", resp.StatusCode, body)
	}

	val, err := extractTotalLocked(body)
	if err != nil {
		return nil, fmt.Errorf("tezos: parse storage: %w", err)
	}
	return val, nil
}

// ────────────────────────────────────────────────────────────────────
// Tezos RPC types and helpers
// ────────────────────────────────────────────────────────────────────

type tezosOperation struct {
	Hash     string              `json:"hash"`
	Contents []tezosOpContent    `json:"contents"`
}

type tezosOpContent struct {
	Kind        string                 `json:"kind"`
	Destination string                 `json:"destination"`
	Amount      string                 `json:"amount"`
	Parameters  *tezosParameters       `json:"parameters,omitempty"`
}

type tezosParameters struct {
	Entrypoint string          `json:"entrypoint"`
	Value      json.RawMessage `json:"value"`
}

func (t *TezosPlugin) headLevel(ctx context.Context) (uint64, error) {
	url := fmt.Sprintf("%s/chains/main/blocks/head/header", t.rpcURL)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, err
	}

	resp, err := t.client.Do(req)
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

	var header struct {
		Level uint64 `json:"level"`
	}
	if err := json.Unmarshal(body, &header); err != nil {
		return 0, fmt.Errorf("parse header: %w", err)
	}
	return header.Level, nil
}

// getManagerOps fetches manager operations (group 3) at a specific block level.
func (t *TezosPlugin) getManagerOps(ctx context.Context, level uint64) ([]tezosOperation, error) {
	url := fmt.Sprintf("%s/chains/main/blocks/%d/operations/3", t.rpcURL, level)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := t.client.Do(req)
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

	var ops []tezosOperation
	if err := json.Unmarshal(body, &ops); err != nil {
		return nil, fmt.Errorf("parse operations: %w", err)
	}
	return ops, nil
}

// parseTezosDeposit extracts a DepositEvent from a Tezos transaction operation
// calling the bridge contract's "deposit" entrypoint.
// Michelson parameters for deposit: (pair (nat %nonce) (pair (bytes %recipient) (mutez %amount)))
func parseTezosDeposit(op tezosOpContent, level uint64, opHash string) (DepositEvent, bool) {
	if op.Parameters == nil {
		return DepositEvent{}, false
	}
	if op.Parameters.Entrypoint != "deposit" {
		return DepositEvent{}, false
	}

	// Parse the Michelson JSON value.
	// The Tezos RPC returns Michelson values in a JSON representation:
	//   {"prim": "Pair", "args": [{"int": "nonce"}, {"prim": "Pair", "args": [{"bytes": "recipient"}, {"int": "amount"}]}]}
	var pairOuter struct {
		Prim string            `json:"prim"`
		Args []json.RawMessage `json:"args"`
	}
	if err := json.Unmarshal(op.Parameters.Value, &pairOuter); err != nil {
		log.Printf("WARN: tezos: skip op %s: parse outer pair: %v", opHash, err)
		return DepositEvent{}, false
	}
	if pairOuter.Prim != "Pair" || len(pairOuter.Args) < 2 {
		log.Printf("WARN: tezos: skip op %s: expected Pair with 2 args", opHash)
		return DepositEvent{}, false
	}

	// First arg: nonce (int)
	var nonceVal struct {
		Int string `json:"int"`
	}
	if err := json.Unmarshal(pairOuter.Args[0], &nonceVal); err != nil {
		log.Printf("WARN: tezos: skip op %s: parse nonce: %v", opHash, err)
		return DepositEvent{}, false
	}
	nonce, ok := new(big.Int).SetString(nonceVal.Int, 10)
	if !ok {
		log.Printf("WARN: tezos: skip op %s: invalid nonce: %q", opHash, nonceVal.Int)
		return DepositEvent{}, false
	}

	// Second arg: inner pair (recipient, amount)
	var pairInner struct {
		Prim string            `json:"prim"`
		Args []json.RawMessage `json:"args"`
	}
	if err := json.Unmarshal(pairOuter.Args[1], &pairInner); err != nil {
		log.Printf("WARN: tezos: skip op %s: parse inner pair: %v", opHash, err)
		return DepositEvent{}, false
	}
	if pairInner.Prim != "Pair" || len(pairInner.Args) < 2 {
		log.Printf("WARN: tezos: skip op %s: expected inner Pair with 2 args", opHash)
		return DepositEvent{}, false
	}

	// recipient (bytes -- hex-encoded EVM address)
	var recipientVal struct {
		Bytes string `json:"bytes"`
	}
	if err := json.Unmarshal(pairInner.Args[0], &recipientVal); err != nil {
		log.Printf("WARN: tezos: skip op %s: parse recipient: %v", opHash, err)
		return DepositEvent{}, false
	}
	recipientBytes, err := hexToBytes(recipientVal.Bytes)
	if err != nil || len(recipientBytes) < 20 {
		log.Printf("WARN: tezos: skip op %s: invalid recipient: %q (len=%d)", opHash, recipientVal.Bytes, len(recipientBytes))
		return DepositEvent{}, false
	}

	var recipient [20]byte
	copy(recipient[:], recipientBytes[:20])

	// amount (int -- mutez)
	var amountVal struct {
		Int string `json:"int"`
	}
	if err := json.Unmarshal(pairInner.Args[1], &amountVal); err != nil {
		log.Printf("WARN: tezos: skip op %s: parse amount: %v", opHash, err)
		return DepositEvent{}, false
	}
	amount, ok := new(big.Int).SetString(amountVal.Int, 10)
	if !ok {
		log.Printf("WARN: tezos: skip op %s: invalid amount: %q", opHash, amountVal.Int)
		return DepositEvent{}, false
	}

	return DepositEvent{
		SrcChainID:  TezosChainID,
		Nonce:       nonce.Uint64(),
		Recipient:   recipient,
		Amount:      amount,
		TxID:        opHash,
		BlockHeight: level,
	}, true
}

// extractTotalLocked parses the Michelson storage JSON to find the total_locked value.
// The bridge contract storage shape (simplified):
//
//	{"prim": "Pair", "args": [..., {"int": "total_locked"}, ...]}
//
// We search for the "total_locked" annotation or fall back to scanning for int fields.
func extractTotalLocked(storageJSON []byte) (*big.Int, error) {
	// Try direct object with named fields (some indexers normalize storage).
	var named map[string]json.RawMessage
	if err := json.Unmarshal(storageJSON, &named); err == nil {
		if raw, ok := named["total_locked"]; ok {
			var intVal struct {
				Int string `json:"int"`
			}
			if err := json.Unmarshal(raw, &intVal); err == nil {
				if val, ok := new(big.Int).SetString(intVal.Int, 10); ok {
					return val, nil
				}
			}
			// Might be a plain string number.
			var strVal string
			if err := json.Unmarshal(raw, &strVal); err == nil {
				if val, ok := new(big.Int).SetString(strVal, 10); ok {
					return val, nil
				}
			}
		}
	}

	// Try raw Michelson: search for annotated int field.
	val, ok := findAnnotatedInt(storageJSON, "total_locked")
	if ok {
		return val, nil
	}

	return nil, fmt.Errorf("total_locked not found in storage")
}

// findAnnotatedInt searches a Michelson JSON tree for an int field with the given annotation.
func findAnnotatedInt(data []byte, annot string) (*big.Int, bool) {
	var node struct {
		Prim   string            `json:"prim"`
		Args   []json.RawMessage `json:"args"`
		Annots []string          `json:"annots"`
		Int    string            `json:"int"`
	}
	if err := json.Unmarshal(data, &node); err != nil {
		return nil, false
	}

	// Check if this node is an int with the target annotation.
	if node.Int != "" {
		target := "%" + annot
		for _, a := range node.Annots {
			if a == target {
				val, ok := new(big.Int).SetString(node.Int, 10)
				return val, ok
			}
		}
	}

	// Recurse into args.
	for _, arg := range node.Args {
		if val, ok := findAnnotatedInt(arg, annot); ok {
			return val, true
		}
	}

	// Might be an array at the top level.
	var arr []json.RawMessage
	if err := json.Unmarshal(data, &arr); err == nil {
		for _, elem := range arr {
			if val, ok := findAnnotatedInt(elem, annot); ok {
				return val, true
			}
		}
	}

	return nil, false
}
