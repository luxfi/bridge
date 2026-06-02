// sol.go: Solana destination-chain transaction assembly. Companion to
// the EVM assembler in assembler.go but expressed in terms of Solana's
// own primitives (instructions, message, accounts, signatures).
//
// What we build:
//   - Legacy / v0 messages: one fee payer (the MPC release wallet), one
//     recipient, lamport amount (native SOL transfer) OR SPL token
//     transfer (source ATA → destination ATA, with ATA creation when
//     the destination ATA doesn't exist).
//   - No address-lookup-tables. ALT support is a follow-up; the bridge
//     only needs the basic shape for its release path today.
//
// Two-step ceremony — same shape as the EVM path:
//   1. PreSign: build the unsigned message, compute the bytes the MPC
//      cluster will sign over (= raw message bytes; Solana doesn't hash
//      before signing — Ed25519 hashes internally as part of the
//      signing scheme).
//   2. Finalize: prepend the 64-byte signature in the canonical place
//      and serialize the wire-ready transaction.
//
// The Solana wire transaction layout is:
//
//   [compactU16: numSignatures]
//   [64 bytes * numSignatures]   ← signatures, in account_keys order
//   [message bytes]              ← header + accounts + recent_blockhash + instructions
//
// For the bridge's release tx, numSignatures is always 1 (the MPC
// release wallet is the sole signer + fee payer). The message bytes are
// what the MPC cluster signs. PreSign returns those bytes verbatim so
// the signing driver can hex-encode them and ship them to the cluster.

package txassembler

import (
	"context"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"strings"

	"github.com/gagliardetto/solana-go"
	ata "github.com/gagliardetto/solana-go/programs/associated-token-account"
	"github.com/gagliardetto/solana-go/programs/system"
	"github.com/gagliardetto/solana-go/programs/token"
	"github.com/gagliardetto/solana-go/rpc"
)

// =============================================================================
// Public types
// =============================================================================

// SOLNetworkConfig is the bridge-side config for one Solana network
// (mainnet vs devnet). Used to resolve the RPC endpoint that fetches
// the recent blockhash. Distinct from broadcast's RPC endpoint —
// callers can point them at different nodes (e.g. authenticated paid
// provider for sendTransaction, public RPC for blockhash polling).
type SOLNetworkConfig struct {
	// BlockhashURL is the JSON-RPC endpoint used for getLatestBlockhash
	// + getAccountInfo (ATA existence check). Required.
	BlockhashURL string

	// Commitment selects the freshness level for getLatestBlockhash.
	// Solana defaults to "finalized"; "confirmed" gets a fresher hash
	// at the cost of a slightly higher BlockhashNotFound risk. The
	// bridge picks "confirmed" — release txs land within 1-2 slots so
	// a 1-2 slot newer hash isn't a risk vs. a hash that may already
	// be ~1 minute old by the time the MPC ceremony finishes.
	Commitment rpc.CommitmentType
}

// SOLSpec is the Solana destination intent. Companion to SwapIntent
// for the EVM path — kept separate because Solana's parameters are
// fundamentally different (no nonce, no gas price, no chainID; just
// recent blockhash + lamports + accounts).
//
// Native SOL transfer (SourceMint empty): system.NewTransferInstruction
// from PayerAddress to RecipientAddress for LamportsAmount.
//
// SPL token transfer (SourceMint set): token.NewTransferInstruction
// from the source ATA (derived from PayerAddress + SourceMint) to the
// destination ATA (derived from RecipientAddress + SourceMint). When
// the destination ATA doesn't exist yet, the assembler prepends a
// CreateAssociatedTokenAccount instruction to mint it on the fly.
// Payer wallet covers both the transfer fee + the ATA rent-exempt
// minimum (~2_039_280 lamports as of 2026-05).
type SOLSpec struct {
	// Network is the bridge internal network name, e.g. "SOLANA_DEVNET".
	Network string

	// PayerAddress is the release wallet's base58-encoded Ed25519
	// public key — fees, fee payer signature, source of value.
	PayerAddress string

	// RecipientAddress is the destination wallet (user). Base58.
	RecipientAddress string

	// LamportsAmount is the value to transfer in lamports. For SPL,
	// this is interpreted in the token's base units (not lamports);
	// Solana doesn't distinguish "wei" vs "lamports" in the program
	// arg — both system.Transfer and token.Transfer take uint64.
	LamportsAmount uint64

	// SourceMint, when non-empty, switches the assembler into SPL
	// token transfer mode. Base58 mint address. Empty = native SOL.
	SourceMint string
}

// SOLUnsigned is the intermediate representation produced by PreSign.
// Companion to *Unsigned for the EVM path. The signing driver feeds
// MessageBytes to the MPC cluster as the message-to-sign (hex), then
// passes the resulting 64-byte signature back through Finalize along
// with this struct to produce the wire-ready raw transaction.
//
// Why expose the *Transaction directly: solana-go's transaction has
// no public "set signatures" method, so Finalize has to hold a live
// handle to the tx to slot the signature in. Keeping it on Unsigned
// keeps the assembler stateless between calls.
type SOLUnsigned struct {
	// Network mirrors SOLSpec.Network — useful when downstream code
	// needs to route by network without holding the SOLSpec.
	Network string

	// Blockhash is the recent_blockhash baked into Message. Surfaced
	// here so the signing driver can stash it on the swap record and
	// detect BlockhashNotFound errors at broadcast time (the message
	// must be rebuilt + re-signed with a fresher hash).
	Blockhash string

	// MessageBytes is the raw, canonical wire-encoded message — i.e.
	// exactly what the Ed25519 signing function will hash + sign over.
	// Sent to the MPC cluster as the message-to-sign.
	MessageBytes []byte

	// tx is the in-flight transaction. solana-go encodes signatures +
	// message into the wire format via Transaction.MarshalBinary, so
	// Finalize sets tx.Signatures[0] and re-marshals.
	tx *solana.Transaction

	// payer is captured so Finalize can confirm the signing driver
	// hasn't fed it a signature from the wrong key.
	payer solana.PublicKey
}

// SOLAssembler is the Solana-side counterpart to *Assembler. It speaks
// to a Solana RPC for blockhash + account-info lookups and produces
// SOLUnsigned values for the signing driver.
type SOLAssembler struct {
	// Networks maps internal-name → per-network config. PreSign rejects
	// unknown networks rather than silently defaulting.
	Networks map[string]SOLNetworkConfig

	// RPCFactory builds a solana-go *rpc.Client for the given URL.
	// Kept as a field so tests can stub the network round-trip. Nil ⇒
	// use rpc.New (the production constructor).
	RPCFactory func(url string) *rpc.Client
}

// NewSOLAssembler builds an assembler with sensible defaults. Networks
// can be populated via SetNetwork.
func NewSOLAssembler() *SOLAssembler {
	return &SOLAssembler{
		Networks: map[string]SOLNetworkConfig{},
	}
}

// SetNetwork registers a per-network config.
func (a *SOLAssembler) SetNetwork(network string, cfg SOLNetworkConfig) {
	if cfg.Commitment == "" {
		cfg.Commitment = rpc.CommitmentConfirmed
	}
	a.Networks[network] = cfg
}

// rpcFor builds (or stubs) the rpc.Client for the given URL.
func (a *SOLAssembler) rpcFor(url string) *rpc.Client {
	if a.RPCFactory != nil {
		return a.RPCFactory(url)
	}
	return rpc.New(url)
}

// =============================================================================
// PreSign
// =============================================================================

// ErrSOLNoNetworkConfig is returned by PreSign when SOLSpec.Network
// isn't in SOLAssembler.Networks. Callers must register the network
// (network YAML + bridge startup wiring) before PreSign can run.
var ErrSOLNoNetworkConfig = errors.New("txassembler: no SOL network config for that network")

// PreSign builds the unsigned Solana transaction. The returned
// SOLUnsigned.MessageBytes is the bytes-to-sign — feed it to the MPC
// cluster as the Ed25519 message.
//
// The flow:
//  1. Parse PayerAddress + RecipientAddress + (optional) SourceMint.
//  2. Fetch the recent blockhash from the network's RPC.
//  3. Build instructions:
//     - Native: [system.Transfer(payer, recipient, lamports)]
//     - SPL with destination ATA present:
//     [token.Transfer(srcATA, dstATA, payer, lamports)]
//     - SPL with destination ATA absent:
//     [ata.Create(payer, recipient, mint),
//     token.Transfer(srcATA, dstATA, payer, lamports)]
//  4. solana.NewTransaction(instructions, blockhash, WithPayer(payer))
//  5. Marshal the message portion to bytes — that's what gets signed.
//
// Errors propagated:
//   - ErrSOLNoNetworkConfig         network not registered.
//   - solana.PublicKey parse errors malformed addresses.
//   - rpc errors                    upstream RPC failure.
func (a *SOLAssembler) PreSign(ctx context.Context, in SOLSpec) (*SOLUnsigned, error) {
	cfg, ok := a.Networks[in.Network]
	if !ok {
		return nil, fmt.Errorf("%w: %s", ErrSOLNoNetworkConfig, in.Network)
	}
	if cfg.BlockhashURL == "" {
		return nil, fmt.Errorf("txassembler: SOL network %s missing BlockhashURL", in.Network)
	}
	payer, err := solana.PublicKeyFromBase58(in.PayerAddress)
	if err != nil {
		return nil, fmt.Errorf("txassembler: invalid PayerAddress %q: %w", in.PayerAddress, err)
	}
	recipient, err := solana.PublicKeyFromBase58(in.RecipientAddress)
	if err != nil {
		return nil, fmt.Errorf("txassembler: invalid RecipientAddress %q: %w", in.RecipientAddress, err)
	}
	if in.LamportsAmount == 0 {
		return nil, errors.New("txassembler: LamportsAmount must be > 0")
	}

	client := a.rpcFor(cfg.BlockhashURL)
	bh, err := client.GetLatestBlockhash(ctx, cfg.Commitment)
	if err != nil {
		return nil, fmt.Errorf("txassembler: getLatestBlockhash: %w", err)
	}
	if bh == nil || bh.Value == nil {
		return nil, errors.New("txassembler: getLatestBlockhash returned empty result")
	}
	blockhash := bh.Value.Blockhash

	// Build the instruction list.
	instructions, err := a.buildSOLInstructions(ctx, client, payer, recipient, in)
	if err != nil {
		return nil, err
	}

	tx, err := solana.NewTransaction(
		instructions,
		blockhash,
		solana.TransactionPayer(payer),
	)
	if err != nil {
		return nil, fmt.Errorf("txassembler: NewTransaction: %w", err)
	}

	// MarshalBinary() on a Message produces the exact byte sequence that
	// Solana signs — header + accountKeys + recentBlockhash + compiled
	// instructions. The Transaction.MarshalBinary that includes
	// signatures wraps these bytes with a [compactU16-prefixed] signature
	// vector, but we don't have the signature yet, so we go straight to
	// the message.
	msgBytes, err := tx.Message.MarshalBinary()
	if err != nil {
		return nil, fmt.Errorf("txassembler: marshal SOL message: %w", err)
	}

	return &SOLUnsigned{
		Network:      in.Network,
		Blockhash:    blockhash.String(),
		MessageBytes: msgBytes,
		tx:           tx,
		payer:        payer,
	}, nil
}

// buildSOLInstructions resolves native vs SPL mode and ATA creation.
func (a *SOLAssembler) buildSOLInstructions(
	ctx context.Context,
	client *rpc.Client,
	payer, recipient solana.PublicKey,
	in SOLSpec,
) ([]solana.Instruction, error) {
	if in.SourceMint == "" {
		// Native SOL transfer.
		return []solana.Instruction{
			system.NewTransferInstruction(in.LamportsAmount, payer, recipient).Build(),
		}, nil
	}

	mint, err := solana.PublicKeyFromBase58(in.SourceMint)
	if err != nil {
		return nil, fmt.Errorf("txassembler: invalid SourceMint %q: %w", in.SourceMint, err)
	}

	srcATA, _, err := solana.FindAssociatedTokenAddress(payer, mint)
	if err != nil {
		return nil, fmt.Errorf("txassembler: source ATA derive: %w", err)
	}
	dstATA, _, err := solana.FindAssociatedTokenAddress(recipient, mint)
	if err != nil {
		return nil, fmt.Errorf("txassembler: destination ATA derive: %w", err)
	}

	out := make([]solana.Instruction, 0, 2)

	// Does the destination ATA already exist? Account-info nil ⇒ doesn't
	// exist, prepend the ATA-create instruction. Any other error is
	// transport / RPC failure — surface so the signing driver can retry.
	exists, err := a.destATAExists(ctx, client, dstATA)
	if err != nil {
		return nil, fmt.Errorf("txassembler: probe destination ATA: %w", err)
	}
	if !exists {
		out = append(out, ata.NewCreateInstruction(payer, recipient, mint).Build())
	}

	out = append(out,
		token.NewTransferInstruction(in.LamportsAmount, srcATA, dstATA, payer, nil).Build(),
	)
	return out, nil
}

// destATAExists checks whether the destination ATA already exists on
// chain by calling getAccountInfo. true ⇒ no need to create. false ⇒
// must prepend the ATA-create instruction.
func (a *SOLAssembler) destATAExists(ctx context.Context, client *rpc.Client, addr solana.PublicKey) (bool, error) {
	res, err := client.GetAccountInfo(ctx, addr)
	if err != nil {
		// solana-go surfaces "account not found" as nil result + nil
		// error in newer releases, but historically also as
		// rpc.ErrNotFound. Handle both shapes.
		if errors.Is(err, rpc.ErrNotFound) {
			return false, nil
		}
		// "could not find account" appears in some error strings —
		// fall through to the substring check so we don't false-flag
		// transient RPC errors as missing accounts.
		low := strings.ToLower(err.Error())
		if strings.Contains(low, "could not find account") || strings.Contains(low, "account not found") {
			return false, nil
		}
		return false, err
	}
	if res == nil || res.Value == nil {
		return false, nil
	}
	return true, nil
}

// =============================================================================
// Finalize
// =============================================================================

// SOLSignatureLen is the canonical Ed25519 signature size. Used by
// Finalize as a contract assertion before slotting the bytes in.
const SOLSignatureLen = 64

// Finalize takes the 64-byte Ed25519 signature from the MPC cluster
// and produces the wire-ready transaction as a base64 string.
//
// `sig` must be the raw 64-byte Ed25519 signature over MessageBytes.
// (Solana signatures are not "recoverable" — they're plain EdDSA with
// no v byte and no canonicalization.)
//
// The returned rawTxBase64 is ready to ship to JSON-RPC sendTransaction
// with `{encoding: "base64"}`. The returned signature is base58-encoded
// (Solana's canonical "tx hash" identifier).
func (a *SOLAssembler) Finalize(unsigned *SOLUnsigned, sig [SOLSignatureLen]byte) (rawTxBase64, signature string, err error) {
	if unsigned == nil || unsigned.tx == nil {
		return "", "", errors.New("txassembler: nil SOLUnsigned (call PreSign first)")
	}
	if len(unsigned.tx.Message.AccountKeys) == 0 {
		return "", "", errors.New("txassembler: SOLUnsigned has empty AccountKeys (corrupt message)")
	}
	// Sanity: account[0] must be the payer (canonical Solana convention).
	// solana.NewTransaction with TransactionPayer enforces this; reassert
	// to catch any future regression.
	if !unsigned.tx.Message.AccountKeys[0].Equals(unsigned.payer) {
		return "", "", fmt.Errorf("txassembler: account[0] %s != payer %s",
			unsigned.tx.Message.AccountKeys[0].String(),
			unsigned.payer.String(),
		)
	}

	var solSig solana.Signature
	copy(solSig[:], sig[:])

	// Solana wire requires len(signatures) == header.NumRequiredSignatures.
	// For the bridge's release flow that's always 1 (just the payer).
	unsigned.tx.Signatures = []solana.Signature{solSig}

	raw, err := unsigned.tx.MarshalBinary()
	if err != nil {
		return "", "", fmt.Errorf("txassembler: marshal SOL tx: %w", err)
	}

	return base64.StdEncoding.EncodeToString(raw), solSig.String(), nil
}

// =============================================================================
// Signature byte conversion
// =============================================================================

// ParseSOLSignatureHex decodes a hex-encoded Ed25519 signature into a
// fixed-size 64-byte buffer. The dashboard returns Ed25519 signatures
// as 128 hex characters (64 bytes) in the "signature" JSON field;
// SignForWalletOnCurve doesn't post-process them, so the caller (the
// signing driver) parses them here.
//
// Accepts the input with or without a 0x prefix. Returns an error if
// the decoded length isn't exactly 64 bytes.
func ParseSOLSignatureHex(s string) ([SOLSignatureLen]byte, error) {
	var out [SOLSignatureLen]byte
	s = strings.TrimPrefix(strings.TrimPrefix(s, "0x"), "0X")
	if len(s) != SOLSignatureLen*2 {
		return out, fmt.Errorf("txassembler: SOL signature must be %d bytes (%d hex chars), got %d hex chars",
			SOLSignatureLen, SOLSignatureLen*2, len(s))
	}
	dec, err := hex.DecodeString(s)
	if err != nil {
		return out, fmt.Errorf("txassembler: decode SOL signature hex: %w", err)
	}
	copy(out[:], dec)
	return out, nil
}

// LamportsFromFloat converts a human-readable SOL/SPL amount to lamports
// (uint64) safely. decimals is the asset's decimals — 9 for native
// SOL, varies for SPL tokens. Rounds half-away-from-zero on the last
// digit to avoid silently dropping sub-lamport precision.
//
// Returns ErrSOLAmountOverflow when the result exceeds uint64; the
// bridge's typical amounts are well under that, so an overflow means
// the caller passed a corrupt input.
var ErrSOLAmountOverflow = errors.New("txassembler: SOL amount overflows uint64")

func LamportsFromFloat(amount float64, decimals int) (uint64, error) {
	if amount < 0 {
		return 0, fmt.Errorf("txassembler: SOL amount must be non-negative; got %v", amount)
	}
	if amount == 0 {
		return 0, nil
	}
	scale := math.Pow10(decimals)
	scaled := amount * scale
	if math.IsInf(scaled, 0) || math.IsNaN(scaled) || scaled > math.MaxUint64 {
		return 0, ErrSOLAmountOverflow
	}
	// Banker-style rounding to whole lamports.
	return uint64(math.Round(scaled)), nil
}

// =============================================================================
// Helpers
// =============================================================================

// SOLDefaultBlockhashURL returns the default getLatestBlockhash URL for
// a known Solana network. Used by the bridge startup wiring when the
// operator hasn't supplied a custom URL via config / overrides.
func SOLDefaultBlockhashURL(network string) string {
	switch network {
	case "SOLANA_MAINNET":
		return "https://api.mainnet-beta.solana.com"
	case "SOLANA_DEVNET":
		return "https://api.devnet.solana.com"
	case "SOLANA_TESTNET":
		return "https://api.testnet.solana.com"
	default:
		return ""
	}
}
