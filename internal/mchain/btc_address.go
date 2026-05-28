package mchain

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"

	"github.com/btcsuite/btcd/btcutil"
	"github.com/btcsuite/btcd/chaincfg"
	"golang.org/x/crypto/ripemd160"
)

// btc_address.go: bech32 P2WPKH address derivation from the MPC
// keygen's ECDSAPubKey field.
//
// Why this lives on the bridge side rather than mpcd:
//
//   mpcd's pubKeyToBtcAddress emits a legacy Base58Check "1..." P2PKH
//   address (see /root/luxify/mpc/cmd/mpcd/main.go:1496). Legacy P2PKH
//   is fine for receiving but witness-discount-friendly P2WPKH is what
//   the bridge release flow needs: smaller fees, broader wallet
//   support, and direct compatibility with btcsuite/txscript's
//   CalcWitnessSigHash. Re-deriving locally from the compressed
//   secp256k1 pubkey keeps the bridge self-contained and avoids
//   round-tripping a fix through mpcd just to grow a second address
//   slot on the wire.
//
// HRP selection: we derive the hrp from the network internal name
// rather than carrying a parameter through the public API:
//
//   BITCOIN_MAINNET / unknown → "bc"
//   BITCOIN_TESTNET           → "tb"
//
// This matches the package's network-naming convention (all the
// internal_name constants are uppercase and prefix-stable) and keeps
// KeygenForDeposit signature-stable.

// deriveBTCBech32Address turns the keygen response's ECDSAPubKey
// (hex-encoded compressed or uncompressed secp256k1 pubkey) into the
// matching bech32 P2WPKH address for the given network.
//
// Returns ("", err) when ECDSAPubKey is empty or malformed; callers
// fall back to the legacy P2PKH slot via the BTCAddress wire field.
func deriveBTCBech32Address(ecdsaPubKeyHex, networkInternalName string) (string, error) {
	if ecdsaPubKeyHex == "" {
		return "", errors.New("mchain: empty ECDSAPubKey")
	}
	raw, err := hex.DecodeString(strings.TrimPrefix(ecdsaPubKeyHex, "0x"))
	if err != nil {
		return "", fmt.Errorf("mchain: decode ECDSAPubKey hex: %w", err)
	}
	compressed := compressSecp256k1Pubkey(raw)
	if compressed == nil {
		return "", fmt.Errorf("mchain: cannot compress pubkey (len=%d)", len(raw))
	}
	// HASH160(compressed) = RIPEMD160(SHA256(...))
	sha := sha256.Sum256(compressed)
	ripemd := ripemd160.New()
	ripemd.Write(sha[:])
	pubKeyHash := ripemd.Sum(nil)

	params := bitcoinChainParams(networkInternalName)
	addr, err := btcutil.NewAddressWitnessPubKeyHash(pubKeyHash, params)
	if err != nil {
		return "", fmt.Errorf("mchain: build P2WPKH: %w", err)
	}
	return addr.EncodeAddress(), nil
}

// compressSecp256k1Pubkey reduces any of the wire representations the
// keygen pubkey may carry to a canonical 33-byte compressed form.
//
// Supported input shapes:
//
//	33 bytes — already compressed (passthrough)
//	65 bytes — uncompressed (0x04 || X || Y). Compress by taking X
//	           plus 0x02/0x03 parity from Y's least significant bit.
//	64 bytes — uncompressed without leading 0x04 (X || Y). Same
//	           treatment as 65-byte after prepending the marker.
//	32 bytes — raw X coordinate. We pick even-y (0x02) — this matches
//	           mpcd's pubKeyToBtcAddress fallback and is the convention
//	           used when the MPC ceremony emits an x-only pubkey.
//
// Returns nil for any other length so callers can detect malformed
// input rather than silently producing the wrong address.
func compressSecp256k1Pubkey(pubKey []byte) []byte {
	switch len(pubKey) {
	case 33:
		return pubKey
	case 65:
		prefix := byte(0x02)
		if pubKey[64]&1 == 1 {
			prefix = 0x03
		}
		out := make([]byte, 33)
		out[0] = prefix
		copy(out[1:], pubKey[1:33])
		return out
	case 64:
		prefix := byte(0x02)
		if pubKey[63]&1 == 1 {
			prefix = 0x03
		}
		out := make([]byte, 33)
		out[0] = prefix
		copy(out[1:], pubKey[0:32])
		return out
	case 32:
		out := make([]byte, 33)
		out[0] = 0x02
		copy(out[1:], pubKey)
		return out
	default:
		return nil
	}
}

// bitcoinChainParams maps a Bitcoin internal_name to its
// chaincfg.Params. Defaults to mainnet when the name doesn't match a
// known testnet — wrong-hrp addresses are caught by the assembler
// (which decodes against the same Params), so the fallback is safe.
func bitcoinChainParams(networkInternalName string) *chaincfg.Params {
	switch strings.ToUpper(networkInternalName) {
	case "BITCOIN_TESTNET", "BITCOIN_TESTNET3", "BITCOIN_SIGNET":
		// TestNet3 covers signet+testnet for our purposes — both use
		// the "tb" bech32 prefix.
		return &chaincfg.TestNet3Params
	default:
		return &chaincfg.MainNetParams
	}
}

// preferEVMAddress picks the EVM 0x-address slot, preferring the
// modern evm_address field name and falling back to the legacy
// eth_address spelling for clusters that haven't been renamed.
func preferEVMAddress(r *keygenResult) string {
	if r.EVMAddress != "" {
		return r.EVMAddress
	}
	return r.ETHAddress
}
