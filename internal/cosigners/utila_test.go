package cosigners

import (
	"context"
	"strings"
	"testing"
)

// TestUtilaConnectRPCFamily_RunUtila_StubFailureToday documents the
// current contract: until the real Utila Connect-RPC client lands,
// every UtilaIntent fails with a clear "not yet implemented" reason.
// The signing driver's policy ("all listed must approve") then moves
// the swap to refund_pending so the user's deposit is returned.
//
// When the real implementation lands, REPLACE THIS TEST with a real
// flow assertion — but keep the "fail without secret" / "fail on
// transport error" coverage that already exists for FireblocksRESTFamily.
func TestUtilaConnectRPCFamily_RunUtila_StubFailureToday(t *testing.T) {
	got := UtilaConnectRPCFamily{}.RunUtila(context.Background(),
		&UtilaIntent{
			OrgID:    "tenant-x",
			ClientID: "lux-bridge",
			VaultID:  "v-42",
		},
		"unused-secret",
		DispatchOptions{SwapID: "swap_uscaffold", TxHash: "0xabcd"},
	)
	if got.Status != StatusFailed {
		t.Errorf("expected StatusFailed (real impl pending), got %s reason=%q", got.Status, got.Reason)
	}
	for _, want := range []string{"not yet ported", "internal/cosigners/utila.go", "swap_uscaffold", "tenant-x", "lux-bridge", "v-42"} {
		if !strings.Contains(got.Reason, want) {
			t.Errorf("reason should mention %q for grepability, got %q", want, got.Reason)
		}
	}
}

func TestUtilaConnectRPCFamily_RunUtila_DefaultVaultPlaceholder(t *testing.T) {
	// VaultID omitted — reason should say "(tenant default)" so a
	// reader knows the intent didn't specify a vault.
	got := UtilaConnectRPCFamily{}.RunUtila(context.Background(),
		&UtilaIntent{OrgID: "o", ClientID: "c"},
		"unused-secret",
		DispatchOptions{SwapID: "swap_dvault"},
	)
	if !strings.Contains(got.Reason, "(tenant default)") {
		t.Errorf("reason should label the default-vault case, got %q", got.Reason)
	}
}

func TestUtilaConnectRPCFamily_RunFireblocks_DelegatesToStubByDefault(t *testing.T) {
	got := UtilaConnectRPCFamily{}.RunFireblocks(context.Background(),
		&FireblocksIntent{APIKey: "k"},
		"unused",
		DispatchOptions{SwapID: "swap_uf"},
	)
	if got.Status != StatusFailed {
		t.Errorf("default Fireblocks delegate = stub, want StatusFailed, got %s", got.Status)
	}
	if !strings.Contains(got.Reason, "not yet implemented") {
		t.Errorf("expected stub's reason, got %q", got.Reason)
	}
}

func TestUtilaConnectRPCFamily_RunFireblocks_CustomDelegate(t *testing.T) {
	delegate := approvingFireblocksDelegate{}
	got := UtilaConnectRPCFamily{FireblocksDelegate: delegate}.RunFireblocks(
		context.Background(),
		&FireblocksIntent{APIKey: "k"},
		"unused",
		DispatchOptions{SwapID: "swap_uf2"},
	)
	if got.Status != StatusApproved {
		t.Errorf("custom delegate should approve, got %s reason=%q", got.Status, got.Reason)
	}
}

// approvingFireblocksDelegate is a test-only family that approves
// Fireblocks calls and panics on Utila (asserts routing).
type approvingFireblocksDelegate struct{}

func (approvingFireblocksDelegate) RunUtila(_ context.Context, _ *UtilaIntent, _ string, _ DispatchOptions) Result {
	panic("approvingFireblocksDelegate.RunUtila should not be called")
}
func (approvingFireblocksDelegate) RunFireblocks(_ context.Context, intent *FireblocksIntent, _ string, _ DispatchOptions) Result {
	return Result{
		Intent:     Intent{Kind: KindFireblocks, Fireblocks: intent},
		Status:     StatusApproved,
		Signature:  "fb-test-sig",
		ExternalID: "fb-test-ext",
	}
}

// ───────────────────────────────────────────────────────────────────────
//  CompositeFamilyDispatcher — verifies routing in both directions
// ───────────────────────────────────────────────────────────────────────

func TestCompositeFamilyDispatcher_BothNilFallsBackToStub(t *testing.T) {
	c := CompositeFamilyDispatcher{}

	utilaGot := c.RunUtila(context.Background(),
		&UtilaIntent{OrgID: "o", ClientID: "c"}, "x",
		DispatchOptions{SwapID: "swap_cu"})
	if utilaGot.Status != StatusFailed {
		t.Errorf("zero Utila → stub failure expected, got %s", utilaGot.Status)
	}

	fbGot := c.RunFireblocks(context.Background(),
		&FireblocksIntent{APIKey: "k"}, "x",
		DispatchOptions{SwapID: "swap_cf"})
	if fbGot.Status != StatusFailed {
		t.Errorf("zero Fireblocks → stub failure expected, got %s", fbGot.Status)
	}
}

func TestCompositeFamilyDispatcher_RoutesPerFamily(t *testing.T) {
	c := CompositeFamilyDispatcher{
		UtilaFamily:      approvingUtilaDelegate{},      // from fireblocks_test.go — approves Utila, panics on Fireblocks
		FireblocksFamily: approvingFireblocksDelegate{}, // approves Fireblocks, panics on Utila
	}

	uGot := c.RunUtila(context.Background(),
		&UtilaIntent{OrgID: "o", ClientID: "c"}, "x",
		DispatchOptions{SwapID: "swap_cu2"})
	if uGot.Status != StatusApproved {
		t.Errorf("Utila family should approve, got %s reason=%q", uGot.Status, uGot.Reason)
	}

	fGot := c.RunFireblocks(context.Background(),
		&FireblocksIntent{APIKey: "k"}, "x",
		DispatchOptions{SwapID: "swap_cf2"})
	if fGot.Status != StatusApproved {
		t.Errorf("Fireblocks family should approve, got %s reason=%q", fGot.Status, fGot.Reason)
	}
}

// TestCompositeFamilyDispatcher_MixedRealAndNil shows the wiring that
// today's --enable-fireblocks-cosigner path produces under the hood:
// real Fireblocks + nil Utila ⇒ Utila intents fail loudly, Fireblocks
// intents go to the real runner.
func TestCompositeFamilyDispatcher_MixedRealAndNil(t *testing.T) {
	c := CompositeFamilyDispatcher{
		// UtilaFamily intentionally nil — falls back to stub
		FireblocksFamily: approvingFireblocksDelegate{},
	}

	uGot := c.RunUtila(context.Background(),
		&UtilaIntent{OrgID: "o", ClientID: "c"}, "x",
		DispatchOptions{SwapID: "swap_mix_u"})
	if uGot.Status != StatusFailed {
		t.Errorf("nil Utila → stub failure expected, got %s", uGot.Status)
	}

	fGot := c.RunFireblocks(context.Background(),
		&FireblocksIntent{APIKey: "k"}, "x",
		DispatchOptions{SwapID: "swap_mix_f"})
	if fGot.Status != StatusApproved {
		t.Errorf("real Fireblocks should approve, got %s", fGot.Status)
	}
}
