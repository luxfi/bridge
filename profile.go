// Copyright (C) 2019-2026, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

// Package bridge — the top-level Lux bridge / teleport audit gate.
//
// This file is the canonical home for BridgeProfile in the bridge module.
// It mirrors github.com/luxfi/consensus/config.BridgeProfile so bridge-layer
// callers (cmd/bridge, opnet-watcher, app/server, teleport relays) can pin a
// posture without taking the consensus dependency.
//
// One and only one way to label a bridge:
//
//	bridge.LuxStrictPQBridgeProfile   — production E2E-PQ
//	bridge.BridgeClassicalCompat      — classical-compat (e.g. Ethereum L1)
//
// Every bridge entry point — every inbound proof verification, every
// outbound signing call — MUST hold a *BridgeProfile and consult the
// matching Refuse* gate before touching a classical primitive (ecrecover,
// bls.Verify, KZG, Groth16, pairing precompile).
//
// The destination-side ChainSecurityProfile is OUT OF SCOPE for this file:
// a Lux strict-PQ chain may still operate a classical-compat bridge to
// Ethereum; the BRIDGE is the wrapper around that I/O and is labelled
// non-E2E-PQ. The chain's strict-PQ posture is unchanged.
//
// Integration sites (each MUST consult a profile):
//
//	opnet-watcher/signer.go            — ECDSA + threshold ECDSA producers
//	                                     for Teleporter (BridgeClassicalCompat)
//	opnet-watcher/relay.go             — outbound transaction submission
//	cmd/bridge/api.go                  — bridge_getProfile RPC + per-route
//	                                     metadata labelling
//	(future) coreth/precompile/warp    — BLS-aggregate AWM verifier
//	                                     (BridgeClassicalCompat by construction)
package bridge

import (
	"errors"
	"fmt"
	"sync/atomic"
)

// BridgeProfileID is the wire byte that identifies a bridge profile.
// The values MUST match github.com/luxfi/consensus/config.BridgeProfileID;
// the two enums are kept in lockstep by the audit-gate test in this file.
type BridgeProfileID uint32

const (
	BridgeProfileIDNone            BridgeProfileID = 0x00
	BridgeProfileIDLuxStrictPQ     BridgeProfileID = 0x01
	BridgeProfileIDClassicalCompat BridgeProfileID = 0x90
)

// String returns the canonical wire name of the bridge-profile ID.
func (p BridgeProfileID) String() string {
	switch p {
	case BridgeProfileIDNone:
		return "none"
	case BridgeProfileIDLuxStrictPQ:
		return "lux-strict-pq-bridge"
	case BridgeProfileIDClassicalCompat:
		return "bridge-classical-compat-unsafe"
	default:
		return fmt.Sprintf("bridge-profile(0x%08x)", uint32(p))
	}
}

// Finality / proof / auth schemes are kept as opaque string constants
// inside the bridge module. The full uint8 dispatch table lives in the
// consensus package; here we only need to label / refuse, not classify.
//
// Strings match the consensus String() output 1:1 (the audit-gate test
// in profile_test.go pins this).
const (
	SchemePulsarM65 = "pulsar-m-65"
	SchemePulsarM87 = "pulsar-m-87"
	SchemeMLDSA65   = "ml-dsa-65"
	SchemeMLDSA87   = "ml-dsa-87"
	SchemeBLS12381  = "bls12-381"

	PolicySTARKFRISHA3PQ = "stark-fri-sha3-pq"
	PolicyGroth16BN254   = "groth16-bn254-classical-forbidden-in-pq"
	PolicyKZG            = "plonk-kzg-classical-forbidden-in-pq"

	AuthMLDSA87       = "ml-dsa-87"
	AuthMLDSA65       = "ml-dsa-65"
	AuthMultisigMLDSA = "multisig-ml-dsa"
	AuthECDSAUnsafe   = "ecdsa-unsafe-classical-forbidden-in-pq"
	AuthBLSUnsafe     = "bls-unsafe-classical-forbidden-in-pq"

	HashSuiteSHA3NIST = "sha3-nist"
)

// BridgeProfile mirrors github.com/luxfi/consensus/config.BridgeProfile
// for use at the bridge-package layer. See the consensus package for
// the canonical definition + validation logic.
type BridgeProfile struct {
	ProfileID            uint32
	Name                 string
	SourceFinalityScheme string
	DestFinalityScheme   string
	ProofPolicyID        string
	BridgeAdminScheme    string
	BridgePauseScheme    string
	HashSuiteID          string

	AllowsClassicalAdmin    bool
	AllowsBLSAggregate      bool
	AllowsKZGCommitment     bool
	AllowsGroth16Wrap       bool
	AllowsPairingPrecompile bool

	PostQuantumEndToEnd bool
}

// Typed errors. Mirrors consensus/config's error surface; the same
// sentinel values can be checked across both packages.
var (
	ErrBridgeProfileNil       = errors.New("BridgeProfile: nil profile")
	ErrBridgeProfileForbidden = errors.New("BridgeProfile: primitive forbidden by profile")
)

// LuxStrictPQBridgeProfile is the canonical Lux strict-PQ bridge
// posture. See consensus/config.LuxStrictPQBridgeProfile.
var LuxStrictPQBridgeProfile = BridgeProfile{
	ProfileID:               uint32(BridgeProfileIDLuxStrictPQ),
	Name:                    "LUX_STRICT_PQ_BRIDGE",
	SourceFinalityScheme:    SchemePulsarM65,
	DestFinalityScheme:      SchemePulsarM65,
	ProofPolicyID:           PolicySTARKFRISHA3PQ,
	BridgeAdminScheme:       AuthMLDSA87,
	BridgePauseScheme:       AuthMultisigMLDSA,
	HashSuiteID:             HashSuiteSHA3NIST,
	AllowsClassicalAdmin:    false,
	AllowsBLSAggregate:      false,
	AllowsKZGCommitment:     false,
	AllowsGroth16Wrap:       false,
	AllowsPairingPrecompile: false,
	PostQuantumEndToEnd:     true,
}

// BridgeClassicalCompat is the explicit classical-compat profile. See
// consensus/config.BridgeClassicalCompat.
var BridgeClassicalCompat = BridgeProfile{
	ProfileID:               uint32(BridgeProfileIDClassicalCompat),
	Name:                    "BRIDGE_CLASSICAL_COMPAT_UNSAFE",
	SourceFinalityScheme:    SchemeBLS12381,
	DestFinalityScheme:      SchemePulsarM65,
	ProofPolicyID:           PolicySTARKFRISHA3PQ,
	BridgeAdminScheme:       AuthECDSAUnsafe,
	BridgePauseScheme:       AuthECDSAUnsafe,
	HashSuiteID:             HashSuiteSHA3NIST,
	AllowsClassicalAdmin:    true,
	AllowsBLSAggregate:      true,
	AllowsKZGCommitment:     true,
	AllowsGroth16Wrap:       true,
	AllowsPairingPrecompile: true,
	PostQuantumEndToEnd:     false,
}

// IsPostQuantumEndToEnd is the audit-visible label.
func (p *BridgeProfile) IsPostQuantumEndToEnd() bool {
	return p.PostQuantumEndToEnd
}

// RefuseClassicalAdmin is the gate every ecrecover / ECDSA-verify call
// site MUST consult. Returns nil iff the profile allows classical
// admin; emits the bridge_classical_compat_total counter increment.
func (p *BridgeProfile) RefuseClassicalAdmin() error {
	if p == nil {
		return ErrBridgeProfileNil
	}
	if p.AllowsClassicalAdmin {
		incClassicalCompat("admin", p.Name)
		return nil
	}
	return fmt.Errorf("%w: profile %s forbids classical admin (ecrecover/ECDSA/secp256k1)",
		ErrBridgeProfileForbidden, p.Name)
}

// RefuseBLSAggregate gates bls.Verify call sites.
func (p *BridgeProfile) RefuseBLSAggregate() error {
	if p == nil {
		return ErrBridgeProfileNil
	}
	if p.AllowsBLSAggregate {
		incClassicalCompat("bls_aggregate", p.Name)
		return nil
	}
	return fmt.Errorf("%w: profile %s forbids BLS aggregate verification",
		ErrBridgeProfileForbidden, p.Name)
}

// RefuseKZGCommitment gates KZG verification call sites.
func (p *BridgeProfile) RefuseKZGCommitment() error {
	if p == nil {
		return ErrBridgeProfileNil
	}
	if p.AllowsKZGCommitment {
		incClassicalCompat("kzg", p.Name)
		return nil
	}
	return fmt.Errorf("%w: profile %s forbids KZG commitments",
		ErrBridgeProfileForbidden, p.Name)
}

// RefuseGroth16Wrap gates Groth16 verification call sites.
func (p *BridgeProfile) RefuseGroth16Wrap() error {
	if p == nil {
		return ErrBridgeProfileNil
	}
	if p.AllowsGroth16Wrap {
		incClassicalCompat("groth16", p.Name)
		return nil
	}
	return fmt.Errorf("%w: profile %s forbids Groth16 wrappers",
		ErrBridgeProfileForbidden, p.Name)
}

// RefusePairingPrecompile gates BN254 pairing-precompile use.
func (p *BridgeProfile) RefusePairingPrecompile() error {
	if p == nil {
		return ErrBridgeProfileNil
	}
	if p.AllowsPairingPrecompile {
		incClassicalCompat("pairing", p.Name)
		return nil
	}
	return fmt.Errorf("%w: profile %s forbids pairing-precompile use",
		ErrBridgeProfileForbidden, p.Name)
}

// classicalCompatCounters tracks bridge_classical_compat_total per
// primitive. Each call to a Refuse* method that returns nil under a
// classical-compat profile increments the matching counter; operators
// scrape these via the bridge's /metrics endpoint (Prometheus format).
//
// The counter is intentionally simple — atomic uint64 keyed by string —
// so the bridge module stays free of a Prometheus client dependency.
// cmd/bridge wires the counters into its /metrics handler.
type classicalCompatCounter struct {
	admin       atomic.Uint64
	blsAgg      atomic.Uint64
	kzg         atomic.Uint64
	groth16     atomic.Uint64
	pairing     atomic.Uint64
	lastProfile atomic.Value // string
}

var classicalCompatCounters classicalCompatCounter

func incClassicalCompat(primitive, profileName string) {
	classicalCompatCounters.lastProfile.Store(profileName)
	switch primitive {
	case "admin":
		classicalCompatCounters.admin.Add(1)
	case "bls_aggregate":
		classicalCompatCounters.blsAgg.Add(1)
	case "kzg":
		classicalCompatCounters.kzg.Add(1)
	case "groth16":
		classicalCompatCounters.groth16.Add(1)
	case "pairing":
		classicalCompatCounters.pairing.Add(1)
	}
}

// ClassicalCompatTotal returns the current count of classical-compat
// gate traversals broken down by primitive. The result map is a
// snapshot; subsequent increments are not reflected.
func ClassicalCompatTotal() map[string]uint64 {
	return map[string]uint64{
		"admin":         classicalCompatCounters.admin.Load(),
		"bls_aggregate": classicalCompatCounters.blsAgg.Load(),
		"kzg":           classicalCompatCounters.kzg.Load(),
		"groth16":       classicalCompatCounters.groth16.Load(),
		"pairing":       classicalCompatCounters.pairing.Load(),
	}
}

// ProfileMetadata is the JSON record block-explorer + RPC consumers see
// for a single bridge profile. Stable contract; new fields append.
type ProfileMetadata struct {
	ProfileID            string `json:"profile_id"`
	Name                 string `json:"name"`
	PostQuantumEndToEnd  bool   `json:"post_quantum_end_to_end"`
	SourceFinalityScheme string `json:"source_finality_scheme"`
	DestFinalityScheme   string `json:"dest_finality_scheme"`
	ProofPolicyID        string `json:"proof_policy_id"`
	BridgeAdminScheme    string `json:"bridge_admin_scheme"`
	BridgePauseScheme    string `json:"bridge_pause_scheme"`
	HashSuiteID          string `json:"hash_suite_id"`
}

// Metadata returns the JSON-serialisable view of this profile. Used by
// cmd/bridge/api.go for the bridge_getProfile RPC and by block-explorer
// metadata writers on every deposit / withdrawal record.
func (p *BridgeProfile) Metadata() ProfileMetadata {
	if p == nil {
		return ProfileMetadata{Name: "nil-profile"}
	}
	return ProfileMetadata{
		ProfileID:            fmt.Sprintf("0x%02x", p.ProfileID),
		Name:                 p.Name,
		PostQuantumEndToEnd:  p.PostQuantumEndToEnd,
		SourceFinalityScheme: schemeWireName(p.SourceFinalityScheme),
		DestFinalityScheme:   schemeWireName(p.DestFinalityScheme),
		ProofPolicyID:        p.ProofPolicyID,
		BridgeAdminScheme:    p.BridgeAdminScheme,
		BridgePauseScheme:    p.BridgePauseScheme,
		HashSuiteID:          p.HashSuiteID,
	}
}

// schemeWireName returns the upper-snake wire name used by the explorer
// metadata. The lower-kebab consensus String() is for log messages;
// explorer JSON uses the upper-snake form documented in HIP-0078.
func schemeWireName(s string) string {
	switch s {
	case SchemePulsarM65:
		return "PULSAR_M_65"
	case SchemePulsarM87:
		return "PULSAR_M_87"
	case SchemeMLDSA65:
		return "ML_DSA_65"
	case SchemeMLDSA87:
		return "ML_DSA_87"
	case SchemeBLS12381:
		return "BLS_12_381"
	}
	return s
}
