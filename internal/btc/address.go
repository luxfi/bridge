// Bitcoin address decoding for the bridge's BTC destination path.
//
// Two encodings are supported:
//
//   - Legacy base58check: P2PKH ("1…" mainnet, "m…"/"n…" testnet) and
//     P2SH ("3…" mainnet, "2…" testnet). 20-byte hash160 payload +
//     1-byte version + 4-byte SHA256d checksum.
//
//   - Bech32 SegWit v0: P2WPKH and P2WSH ("bc1q…" mainnet, "tb1q…"
//     testnet). 5-bit groups with a polymod checksum; HRP=="bc"
//     mainnet, HRP=="tb" testnet.
//
// Bech32m (Taproot, v1+) intentionally NOT supported in this pass —
// adding it requires Schnorr signing on the spend side, which mpcd
// doesn't expose today. P2TR addresses ("tb1p…") will error here so
// callers can't silently ship a tx that can't be spent.
//
// All amounts in this package are satoshis (uint64). All script bytes
// are the raw scriptPubKey/scriptSig form ready for tx serialization.
package btc

import (
	"errors"
	"fmt"
	"strings"
)

// NetworkParams selects the version bytes / HRP used when decoding
// addresses for a given Bitcoin network. We expose pre-built mainnet
// and testnet/testnet3 parameters; signet and regtest share testnet
// parameters and can be added when needed.
type NetworkParams struct {
	Name        string // human label ("mainnet", "testnet3")
	P2PKHPrefix byte   // version byte for legacy P2PKH addresses
	P2SHPrefix  byte   // version byte for legacy P2SH addresses
	Bech32HRP   string // bech32 human-readable part ("bc" / "tb")
}

// MainnetParams encodes Bitcoin mainnet's address prefixes.
var MainnetParams = NetworkParams{
	Name:        "mainnet",
	P2PKHPrefix: 0x00,
	P2SHPrefix:  0x05,
	Bech32HRP:   "bc",
}

// TestnetParams encodes testnet/testnet3/signet/regtest's address
// prefixes (they all share the same byte set).
var TestnetParams = NetworkParams{
	Name:        "testnet3",
	P2PKHPrefix: 0x6f,
	P2SHPrefix:  0xc4,
	Bech32HRP:   "tb",
}

// ParamsFor maps a bridge-internal network name to its address params.
// Returns (params, true) on a known name; (zero, false) otherwise so
// the caller can route the error.
func ParamsFor(network string) (NetworkParams, bool) {
	switch strings.ToUpper(network) {
	case "BITCOIN_MAINNET":
		return MainnetParams, true
	case "BITCOIN_TESTNET", "BITCOIN_TESTNET3", "BITCOIN_SIGNET", "BITCOIN_REGTEST":
		return TestnetParams, true
	default:
		return NetworkParams{}, false
	}
}

// ScriptKind classifies a decoded output address into its scriptPubKey
// shape. The kind determines downstream witness/sigScript handling.
type ScriptKind int

const (
	ScriptUnknown ScriptKind = iota
	// ScriptP2PKH is the legacy pay-to-pubkey-hash output:
	//     OP_DUP OP_HASH160 <20-byte hash> OP_EQUALVERIFY OP_CHECKSIG.
	ScriptP2PKH
	// ScriptP2SH is the legacy pay-to-script-hash output:
	//     OP_HASH160 <20-byte hash> OP_EQUAL.
	// We only DECODE these (so we can pay to them); spending requires
	// the redeem script, which the bridge never receives.
	ScriptP2SH
	// ScriptP2WPKH is the SegWit v0 pay-to-witness-pubkey-hash output:
	//     OP_0 <20-byte hash>.
	ScriptP2WPKH
	// ScriptP2WSH is SegWit v0 P2WSH:
	//     OP_0 <32-byte hash>. Decode-only.
	ScriptP2WSH
)

// String returns the kind in a logging-friendly form.
func (k ScriptKind) String() string {
	switch k {
	case ScriptP2PKH:
		return "P2PKH"
	case ScriptP2SH:
		return "P2SH"
	case ScriptP2WPKH:
		return "P2WPKH"
	case ScriptP2WSH:
		return "P2WSH"
	default:
		return "unknown"
	}
}

// DecodedAddress is the assembler-facing decode result. ScriptPubKey
// is the raw bytes ready to embed in a tx output.
type DecodedAddress struct {
	Kind         ScriptKind
	Hash         []byte // 20 bytes for P2PKH/P2SH/P2WPKH; 32 bytes for P2WSH.
	ScriptPubKey []byte // canonical scriptPubKey bytes.
}

// DecodeAddress parses a Bitcoin address and returns its scriptPubKey.
// The caller's NetworkParams gates the accepted version bytes / HRP —
// passing TestnetParams will reject mainnet addresses and vice versa,
// so callers can't accidentally pay to a wrong-network address.
//
// Limitation: bech32m (Taproot, v1+) is rejected explicitly so the
// release path never tries to spend to a P2TR output that mpcd can't
// later sign for.
func DecodeAddress(addr string, params NetworkParams) (*DecodedAddress, error) {
	if addr == "" {
		return nil, errors.New("btc: empty address")
	}
	low := strings.ToLower(addr)

	// Bech32 path. Match HRP exactly so a wrong-network address fails
	// before we touch the polymod.
	if strings.HasPrefix(low, params.Bech32HRP+"1") {
		hrp, version, prog, err := bech32Decode(low)
		if err != nil {
			return nil, fmt.Errorf("btc: bech32 decode: %w", err)
		}
		if hrp != params.Bech32HRP {
			return nil, fmt.Errorf("btc: bech32 HRP %q does not match %s (%q)", hrp, params.Name, params.Bech32HRP)
		}
		if version != 0 {
			return nil, fmt.Errorf("btc: bech32 witness version %d unsupported (Taproot/v1+ requires Schnorr)", version)
		}
		switch len(prog) {
		case 20:
			spk := append([]byte{0x00, 0x14}, prog...) // OP_0 + 20-byte push
			return &DecodedAddress{Kind: ScriptP2WPKH, Hash: prog, ScriptPubKey: spk}, nil
		case 32:
			spk := append([]byte{0x00, 0x20}, prog...) // OP_0 + 32-byte push
			return &DecodedAddress{Kind: ScriptP2WSH, Hash: prog, ScriptPubKey: spk}, nil
		default:
			return nil, fmt.Errorf("btc: bech32 v0 program must be 20 or 32 bytes, got %d", len(prog))
		}
	}

	// Reject the wrong-network bech32 explicitly. If we let it fall
	// through to base58, the user would see a misleading "invalid
	// base58 character" error.
	if strings.HasPrefix(low, "bc1") || strings.HasPrefix(low, "tb1") {
		return nil, fmt.Errorf("btc: address %q does not match network %s (expected HRP %q)", addr, params.Name, params.Bech32HRP)
	}

	// Base58check path.
	payload, version, err := base58CheckDecode(addr)
	if err != nil {
		return nil, fmt.Errorf("btc: base58check decode: %w", err)
	}
	if len(payload) != 20 {
		return nil, fmt.Errorf("btc: base58 payload must be 20 bytes, got %d", len(payload))
	}
	switch version {
	case params.P2PKHPrefix:
		// OP_DUP OP_HASH160 <20-byte push> OP_EQUALVERIFY OP_CHECKSIG
		spk := append([]byte{0x76, 0xa9, 0x14}, payload...)
		spk = append(spk, 0x88, 0xac)
		return &DecodedAddress{Kind: ScriptP2PKH, Hash: payload, ScriptPubKey: spk}, nil
	case params.P2SHPrefix:
		// OP_HASH160 <20-byte push> OP_EQUAL
		spk := append([]byte{0xa9, 0x14}, payload...)
		spk = append(spk, 0x87)
		return &DecodedAddress{Kind: ScriptP2SH, Hash: payload, ScriptPubKey: spk}, nil
	default:
		return nil, fmt.Errorf("btc: address version byte 0x%02x does not match network %s (P2PKH=0x%02x, P2SH=0x%02x)",
			version, params.Name, params.P2PKHPrefix, params.P2SHPrefix)
	}
}

// EncodeP2PKHAddress is the inverse of DecodeAddress for P2PKH only.
// Used by the address-conversion helper when surfacing a hash160 in
// human-readable form (e.g. logging the release wallet address).
// Bech32 encoding is provided by EncodeP2WPKHAddress below.
func EncodeP2PKHAddress(hash160 []byte, params NetworkParams) (string, error) {
	if len(hash160) != 20 {
		return "", fmt.Errorf("btc: P2PKH requires 20-byte hash, got %d", len(hash160))
	}
	return base58CheckEncode(params.P2PKHPrefix, hash160), nil
}

// EncodeP2WPKHAddress emits a bech32 v0 address from a 20-byte hash160.
func EncodeP2WPKHAddress(hash160 []byte, params NetworkParams) (string, error) {
	if len(hash160) != 20 {
		return "", fmt.Errorf("btc: P2WPKH requires 20-byte hash, got %d", len(hash160))
	}
	return bech32Encode(params.Bech32HRP, 0, hash160)
}
