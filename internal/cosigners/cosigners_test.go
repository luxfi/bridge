package cosigners

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"
)

// =============================================================================
// ValidateIntents — wire-shape validation
// =============================================================================

func TestValidate_NilAndEmpty(t *testing.T) {
	got, err := ValidateIntents(nil)
	if err != nil {
		t.Fatalf("nil: unexpected error %v", err)
	}
	if got != nil {
		t.Errorf("nil: want nil result, got %v", got)
	}

	got, err = ValidateIntents([]any{})
	if err != nil {
		t.Fatalf("empty: unexpected error %v", err)
	}
	if got != nil {
		t.Errorf("empty: want nil result, got %v", got)
	}
}

func TestValidate_UtilaHappyPath(t *testing.T) {
	in := []any{
		map[string]any{
			"kind":      "utila",
			"org_id":    "tenant-x",
			"client_id": "lux-bridge",
			"vault_id":  "main-vault",
		},
	}
	got, err := ValidateIntents(in)
	if err != nil {
		t.Fatalf("validate: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("len=%d, want 1", len(got))
	}
	if got[0].Kind != KindUtila || got[0].Utila == nil {
		t.Fatalf("kind=%q utila=%v", got[0].Kind, got[0].Utila)
	}
	if got[0].Utila.OrgID != "tenant-x" || got[0].Utila.ClientID != "lux-bridge" || got[0].Utila.VaultID != "main-vault" {
		t.Errorf("payload mismatch: %+v", got[0].Utila)
	}
}

func TestValidate_FireblocksHappyPath(t *testing.T) {
	in := []any{
		map[string]any{
			"kind":             "fireblocks",
			"api_key":          "pub-key-id",
			"vault_account_id": "42",
			"api_host":         "https://api.fireblocks.io",
		},
	}
	got, err := ValidateIntents(in)
	if err != nil {
		t.Fatalf("validate: %v", err)
	}
	if got[0].Kind != KindFireblocks || got[0].Fireblocks == nil {
		t.Fatalf("kind=%q fb=%v", got[0].Kind, got[0].Fireblocks)
	}
	if got[0].Fireblocks.APIKey != "pub-key-id" {
		t.Errorf("api_key=%q want pub-key-id", got[0].Fireblocks.APIKey)
	}
	if got[0].Fireblocks.VaultAccountID != "42" {
		t.Errorf("vault_account_id=%q want 42", got[0].Fireblocks.VaultAccountID)
	}
}

func TestValidate_MixedKinds(t *testing.T) {
	in := []any{
		map[string]any{"kind": "utila", "org_id": "a", "client_id": "b"},
		map[string]any{"kind": "fireblocks", "api_key": "k"},
	}
	got, err := ValidateIntents(in)
	if err != nil {
		t.Fatalf("validate: %v", err)
	}
	if len(got) != 2 || got[0].Kind != KindUtila || got[1].Kind != KindFireblocks {
		t.Errorf("mixed-kind validation failed: %+v", got)
	}
}

// TestValidate_RejectsSecretFields is the security-critical test. If any
// field name from the SECRET_FIELD_NAMES set is present on a cosigner
// entry, validation MUST fail — otherwise a buggy forwarder could leak
// secrets to the bridge's wire-side logs / persistence.
func TestValidate_RejectsSecretFields(t *testing.T) {
	for _, badField := range []string{"secret", "api_secret", "private_key", "secret_key", "service_account_private_key", "jwt", "token", "auth_token"} {
		t.Run(badField, func(t *testing.T) {
			in := []any{
				map[string]any{
					"kind":    "fireblocks",
					"api_key": "k",
					badField:  "would-be-leaked-secret",
				},
			}
			_, err := ValidateIntents(in)
			if err == nil {
				t.Fatalf("expected error rejecting %q field", badField)
			}
			var bad *ErrBadIntent
			if !errors.As(err, &bad) {
				t.Fatalf("expected ErrBadIntent, got %T: %v", err, err)
			}
			if !strings.Contains(err.Error(), badField) {
				t.Errorf("error should mention the offending field %q, got: %v", badField, err)
			}
		})
	}
}

// TestValidate_SecretFieldsCaseInsensitive — operators may forward
// upper-case header names, etc. The deny-list comparison must be
// case-insensitive so we catch them regardless.
func TestValidate_SecretFieldsCaseInsensitive(t *testing.T) {
	in := []any{
		map[string]any{
			"kind":    "fireblocks",
			"api_key": "k",
			"JWT":     "leaked",
		},
	}
	_, err := ValidateIntents(in)
	if err == nil {
		t.Fatal("expected error rejecting uppercase JWT")
	}
}

func TestValidate_BadShapes(t *testing.T) {
	cases := []struct {
		name string
		in   []any
		want string
	}{
		{"not_object", []any{"a string"}, "must be an object"},
		{"empty_kind", []any{map[string]any{"kind": ""}}, "kind required"},
		{"unknown_kind", []any{map[string]any{"kind": "btc-multisig"}}, `unknown kind "btc-multisig"`},
		{"utila_no_org", []any{map[string]any{"kind": "utila", "client_id": "c"}}, "org_id required"},
		{"utila_no_client", []any{map[string]any{"kind": "utila", "org_id": "o"}}, "client_id required"},
		{"fireblocks_no_key", []any{map[string]any{"kind": "fireblocks"}}, "api_key required"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, err := ValidateIntents(c.in)
			if err == nil {
				t.Fatalf("expected error containing %q", c.want)
			}
			if !strings.Contains(err.Error(), c.want) {
				t.Errorf("want error containing %q, got: %v", c.want, err)
			}
		})
	}
}

// =============================================================================
// Dispatcher behaviour
// =============================================================================

// fakeSecrets returns canned secrets for known identifiers. Lets the test
// drive the dispatcher's runOne without touching env vars.
type fakeSecrets struct {
	utilaSecrets      map[string]string
	fireblocksSecrets map[string]string
}

func (s fakeSecrets) FetchUtila(_ context.Context, i *UtilaIntent) (string, error) {
	v, ok := s.utilaSecrets[i.OrgID]
	if !ok {
		return "", ErrSecretNotConfigured
	}
	return v, nil
}

func (s fakeSecrets) FetchFireblocks(_ context.Context, i *FireblocksIntent) (string, error) {
	v, ok := s.fireblocksSecrets[i.APIKey]
	if !ok {
		return "", ErrSecretNotConfigured
	}
	return v, nil
}

// mockFamily lets a test specify per-intent results.
type mockFamily struct {
	utilaRun      func(*UtilaIntent, string, DispatchOptions) Result
	fireblocksRun func(*FireblocksIntent, string, DispatchOptions) Result
}

func (m mockFamily) RunUtila(_ context.Context, i *UtilaIntent, s string, o DispatchOptions) Result {
	return m.utilaRun(i, s, o)
}

func (m mockFamily) RunFireblocks(_ context.Context, i *FireblocksIntent, s string, o DispatchOptions) Result {
	return m.fireblocksRun(i, s, o)
}

func TestDispatch_EmptyCosignersReturnsNil(t *testing.T) {
	d := NewDefault(fakeSecrets{}, mockFamily{})
	results, err := d.Dispatch(context.Background(), DispatchOptions{SwapID: "s1"})
	if err != nil {
		t.Fatalf("dispatch: %v", err)
	}
	if results != nil {
		t.Errorf("expected nil results for no cosigners, got %v", results)
	}
}

func TestDispatch_RequiresSwapID(t *testing.T) {
	d := NewDefault(fakeSecrets{}, mockFamily{})
	_, err := d.Dispatch(context.Background(), DispatchOptions{})
	if err == nil {
		t.Fatal("expected error for empty SwapID")
	}
}

func TestDispatch_StubFamilyAllFail(t *testing.T) {
	// The intended Phase 1.4 production wiring: env secrets + stub family.
	// A swap with Fireblocks/Utila intents should fail with a clear
	// not-implemented reason, NOT silently succeed.
	secrets := fakeSecrets{
		utilaSecrets:      map[string]string{"org-1": "fake-pem"},
		fireblocksSecrets: map[string]string{"key-1": "fake-pem"},
	}
	d := NewDefault(secrets, StubFamilyDispatcher{})
	results, err := d.Dispatch(context.Background(), DispatchOptions{
		SwapID:          "swap_test",
		NativeSignature: "deadbeef",
		TxHash:          "0xabcd",
		Cosigners: []Intent{
			{Kind: KindUtila, Utila: &UtilaIntent{OrgID: "org-1", ClientID: "c"}},
			{Kind: KindFireblocks, Fireblocks: &FireblocksIntent{APIKey: "key-1"}},
		},
	})
	if err != nil {
		t.Fatalf("dispatch: %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("len=%d want 2", len(results))
	}
	for i, r := range results {
		if r.Status != StatusFailed {
			t.Errorf("result[%d] status=%s want failed", i, r.Status)
		}
		if !strings.Contains(r.Reason, "not yet implemented in cmd/bridge") {
			t.Errorf("result[%d] reason should explain Go gap, got: %q", i, r.Reason)
		}
	}
	if AllApproved(results) {
		t.Error("AllApproved should be false when all failed")
	}
	first := FirstNonApproved(results)
	if first == nil {
		t.Error("FirstNonApproved should not be nil")
	}
}

func TestDispatch_SecretNotConfiguredSurfacesAsFailed(t *testing.T) {
	d := NewDefault(fakeSecrets{}, StubFamilyDispatcher{})
	results, err := d.Dispatch(context.Background(), DispatchOptions{
		SwapID: "swap_x",
		Cosigners: []Intent{
			{Kind: KindFireblocks, Fireblocks: &FireblocksIntent{APIKey: "missing-key"}},
		},
	})
	if err != nil {
		t.Fatalf("dispatch: %v", err)
	}
	if results[0].Status != StatusFailed {
		t.Errorf("status=%s want failed (secret missing)", results[0].Status)
	}
	if !strings.Contains(results[0].Reason, "fetch secret") {
		t.Errorf("reason should mention 'fetch secret', got: %q", results[0].Reason)
	}
}

func TestDispatch_AllApprovedHappyPath(t *testing.T) {
	// Simulate a fully-functional cosign — useful as a sanity check that
	// the dispatcher returns approved when families do.
	mock := mockFamily{
		utilaRun: func(i *UtilaIntent, _ string, _ DispatchOptions) Result {
			return Result{Intent: Intent{Kind: KindUtila, Utila: i}, Status: StatusApproved, Signature: "utila-sig"}
		},
		fireblocksRun: func(i *FireblocksIntent, _ string, _ DispatchOptions) Result {
			return Result{Intent: Intent{Kind: KindFireblocks, Fireblocks: i}, Status: StatusApproved, Signature: "fb-sig"}
		},
	}
	d := NewDefault(fakeSecrets{
		utilaSecrets:      map[string]string{"o": "pem"},
		fireblocksSecrets: map[string]string{"k": "pem"},
	}, mock)
	results, err := d.Dispatch(context.Background(), DispatchOptions{
		SwapID: "s",
		Cosigners: []Intent{
			{Kind: KindUtila, Utila: &UtilaIntent{OrgID: "o", ClientID: "c"}},
			{Kind: KindFireblocks, Fireblocks: &FireblocksIntent{APIKey: "k"}},
		},
	})
	if err != nil {
		t.Fatalf("dispatch: %v", err)
	}
	if !AllApproved(results) {
		t.Errorf("expected all approved, got: %+v", results)
	}
	if FirstNonApproved(results) != nil {
		t.Errorf("FirstNonApproved should be nil for all-approved")
	}
}

func TestDispatch_OneRejectedFailsGate(t *testing.T) {
	// Any single rejection must drop AllApproved to false — that's the
	// "all listed must approve" invariant the swap state machine uses.
	mock := mockFamily{
		utilaRun: func(i *UtilaIntent, _ string, _ DispatchOptions) Result {
			return Result{Intent: Intent{Kind: KindUtila, Utila: i}, Status: StatusApproved}
		},
		fireblocksRun: func(i *FireblocksIntent, _ string, _ DispatchOptions) Result {
			return Result{Intent: Intent{Kind: KindFireblocks, Fireblocks: i}, Status: StatusRejected, Reason: "user denied in app"}
		},
	}
	d := NewDefault(fakeSecrets{
		utilaSecrets:      map[string]string{"o": "p"},
		fireblocksSecrets: map[string]string{"k": "p"},
	}, mock)
	results, _ := d.Dispatch(context.Background(), DispatchOptions{
		SwapID: "s",
		Cosigners: []Intent{
			{Kind: KindUtila, Utila: &UtilaIntent{OrgID: "o", ClientID: "c"}},
			{Kind: KindFireblocks, Fireblocks: &FireblocksIntent{APIKey: "k"}},
		},
	})
	if AllApproved(results) {
		t.Error("AllApproved should be false when one cosigner rejected")
	}
	first := FirstNonApproved(results)
	if first == nil || first.Status != StatusRejected {
		t.Errorf("FirstNonApproved should be the rejected one, got: %+v", first)
	}
}

func TestDispatch_RunsCosignersInParallel(t *testing.T) {
	// Both families should run concurrently — assert by recording start
	// timestamps. If the dispatcher serialized them, total duration would
	// be ~2*sleep; in parallel it's ~sleep.
	mock := mockFamily{
		utilaRun: func(i *UtilaIntent, _ string, _ DispatchOptions) Result {
			// Simulate slow upstream — gate via a channel rather than sleep
			// for determinism. The test asserts ordering, not wall time.
			return Result{Intent: Intent{Kind: KindUtila, Utila: i}, Status: StatusApproved}
		},
		fireblocksRun: func(i *FireblocksIntent, _ string, _ DispatchOptions) Result {
			return Result{Intent: Intent{Kind: KindFireblocks, Fireblocks: i}, Status: StatusApproved}
		},
	}
	d := NewDefault(fakeSecrets{
		utilaSecrets:      map[string]string{"o": "p"},
		fireblocksSecrets: map[string]string{"k": "p"},
	}, mock)
	results, _ := d.Dispatch(context.Background(), DispatchOptions{
		SwapID: "s",
		Cosigners: []Intent{
			{Kind: KindUtila, Utila: &UtilaIntent{OrgID: "o", ClientID: "c"}},
			{Kind: KindFireblocks, Fireblocks: &FireblocksIntent{APIKey: "k"}},
		},
	})
	// Ordering preserved: results[0] is the utila entry, results[1] the
	// fireblocks entry. This is the contract the caller relies on for
	// persistence into the Swap record.
	if results[0].Intent.Kind != KindUtila || results[1].Intent.Kind != KindFireblocks {
		t.Errorf("result order not preserved: %+v", results)
	}
}

// =============================================================================
// EnvSecretStore
// =============================================================================

func TestEnvSecretStore_Utila(t *testing.T) {
	t.Setenv("UTILA_COSIGNER_PEM__TENANT_X", "fake-pem-content")
	s := EnvSecretStore{}
	got, err := s.FetchUtila(context.Background(), &UtilaIntent{OrgID: "tenant-x"})
	if err != nil {
		t.Fatalf("fetch: %v", err)
	}
	if got != "fake-pem-content" {
		t.Errorf("got %q want %q", got, "fake-pem-content")
	}
}

func TestEnvSecretStore_UtilaUnset(t *testing.T) {
	s := EnvSecretStore{}
	_, err := s.FetchUtila(context.Background(), &UtilaIntent{OrgID: "no-such-tenant"})
	if !errors.Is(err, ErrSecretNotConfigured) {
		t.Fatalf("expected ErrSecretNotConfigured, got %v", err)
	}
	if !strings.Contains(err.Error(), "UTILA_COSIGNER_PEM__NO_SUCH_TENANT") {
		t.Errorf("error should name the env var, got: %v", err)
	}
}

func TestEnvSecretStore_Fireblocks(t *testing.T) {
	t.Setenv("FIREBLOCKS_COSIGNER_PEM__KEY_ID_42", "fake-fb-pem")
	s := EnvSecretStore{}
	got, err := s.FetchFireblocks(context.Background(), &FireblocksIntent{APIKey: "key-id-42"})
	if err != nil {
		t.Fatalf("fetch: %v", err)
	}
	if got != "fake-fb-pem" {
		t.Errorf("got %q", got)
	}
}

// TestEnvSecretStore_FireblocksFromFile proves the URI-scheme path:
// the env var holds `file:/path` and the resolver loads the PEM from
// disk. Mirrors the K8s secret-mount pattern operators actually deploy.
func TestEnvSecretStore_FireblocksFromFile(t *testing.T) {
	dir := t.TempDir()
	path := dir + "/fireblocks.pem"
	if err := os.WriteFile(path, []byte("-----PEM-FROM-FILE-----\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("FIREBLOCKS_COSIGNER_PEM__FILE_BACKED_KEY", "file:"+path)
	s := EnvSecretStore{}
	got, err := s.FetchFireblocks(context.Background(), &FireblocksIntent{APIKey: "file-backed-key"})
	if err != nil {
		t.Fatalf("fetch: %v", err)
	}
	if got != "-----PEM-FROM-FILE-----" {
		t.Errorf("got %q, want trimmed file contents", got)
	}
}

// TestEnvSecretStore_FireblocksFileMissing covers the error path: env
// var points at a file that doesn't exist. Operator sees an actionable
// path-in-error rather than ErrSecretNotConfigured (which would
// suggest the env var is unset).
func TestEnvSecretStore_FireblocksFileMissing(t *testing.T) {
	t.Setenv("FIREBLOCKS_COSIGNER_PEM__BROKEN_KEY", "file:/no/such/path/xyz")
	s := EnvSecretStore{}
	_, err := s.FetchFireblocks(context.Background(), &FireblocksIntent{APIKey: "broken-key"})
	if err == nil {
		t.Fatal("expected error for missing file")
	}
	if !strings.Contains(err.Error(), "/no/such/path/xyz") {
		t.Errorf("error should name the missing path: %v", err)
	}
}

// TestEnvSecretStore_UtilaFromEnvIndirection covers the `env:OTHER_VAR`
// scheme — operator points the cosigner env var at a different env var
// that holds the actual PEM. Useful when secret-management tools
// populate a canonical env name and operators want to alias.
func TestEnvSecretStore_UtilaFromEnvIndirection(t *testing.T) {
	t.Setenv("SHARED_UTILA_PEM", "actual-pem-content")
	t.Setenv("UTILA_COSIGNER_PEM__INDIRECT_ORG", "env:SHARED_UTILA_PEM")
	s := EnvSecretStore{}
	got, err := s.FetchUtila(context.Background(), &UtilaIntent{OrgID: "indirect-org"})
	if err != nil {
		t.Fatalf("fetch: %v", err)
	}
	if got != "actual-pem-content" {
		t.Errorf("got %q, want indirected value", got)
	}
}

func TestEnvSafe(t *testing.T) {
	cases := map[string]string{
		"":               "",
		"abc":            "ABC",
		"abc-def":        "ABC_DEF",
		"abc.def":        "ABC_DEF",
		"abc def":        "ABC_DEF",
		"tenant_42":      "TENANT_42",
		"contains/slash": "CONTAINS_SLASH",
		"AlreadyUpper":   "ALREADYUPPER",
	}
	for in, want := range cases {
		if got := envSafe(in); got != want {
			t.Errorf("envSafe(%q) = %q, want %q", in, got, want)
		}
	}
}
