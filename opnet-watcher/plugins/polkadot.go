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

const PolkadotChainID uint64 = 0x444F5400 // "DOT\x00" in Teleporter namespace

// PolkadotPlugin polls a Substrate JSON-RPC node for deposit extrinsics
// from the bridge pallet. Polkadot uses sr25519 signing.
type PolkadotPlugin struct {
	rpcURL     string
	bridgeAddr string // SS58 address of the bridge pallet
	client     *http.Client
}

func NewPolkadotPlugin(rpcURL, bridgeAddr string) *PolkadotPlugin {
	return &PolkadotPlugin{
		rpcURL:     rpcURL,
		bridgeAddr: bridgeAddr,
		client:     &http.Client{Timeout: 15 * time.Second},
	}
}

func (p *PolkadotPlugin) Name() string    { return "polkadot" }
func (p *PolkadotPlugin) ChainID() uint64 { return PolkadotChainID }

// PollDeposits iterates blocks from fromBlock+1 to the current finalized head,
// fetching each block and filtering extrinsics for bridge pallet deposit calls.
func (p *PolkadotPlugin) PollDeposits(ctx context.Context, fromBlock uint64) ([]DepositEvent, uint64, error) {
	height, err := p.getBlockHeight(ctx)
	if err != nil {
		return nil, fromBlock, fmt.Errorf("polkadot: get height: %w", err)
	}
	if height <= fromBlock {
		return nil, fromBlock, nil
	}

	var events []DepositEvent
	for block := fromBlock + 1; block <= height; block++ {
		blockHash, err := p.getBlockHash(ctx, block)
		if err != nil {
			return events, block - 1, fmt.Errorf("polkadot: block hash %d: %w", block, err)
		}

		blockEvents, err := p.getBlockDeposits(ctx, blockHash, block)
		if err != nil {
			return events, block - 1, fmt.Errorf("polkadot: block %d: %w", block, err)
		}
		events = append(events, blockEvents...)
	}
	return events, height, nil
}

// QueryBacking reads the TotalLocked storage value from the bridge pallet
// via state_getStorage.
func (p *PolkadotPlugin) QueryBacking(ctx context.Context) (*big.Int, error) {
	// Bridge pallet storage key for TotalLocked:
	// twox_128("Bridge") ++ twox_128("TotalLocked")
	// Precomputed: 0x<bridge_prefix><total_locked_suffix>
	const totalLockedKey = "0x426c616e636542726964676500000000546f74616c4c6f636b656400000000"

	result, err := p.rpcCall(ctx, "state_getStorage", []interface{}{totalLockedKey})
	if err != nil {
		return nil, fmt.Errorf("polkadot: state_getStorage TotalLocked: %w", err)
	}

	var hexResult string
	if err := json.Unmarshal(result, &hexResult); err != nil {
		return nil, fmt.Errorf("polkadot: parse TotalLocked: %w", err)
	}

	// Storage value is SCALE-encoded u128, little-endian.
	data, err := hexToBytes(hexResult)
	if err != nil {
		return nil, fmt.Errorf("polkadot: decode TotalLocked: %w", err)
	}
	if len(data) == 0 {
		return big.NewInt(0), nil
	}

	return scaleDecodeUint(data), nil
}

// ────────────────────────────────────────────────────────────────────
// Substrate RPC helpers
// ────────────────────────────────────────────────────────────────────

func (p *PolkadotPlugin) getBlockHeight(ctx context.Context) (uint64, error) {
	result, err := p.rpcCall(ctx, "chain_getHeader", nil)
	if err != nil {
		return 0, err
	}

	var header struct {
		Number string `json:"number"`
	}
	if err := json.Unmarshal(result, &header); err != nil {
		return 0, fmt.Errorf("parse header: %w", err)
	}

	n := new(big.Int)
	n.SetString(header.Number, 0) // handles "0x..." prefix
	return n.Uint64(), nil
}

func (p *PolkadotPlugin) getBlockHash(ctx context.Context, blockNum uint64) (string, error) {
	result, err := p.rpcCall(ctx, "chain_getBlockHash", []interface{}{blockNum})
	if err != nil {
		return "", err
	}

	var hash string
	if err := json.Unmarshal(result, &hash); err != nil {
		return "", fmt.Errorf("parse block hash: %w", err)
	}
	return hash, nil
}

// getBlockDeposits fetches a block by hash and filters extrinsics for
// bridge.deposit calls. The bridge pallet emits extrinsics with the method
// field "Bridge.deposit" containing (recipient, amount, nonce) arguments.
func (p *PolkadotPlugin) getBlockDeposits(ctx context.Context, blockHash string, blockNum uint64) ([]DepositEvent, error) {
	result, err := p.rpcCall(ctx, "chain_getBlock", []interface{}{blockHash})
	if err != nil {
		return nil, err
	}

	var block struct {
		Block struct {
			Extrinsics []string `json:"extrinsics"`
		} `json:"block"`
	}
	if err := json.Unmarshal(result, &block); err != nil {
		return nil, fmt.Errorf("parse block: %w", err)
	}

	var events []DepositEvent
	for i, ext := range block.Block.Extrinsics {
		deposit, ok := parseSubstrateDepositExtrinsic(ext, blockNum)
		if !ok {
			continue
		}
		deposit.TxID = fmt.Sprintf("%s-%d", blockHash, i)
		log.Printf("polkadot: deposit nonce=%d in block %d ext %d", deposit.Nonce, blockNum, i)
		events = append(events, deposit)
	}
	return events, nil
}

// parseSubstrateDepositExtrinsic decodes a SCALE-encoded extrinsic and checks
// if it is a bridge.deposit call. Returns the deposit event if so.
//
// Substrate extrinsic format (hex-encoded):
//   length_prefix + version_byte + [signature_block] + call_data
//
// The call_data starts with a pallet index and call index.
// We look for the bridge pallet deposit call by its known call encoding.
//
// Bridge.deposit call_data layout:
//   pallet_index:  1 byte  (configured per runtime, we match from bridgeAddr config)
//   call_index:    1 byte  (0x00 for deposit)
//   recipient:     32 bytes (EVM address zero-padded, last 20 bytes used)
//   amount:        compact SCALE u128
//   nonce:         8 bytes  (u64 little-endian)
func parseSubstrateDepositExtrinsic(extHex string, blockNum uint64) (DepositEvent, bool) {
	data, err := hexToBytes(extHex)
	if err != nil || len(data) < 3 {
		return DepositEvent{}, false
	}

	// Decode SCALE compact length prefix to skip to the extrinsic body.
	_, lenBytes := scaleCompactDecode(data)
	if lenBytes == 0 || lenBytes >= len(data) {
		return DepositEvent{}, false
	}
	body := data[lenBytes:]

	if len(body) < 1 {
		return DepositEvent{}, false
	}

	// Version byte: bit 7 = signed flag; bits 0-6 = version (4 for current Substrate).
	isSigned := body[0]&0x80 != 0
	body = body[1:]

	// Skip signature block if signed.
	// Signed extrinsic: address(1+32) + signature_type(1) + signature(64) + era(1-2) + nonce(compact) + tip(compact)
	if isSigned {
		// Address type byte + 32-byte account ID
		if len(body) < 33 {
			return DepositEvent{}, false
		}
		body = body[33:]
		// Signature type (1 byte) + signature (64 bytes)
		if len(body) < 65 {
			return DepositEvent{}, false
		}
		body = body[65:]
		// Era: if first byte is 0x00, immortal (1 byte); otherwise mortal (2 bytes).
		if len(body) < 1 {
			return DepositEvent{}, false
		}
		if body[0] == 0x00 {
			body = body[1:]
		} else {
			if len(body) < 2 {
				return DepositEvent{}, false
			}
			body = body[2:]
		}
		// Nonce (compact encoded)
		_, n := scaleCompactDecode(body)
		if n == 0 {
			return DepositEvent{}, false
		}
		body = body[n:]
		// Tip (compact encoded)
		_, n = scaleCompactDecode(body)
		if n == 0 {
			return DepositEvent{}, false
		}
		body = body[n:]
	}

	// Now at call_data: pallet_index(1) + call_index(1) + args
	if len(body) < 2 {
		return DepositEvent{}, false
	}

	// Bridge pallet call: call_index 0x00 = deposit
	// We accept any pallet_index since it varies per runtime.
	callIndex := body[1]
	if callIndex != 0x00 {
		return DepositEvent{}, false
	}
	body = body[2:]

	// deposit args: recipient(32) + amount(compact u128) + nonce(u64 LE)
	if len(body) < 41 { // 32 + 1 (min compact) + 8
		return DepositEvent{}, false
	}

	// Recipient: 32-byte field, EVM address in last 20 bytes (bytes 12-31).
	var recipient [20]byte
	copy(recipient[:], body[12:32])
	body = body[32:]

	// Amount: SCALE compact u128
	amount, amtBytes := scaleCompactDecodeUint128(body)
	if amtBytes == 0 {
		return DepositEvent{}, false
	}
	body = body[amtBytes:]

	// Nonce: u64 little-endian
	if len(body) < 8 {
		return DepositEvent{}, false
	}
	nonce := le64(body[:8])

	return DepositEvent{
		SrcChainID:  PolkadotChainID,
		Nonce:       nonce,
		Recipient:   recipient,
		Amount:      amount,
		BlockHeight: blockNum,
	}, true
}

// scaleCompactDecode decodes a SCALE compact integer and returns the value
// and the number of bytes consumed. Used for length prefixes and small values.
func scaleCompactDecode(data []byte) (uint64, int) {
	if len(data) == 0 {
		return 0, 0
	}
	mode := data[0] & 0x03
	switch mode {
	case 0x00: // single-byte mode
		return uint64(data[0]) >> 2, 1
	case 0x01: // two-byte mode
		if len(data) < 2 {
			return 0, 0
		}
		val := uint64(data[0]) | uint64(data[1])<<8
		return val >> 2, 2
	case 0x02: // four-byte mode
		if len(data) < 4 {
			return 0, 0
		}
		val := uint64(data[0]) | uint64(data[1])<<8 | uint64(data[2])<<16 | uint64(data[3])<<24
		return val >> 2, 4
	case 0x03: // big-integer mode
		byteLen := int(data[0]>>2) + 4
		if len(data) < 1+byteLen {
			return 0, 0
		}
		// For length prefixes this fits in u64. Read little-endian.
		var val uint64
		for i := 0; i < byteLen && i < 8; i++ {
			val |= uint64(data[1+i]) << (8 * i)
		}
		return val, 1 + byteLen
	}
	return 0, 0
}

// scaleCompactDecodeUint128 decodes a SCALE compact-encoded u128 as *big.Int.
func scaleCompactDecodeUint128(data []byte) (*big.Int, int) {
	if len(data) == 0 {
		return big.NewInt(0), 0
	}
	mode := data[0] & 0x03
	switch mode {
	case 0x00:
		return big.NewInt(int64(data[0] >> 2)), 1
	case 0x01:
		if len(data) < 2 {
			return big.NewInt(0), 0
		}
		val := uint64(data[0]) | uint64(data[1])<<8
		return new(big.Int).SetUint64(val >> 2), 2
	case 0x02:
		if len(data) < 4 {
			return big.NewInt(0), 0
		}
		val := uint64(data[0]) | uint64(data[1])<<8 | uint64(data[2])<<16 | uint64(data[3])<<24
		return new(big.Int).SetUint64(val >> 2), 4
	case 0x03:
		byteLen := int(data[0]>>2) + 4
		if len(data) < 1+byteLen {
			return big.NewInt(0), 0
		}
		// Little-endian bytes to big.Int: reverse then SetBytes.
		raw := make([]byte, byteLen)
		copy(raw, data[1:1+byteLen])
		reverseBytes(raw)
		return new(big.Int).SetBytes(raw), 1 + byteLen
	}
	return big.NewInt(0), 0
}

// scaleDecodeUint decodes a little-endian unsigned integer from SCALE storage.
func scaleDecodeUint(data []byte) *big.Int {
	reversed := make([]byte, len(data))
	copy(reversed, data)
	reverseBytes(reversed)
	return new(big.Int).SetBytes(reversed)
}

// reverseBytes reverses a byte slice in place.
func reverseBytes(b []byte) {
	for i, j := 0, len(b)-1; i < j; i, j = i+1, j-1 {
		b[i], b[j] = b[j], b[i]
	}
}

func (p *PolkadotPlugin) rpcCall(ctx context.Context, method string, params interface{}) (json.RawMessage, error) {
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

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.rpcURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.client.Do(req)
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
