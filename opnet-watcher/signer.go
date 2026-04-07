// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

package main

import (
	"context"
	"crypto/ecdsa"
	"fmt"
	"math/big"

	"github.com/luxfi/crypto"
	"github.com/luxfi/crypto/secp256k1"
	"github.com/luxfi/crypto/threshold"

	// Register threshold schemes at init time.
	_ "github.com/luxfi/crypto/cggmp21"
	_ "github.com/luxfi/crypto/threshold/bls"
)

// Signer produces threshold ECDSA signatures over Teleporter-compatible proof hashes.
//
// Uses CGGMP21 (threshold ECDSA on secp256k1) for Lux C-Chain compatibility,
// since Teleporter.sol verifies via ECDSA.recover(). The produced signatures
// are indistinguishable from single-party ECDSA.
//
// For Bitcoin/OP_NET Taproot operations, FROST (Schnorr threshold) should be
// used instead — see threshold.SchemeFROST.
//
// Supported schemes via github.com/luxfi/crypto/threshold:
//   - SchemeCMP (CGGMP21): threshold ECDSA on secp256k1 — for EVM chains
//   - SchemeFROST: threshold Schnorr — for Bitcoin Taproot
//   - SchemeBLS: BLS12-381 threshold — for Lux Warp internal
//   - SchemeRingtail: lattice-based — post-quantum future
type Signer struct {
	// Single-key mode (development/testing).
	key *ecdsa.PrivateKey

	// Threshold mode (production).
	scheme     threshold.Scheme
	signer     threshold.Signer
	aggregator threshold.Aggregator
	groupKey   threshold.PublicKey
}

// NewSigner creates a single-key signer for development.
// In production, use NewThresholdSigner with CGGMP21 key shares.
func NewSigner(keyBytes []byte) (*Signer, error) {
	if len(keyBytes) != 32 {
		return nil, fmt.Errorf("signer: key must be 32 bytes, got %d", len(keyBytes))
	}
	key, err := crypto.ToECDSA(keyBytes)
	if err != nil {
		return nil, fmt.Errorf("signer: invalid key: %w", err)
	}
	return &Signer{key: key}, nil
}

// NewThresholdSigner creates a threshold signer using the given scheme and key share.
// For Teleporter compatibility (ECDSA.recover), use threshold.SchemeCMP.
func NewThresholdSigner(schemeID threshold.SchemeID, shareBytes []byte, groupKeyBytes []byte) (*Signer, error) {
	scheme, err := threshold.GetScheme(schemeID)
	if err != nil {
		return nil, fmt.Errorf("signer: get scheme %s: %w", schemeID, err)
	}

	share, err := scheme.ParseKeyShare(shareBytes)
	if err != nil {
		return nil, fmt.Errorf("signer: parse key share: %w", err)
	}

	groupKey, err := scheme.ParsePublicKey(groupKeyBytes)
	if err != nil {
		return nil, fmt.Errorf("signer: parse group key: %w", err)
	}

	signer, err := scheme.NewSigner(share)
	if err != nil {
		return nil, fmt.Errorf("signer: create signer: %w", err)
	}

	aggregator, err := scheme.NewAggregator(groupKey)
	if err != nil {
		return nil, fmt.Errorf("signer: create aggregator: %w", err)
	}

	return &Signer{
		scheme:     scheme,
		signer:     signer,
		aggregator: aggregator,
		groupKey:   groupKey,
	}, nil
}

// Address returns the Ethereum-style address derived from the signer's public key.
func (s *Signer) Address() [20]byte {
	if s.key != nil {
		addr := secp256k1.PubkeyToAddress(s.key.PublicKey)
		return addr
	}
	// Threshold mode: derive from group public key.
	// CGGMP21 group key is a standard secp256k1 public key.
	hash := crypto.Keccak256(s.groupKey.Bytes())
	var addr [20]byte
	copy(addr[:], hash[12:])
	return addr
}

// IsThreshold returns true if this signer uses threshold signing.
func (s *Signer) IsThreshold() bool {
	return s.scheme != nil
}

// SignRaw signs a raw hash. In single-key mode, uses the local key.
// In threshold mode, uses the threshold signing protocol.
// Returns a 65-byte [R || S || V] signature with V = 27 or 28.
func (s *Signer) SignRaw(hash []byte) ([]byte, error) {
	if s.key != nil {
		return s.signSingleKey(hash)
	}
	return s.signThreshold(hash)
}

// SignTransaction signs a raw EIP-155 transaction and returns the RLP-encoded signed tx.
// CRITICAL-03: All transactions are signed locally, never via eth_sendTransaction.
// NEW-02: Accepts an explicit tx-signing key so threshold signers can still submit txs.
func (s *Signer) SignTransaction(unsignedRLP []byte, chainID uint64) ([]byte, error) {
	if s.key == nil {
		return nil, fmt.Errorf("signer: transaction signing requires single-key mode (use Relay.txKey for threshold)")
	}

	txHash := crypto.Keccak256(unsignedRLP)
	sig, err := crypto.Sign(txHash, s.key)
	if err != nil {
		return nil, fmt.Errorf("signer: sign tx: %w", err)
	}

	// EIP-155: v = chainId * 2 + 35 + recovery_id
	v := chainID*2 + 35 + uint64(sig[64])
	r := new(big.Int).SetBytes(sig[:32])
	rr := new(big.Int).SetBytes(sig[32:64])

	// Re-encode as signed tx: RLP([nonce, gasPrice, gasLimit, to, value, data, v, r, s])
	// We need to decode the unsigned tx, replace the last 3 items, and re-encode.
	// The unsigned RLP has [nonce, gasPrice, gasLimit, to, value, data, chainId, 0, 0]
	// We replace chainId->v, 0->r, 0->s.
	return replaceEIP155Sig(unsignedRLP, v, r, rr)
}

// replaceEIP155Sig takes unsigned EIP-155 RLP and replaces the trailing (chainId, 0, 0) with (v, r, s).
func replaceEIP155Sig(unsignedRLP []byte, v uint64, r, ss *big.Int) ([]byte, error) {
	// Decode the RLP list to get the first 6 fields, then append v, r, s.
	items, err := rlpDecodeList(unsignedRLP)
	if err != nil {
		return nil, fmt.Errorf("decode unsigned tx: %w", err)
	}
	if len(items) < 9 {
		return nil, fmt.Errorf("unsigned tx has %d fields, expected 9", len(items))
	}

	// Keep first 6 items (nonce, gasPrice, gasLimit, to, value, data), replace last 3.
	signed := make([][]byte, 9)
	copy(signed[:6], items[:6])
	signed[6] = rlpEncodeUint(v)
	signed[7] = rlpEncodeBytes(r.Bytes())
	signed[8] = rlpEncodeBytes(ss.Bytes())
	return rlpEncodeList(signed), nil
}

// rlpDecodeList decodes a top-level RLP list and returns the raw RLP-encoded items.
func rlpDecodeList(data []byte) ([][]byte, error) {
	if len(data) == 0 {
		return nil, fmt.Errorf("empty RLP")
	}
	prefix := data[0]
	var payload []byte
	if prefix >= 0xc0 && prefix <= 0xf7 {
		length := int(prefix - 0xc0)
		payload = data[1 : 1+length]
	} else if prefix >= 0xf8 {
		lenLen := int(prefix - 0xf7)
		length := new(big.Int).SetBytes(data[1 : 1+lenLen]).Uint64()
		payload = data[1+lenLen : 1+lenLen+int(length)]
	} else {
		return nil, fmt.Errorf("not an RLP list: prefix 0x%x", prefix)
	}

	var items [][]byte
	for len(payload) > 0 {
		itemLen := rlpItemLen(payload)
		items = append(items, payload[:itemLen])
		payload = payload[itemLen:]
	}
	return items, nil
}

// rlpItemLen returns the total encoded length of the next RLP item.
func rlpItemLen(data []byte) int {
	if len(data) == 0 {
		return 0
	}
	prefix := data[0]
	switch {
	case prefix < 0x80:
		return 1
	case prefix <= 0xb7:
		return 1 + int(prefix-0x80)
	case prefix <= 0xbf:
		lenLen := int(prefix - 0xb7)
		length := new(big.Int).SetBytes(data[1 : 1+lenLen]).Uint64()
		return 1 + lenLen + int(length)
	case prefix <= 0xf7:
		return 1 + int(prefix-0xc0)
	default:
		lenLen := int(prefix - 0xf7)
		length := new(big.Int).SetBytes(data[1 : 1+lenLen]).Uint64()
		return 1 + lenLen + int(length)
	}
}

// SignDeposit signs a deposit proof matching Teleporter.mintDeposit:
//
//	keccak256(abi.encode(bytes32("DEPOSIT"), srcChainId, depositNonce, recipient, amount))
//
// Wrapped with EIP-191 prefix before signing.
func (s *Signer) SignDeposit(srcChainID, nonce uint64, recipient [20]byte, amount *big.Int) ([]byte, error) {
	msg := packDeposit(srcChainID, nonce, recipient, amount)
	return s.signEthMessage(msg)
}

// SignBacking signs a backing attestation matching Teleporter.updateBacking:
//
//	keccak256(abi.encode(bytes32("BACKING"), srcChainId, totalBacking, timestamp))
func (s *Signer) SignBacking(srcChainID uint64, totalBacking *big.Int, timestamp uint64) ([]byte, error) {
	msg := packBacking(srcChainID, totalBacking, timestamp)
	return s.signEthMessage(msg)
}

// signEthMessage computes keccak256(data), wraps with EIP-191, signs.
func (s *Signer) signEthMessage(data []byte) ([]byte, error) {
	msgHash := crypto.Keccak256(data)

	prefix := []byte("\x19Ethereum Signed Message:\n32")
	ethHash := crypto.Keccak256(append(prefix, msgHash...))

	if s.key != nil {
		return s.signSingleKey(ethHash)
	}
	return s.signThreshold(ethHash)
}

// signSingleKey signs with a single ECDSA key (development mode).
func (s *Signer) signSingleKey(hash []byte) ([]byte, error) {
	sig, err := crypto.Sign(hash, s.key)
	if err != nil {
		return nil, fmt.Errorf("signer: sign: %w", err)
	}
	// crypto.Sign returns [R || S || V] with V in {0,1}
	// Teleporter expects V = 27 or 28
	sig[64] += 27
	return sig, nil
}

// signThreshold signs via CGGMP21 threshold protocol.
// Each watcher produces a share; shares are aggregated into a standard ECDSA sig.
func (s *Signer) signThreshold(hash []byte) ([]byte, error) {
	ctx := context.Background()

	// Generate nonce commitment (round 1 of signing).
	commitment, nonceState, err := s.signer.NonceGen(ctx)
	if err != nil {
		return nil, fmt.Errorf("signer: nonce gen: %w", err)
	}

	// Create our signature share (round 2).
	// In production, signers list comes from ZAP consensus on which watchers participate.
	signers := []int{s.signer.Index()}
	share, err := s.signer.SignShare(ctx, hash, signers, nonceState)
	if err != nil {
		return nil, fmt.Errorf("signer: sign share: %w", err)
	}

	// In production: broadcast share + commitment via ZAP, collect t shares,
	// then aggregate. For now, return the share for external aggregation.
	//
	// When running with multiple watchers:
	//   1. Each watcher calls SignShare() and broadcasts via ZAP
	//   2. Coordinator collects t+1 shares
	//   3. Coordinator calls Aggregate() to produce final sig
	//   4. Final sig is standard 65-byte [R || S || V] ECDSA
	_ = commitment // broadcast this via ZAP to other watchers

	// Single-watcher fallback: aggregate with just our share.
	// This only works in threshold=1 mode for testing.
	sig, err := s.aggregator.Aggregate(ctx, hash, []threshold.SignatureShare{share}, []threshold.NonceCommitment{commitment})
	if err != nil {
		return nil, fmt.Errorf("signer: aggregate: %w", err)
	}

	result := sig.Bytes()
	if len(result) == 65 && result[64] < 27 {
		result[64] += 27 // Normalize V for EIP-155
	}
	return result, nil
}

// packDeposit encodes matching Solidity abi.encode(bytes32("DEPOSIT"), srcChainId, nonce, recipient, amount).
// NEW-01: bytes32 tags are fixed-size — simply right-padded to 32 bytes.
func packDeposit(srcChainID, nonce uint64, recipient [20]byte, amount *big.Int) []byte {
	var buf []byte
	buf = append(buf, abiEncodeBytes32Tag("DEPOSIT")...)
	buf = append(buf, uint256Bytes(new(big.Int).SetUint64(srcChainID))...)
	buf = append(buf, uint256Bytes(new(big.Int).SetUint64(nonce))...)
	buf = append(buf, leftPad(recipient[:], 32)...) // abi.encode pads address to 32 bytes
	buf = append(buf, uint256Bytes(amount)...)
	return buf
}

// packYield encodes matching Solidity abi.encode(bytes32("YIELD"), srcChainId, yieldNonce, amount).
func packYield(srcChainID, nonce uint64, amount *big.Int) []byte {
	var buf []byte
	buf = append(buf, abiEncodeBytes32Tag("YIELD")...)
	buf = append(buf, uint256Bytes(new(big.Int).SetUint64(srcChainID))...)
	buf = append(buf, uint256Bytes(new(big.Int).SetUint64(nonce))...)
	buf = append(buf, uint256Bytes(amount)...)
	return buf
}

// packBacking encodes matching Solidity abi.encode(bytes32("BACKING"), srcChainId, totalBacking, timestamp).
func packBacking(srcChainID uint64, totalBacking *big.Int, timestamp uint64) []byte {
	var buf []byte
	buf = append(buf, abiEncodeBytes32Tag("BACKING")...)
	buf = append(buf, uint256Bytes(new(big.Int).SetUint64(srcChainID))...)
	buf = append(buf, uint256Bytes(totalBacking)...)
	buf = append(buf, uint256Bytes(new(big.Int).SetUint64(timestamp))...)
	return buf
}

// abiEncodeBytes32Tag encodes a short ASCII tag as Solidity bytes32("TAG") does:
// right-padded with zeros to exactly 32 bytes. Matches abi.encode(bytes32(...)).
func abiEncodeBytes32Tag(tag string) []byte {
	buf := make([]byte, 32)
	copy(buf, []byte(tag))
	return buf
}

// uint256Bytes returns a 32-byte big-endian representation of n.
func uint256Bytes(n *big.Int) []byte {
	b := make([]byte, 32)
	if n == nil {
		return b
	}
	raw := n.Bytes()
	copy(b[32-len(raw):], raw)
	return b
}
