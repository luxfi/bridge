// BTC tx-assembly path for the bridge's destination-release flow.
//
// Lifecycle, parallel to the XRP pair:
//
//  1. PreSignBTC — given a SwapIntent (destination network, asset,
//     recipient address, human-readable amount) and the release
//     wallet's identity (address + compressed pubkey), query the BTC
//     provider for the wallet's UTXOs and the network's recommended
//     fee, pick the largest confirmed UTXO, build an unsigned
//     payment, and return the 32-byte legacy ECDSA sighash the MPC
//     cluster must sign.
//
//  2. The signing driver hex-encodes the sighash and calls
//     SignForWallet on the MPC client (secp256k1, no key derivation
//     needed — the release wallet's key is already provisioned).
//
//  3. FinalizeBTC — given the BTCUnsigned plus the 64-byte (r||s)
//     signature, DER-encode it, assemble the input scriptSig, and
//     return the wire-ready raw transaction (hex) plus its txid
//     (display-form, big-endian).
//
// Why a separate file rather than extending xrp.go: BTC's preimage
// is genuinely different (legacy sighash for P2PKH inputs vs ed25519
// signing for XRPL), so the codepath stays cleaner as its own
// assembler method.
//
// Refund path (PreSignBTCRefund) is intentionally NOT included in
// this first pass. The bridge today supports BTC as a SOURCE, and
// refund-of-source-BTC is a separate item — when added it goes in
// internal/btc/payment.go + a sibling PreSignBTCRefund here.

package txassembler

import (
	"context"
	"encoding/hex"
	"fmt"

	"github.com/luxfi/bridge/internal/btc"
	"github.com/luxfi/bridge/internal/tokens"
)

// BTCProvider is the on-chain interface PreSignBTC + the broadcast
// driver consume. Small surface so unit tests can inject deterministic
// UTXO / fee values without an HTTP server. The production impl is
// *btc.Provider, which talks to mempool.space.
type BTCProvider interface {
	// ListUTXOs returns the address's confirmed UTXOs, sorted by
	// value descending (largest first). Unconfirmed mempool entries
	// are filtered out so we never spend a deposit the operator
	// hasn't seen on-chain yet.
	ListUTXOs(ctx context.Context, network, address string) ([]btc.UTXO, error)
	// RecommendedFees returns sat/vB values from the upstream node.
	// PreSignBTC scales the half-hour value by the tx's estimated
	// vsize to pick an on-chain fee.
	RecommendedFees(ctx context.Context, network string) (*btc.FeeRates, error)
	// Broadcast submits a raw hex tx and returns the txid. Consumed
	// by the broadcast driver, not PreSignBTC — but lifted into the
	// same interface so one provider value threads through end-to-end.
	Broadcast(ctx context.Context, network, rawHex string) (string, error)
}

// BTCUnsigned is the assembler's intermediate state for a BTC
// release tx. Inner carries the chain-package Payment that
// FinalizeBTC will mutate with the signature; SigHash is the
// pre-computed 32-byte legacy ECDSA digest the MPC cluster signs.
//
// FeeSats / RecipientSats / ChangeSats / Recipient are surfaced for
// the signing driver to log without poking at Inner.
type BTCUnsigned struct {
	Network       string
	Inner         *btc.Payment
	SigHash       [32]byte
	Recipient     string
	RecipientSats uint64
	ChangeSats    uint64
	FeeSats       uint64
	// FeeRate is the effective sat/vB this tx pays (FeeSats / vsize,
	// rounded up, after the min-fee floor and any dust-swept change).
	// The signing driver persists it on Swap.LastFeeRate so a later RBF
	// rebuild can bump strictly above it. Zero on the refund path.
	FeeRate  uint64
	PrevTxID string
	PrevVout uint32
}

// estimatedRefundVsize is the vsize for a one-input single-output
// legacy P2PKH sweep tx (what the refund path produces). Tighter
// than the destination's two-output estimate so the user gets back
// more of their deposit.
const estimatedRefundVsize uint64 = 200

// estimatedVsize is a conservative virtual size for our one-input
// (P2PKH legacy) + at-most-two-output tx shape. Legacy P2PKH
// transactions don't get the witness discount, so vsize == size:
//
//	~10 bytes overhead (version 4, lock 4, varint counts ~2)
//	148 bytes per legacy P2PKH input (32+4+1+107+4)
//	~34 bytes per output (8 value + 1 varint + ~25 script for P2PKH/P2WPKH)
//
// Single in + two outs ≈ 10 + 148 + 34 + 34 = 226. Round up to 250
// for safety so the fee covers the actual broadcast.
const estimatedVsize uint64 = 250

// minRecipientSats is the BTC consensus dust threshold for P2WPKH/
// P2PKH outputs (546 sats). Recipients below this would error at
// broadcast with "dust" — surface as a build-time error instead.
const minRecipientSats uint64 = 546

// PreSignBTC builds an unsigned BTC release tx and returns the
// sighash the MPC cluster must ECDSA-sign. SwapIntent fields:
//
//   - DestinationNetwork must be BITCOIN_MAINNET or BITCOIN_TESTNET.
//   - DestinationAddress is the user's recipient (any of P2PKH /
//     P2SH / P2WPKH / P2WSH for the same network).
//   - DestinationAsset must be the native ticker (BTC). IOU /
//     wrapped-BTC routing is not implemented.
//   - Amount is the human-readable BTC amount.
//   - SenderAddress is the release wallet's P2PKH address (where the
//     UTXOs we'll spend live).
//
// releasePubKeyHex is the 33-byte compressed secp256k1 pubkey of the
// release wallet, hex-encoded. mpcd populates Wallet.PubKeyHex on
// keygen; the bridge stores it on Swap.ReleasePubKey.
func (a *Assembler) PreSignBTC(
	ctx context.Context,
	in SwapIntent,
	provider BTCProvider,
	releasePubKeyHex string,
) (*BTCUnsigned, error) {
	if provider == nil {
		return nil, fmt.Errorf("txassembler: BTC provider required")
	}
	params, ok := btc.ParamsFor(in.DestinationNetwork)
	if !ok {
		return nil, fmt.Errorf("txassembler: unknown BTC network %q", in.DestinationNetwork)
	}

	// Asset must be native BTC. Wrapped-BTC (WBTC, BRC-20, Runes)
	// routing would need a different output script and an issuer
	// trust model; reject loudly so we don't silently mis-route.
	var tokenInfo *tokens.Info
	if a.Tokens != nil && in.DestinationAsset != "" {
		if info, ok := a.Tokens.Lookup(in.DestinationNetwork, in.DestinationAsset); ok {
			tokenInfo = info
		}
	}
	if tokenInfo != nil && !tokenInfo.IsNative() {
		return nil, fmt.Errorf(
			"txassembler: BTC non-native asset routing not implemented (asset %s on %s)",
			in.DestinationAsset, in.DestinationNetwork,
		)
	}
	decimals := uint8(8) // BTC is 8 decimals (sats)
	if tokenInfo != nil {
		if tokenInfo.Decimals < 0 || tokenInfo.Decimals > 255 {
			return nil, fmt.Errorf("decimals out of range for asset %s/%s: %d",
				in.DestinationNetwork, in.DestinationAsset, tokenInfo.Decimals)
		}
		decimals = uint8(tokenInfo.Decimals)
	}
	amountSats, err := floatToBaseUnits(in.Amount, decimals)
	if err != nil {
		return nil, fmt.Errorf("amount: %w", err)
	}
	if amountSats < minRecipientSats {
		return nil, fmt.Errorf("txassembler: amount %d sats below %d-sat dust threshold",
			amountSats, minRecipientSats)
	}

	// Decode addresses against the destination network so a
	// wrong-network address (mainnet recipient on testnet, etc.)
	// fails before we touch UTXOs.
	recipientDecoded, err := btc.DecodeAddress(in.DestinationAddress, params)
	if err != nil {
		return nil, fmt.Errorf("DestinationAddress: %w", err)
	}
	senderDecoded, err := btc.DecodeAddress(in.SenderAddress, params)
	if err != nil {
		return nil, fmt.Errorf("SenderAddress (release wallet): %w", err)
	}
	if senderDecoded.Kind != btc.ScriptP2PKH {
		return nil, fmt.Errorf("txassembler: release wallet must be P2PKH, got %s (%s)",
			senderDecoded.Kind, in.SenderAddress)
	}

	// Pubkey: hex → 33 bytes. We validate that hash160(pubkey)
	// matches the release wallet's hash160 — otherwise the signature
	// the cluster produces won't verify against the scriptPubKey
	// we're about to spend.
	pubKey, err := decodeCompressedSecp256k1(releasePubKeyHex)
	if err != nil {
		return nil, fmt.Errorf("txassembler: release pubkey: %w", err)
	}
	if !btcHash160Match(pubKey, senderDecoded.Hash) {
		return nil, fmt.Errorf("txassembler: release pubkey hash160 does not match release address %s", in.SenderAddress)
	}

	// Pick the largest confirmed UTXO. Multi-input consolidation is
	// a future extension; for now reject if no single UTXO can fund
	// the requested amount + minimum fee.
	utxos, err := provider.ListUTXOs(ctx, in.DestinationNetwork, in.SenderAddress)
	if err != nil {
		return nil, fmt.Errorf("ListUTXOs(%s): %w", in.SenderAddress, err)
	}
	if len(utxos) == 0 {
		return nil, fmt.Errorf("txassembler: release wallet %s has no confirmed UTXOs", in.SenderAddress)
	}

	fees, err := provider.RecommendedFees(ctx, in.DestinationNetwork)
	if err != nil {
		return nil, fmt.Errorf("RecommendedFees: %w", err)
	}
	// Half-hour fee gives us a 1–2 block target without overpaying.
	// Floor at 1 sat/vB so a misconfigured testnet endpoint can't
	// return 0 and brick the assembler.
	feeRate := fees.HalfHour
	if feeRate == 0 {
		feeRate = 1
	}
	// RBF replacement floor: on a rebuild the caller passes the prior
	// attempt's (already-bumped) feerate as MinFeeRate. Honour it even
	// when the live mempool estimate has since dropped, otherwise the
	// replacement wouldn't out-bid the stuck tx and the node rejects it
	// with "insufficient fee" (BIP-125). max() so a genuinely risen
	// market still wins when it exceeds the floor.
	if in.MinFeeRate > feeRate {
		feeRate = in.MinFeeRate
	}
	feeSats := feeRate * estimatedVsize
	if feeSats < 250 {
		feeSats = 250 // upstream min relay fee threshold
	}

	var spend btc.UTXO
	for _, u := range utxos {
		if u.Value >= amountSats+feeSats+minRecipientSats {
			spend = u
			break
		}
	}
	if spend.Value == 0 {
		return nil, fmt.Errorf("txassembler: no single UTXO >= %d sats (need amount %d + fee %d + change dust %d); largest is %d",
			amountSats+feeSats+minRecipientSats, amountSats, feeSats, minRecipientSats, utxos[0].Value)
	}
	change := spend.Value - amountSats - feeSats
	// If the change would be dust, sweep it into the fee instead of
	// emitting a sub-dust output.
	var changeScript []byte
	if change < minRecipientSats {
		feeSats += change
		change = 0
	} else {
		changeScript = senderDecoded.ScriptPubKey
	}

	prevTxIDBytes, err := hex.DecodeString(spend.TxID)
	if err != nil || len(prevTxIDBytes) != 32 {
		return nil, fmt.Errorf("txassembler: invalid UTXO txid %q", spend.TxID)
	}
	var prevTxID [32]byte
	copy(prevTxID[:], prevTxIDBytes)

	pay := &btc.Payment{
		PrevTxID:        prevTxID,
		PrevVout:        spend.Vout,
		PrevValue:       spend.Value,
		PrevScript:      senderDecoded.ScriptPubKey,
		PubKey:          pubKey,
		RecipientScript: recipientDecoded.ScriptPubKey,
		RecipientValue:  amountSats,
		ChangeScript:    changeScript,
		ChangeValue:     change,
	}
	sigHash, err := pay.SigHash()
	if err != nil {
		return nil, fmt.Errorf("SigHash: %w", err)
	}

	// Effective feerate the tx actually pays (post dust-sweep + floor),
	// rounded up so the persisted value never understates the on-chain
	// fee — the next RBF bump must beat what this tx really paid.
	effFeeRate := (feeSats + estimatedVsize - 1) / estimatedVsize

	return &BTCUnsigned{
		Network:       in.DestinationNetwork,
		Inner:         pay,
		SigHash:       sigHash,
		Recipient:     in.DestinationAddress,
		RecipientSats: amountSats,
		ChangeSats:    change,
		FeeSats:       feeSats,
		FeeRate:       effFeeRate,
		PrevTxID:      spend.TxID,
		PrevVout:      spend.Vout,
	}, nil
}

// FinalizeBTC attaches the MPC-cluster signature to the unsigned
// payment and returns the wire-ready raw transaction (hex) plus the
// resulting txid (display-form, big-endian).
//
// signature is the raw 64 bytes (r||s) from the MPC cluster. The
// optional recovery byte (v) is ignored — Bitcoin doesn't use it.
// FinalizeBTC handles low-s canonicalization internally so the tx
// stays acceptable under Bitcoin's STANDARD policy.
func (a *Assembler) FinalizeBTC(u *BTCUnsigned, signature []byte) (rawHex, txid string, err error) {
	if u == nil {
		return "", "", fmt.Errorf("txassembler: nil BTCUnsigned")
	}
	if len(signature) < 64 {
		return "", "", fmt.Errorf("txassembler: BTC signature must be >= 64 bytes (r||s), got %d", len(signature))
	}
	return u.Inner.Finalize(signature[:64])
}

// PreSignBTCRefund builds an unsigned BTC sweep transaction returning
// the per-swap deposit wallet's largest confirmed UTXO back to the
// user's source-chain address. Single-input, single-output, no
// change. UTXO consolidation (multi-input) is a future extension —
// the current shape covers the common case of one user deposit
// landing as one UTXO at the deposit wallet.
//
// Arguments mirror PreSignXRPRefund:
//   - sourceNetwork — BITCOIN_TESTNET / BITCOIN_MAINNET (for address
//     parameter selection + provider routing).
//   - depositPubKeyHex — 33-byte compressed secp256k1 pubkey of the
//     deposit wallet (from Wallet.PubKeyHex / Swap.DepositPubKey).
//   - depositAddress — the deposit wallet's P2PKH address.
//   - recipientAddress — user's source-chain BTC address (Swap.Sender),
//     accepts any of P2PKH / P2SH / P2WPKH / P2WSH.
//   - provider — BTCProvider for UTXO + fee + broadcast.
//
// Errors loudly when the deposit balance won't cover fee + dust so
// the refund driver can surface a clear "manual recovery required"
// message instead of looping signing forever.
func (a *Assembler) PreSignBTCRefund(
	ctx context.Context,
	sourceNetwork, depositPubKeyHex, depositAddress, recipientAddress string,
	provider BTCProvider,
) (*BTCUnsigned, error) {
	if provider == nil {
		return nil, fmt.Errorf("txassembler: BTC provider required for refund")
	}
	params, ok := btc.ParamsFor(sourceNetwork)
	if !ok {
		return nil, fmt.Errorf("txassembler: unknown BTC network %q", sourceNetwork)
	}

	depositDecoded, err := btc.DecodeAddress(depositAddress, params)
	if err != nil {
		return nil, fmt.Errorf("depositAddress: %w", err)
	}
	if depositDecoded.Kind != btc.ScriptP2PKH {
		return nil, fmt.Errorf("txassembler: deposit wallet must be P2PKH, got %s (%s)",
			depositDecoded.Kind, depositAddress)
	}
	recipientDecoded, err := btc.DecodeAddress(recipientAddress, params)
	if err != nil {
		return nil, fmt.Errorf("recipientAddress: %w", err)
	}

	pubKey, err := decodeCompressedSecp256k1(depositPubKeyHex)
	if err != nil {
		return nil, fmt.Errorf("txassembler: deposit pubkey: %w", err)
	}
	if !btcHash160Match(pubKey, depositDecoded.Hash) {
		return nil, fmt.Errorf("txassembler: deposit pubkey hash160 does not match deposit address %s", depositAddress)
	}

	utxos, err := provider.ListUTXOs(ctx, sourceNetwork, depositAddress)
	if err != nil {
		return nil, fmt.Errorf("ListUTXOs(%s): %w", depositAddress, err)
	}
	if len(utxos) == 0 {
		return nil, fmt.Errorf("txassembler: deposit wallet %s has no confirmed UTXOs to refund", depositAddress)
	}

	fees, err := provider.RecommendedFees(ctx, sourceNetwork)
	if err != nil {
		return nil, fmt.Errorf("RecommendedFees: %w", err)
	}
	feeRate := fees.HalfHour
	if feeRate == 0 {
		feeRate = 1
	}
	feeSats := feeRate * estimatedRefundVsize
	if feeSats < 250 {
		feeSats = 250 // upstream min relay
	}

	// Sweep the largest UTXO (ListUTXOs returns descending-by-value).
	spend := utxos[0]
	if spend.Value <= feeSats+minRecipientSats {
		return nil, fmt.Errorf(
			"txassembler: largest UTXO %d sats <= fee %d + dust %d — refund value would be dust",
			spend.Value, feeSats, minRecipientSats,
		)
	}
	sweepAmount := spend.Value - feeSats

	prevTxIDBytes, err := hex.DecodeString(spend.TxID)
	if err != nil || len(prevTxIDBytes) != 32 {
		return nil, fmt.Errorf("txassembler: invalid UTXO txid %q", spend.TxID)
	}
	var prevTxID [32]byte
	copy(prevTxID[:], prevTxIDBytes)

	// No change output — refund sweeps everything to recipient.
	pay := &btc.Payment{
		PrevTxID:        prevTxID,
		PrevVout:        spend.Vout,
		PrevValue:       spend.Value,
		PrevScript:      depositDecoded.ScriptPubKey,
		PubKey:          pubKey,
		RecipientScript: recipientDecoded.ScriptPubKey,
		RecipientValue:  sweepAmount,
	}
	sigHash, err := pay.SigHash()
	if err != nil {
		return nil, fmt.Errorf("SigHash (refund): %w", err)
	}

	return &BTCUnsigned{
		Network:       sourceNetwork,
		Inner:         pay,
		SigHash:       sigHash,
		Recipient:     recipientAddress,
		RecipientSats: sweepAmount,
		ChangeSats:    0,
		FeeSats:       feeSats,
		PrevTxID:      spend.TxID,
		PrevVout:      spend.Vout,
	}, nil
}

// decodeCompressedSecp256k1 parses a hex-encoded 33-byte compressed
// secp256k1 pubkey. Accepts the form with or without 0x prefix.
func decodeCompressedSecp256k1(s string) ([]byte, error) {
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
	if len(raw) != 33 {
		return nil, fmt.Errorf("want 33 compressed bytes, got %d", len(raw))
	}
	if raw[0] != 0x02 && raw[0] != 0x03 {
		return nil, fmt.Errorf("compressed pubkey prefix must be 0x02 or 0x03, got 0x%02x", raw[0])
	}
	return raw, nil
}

// btcHash160Match returns true when btc.Hash160(pubkey) equals the
// given 20-byte hash. Defended at the boundary so a swap with a
// mis-derived release pubkey fails PreSign instead of producing an
// unspendable on-chain tx.
func btcHash160Match(pubkey, hash []byte) bool {
	if len(hash) != 20 {
		return false
	}
	got := btc.Hash160(pubkey)
	for i := 0; i < 20; i++ {
		if got[i] != hash[i] {
			return false
		}
	}
	return true
}
