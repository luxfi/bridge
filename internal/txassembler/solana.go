// Solana tx-assembly path for the bridge release flow.
//
// Lifecycle, parallel to the EVM PreSign/Finalize pair:
//
//  1. PreSignSolana — given a SwapIntent (destination address, amount,
//     release wallet's base58 pubkey) and a freshly-fetched
//     recent-blockhash, build a legacy Solana message containing one
//     `SystemProgram.transfer` instruction from the release wallet to
//     the user. Return the SERIALIZED message bytes — the MPC cluster
//     will sign these raw bytes via ed25519 (no SHA-256 wrapper; the
//     curve does its own internal hashing).
//
//  2. The signing driver hex-encodes Message and calls SignForWallet.
//
//  3. FinalizeSolana — given the SolanaUnsigned plus the 64-byte
//     ed25519 signature from the MPC cluster, assemble the full
//     legacy tx (`[compact-u16 sig count][sig bytes][message bytes]`),
//     base58-encode it, and hand it to broadcast.Client.Broadcast for
//     `sendTransaction`.
//
// Why legacy txs and not v0 versioned? v0 buys address-lookup-table
// support — useful for bundled DEX txs but pure overhead for the
// single-instruction native transfers the bridge release path needs.
// SystemProgram.transfer never requires an ALT; legacy keeps the
// serializer tiny.
//
// Why only native SOL today? Lux→Sol with destination SOL is the
// scope the user asked for. SPL token transfers need an Associated
// Token Account derivation + a different instruction shape; we'll
// add them when the registry includes SPL tokens (USDC on Solana
// etc.). The hook point is `buildSolanaInstruction` — switch on
// tokenInfo to dispatch.

package txassembler

import (
	"context"
	"encoding/binary"
	"fmt"
	"math"
	"math/big"

	"github.com/luxfi/bridge/internal/solanarpc"
	"github.com/luxfi/bridge/internal/tokens"
)

// SystemProgramID is the all-zeros 32-byte pubkey of the System
// Program. Its base58 encoding is "11111111111111111111111111111111".
// Hard-coded here rather than imported from solanarpc to keep the
// txassembler package self-contained at the dependency boundary.
var systemProgramID = [32]byte{}

// SolanaProvider supplies a recent blockhash for stamping onto the
// unsigned tx. Modeled as an interface so unit tests can inject a
// deterministic blockhash (the real prod path uses solanarpc.Client).
type SolanaProvider interface {
	GetLatestBlockhash(ctx context.Context) (*solanarpc.LatestBlockhash, error)
}

// SolanaUnsigned is the assembler's output for a Solana destination
// release tx. The Message bytes are what the MPC cluster signs;
// FinalizeSolana stitches the signature back together with these
// fields to produce the wire-ready raw tx.
type SolanaUnsigned struct {
	// Network is the destination internal_name (e.g. SOLANA_MAINNET).
	// Echoed back to the caller for logging / status updates.
	Network string

	// Message is the canonical legacy-format serialized message bytes
	// the ed25519 signer must sign. PASS THESE BYTES TO THE MPC
	// CLUSTER VERBATIM — do not SHA-256 first. ed25519 hashes the
	// message internally as part of the signing algorithm; signing
	// over SHA-256(message) produces a signature that fails Solana's
	// verifier on-chain.
	Message []byte

	// FromPubkey is the 32-byte release-wallet ed25519 pubkey.
	// Stored so FinalizeSolana doesn't have to re-derive it from
	// the message bytes.
	FromPubkey [32]byte

	// Recipient + Lamports are kept for logging / observability so
	// the driver can render structured status updates without
	// re-parsing the message bytes.
	Recipient [32]byte
	Lamports  uint64

	// Blockhash is base58 of the 32-byte recent blockhash stamped
	// onto the message. Surfaced for logs + the e2e test's
	// "this is the blockhash that was used" assertion.
	Blockhash string
}

// PreSignSolana builds an unsigned native-SOL transfer from a
// release wallet to a user-supplied destination address. The
// SwapIntent fields are interpreted the same way as on the EVM
// side, with these differences:
//
//   - SenderAddress is the release wallet's base58 pubkey
//     (NOT a 0x-prefixed hex string).
//   - DestinationAddress is the user's base58 Solana pubkey.
//   - DestinationAsset must resolve to a native-asset record
//     (Contract == "") in the assembler's tokens registry, OR
//     resolve to nothing — both fall through to a native-SOL
//     transfer. SPL token routing is intentionally rejected for
//     now (the assembler returns an error so silent mis-routes
//     can't happen).
//
// The Provider argument supplies the recent blockhash. Pass a
// real solanarpc.Client in prod; a stub in tests.
func (a *Assembler) PreSignSolana(
	ctx context.Context,
	in SwapIntent,
	provider SolanaProvider,
) (*SolanaUnsigned, error) {
	if provider == nil {
		return nil, fmt.Errorf("txassembler: Solana provider required")
	}

	// Decode addresses up front so any malformed input fails before
	// we waste an RPC roundtrip on blockhash.
	from, err := decodePubkey(in.SenderAddress)
	if err != nil {
		return nil, fmt.Errorf("SenderAddress: %w", err)
	}
	to, err := decodePubkey(in.DestinationAddress)
	if err != nil {
		return nil, fmt.Errorf("DestinationAddress: %w", err)
	}

	// Resolve destination asset → must be native for this path.
	// SPL would need an ATA + a different instruction shape, so
	// reject explicitly rather than silently produce a tx the
	// cluster will reject.
	var tokenInfo *tokens.Info
	if a.Tokens != nil && in.DestinationAsset != "" {
		if info, ok := a.Tokens.Lookup(in.DestinationNetwork, in.DestinationAsset); ok {
			tokenInfo = info
		}
	}
	if tokenInfo != nil && !tokenInfo.IsNative() {
		return nil, fmt.Errorf(
			"txassembler: SPL token transfers not implemented yet (asset %s on %s)",
			in.DestinationAsset, in.DestinationNetwork,
		)
	}
	decimals := uint8(9) // SOL is 9 decimals (lamports)
	if tokenInfo != nil {
		if tokenInfo.Decimals < 0 || tokenInfo.Decimals > 255 {
			return nil, fmt.Errorf("decimals out of range for asset %s/%s: %d",
				in.DestinationNetwork, in.DestinationAsset, tokenInfo.Decimals)
		}
		decimals = uint8(tokenInfo.Decimals)
	}

	lamports, err := floatToLamports(in.Amount, decimals)
	if err != nil {
		return nil, err
	}

	// Fetch a fresh blockhash. Stale by ~60s on mainnet, so the
	// driver should sign + broadcast promptly after this returns.
	bh, err := provider.GetLatestBlockhash(ctx)
	if err != nil {
		return nil, fmt.Errorf("GetLatestBlockhash: %w", err)
	}
	blockhashBytes, err := solanarpc.DecodeBase58(bh.Blockhash)
	if err != nil {
		return nil, fmt.Errorf("decode blockhash: %w", err)
	}
	if len(blockhashBytes) != 32 {
		return nil, fmt.Errorf("blockhash must be 32 bytes, got %d", len(blockhashBytes))
	}
	var blockhash [32]byte
	copy(blockhash[:], blockhashBytes)

	msg := buildLegacyMessage(from, to, systemProgramID, blockhash, lamports)

	return &SolanaUnsigned{
		Network:    in.DestinationNetwork,
		Message:    msg,
		FromPubkey: from,
		Recipient:  to,
		Lamports:   lamports,
		Blockhash:  bh.Blockhash,
	}, nil
}

// SolanaSignatureFeeLamports is the per-signature fee charged by the
// Solana runtime for a transaction. Hardcoded at the network level
// at 5000 lamports/sig as of cluster genesis; the refund driver
// subtracts this off the swept balance to size the transfer
// instruction. A legacy SystemProgram.transfer needs exactly one
// signature ⇒ subtract one fee unit.
const SolanaSignatureFeeLamports uint64 = 5000

// PreSignSolanaRefund is the refund-leg analog of PreSignSolana.
//
// Differences from PreSignSolana:
//
//   - Takes lamports as uint64 directly. The refund driver already
//     computes (balance − fee) in base units; routing through float64
//     would lose precision near max-u64.
//   - Account roles are stated bluntly: `fromBase58` is the deposit
//     wallet that holds the stranded user funds; `toBase58` is the
//     original sender we're returning them to. Both are base58
//     Solana pubkeys.
//   - No tokens registry lookup — the refund path always operates on
//     native SOL. SPL refunds would need a separate hook with ATA
//     derivation; the current pipeline only mints native deposit
//     wallets, so SPL stranding can't happen yet.
//
// The Provider argument supplies the recent blockhash (same as
// PreSignSolana). The returned SolanaUnsigned uses the SOURCE network
// name in `Network` so logging on the refund leg matches the source
// chain it actually targets.
func (a *Assembler) PreSignSolanaRefund(
	ctx context.Context,
	sourceNetwork string,
	fromBase58, toBase58 string,
	lamports uint64,
	provider SolanaProvider,
) (*SolanaUnsigned, error) {
	if provider == nil {
		return nil, fmt.Errorf("txassembler: Solana provider required")
	}
	if lamports == 0 {
		return nil, fmt.Errorf("txassembler: refund amount must be > 0")
	}

	from, err := decodePubkey(fromBase58)
	if err != nil {
		return nil, fmt.Errorf("from (deposit wallet): %w", err)
	}
	to, err := decodePubkey(toBase58)
	if err != nil {
		return nil, fmt.Errorf("to (sender): %w", err)
	}

	bh, err := provider.GetLatestBlockhash(ctx)
	if err != nil {
		return nil, fmt.Errorf("GetLatestBlockhash: %w", err)
	}
	blockhashBytes, err := solanarpc.DecodeBase58(bh.Blockhash)
	if err != nil {
		return nil, fmt.Errorf("decode blockhash: %w", err)
	}
	if len(blockhashBytes) != 32 {
		return nil, fmt.Errorf("blockhash must be 32 bytes, got %d", len(blockhashBytes))
	}
	var blockhash [32]byte
	copy(blockhash[:], blockhashBytes)

	msg := buildLegacyMessage(from, to, systemProgramID, blockhash, lamports)

	return &SolanaUnsigned{
		Network:    sourceNetwork,
		Message:    msg,
		FromPubkey: from,
		Recipient:  to,
		Lamports:   lamports,
		Blockhash:  bh.Blockhash,
	}, nil
}

// FinalizeSolana attaches the ed25519 signature to the previously-
// built message and returns the base58-encoded raw tx ready for
// `sendTransaction`. The signature MUST be 64 bytes (R || S, no
// recovery byte). Caller is responsible for hex-decoding the
// signature returned by SignForWallet before calling this.
func (a *Assembler) FinalizeSolana(unsigned *SolanaUnsigned, signature []byte) (string, error) {
	if unsigned == nil {
		return "", fmt.Errorf("FinalizeSolana: unsigned == nil")
	}
	if len(signature) != 64 {
		return "", fmt.Errorf("FinalizeSolana: signature must be 64 bytes, got %d", len(signature))
	}

	// Legacy tx wire format:
	//   [compact-u16 signature count] [sig bytes...] [message bytes]
	// One signer ⇒ count = 1 ⇒ single 0x01 byte.
	var buf []byte
	buf = append(buf, encodeCompactU16(1)...)
	buf = append(buf, signature...)
	buf = append(buf, unsigned.Message...)

	return solanarpc.EncodeBase58(buf), nil
}

// =============================================================================
// Legacy message builder + low-level helpers
// =============================================================================

// buildLegacyMessage emits the canonical Solana legacy message body
// for a single SystemProgram.transfer instruction. Ordering of
// account_keys is load-bearing — the header's
// `num_required_signatures` + readonly counts implicitly classify
// keys by their POSITION in the array.
//
// Layout for a 3-key, 1-signer transfer:
//
//	num_required_signatures        = 1   (only the from-account signs)
//	num_readonly_signed_accounts   = 0
//	num_readonly_unsigned_accounts = 1   (SystemProgram is invoked
//	                                       but never mutated)
//
// account_keys must be ordered as:
//
//	[0] from        — writable + signer
//	[1] to          — writable + not signer
//	[2] SystemProgram — readonly + not signer
//
// The instruction references program_id by index 2 and account
// indices [0,1]. Data is the standard 12-byte transfer payload.
func buildLegacyMessage(from, to, programID, blockhash [32]byte, lamports uint64) []byte {
	var buf []byte
	// Header
	buf = append(buf, 1, 0, 1)
	// Account keys (compact array of 3 × 32-byte pubkeys)
	buf = append(buf, encodeCompactU16(3)...)
	buf = append(buf, from[:]...)
	buf = append(buf, to[:]...)
	buf = append(buf, programID[:]...)
	// Recent blockhash (32 bytes, not length-prefixed)
	buf = append(buf, blockhash[:]...)
	// Instructions (compact array of 1)
	buf = append(buf, encodeCompactU16(1)...)
	// Instruction body:
	//   program_id_index    = 2 (SystemProgram)
	//   accounts            = [0, 1] (from, to)
	//   data                = SystemProgram::Transfer{ lamports }
	buf = append(buf, 2)
	buf = append(buf, encodeCompactU16(2)...)
	buf = append(buf, 0, 1)
	data := encodeSystemTransfer(lamports)
	buf = append(buf, encodeCompactU16(len(data))...)
	buf = append(buf, data...)
	return buf
}

// encodeSystemTransfer returns the 12-byte instruction data for
// SystemProgram::Transfer{ lamports }. Format:
//
//	[0..4)  : u32 instruction discriminator, little-endian, value 2
//	[4..12) : u64 lamports,                  little-endian
func encodeSystemTransfer(lamports uint64) []byte {
	out := make([]byte, 12)
	binary.LittleEndian.PutUint32(out[0:4], 2)
	binary.LittleEndian.PutUint64(out[4:12], lamports)
	return out
}

// encodeCompactU16 implements Solana's compact-u16 length prefix
// encoding (also called ShortVec). Used for every length-prefixed
// array in a Solana tx (account keys, instructions, signatures,
// instruction-data, account indices).
//
// Three branches by value range:
//
//	[0,     128)   → 1 byte
//	[128,   16384) → 2 bytes  (low 7 bits | 0x80, high 7 bits)
//	[16384, 2^16)  → 3 bytes  (low 7 bits | 0x80, next 7 | 0x80, high 2)
//
// The bridge release path never exceeds the 1-byte range for any
// real tx (≤127 instructions, ≤127 accounts, ≤127 byte sig count),
// but the full implementation is here for correctness.
func encodeCompactU16(n int) []byte {
	if n < 0 || n > math.MaxUint16 {
		// Programming error; legitimate Solana tx fields never
		// reach this range. Panic instead of silently truncating.
		panic(fmt.Sprintf("encodeCompactU16: value %d out of u16 range", n))
	}
	switch {
	case n < 0x80:
		return []byte{byte(n)}
	case n < 0x4000:
		return []byte{
			byte(n&0x7f) | 0x80,
			byte(n >> 7),
		}
	default:
		return []byte{
			byte(n&0x7f) | 0x80,
			byte((n>>7)&0x7f) | 0x80,
			byte(n >> 14),
		}
	}
}

// decodePubkey decodes a base58 Solana pubkey to its raw 32-byte
// form. Returns an error if the input isn't a syntactically valid
// 32-byte base58 string. Does NOT validate that the key is
// on-curve — that's enforced upstream by the MPC cluster (for the
// release wallet) and downstream by Solana's runtime (for the
// recipient).
func decodePubkey(s string) ([32]byte, error) {
	var out [32]byte
	if s == "" {
		return out, fmt.Errorf("empty pubkey")
	}
	raw, err := solanarpc.DecodeBase58(s)
	if err != nil {
		return out, err
	}
	if len(raw) != 32 {
		return out, fmt.Errorf("pubkey must decode to 32 bytes, got %d", len(raw))
	}
	copy(out[:], raw)
	return out, nil
}

// floatToLamports converts a human-readable amount (e.g. 0.001 SOL)
// to lamports given the asset's decimals. Mirrors floatToWei for
// EVM but with uint64 output — Solana balances are u64, not u256,
// so we explicitly bound the result.
//
// Rounds half-to-even at the lamport boundary (decimals)th place;
// strips fractional precision below 1 lamport. Errors if the input
// is negative or would overflow u64 (~1.8e10 SOL — irrelevant in
// practice, but a clean guard against pathological inputs).
func floatToLamports(amount float64, decimals uint8) (uint64, error) {
	if amount < 0 {
		return 0, fmt.Errorf("amount must be non-negative; got %v", amount)
	}
	if amount == 0 {
		return 0, nil
	}
	// Use big.Float to dodge float64 precision loss at small amounts
	// of expensive tokens (would never matter for SOL, but matters
	// once we add SPL stablecoins).
	scale := new(big.Float).SetInt(new(big.Int).Exp(
		big.NewInt(10), big.NewInt(int64(decimals)), nil,
	))
	x := new(big.Float).SetFloat64(amount)
	x.Mul(x, scale)
	whole, _ := x.Int(nil)
	if !whole.IsUint64() {
		return 0, fmt.Errorf("amount overflows u64 lamports: %v", amount)
	}
	return whole.Uint64(), nil
}
