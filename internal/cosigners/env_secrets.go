package cosigners

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/luxfi/bridge/internal/secrets"
)

// EnvSecretStore reads cosigner secrets from environment variables.
// The env var holds a URI passed through internal/secrets.Resolver so
// operators can store the actual PEM in env, file, or KMS:
//
//	FIREBLOCKS_COSIGNER_PEM__KEY="-----BEGIN PRIVATE KEY-----\n..."       (literal, back-compat)
//	FIREBLOCKS_COSIGNER_PEM__KEY="file:/var/run/secrets/fireblocks.pem"   (file-mounted, K8s secret pattern)
//	FIREBLOCKS_COSIGNER_PEM__KEY="kms:aws:cipher:<base64>"                 (KMS-wrapped, when provider registered)
//
// Bare PEM contents (without a URI scheme) continue to work as
// literal values — every existing deploy keeps working unchanged.
//
// Env var conventions (match the TS module exactly):
//
//	Utila:      UTILA_COSIGNER_PEM__<envSafe(org_id)>
//	Fireblocks: FIREBLOCKS_COSIGNER_PEM__<envSafe(api_key)>
//
// where envSafe uppercases the identifier and replaces every non-
// alphanumeric character with underscore (POSIX shell-safe).
//
// Zero value is usable. Concurrency-safe (os.Getenv is goroutine-safe
// and the secrets.Default() resolver is concurrency-safe by contract).
type EnvSecretStore struct{}

// FetchUtila returns the service-account PEM for the given Utila org,
// reading from UTILA_COSIGNER_PEM__<envSafe(OrgID)>. The env value is
// passed through internal/secrets.Resolver so file: / kms: schemes
// are supported. Returns ErrSecretNotConfigured wrapped with the env
// var name when unset.
func (EnvSecretStore) FetchUtila(ctx context.Context, intent *UtilaIntent) (string, error) {
	if intent == nil || intent.OrgID == "" {
		return "", fmt.Errorf("%w: utila intent missing org_id", ErrSecretNotConfigured)
	}
	envKey := "UTILA_COSIGNER_PEM__" + envSafe(intent.OrgID)
	raw := os.Getenv(envKey)
	if raw == "" {
		return "", fmt.Errorf("%w: env %s unset for utila org_id=%s",
			ErrSecretNotConfigured, envKey, intent.OrgID)
	}
	pem, err := secrets.Default().Resolve(ctx, raw)
	if err != nil {
		return "", fmt.Errorf("resolve %s: %w", envKey, err)
	}
	return pem, nil
}

// FetchFireblocks returns the secret PEM for the given Fireblocks api_key,
// reading from FIREBLOCKS_COSIGNER_PEM__<envSafe(APIKey)>. Same URI-scheme
// resolution as FetchUtila — bare PEM values continue to work as literal.
// Returns ErrSecretNotConfigured wrapped with the env var name when unset.
func (EnvSecretStore) FetchFireblocks(ctx context.Context, intent *FireblocksIntent) (string, error) {
	if intent == nil || intent.APIKey == "" {
		return "", fmt.Errorf("%w: fireblocks intent missing api_key", ErrSecretNotConfigured)
	}
	envKey := "FIREBLOCKS_COSIGNER_PEM__" + envSafe(intent.APIKey)
	raw := os.Getenv(envKey)
	if raw == "" {
		return "", fmt.Errorf("%w: env %s unset for fireblocks api_key=%s",
			ErrSecretNotConfigured, envKey, intent.APIKey)
	}
	pem, err := secrets.Default().Resolve(ctx, raw)
	if err != nil {
		return "", fmt.Errorf("resolve %s: %w", envKey, err)
	}
	return pem, nil
}

// envSafe upper-cases s and replaces every non-alphanumeric byte with
// '_'. Lossy by design — env vars don't allow hyphens / dots; the lossy
// mapping is acceptable because env-var lookup is a dev fallback. KMS
// keys preserve the original identifier verbatim.
func envSafe(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c >= 'a' && c <= 'z':
			b.WriteByte(c - ('a' - 'A'))
		case c >= 'A' && c <= 'Z', c >= '0' && c <= '9':
			b.WriteByte(c)
		default:
			b.WriteByte('_')
		}
	}
	return b.String()
}
