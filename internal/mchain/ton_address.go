package mchain

import (
	"crypto/ed25519"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"

	"github.com/luxfi/bridge/internal/solanarpc"
	"github.com/xssnick/tonutils-go/ton/wallet"
)

// TON wallet contracts are smart contracts, not raw keypairs. The
// contract address is hash(StateInit) where StateInit embeds the
// ed25519 public key + wallet code. We use V4R2 — the spec Tonkeeper,
// MyTonWallet, and toncenter all default to.
//
// The MPC keygen output's sol_address slot carries the raw ed25519
// pubkey as base58 (per the cluster's current behaviour — see the
// pickAddress comment "TON shares the SOL keygen slot"). To get a
// real TON address we decode that base58 back to 32 raw bytes and
// derive the V4R2 contract address from them.
//
// The on-chain workchain + hash are identical mainnet vs testnet;
// only the user-facing string encoding differs (kQ.../0Q... vs.
// EQ.../UQ...). We pick non-bounceable by default so a first-time
// deposit to a yet-undeployed wallet doesn't get bounced back to
// the sender. Tonkeeper's auto-bounce on the funding tx will still
// flag bounceable when appropriate.

// tonAddressFromEd25519PubKey derives the V4R2 wallet contract address
// from a base58-encoded ed25519 pubkey and formats it for the given
// network. Returns the user-facing string the bridge stores as
// Wallet.Address (kQ.../0Q... for testnet, EQ.../UQ... for mainnet).
func tonAddressFromEd25519PubKey(base58PubKey string, testnet bool) (string, error) {
	if base58PubKey == "" {
		return "", errors.New("tonAddressFromEd25519PubKey: empty pubkey")
	}
	raw, err := solanarpc.DecodeBase58(base58PubKey)
	if err != nil {
		return "", fmt.Errorf("tonAddressFromEd25519PubKey: decode base58: %w", err)
	}
	if len(raw) != ed25519.PublicKeySize {
		return "", fmt.Errorf("tonAddressFromEd25519PubKey: want %d-byte pubkey, got %d", ed25519.PublicKeySize, len(raw))
	}
	addr, err := wallet.AddressFromPubKey(ed25519.PublicKey(raw), wallet.V4R2, wallet.DefaultSubwallet)
	if err != nil {
		return "", fmt.Errorf("tonAddressFromEd25519PubKey: V4R2 derive: %w", err)
	}
	// Non-bounceable so an inbound transfer to a yet-undeployed wallet
	// is accepted; the wallet deploys on its first outbound message.
	addr.SetBounce(false)
	addr.SetTestnetOnly(testnet)
	return addr.String(), nil
}

// isTONTestnet returns true when the internal network name designates
// the public TON testnet (not mainnet). Mirrors isBTCTestnet's policy
// so the post-pickAddress patch reads symmetrically.
func isTONTestnet(networkInternalName string) bool {
	return strings.EqualFold(networkInternalName, "TON_TESTNET")
}

// hexEd25519FromBase58 is a small adapter used when populating
// Wallet.PubKeyHex from the keygen result's sol_address slot. The
// SDK consumer wants raw hex so it can feed it into tonutils-go's
// ed25519.PublicKey at sign time without re-running base58 decode.
func hexEd25519FromBase58(base58PubKey string) (string, error) {
	raw, err := solanarpc.DecodeBase58(base58PubKey)
	if err != nil {
		return "", fmt.Errorf("hexEd25519FromBase58: %w", err)
	}
	if len(raw) != ed25519.PublicKeySize {
		return "", fmt.Errorf("hexEd25519FromBase58: want %d bytes, got %d", ed25519.PublicKeySize, len(raw))
	}
	return hex.EncodeToString(raw), nil
}
