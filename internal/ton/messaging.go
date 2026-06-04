// Package ton holds the TON-destination release pieces the bridge uses
// to build, sign (via MPC), and broadcast a wallet-contract transfer.
// All TON-specific dependencies on tonutils-go live in this package so
// the rest of the bridge stays decoupled from the SDK choice — the
// txassembler/ton.go wrapper consumes the building blocks here without
// importing tonutils-go directly.
//
// Architecture parallel to the Solana release path:
//
//   1. BuildUnsignedTransfer — given the release wallet's ed25519 pubkey,
//      the contract's current seqno, recipient + amount, returns the
//      32-byte hash the MPC cluster ed25519-signs PLUS the payload cell
//      retained for finalize.
//
//   2. The signing driver hex-encodes SigningHash and calls SignForWallet.
//
//   3. FinalizeSignedExternalMessage — given the UnsignedMessage from (1)
//      and the 64-byte signature from (2), assembles the signed body
//      cell, wraps it in an ExternalMessage with optional StateInit
//      (first-deployment), and returns the serialized BoC for broadcast.
//
// Why V4R2? Tonkeeper, MyTonWallet, and toncenter all default to V4R2.
// Picking the same version keeps the address scheme + plugin semantics
// aligned with the wallets users connect from the SPA. V5R1 is newer
// but introduces additional features (action lists, library cells) that
// don't simplify a single-message transfer; V4R2 is the right boring
// choice.
package ton

import (
	"crypto/ed25519"
	"errors"
	"fmt"
	"time"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

// DefaultMessageTTL is how long the signed external message remains
// valid after construction. 5 minutes mirrors tonutils-go's default
// and leaves comfortable headroom for MPC round-trips + broadcast.
const DefaultMessageTTL = 5 * time.Minute

// TransferMode is mode 3 (PayGasSeparately=1 | IgnoreErrors=2) — the
// same mode tonutils-go's wallet.BuildTransfer picks. PayGasSeparately
// avoids dipping into the transfer amount to cover fees (more
// predictable for bridge accounting); IgnoreErrors keeps the wallet
// contract alive if the recipient bounces back.
const TransferMode uint64 = 3

// UnsignedMessage carries the pieces produced in PreSign and needed
// in Finalize after the MPC cluster returns a signature.
type UnsignedMessage struct {
	// SigningHash is the 32-byte cell hash the MPC cluster must
	// ed25519-sign. PASS THESE BYTES VERBATIM to the cluster — the
	// ed25519 algorithm wraps them internally; do not SHA-256 first.
	// Length is always 32.
	SigningHash []byte

	// PayloadCell is the unsigned body cell (subwallet | valid_until
	// | seqno | op | (mode + intMsg)). FinalizeSignedExternalMessage
	// prepends the signature to this cell to produce the body of the
	// external-in message.
	PayloadCell *cell.Cell

	// WalletAddress is the V4R2 contract address that owns the
	// release funds. This is the destination of the external-in
	// message — same value as mchain.Wallet.Address.
	WalletAddress *address.Address

	// StateInit is non-nil when the wallet contract hasn't been
	// deployed yet. The first outbound message must carry StateInit;
	// subsequent messages omit it. Provider.IsContractActive flips
	// the decision.
	StateInit *tlb.StateInit

	// PubKey is retained so FinalizeSignedExternalMessage can
	// verify the signature pre-broadcast — catches malformed MPC
	// output before we waste a toncenter call.
	PubKey ed25519.PublicKey

	// Recipient + AmountNanoTON + ValidUntil are surfaced for logs
	// and observability so the driver can render structured status
	// updates without re-parsing the payload cell.
	Recipient     string
	AmountNanoTON uint64
	ValidUntil    int64
}

// BuildUnsignedTransfer constructs an unsigned native-TON transfer
// from a V4R2 release wallet to recipientStr. amountNanoTON is the
// amount in nanoTON (1 TON = 1e9). seqno is the wallet contract's
// current seqno (0 for first tx). active=true skips StateInit;
// false attaches it so the first tx deploys the contract.
//
// nowFn is a clock indirection so tests can stamp a deterministic
// valid_until. Pass time.Now if you don't care.
func BuildUnsignedTransfer(
	pubKey ed25519.PublicKey,
	seqno uint32,
	recipientStr string,
	amountNanoTON uint64,
	comment string,
	active bool,
	nowFn func() time.Time,
) (*UnsignedMessage, error) {
	if len(pubKey) != ed25519.PublicKeySize {
		return nil, fmt.Errorf("ton: pubkey must be %d bytes, got %d",
			ed25519.PublicKeySize, len(pubKey))
	}
	if amountNanoTON == 0 {
		return nil, errors.New("ton: amountNanoTON is zero")
	}
	if nowFn == nil {
		nowFn = time.Now
	}

	recipient, err := address.ParseAddr(recipientStr)
	if err != nil {
		return nil, fmt.Errorf("ton: parse recipient %q: %w", recipientStr, err)
	}

	walletAddr, err := wallet.AddressFromPubKey(pubKey, wallet.V4R2, wallet.DefaultSubwallet)
	if err != nil {
		return nil, fmt.Errorf("ton: derive wallet address: %w", err)
	}

	// Internal message body — empty for plain transfer, comment cell
	// when set. Comment cells embed a leading 32-bit zero opcode then
	// utf-8 bytes per TIP-3.
	intMsg := &tlb.InternalMessage{
		IHRDisabled: true,
		Bounce:      recipient.IsBounceable(),
		DstAddr:     recipient,
		Amount:      tlb.FromNanoTONU(amountNanoTON),
	}
	if comment != "" {
		body, err := wallet.CreateCommentCell(comment)
		if err != nil {
			return nil, fmt.Errorf("ton: build comment cell: %w", err)
		}
		intMsg.Body = body
	}
	intMsgCell, err := tlb.ToCell(intMsg)
	if err != nil {
		return nil, fmt.Errorf("ton: encode internal message: %w", err)
	}

	// V4R2 payload layout (mirrors SpecV4R2.BuildMessage in tonutils-go):
	//   subwallet:uint32 | valid_until:uint32 | seqno:uint32 | op:int8 |
	//   per transfer: mode:uint8 + ref(internal_message)
	validUntil := nowFn().Add(DefaultMessageTTL).Unix()
	payload := cell.BeginCell().
		MustStoreUInt(uint64(wallet.DefaultSubwallet), 32).
		MustStoreUInt(uint64(validUntil), 32).
		MustStoreUInt(uint64(seqno), 32).
		MustStoreInt(0, 8). // op=0 (transfer)
		MustStoreUInt(TransferMode, 8).
		MustStoreRef(intMsgCell)

	payloadCell := payload.EndCell()

	var stateInit *tlb.StateInit
	if !active {
		si, err := wallet.GetStateInit(pubKey, wallet.V4R2, wallet.DefaultSubwallet)
		if err != nil {
			return nil, fmt.Errorf("ton: build state init: %w", err)
		}
		stateInit = si
	}

	return &UnsignedMessage{
		SigningHash:   payloadCell.Hash(),
		PayloadCell:   payloadCell,
		WalletAddress: walletAddr,
		StateInit:     stateInit,
		PubKey:        pubKey,
		Recipient:     recipientStr,
		AmountNanoTON: amountNanoTON,
		ValidUntil:    validUntil,
	}, nil
}

// FinalizeSignedExternalMessage takes the UnsignedMessage from PreSign
// and the 64-byte ed25519 signature produced by the MPC cluster, and
// returns the serialized BoC ready for toncenter SendBoc.
//
// Verifies the signature against the cell hash before assembling. A
// malformed MPC output would be rejected by the wallet contract anyway,
// but catching it here keeps the explorer from indexing a doomed tx
// and surfaces a clearer error in the bridge logs.
func FinalizeSignedExternalMessage(u *UnsignedMessage, signature []byte) ([]byte, error) {
	if u == nil {
		return nil, errors.New("ton: nil UnsignedMessage")
	}
	if len(signature) != ed25519.SignatureSize {
		return nil, fmt.Errorf("ton: signature must be %d bytes, got %d",
			ed25519.SignatureSize, len(signature))
	}
	if !ed25519.Verify(u.PubKey, u.SigningHash, signature) {
		return nil, errors.New("ton: signature does not verify against pubkey + cell hash")
	}

	// Signed body = signature (64 bytes / 512 bits) | payload bits.
	// MustStoreBuilder(PayloadCell.ToBuilder()) inlines the payload's
	// bits + refs directly (not as a separate ref), which is what the
	// V4R2 contract code expects to parse.
	signedBody := cell.BeginCell().
		MustStoreSlice(signature, ed25519.SignatureSize*8).
		MustStoreBuilder(u.PayloadCell.ToBuilder()).
		EndCell()

	extMsg := &tlb.ExternalMessage{
		DstAddr:   u.WalletAddress,
		StateInit: u.StateInit,
		Body:      signedBody,
	}
	extCell, err := tlb.ToCell(extMsg)
	if err != nil {
		return nil, fmt.Errorf("ton: encode external message: %w", err)
	}
	return extCell.ToBOC(), nil
}
