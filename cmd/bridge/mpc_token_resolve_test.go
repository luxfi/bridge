package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	luxlog "github.com/luxfi/log"
)

// TestResolveMPCToken_BareLiteralBackCompat covers the back-compat
// path: every pre-secrets deploy passes a bare token via --mpc-token
// (or BRIDGE_MPC_TOKEN env). The resolver must treat the bare value
// as a literal so existing configs keep working untouched.
func TestResolveMPCToken_BareLiteralBackCompat(t *testing.T) {
	got, err := resolveMPCToken("bare-token-abc123", "", "public", luxlog.New("test"))
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if got != "bare-token-abc123" {
		t.Errorf("got %q, want bare literal", got)
	}
}

// TestResolveMPCToken_FileScheme covers the K8s secret-mount pattern:
// operator points --mpc-token at file:/var/run/secrets/mpc-token and
// the resolver reads the file contents.
func TestResolveMPCToken_FileScheme(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "mpc-token")
	if err := os.WriteFile(path, []byte("kms-decrypted-token-value\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	got, err := resolveMPCToken("file:"+path, "", "public", luxlog.New("test"))
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if got != "kms-decrypted-token-value" {
		t.Errorf("got %q, want trimmed file contents", got)
	}
}

// TestResolveMPCToken_EnvScheme covers env indirection — operator sets
// --mpc-token=env:OTHER_VAR when their secret-management tool
// populates a canonical env name.
func TestResolveMPCToken_EnvScheme(t *testing.T) {
	t.Setenv("BRIDGE_TEST_MPC_TOKEN_INDIRECT", "actual-token")
	got, err := resolveMPCToken("env:BRIDGE_TEST_MPC_TOKEN_INDIRECT", "", "public", luxlog.New("test"))
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if got != "actual-token" {
		t.Errorf("got %q, want %q", got, "actual-token")
	}
}

// TestResolveMPCToken_FileSchemeMissing covers the error path: the
// scheme is recognized but the upstream resource is missing. Operator
// gets an actionable error citing the path.
func TestResolveMPCToken_FileSchemeMissing(t *testing.T) {
	_, err := resolveMPCToken("file:/no/such/path/xyz", "", "public", luxlog.New("test"))
	if err == nil {
		t.Fatal("expected error for missing file")
	}
	if !strings.Contains(err.Error(), "resolve") || !strings.Contains(err.Error(), "public") {
		t.Errorf("error should mention cluster label + resolve: got %v", err)
	}
}

// TestResolveMPCToken_EmptyTokenWithoutIdentityReturnsEmpty covers
// the "unauthenticated dev cluster" path — both flags empty → empty
// token, no error.
func TestResolveMPCToken_EmptyTokenWithoutIdentityReturnsEmpty(t *testing.T) {
	got, err := resolveMPCToken("", "", "public", luxlog.New("test"))
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if got != "" {
		t.Errorf("got %q, want empty", got)
	}
}
