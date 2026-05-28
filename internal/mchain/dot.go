// dot.go: substrate-flavoured derivation helpers for the keygen path.
//
// The MPC cluster returns a hex-encoded compressed secp256k1 pubkey
// (ecdsa_pub_key) for every ECDSA keygen. For substrate (DOT/Kusama),
// the bridge derives an SS58 address client-side rather than waiting
// for the cluster to learn the SS58 algorithm. This keeps the cluster
// generic and lets the bridge support new substrate chains by just
// adding a prefix entry to substrateNetworkPrefix.

package mchain

import (
	"encoding/hex"
	"fmt"
	"strings"

	"github.com/luxfi/bridge/internal/substrate"
)

// substrateNetworkPrefix maps a bridge internal_name → SS58 prefix.
// Add new substrate-flavoured chains here as the bridge supports them.
// Defaults to SS58Generic (42) for unknown DOT-family chains.
var substrateNetworkPrefix = map[string]substrate.SS58Prefix{
	"POLKADOT_MAINNET": substrate.SS58PolkadotMainnet, // 0
	"POLKADOT_TESTNET": substrate.SS58Generic,         // 42 (Westend)
	"KUSAMA_MAINNET":   substrate.SS58Kusama,          // 2
}

// SubstratePrefixFor returns the SS58 prefix for a substrate-flavoured
// network. Falls back to SS58Generic (42) for any unknown name —
// matches the substrate-generic encoding most testnets use, and is
// safe (the on-chain runtime accepts the raw AccountId regardless).
func SubstratePrefixFor(networkInternalName string) substrate.SS58Prefix {
	if p, ok := substrateNetworkPrefix[networkInternalName]; ok {
		return p
	}
	return substrate.SS58Generic
}

// deriveSubstrateSS58 takes the hex-encoded 33-byte compressed pubkey
// the MPC cluster returns and derives the substrate ECDSA address (an
// SS58 string) for the given network.
//
// The bridge stores BOTH the SS58 address and the raw pubkey on the
// Wallet record so the signing path can use either.
func deriveSubstrateSS58(pubkeyHex, networkInternalName string) (string, error) {
	pubkeyHex = strings.TrimPrefix(strings.TrimPrefix(pubkeyHex, "0x"), "0X")
	pub, err := hex.DecodeString(pubkeyHex)
	if err != nil {
		return "", fmt.Errorf("decode hex pubkey: %w", err)
	}
	acc, err := substrate.AccountIDFromECDSAPub(pub)
	if err != nil {
		return "", err
	}
	return substrate.SS58Encode(acc, SubstratePrefixFor(networkInternalName))
}
