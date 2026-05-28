package cosigners

import (
	"context"
	"fmt"
	"os"
	"strings"
)

// EnvSecretStore reads cosigner secrets from environment variables. This
// is a TEMPORARY fallback that mirrors the TS module's behaviour —
// production must use a KMS-backed store (Vault / cloud KMS) so secrets
// can be rotated without redeploying the bridge.
//
// Env var conventions (match the TS module exactly):
//
//	Utila:      UTILA_COSIGNER_PEM__<envSafe(org_id)>
//	Fireblocks: FIREBLOCKS_COSIGNER_PEM__<envSafe(api_key)>
//
// where envSafe uppercases the identifier and replaces every non-
// alphanumeric character with underscore (POSIX shell-safe).
//
// Zero value is usable. Concurrency-safe (os.Getenv is goroutine-safe).
type EnvSecretStore struct{}

// FetchUtila returns the service-account PEM for the given Utila org,
// reading from UTILA_COSIGNER_PEM__<envSafe(OrgID)>. Returns
// ErrSecretNotConfigured wrapped with the env var name when unset.
func (EnvSecretStore) FetchUtila(_ context.Context, intent *UtilaIntent) (string, error) {
	if intent == nil || intent.OrgID == "" {
		return "", fmt.Errorf("%w: utila intent missing org_id", ErrSecretNotConfigured)
	}
	envKey := "UTILA_COSIGNER_PEM__" + envSafe(intent.OrgID)
	pem := os.Getenv(envKey)
	if pem == "" {
		return "", fmt.Errorf("%w: env %s unset for utila org_id=%s",
			ErrSecretNotConfigured, envKey, intent.OrgID)
	}
	return pem, nil
}

// FetchFireblocks returns the secret PEM for the given Fireblocks api_key,
// reading from FIREBLOCKS_COSIGNER_PEM__<envSafe(APIKey)>. Returns
// ErrSecretNotConfigured wrapped with the env var name when unset.
func (EnvSecretStore) FetchFireblocks(_ context.Context, intent *FireblocksIntent) (string, error) {
	if intent == nil || intent.APIKey == "" {
		return "", fmt.Errorf("%w: fireblocks intent missing api_key", ErrSecretNotConfigured)
	}
	envKey := "FIREBLOCKS_COSIGNER_PEM__" + envSafe(intent.APIKey)
	pem := os.Getenv(envKey)
	if pem == "" {
		return "", fmt.Errorf("%w: env %s unset for fireblocks api_key=%s",
			ErrSecretNotConfigured, envKey, intent.APIKey)
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
