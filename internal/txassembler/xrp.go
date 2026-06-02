package txassembler

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"math/big"
	"strconv"

	"github.com/luxfi/bridge/internal/xrpl"
)

// xrp.go: XRP Ledger tx assembly + finalization, parallel to the EVM
// path in assembler.go but with a totally different wire shape:
//
//   • Unsigned tx is a native-XRP Payment (no gas / no value-in-wei).
//   • Signing message is SHA-512Half of (STX prefix || serialized body).
//   • Signature format on the wire is ASN.1 DER (not concatenated R||S||V).
//   • There is no recovery byte — XRPL verifies with the SigningPubKey
//     embedded in the tx, no ecrecover needed.
//   • Account-level Sequence + Fee come from rippled's account_info,
//     not eth_getTransactionCount / eth_gasPrice.
//
// This file owns three things:
//   1. XRPProvider: the network-side surface the bridge needs to build
//      an XRP tx (Sequence + suggested fee + last_ledger_index).
//   2. XRPNetwork: per-network config (mostly the LastLedgerSequence
//      window).
//   3. PreSignXRP / FinalizeXRP: the symmetric pair to the EVM
//      Assembler.PreSign / Finalize functions.

// =============================================================================
// Network-side surface — XRP account state
// =============================================================================

// XRPProvider is the rippled-side surface the XRP assembler consumes.
// Production implementation lives in cmd/bridge/xrp_provider.go (an
// HTTP wrapper around the same rippled endpoint the broadcast client
// posts to). Pulled to an interface so tests stub deterministically.
type XRPProvider interface {
	// AccountInfo returns the account's current Sequence and the
	// ledger index it was read at (for LastLedgerSequence bounding).
	AccountInfo(ctx context.Context, network, address string) (sequence uint32, validatedLedger uint32, err error)

	// SuggestFeeDrops returns the network's current minimum-acceptable
	// fee for a Payment, in drops. Pulled from rippled's `fee` method
	// (open_ledger_fee or median_fee). Falls back to 10 drops on miss.
	SuggestFeeDrops(ctx context.Context, network string) (int64, error)

	// AccountBalanceDrops returns the AccountRoot balance for the given
	// address, in drops. Used by the XRP gas pre-check
	// (release-wallet must hold ≥ reserve + value + fee).
	AccountBalanceDrops(ctx context.Context, network, address string) (int64, error)
}

// XRPNetwork is the per-chain config for an XRP destination.
type XRPNetwork struct {
	// LastLedgerWindow is the number of ledgers ahead of the current
	// validated ledger the tx will remain valid for. Default 20 ledgers
	// (~80 seconds) — long enough for the MPC ceremony to finish and
	// the broadcaster to push, short enough to bound stuck-tx exposure.
	LastLedgerWindow uint32

	// DefaultFeeDrops is the operator-pinned fee (overrides
	// XRPProvider.SuggestFeeDrops when non-zero). Useful when the
	// rippled endpoint doesn't expose `fee` (some pruned servers).
	DefaultFeeDrops int64

	// MainnetCanonicalSig — by default the assembler sets the
	// tfFullyCanonicalSig (0x80000000) bit. Set this false on test
	// nets that need ed25519 compat (they don't — ECDSA is universal).
	OmitCanonicalSigFlag bool
}

// =============================================================================
// XRPUnsigned + signing context
// =============================================================================

// XRPUnsigned is the equivalent of Unsigned for XRP: an opaque handle
// the signing driver passes between PreSignXRP and FinalizeXRP. The
// SigningPayload is the 32-byte SHA-512Half digest the MPC quorum
// signs; everything else is internal context FinalizeXRP needs to
// emit the wire-format blob bit-identically.
type XRPUnsigned struct {
	Network       string
	Account       string
	Destination   string
	AmountDrops   int64
	FeeDrops      int64
	Sequence      uint32
	LastLedgerSeq uint32
	SigningPubKey []byte

	// SigningPayload is the 32-byte digest the MPC must sign.
	SigningPayload [32]byte

	// signCtx carries the rubblelabs-side opaque handle. Internal.
	signCtx *xrpl.SignCtx
}

// XRPSpec is the bridge's request to build an XRP Payment. It's
// orthogonal to the EVM SwapIntent — XRP doesn't have gas/value-wei
// shape. Callers (signing driver, refund driver) populate from the
// Swap record.
type XRPSpec struct {
	Network            string
	SenderAddress      string  // r-address (release-wallet)
	SenderPubKeyHex    string  // compressed-secp256k1 hex (33 bytes ⇒ 66 chars)
	DestinationAddress string  // recipient r-address
	AmountXRP          float64 // human-friendly (e.g. 1.0 = 1 XRP); converted to drops here
}

// =============================================================================
// Assembler XRP methods
// =============================================================================

// XRPProviderFor returns the XRP provider attached to the Assembler.
// Internal helper; nil-safe.
func (a *Assembler) XRPProviderFor() XRPProvider { return a.XRP }

// SetXRPNetwork registers per-chain XRP config. Convenience wrapper.
func (a *Assembler) SetXRPNetwork(network string, cfg XRPNetwork) {
	if a.XRPNetworks == nil {
		a.XRPNetworks = map[string]XRPNetwork{}
	}
	a.XRPNetworks[network] = cfg
}

// PreSignXRP builds an XRP Payment, computes the canonical signing
// digest, and returns an XRPUnsigned for the signing driver to hand
// to FinalizeXRP once the MPC signature is in.
//
// Sequence + fee come from the XRPProvider (rippled-side). The
// LastLedgerSequence is set to validated_ledger + LastLedgerWindow
// to bound tx-validity to ~80 seconds by default.
func (a *Assembler) PreSignXRP(ctx context.Context, in XRPSpec) (*XRPUnsigned, error) {
	if a.XRP == nil {
		return nil, errors.New("txassembler: XRP provider not configured")
	}
	if in.Network == "" {
		return nil, errors.New("txassembler: XRPSpec.Network required")
	}
	if in.SenderAddress == "" {
		return nil, errors.New("txassembler: XRPSpec.SenderAddress required")
	}
	if in.SenderPubKeyHex == "" {
		return nil, errors.New("txassembler: XRPSpec.SenderPubKeyHex required")
	}
	if in.DestinationAddress == "" {
		return nil, errors.New("txassembler: XRPSpec.DestinationAddress required")
	}
	if in.AmountXRP <= 0 {
		return nil, fmt.Errorf("txassembler: XRPSpec.AmountXRP must be > 0; got %v", in.AmountXRP)
	}

	pub, err := hex.DecodeString(in.SenderPubKeyHex)
	if err != nil {
		return nil, fmt.Errorf("txassembler: decode SenderPubKeyHex: %w", err)
	}

	cfg := a.XRPNetworks[in.Network] // zero-value is safe

	amountDrops, err := xrpFloatToDrops(in.AmountXRP)
	if err != nil {
		return nil, err
	}

	var feeDrops int64
	if cfg.DefaultFeeDrops > 0 {
		feeDrops = cfg.DefaultFeeDrops
	} else {
		feeDrops, err = a.XRP.SuggestFeeDrops(ctx, in.Network)
		if err != nil {
			return nil, fmt.Errorf("txassembler: XRP SuggestFeeDrops: %w", err)
		}
	}
	if feeDrops < xrpl.XRPLBaseFeeDrops {
		feeDrops = xrpl.XRPLBaseFeeDrops
	}

	seq, valLedger, err := a.XRP.AccountInfo(ctx, in.Network, in.SenderAddress)
	if err != nil {
		return nil, fmt.Errorf("txassembler: XRP AccountInfo: %w", err)
	}

	lastLedgerWindow := cfg.LastLedgerWindow
	if lastLedgerWindow == 0 {
		lastLedgerWindow = 20
	}
	var lastLedgerSeq uint32
	if valLedger > 0 {
		lastLedgerSeq = valLedger + lastLedgerWindow
	}

	var flags uint32
	if !cfg.OmitCanonicalSigFlag {
		flags = xrpl.CanonicalSigFlag
	}

	pu := xrpl.PaymentUnsigned{
		Account:            in.SenderAddress,
		Destination:        in.DestinationAddress,
		AmountDrops:        amountDrops,
		FeeDrops:           feeDrops,
		Sequence:           seq,
		LastLedgerSequence: lastLedgerSeq,
		SigningPubKey:      pub,
		Flags:              flags,
	}
	digest, signCtx, err := xrpl.PreSign(pu)
	if err != nil {
		return nil, fmt.Errorf("txassembler: xrpl.PreSign: %w", err)
	}
	u := &XRPUnsigned{
		Network:       in.Network,
		Account:       in.SenderAddress,
		Destination:   in.DestinationAddress,
		AmountDrops:   amountDrops,
		FeeDrops:      feeDrops,
		Sequence:      seq,
		LastLedgerSeq: lastLedgerSeq,
		SigningPubKey: pub,
		signCtx:       signCtx,
	}
	copy(u.SigningPayload[:], digest)
	return u, nil
}

// FinalizeXRP attaches the MPC signature (in concatenated 65-byte
// R||S||V hex form, same wire shape the dashboard /v1/mpc/sign returns
// for ECDSA) to the unsigned tx and returns:
//   - rawTxHex: hex-encoded signed-tx blob (the value the broadcast
//     driver feeds to broadcast.Broadcast via Swap.DestRawTx).
//   - txHash:   canonical XRPL transaction hash (uppercase hex).
//
// The V byte is ignored — XRPL doesn't need a recovery id (verifiers
// use the embedded SigningPubKey). The (r, s) pair is canonicalized
// to low-s and encoded as ASN.1 DER per XRPL spec.
func (a *Assembler) FinalizeXRP(u *XRPUnsigned, signatureHex string) (string, string, error) {
	if u == nil || u.signCtx == nil {
		return "", "", errors.New("txassembler: FinalizeXRP: nil XRPUnsigned")
	}
	if signatureHex == "" {
		return "", "", errors.New("txassembler: FinalizeXRP: empty signature")
	}
	// Parse the MPC's r/s. The dashboard returns r||s||v as 130 hex
	// chars; we use ParseRSV (same path the EVM driver uses) and
	// discard the recovery byte. Low-s canonicalization happens in
	// EncodeDERSignature; ParseRSV's own canonicalization is harmless
	// (lowering s further still yields a valid signature).
	r, s, _, err := ParseRSV(signatureHex)
	if err != nil {
		return "", "", fmt.Errorf("txassembler: parse MPC signature for XRP: %w", err)
	}
	der, err := xrpl.EncodeDERSignature(r, s)
	if err != nil {
		return "", "", fmt.Errorf("txassembler: DER-encode XRP signature: %w", err)
	}
	blob, hash, err := xrpl.Finalize(der, u.signCtx)
	if err != nil {
		return "", "", err
	}
	return hex.EncodeToString(blob), hash, nil
}

// =============================================================================
// Gas pre-check — XRP balance vs (value + fee + reserve)
// =============================================================================

// XRPRequiredDrops returns the drops a release wallet must hold to
// successfully execute this Payment without breaching the AccountRoot
// reserve. Caller compares this to AccountBalanceDrops:
//
//	required = AmountDrops + FeeDrops + XRPLBaseReserveDrops
//
// The base reserve (10 XRP currently) is added because XRPL deletes
// an AccountRoot that drops to zero — the release wallet stays alive
// only as long as its balance stays ≥ reserve.
func (u *XRPUnsigned) XRPRequiredDrops() int64 {
	return u.AmountDrops + u.FeeDrops + xrpl.XRPLBaseReserveDrops
}

// =============================================================================
// Amount conversion — XRP float → drops
// =============================================================================

// xrpFloatToDrops converts a human-friendly XRP amount (1.5 XRP) to
// drops (1500000). Uses the same string-formatting trick as floatToWei
// to avoid IEEE-754 imprecision at 6-decimal resolution.
//
// XRP has exactly 6 decimal places of native precision (1 drop = 1e-6 XRP),
// so the scaling is straightforward.
func xrpFloatToDrops(amount float64) (int64, error) {
	if amount <= 0 {
		return 0, fmt.Errorf("txassembler: XRP amount must be > 0; got %v", amount)
	}
	if amount != amount { // NaN
		return 0, errors.New("txassembler: XRP amount NaN")
	}
	if amount > math.MaxInt64/1e6 {
		return 0, fmt.Errorf("txassembler: XRP amount %v exceeds int64 drops range", amount)
	}
	// Format with 6 decimal places, then strip the dot and parse.
	s := strconv.FormatFloat(amount, 'f', 6, 64)
	intPart, fracPart, _ := splitDecimal(s)
	// Should be exactly 6 frac digits since we formatted with prec=6.
	for len(fracPart) < 6 {
		fracPart += "0"
	}
	if len(fracPart) > 6 {
		fracPart = fracPart[:6]
	}
	combined := intPart + fracPart
	combined = stripLeadingZeros(combined)
	if combined == "" {
		combined = "0"
	}
	n, ok := new(big.Int).SetString(combined, 10)
	if !ok {
		return 0, fmt.Errorf("txassembler: xrpFloatToDrops: parse %q failed", combined)
	}
	if !n.IsInt64() {
		return 0, fmt.Errorf("txassembler: xrpFloatToDrops: %v overflows int64", n)
	}
	return n.Int64(), nil
}
