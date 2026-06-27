package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/luxfi/cosigner"
)

// cosign_test.go exercises the bridge's single consumer seam onto
// github.com/luxfi/cosigner: swapsCreateNative validates the optional
// `cosigners` array at the API boundary and records the typed intents on the
// swap. The permissionless default is no cosigners (empty → open gate);
// institutional flows post PUBLIC identifiers only — never secret material.

// decodeSwapID pulls the created swap id out of the `{data:{id}}` envelope.
func decodeSwapID(t *testing.T, body []byte) string {
	t.Helper()
	var resp struct {
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatalf("decode envelope: %v (body=%s)", err, body)
	}
	return resp.Data.ID
}

// baseSwapBody is a valid ETH→LUX create body (a default-on EVM pair). Extra
// fields (e.g. cosigners) are merged in by the caller.
func baseSwapBody(extra map[string]any) map[string]any {
	b := map[string]any{
		"amount":              0.1,
		"source_network":      "ETHEREUM_SEPOLIA",
		"source_asset":        "ETH",
		"destination_network": "LUX_TESTNET",
		"destination_asset":   "LUX",
		"destination_address": "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
	}
	for k, v := range extra {
		b[k] = v
	}
	return b
}

// TestSwapsCreate_NoCosigners_PermissionlessDefault is the permissionless
// path: a swap with no `cosigners` field creates cleanly and records zero
// intents. AllApproved over an empty result set is true — the gate is open.
func TestSwapsCreate_NoCosigners_PermissionlessDefault(t *testing.T) {
	rig := newRig(t, nil, nil, nil)

	reqBody, _ := json.Marshal(baseSwapBody(nil))
	status, body := fireRequest(t, rig.app, http.MethodPost, "/v1/bridge/swaps", reqBody)
	if status != http.StatusOK {
		t.Fatalf("status = %d, body=%s", status, body)
	}

	stored, err := rig.store.Get(t.Context(), decodeSwapID(t, body))
	if err != nil {
		t.Fatalf("store.Get: %v", err)
	}
	if len(stored.Cosigners) != 0 {
		t.Errorf("permissionless swap should record zero cosigners, got %d", len(stored.Cosigners))
	}
	// No cosigners ⇒ no gate: AllApproved over an empty result set is true.
	if !cosigner.AllApproved(nil) {
		t.Error("empty cosigner gate must be open")
	}
}

// TestSwapsCreate_ValidFireblocksCosigner_Recorded is the institutional path:
// a swap carrying one valid Fireblocks declaration (public api_key only)
// validates and records the typed intent for the signing-stage gate.
func TestSwapsCreate_ValidFireblocksCosigner_Recorded(t *testing.T) {
	rig := newRig(t, nil, nil, nil)

	reqBody, _ := json.Marshal(baseSwapBody(map[string]any{
		"cosigners": []any{
			map[string]any{"kind": "fireblocks", "api_key": "pub-key-123"},
		},
	}))
	status, body := fireRequest(t, rig.app, http.MethodPost, "/v1/bridge/swaps", reqBody)
	if status != http.StatusOK {
		t.Fatalf("status = %d, body=%s", status, body)
	}

	stored, err := rig.store.Get(t.Context(), decodeSwapID(t, body))
	if err != nil {
		t.Fatalf("store.Get: %v", err)
	}
	if len(stored.Cosigners) != 1 {
		t.Fatalf("want 1 recorded cosigner, got %d", len(stored.Cosigners))
	}
	got := stored.Cosigners[0]
	if got.Kind != cosigner.KindFireblocks {
		t.Errorf("kind = %q, want fireblocks", got.Kind)
	}
	// The public identifier must survive verbatim onto the typed intent —
	// the signing stage keys the KMS secret fetch off it.
	if got.Fireblocks == nil || got.Fireblocks.APIKey != "pub-key-123" {
		t.Errorf("fireblocks api_key not preserved: %+v", got.Fireblocks)
	}
}

// TestSwapsCreate_SecretLeakingCosigner_Rejected proves the wire invariant:
// a cosigner entry carrying a secret-like field is refused at the boundary
// (400), so secret material can never reach the store.
func TestSwapsCreate_SecretLeakingCosigner_Rejected(t *testing.T) {
	rig := newRig(t, nil, nil, nil)

	reqBody, _ := json.Marshal(baseSwapBody(map[string]any{
		"cosigners": []any{
			map[string]any{"kind": "fireblocks", "api_key": "pub", "api_secret": "LEAKED"},
		},
	}))
	status, body := fireRequest(t, rig.app, http.MethodPost, "/v1/bridge/swaps", reqBody)
	if status != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 (body=%s)", status, body)
	}
	// The error names the violation, never the secret value.
	if got := string(body); !strings.Contains(got, "bad_cosigners") || strings.Contains(got, "LEAKED") {
		t.Errorf("unexpected error body: %s", got)
	}
}
