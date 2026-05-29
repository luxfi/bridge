// Copyright (C) 2019-2026, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

package mchain

// Protocol names the threshold-signature PROTOCOL the MPC cluster runs.
//
// Curve answers "what mathematical structure does the signature live in?"
// (secp256k1, ed25519). Protocol answers "what threshold sign ceremony
// produces it?" (cggmp21, frost, pulsar, corona, …). The two are
// orthogonal — pulsar produces secp256k1 signatures, frost produces
// ed25519 signatures, and a single curve admits several protocols.
//
// Lux protocol matrix as exposed by mpcd (luxfi/mpc/cmd/mpcd):
//
//	classical, ECDSA  ─ cggmp21          (default for secp256k1)
//	classical, EdDSA  ─ frost            (default for ed25519, sr25519)
//	classical, pairing ─ bls             (BLS12-381 aggregate)
//	2-of-2 ECDSA      ─ doerner          (OT-based)
//	post-quantum, MLWE ─ pulsar-m-65 / pulsar-m-87
//	post-quantum, RLWE ─ corona
//	post-quantum, hash-based ─ magnetar  (per-validator standalone)
//
// Empty Protocol means "let the daemon choose based on curve" — the
// pre-Protocol behaviour, preserved for backward compatibility. Existing
// SignForWalletOnCurve call paths continue to work unchanged.
//
// Wire format: the string value is the field the daemon expects. mpcd
// accepts these literally in the request body's `protocol` field — see
// pkg/api/handlers.go for the dispatch table.
type Protocol string

const (
	// ProtocolDefault means "infer from curve" — equivalent to omitting
	// the field. ECDSA → cggmp21, EdDSA → frost.
	ProtocolDefault Protocol = ""

	// ProtocolCGGMP21 is the canonical threshold-ECDSA protocol from
	// Canetti-Gennaro-Makriyannis-Peled 2021. secp256k1 + variants.
	ProtocolCGGMP21 Protocol = "cggmp21"

	// ProtocolFROST is the canonical threshold-Schnorr/EdDSA protocol.
	// Drives ed25519 (SOL, TON), sr25519 (DOT).
	ProtocolFROST Protocol = "frost"

	// ProtocolBLS is BLS12-381 aggregate-signature threshold. Used for
	// the classical Beam lane in Warp 2.0 envelopes.
	ProtocolBLS Protocol = "bls"

	// ProtocolDoerner is the 2-of-2 OT-based ECDSA from Doerner-Kondi-
	// Lee-shelat. Niche threshold = exactly 2.
	ProtocolDoerner Protocol = "doerner"

	// ProtocolPulsarM65 is the Module-LWE threshold signature at NIST
	// Category 1 (M-65 parameter set, ≈ 128-bit classical security).
	// PQ-safe, leaderless, permissionless-safe by design. Default PQ
	// lane for general bridge swaps.
	ProtocolPulsarM65 Protocol = "pulsar-m-65"

	// ProtocolPulsarM87 is Pulsar at NIST Category 3 (M-87 parameter
	// set, ≈ 192-bit classical security). Reserved for higher-value
	// strict-PQ flows.
	ProtocolPulsarM87 Protocol = "pulsar-m-87"

	// ProtocolCorona is the Ring-LWE specialisation of Pulsar (rank-1
	// MLWE collapses to RLWE). Production R-LWE lane on Lux primary
	// network — wired into Warp 2.0 Pulse, see luxfi/warp/pulsar.
	// PQ-safe.
	ProtocolCorona Protocol = "corona"

	// ProtocolMagnetar is FIPS 205 SLH-DSA, hash-based PQ signature.
	// Per-validator standalone primitive — NOT true threshold without
	// trusted dealer (Bonte-Smart-Tan 2023). Reserved for public-BFT
	// consensus aggregate certificate (QuasarCert).
	ProtocolMagnetar Protocol = "magnetar"
)

// IsPostQuantum reports whether p is PQ-safe.
//
// True for: pulsar-m-65, pulsar-m-87, corona, magnetar.
// False for: cggmp21, frost, bls, doerner. ProtocolDefault returns
// false — the inferred default is always classical.
func (p Protocol) IsPostQuantum() bool {
	switch p {
	case ProtocolPulsarM65, ProtocolPulsarM87, ProtocolCorona, ProtocolMagnetar:
		return true
	default:
		return false
	}
}

// CompatibleCurve returns the Curve a given Protocol produces signatures
// on. The mapping is one-to-one for every protocol the bridge cares about:
//
//	cggmp21 / pulsar-m-65 / pulsar-m-87 / corona / doerner → secp256k1
//	frost                                                  → ed25519
//	bls                                                    → bls12-381 (out-of-band; Curve enum does not list it)
//	magnetar                                               → slh-dsa (out-of-band)
//
// Returns ProtocolDefault → CurveSecp256k1 as the conservative default.
// BLS and Magnetar are intentionally NOT routed through the Curve enum —
// the bridge uses Curve for ECDSA/EdDSA family selection only; BLS and
// hash-based signatures take separate code paths.
func (p Protocol) CompatibleCurve() Curve {
	switch p {
	case ProtocolFROST:
		return CurveEd25519
	default:
		return CurveSecp256k1
	}
}

// ProtocolFor returns the canonical protocol for a given curve under the
// classical (non-PQ) default posture. PQ profiles override via the
// SignForWalletOnProtocol path — the bridge daemon's profile gate
// decides whether to pass a PQ protocol hint at all.
//
//	secp256k1 → cggmp21
//	ed25519   → frost
//
// Returns ProtocolDefault for unknown curves so the daemon's own default
// dispatch wins; the bridge MUST NOT silently downgrade to ECDSA when
// faced with an unknown curve.
func ProtocolFor(c Curve) Protocol {
	switch c {
	case CurveSecp256k1:
		return ProtocolCGGMP21
	case CurveEd25519:
		return ProtocolFROST
	default:
		return ProtocolDefault
	}
}
