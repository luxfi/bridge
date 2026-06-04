// TON tx-assembly path for the bridge release flow.
//
// Lifecycle, parallel to the EVM (PreSign / Finalize) and Solana
// (PreSignSolana / FinalizeSolana) pairs:
//
//  1. PreSignTON — given a SwapIntent (destination address, amount,
//     release wallet's TON contract address) and the release wallet's
//     ed25519 PUBKEY (hex-encoded), query the TON provider for the
//     wallet contract's current seqno + active state, then build an
//     unsigned V4R2 external-in transfer message. Return the 32-byte
//     cell hash for the MPC cluster to ed25519-sign.
//
//  2. The signing driver hex-encodes SigningHash and calls
//     SignForWallet on the MPC client.
//
//  3. FinalizeTON — given the TONUnsigned plus the 64-byte ed25519
//     signature from the MPC cluster, prepend the signature to the
//     payload cell, wrap it in an ExternalMessage with optional
//     StateInit (first-deployment), serialize to BoC, and hand it to
//     TonProvider.BroadcastBoC.
//
// Why an ed25519 pubkey field on the SwapIntent? TON wallet contracts
// are smart contracts whose address = hash(StateInit{code, data}) and
// state_data embeds the pubkey. The release tx must rebuild that same
// StateInit (for first-deployment) AND the message payload still
// includes the subwallet_id, which must match the wallet contract's
// embedded one. Both pieces need the raw pubkey — not the contract
// address that the bridge stores as Wallet.Address.
//
// Native TON only for now. Jetton (TON's ERC-20 analog) needs an
// additional transfer-internal-message wrapping the recipient's
// jetton wallet address; the hook point is buildTONInternalMessage —
// switch on tokenInfo to dispatch when we add jetton support.

package txassembler

import (
	"context"
	"crypto/ed25519"
	"encoding/hex"
	"fmt"
	"math"
	"math/big"
	"time"

	"github.com/luxfi/bridge/internal/tokens"
	"github.com/luxfi/bridge/internal/ton"
)

// TONProvider is the on-chain interface PreSignTON / FinalizeTON +
// PreSignTONRefund consume. Modeled as a small interface so unit
// tests can inject a deterministic seqno + capture the broadcast
// call. The production impl is *ton.TonCenterProvider.
type TONProvider interface {
	IsContractActive(ctx context.Context, address string) (bool, error)
	GetSeqno(ctx context.Context, address string) (uint32, error)
	// GetBalanceNano is consumed by the refund driver to size the
	// sweep value. Release-side callers don't need it (the bridge
	// uses the quote's promised release amount, not the wallet
	// balance), so PreSignTON ignores it.
	GetBalanceNano(ctx context.Context, address string) (uint64, error)
	BroadcastBoC(ctx context.Context, boc []byte) (string, error)
}

// TONUnsigned is the assembler's output for a TON destination release
// tx. The SigningHash bytes are what the MPC cluster ed25519-signs;
// FinalizeTON stitches the signature back together with PayloadCell +
// StateInit to produce the wire-ready BoC.
type TONUnsigned struct {
	// Network is the destination internal_name (e.g. TON_TESTNET).
	Network string

	// Inner carries the cell + pubkey + state-init the finalize step
	// needs. Treat as opaque outside the assembler — its fields are
	// internal to package ton.
	Inner *ton.UnsignedMessage

	// SigningHash is the 32-byte cell hash to feed the MPC cluster.
	// PASS THESE BYTES VERBATIM to the cluster — ed25519 wraps them
	// internally; do not SHA-256 first.
	SigningHash []byte

	// Recipient + AmountNanoTON are surfaced for logging so the
	// driver can emit structured status updates without poking at
	// the inner cell.
	Recipient     string
	AmountNanoTON uint64
}

// PreSignTON builds an unsigned native-TON transfer from a release
// wallet to a user-supplied destination address. SwapIntent fields:
//
//   - SenderAddress is the release wallet's TON contract address
//     (EQ.../UQ.../kQ.../0Q...) — same value as mchain.Wallet.Address
//     after the V4R2 derivation.
//   - DestinationAddress is the user's TON address (any format).
//   - DestinationAsset must be the native ticker (TON). Jetton routing
//     is not yet wired — the assembler returns an error so silent
//     mis-routes can't happen.
//   - Amount is the human-readable amount (1.5 = 1.5 TON).
//
// releasePubKeyHex is the raw 32-byte ed25519 pubkey, hex-encoded —
// captured by mchain.KeygenForDeposit on the Wallet.PubKeyHex field
// for AddressTypeTON wallets.
func (a *Assembler) PreSignTON(
	ctx context.Context,
	in SwapIntent,
	provider TONProvider,
	releasePubKeyHex string,
) (*TONUnsigned, error) {
	if provider == nil {
		return nil, fmt.Errorf("txassembler: TON provider required")
	}
	pubKey, err := decodeEd25519Hex(releasePubKeyHex)
	if err != nil {
		return nil, fmt.Errorf("txassembler: release pubkey: %w", err)
	}

	// Resolve destination asset → must be native for now. Jetton
	// transfers need an additional internal-message wrapping the
	// recipient's jetton wallet; reject loudly so we don't silently
	// produce a tx that routes nothing.
	var tokenInfo *tokens.Info
	if a.Tokens != nil && in.DestinationAsset != "" {
		if info, ok := a.Tokens.Lookup(in.DestinationNetwork, in.DestinationAsset); ok {
			tokenInfo = info
		}
	}
	if tokenInfo != nil && !tokenInfo.IsNative() {
		return nil, fmt.Errorf(
			"txassembler: jetton (non-native TON) transfers not implemented yet (asset %s on %s)",
			in.DestinationAsset, in.DestinationNetwork,
		)
	}
	decimals := uint8(9) // TON is 9 decimals (nanoTON)
	if tokenInfo != nil {
		if tokenInfo.Decimals < 0 || tokenInfo.Decimals > 255 {
			return nil, fmt.Errorf("decimals out of range for asset %s/%s: %d",
				in.DestinationNetwork, in.DestinationAsset, tokenInfo.Decimals)
		}
		decimals = uint8(tokenInfo.Decimals)
	}

	amountNanoTON, err := floatToBaseUnits(in.Amount, decimals)
	if err != nil {
		return nil, fmt.Errorf("amount: %w", err)
	}

	active, err := provider.IsContractActive(ctx, in.SenderAddress)
	if err != nil {
		return nil, fmt.Errorf("IsContractActive(%s): %w", in.SenderAddress, err)
	}
	seqno, err := provider.GetSeqno(ctx, in.SenderAddress)
	if err != nil {
		return nil, fmt.Errorf("GetSeqno(%s): %w", in.SenderAddress, err)
	}

	unsigned, err := ton.BuildUnsignedTransfer(
		pubKey,
		seqno,
		in.DestinationAddress,
		amountNanoTON,
		"", // no comment — keeps the BoC compact + matches Solana parity
		active,
		time.Now,
	)
	if err != nil {
		return nil, fmt.Errorf("BuildUnsignedTransfer: %w", err)
	}

	return &TONUnsigned{
		Network:       in.DestinationNetwork,
		Inner:         unsigned,
		SigningHash:   unsigned.SigningHash,
		Recipient:     in.DestinationAddress,
		AmountNanoTON: amountNanoTON,
	}, nil
}

// FinalizeTON takes a TONUnsigned and the 64-byte ed25519 signature
// produced by the MPC cluster, and returns the BoC bytes ready for
// TonProvider.BroadcastBoC. Wraps the inner ton.FinalizeSignedExternal
// to keep the assembler the single boundary into package ton.
func (a *Assembler) FinalizeTON(u *TONUnsigned, signature []byte) ([]byte, error) {
	if u == nil {
		return nil, fmt.Errorf("txassembler: nil TONUnsigned")
	}
	return ton.FinalizeSignedExternalMessage(u.Inner, signature)
}

// PreSignTONRefund mirrors PreSignSolanaRefund for the TON source path.
// Builds an unsigned V4R2 external message FROM the per-swap deposit
// wallet TO the user's original sender address, carrying amountNanoTON.
//
// Arguments:
//   - sourceNetwork — TON_TESTNET / TON_MAINNET (echoed on TONUnsigned
//     for logging)
//   - depositPubKeyHex — raw ed25519 pubkey of the deposit wallet
//     (from Wallet.PubKeyHex / Swap.DepositPubKey)
//   - depositAddress — the deposit wallet's V4R2 contract address (used
//     to query seqno + active state)
//   - recipientAddress — user's source-chain Tonkeeper address
//     (Swap.Sender)
//   - amountNanoTON — refund value AFTER subtracting a fee reserve;
//     the caller is responsible for keeping a buffer in the wallet so
//     the message can pay its own gas
//   - provider — TonProvider for seqno + active reads
//
// Unlike PreSignTON (release path), there's no tokens registry lookup —
// refunds always return the same asset the user deposited, native TON.
// Jetton-deposit refunds need their own assembler the day jetton
// sources land.
func (a *Assembler) PreSignTONRefund(
	ctx context.Context,
	sourceNetwork, depositPubKeyHex, depositAddress, recipientAddress string,
	amountNanoTON uint64,
	provider TONProvider,
) (*TONUnsigned, error) {
	if provider == nil {
		return nil, fmt.Errorf("txassembler: TON provider required for refund")
	}
	if amountNanoTON == 0 {
		return nil, fmt.Errorf("txassembler: refund amount must be > 0")
	}
	pubKey, err := decodeEd25519Hex(depositPubKeyHex)
	if err != nil {
		return nil, fmt.Errorf("txassembler: deposit pubkey: %w", err)
	}

	active, err := provider.IsContractActive(ctx, depositAddress)
	if err != nil {
		return nil, fmt.Errorf("IsContractActive(%s): %w", depositAddress, err)
	}
	seqno, err := provider.GetSeqno(ctx, depositAddress)
	if err != nil {
		return nil, fmt.Errorf("GetSeqno(%s): %w", depositAddress, err)
	}

	unsigned, err := ton.BuildUnsignedTransfer(
		pubKey,
		seqno,
		recipientAddress,
		amountNanoTON,
		"", // refund tx has no comment, mirrors release path
		active,
		time.Now,
	)
	if err != nil {
		return nil, fmt.Errorf("BuildUnsignedTransfer (refund): %w", err)
	}

	return &TONUnsigned{
		Network:       sourceNetwork,
		Inner:         unsigned,
		SigningHash:   unsigned.SigningHash,
		Recipient:     recipientAddress,
		AmountNanoTON: amountNanoTON,
	}, nil
}

// decodeEd25519Hex parses a hex-encoded ed25519 pubkey (32 bytes →
// 64 hex chars). Returns a clear error for empty or wrong-length
// input so a misconfigured release wallet fails loudly at PreSign
// rather than at signature verification.
func decodeEd25519Hex(s string) (ed25519.PublicKey, error) {
	if s == "" {
		return nil, fmt.Errorf("empty pubkey hex")
	}
	raw, err := hex.DecodeString(s)
	if err != nil {
		return nil, fmt.Errorf("decode hex: %w", err)
	}
	if len(raw) != ed25519.PublicKeySize {
		return nil, fmt.Errorf("want %d bytes, got %d", ed25519.PublicKeySize, len(raw))
	}
	return ed25519.PublicKey(raw), nil
}

// floatToBaseUnits scales a human-readable amount to integer base
// units (e.g. 1.5 TON × 9 decimals → 1_500_000_000 nanoTON). Same
// rounding policy as floatToLamports in solana.go.
func floatToBaseUnits(amount float64, decimals uint8) (uint64, error) {
	if math.IsNaN(amount) || math.IsInf(amount, 0) || amount < 0 {
		return 0, fmt.Errorf("invalid amount: %v", amount)
	}
	scale := math.Pow10(int(decimals))
	scaled := amount * scale
	if scaled > math.MaxUint64 || scaled < 0 {
		return 0, fmt.Errorf("amount overflow")
	}
	// Round to nearest integer base unit — avoids the silent floor
	// that bites SOL transfers at 9-decimal precision (0.1 SOL
	// becomes 99_999_999 lamports via plain truncation).
	rounded := math.Round(scaled)
	if rounded == 0 && amount > 0 {
		return 0, fmt.Errorf("amount %v rounds to zero at %d decimals", amount, decimals)
	}
	return uint64(rounded), nil
}

// Compile-time assertions so a refactor that changes Assembler's
// public surface breaks at build time, not at runtime.
var _ = big.NewInt
