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

const FuelChainID uint64 = 4294967520

// FuelPlugin polls a Fuel GraphQL API for deposit receipts from the bridge
// Sway contract. Fuel uses secp256k1 signing.
type FuelPlugin struct {
	apiURL     string
	bridgeAddr string // Fuel contract ID (0x-prefixed)
	client     *http.Client
}

func NewFuelPlugin(apiURL, bridgeAddr string) *FuelPlugin {
	return &FuelPlugin{
		apiURL:     apiURL,
		bridgeAddr: bridgeAddr,
		client:     &http.Client{Timeout: 15 * time.Second},
	}
}

func (f *FuelPlugin) Name() string    { return "fuel" }
func (f *FuelPlugin) ChainID() uint64 { return FuelChainID }

// PollDeposits fetches LOG_DATA receipts from the bridge contract via the
// Fuel GraphQL API and parses deposit events from the receipt data.
func (f *FuelPlugin) PollDeposits(ctx context.Context, fromBlock uint64) ([]DepositEvent, uint64, error) {
	height, err := f.latestBlockHeight(ctx)
	if err != nil {
		return nil, fromBlock, fmt.Errorf("fuel: latest block: %w", err)
	}
	if height <= fromBlock {
		return nil, fromBlock, nil
	}

	// Fetch receipts from the bridge contract.
	// Use cursor-based pagination starting after fromBlock.
	cursor := fmt.Sprintf("%d", fromBlock)
	receipts, err := f.getDepositReceipts(ctx, cursor)
	if err != nil {
		return nil, fromBlock, fmt.Errorf("fuel: get receipts: %w", err)
	}

	var events []DepositEvent
	for _, r := range receipts {
		deposit, ok := parseFuelDepositReceipt(r)
		if ok {
			events = append(events, deposit)
		}
	}

	return events, height, nil
}

// QueryBacking queries the bridge contract's balance for the base asset (ETH).
func (f *FuelPlugin) QueryBacking(ctx context.Context) (*big.Int, error) {
	// Query contract balance for the zero asset ID (base asset).
	const query = `query($contract: ContractId!, $asset: AssetId!) {
		contractBalance(contract: $contract, assetId: $asset) {
			amount
		}
	}`
	vars := map[string]string{
		"contract": f.bridgeAddr,
		"asset":    "0x0000000000000000000000000000000000000000000000000000000000000000",
	}

	result, err := f.graphql(ctx, query, vars)
	if err != nil {
		return nil, fmt.Errorf("fuel: query backing: %w", err)
	}

	var resp struct {
		ContractBalance struct {
			Amount string `json:"amount"`
		} `json:"contractBalance"`
	}
	if err := json.Unmarshal(result, &resp); err != nil {
		return nil, fmt.Errorf("fuel: parse backing: %w", err)
	}

	val, ok := new(big.Int).SetString(resp.ContractBalance.Amount, 10)
	if !ok {
		return nil, fmt.Errorf("fuel: parse amount: %q", resp.ContractBalance.Amount)
	}
	return val, nil
}

// ────────────────────────────────────────────────────────────────────
// Fuel GraphQL types and helpers
// ────────────────────────────────────────────────────────────────────

type fuelReceipt struct {
	TxID        string `json:"txId"`
	BlockHeight uint64 `json:"blockHeight"`
	Data        string `json:"data"` // hex-encoded log data
}

func (f *FuelPlugin) latestBlockHeight(ctx context.Context) (uint64, error) {
	const query = `query {
		chain {
			latestBlock {
				header {
					height
				}
			}
		}
	}`

	result, err := f.graphql(ctx, query, nil)
	if err != nil {
		return 0, err
	}

	var resp struct {
		Chain struct {
			LatestBlock struct {
				Header struct {
					Height string `json:"height"`
				} `json:"header"`
			} `json:"latestBlock"`
		} `json:"chain"`
	}
	if err := json.Unmarshal(result, &resp); err != nil {
		return 0, fmt.Errorf("parse chain height: %w", err)
	}

	h, ok := new(big.Int).SetString(resp.Chain.LatestBlock.Header.Height, 10)
	if !ok {
		return 0, fmt.Errorf("parse height: %q", resp.Chain.LatestBlock.Header.Height)
	}
	return h.Uint64(), nil
}

func (f *FuelPlugin) getDepositReceipts(ctx context.Context, cursor string) ([]fuelReceipt, error) {
	const query = `query($contract: ContractId!, $after: String) {
		receipts(
			filter: { contractId: $contract, receiptType: LOG_DATA }
			first: 50
			after: $after
		) {
			edges {
				node {
					txId
					blockHeight
					data
				}
			}
		}
	}`
	vars := map[string]string{
		"contract": f.bridgeAddr,
		"after":    cursor,
	}

	result, err := f.graphql(ctx, query, vars)
	if err != nil {
		return nil, err
	}

	var resp struct {
		Receipts struct {
			Edges []struct {
				Node struct {
					TxID        string `json:"txId"`
					BlockHeight string `json:"blockHeight"`
					Data        string `json:"data"`
				} `json:"node"`
			} `json:"edges"`
		} `json:"receipts"`
	}
	if err := json.Unmarshal(result, &resp); err != nil {
		return nil, fmt.Errorf("parse receipts: %w", err)
	}

	var receipts []fuelReceipt
	for _, edge := range resp.Receipts.Edges {
		h, _ := new(big.Int).SetString(edge.Node.BlockHeight, 10)
		var height uint64
		if h != nil {
			height = h.Uint64()
		}
		receipts = append(receipts, fuelReceipt{
			TxID:        edge.Node.TxID,
			BlockHeight: height,
			Data:        edge.Node.Data,
		})
	}
	return receipts, nil
}

// parseFuelDepositReceipt parses a deposit event from Fuel LOG_DATA receipt data.
// Sway deposit event layout (big-endian):
//
//	nonce:     u64 (8 bytes)
//	recipient: b256 (32 bytes, EVM address in last 20)
//	amount:    u64 (8 bytes)
//
// Total: 48 bytes minimum.
func parseFuelDepositReceipt(r fuelReceipt) (DepositEvent, bool) {
	data, err := hexToBytes(r.Data)
	if err != nil {
		log.Printf("WARN: fuel: skip malformed receipt in tx %s: %v", r.TxID, err)
		return DepositEvent{}, false
	}
	if len(data) < 48 {
		log.Printf("WARN: fuel: skip short receipt (%d bytes) in tx %s", len(data), r.TxID)
		return DepositEvent{}, false
	}

	// Fuel uses big-endian encoding for ABI types.
	nonce := be64(data[0:8])

	var recipient [20]byte
	// EVM address in last 20 bytes of the 32-byte b256 field at offset 8.
	copy(recipient[:], data[20:40])

	amount := new(big.Int).SetUint64(be64(data[40:48]))

	return DepositEvent{
		SrcChainID:  FuelChainID,
		Nonce:       nonce,
		Recipient:   recipient,
		Amount:      amount,
		TxID:        r.TxID,
		BlockHeight: r.BlockHeight,
	}, true
}

// graphql sends a GraphQL POST request and returns the "data" field.
func (f *FuelPlugin) graphql(ctx context.Context, query string, variables interface{}) (json.RawMessage, error) {
	reqBody := map[string]interface{}{
		"query": query,
	}
	if variables != nil {
		reqBody["variables"] = variables
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, f.apiURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := f.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var gqlResp struct {
		Data   json.RawMessage `json:"data"`
		Errors []struct {
			Message string `json:"message"`
		} `json:"errors"`
	}
	if err := json.Unmarshal(respBody, &gqlResp); err != nil {
		return nil, fmt.Errorf("graphql decode: %w", err)
	}
	if len(gqlResp.Errors) > 0 {
		return nil, fmt.Errorf("graphql error: %s", gqlResp.Errors[0].Message)
	}
	return gqlResp.Data, nil
}
