// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

package plugins

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"time"
)

const TONChainID uint64 = 1414483791 // "TONO" in Teleporter namespace

// TONPlugin polls a TON HTTP API (toncenter/liteserver) for deposit external messages
// from the TeleportVault contract and converts them to canonical DepositEvent format.
type TONPlugin struct {
	apiURL   string // TON HTTP API base URL (e.g., https://toncenter.com/api/v2)
	contract string // TeleportVault contract address (base64url or raw)
	client   *http.Client
}

func NewTONPlugin(apiURL, contract string) *TONPlugin {
	return &TONPlugin{
		apiURL:   apiURL,
		contract: contract,
		client:   &http.Client{Timeout: 15 * time.Second},
	}
}

func (t *TONPlugin) Name() string    { return "ton" }
func (t *TONPlugin) ChainID() uint64 { return TONChainID }

// PollDeposits fetches transactions to the bridge contract since the given logical time,
// filters for deposit external out messages, and converts to DepositEvent.
// TON uses logical time (lt) instead of block height for ordering.
func (t *TONPlugin) PollDeposits(ctx context.Context, fromLT uint64) ([]DepositEvent, uint64, error) {
	txs, err := t.getTransactions(ctx, fromLT)
	if err != nil {
		return nil, fromLT, fmt.Errorf("ton: get transactions: %w", err)
	}

	var events []DepositEvent
	var maxLT uint64 = fromLT

	for _, tx := range txs {
		if tx.LT <= fromLT {
			continue
		}
		if tx.LT > maxLT {
			maxLT = tx.LT
		}

		// Parse deposit events from external out messages.
		for _, msg := range tx.OutMsgs {
			if msg.MsgType != "ext_out_msg" {
				continue
			}
			deposit, ok := parseDepositFromBOC(msg.Body, tx.LT, tx.Hash)
			if ok {
				events = append(events, deposit)
			}
		}
	}

	return events, maxLT, nil
}

// QueryBacking calls the get_total_locked get-method on the TeleportVault contract.
func (t *TONPlugin) QueryBacking(ctx context.Context) (*big.Int, error) {
	result, err := t.runGetMethod(ctx, "get_total_locked")
	if err != nil {
		return nil, fmt.Errorf("ton: query backing: %w", err)
	}

	if len(result.Stack) == 0 {
		return nil, fmt.Errorf("ton: get_total_locked returned empty stack")
	}

	// TVM returns integers as ["num", "0x..."] tuples.
	val, ok := new(big.Int).SetString(result.Stack[0].Value, 0)
	if !ok {
		return nil, fmt.Errorf("ton: parse total_locked: %s", result.Stack[0].Value)
	}
	return val, nil
}

// ────────────────────────────────────────────────────────────────────
// TON HTTP API types and helpers
// ────────────────────────────────────────────────────────────────────

type tonTransaction struct {
	LT      uint64       `json:"lt"`
	Hash    string       `json:"hash"`
	OutMsgs []tonMessage `json:"out_msgs"`
}

type tonMessage struct {
	MsgType string `json:"msg_type"`
	Body    string `json:"body"` // base64-encoded BOC
}

type tonGetMethodResult struct {
	Stack []tonStackEntry `json:"stack"`
}

type tonStackEntry struct {
	Type  string `json:"type"`
	Value string `json:"value"`
}

func (t *TONPlugin) getTransactions(ctx context.Context, afterLT uint64) ([]tonTransaction, error) {
	url := fmt.Sprintf("%s/getTransactions?address=%s&limit=100&lt=%d&archival=true",
		t.apiURL, t.contract, afterLT)

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

	var apiResp struct {
		OK     bool              `json:"ok"`
		Result []tonTransaction  `json:"result"`
		Error  string            `json:"error"`
	}
	if err := json.Unmarshal(body, &apiResp); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}
	if !apiResp.OK {
		return nil, fmt.Errorf("api error: %s", apiResp.Error)
	}
	return apiResp.Result, nil
}

func (t *TONPlugin) runGetMethod(ctx context.Context, method string) (*tonGetMethodResult, error) {
	url := fmt.Sprintf("%s/runGetMethod?address=%s&method=%s",
		t.apiURL, t.contract, method)

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

	var apiResp struct {
		OK     bool                `json:"ok"`
		Result tonGetMethodResult  `json:"result"`
		Error  string              `json:"error"`
	}
	if err := json.Unmarshal(body, &apiResp); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}
	if !apiResp.OK {
		return nil, fmt.Errorf("api error: %s", apiResp.Error)
	}
	return &apiResp.Result, nil
}

// parseDepositFromBOC extracts a DepositEvent from a TON external out message body.
// The TeleportVault emits deposit events as external messages with the layout:
//
//	op(32) chain_id(64) nonce(64) lux_recipient(256) amount(coins) timestamp(32)
//
// The body is base64-encoded BOC (Bag of Cells).
func parseDepositFromBOC(bodyB64 string, lt uint64, txHash string) (DepositEvent, bool) {
	data, err := base64.StdEncoding.DecodeString(bodyB64)
	if err != nil {
		return DepositEvent{}, false
	}

	// Minimal BOC parsing: skip BOC envelope to get to the cell data.
	// TON BOC format: magic(4) + flags(1) + cells(1) + roots(1) + absent(1) + size(1) + ...
	// For single-cell BOCs from external out messages, the cell data starts after the header.
	// The exact offset depends on the BOC serialization variant.
	//
	// We look for the deposit op tag (0x44455031) in the data.
	const depositOp uint32 = 0x44455031

	cellData := findCellData(data)
	if cellData == nil || len(cellData) < 53 { // minimum: op(4)+chainID(8)+nonce(8)+recipient(32)+varUint(1)
		return DepositEvent{}, false
	}

	// Verify op tag
	op := be32(cellData[0:4])
	if op != depositOp {
		return DepositEvent{}, false
	}

	chainID := be64(cellData[4:12])
	nonce := be64(cellData[12:20])

	// lux_recipient is 256 bits (32 bytes), EVM address in last 20 bytes
	var recipient [20]byte
	copy(recipient[:], cellData[32:52]) // bytes 12-31 of the 32-byte field at offset 20

	// TON coins use VarUInteger16 encoding: high 4 bits of the byte at offset = byte count N,
	// then N bytes big-endian amount in nanotons.
	amount, _ := decodeVarUInteger16(cellData, 52)

	_ = chainID // already known (TONChainID)

	return DepositEvent{
		SrcChainID:  TONChainID,
		Nonce:       nonce,
		Recipient:   recipient,
		Amount:      amount,
		TxID:        txHash,
		BlockHeight: lt,
	}, true
}

// findCellData locates the cell payload within a BOC envelope.
// Handles the common single-cell BOC format.
func findCellData(boc []byte) []byte {
	if len(boc) < 10 {
		return nil
	}
	// Standard BOC magic: b5ee9c72
	if boc[0] == 0xb5 && boc[1] == 0xee && boc[2] == 0x9c && boc[3] == 0x72 {
		// flags(1) size(1) cells(1) roots(1) absent(1) totCellsSize(size bytes) ...
		flags := boc[4]
		sizeBytes := int(flags & 0x07)
		if len(boc) < 5+sizeBytes*3+2 {
			return nil
		}
		// Skip header to cell data. For single-cell BOCs this is straightforward.
		headerSize := 4 + 1 + 1 + 1 + 1 + sizeBytes + sizeBytes
		if headerSize < len(boc) {
			return boc[headerSize:]
		}
	}
	// Fallback: return raw data (for non-standard encoding)
	return boc
}

// decodeVarUInteger16 decodes a TON VarUInteger16 value at the given offset.
// Encoding: high 4 bits of data[offset] = byte count N, next N bytes = big-endian integer.
// Returns the decoded integer and the new offset past the consumed bytes.
func decodeVarUInteger16(data []byte, offset int) (*big.Int, int) {
	if offset >= len(data) {
		return big.NewInt(0), offset
	}
	n := int(data[offset] >> 4) // high nibble = byte count
	offset++
	if n == 0 || offset+n > len(data) {
		return big.NewInt(0), offset
	}
	return new(big.Int).SetBytes(data[offset : offset+n]), offset + n
}

func be32(b []byte) uint32 {
	return uint32(b[0])<<24 | uint32(b[1])<<16 | uint32(b[2])<<8 | uint32(b[3])
}

func be64(b []byte) uint64 {
	return uint64(b[0])<<56 | uint64(b[1])<<48 | uint64(b[2])<<40 | uint64(b[3])<<32 |
		uint64(b[4])<<24 | uint64(b[5])<<16 | uint64(b[6])<<8 | uint64(b[7])
}
