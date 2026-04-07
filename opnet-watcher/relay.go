// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

package main

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"sync"
	"time"

	"github.com/luxfi/crypto"
)

// Relay submits signed proofs to the Teleporter contract on Lux C-Chain.
type Relay struct {
	rpcURL         string
	teleporterAddr string
	signer         *Signer
	txSigner       *Signer // NEW-02: separate hot wallet for tx submission in threshold mode
	httpClient     *http.Client
	mu             sync.Mutex // protects nonce and nonceDirty
	nonce          uint64
	nonceDirty     bool // HIGH-02: true after send error; forces nonce re-fetch
	chainID        uint64
}

// NewRelay creates a relay targeting the given Lux C-Chain RPC and Teleporter address.
// txSigner is the hot wallet used for transaction submission. In single-key mode,
// pass the same signer for both. In threshold mode, txSigner is a separate hot wallet
// (the MPC signs proofs, the hot wallet submits them on-chain).
func NewRelay(rpcURL, teleporterAddr string, signer *Signer, txSigner *Signer, chainID uint64) *Relay {
	return &Relay{
		rpcURL:         rpcURL,
		teleporterAddr: teleporterAddr,
		signer:         signer,
		txSigner:       txSigner,
		httpClient:     &http.Client{Timeout: 30 * time.Second},
		chainID:        chainID,
	}
}

// SubmitDeposit calls Teleporter.mintDeposit(srcChainId, depositNonce, recipient, amount, signature).
//
// Function selector: keccak256("mintDeposit(uint256,uint256,address,uint256,bytes)")[:4]
func (r *Relay) SubmitDeposit(ctx context.Context, srcChainID, nonce uint64, recipient [20]byte, amount *big.Int, sig []byte) (string, error) {
	// mintDeposit(uint256,uint256,address,uint256,bytes)
	selector := funcSelector("mintDeposit(uint256,uint256,address,uint256,bytes)")

	var calldata []byte
	calldata = append(calldata, selector[:]...)
	calldata = append(calldata, uint256Bytes(new(big.Int).SetUint64(srcChainID))...)   // srcChainId
	calldata = append(calldata, uint256Bytes(new(big.Int).SetUint64(nonce))...)         // depositNonce
	calldata = append(calldata, leftPad(recipient[:], 32)...)                           // recipient (address)
	calldata = append(calldata, uint256Bytes(amount)...)                                // amount
	calldata = append(calldata, uint256Bytes(new(big.Int).SetUint64(160))...)           // offset to bytes (5 * 32)
	calldata = append(calldata, uint256Bytes(new(big.Int).SetUint64(uint64(len(sig))))...) // length of sig
	calldata = append(calldata, rightPad(sig, 32)...)                                   // signature data

	return r.sendTx(ctx, calldata)
}

// SubmitBacking calls Teleporter.updateBacking(srcChainId, totalBacking, timestamp, signature).
// CRITICAL-01: timestamp is now a parameter (signed by MPC, validated on-chain).
//
// Function selector: keccak256("updateBacking(uint256,uint256,uint256,bytes)")[:4]
func (r *Relay) SubmitBacking(ctx context.Context, srcChainID uint64, totalBacking *big.Int, timestamp uint64, sig []byte) (string, error) {
	selector := funcSelector("updateBacking(uint256,uint256,uint256,bytes)")

	var calldata []byte
	calldata = append(calldata, selector[:]...)
	calldata = append(calldata, uint256Bytes(new(big.Int).SetUint64(srcChainID))...)     // srcChainId
	calldata = append(calldata, uint256Bytes(totalBacking)...)                           // totalBacking
	calldata = append(calldata, uint256Bytes(new(big.Int).SetUint64(timestamp))...)      // timestamp
	calldata = append(calldata, uint256Bytes(new(big.Int).SetUint64(128))...)            // offset to bytes (4 * 32)
	calldata = append(calldata, uint256Bytes(new(big.Int).SetUint64(uint64(len(sig))))...) // length of sig
	calldata = append(calldata, rightPad(sig, 32)...)                                    // signature data

	return r.sendTx(ctx, calldata)
}

// sendTx builds, signs locally, and submits via eth_sendRawTransaction.
// CRITICAL-03: Never use eth_sendTransaction — it exposes the node key.
// NEW-02: Uses txSigner (hot wallet) for transaction signing, not the MPC signer.
func (r *Relay) sendTx(ctx context.Context, calldata []byte) (string, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	// HIGH-02: Re-fetch nonce from chain if dirty (post-error) or uninitialized.
	if r.nonce == 0 || r.nonceDirty {
		from := r.txSigner.Address()
		n, err := r.fetchNonce(ctx, from)
		if err != nil {
			return "", fmt.Errorf("relay fetch nonce: %w", err)
		}
		r.nonce = n
		r.nonceDirty = false
	}

	// Fetch gas price.
	gasPrice, err := r.fetchGasPrice(ctx)
	if err != nil {
		return "", fmt.Errorf("relay fetch gas price: %w", err)
	}

	// Build EIP-155 transaction and RLP-encode.
	rawTx := r.buildRawTx(calldata, r.nonce, gasPrice)

	// Sign with hot wallet key (txSigner always has a local key).
	signedTx, err := r.txSigner.SignTransaction(rawTx, r.chainID)
	if err != nil {
		return "", fmt.Errorf("relay sign tx: %w", err)
	}

	// Submit signed transaction.
	result, err := r.ethCall(ctx, "eth_sendRawTransaction", []interface{}{"0x" + hex.EncodeToString(signedTx)})
	if err != nil {
		// HIGH-02: Mark nonce dirty so next call re-fetches from chain.
		// The tx may or may not have been mined (network timeout after broadcast).
		// Re-fetching the pending nonce on next attempt handles both cases:
		// - If tx was mined: chain nonce is incremented, we pick that up.
		// - If tx was not mined: chain nonce is unchanged, we retry with same nonce.
		r.nonceDirty = true
		return "", fmt.Errorf("relay send raw tx: %w", err)
	}

	r.nonce++

	var txHash string
	if err := json.Unmarshal(result, &txHash); err != nil {
		return "", fmt.Errorf("relay parse tx hash: %w", err)
	}
	return txHash, nil
}

// fetchNonce gets the current transaction count for the signer address.
func (r *Relay) fetchNonce(ctx context.Context, addr [20]byte) (uint64, error) {
	result, err := r.ethCall(ctx, "eth_getTransactionCount", []interface{}{
		"0x" + hex.EncodeToString(addr[:]), "pending",
	})
	if err != nil {
		return 0, err
	}
	var hexNonce string
	if err := json.Unmarshal(result, &hexNonce); err != nil {
		return 0, err
	}
	n := new(big.Int)
	n.SetString(hexNonce, 0)
	return n.Uint64(), nil
}

// fetchGasPrice queries eth_gasPrice.
func (r *Relay) fetchGasPrice(ctx context.Context) (*big.Int, error) {
	result, err := r.ethCall(ctx, "eth_gasPrice", nil)
	if err != nil {
		return nil, err
	}
	var hexPrice string
	if err := json.Unmarshal(result, &hexPrice); err != nil {
		return nil, err
	}
	p := new(big.Int)
	p.SetString(hexPrice, 0)
	return p, nil
}

// buildRawTx returns the unsigned EIP-155 transaction RLP payload.
// Format: RLP([nonce, gasPrice, gasLimit, to, value, data, chainId, 0, 0])
func (r *Relay) buildRawTx(calldata []byte, nonce uint64, gasPrice *big.Int) []byte {
	addrHex := r.teleporterAddr
	if len(addrHex) >= 2 && addrHex[:2] == "0x" {
		addrHex = addrHex[2:]
	}
	to, _ := hex.DecodeString(addrHex)
	gasLimit := uint64(1_000_000)

	return rlpEncodeTx(nonce, gasPrice, gasLimit, to, big.NewInt(0), calldata, r.chainID)
}

// rlpEncodeTx produces EIP-155 unsigned tx: RLP([nonce, gasPrice, gasLimit, to, value, data, chainId, 0, 0])
func rlpEncodeTx(nonce uint64, gasPrice *big.Int, gasLimit uint64, to []byte, value *big.Int, data []byte, chainID uint64) []byte {
	items := [][]byte{
		rlpEncodeUint(nonce),
		rlpEncodeBigInt(gasPrice),
		rlpEncodeUint(gasLimit),
		rlpEncodeBytes(to),
		rlpEncodeBigInt(value),
		rlpEncodeBytes(data),
		rlpEncodeUint(chainID),
		rlpEncodeBytes(nil), // 0
		rlpEncodeBytes(nil), // 0
	}
	return rlpEncodeList(items)
}

// rlpEncodeUint encodes a uint64 as RLP.
func rlpEncodeUint(v uint64) []byte {
	if v == 0 {
		return []byte{0x80}
	}
	b := new(big.Int).SetUint64(v).Bytes()
	return rlpEncodeBytes(b)
}

// rlpEncodeBigInt encodes a *big.Int as RLP.
func rlpEncodeBigInt(v *big.Int) []byte {
	if v == nil || v.Sign() == 0 {
		return []byte{0x80}
	}
	return rlpEncodeBytes(v.Bytes())
}

// rlpEncodeBytes encodes a byte slice as RLP string.
func rlpEncodeBytes(b []byte) []byte {
	if len(b) == 0 {
		return []byte{0x80}
	}
	if len(b) == 1 && b[0] < 0x80 {
		return b
	}
	if len(b) < 56 {
		return append([]byte{byte(0x80 + len(b))}, b...)
	}
	lenBytes := new(big.Int).SetUint64(uint64(len(b))).Bytes()
	header := append([]byte{byte(0xb7 + len(lenBytes))}, lenBytes...)
	return append(header, b...)
}

// rlpEncodeList encodes a list of already-encoded RLP items.
func rlpEncodeList(items [][]byte) []byte {
	var payload []byte
	for _, item := range items {
		payload = append(payload, item...)
	}
	if len(payload) < 56 {
		return append([]byte{byte(0xc0 + len(payload))}, payload...)
	}
	lenBytes := new(big.Int).SetUint64(uint64(len(payload))).Bytes()
	header := append([]byte{byte(0xf7 + len(lenBytes))}, lenBytes...)
	return append(header, payload...)
}

// ethCall makes a JSON-RPC call to the Lux C-Chain.
func (r *Relay) ethCall(ctx context.Context, method string, params interface{}) (json.RawMessage, error) {
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

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, r.rpcURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := r.httpClient.Do(req)
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

// funcSelector returns the first 4 bytes of keccak256(signature).
func funcSelector(sig string) [4]byte {
	h := crypto.Keccak256([]byte(sig))
	var sel [4]byte
	copy(sel[:], h[:4])
	return sel
}

// leftPad pads b on the left with zeros to size n.
func leftPad(b []byte, n int) []byte {
	if len(b) >= n {
		return b
	}
	padded := make([]byte, n)
	copy(padded[n-len(b):], b)
	return padded
}

// rightPad pads b on the right with zeros to a multiple of align.
func rightPad(b []byte, align int) []byte {
	if len(b)%align == 0 {
		return b
	}
	padded := make([]byte, len(b)+(align-len(b)%align))
	copy(padded, b)
	return padded
}
