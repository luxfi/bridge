package txassembler

import (
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	tontoken "github.com/xssnick/tonutils-go/ton/jetton"
	tonwallet "github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

// ton.go: TON v4r2 wallet transaction assembler.
//
// Two-phase signing flow (parallels the EVM path):
//
//   1. PreSignTON(spec) → *TONUnsigned (carries Body + SigHash)
//      Builds the wallet contract message body (the cell the wallet
//      smart-contract verifies a signature over) and returns its
//      SHA-256/representation hash. That digest is what the MPC
//      cluster's Ed25519 quorum signs.
//
//   2. FinalizeTON(unsigned, sig64) → (boc, msgHash)
//      Attaches the 64-byte Ed25519 signature in front of the body,
//      builds an external-in message wrapping the result (with
//      state_init when the wallet contract is uninitialized), and
//      returns the BOC bytes for the broadcast layer plus the
//      signed-body cell hash (the canonical in-message identifier).
//
// Wallet flavor: v4r2 (= tonwallet.V4R2). This is the standard
// non-multisig hot wallet contract used by the vast majority of TON
// services in 2025–2026.
//
// Sub-wallet id: tonwallet.DefaultSubwallet (698983191). All MPC
// release wallets share this constant; we don't (yet) multiplex via
// different sub-wallet ids inside one keygen.
//
// Native vs jetton:
//   - Native TON transfer  → InternalMessage with Amount=valueNano,
//                            Bounce=false (recipient may be uninit'd),
//                            no body.
//   - Jetton (TRC-3) transfer → External message targets the SOURCE
//                            wallet's JETTON-WALLET address (derived
//                            from the master), Body = TransferPayload
//                            (op=0x0f8a7ea5), Amount=0.05 TON for gas.
//
// Address rendering: the spec accepts:
//   - Raw "<workchain>:<32-byte hex>" form (what mchain stores).
//   - User-friendly base64url form ("EQA…" / "UQA…").
//   Both are parsed via tonutils-go's address.ParseAddr +
//   address.ParseRawAddr.

// =============================================================================
// Constants
// =============================================================================

// TONNanoPerCoin is the conversion factor between human-readable TON
// and nanoton (the wire unit). 1 TON = 1e9 nanoton.
const TONNanoPerCoin int64 = 1_000_000_000

// TONJettonForwardNano is the standard "forward TON" amount carried
// alongside a jetton transfer to fund the destination jetton wallet's
// notification message + gas. 0.05 TON is the de-facto convention.
const TONJettonForwardNano int64 = 50_000_000

// TONJettonBodyValueNano is the value the EXTERNAL message body
// carries — i.e. the TON attached to the jetton-master transfer call.
// Standard 0.05 TON, same as the forward amount. Covers the master
// contract's storage + gas while it dispatches the jetton balance
// change.
const TONJettonBodyValueNano int64 = 50_000_000

// TONMessagesTTL is how far into the future the external message's
// `valid_until` field is set, in seconds. tonutils-go's default is
// 180 (3 minutes); we mirror it so signature reproducibility matches
// the upstream wallet code without divergence.
const TONMessagesTTL = 180

// TONSubwalletID is the v4r2 sub-wallet identifier used by every MPC
// release wallet. Matches tonwallet.DefaultSubwallet.
const TONSubwalletID uint32 = tonwallet.DefaultSubwallet

// =============================================================================
// Errors
// =============================================================================

// ErrTONInvalidPubKey — the supplied source pubkey isn't a valid
// Ed25519 public key (must be 32 bytes).
var ErrTONInvalidPubKey = errors.New("txassembler: ton: invalid ed25519 pubkey (need 32 bytes)")

// ErrTONInvalidSignature — the MPC-supplied signature isn't 64 bytes.
var ErrTONInvalidSignature = errors.New("txassembler: ton: invalid ed25519 signature (need 64 bytes)")

// ErrTONNilUnsigned — Finalize called with nil *TONUnsigned.
var ErrTONNilUnsigned = errors.New("txassembler: ton: nil unsigned")

// =============================================================================
// SeqnoProvider — read sequence numbers off chain
// =============================================================================

// TONSeqnoProvider is the read-side dependency for the TON assembler.
// PreSignTON calls Seqno(network, walletAddr) to fetch the wallet's
// current seqno before building the message body. Implementations
// typically call TON Center's `runGetMethod` with method "seqno",
// or an internal liteserver client.
//
// Static / zero seqno (for an uninitialised wallet — first send) is
// expected from a fresh contract; the provider should return 0 + nil
// rather than an error in that case.
type TONSeqnoProvider interface {
	Seqno(ctx context.Context, network, walletAddr string) (uint32, error)
}

// TONStaticSeqnoProvider returns the configured seqno. Useful for
// tests + the bootstrap path where every release wallet starts with
// seqno=0 and the bridge tracks per-wallet seqno locally between sends.
type TONStaticSeqnoProvider struct {
	// Seqnos is keyed by "<network>|<walletAddr>" — same shape as
	// StaticProvider.Nonces.
	Seqnos map[string]uint32
}

// Seqno returns the configured seqno (default 0).
func (s *TONStaticSeqnoProvider) Seqno(_ context.Context, network, walletAddr string) (uint32, error) {
	if s.Seqnos == nil {
		return 0, nil
	}
	key := network + "|" + walletAddr
	return s.Seqnos[key], nil
}

// =============================================================================
// TONSpec — caller-supplied transaction intent
// =============================================================================

// TONSpec captures everything the assembler needs to build a TON
// release transaction. The cmd/bridge signing driver populates this
// from a Swap record.
type TONSpec struct {
	// Network is the destination network internal_name (TON_MAINNET /
	// TON_TESTNET). Used for seqno lookups + log context.
	Network string

	// SourcePubKey is the 32-byte Ed25519 public key of the release
	// wallet (the wallet that will sign the external message). Obtained
	// from the MPC keygen response's eddsa_pub_key slot.
	SourcePubKey ed25519.PublicKey

	// SourceAddress is the user-friendly or raw address of the release
	// wallet. Optional — if empty, derived from SourcePubKey.
	// Provided primarily so the assembler can verify consistency
	// between the address the swap was created against and the pubkey
	// at signing time.
	SourceAddress string

	// SourceInitialized — when false, the assembler prepends state_init
	// to the external message so the contract is deployed in the same
	// transaction as the first send. The signing driver can leave this
	// false safely; tonutils-go's wallet contract is identical to the
	// state_init we embed, so a wasted state_init on an already-init'd
	// wallet just costs ~0.005 TON in extra storage cell rent (the
	// gateway accepts it and the contract's get_methods short-circuit).
	//
	// For production tightness, the cmd/bridge driver can flip this to
	// true after the first successful broadcast (which it tracks via
	// ReleasePoolEntry.MintedAt + a follow-up "initialized" boolean).
	SourceInitialized bool

	// DestinationAddress is the recipient. Raw or user-friendly form.
	DestinationAddress string

	// Asset selects native vs jetton. Empty / "TON" / "TONCOIN" ⇒ native.
	// Anything else ⇒ jetton; JettonMaster must be set.
	Asset string

	// JettonMaster is the address of the jetton master contract when
	// Asset != "TON". The assembler queries the source's jetton wallet
	// off the master via JettonProvider, then builds the transfer
	// body. Required for jetton transfers; ignored otherwise.
	JettonMaster string

	// JettonSourceWallet is the EXPLICIT source-side jetton wallet
	// address (the contract that holds the source's jetton balance).
	// When non-empty, the assembler trusts this value rather than
	// computing it on-chain via JettonProvider — useful for tests +
	// for operators who pre-derive jetton wallets to skip the
	// runMethod call.
	JettonSourceWallet string

	// AmountNano is the destination amount in base units (nanoton for
	// native; jetton's own base units for jetton transfers). Required.
	AmountNano *big.Int

	// Bounce controls the InternalMessage.Bounce flag on native sends.
	// Default false — TON addresses for end users are typically
	// non-bounceable. Bridge release to a contract is the exception
	// (set true when the recipient is a known contract).
	Bounce bool

	// Comment, when non-empty, attaches a text comment cell to the
	// internal message body. Standard TON convention: 32-bit prefix
	// 0x00000000 + UTF-8 text. Used for bridge metadata.
	Comment string
}

// =============================================================================
// JettonWalletAddressProvider — resolve a source's jetton wallet
// =============================================================================

// TONJettonWalletAddressProvider abstracts the on-chain lookup that
// converts (master, owner) → owner's jetton wallet address. Production
// implementations call get_wallet_address on the master via TON
// Center's runGetMethod. The assembler also accepts a pre-computed
// value via TONSpec.JettonSourceWallet, which is what tests use.
type TONJettonWalletAddressProvider interface {
	// JettonWalletAddress returns the address of the jetton-wallet
	// contract that holds `owner`'s balance for the jetton identified
	// by `master`. Both arguments are addresses (any form accepted by
	// the tonutils-go address parser).
	JettonWalletAddress(ctx context.Context, network, master, owner string) (string, error)
}

// =============================================================================
// TONAssembler
// =============================================================================

// TONAssembler builds + finalizes TON v4r2 external messages. Safe for
// concurrent use.
type TONAssembler struct {
	// SeqnoProvider supplies the current seqno for a release wallet.
	// nil ⇒ assume 0 (first send / static-provider for tests).
	SeqnoProvider TONSeqnoProvider

	// JettonProvider resolves source-jetton-wallet addresses for
	// jetton transfers. nil ⇒ only spec-provided JettonSourceWallet
	// is honored; jetton spec without it returns an error.
	JettonProvider TONJettonWalletAddressProvider

	// Now returns the current time. nil ⇒ time.Now. Tests override.
	Now func() time.Time
}

// NewTONAssembler constructs a TONAssembler with a static seqno
// provider (every wallet starts at seqno=0). For production wire the
// SeqnoProvider to a TON Center runGetMethod client.
func NewTONAssembler() *TONAssembler {
	return &TONAssembler{
		SeqnoProvider: &TONStaticSeqnoProvider{},
	}
}

// now returns the wall-clock used for valid_until. Tests override
// TONAssembler.Now for deterministic body hashes.
func (a *TONAssembler) now() time.Time {
	if a.Now != nil {
		return a.Now()
	}
	return time.Now()
}

// =============================================================================
// TONUnsigned — intermediate state between PreSign + Finalize
// =============================================================================

// TONUnsigned carries every value PreSignTON computed, so Finalize can
// reconstruct the exact external message with the same hash + same
// signed body. The caller MUST pass the same *TONUnsigned PreSign
// returned to Finalize; mutating it in between corrupts the wire.
type TONUnsigned struct {
	Network string

	SourcePubKey   ed25519.PublicKey
	SourceAddress  *address.Address // bounceable form
	SrcInitialized bool
	StateInit      *tlb.StateInit // populated only when !SrcInitialized

	// Body is the wallet-v4r2 unsigned body cell. Schema:
	//   StoreUInt(subwallet, 32) ||
	//   StoreUInt(validUntil, 32) ||
	//   StoreUInt(seqno, 32)     ||
	//   StoreInt(0, 8)           // op=0
	//   { StoreUInt(message.Mode, 8) || StoreRef(internalMessage) } * N
	//
	// The MPC quorum signs Body.Hash() (the cell's representation hash).
	Body *cell.Cell

	// SigHash is the 32-byte representation hash of Body. Returned to
	// the caller (same value as Body.Hash()) so the signing driver
	// doesn't have to call into tonutils-go for the digest itself.
	SigHash [32]byte
}

// =============================================================================
// PreSignTON
// =============================================================================

// PreSignTON builds the unsigned v4r2 body cell, returns its hash for
// MPC signing, and packages the rest of the wire state for Finalize.
//
// Native vs jetton:
//   - spec.Asset empty / "TON" / "TONCOIN" / "ton" → native transfer
//   - else → jetton transfer (requires spec.JettonMaster + either
//     spec.JettonSourceWallet or a configured JettonProvider).
func (a *TONAssembler) PreSignTON(ctx context.Context, spec TONSpec) (*TONUnsigned, error) {
	if len(spec.SourcePubKey) != ed25519.PublicKeySize {
		return nil, ErrTONInvalidPubKey
	}
	if spec.AmountNano == nil || spec.AmountNano.Sign() <= 0 {
		return nil, errors.New("txassembler: ton: AmountNano must be > 0")
	}

	srcAddr, err := tonAddressFromPubKey(spec.SourcePubKey)
	if err != nil {
		return nil, fmt.Errorf("txassembler: ton: derive source addr: %w", err)
	}

	// Cross-check spec.SourceAddress (if supplied) matches the derived
	// address. This catches a swap-config drift before we burn an MPC
	// ceremony on the wrong wallet.
	if spec.SourceAddress != "" {
		want, perr := ParseTONAddress(spec.SourceAddress)
		if perr != nil {
			return nil, fmt.Errorf("txassembler: ton: SourceAddress: %w", perr)
		}
		if !addressEquals(want, srcAddr) {
			return nil, fmt.Errorf(
				"txassembler: ton: SourceAddress %s does not match pubkey-derived %s",
				want.StringRaw(), srcAddr.StringRaw(),
			)
		}
	}

	dstAddr, err := ParseTONAddress(spec.DestinationAddress)
	if err != nil {
		return nil, fmt.Errorf("txassembler: ton: DestinationAddress: %w", err)
	}

	internalMsg, err := a.buildInternalMessage(ctx, spec, srcAddr, dstAddr)
	if err != nil {
		return nil, err
	}

	intMsgCell, err := tlb.ToCell(internalMsg)
	if err != nil {
		return nil, fmt.Errorf("txassembler: ton: encode internal message: %w", err)
	}

	// Seqno + valid_until.
	var seqno uint32
	if a.SeqnoProvider != nil {
		seqno, err = a.SeqnoProvider.Seqno(ctx, spec.Network, srcAddr.StringRaw())
		if err != nil {
			return nil, fmt.Errorf("txassembler: ton: seqno lookup: %w", err)
		}
	}
	validUntil := a.now().Add(time.Duration(TONMessagesTTL) * time.Second).Unix()

	// v4r2 body shape (matches tonwallet.SpecV4R2.BuildMessage):
	//   storeUInt(subwallet, 32) ||
	//   storeUInt(validUntil, 32) ||
	//   storeUInt(seqno, 32) ||
	//   storeInt(0, 8) // op
	//   { storeUInt(mode, 8) || storeRef(intMsg) }
	body := cell.BeginCell().
		MustStoreUInt(uint64(TONSubwalletID), 32).
		MustStoreUInt(uint64(validUntil), 32).
		MustStoreUInt(uint64(seqno), 32).
		MustStoreInt(0, 8). // op
		MustStoreUInt(uint64(tonwallet.PayGasSeparately+tonwallet.IgnoreErrors), 8).
		MustStoreRef(intMsgCell).
		EndCell()

	unsigned := &TONUnsigned{
		Network:        spec.Network,
		SourcePubKey:   append(ed25519.PublicKey(nil), spec.SourcePubKey...),
		SourceAddress:  srcAddr,
		SrcInitialized: spec.SourceInitialized,
		Body:           body,
	}
	if !spec.SourceInitialized {
		stateInit, err := tonwallet.GetStateInit(spec.SourcePubKey, tonwallet.V4R2, TONSubwalletID)
		if err != nil {
			return nil, fmt.Errorf("txassembler: ton: state_init: %w", err)
		}
		unsigned.StateInit = stateInit
	}

	h := body.Hash()
	copy(unsigned.SigHash[:], h)
	return unsigned, nil
}

// =============================================================================
// FinalizeTON
// =============================================================================

// FinalizeTON attaches an Ed25519 signature to the wallet body, wraps
// it in an external-in message (with state_init when needed), and
// serializes the result as BOC. Returns the BOC bytes (callers
// base64-encode for TON Center) plus the signed body's hash that
// identifies the broadcast.
//
// The sig parameter is 64 bytes. The bridge's mchain SignForWallet
// returns hex; the signing driver decodes once before calling here.
func (a *TONAssembler) FinalizeTON(unsigned *TONUnsigned, sig []byte) (boc []byte, msgHash []byte, err error) {
	if unsigned == nil {
		return nil, nil, ErrTONNilUnsigned
	}
	if len(sig) != ed25519.SignatureSize {
		return nil, nil, ErrTONInvalidSignature
	}

	// Build the signed-body cell:
	//   StoreSlice(sig, 512) || StoreBuilder(unsigned.Body)
	// — tonutils-go's BuildMessage uses StoreSlice for the 64-byte sig.
	signedBody, err := buildSignedTONBody(unsigned.Body, sig)
	if err != nil {
		return nil, nil, fmt.Errorf("txassembler: ton: assemble signed body: %w", err)
	}

	// Wrap as ExternalMessage (in). Source address = none, dest = wallet contract.
	ext := &tlb.ExternalMessage{
		SrcAddr:   address.NewAddressNone(),
		DstAddr:   unsigned.SourceAddress,
		ImportFee: tlb.FromNanoTONU(0),
		StateInit: unsigned.StateInit,
		Body:      signedBody,
	}

	extCell, err := tlb.ToCell(ext)
	if err != nil {
		return nil, nil, fmt.Errorf("txassembler: ton: encode external message: %w", err)
	}

	return extCell.ToBOC(), signedBody.Hash(), nil
}

// =============================================================================
// FinalizeTONHex is a convenience wrapper that accepts the signature
// in hex form (with or without 0x prefix) — same shape every other
// part of the bridge stores threshold signatures.
// =============================================================================

// FinalizeTONHex is the hex-input flavor of FinalizeTON, plus
// base64-encoded BOC output (which the broadcast layer accepts
// directly). The msgHash return is hex-encoded for the same reason.
func (a *TONAssembler) FinalizeTONHex(unsigned *TONUnsigned, sigHex string) (bocB64 string, msgHashHex string, err error) {
	sigHex = strings.TrimPrefix(strings.TrimPrefix(sigHex, "0x"), "0X")
	sig, err := hex.DecodeString(sigHex)
	if err != nil {
		return "", "", fmt.Errorf("txassembler: ton: decode signature hex: %w", err)
	}
	boc, msgHash, err := a.FinalizeTON(unsigned, sig)
	if err != nil {
		return "", "", err
	}
	return base64.StdEncoding.EncodeToString(boc), hex.EncodeToString(msgHash), nil
}

// =============================================================================
// Address helpers (exported)
// =============================================================================

// ParseTONAddress accepts either:
//   - User-friendly base64url: "EQA..." / "UQA..." / "kQA..." / "0QA..."
//   - Raw form:                "<workchain>:<32-byte hex>"
//
// Returns the parsed *address.Address.
func ParseTONAddress(s string) (*address.Address, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil, errors.New("txassembler: ton: empty address")
	}
	if strings.Contains(s, ":") {
		return address.ParseRawAddr(s)
	}
	return address.ParseAddr(s)
}

// TONAddressFromPubKey derives the v4r2 standard wallet address from
// an Ed25519 public key. Workchain 0 (basechain). Sub-wallet
// TONSubwalletID. Returned in NON-bounceable form (UQ-prefixed) —
// what bridge release wallets use because the wallet contract is
// always deployed (state_init) on first send.
//
// Exported so cmd/bridge can render the same address mpcd's keygen
// reports back to operators, and so the deposit-watcher can verify
// incoming-deposit addresses match the pubkey on file.
func TONAddressFromPubKey(pubkey ed25519.PublicKey) (*address.Address, error) {
	addr, err := tonAddressFromPubKey(pubkey)
	if err != nil {
		return nil, err
	}
	return addr.Bounce(false), nil
}

// TONAddressBounceableFromPubKey returns the BOUNCEABLE form (EQ-prefix)
// of the same wallet. Used by the deposit-watcher when matching
// incoming TON-Center responses (which default to bounceable).
func TONAddressBounceableFromPubKey(pubkey ed25519.PublicKey) (*address.Address, error) {
	addr, err := tonAddressFromPubKey(pubkey)
	if err != nil {
		return nil, err
	}
	return addr.Bounce(true), nil
}

// TONRawAddress returns the "<workchain>:<32-byte hex>" form for a
// pubkey-derived v4r2 wallet. Used by mchain.pickAddress so the
// stored address is the canonical lowest-common-denominator
// representation.
func TONRawAddress(pubkey ed25519.PublicKey) (string, error) {
	addr, err := tonAddressFromPubKey(pubkey)
	if err != nil {
		return "", err
	}
	return addr.StringRaw(), nil
}

// =============================================================================
// Internal helpers
// =============================================================================

// tonAddressFromPubKey returns the bounceable form (default flag set
// in tonutils-go). Callers flip with .Bounce(false) when they want the
// UQ form.
func tonAddressFromPubKey(pubkey ed25519.PublicKey) (*address.Address, error) {
	if len(pubkey) != ed25519.PublicKeySize {
		return nil, ErrTONInvalidPubKey
	}
	return tonwallet.AddressFromPubKey(pubkey, tonwallet.V4R2, TONSubwalletID)
}

func addressEquals(a, b *address.Address) bool {
	if a == nil || b == nil {
		return a == b
	}
	return a.Equals(b)
}

// buildInternalMessage routes the spec into either a native TON
// transfer or a jetton transfer.
func (a *TONAssembler) buildInternalMessage(
	ctx context.Context,
	spec TONSpec,
	srcAddr, dstAddr *address.Address,
) (*tlb.InternalMessage, error) {
	if isTONNative(spec.Asset) {
		return a.buildNativeInternalMessage(spec, dstAddr)
	}
	return a.buildJettonInternalMessage(ctx, spec, srcAddr, dstAddr)
}

// isTONNative returns true when the asset selector means "native TON
// transfer" — empty, "TON", "TONCOIN", any case.
func isTONNative(asset string) bool {
	switch strings.ToUpper(strings.TrimSpace(asset)) {
	case "", "TON", "TONCOIN":
		return true
	}
	return false
}

// buildNativeInternalMessage handles the value-transfer case. Body is
// either empty or a text-comment cell.
func (a *TONAssembler) buildNativeInternalMessage(
	spec TONSpec,
	dstAddr *address.Address,
) (*tlb.InternalMessage, error) {
	body, err := buildCommentBody(spec.Comment)
	if err != nil {
		return nil, err
	}
	return &tlb.InternalMessage{
		IHRDisabled: true,
		Bounce:      spec.Bounce,
		DstAddr:     dstAddr,
		Amount:      tlb.FromNanoTON(new(big.Int).Set(spec.AmountNano)),
		Body:        body,
	}, nil
}

// buildJettonInternalMessage handles a jetton transfer.
//
//  1. Resolve the SOURCE's jetton wallet (the contract that holds
//     the source's balance for `master`). Either:
//     - spec.JettonSourceWallet (operator-supplied), or
//     - JettonProvider.JettonWalletAddress(master, src).
//  2. Build the standard transfer payload (op=0x0f8a7ea5).
//  3. Wrap in an InternalMessage targeting that jetton wallet with
//     0.05 TON gas, body = transfer payload, bounce=true (jetton
//     wallets ARE contracts so bouncing is safe + recommended).
func (a *TONAssembler) buildJettonInternalMessage(
	ctx context.Context,
	spec TONSpec,
	srcAddr, dstAddr *address.Address,
) (*tlb.InternalMessage, error) {
	if spec.JettonMaster == "" && spec.JettonSourceWallet == "" {
		return nil, errors.New("txassembler: ton: jetton transfer requires JettonMaster or JettonSourceWallet")
	}
	srcJettonAddrStr := spec.JettonSourceWallet
	if srcJettonAddrStr == "" {
		if a.JettonProvider == nil {
			return nil, errors.New("txassembler: ton: jetton transfer needs JettonProvider when JettonSourceWallet is unset")
		}
		var err error
		srcJettonAddrStr, err = a.JettonProvider.JettonWalletAddress(ctx, spec.Network, spec.JettonMaster, srcAddr.StringRaw())
		if err != nil {
			return nil, fmt.Errorf("txassembler: ton: resolve jetton wallet: %w", err)
		}
	}
	srcJettonAddr, err := ParseTONAddress(srcJettonAddrStr)
	if err != nil {
		return nil, fmt.Errorf("txassembler: ton: parse jetton wallet: %w", err)
	}

	// Forward payload: optional comment to the destination jetton wallet.
	forward, err := buildCommentBody(spec.Comment)
	if err != nil {
		return nil, err
	}

	jettonTransferBody, err := tontoken.BuildTransferPayload(
		dstAddr,
		srcAddr, // response destination = our release wallet (refund-friendly)
		tlb.FromNanoTON(new(big.Int).Set(spec.AmountNano)),
		tlb.FromNanoTONU(uint64(TONJettonForwardNano)),
		forward,
		nil, // custom payload
	)
	if err != nil {
		return nil, fmt.Errorf("txassembler: ton: build jetton transfer payload: %w", err)
	}

	return &tlb.InternalMessage{
		IHRDisabled: true,
		Bounce:      true, // jetton wallet is a contract
		DstAddr:     srcJettonAddr,
		Amount:      tlb.FromNanoTONU(uint64(TONJettonBodyValueNano)),
		Body:        jettonTransferBody,
	}, nil
}

// buildCommentBody returns nil when comment is empty, otherwise builds
// the canonical "text comment" body cell (32-bit zero prefix + UTF-8).
func buildCommentBody(comment string) (*cell.Cell, error) {
	if comment == "" {
		return nil, nil
	}
	return tonwallet.CreateCommentCell(comment)
}

// buildSignedTONBody prepends the 64-byte signature to the unsigned
// wallet body. This matches tonwallet.SpecV4R2.BuildMessage's:
//
//	cell.BeginCell().MustStoreSlice(sig, 512).MustStoreBuilder(payload).EndCell()
//
// We rebuild the cell by replaying the unsigned body's bit-slice and
// refs into a fresh builder, prefixed with the 64-byte signature.
func buildSignedTONBody(unsignedBody *cell.Cell, sig []byte) (*cell.Cell, error) {
	if unsignedBody == nil {
		return nil, errors.New("txassembler: ton: nil unsigned body")
	}
	if len(sig) != ed25519.SignatureSize {
		return nil, ErrTONInvalidSignature
	}

	slice, err := unsignedBody.BeginParse()
	if err != nil {
		return nil, fmt.Errorf("parse unsigned body: %w", err)
	}
	bitsLeft := slice.BitsLeft()
	bits, err := slice.LoadSlice(bitsLeft)
	if err != nil {
		return nil, fmt.Errorf("load unsigned bits: %w", err)
	}

	builder := cell.BeginCell().
		MustStoreSlice(sig, 512).
		MustStoreSlice(bits, bitsLeft)
	// Reattach the unsigned body's refs. The wallet-v4r2 body schema
	// puts the internal message in ref slot 0; future schemas with
	// more refs (e.g. multi-message sends) iterate the same way.
	refsCount := unsignedBody.RefsNum()
	for i := 0; i < int(refsCount); i++ {
		ref, perr := unsignedBody.PeekRef(i)
		if perr != nil {
			return nil, fmt.Errorf("peek unsigned ref %d: %w", i, perr)
		}
		builder = builder.MustStoreRef(ref)
	}
	return builder.EndCell(), nil
}
