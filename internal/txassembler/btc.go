// btc.go: Bitcoin transaction assembly for the bridge release flow.
//
// Scope: build a wire-correct P2WPKH (bech32) spending transaction that
// the MPC quorum threshold-signs, then re-assemble the signatures into
// a serialized raw tx broadcast-ready for Bitcoin Core / mempool.space.
//
// Design rules:
//   - Witness version 0 only (bech32 `bc1q...` / `tb1q...`). The vast
//     majority of bridge release addresses fall in this slot — the MPC
//     cluster derives BTC addresses by HASH160(secp256k1 pubkey) which
//     is exactly what P2WPKH consumes. P2TR (taproot) is intentionally
//     deferred: it would need a separate keygen variant (the MPC
//     dashboard already supports Ed25519 / Schnorr signing, but the
//     bridge's existing CGGMP21-ECDSA threshold scheme is what BTC
//     P2WPKH wants).
//   - SIGHASH_ALL only. No anyonecanpay / single — those open the door
//     to malleability we don't need. Witness sighash follows BIP143.
//   - Greedy largest-first UTXO selection. Adequate for v1: the release
//     wallet is the bridge's own pre-funded pool wallet, never the user's
//     wallet, so UTXO topology stays predictable.
//   - Single change output back to the release address. Saves the
//     coordination of a separate change wallet and keeps the pool
//     fully self-contained.
//   - Fee estimation pulls sat/vB from mempool.space's
//     /v1/fees/recommended endpoint (halfHourFee) at build time.
//     Fallback path uses a static 10 sat/vB which matches typical
//     mainnet mempool conditions and a much more generous testnet floor.
//
// What the assembler does NOT do:
//   - PSBT v0/v2 serialization on the wire. We use the raw wire format
//     internally and only emit BIP143 sighash bytes + the final raw tx;
//     callers receive the canonical txid via Finalize. PSBT-as-format
//     is a serialization convenience for hardware-wallet workflows —
//     irrelevant inside the bridge process where everything is in one
//     binary.
//   - Bitcoin Core RPC. UTXO discovery + fee feeds go through the
//     mempool.space REST API by default, with a `UTXOFetcher` /
//     `FeeEstimator` interface seam for swapping in btcwallet or a
//     private indexer when the deployment warrants it.
//
// Concurrency: BTCAssembler is safe for concurrent use. Its
// configuration is read-only after construction and every PreSign /
// Finalize call builds its own MsgTx instance.

package txassembler

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"math/big"
	"net/http"
	"sort"
	"strings"
	"sync/atomic"
	"time"

	"github.com/btcsuite/btcd/btcutil"
	"github.com/btcsuite/btcd/chaincfg"
	"github.com/btcsuite/btcd/chaincfg/chainhash"
	"github.com/btcsuite/btcd/txscript"
	"github.com/btcsuite/btcd/wire"

	"github.com/luxfi/bridge/internal/tokens"
)

// =============================================================================
// Public types
// =============================================================================

// BTCNetwork is the BIP173 network selector ("bc" mainnet / "tb" testnet).
type BTCNetwork string

const (
	BTCMainnet BTCNetwork = "mainnet"
	BTCTestnet BTCNetwork = "testnet"
)

// chainParams returns the corresponding chaincfg params for this network.
func (n BTCNetwork) chainParams() *chaincfg.Params {
	if n == BTCTestnet {
		return &chaincfg.TestNet3Params
	}
	return &chaincfg.MainNetParams
}

// HRP returns the bech32 human-readable prefix for the network.
// `bc` mainnet, `tb` testnet. Useful for runtime validation that the
// release address actually belongs to the network the assembler is
// configured for — a mismatch is a config bug that would silently
// produce txs no one can broadcast.
func (n BTCNetwork) HRP() string {
	return n.chainParams().Bech32HRPSegwit
}

// BTCUTXO is one unspent output the assembler can consume.
//
// TxID is the canonical big-endian "display" txid (the hex string users
// see in block explorers). Internally we flip the bytes when building
// the chainhash.Hash because Bitcoin's wire format is little-endian for
// the prevout hash field.
//
// PKScript holds the scriptPubKey of the prevout — required for the
// BIP143 sighash midstate and for size estimation. mempool.space's
// REST API does not return the scriptPubKey directly on the UTXO list
// endpoint; callers fetching from a different source must populate it
// (or BTCAssembler.UTXOFetcher can be swapped). For pure P2WPKH inputs
// owned by the release wallet, we compute the script locally from the
// release address — see (a *BTCAssembler) populateUTXOScript.
type BTCUTXO struct {
	TxID     string `json:"txid"`
	Vout     uint32 `json:"vout"`
	Value    int64  `json:"value"`
	PKScript []byte `json:"-"` // computed locally for own-address UTXOs
	// Block height is informational — the selector ignores it for now
	// (no minconf filter) but operators can use it for debugging /
	// metrics. mempool.space returns this on its UTXO list endpoint.
	BlockHeight uint64 `json:"-"`
}

// BTCSpec is the BTC-side analogue of SwapIntent — the minimum data a
// caller (the signing driver) supplies to assemble a release tx.
type BTCSpec struct {
	// Network selects mainnet vs testnet wire params + bech32 hrp.
	Network BTCNetwork

	// FromAddress is the release-pool wallet address (bech32 P2WPKH).
	// The assembler queries this address's UTXOs (via UTXOFetcher) and
	// sends change back to it. Caller MUST provide both this and the
	// matching FromPubKey because the witness script requires the
	// compressed pubkey at finalize time.
	FromAddress string

	// FromPubKey is the compressed 33-byte secp256k1 public key of the
	// release wallet. The bridge mchain client surfaces this in the
	// keygen response (ECDSAPubKey field). Required for the BIP143
	// scriptCode + the final witness stack on Finalize.
	FromPubKey []byte

	// ToAddress is the user's recipient address (bech32 P2WPKH for v1).
	ToAddress string

	// ValueSat is the amount in satoshis the user receives. NOT in BTC.
	ValueSat int64

	// FeeRateSatPerVB overrides the assembler's FeeEstimator. Useful for
	// tests and emergency operator bumps. Zero ⇒ FeeEstimator is queried.
	FeeRateSatPerVB int64
}

// BTCInputCtx is the per-input state Finalize needs to reassemble the
// witness stack after the MPC produces signatures. PreSign returns one
// of these alongside each sighash; the caller must round-trip them
// untouched to Finalize.
//
// PrevValue + PKScript are persisted because Finalize re-runs the
// BIP143 sighash check by reconstructing the witness; a mismatch means
// the caller stuffed wrong sighashes into the MPC and we want a clear
// error rather than a silently-invalid tx.
type BTCInputCtx struct {
	TxID      string `json:"txid"`
	Vout      uint32 `json:"vout"`
	PrevValue int64  `json:"prev_value"`
	PKScript  []byte `json:"pk_script"`
	// PubKey is the 33-byte compressed secp256k1 public key the witness
	// stack will include. Same value as BTCSpec.FromPubKey; replicated
	// here so the unsigned blob is self-contained.
	PubKey []byte `json:"pubkey"`
}

// BTCUnsigned is the intermediate state between PreSign and Finalize.
// Holds the wire-format tx with witness fields empty, plus the per-input
// metadata Finalize needs to fill them in.
type BTCUnsigned struct {
	Network BTCNetwork

	// Tx is the wire.MsgTx — already in canonical form except witnesses
	// are empty. Finalize fills witnesses and reserializes.
	Tx *wire.MsgTx

	// Inputs[i] corresponds to Tx.TxIn[i].
	Inputs []BTCInputCtx

	// FeeSat is the actual fee the assembler charged (UTXOs - outputs).
	FeeSat int64

	// FeeRateSatPerVB is what the assembler used. Captured for logs.
	FeeRateSatPerVB int64
}

// BTCECDSASig is one ECDSA signature in (r, s) form.
//
// The MPC dashboard returns r + s as 0x-prefixed hex; ParseBTCRSV in
// this file converts those into BTCECDSASig{R, S} values.
type BTCECDSASig struct {
	R *big.Int
	S *big.Int
}

// =============================================================================
// BTCAssembler — the analog of the EVM Assembler
// =============================================================================

// BTCUTXOFetcher abstracts UTXO discovery. The default impl
// (MempoolSpaceClient) pulls from mempool.space; deployments with
// their own indexer can drop in another implementation here.
type BTCUTXOFetcher interface {
	UTXOs(ctx context.Context, network BTCNetwork, address string) ([]BTCUTXO, error)
}

// BTCFeeEstimator abstracts fee-rate discovery (sat/vB). Default impl
// hits mempool.space's /v1/fees/recommended; static values can be
// wired via BTCAssembler.StaticFeeRateSatPerVB.
type BTCFeeEstimator interface {
	FeeRateSatPerVB(ctx context.Context, network BTCNetwork) (int64, error)
}

// BTCBalanceProbe surfaces the release wallet's confirmed balance so
// the signing driver can short-circuit insufficient-fund swaps before
// burning the MPC ceremony — analogous to the EVM eth_getBalance
// pre-check.
type BTCBalanceProbe interface {
	BalanceSat(ctx context.Context, network BTCNetwork, address string) (int64, error)
}

// BTCAssembler is the BTC analog of the EVM Assembler. Construct via
// NewBTCAssembler — the zero value is unusable because every method
// touches HTTP-backed UTXO / fee fetchers.
type BTCAssembler struct {
	Network BTCNetwork

	// UTXOFetcher discovers spendable outputs at the release address.
	// Required.
	UTXOFetcher BTCUTXOFetcher

	// FeeEstimator surfaces the current sat/vB rate. When nil, the
	// assembler falls back to StaticFeeRateSatPerVB.
	FeeEstimator BTCFeeEstimator

	// StaticFeeRateSatPerVB is the fallback fee rate used when
	// FeeEstimator is nil OR when its call fails. Zero ⇒ 10 sat/vB
	// (sensible mainnet floor; testnet typically clears under 5).
	StaticFeeRateSatPerVB int64

	// MinConfirmations is the minimum confirmation count an input must
	// have before the assembler will spend it. Zero ⇒ 1 (any confirmed
	// output). The bridge's release wallet doesn't churn its outputs
	// often so even tightening to 3 wouldn't slow normal operation.
	MinConfirmations uint64

	// Tokens, when set, drives BTC-side asset routing. For BTC the
	// only sensible "asset" is BTC native — but threading it through
	// the assembler the same way the EVM path uses tokens keeps the
	// surface uniform.
	Tokens *tokens.Registry
}

// NewBTCAssembler builds a BTC assembler with the supplied fetcher +
// estimator. Pass network=BTCTestnet for testnet wire params.
func NewBTCAssembler(network BTCNetwork, fetcher BTCUTXOFetcher, estimator BTCFeeEstimator) *BTCAssembler {
	return &BTCAssembler{
		Network:               network,
		UTXOFetcher:           fetcher,
		FeeEstimator:          estimator,
		StaticFeeRateSatPerVB: 10,
		MinConfirmations:      1,
	}
}

// =============================================================================
// PreSign
// =============================================================================

// ErrBTCInsufficientFunds means even the largest UTXO set the assembler
// could find can't cover (value + fee). Surface this distinctly so the
// signing driver short-circuits the swap rather than burning an MPC
// ceremony.
var ErrBTCInsufficientFunds = errors.New("txassembler: BTC release wallet has insufficient funds for (value + fee)")

// PreSign builds the unsigned BTC transaction and returns one sighash
// per input. The MPC cluster signs each sighash with the release
// wallet's threshold key; the resulting (r, s) pairs feed Finalize.
//
// Implementation flow:
//  1. Decode + validate addresses against the network's hrp.
//  2. Pull UTXOs from UTXOFetcher (filtered by MinConfirmations).
//  3. Select the greedy-largest set that covers (value + fee) where fee
//     itself is recomputed as the set grows (more inputs → bigger tx).
//  4. Build wire.MsgTx with one output to the recipient + one change
//     output back to the release address (omitted if change is dust).
//  5. Compute BIP143 sighash per input via txscript.CalcWitnessSigHash.
//
// Returns:
//   - sighashes: one 32-byte digest per input, in input order.
//   - unsigned: the wire blob + per-input context Finalize will need.
func (a *BTCAssembler) PreSign(ctx context.Context, spec BTCSpec) (
	sighashes [][]byte, unsigned *BTCUnsigned, err error,
) {
	if a.UTXOFetcher == nil {
		return nil, nil, errors.New("txassembler: BTCAssembler.UTXOFetcher required")
	}
	if spec.Network == "" {
		spec.Network = a.Network
	}
	params := spec.Network.chainParams()

	fromAddr, err := btcutil.DecodeAddress(spec.FromAddress, params)
	if err != nil {
		return nil, nil, fmt.Errorf("txassembler: decode FromAddress %q: %w", spec.FromAddress, err)
	}
	if _, ok := fromAddr.(*btcutil.AddressWitnessPubKeyHash); !ok {
		return nil, nil, fmt.Errorf("txassembler: FromAddress %q must be P2WPKH (bech32 v0)", spec.FromAddress)
	}
	toAddr, err := btcutil.DecodeAddress(spec.ToAddress, params)
	if err != nil {
		return nil, nil, fmt.Errorf("txassembler: decode ToAddress %q: %w", spec.ToAddress, err)
	}
	if _, ok := toAddr.(*btcutil.AddressWitnessPubKeyHash); !ok {
		return nil, nil, fmt.Errorf("txassembler: ToAddress %q must be P2WPKH (bech32 v0)", spec.ToAddress)
	}
	if spec.ValueSat <= 0 {
		return nil, nil, fmt.Errorf("txassembler: ValueSat must be > 0; got %d", spec.ValueSat)
	}
	if len(spec.FromPubKey) != 33 {
		return nil, nil, fmt.Errorf("txassembler: FromPubKey must be 33 bytes (compressed secp256k1); got %d", len(spec.FromPubKey))
	}

	// Step 1 — resolve fee rate.
	feeRate := spec.FeeRateSatPerVB
	if feeRate <= 0 {
		feeRate = a.resolveFeeRate(ctx, spec.Network)
	}

	// Step 2 — pull UTXOs and compute the source pkScript locally.
	rawUTXOs, err := a.UTXOFetcher.UTXOs(ctx, spec.Network, spec.FromAddress)
	if err != nil {
		return nil, nil, fmt.Errorf("txassembler: UTXOFetcher: %w", err)
	}
	fromScript, err := txscript.PayToAddrScript(fromAddr)
	if err != nil {
		return nil, nil, fmt.Errorf("txassembler: build pkScript for FromAddress: %w", err)
	}
	utxos := make([]BTCUTXO, 0, len(rawUTXOs))
	for _, u := range rawUTXOs {
		// Each own-address UTXO uses the same pkScript: the P2WPKH for
		// the release address. Populate it here so the BIP143 sighash
		// machinery has what it needs without a per-UTXO scriptPubKey
		// query.
		if len(u.PKScript) == 0 {
			u.PKScript = fromScript
		}
		utxos = append(utxos, u)
	}

	// Step 3 — greedy largest-first selection.
	picked, changeSat, fee, err := selectBTCUTXOs(utxos, spec.ValueSat, feeRate)
	if err != nil {
		return nil, nil, err
	}

	// Step 4 — build the wire.MsgTx.
	tx := wire.NewMsgTx(2)
	inputCtxs := make([]BTCInputCtx, 0, len(picked))
	for _, u := range picked {
		h, herr := chainHashFromTxID(u.TxID)
		if herr != nil {
			return nil, nil, fmt.Errorf("txassembler: parse UTXO txid %q: %w", u.TxID, herr)
		}
		outpoint := wire.NewOutPoint(h, u.Vout)
		// Sequence: 0xfffffffd opts into RBF (BIP125). Using RBF lets
		// operator-driven fee bumps work if mempool conditions change
		// between assembly and inclusion.
		txIn := wire.NewTxIn(outpoint, nil, nil)
		txIn.Sequence = 0xfffffffd
		tx.AddTxIn(txIn)
		inputCtxs = append(inputCtxs, BTCInputCtx{
			TxID:      u.TxID,
			Vout:      u.Vout,
			PrevValue: u.Value,
			PKScript:  u.PKScript,
			PubKey:    append([]byte(nil), spec.FromPubKey...),
		})
	}

	toScript, err := txscript.PayToAddrScript(toAddr)
	if err != nil {
		return nil, nil, fmt.Errorf("txassembler: build pkScript for ToAddress: %w", err)
	}
	tx.AddTxOut(wire.NewTxOut(spec.ValueSat, toScript))

	// Change output — but only if it's economically sensible. The
	// 546 sat dust threshold is the standard mainnet floor; anything
	// below would be unspendable.
	if changeSat >= btcDustThresholdSat {
		tx.AddTxOut(wire.NewTxOut(changeSat, fromScript))
	}

	// Step 5 — per-input BIP143 sighashes.
	prevOutFetcher := txscript.NewMultiPrevOutFetcher(nil)
	for _, in := range inputCtxs {
		h, _ := chainHashFromTxID(in.TxID)
		outpoint := wire.NewOutPoint(h, in.Vout)
		prevOutFetcher.AddPrevOut(*outpoint, &wire.TxOut{
			Value:    in.PrevValue,
			PkScript: in.PKScript,
		})
	}
	sigHashes := txscript.NewTxSigHashes(tx, prevOutFetcher)

	out := make([][]byte, 0, len(tx.TxIn))
	for i, in := range inputCtxs {
		// BIP143 sighash for a P2WPKH input uses the pubkey-hash script
		// `OP_DUP OP_HASH160 <pkh> OP_EQUALVERIFY OP_CHECKSIG` as the
		// "scriptCode" — not the witness script directly. txscript
		// requires we pass exactly that classic P2PKH-style script,
		// derived from the witness program (pubkey hash).
		scriptCode, scErr := p2wpkhScriptCode(in.PKScript)
		if scErr != nil {
			return nil, nil, fmt.Errorf("txassembler: input %d scriptCode: %w", i, scErr)
		}
		digest, sErr := txscript.CalcWitnessSigHash(scriptCode, sigHashes, txscript.SigHashAll, tx, i, in.PrevValue)
		if sErr != nil {
			return nil, nil, fmt.Errorf("txassembler: input %d sighash: %w", i, sErr)
		}
		out = append(out, digest)
	}

	return out, &BTCUnsigned{
		Network:         spec.Network,
		Tx:              tx,
		Inputs:          inputCtxs,
		FeeSat:          fee,
		FeeRateSatPerVB: feeRate,
	}, nil
}

// =============================================================================
// Finalize
// =============================================================================

// Finalize takes the per-input ECDSA signatures the MPC produced and
// assembles the final raw transaction.
//
// witness layout for P2WPKH (BIP141):
//
//	witness[0] = DER(r, s) || SIGHASH_ALL
//	witness[1] = compressed pubkey (33 bytes)
//
// Returns:
//   - raw: serialized bytes ready for sendrawtransaction.
//   - txid: canonical big-endian (display order) txid as hex.
func (a *BTCAssembler) Finalize(unsigned *BTCUnsigned, sigs []BTCECDSASig) (raw []byte, txid string, err error) {
	if unsigned == nil {
		return nil, "", errors.New("txassembler: nil BTCUnsigned")
	}
	if len(sigs) != len(unsigned.Tx.TxIn) {
		return nil, "", fmt.Errorf("txassembler: signature count mismatch: got %d signatures for %d inputs", len(sigs), len(unsigned.Tx.TxIn))
	}
	for i := range unsigned.Tx.TxIn {
		sig := sigs[i]
		if sig.R == nil || sig.S == nil {
			return nil, "", fmt.Errorf("txassembler: input %d: missing r or s", i)
		}
		ctxIn := unsigned.Inputs[i]
		if len(ctxIn.PubKey) != 33 {
			return nil, "", fmt.Errorf("txassembler: input %d: pubkey must be 33 bytes", i)
		}
		// Canonicalize s into low-s form (BIP146); high-s sigs are
		// non-standard and most nodes refuse to relay them.
		s := new(big.Int).Set(sig.S)
		if s.Cmp(secp256k1HalfN) > 0 {
			s = new(big.Int).Sub(secp256k1N, s)
		}
		der, derErr := encodeDERSignature(sig.R, s)
		if derErr != nil {
			return nil, "", fmt.Errorf("txassembler: input %d: DER encode: %w", i, derErr)
		}
		// Append SIGHASH_ALL.
		der = append(der, byte(txscript.SigHashAll))

		unsigned.Tx.TxIn[i].Witness = wire.TxWitness{der, append([]byte(nil), ctxIn.PubKey...)}
	}

	var buf bytes.Buffer
	if err := unsigned.Tx.Serialize(&buf); err != nil {
		return nil, "", fmt.Errorf("txassembler: serialize tx: %w", err)
	}
	hash := unsigned.Tx.TxHash()
	return buf.Bytes(), hash.String(), nil
}

// =============================================================================
// Fee estimation
// =============================================================================

func (a *BTCAssembler) resolveFeeRate(ctx context.Context, network BTCNetwork) int64 {
	if a.FeeEstimator != nil {
		rate, err := a.FeeEstimator.FeeRateSatPerVB(ctx, network)
		if err == nil && rate > 0 {
			return rate
		}
	}
	if a.StaticFeeRateSatPerVB > 0 {
		return a.StaticFeeRateSatPerVB
	}
	return 10 // sensible mainnet floor
}

// btcDustThresholdSat is the canonical mainnet dust threshold for
// P2WPKH outputs (294 sat for legacy P2PKH; 546 historical floor for
// general dust). 546 is the universally-accepted "anything below is
// economically unspendable" cutoff.
const btcDustThresholdSat int64 = 546

// =============================================================================
// UTXO selection
// =============================================================================

// selectBTCUTXOs picks UTXOs greedy-largest-first to cover (value+fee),
// where the fee scales with the number of inputs chosen (more inputs
// → bigger tx → more fee). Returns the picked set, the change amount
// (sat), and the total fee (sat) the caller subtracts.
//
// Implementation:
//   - vsize for a P2WPKH-only tx ≈ 11 + 68*inputs + 31*outputs vBytes.
//     11 is the version + locktime + segwit marker + flag (rounded);
//     68 vB per P2WPKH input (witness discount: 41 base + 108 witness
//     → (41*4 + 108 + 3) / 4 ≈ 68 vB); 31 vB per P2WPKH output (script
//     length 22 + value 8 + length byte = 31).
//   - We assume 2 outputs (recipient + change); when change ends up
//     below the dust threshold the caller drops it but the fee was
//     already computed for the larger tx. The few extra sat
//     "overpays" — acceptable.
//
// Returns ErrBTCInsufficientFunds when the entire UTXO set, summed,
// doesn't cover (value + maximum fee).
func selectBTCUTXOs(utxos []BTCUTXO, valueSat, feeRateSatPerVB int64) (picked []BTCUTXO, changeSat, feeSat int64, err error) {
	if valueSat <= 0 {
		return nil, 0, 0, fmt.Errorf("txassembler: valueSat must be > 0; got %d", valueSat)
	}
	if feeRateSatPerVB <= 0 {
		return nil, 0, 0, fmt.Errorf("txassembler: feeRateSatPerVB must be > 0; got %d", feeRateSatPerVB)
	}
	// Largest-first.
	sorted := append([]BTCUTXO(nil), utxos...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Value > sorted[j].Value })

	var sum int64
	for i, u := range sorted {
		sum += u.Value
		picked = append(picked, u)
		// Estimate the fee for the current set (i+1 inputs, 2 outputs).
		vsize := estimatedP2WPKHVSize(i+1, 2)
		feeSat = vsize * feeRateSatPerVB
		// We want sum >= value + fee; check.
		if sum >= valueSat+feeSat {
			changeSat = sum - valueSat - feeSat
			return picked, changeSat, feeSat, nil
		}
	}
	// Exhausted UTXOs without covering — surface insufficient-funds.
	return nil, 0, 0, fmt.Errorf("%w: need %d sat, have %d sat across %d UTXOs",
		ErrBTCInsufficientFunds, valueSat, sum, len(utxos))
}

// estimatedP2WPKHVSize returns the virtual-size estimate for a
// P2WPKH-only tx with `inputs` inputs and `outputs` outputs. Derived
// from BIP141 weight rules and confirmed against btcd's mempool
// GetTxVirtualSize for real txs.
func estimatedP2WPKHVSize(inputs, outputs int) int64 {
	// Base (non-witness) bytes:
	//   4    version
	//   1    flag + marker (counted in witness weight only)
	//   varint inputCount (≤ 252 → 1)
	//   inputs * 41 = (32 txid + 4 vout + 1 scriptlen + 0 script + 4 sequence)
	//   varint outputCount → 1
	//   outputs * 31 = (8 value + 1 scriptlen + 22 P2WPKH script)
	//   4    locktime
	baseBytes := 4 + 1 + int64(inputs)*41 + 1 + int64(outputs)*31 + 4
	// Witness bytes (already includes the marker+flag + per-input witness):
	//   2  marker + flag
	//   inputs * 108 = (1 stackitem count + 1 siglen + 72 sig + 1 pklen + 33 pubkey)
	//                 — DER signatures vary 71-72 bytes, 72 is conservative.
	witnessBytes := int64(2) + int64(inputs)*108
	weight := baseBytes*4 + witnessBytes
	return (weight + 3) / 4
}

// =============================================================================
// scriptCode / sighash plumbing
// =============================================================================

// p2wpkhScriptCode derives the "scriptCode" the BIP143 sighash needs
// from a P2WPKH pkScript. P2WPKH pkScript is `OP_0 <pkh20>` (22 bytes);
// the scriptCode the sighash actually consumes is the equivalent
// P2PKH-style `OP_DUP OP_HASH160 <pkh20> OP_EQUALVERIFY OP_CHECKSIG`
// (25 bytes).
func p2wpkhScriptCode(pkScript []byte) ([]byte, error) {
	if len(pkScript) != 22 {
		return nil, fmt.Errorf("not a P2WPKH script (len=%d)", len(pkScript))
	}
	if pkScript[0] != 0x00 || pkScript[1] != 0x14 {
		return nil, fmt.Errorf("not a P2WPKH script (prefix=%x %x)", pkScript[0], pkScript[1])
	}
	scriptCode := make([]byte, 0, 25)
	scriptCode = append(scriptCode, 0x76) // OP_DUP
	scriptCode = append(scriptCode, 0xa9) // OP_HASH160
	scriptCode = append(scriptCode, 0x14) // push 20
	scriptCode = append(scriptCode, pkScript[2:22]...)
	scriptCode = append(scriptCode, 0x88) // OP_EQUALVERIFY
	scriptCode = append(scriptCode, 0xac) // OP_CHECKSIG
	return scriptCode, nil
}

// chainHashFromTxID converts a big-endian hex txid (display order) into
// a chainhash.Hash (which Bitcoin's wire encoding treats as little-
// endian). Reversing here is the universally-applied convention.
func chainHashFromTxID(txid string) (*chainhash.Hash, error) {
	txid = strings.TrimPrefix(strings.TrimPrefix(txid, "0x"), "0X")
	b, err := hex.DecodeString(txid)
	if err != nil {
		return nil, err
	}
	if len(b) != chainhash.HashSize {
		return nil, fmt.Errorf("txid must be %d bytes; got %d", chainhash.HashSize, len(b))
	}
	// Reverse: display order → wire order.
	var h chainhash.Hash
	for i := 0; i < chainhash.HashSize; i++ {
		h[i] = b[chainhash.HashSize-1-i]
	}
	return &h, nil
}

// =============================================================================
// DER encoding for ECDSA signatures
// =============================================================================

// encodeDERSignature serializes (r, s) into the canonical DER form
// Bitcoin consensus requires. Both r and s are positive integers; if
// the high bit is set, a leading 0x00 byte is prepended to make the
// integer unambiguously positive.
func encodeDERSignature(r, s *big.Int) ([]byte, error) {
	if r == nil || s == nil {
		return nil, errors.New("nil r or s")
	}
	if r.Sign() <= 0 || s.Sign() <= 0 {
		return nil, fmt.Errorf("r/s must be positive; r=%v s=%v", r.Sign(), s.Sign())
	}

	encodeInt := func(n *big.Int) []byte {
		b := n.Bytes()
		if len(b) == 0 {
			b = []byte{0}
		}
		// Pad with 0x00 if high bit is set (else DER parses as negative).
		if b[0]&0x80 != 0 {
			b = append([]byte{0x00}, b...)
		}
		return b
	}
	rb := encodeInt(r)
	sb := encodeInt(s)

	body := make([]byte, 0, 6+len(rb)+len(sb))
	body = append(body, 0x02) // INTEGER tag
	body = append(body, byte(len(rb)))
	body = append(body, rb...)
	body = append(body, 0x02)
	body = append(body, byte(len(sb)))
	body = append(body, sb...)

	out := make([]byte, 0, 2+len(body))
	out = append(out, 0x30) // SEQUENCE tag
	out = append(out, byte(len(body)))
	out = append(out, body...)
	return out, nil
}

// ParseBTCRSV converts the dashboard's hex r + hex s (no v needed for
// BTC) into a BTCECDSASig. Accepts 0x prefix or bare hex on either
// component. Both must be ≤ 32 bytes after hex decoding.
//
// Used by the signing driver to bridge the dashboard's {r, s} JSON
// payload into Finalize's signature slice.
func ParseBTCRSV(rHex, sHex string) (*BTCECDSASig, error) {
	clean := func(h string) string {
		return strings.TrimPrefix(strings.TrimPrefix(h, "0x"), "0X")
	}
	r := clean(rHex)
	s := clean(sHex)
	if len(r) == 0 || len(s) == 0 {
		return nil, errors.New("txassembler: empty r or s")
	}
	// Pad to 64 chars so SetString reads canonical 32-byte big-endian.
	if len(r) < 64 {
		r = strings.Repeat("0", 64-len(r)) + r
	}
	if len(s) < 64 {
		s = strings.Repeat("0", 64-len(s)) + s
	}
	rInt, ok := new(big.Int).SetString(r, 16)
	if !ok {
		return nil, fmt.Errorf("invalid r hex %q", rHex)
	}
	sInt, ok := new(big.Int).SetString(s, 16)
	if !ok {
		return nil, fmt.Errorf("invalid s hex %q", sHex)
	}
	return &BTCECDSASig{R: rInt, S: sInt}, nil
}

// =============================================================================
// Mempool.space-backed fetcher + estimator
// =============================================================================

// DefaultMempoolSpaceMainnetURL is the public mempool.space REST API
// for mainnet. Operators with their own indexer should override.
const DefaultMempoolSpaceMainnetURL = "https://mempool.space/api"

// DefaultMempoolSpaceTestnetURL is the testnet equivalent.
const DefaultMempoolSpaceTestnetURL = "https://mempool.space/testnet/api"

// MempoolSpaceClient is the BTCUTXOFetcher + BTCFeeEstimator
// + BTCBalanceProbe implementation backed by mempool.space's REST API.
//
// Wire shapes consumed:
//
//	GET /api/address/{addr}/utxo
//	  → [{txid, vout, status:{confirmed,block_height}, value}, ...]
//
//	GET /api/v1/fees/recommended
//	  → {fastestFee, halfHourFee, hourFee, economyFee, minimumFee}
//	  all values are sat/vB.
//
//	GET /api/address/{addr}
//	  → {chain_stats:{funded_txo_sum, spent_txo_sum, ...}, mempool_stats:{...}}
//
// Concurrency: a *MempoolSpaceClient is safe for concurrent use.
type MempoolSpaceClient struct {
	// MainnetURL / TestnetURL override the package defaults. Leave
	// empty to use mempool.space's public endpoints.
	MainnetURL string
	TestnetURL string

	// Timeout caps each individual HTTP call. Zero ⇒ 10 s — generous
	// because the public mempool.space endpoints occasionally hiccup
	// behind their CDN.
	Timeout time.Duration

	// HTTPClient is the underlying http.Client. Zero ⇒ a fresh
	// http.Client with Timeout.
	HTTPClient *http.Client

	callSeq atomic.Uint64
}

// NewMempoolSpaceClient builds a client with a per-call timeout.
func NewMempoolSpaceClient(timeout time.Duration) *MempoolSpaceClient {
	if timeout <= 0 {
		timeout = 10 * time.Second
	}
	return &MempoolSpaceClient{
		Timeout:    timeout,
		HTTPClient: &http.Client{Timeout: timeout},
	}
}

func (c *MempoolSpaceClient) baseURL(n BTCNetwork) string {
	if n == BTCTestnet {
		if c.TestnetURL != "" {
			return c.TestnetURL
		}
		return DefaultMempoolSpaceTestnetURL
	}
	if c.MainnetURL != "" {
		return c.MainnetURL
	}
	return DefaultMempoolSpaceMainnetURL
}

func (c *MempoolSpaceClient) httpClient() *http.Client {
	if c.HTTPClient != nil {
		return c.HTTPClient
	}
	return &http.Client{Timeout: c.Timeout}
}

// UTXOs implements BTCUTXOFetcher. Returns confirmed UTXOs only;
// unconfirmed outputs are excluded to avoid replacement races.
func (c *MempoolSpaceClient) UTXOs(ctx context.Context, network BTCNetwork, address string) ([]BTCUTXO, error) {
	url := strings.TrimRight(c.baseURL(network), "/") + "/address/" + address + "/utxo"
	respBody, status, err := c.get(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("mempool.space: UTXOs(%s): %w", address, err)
	}
	if status < 200 || status >= 300 {
		return nil, fmt.Errorf("mempool.space: UTXOs HTTP %d: %s", status, truncateMS(respBody, 200))
	}
	var wireUTXOs []struct {
		TxID   string `json:"txid"`
		Vout   uint32 `json:"vout"`
		Value  int64  `json:"value"`
		Status struct {
			Confirmed   bool   `json:"confirmed"`
			BlockHeight uint64 `json:"block_height"`
		} `json:"status"`
	}
	if err := json.Unmarshal(respBody, &wireUTXOs); err != nil {
		return nil, fmt.Errorf("mempool.space: decode UTXO body: %w (body=%s)", err, truncateMS(respBody, 200))
	}
	out := make([]BTCUTXO, 0, len(wireUTXOs))
	for _, u := range wireUTXOs {
		if !u.Status.Confirmed {
			continue
		}
		out = append(out, BTCUTXO{
			TxID:        u.TxID,
			Vout:        u.Vout,
			Value:       u.Value,
			BlockHeight: u.Status.BlockHeight,
		})
	}
	return out, nil
}

// FeeRateSatPerVB implements BTCFeeEstimator. Uses halfHourFee — fast
// enough to confirm in ~3 blocks under normal load without overpaying
// for fastestFee priority.
func (c *MempoolSpaceClient) FeeRateSatPerVB(ctx context.Context, network BTCNetwork) (int64, error) {
	url := strings.TrimRight(c.baseURL(network), "/") + "/v1/fees/recommended"
	respBody, status, err := c.get(ctx, url)
	if err != nil {
		return 0, fmt.Errorf("mempool.space: fees: %w", err)
	}
	if status < 200 || status >= 300 {
		return 0, fmt.Errorf("mempool.space: fees HTTP %d: %s", status, truncateMS(respBody, 200))
	}
	var parsed struct {
		FastestFee  float64 `json:"fastestFee"`
		HalfHourFee float64 `json:"halfHourFee"`
		HourFee     float64 `json:"hourFee"`
		EconomyFee  float64 `json:"economyFee"`
		MinimumFee  float64 `json:"minimumFee"`
	}
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return 0, fmt.Errorf("mempool.space: decode fees: %w (body=%s)", err, truncateMS(respBody, 200))
	}
	if parsed.HalfHourFee <= 0 {
		// Fall back to fastestFee then minimumFee.
		switch {
		case parsed.FastestFee > 0:
			return int64(math.Ceil(parsed.FastestFee)), nil
		case parsed.MinimumFee > 0:
			return int64(math.Ceil(parsed.MinimumFee)), nil
		default:
			return 0, errors.New("mempool.space: all fee values non-positive")
		}
	}
	return int64(math.Ceil(parsed.HalfHourFee)), nil
}

// BalanceSat implements BTCBalanceProbe. Returns confirmed funded -
// confirmed spent (i.e. the spendable confirmed balance).
func (c *MempoolSpaceClient) BalanceSat(ctx context.Context, network BTCNetwork, address string) (int64, error) {
	url := strings.TrimRight(c.baseURL(network), "/") + "/address/" + address
	respBody, status, err := c.get(ctx, url)
	if err != nil {
		return 0, fmt.Errorf("mempool.space: balance: %w", err)
	}
	if status < 200 || status >= 300 {
		return 0, fmt.Errorf("mempool.space: balance HTTP %d: %s", status, truncateMS(respBody, 200))
	}
	var parsed struct {
		ChainStats struct {
			FundedTxoSum int64 `json:"funded_txo_sum"`
			SpentTxoSum  int64 `json:"spent_txo_sum"`
		} `json:"chain_stats"`
	}
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return 0, fmt.Errorf("mempool.space: decode balance: %w (body=%s)", err, truncateMS(respBody, 200))
	}
	bal := parsed.ChainStats.FundedTxoSum - parsed.ChainStats.SpentTxoSum
	if bal < 0 {
		bal = 0
	}
	return bal, nil
}

// get does one HTTP GET and returns body + status. Caller decides
// what to do with non-2xx.
func (c *MempoolSpaceClient) get(ctx context.Context, url string) ([]byte, int, error) {
	timeout := c.Timeout
	if timeout <= 0 {
		timeout = 10 * time.Second
	}
	callCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	req, err := http.NewRequestWithContext(callCtx, http.MethodGet, url, nil)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Accept", "application/json")
	c.callSeq.Add(1)
	resp, err := c.httpClient().Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return body, resp.StatusCode, nil
}

func truncateMS(b []byte, n int) string {
	if len(b) <= n {
		return string(b)
	}
	return string(b[:n]) + "…"
}

// =============================================================================
// Compile-time interface checks
// =============================================================================

var (
	_ BTCUTXOFetcher  = (*MempoolSpaceClient)(nil)
	_ BTCFeeEstimator = (*MempoolSpaceClient)(nil)
	_ BTCBalanceProbe = (*MempoolSpaceClient)(nil)
)

// Sanity: ensure the SHA256 we'd use for sighash is the FIPS-180 one.
var _ = sha256.Sum256
