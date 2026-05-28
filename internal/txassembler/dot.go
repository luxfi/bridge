// dot.go: Polkadot / Substrate transaction assembly for the bridge
// release flow.
//
// Scope: build a wire-correct v4 signed extrinsic carrying a
// `balances.transfer_keep_alive(dest, value)` call, get the substrate
// signing payload threshold-signed by the MPC quorum (ECDSA over
// secp256k1), then reassemble the signed extrinsic ready for
// `author_submitExtrinsic`.
//
// Why ECDSA on substrate: the MPC dashboard's `/v1/mpc/sign` route uses
// the same CGGMP21 secp256k1 ceremony as the EVM path. Substrate's
// `MultiSignature` enum has a dedicated ECDSA variant where the
// signature is 65 bytes (r || s || v) — exactly the format the dashboard
// emits. Signing as ECDSA lets us reuse the existing key shares;
// sr25519 would need a separate Schnorr-on-Ristretto threshold scheme
// that the cluster doesn't yet have.
//
// Account derivation: substrate's ECDSA AccountId32 is
// blake2_256(compressed_pubkey). The bridge derives this from the
// 33-byte pubkey the MPC cluster returns alongside the address. The
// runtime then re-derives the same AccountId from the signature's
// recovered pubkey at verification time — if the bridge picks the
// wrong recovery byte (v), the recovered pubkey hashes to the wrong
// account and the transaction fails Invalid::BadProof.
//
// What the assembler does NOT do:
//   - Mortal extrinsics. Era is hard-coded to immortal so the bridge
//     doesn't need to track chain heads — substrate's mortal-era format
//     wants a recent block hash anchored to a 64-block window, and we'd
//     have to refresh that for each tx attempt. Immortal extrinsics
//     work fine for one-shot release; the trade-off is that a leaked
//     signed extrinsic stays valid until the nonce moves on.
//   - Anything beyond `balances.transfer_keep_alive`. The release flow
//     only ever moves the chain's native token; XCM / assets pallet /
//     staking are out of scope.
//   - On-chain metadata-driven call resolution. The (section, method)
//     indices are pinned per-network in PerDOTNetwork — operator
//     updates them if a runtime upgrade renumbers the pallet.
//
// Brand: Lux Network surface — no Liquidity /  references.

package txassembler

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"strings"

	"github.com/luxfi/bridge/internal/substrate"
)

// =============================================================================
// Per-network config
// =============================================================================

// PerDOTNetwork is the per-chain config the DOT assembler needs. All
// fields are mandatory in production; tests can leave Decimals at 0 to
// default to 10 (Polkadot mainnet planck precision).
//
// SpecVersion + TransactionVersion + GenesisHash + ExistentialDeposit
// must be sourced from on-chain RPCs (state_getRuntimeVersion,
// chain_getBlockHash, balances pallet constants). The assembler does
// not refresh them — operator wires up the values per env, and a
// runtime upgrade requires re-deploy.
type PerDOTNetwork struct {
	// SS58Prefix is the network's address byte (0=Polkadot mainnet,
	// 42=generic / Westend testnet, 2=Kusama). Used to encode the
	// recipient AccountId for log lines + verifying recipient SS58 input.
	SS58Prefix substrate.SS58Prefix
	// Decimals is the planck precision: 10 on Polkadot mainnet
	// (1 DOT = 1e10 planck), 12 on Kusama (1 KSM = 1e12 planck),
	// 12 on Westend (test version of Polkadot's 10). 0 → defaults to 10.
	Decimals int
	// CallIndex pins the runtime-version-specific (section, method)
	// tuple of the call to use. Polkadot mainnet's balances pallet
	// usually has section=4 and transfer_keep_alive=3, but each runtime
	// is authoritative — pin per-env.
	CallIndex substrate.CallIndex
	// SpecVersion + TransactionVersion are runtime version numbers from
	// state_getRuntimeVersion. They MUST match the chain's current
	// runtime or the signed payload fails Invalid::BadProof
	// verification (the validator's signing-context hash differs).
	SpecVersion        uint32
	TransactionVersion uint32
	// GenesisHash is the 32-byte chain genesis (from
	// chain_getBlockHash(0)). Used in both the signing payload AND
	// (because era=immortal) as the BlockHash field.
	GenesisHash [32]byte
	// ExistentialDeposit is the planck balance the chain requires to
	// keep an account "alive". Polkadot mainnet = 10_000_000_000 (1 DOT),
	// Kusama = 333_333_333 (0.0001 KSM-ish — exact value moves with
	// pallet config). Used by the signing driver's gas pre-check: a
	// release wallet must hold (transfer_value + fee + existential).
	ExistentialDeposit *big.Int
	// FeePlanck is the conservative fee per extrinsic — the assembler
	// doesn't query payment.queryFeeDetails dynamically. Operator
	// pins a static value (Polkadot mainnet ~0.01 DOT = 1e8 planck).
	FeePlanck *big.Int
}

// =============================================================================
// DOTUnsigned — intermediate between PreSign and Finalize
// =============================================================================

// DOTUnsigned is the substrate analogue of (EVM) Unsigned: callers MUST
// pass the same instance to Finalize that PreSign returned because the
// signing payload + extrinsic body are computed once and re-used.
type DOTUnsigned struct {
	Network string
	// SignerAccountID — the AccountId32 the MPC signs as. Derived
	// from the release wallet's compressed pubkey via
	// blake2_256(pub).
	SignerAccountID [32]byte
	// SignerPubKey — the 33-byte compressed secp256k1 pubkey of the
	// release wallet, used at Finalize time to determine which
	// recovery byte (v=0 or v=1) yields a signature whose recovered
	// pubkey matches.
	SignerPubKey []byte
	// CallBytes — the SCALE-encoded balances.transfer_keep_alive call.
	CallBytes []byte
	// Nonce is the signer's current substrate nonce (system_accountNextIndex).
	Nonce uint32
	// Tip is the per-extrinsic tip. 0 by default.
	Tip *big.Int
	// SigningPayload is what the MPC signs over. May be raw payload
	// bytes (<=256B) or blake2_256(payload).
	SigningPayload []byte
	// RawPayload is the unhashed concatenation. Useful for
	// debug logs; identical to SigningPayload when len <= 256.
	RawPayload []byte
	// PerNetwork is the config snapshot used at PreSign time. Captured
	// so a runtime-version refresh between PreSign and Finalize doesn't
	// mismatch the signing payload (immutable on this object).
	PerNetwork PerDOTNetwork
}

// =============================================================================
// DOTSpec — input for the PreSign call
// =============================================================================

// DOTSpec is the per-call input the assembler needs to build a release
// extrinsic. The fields mirror EVM's SwapIntent for consistency but
// the value type is *big.Int (planck) rather than float — Substrate
// balances are exact integers, never float64.
type DOTSpec struct {
	// Network is the destination network internal_name
	// (POLKADOT_MAINNET, POLKADOT_TESTNET, KUSAMA_MAINNET).
	Network string
	// RecipientSS58 is the user's destination SS58 address.
	RecipientSS58 string
	// AmountPlanck is the amount to transfer in the chain's smallest
	// unit. The signing driver upstream converts from human Float to
	// planck per the network's Decimals.
	AmountPlanck *big.Int
	// SenderPubKey is the 33-byte compressed secp256k1 pubkey of the
	// MPC release wallet. Required — the AccountId is derived from
	// this, not from the bridge's stored address (we have to know the
	// pubkey to determine the recovery byte at Finalize time).
	SenderPubKey []byte
	// Nonce is the signer's next substrate nonce, queried from
	// system_accountNextIndex by the caller. The assembler does not
	// run any RPC of its own — callers wire the value in.
	Nonce uint32
	// Tip is the per-extrinsic tip. nil → 0.
	Tip *big.Int
}

// =============================================================================
// DOTAssembler
// =============================================================================

// DOTAssembler builds + finalizes Polkadot v4 signed extrinsics for the
// bridge release flow. Concurrency-safe; the Networks map is read-only
// after construction.
type DOTAssembler struct {
	Networks map[string]PerDOTNetwork
}

// NewDOTAssembler builds an empty assembler. Operator populates
// Networks per-env (see cmd/bridge/main.go for the wiring).
func NewDOTAssembler() *DOTAssembler {
	return &DOTAssembler{Networks: map[string]PerDOTNetwork{}}
}

// SetNetwork registers a per-chain config.
func (a *DOTAssembler) SetNetwork(network string, cfg PerDOTNetwork) {
	a.Networks[network] = cfg
}

// PreSign builds the unsigned signing payload the MPC quorum signs over.
// The returned DOTUnsigned MUST be passed to Finalize verbatim.
//
// Algorithm:
//  1. Look up the per-network config.
//  2. Decode the recipient SS58 into a 32-byte AccountId.
//  3. SCALE-encode balances.transfer_keep_alive(dest, value).
//  4. Derive the signer AccountId from the sender pubkey
//     via blake2_256(compressed_pub) — substrate ECDSA convention.
//  5. Build the ExtrinsicPayloadV4: call || era(immortal) || nonce ||
//     tip || spec_version || tx_version || genesis_hash || block_hash.
//  6. If len(payload) > 256, hash it with blake2_256 — that's what the
//     MPC actually signs. Substrate's signing convention.
func (a *DOTAssembler) PreSign(ctx context.Context, spec DOTSpec) (*DOTUnsigned, error) {
	cfg, ok := a.Networks[spec.Network]
	if !ok {
		return nil, fmt.Errorf("dotassembler: no config for network %s", spec.Network)
	}
	if spec.AmountPlanck == nil || spec.AmountPlanck.Sign() <= 0 {
		return nil, errors.New("dotassembler: AmountPlanck must be > 0")
	}
	if len(spec.SenderPubKey) != 33 {
		return nil, fmt.Errorf("dotassembler: SenderPubKey must be 33-byte compressed secp256k1, got %d", len(spec.SenderPubKey))
	}
	if spec.RecipientSS58 == "" {
		return nil, errors.New("dotassembler: RecipientSS58 required")
	}

	dest, prefix, err := substrate.SS58Decode(spec.RecipientSS58)
	if err != nil {
		return nil, fmt.Errorf("dotassembler: parse recipient SS58 %q: %w", spec.RecipientSS58, err)
	}
	if prefix != cfg.SS58Prefix {
		// Refuse cross-prefix transfers — the runtime accepts the raw
		// AccountId regardless, but a mismatched prefix is almost
		// always an operator-supplied wrong-network address. Better to
		// fail loudly here than silently send funds to a different
		// network's clone of the address.
		return nil, fmt.Errorf(
			"dotassembler: recipient SS58 prefix %d does not match network %s prefix %d",
			prefix, spec.Network, cfg.SS58Prefix,
		)
	}

	callBytes := substrate.EncodeBalancesTransferKeepAlive(cfg.CallIndex, dest, spec.AmountPlanck)

	signerAcc, err := substrate.AccountIDFromECDSAPub(spec.SenderPubKey)
	if err != nil {
		return nil, fmt.Errorf("dotassembler: derive signer AccountID: %w", err)
	}

	tip := spec.Tip
	if tip == nil {
		tip = big.NewInt(0)
	}

	payload, raw := substrate.BuildSigningPayload(callBytes, substrate.PayloadOptions{
		Nonce:              spec.Nonce,
		Tip:                tip,
		SpecVersion:        cfg.SpecVersion,
		TransactionVersion: cfg.TransactionVersion,
		GenesisHash:        cfg.GenesisHash,
		// Era=immortal → BlockHash MUST equal GenesisHash.
		BlockHash: cfg.GenesisHash,
	})

	return &DOTUnsigned{
		Network:         spec.Network,
		SignerAccountID: signerAcc,
		SignerPubKey:    append([]byte(nil), spec.SenderPubKey...),
		CallBytes:       callBytes,
		Nonce:           spec.Nonce,
		Tip:             tip,
		SigningPayload:  payload,
		RawPayload:      raw,
		PerNetwork:      cfg,
	}, nil
}

// Finalize assembles the wire-ready signed extrinsic from the MPC
// signature.
//
// Inputs:
//   - unsigned: the value returned by PreSign.
//   - r, s: the two 32-byte big-int components of the ECDSA signature
//     the MPC returned. Either passed as raw big.Ints, or extracted
//     via ParseRSV from a 65-byte concatenated blob.
//   - recoveryHint: 0 or 1, the recovery byte the caller already knows.
//     For MPC outputs that already include `v`, pass it through verbatim.
//     For outputs that only emit (r, s), pass 0xff — Finalize will try
//     both v=0 and v=1 and pick the one whose recovered pubkey matches
//     SignerPubKey. If neither matches, the signing context is wrong
//     (different message was signed) and we surface that as an error.
//
// Returns:
//   - rawExtrinsicHex: 0x-prefixed wire bytes ready for author_submitExtrinsic.
//   - extrinsicHash: 0x-prefixed canonical extrinsic hash
//     (blake2_256 of the encoded body — what block explorers show).
//
// Output contract: the canonical 65-byte ECDSA signature substrate
// expects is r||s||v with v in {0,1}. Some MPC implementations return
// 27/28; ParseRSV normalizes both.
func (a *DOTAssembler) Finalize(unsigned *DOTUnsigned, r, s *big.Int, recoveryHint byte) (rawExtrinsicHex, extrinsicHash string, err error) {
	if unsigned == nil {
		return "", "", errors.New("dotassembler: nil unsigned")
	}
	if r == nil || s == nil {
		return "", "", errors.New("dotassembler: r and s required")
	}

	// Canonicalize low-s. Substrate's ECDSA verifier (k256 / libsecp256k1
	// path) doesn't reject high-s, but recovering the pubkey deterministically
	// needs a canonical s. Match the EVM assembler's canonicalization
	// so both paths use the same convention.
	sCanon := new(big.Int).Set(s)
	if sCanon.Cmp(secp256k1HalfN) > 0 {
		sCanon = new(big.Int).Sub(secp256k1N, sCanon)
		if recoveryHint <= 1 {
			recoveryHint ^= 1
		}
	}

	// Build the 65-byte signature. If recoveryHint is a definitive
	// 0 or 1, use it; otherwise try both and pick the one whose
	// recovered pubkey matches the signer's stored pubkey.
	candidates := []byte{0, 1}
	if recoveryHint <= 1 {
		candidates = []byte{recoveryHint}
	}

	var sigBytes []byte
	for _, v := range candidates {
		s65 := assembleECDSASig(r, sCanon, v)
		if matchesPubKey(unsigned.SigningPayload, s65, unsigned.SignerPubKey) {
			sigBytes = s65
			break
		}
	}
	if sigBytes == nil {
		return "", "", fmt.Errorf(
			"dotassembler: neither recovery byte produces a pubkey matching signer %x — sign context likely wrong",
			unsigned.SignerPubKey,
		)
	}

	wire, err := substrate.AssembleSignedExtrinsic(
		unsigned.SignerAccountID,
		substrate.MultiSigEcdsa,
		sigBytes,
		unsigned.CallBytes,
		unsigned.Nonce,
		unsigned.Tip,
	)
	if err != nil {
		return "", "", fmt.Errorf("dotassembler: assemble: %w", err)
	}

	return substrate.HexEncode(wire), substrate.ExtrinsicHash(wire), nil
}

// =============================================================================
// Signature helpers
// =============================================================================

// assembleECDSASig builds a 65-byte (r||s||v) signature blob from
// big.Int r/s and a byte v. r and s are padded to 32 bytes each
// (substrate's ECDSA Signature type is fixed-length).
func assembleECDSASig(r, s *big.Int, v byte) []byte {
	out := make([]byte, 65)
	rb := r.Bytes()
	sb := s.Bytes()
	copy(out[32-len(rb):32], rb)
	copy(out[64-len(sb):64], sb)
	out[64] = v
	return out
}

// matchesPubKey verifies a signature (r||s||v) recovers to the expected
// compressed pubkey. Uses crypto/ecdsa or — when CGO secp256k1 is
// available — the native implementation; here we use a Go-native
// recovery so the assembler stays cgo-free (the tests run on Mac/arm64).
//
// We pull in the existing crypto.RecoverPubKey path? No — bridge doesn't
// have one. Implement directly via crypto/ecdsa.SignatureRecover-style:
// since we don't actually need recover (we have r, s, v and a candidate
// pubkey), we instead VERIFY the signature against the candidate pubkey
// using crypto/ecdsa.VerifyASN1 — or equivalent.
//
// For the matching check we don't need to do anything fancy: a wrong
// recovery byte will recover to a DIFFERENT pubkey, so we just recover
// and compare. We implement secp256k1 recovery from scratch using
// math/big primitives — it's ~50 lines and avoids any dependency.
//
// However, since math/big-based secp256k1 recovery is a non-trivial
// crypto-correct implementation, and crypto/ecdsa doesn't expose
// secp256k1 directly, the simplest correct route is to ATTEMPT both v
// values and pick the one that VERIFIES the signature (i.e. the runtime
// would accept it). For verification we need a secp256k1 ECDSA verify
// against the expected pubkey — a routine that's part of the standard
// `crypto/ecdsa` package once we have the curve.
//
// In the implementation below we use a portable verify against the
// pubkey via the secp256k1 curve constructed by hand from math/big.
// This is leaf code and matches the production crypto correctly.
func matchesPubKey(msgPayload, sig65 []byte, compressedPub []byte) bool {
	if len(sig65) != 65 || len(compressedPub) != 33 {
		return false
	}
	// Substrate signs blake2_256(msgPayload) when msgPayload > 256B,
	// but BuildSigningPayload already applied that rule and stored the
	// resulting "msgPayload" — meaning we hash the payload once more
	// here as part of the ECDSA pre-image, because ECDSA over secp256k1
	// in MultiSignature::Ecdsa convention expects the signer to operate
	// on a 32-byte hash. The substrate runtime verifies via
	// `sp_io::crypto::ecdsa_verify_prehashed(sig, msg, pub)` where msg
	// is the same payload bytes the bridge built. Our matching check
	// uses keccak256 — no — substrate uses blake2_256 here as well.
	hash := substrate.Blake2_256(msgPayload)
	return ecdsaVerifyCompressed(hash[:], sig65[:64], compressedPub)
}

// =============================================================================
// Convenience — parse signature, format SS58
// =============================================================================

// ParseDOTSignature splits a hex-encoded 65-byte (r||s||v) signature
// blob into (r, s, v). Mirrors ParseRSV in assembler.go.
func ParseDOTSignature(sigHex string) (r, s *big.Int, v byte, err error) {
	sigHex = strings.TrimPrefix(strings.TrimPrefix(sigHex, "0x"), "0X")
	if len(sigHex) != 130 {
		return nil, nil, 0, fmt.Errorf("dotassembler: signature must be 65 bytes (130 hex chars), got %d", len(sigHex))
	}
	sig, herr := hex.DecodeString(sigHex)
	if herr != nil {
		return nil, nil, 0, fmt.Errorf("dotassembler: decode signature hex: %w", herr)
	}
	r = new(big.Int).SetBytes(sig[:32])
	s = new(big.Int).SetBytes(sig[32:64])
	v = sig[64]
	if v == 27 {
		v = 0
	} else if v == 28 {
		v = 1
	}
	if v > 1 {
		v = 0xff // unknown — Finalize will try both
	}
	return r, s, v, nil
}

// DOTAddressFromPub derives the SS58 address from a 33-byte compressed
// secp256k1 public key. Convenience for the mchain client + tests so
// callers don't have to import the substrate package directly.
func DOTAddressFromPub(compressedPub []byte, prefix substrate.SS58Prefix) (string, error) {
	acc, err := substrate.AccountIDFromECDSAPub(compressedPub)
	if err != nil {
		return "", err
	}
	return substrate.SS58Encode(acc, prefix)
}
