package cosigners

import (
	"context"
	"fmt"
	"time"
)

// utila.go — Utila Connect-RPC cosigner family (scaffold).
//
// This file is the integration scaffold for the @luxfi/utila client.
// The real implementation is NOT yet ported — every UtilaIntent today
// gets a `StatusFailed` result with a clear "not yet implemented"
// reason. The structure mirrors FireblocksRESTFamily so a future port
// is a contained change to ONE method (RunUtila below) without
// disturbing any consumers.
//
// Why keep a dedicated scaffold instead of leaving Utila in
// StubFamilyDispatcher? Two reasons:
//
//  1. Make the integration point discoverable. New contributors who
//     ask "where does Utila plug in?" can find this file directly
//     rather than chasing through a shared stub.
//
//  2. Allow composing real-Fireblocks + real-Utila independently. The
//     two families are wired into the bridge separately via the
//     CompositeFamilyDispatcher below; an operator who only enables
//     Fireblocks doesn't have to think about Utila and vice-versa.
//
// Symmetry with FireblocksRESTFamily:
//
//	FireblocksRESTFamily:   real Fireblocks, delegates RunUtila      to a configured family (default stub).
//	UtilaConnectRPCFamily:  real Utila      (TODO), delegates RunFireblocks to a configured family (default stub).
//	CompositeFamilyDispatcher: real both     — explicit per-family wiring.
//
// Reference: app/server/src/domain/cosigners.ts:281-306 (TS stub
// equivalent to this file).

// UtilaConnectRPCFamily implements FamilyDispatcher with — once the
// real @luxfi/utila client lands — the real Connect-RPC transaction-
// approval flow on the Utila side. The Fireblocks side delegates to
// FireblocksDelegate (default StubFamilyDispatcher) so an operator
// who only wants real Utila doesn't accidentally force real Fireblocks.
//
// Today RunUtila returns StatusFailed. When the implementation lands,
// fill in the method body per the TODO block below — no other type
// or interface change required.
type UtilaConnectRPCFamily struct {
	// FireblocksDelegate routes RunFireblocks calls when this family
	// is wired into the bridge alone (without an explicit Fireblocks
	// family). Zero ⇒ falls back to StubFamilyDispatcher (intents
	// fail with the "use app/server" reason). Production wiring that
	// wants both Utila + Fireblocks REAL should compose via
	// CompositeFamilyDispatcher below rather than setting this field.
	FireblocksDelegate FamilyDispatcher

	// Timeout caps the entire Utila approval flow (create + polls or
	// webhook wait). Zero defers to whatever the real implementation
	// picks as its default — currently irrelevant since RunUtila is
	// a stub.
	Timeout time.Duration

	// (Other knobs — HTTPClient, PollInterval, Now, Nonce, etc. —
	// will be added when the real client lands. Keep the same
	// pluggability surface as FireblocksRESTFamily so tests can
	// inject deterministic time + transport.)
}

// RunUtila is the integration point for the real Utila Connect-RPC
// client. Today: returns StatusFailed with a "not yet implemented"
// reason. The signing driver's policy ("all listed must approve")
// then moves the swap to refund_pending so the user's deposit is
// returned. This is the LOUD failure mode — better than the silent
// drop where cmd/bridge accepted Utila intents but never dispatched.
//
// TODO(utila-port): Replace this body with the real flow:
//
//  1. Build a per-tenant @luxfi/utila Connect-RPC client using
//     serviceAccountAuthStrategy:
//
//     - email:      derive from intent.ClientID per the Utila docs
//     - privateKey: the secret PEM (already loaded by SecretStore)
//
//     Do NOT reuse the singleton in app/server/src/domain/utila.ts —
//     that one is scoped to global env vars (primary-signer mode).
//     This is a per-tenant client.
//
//  2. Submit a transaction-approval request against intent.VaultID
//     (or the tenant's default vault when unset) referencing
//     opts.TxHash and opts.NativeSignature.
//
//  3. Either poll the approval status or wait on Utila's webhook.
//     The webhook signature verifier already exists in
//     app/server/src/domain/utila.ts — reuse `utilaPublicKey` +
//     `verifySignature` from the equivalent Go module when porting.
//
//  4. Return:
//
//     - StatusApproved with Signature = Utila's attestation tx hash,
//     ExternalID = Utila's request id
//     - StatusRejected with Reason = denial cause from the workflow
//     - StatusFailed with Reason = transport / config error
//
// Reference: app/server/src/domain/cosigners.ts:281-306.
func (u UtilaConnectRPCFamily) RunUtila(_ context.Context, intent *UtilaIntent, _ string, opts DispatchOptions) Result {
	return Result{
		Intent: Intent{Kind: KindUtila, Utila: intent},
		Status: StatusFailed,
		Reason: fmt.Sprintf(
			"utila cosigner real impl not yet ported (scaffold in internal/cosigners/utila.go — see TODO(utila-port)); "+
				"swap=%s would have submitted approval for org=%s client=%s vault=%s",
			opts.SwapID, intent.OrgID, intent.ClientID, vaultOrDefault(intent.VaultID, "(tenant default)"),
		),
	}
}

// RunFireblocks delegates to the configured FireblocksDelegate so an
// operator who wired this family standalone (without composing through
// CompositeFamilyDispatcher) still gets a defined behaviour for
// Fireblocks intents — the stub failure, by default.
func (u UtilaConnectRPCFamily) RunFireblocks(ctx context.Context, intent *FireblocksIntent, secret string, opts DispatchOptions) Result {
	delegate := u.FireblocksDelegate
	if delegate == nil {
		delegate = StubFamilyDispatcher{}
	}
	return delegate.RunFireblocks(ctx, intent, secret, opts)
}

// CompositeFamilyDispatcher routes per-family calls to separately
// configured runners. The intended wiring once Utila lands:
//
//	families := cosigners.CompositeFamilyDispatcher{
//	    UtilaFamily:      cosigners.UtilaConnectRPCFamily{Timeout: 60*time.Second},
//	    FireblocksFamily: cosigners.FireblocksRESTFamily{Timeout: 60*time.Second},
//	}
//	dispatcher := cosigners.NewDefault(secretStore, families)
//
// Either field may be nil — a nil family falls back to the
// StubFamilyDispatcher behaviour for that family. This is the
// recommended wiring even today: operators set FireblocksFamily =
// FireblocksRESTFamily{} and leave UtilaFamily nil; intents for the
// nil family fail with the stub reason.
type CompositeFamilyDispatcher struct {
	// UtilaFamily is consulted on every RunUtila call. Zero ⇒
	// StubFamilyDispatcher's RunUtila.
	UtilaFamily FamilyDispatcher

	// FireblocksFamily is consulted on every RunFireblocks call.
	// Zero ⇒ StubFamilyDispatcher's RunFireblocks.
	FireblocksFamily FamilyDispatcher
}

// RunUtila delegates to UtilaFamily (or the stub).
func (c CompositeFamilyDispatcher) RunUtila(ctx context.Context, intent *UtilaIntent, secret string, opts DispatchOptions) Result {
	delegate := c.UtilaFamily
	if delegate == nil {
		delegate = StubFamilyDispatcher{}
	}
	return delegate.RunUtila(ctx, intent, secret, opts)
}

// RunFireblocks delegates to FireblocksFamily (or the stub).
func (c CompositeFamilyDispatcher) RunFireblocks(ctx context.Context, intent *FireblocksIntent, secret string, opts DispatchOptions) Result {
	delegate := c.FireblocksFamily
	if delegate == nil {
		delegate = StubFamilyDispatcher{}
	}
	return delegate.RunFireblocks(ctx, intent, secret, opts)
}

// vaultOrDefault returns vault when non-empty, otherwise the supplied
// default placeholder. Tiny helper to keep the stub's Reason message
// readable when the intent omits VaultID.
func vaultOrDefault(vault, def string) string {
	if vault == "" {
		return def
	}
	return vault
}
