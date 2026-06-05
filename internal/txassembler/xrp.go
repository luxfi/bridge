// XRP tx-assembly path for the bridge release + refund flow.
//
// Lifecycle, parallel to the TON pair (also ed25519-keyed, also
// PreSign / Finalize):
//
//  1. PreSignXRP — given a SwapIntent and the release wallet's
//     ed25519 PUBKEY (hex-encoded), query the XRPL provider for the
//     sender account's current sequence + open_ledger_fee, then build
//     an unsigned canonical Payment transaction. Return the bytes
//     the MPC cluster must ed25519-sign (already wrapped with the
//     "STX\0" single-sig prefix by xrp.Payment.SerializeForSigning).
//
//  2. The signing driver hex-encodes SigningBytes and calls
//     SignForWallet on the MPC client.
//
//  3. FinalizeXRP — given the XRPUnsigned plus the 64-byte ed25519
//     signature from the MPC cluster, attach the signature to the
//     Payment struct, re-serialize with TxnSignature included, and
//     return the wire-ready uppercase-hex tx_blob string for
//     XRPL submit RPC.
//
// Why is the ed25519 pubkey passed in via releasePubKeyHex (instead
// of being recovered from the r-address)? r-addresses are derived
// via SHA-256 → RIPEMD-160 — a one-way hash, so the address alone
// cannot recover the 32-byte pubkey. XRPL signed-tx serialization
// requires the raw 33-byte SigningPubKey (0xED prefix + 32 bytes)
// to verify against the AccountID. The bridge stores the pubkey on
// Wallet.PubKeyHex at keygen-time exactly like the TON wallet does.
//
// Native XRP only. IOU (issued currency) routing would need a
// different Amount encoding (the 64-byte non-XRP branch with
// currency code + issuer) and a much larger serializer; we'll add
// it when the tokens registry includes XRP-issued assets.

package txassembler

import (
	"context"
	"encoding/hex"
	"fmt"
	"math"

	"github.com/luxfi/bridge/internal/tokens"
	"github.com/luxfi/bridge/internal/xrp"
)

// XRPProvider is the on-chain interface PreSignXRP + FinalizeXRP +
// PreSignXRPRefund consume. Modeled as a small interface so unit
// tests can inject deterministic sequence/fee values without an
// actual XRPL connection. The production impl is *xrp.Provider.
type XRPProvider interface {
	// AccountInfo returns the live account state (current sequence +
	// drops balance). The bool result is false for accounts that don't
	// exist yet ("actNotFound"); release-side callers should treat
	// that as an error (can't send from an unfunded wallet), but the
	// refund path can use BalanceDrops's actNotFound→0 fallback.
	AccountInfo(ctx context.Context, networkInternalName, address string) (*xrp.AccountInfoResult, bool, error)
	// BalanceDrops is a convenience wrapper around AccountInfo. The
	// refund driver uses it to size the sweep value.
	BalanceDrops(ctx context.Context, networkInternalName, address string) (uint64, error)
	// ServerInfoFee returns the recommended open_ledger_fee in drops.
	// 12 drops is the long-standing default; loaded networks scale up.
	ServerInfoFee(ctx context.Context, networkInternalName string) (uint64, error)
	// SubmitBlob is consumed by the signing driver's broadcast step.
	// Returns the submit result containing the engine_result code +
	// tx_json.hash. Lifted into the assembler interface so the same
	// XRPProvider value can be threaded through end-to-end.
	SubmitBlob(ctx context.Context, networkInternalName, txBlobHex string) (*xrp.SubmitResult, error)
}

// XRPReserveDrops is the XRPL base reserve every account must keep
// to stay alive on the ledger. 2 XRP = 2_000_000 drops. Refund
// sweeps must leave at least this much in the deposit wallet, or
// the tx errors with `tecINSUFFICIENT_RESERVE`.
const XRPReserveDrops uint64 = 2_000_000

// xrpEd25519PubKeyPrefix is the 0xED byte that prepends a raw 32-byte
// ed25519 pubkey to form the 33-byte XRPL SigningPubKey blob.
const xrpEd25519PubKeyPrefix byte = 0xED

// XRPUnsigned is the assembler's output for an XRP destination
// release tx (or a source-chain refund). The SigningBytes are what
// the MPC cluster ed25519-signs; FinalizeXRP attaches the signature
// to the inner Payment and re-serializes.
type XRPUnsigned struct {
	// Network is the destination internal_name (e.g. XRP_TESTNET).
	Network string

	// Inner carries the Payment struct fields the finalize step needs.
	// Treat as opaque outside the assembler — its fields are internal
	// to package xrp.
	Inner *xrp.Payment

	// SigningBytes are the canonical serialized payload prefixed with
	// "STX\0". PASS THESE BYTES VERBATIM TO THE MPC CLUSTER — ed25519
	// hashes internally; do not SHA-256 first.
	SigningBytes []byte

	// Recipient + AmountDrops are surfaced for logging so the driver
	// can emit structured status updates without poking at the inner
	// Payment struct.
	Recipient   string
	AmountDrops uint64
	FeeDrops    uint64
	Sequence    uint32
}

// PreSignXRP builds an unsigned native-XRP Payment from a release
// wallet to a user-supplied destination r-address. SwapIntent fields:
//
//   - SenderAddress is the release wallet's r-address (same value as
//     mchain.Wallet.Address after the XRP derivation).
//   - DestinationAddress is the user's r-address.
//   - DestinationAsset must be the native ticker (XRP). Non-native
//     (IOU / issued-currency) routing is rejected so silent
//     mis-routes can't happen.
//   - Amount is the human-readable amount (e.g. 1.5 = 1.5 XRP).
//
// releasePubKeyHex is the raw 32-byte ed25519 pubkey, hex-encoded —
// captured by mchain.KeygenForDeposit on the Wallet.PubKeyHex field
// for AddressTypeXRP wallets.
func (a *Assembler) PreSignXRP(
	ctx context.Context,
	in SwapIntent,
	provider XRPProvider,
	releasePubKeyHex string,
) (*XRPUnsigned, error) {
	if provider == nil {
		return nil, fmt.Errorf("txassembler: XRP provider required")
	}
	pubKey, err := decodeEd25519XRP(releasePubKeyHex)
	if err != nil {
		return nil, fmt.Errorf("txassembler: release pubkey: %w", err)
	}

	// Resolve destination asset → must be native for now. IOU
	// (issued-currency) transfers need a 64-byte Amount encoding and
	// trust-line setup on the destination account; reject loudly so
	// we don't silently produce a tx that routes nothing.
	var tokenInfo *tokens.Info
	if a.Tokens != nil && in.DestinationAsset != "" {
		if info, ok := a.Tokens.Lookup(in.DestinationNetwork, in.DestinationAsset); ok {
			tokenInfo = info
		}
	}
	if tokenInfo != nil && !tokenInfo.IsNative() {
		return nil, fmt.Errorf(
			"txassembler: XRPL issued-currency (IOU) transfers not implemented yet (asset %s on %s)",
			in.DestinationAsset, in.DestinationNetwork,
		)
	}
	decimals := uint8(6) // XRP is 6 decimals (drops)
	if tokenInfo != nil {
		if tokenInfo.Decimals < 0 || tokenInfo.Decimals > 255 {
			return nil, fmt.Errorf("decimals out of range for asset %s/%s: %d",
				in.DestinationNetwork, in.DestinationAsset, tokenInfo.Decimals)
		}
		decimals = uint8(tokenInfo.Decimals)
	}

	amountDrops, err := floatToBaseUnits(in.Amount, decimals)
	if err != nil {
		return nil, fmt.Errorf("amount: %w", err)
	}
	if amountDrops == 0 {
		return nil, fmt.Errorf("txassembler: amount rounds to zero drops")
	}

	info, ok, err := provider.AccountInfo(ctx, in.DestinationNetwork, in.SenderAddress)
	if err != nil {
		return nil, fmt.Errorf("AccountInfo(%s): %w", in.SenderAddress, err)
	}
	if !ok {
		return nil, fmt.Errorf("release wallet %s not funded on %s (actNotFound)",
			in.SenderAddress, in.DestinationNetwork)
	}
	feeDrops, err := provider.ServerInfoFee(ctx, in.DestinationNetwork)
	if err != nil {
		return nil, fmt.Errorf("ServerInfoFee: %w", err)
	}

	pay := &xrp.Payment{
		Account:        in.SenderAddress,
		Destination:    in.DestinationAddress,
		AmountDrops:    amountDrops,
		FeeDrops:       feeDrops,
		Sequence:       info.AccountData.Sequence,
		Flags:          0, // tfFullyCanonicalSig is secp256k1-only; ed25519 ignores
		SigningPubKey:  pubKey,
		DestinationTag: in.DestinationTag,
	}
	signing, err := pay.SerializeForSigning()
	if err != nil {
		return nil, fmt.Errorf("SerializeForSigning: %w", err)
	}

	return &XRPUnsigned{
		Network:      in.DestinationNetwork,
		Inner:        pay,
		SigningBytes: signing,
		Recipient:    in.DestinationAddress,
		AmountDrops:  amountDrops,
		FeeDrops:     feeDrops,
		Sequence:     info.AccountData.Sequence,
	}, nil
}

// FinalizeXRP takes an XRPUnsigned and the 64-byte ed25519 signature
// produced by the MPC cluster, and returns the uppercase-hex tx_blob
// ready for XRPProvider.SubmitBlob. Wraps xrp.Payment.SerializeHex
// to keep the assembler the single boundary into package xrp.
func (a *Assembler) FinalizeXRP(u *XRPUnsigned, signature []byte) (string, error) {
	if u == nil {
		return "", fmt.Errorf("txassembler: nil XRPUnsigned")
	}
	if len(signature) != 64 {
		return "", fmt.Errorf("txassembler: XRP ed25519 signature must be 64 bytes, got %d", len(signature))
	}
	u.Inner.TxnSignature = signature
	return u.Inner.SerializeHex()
}

// PreSignXRPRefund mirrors PreSignTONRefund for the XRP source path.
// Builds an unsigned Payment FROM the per-swap deposit wallet TO the
// user's original sender address, sweeping the deposit balance
// minus the 2 XRP reserve minus the network fee.
//
// Arguments:
//   - sourceNetwork — XRP_TESTNET / XRP_MAINNET (echoed for logging).
//   - depositPubKeyHex — raw ed25519 pubkey of the deposit wallet
//     (from Wallet.PubKeyHex / Swap.DepositPubKey).
//   - depositAddress — the deposit wallet's r-address.
//   - recipientAddress — user's source-chain r-address (Swap.Sender).
//   - sweepDrops — refund value AFTER subtracting reserve + fee. The
//     caller is responsible for the subtraction so the refund driver
//     stays in charge of "leave reserve" policy. PreSignXRPRefund
//     additionally asserts that BalanceDrops - sweepDrops >= reserve +
//     fee so a buggy caller can't accidentally close the account.
//   - provider — XRPProvider for sequence + fee + balance reads.
//
// No tokens registry lookup — refunds always return the same asset
// the user deposited, native XRP.
func (a *Assembler) PreSignXRPRefund(
	ctx context.Context,
	sourceNetwork, depositPubKeyHex, depositAddress, recipientAddress string,
	sweepDrops uint64,
	provider XRPProvider,
) (*XRPUnsigned, error) {
	if provider == nil {
		return nil, fmt.Errorf("txassembler: XRP provider required for refund")
	}
	if sweepDrops == 0 {
		return nil, fmt.Errorf("txassembler: refund amount must be > 0")
	}
	pubKey, err := decodeEd25519XRP(depositPubKeyHex)
	if err != nil {
		return nil, fmt.Errorf("txassembler: deposit pubkey: %w", err)
	}

	info, ok, err := provider.AccountInfo(ctx, sourceNetwork, depositAddress)
	if err != nil {
		return nil, fmt.Errorf("AccountInfo(%s): %w", depositAddress, err)
	}
	if !ok {
		return nil, fmt.Errorf("deposit wallet %s not funded on %s (actNotFound)",
			depositAddress, sourceNetwork)
	}
	balance, err := parseDrops(info.AccountData.Balance)
	if err != nil {
		return nil, fmt.Errorf("parse balance %q: %w", info.AccountData.Balance, err)
	}
	feeDrops, err := provider.ServerInfoFee(ctx, sourceNetwork)
	if err != nil {
		return nil, fmt.Errorf("ServerInfoFee: %w", err)
	}

	// Safety: ensure the wallet retains >= reserve after the sweep.
	// tx fee is debited on top of the sweep amount, so the post-tx
	// remaining balance is (balance - sweepDrops - feeDrops).
	if balance < sweepDrops+feeDrops+XRPReserveDrops {
		return nil, fmt.Errorf(
			"refund sweep would close account: balance=%d sweep=%d fee=%d reserve=%d",
			balance, sweepDrops, feeDrops, XRPReserveDrops,
		)
	}

	pay := &xrp.Payment{
		Account:       depositAddress,
		Destination:   recipientAddress,
		AmountDrops:   sweepDrops,
		FeeDrops:      feeDrops,
		Sequence:      info.AccountData.Sequence,
		Flags:         0,
		SigningPubKey: pubKey,
	}
	signing, err := pay.SerializeForSigning()
	if err != nil {
		return nil, fmt.Errorf("SerializeForSigning (refund): %w", err)
	}

	return &XRPUnsigned{
		Network:      sourceNetwork,
		Inner:        pay,
		SigningBytes: signing,
		Recipient:    recipientAddress,
		AmountDrops:  sweepDrops,
		FeeDrops:     feeDrops,
		Sequence:     info.AccountData.Sequence,
	}, nil
}

// decodeEd25519XRP parses a hex-encoded 32-byte ed25519 pubkey and
// prepends the 0xED prefix byte the XRPL SigningPubKey field expects.
// Returns a 33-byte slice.
//
// Accepts the raw 32-byte hex (the form mchain.Wallet.PubKeyHex
// captures), 0x-prefixed or not. Already-prefixed 33-byte 0xED hex
// is also accepted — the function detects it and returns as-is so
// callers don't have to know which form they hold.
func decodeEd25519XRP(s string) ([]byte, error) {
	if s == "" {
		return nil, fmt.Errorf("empty pubkey hex")
	}
	if len(s) >= 2 && (s[0:2] == "0x" || s[0:2] == "0X") {
		s = s[2:]
	}
	raw, err := hex.DecodeString(s)
	if err != nil {
		return nil, fmt.Errorf("decode hex: %w", err)
	}
	switch len(raw) {
	case 32:
		out := make([]byte, 33)
		out[0] = xrpEd25519PubKeyPrefix
		copy(out[1:], raw)
		return out, nil
	case 33:
		if raw[0] != xrpEd25519PubKeyPrefix {
			return nil, fmt.Errorf("33-byte pubkey must have 0xED prefix, got 0x%02x", raw[0])
		}
		return raw, nil
	default:
		return nil, fmt.Errorf("want 32 or 33 bytes, got %d", len(raw))
	}
}

// parseDrops converts an XRPL balance string (decimal drops as
// returned by account_info) into uint64. Errors loudly on overflow
// or non-numeric input — XRPL never returns scientific notation or
// fractional drops, so a parse failure is a real protocol mismatch.
func parseDrops(s string) (uint64, error) {
	var n uint64
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c < '0' || c > '9' {
			return 0, fmt.Errorf("non-digit %q at pos %d", c, i)
		}
		d := uint64(c - '0')
		if n > (math.MaxUint64-d)/10 {
			return 0, fmt.Errorf("overflow")
		}
		n = n*10 + d
	}
	return n, nil
}
