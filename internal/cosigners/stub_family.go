package cosigners

import (
	"context"
	"fmt"
)

// StubFamilyDispatcher fails every cosign step with a clear "not
// implemented in Go bridge" reason. Used as the default during Phase 1.4
// so that institutional users hitting cmd/bridge see a LOUD failure
// pointing them at app/server, instead of the current silent-drop
// regression where the swap completes without cosigning at all.
//
// Drop-in replacements:
//   - For Fireblocks: a real RESTful Fireblocks client (Task #39).
//   - For Utila: pending implementation of the @luxfi/utila Connect-RPC
//     transaction-approval flow (TS module currently also a stub).
//
// Tests should swap in MockFamilyDispatcher instead of using this — the
// stub's whole purpose is to produce a known failure shape, not to be
// mockable.
type StubFamilyDispatcher struct{}

// RunUtila returns StatusFailed with a clear "not implemented" reason.
func (StubFamilyDispatcher) RunUtila(_ context.Context, intent *UtilaIntent, _ string, opts DispatchOptions) Result {
	return Result{
		Intent: Intent{Kind: KindUtila, Utila: intent},
		Status: StatusFailed,
		Reason: fmt.Sprintf("utila cosign not yet implemented in cmd/bridge (Go); use app/server (Express) for swap=%s, or wait for §3.5 e2e soak", opts.SwapID),
	}
}

// RunFireblocks returns StatusFailed with a clear "not implemented" reason
// that points at Task #39 (the real REST client work).
func (StubFamilyDispatcher) RunFireblocks(_ context.Context, intent *FireblocksIntent, _ string, opts DispatchOptions) Result {
	return Result{
		Intent: Intent{Kind: KindFireblocks, Fireblocks: intent},
		Status: StatusFailed,
		Reason: fmt.Sprintf("fireblocks cosign not yet implemented in cmd/bridge (Go); REST client + JWT signing pending — see Task #39 for swap=%s", opts.SwapID),
	}
}
