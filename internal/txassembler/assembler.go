package txassembler

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"sync"

	"golang.org/x/crypto/sha3"
)

// =============================================================================
// Per-network config
// =============================================================================

// PerNetwork is the destination-chain configuration the assembler
// needs to build a valid transaction.
//
// ChainID is required (it goes into the EIP-155 v field). The other
// fields control the tx mode:
//
//   - DefaultGasLimit defaults the gas allowance when the operator
//     doesn't want a dynamic estimateGas call. 21000 for plain
//     transfers, 100000+ for contract calls.
//   - DefaultGasPriceWei pins the gas price. When set, the assembler
//     skips the eth_gasPrice RPC; when zero, the Provider must
//     supply one via SuggestGasPrice.
//   - BridgeContract + ReleaseSelector switch the tx into
//     contract-call mode: `to = BridgeContract`, `data = selector ||
//     abi(recipient, amount)`. When BridgeContract is empty the
//     assembler runs in pure transfer mode (`to = recipient`,
//     `data = empty`).
//   - NativeDecimals scales the human-readable amount into wei.
//     Defaults to 18 if unset (matches ETH/LUX/BNB/etc.).
type PerNetwork struct {
	ChainID            *big.Int
	DefaultGasLimit    uint64
	DefaultGasPriceWei *big.Int
	BridgeContract     string // 0x… address; empty ⇒ pure transfer mode
	ReleaseSelector    [4]byte
	NativeDecimals     int
}

// Provider abstracts the destination-chain RPC operations the
// assembler needs. *broadcast.Client doesn't expose these today —
// callers can wrap their own JSON-RPC client, or use the
// StaticProvider for dev / tests.
type Provider interface {
	// PendingNonce returns the next nonce to use for `address` on the
	// destination chain. Should query eth_getTransactionCount with
	// the "pending" block tag so back-to-back txs from the same
	// signer don't collide.
	PendingNonce(ctx context.Context, network, address string) (uint64, error)
	// SuggestGasPrice returns the chain's current gas price (wei).
	// Used only when PerNetwork.DefaultGasPriceWei is unset.
	SuggestGasPrice(ctx context.Context, network string) (*big.Int, error)
}

// StaticProvider returns hardcoded values. Useful for tests and for
// running against chains with predictable fees (Lux testnet, devnet).
type StaticProvider struct {
	mu       sync.RWMutex
	Nonces   map[string]uint64   // key = network|address
	GasPrice map[string]*big.Int // key = network → default gas price
}

// PendingNonce returns the configured nonce (default 0) and post-
// increments so back-to-back calls produce distinct values — useful
// for tests that simulate multiple txs from the same signer.
func (s *StaticProvider) PendingNonce(_ context.Context, network, address string) (uint64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.Nonces == nil {
		s.Nonces = map[string]uint64{}
	}
	key := network + "|" + strings.ToLower(strings.TrimPrefix(address, "0x"))
	v := s.Nonces[key]
	s.Nonces[key] = v + 1
	return v, nil
}

func (s *StaticProvider) SuggestGasPrice(_ context.Context, network string) (*big.Int, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if g, ok := s.GasPrice[network]; ok {
		return new(big.Int).Set(g), nil
	}
	return nil, fmt.Errorf("txassembler: no gas price configured for %s", network)
}

// =============================================================================
// Assembler
// =============================================================================

// Assembler builds destination-chain transactions for swap settlements.
// Concurrency-safe.
type Assembler struct {
	Provider Provider
	Networks map[string]PerNetwork // key = network internal_name
}

// New builds an empty assembler. Populate Networks per-network.
func New(provider Provider) *Assembler {
	return &Assembler{Provider: provider, Networks: map[string]PerNetwork{}}
}

// SetNetwork registers a per-chain config. Convenience wrapper.
func (a *Assembler) SetNetwork(network string, cfg PerNetwork) { a.Networks[network] = cfg }

// Unsigned is the intermediate representation between PreSign and
// Finalize. Callers MUST pass the same instance to Finalize that
// PreSign returned — internal fields persist the canonical wire
// values used to compute the sighash, so reassembly with the
// signature produces a bit-identical raw tx.
type Unsigned struct {
	Network  string
	ChainID  *big.Int
	Nonce    uint64
	GasPrice *big.Int
	GasLimit uint64
	To       []byte // 20-byte address bytes
	Value    *big.Int
	Data     []byte

	// SigHash is the keccak256 of the RLP-encoded
	// [nonce, gasPrice, gas, to, value, data, chainID, 0, 0] —
	// computed inside PreSign and stored here so the caller doesn't
	// have to recompute.
	SigHash [32]byte
}

// SwapIntent is the minimal swap data the assembler needs. Defined
// here (rather than importing cmd/bridge's Swap type) so the package
// stays usable in isolation.
type SwapIntent struct {
	// DestinationNetwork is the internal_name of the destination
	// chain (e.g. LUX_TESTNET, ETHEREUM_SEPOLIA).
	DestinationNetwork string
	// DestinationAddress is the user's recipient address on the
	// destination chain (0x-prefixed hex for EVM).
	DestinationAddress string
	// Amount is the human-readable amount the user receives
	// (e.g. 0.1 = 0.1 ETH). Scaled to wei using PerNetwork.NativeDecimals.
	Amount float64
	// SenderAddress is the MPC-controlled signer address — comes
	// from the eth_address slot of the keygen response. Used to
	// query nonce; also goes into the v calculation post-signing.
	SenderAddress string
}

// PreSign builds the unsigned transaction and returns the keccak256
// sighash the MPC quorum must sign.
func (a *Assembler) PreSign(ctx context.Context, in SwapIntent) (*Unsigned, error) {
	cfg, ok := a.Networks[in.DestinationNetwork]
	if !ok {
		return nil, fmt.Errorf("txassembler: no config for network %s", in.DestinationNetwork)
	}
	if cfg.ChainID == nil || cfg.ChainID.Sign() <= 0 {
		return nil, fmt.Errorf("txassembler: ChainID required for %s", in.DestinationNetwork)
	}

	decimals := cfg.NativeDecimals
	if decimals == 0 {
		decimals = 18 // ETH/LUX/BNB/etc.
	}
	value, err := floatToWei(in.Amount, decimals)
	if err != nil {
		return nil, err
	}

	// Determine `to` + `data` based on mode.
	var to []byte
	var data []byte
	if cfg.BridgeContract != "" {
		to, err = parseAddress(cfg.BridgeContract)
		if err != nil {
			return nil, fmt.Errorf("BridgeContract: %w", err)
		}
		recipient, err := parseAddress(in.DestinationAddress)
		if err != nil {
			return nil, fmt.Errorf("DestinationAddress: %w", err)
		}
		// data = selector || abi.encode(address, uint256)
		// Both args are 32-byte words: 12 leading zero bytes for the
		// address, then 20 address bytes; then 32-byte big-endian value.
		data = make([]byte, 0, 4+32+32)
		data = append(data, cfg.ReleaseSelector[:]...)
		var addrWord [32]byte
		copy(addrWord[12:], recipient)
		data = append(data, addrWord[:]...)
		var valueWord [32]byte
		valueBytes := value.Bytes()
		copy(valueWord[32-len(valueBytes):], valueBytes)
		data = append(data, valueWord[:]...)
		// In contract-call mode the tx value is 0 — funds move via
		// the contract's internal accounting.
		value = big.NewInt(0)
	} else {
		// Pure transfer mode.
		to, err = parseAddress(in.DestinationAddress)
		if err != nil {
			return nil, fmt.Errorf("DestinationAddress: %w", err)
		}
	}

	// Nonce + gas price come from the provider (or static config).
	nonce, err := a.Provider.PendingNonce(ctx, in.DestinationNetwork, in.SenderAddress)
	if err != nil {
		return nil, fmt.Errorf("PendingNonce: %w", err)
	}
	var gasPrice *big.Int
	if cfg.DefaultGasPriceWei != nil && cfg.DefaultGasPriceWei.Sign() > 0 {
		gasPrice = new(big.Int).Set(cfg.DefaultGasPriceWei)
	} else {
		gasPrice, err = a.Provider.SuggestGasPrice(ctx, in.DestinationNetwork)
		if err != nil {
			return nil, fmt.Errorf("SuggestGasPrice: %w", err)
		}
	}
	gasLimit := cfg.DefaultGasLimit
	if gasLimit == 0 {
		if len(data) == 0 {
			gasLimit = 21000 // standard plain transfer
		} else {
			gasLimit = 100000 // conservative default for a contract call
		}
	}

	unsigned := &Unsigned{
		Network:  in.DestinationNetwork,
		ChainID:  new(big.Int).Set(cfg.ChainID),
		Nonce:    nonce,
		GasPrice: gasPrice,
		GasLimit: gasLimit,
		To:       to,
		Value:    value,
		Data:     data,
	}

	// Sighash: keccak256(RLP([nonce, gasPrice, gas, to, value, data, chainID, 0, 0]))
	encoded := rlpList(
		encodeUint(new(big.Int).SetUint64(unsigned.Nonce)),
		encodeUint(unsigned.GasPrice),
		encodeUint(new(big.Int).SetUint64(unsigned.GasLimit)),
		encodeBytes(unsigned.To),
		encodeUint(unsigned.Value),
		encodeBytes(unsigned.Data),
		encodeUint(unsigned.ChainID),
		encodeUint(nil), // r placeholder = 0
		encodeUint(nil), // s placeholder = 0
	)
	unsigned.SigHash = keccak256(encoded)
	return unsigned, nil
}

// Finalize takes the MPC signature (r, s, recoveryID) and produces
// the wire-ready RLP-encoded signed transaction as 0x-prefixed hex.
//
// recoveryID is 0 or 1 — the conventional ECDSA recovery byte. The
// MPC cluster's threshold-ECDSA implementation should return it
// alongside r and s. The assembler computes v = chainID*2 + 35 + recoveryID
// per EIP-155.
//
// r and s are big.Ints (canonical, no leading zeros). If your MPC
// returns a 65-byte concatenated (r || s || v) blob, use ParseRSV
// to split it.
func (a *Assembler) Finalize(unsigned *Unsigned, r, s *big.Int, recoveryID byte) (string, error) {
	if unsigned == nil {
		return "", errors.New("txassembler: nil unsigned")
	}
	if recoveryID > 1 {
		return "", fmt.Errorf("txassembler: recoveryID must be 0 or 1, got %d", recoveryID)
	}
	// v = chainID * 2 + 35 + recoveryID  (EIP-155)
	v := new(big.Int).Mul(unsigned.ChainID, big.NewInt(2))
	v.Add(v, big.NewInt(35+int64(recoveryID)))

	encoded := rlpList(
		encodeUint(new(big.Int).SetUint64(unsigned.Nonce)),
		encodeUint(unsigned.GasPrice),
		encodeUint(new(big.Int).SetUint64(unsigned.GasLimit)),
		encodeBytes(unsigned.To),
		encodeUint(unsigned.Value),
		encodeBytes(unsigned.Data),
		encodeUint(v),
		encodeUint(r),
		encodeUint(s),
	)
	return "0x" + hex.EncodeToString(encoded), nil
}

// ParseRSV splits a 65-byte concatenated signature (r || s || v) into
// (r, s, recoveryID). Accepts hex-encoded input with or without 0x
// prefix. The `v` byte is interpreted as the recovery id directly —
// callers passing an EIP-155-adjusted v (already chainID-mangled)
// should subtract chainID*2 + 35 first.
func ParseRSV(sigHex string) (r, s *big.Int, recoveryID byte, err error) {
	sigHex = strings.TrimPrefix(strings.TrimPrefix(sigHex, "0x"), "0X")
	if len(sigHex) != 130 {
		return nil, nil, 0, fmt.Errorf("txassembler: signature must be 65 bytes (130 hex chars), got %d", len(sigHex))
	}
	sig, err := hex.DecodeString(sigHex)
	if err != nil {
		return nil, nil, 0, fmt.Errorf("txassembler: decode signature hex: %w", err)
	}
	r = new(big.Int).SetBytes(sig[:32])
	s = new(big.Int).SetBytes(sig[32:64])
	recoveryID = sig[64]
	// Some signers return `v` as 27/28 instead of 0/1; normalize.
	if recoveryID == 27 {
		recoveryID = 0
	} else if recoveryID == 28 {
		recoveryID = 1
	}
	if recoveryID > 1 {
		return nil, nil, 0, fmt.Errorf("txassembler: unexpected recovery id %d (want 0/1 or 27/28)", recoveryID)
	}
	return r, s, recoveryID, nil
}

// =============================================================================
// keccak256 wrapper
// =============================================================================

// keccak256 returns the 32-byte Keccak-256 digest of data. Used for
// the tx sighash and (in future) ABI function selectors.
func keccak256(data []byte) [32]byte {
	h := sha3.NewLegacyKeccak256()
	_, _ = h.Write(data)
	var out [32]byte
	copy(out[:], h.Sum(nil))
	return out
}

// FunctionSelector returns the first 4 bytes of keccak256("signature")
// — the canonical Solidity function selector. Useful for populating
// PerNetwork.ReleaseSelector when the destination bridge contract
// exposes a known release ABI.
//
// Example: FunctionSelector("release(address,uint256)") → [0x37, 0x55, 0x4b, 0xa1]
// (or whatever the actual selector turns out to be — sanity-check on chain).
func FunctionSelector(signature string) [4]byte {
	sum := keccak256([]byte(signature))
	var sel [4]byte
	copy(sel[:], sum[:4])
	return sel
}
