package secrets

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestResolver_LiteralScheme(t *testing.T) {
	got, err := Default().Resolve(context.Background(), "literal:hello-world")
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if got != "hello-world" {
		t.Errorf("got %q, want %q", got, "hello-world")
	}
}

func TestResolver_UnprefixedIsLiteral_BackCompat(t *testing.T) {
	// Every pre-secrets flag value is bare (e.g. --mpc-token=abc123).
	// Bare strings must be treated as literal so existing deploys
	// keep working without flag changes.
	got, err := Default().Resolve(context.Background(), "bare-token-value")
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if got != "bare-token-value" {
		t.Errorf("got %q, want %q", got, "bare-token-value")
	}
}

func TestResolver_EnvScheme(t *testing.T) {
	t.Setenv("BRIDGE_TEST_SECRET", "the-shared-token")
	got, err := Default().Resolve(context.Background(), "env:BRIDGE_TEST_SECRET")
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if got != "the-shared-token" {
		t.Errorf("got %q, want %q", got, "the-shared-token")
	}
}

func TestResolver_EnvScheme_UnsetVar(t *testing.T) {
	_, err := Default().Resolve(context.Background(), "env:DOES_NOT_EXIST_xx_BRIDGE_TEST")
	if err == nil {
		t.Fatal("expected error for unset env var")
	}
	if !strings.Contains(err.Error(), "unset") {
		t.Errorf("error %q should mention 'unset'", err.Error())
	}
}

func TestResolver_EnvScheme_EmptyName(t *testing.T) {
	_, err := Default().Resolve(context.Background(), "env:")
	if err == nil {
		t.Fatal("expected error for empty env name")
	}
}

func TestResolver_FileScheme(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "secret.pem")
	if err := os.WriteFile(path, []byte("-----BEGIN-----\nbody\n-----END-----\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	got, err := Default().Resolve(context.Background(), "file:"+path)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	want := "-----BEGIN-----\nbody\n-----END-----"
	if got != want {
		t.Errorf("got %q, want %q (trailing \\n should be stripped)", got, want)
	}
}

func TestResolver_FileScheme_CRLF(t *testing.T) {
	// Windows-style files: trailing \r\n should be stripped fully.
	dir := t.TempDir()
	path := filepath.Join(dir, "secret.crlf")
	if err := os.WriteFile(path, []byte("token-value\r\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	got, err := Default().Resolve(context.Background(), "file:"+path)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if got != "token-value" {
		t.Errorf("got %q, want %q", got, "token-value")
	}
}

func TestResolver_FileScheme_MissingPath(t *testing.T) {
	_, err := Default().Resolve(context.Background(), "file:")
	if err == nil {
		t.Fatal("expected error for empty path")
	}
}

func TestResolver_FileScheme_NotExist(t *testing.T) {
	_, err := Default().Resolve(context.Background(), "file:/no/such/path/xyz123")
	if err == nil {
		t.Fatal("expected error for missing file")
	}
}

func TestResolver_KMSScheme_NoProvider(t *testing.T) {
	_, err := Default().Resolve(context.Background(), "kms:aws:us-east-1:cipher:xxx")
	if err == nil {
		t.Fatal("expected ErrKMSNotRegistered")
	}
	if !errors.Is(err, ErrKMSNotRegistered) {
		t.Errorf("err = %v, want ErrKMSNotRegistered", err)
	}
}

func TestResolver_KMSScheme_MalformedNoFamily(t *testing.T) {
	_, err := Default().Resolve(context.Background(), "kms:onlyfamily")
	if err == nil {
		t.Fatal("expected error — kms URI must be kms:<family>:<opaque>")
	}
}

// fakeKMS is a test KMSProvider that maps opaque strings back to plaintext.
type fakeKMS struct {
	plaintext map[string]string
}

func (f *fakeKMS) Decrypt(_ context.Context, opaque string) (string, error) {
	pt, ok := f.plaintext[opaque]
	if !ok {
		return "", errors.New("fakeKMS: opaque not found")
	}
	return pt, nil
}

func TestResolver_KMSScheme_HappyPath(t *testing.T) {
	prev := kmsRegistry["fake"]
	t.Cleanup(func() {
		if prev == nil {
			delete(kmsRegistry, "fake")
		} else {
			kmsRegistry["fake"] = prev
		}
	})
	RegisterKMS("fake", &fakeKMS{plaintext: map[string]string{
		"cipher-abc": "decrypted-token",
	}})

	got, err := Default().Resolve(context.Background(), "kms:fake:cipher-abc")
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if got != "decrypted-token" {
		t.Errorf("got %q, want %q", got, "decrypted-token")
	}
}

func TestResolver_UnknownScheme(t *testing.T) {
	_, err := Default().Resolve(context.Background(), "vault:secret/data/bridge/mpc-token")
	if err == nil {
		t.Fatal("expected ErrUnknownScheme")
	}
	if !errors.Is(err, ErrUnknownScheme) {
		t.Errorf("err = %v, want ErrUnknownScheme", err)
	}
}

func TestSplitScheme_RejectsWindowsPath(t *testing.T) {
	// `C:/path/to/file` is a bare Windows path, NOT a `C:` scheme.
	// splitScheme should reject it (uppercase scheme chars not allowed).
	scheme, _, ok := splitScheme("C:/path/to/file")
	if ok {
		t.Errorf("splitScheme accepted Windows path as scheme=%q", scheme)
	}
}

func TestSplitScheme_RejectsBareIP(t *testing.T) {
	// "10:20:30" should not be parsed as scheme=10.
	scheme, _, ok := splitScheme("1.2.3.4:5000")
	if ok {
		t.Errorf("splitScheme accepted IP:port as scheme=%q", scheme)
	}
}

func TestRegisterKMS_RejectsNilOrEmpty(t *testing.T) {
	prevCount := len(kmsRegistry)
	RegisterKMS("", &fakeKMS{})
	RegisterKMS("validname", nil)
	if len(kmsRegistry) != prevCount {
		t.Errorf("registry grew after invalid Register calls — want size unchanged")
	}
}

func TestMustResolve_PanicsOnError(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Error("MustResolve should panic on error")
		}
	}()
	MustResolve(context.Background(), Default(), "env:DOES_NOT_EXIST_xx")
}

func TestMustResolve_HappyPath(t *testing.T) {
	got := MustResolve(context.Background(), Default(), "literal:abc")
	if got != "abc" {
		t.Errorf("got %q, want %q", got, "abc")
	}
}
