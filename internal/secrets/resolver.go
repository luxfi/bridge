// Package secrets resolves secret values from URI-scheme references.
//
// The bridge stores secrets (mpcd bearer tokens, cosigner PEMs) in
// many places: env vars during dev, mounted files in Kubernetes,
// cloud KMS in production. Hard-coding any one source forces operators
// to choose between dev ergonomics and prod security.
//
// This package solves that with a single URI-scheme indirection:
//
//	"literal:abc123"                  → "abc123"
//	"env:BRIDGE_MPC_TOKEN"            → os.Getenv("BRIDGE_MPC_TOKEN")
//	"file:/var/run/secrets/mpc-token" → contents of that file, trimmed
//	"kms:aws:us-east-1:cipher:..."    → AWS KMS decrypt (when provider registered)
//
// Values WITHOUT a scheme are treated as `literal:` for back-compat —
// every existing `--mpc-token=raw-string` keeps working unchanged.
//
// KMS providers are pluggable via Register so the bridge binary
// doesn't drag in the AWS SDK by default. A deployment that wants
// AWS KMS imports a wrapper package that calls
// secrets.RegisterKMS("aws", ...) in its init().
//
// Concurrency: Default() is safe for concurrent use after construction.
// Register is NOT safe for concurrent use — call it from init() only.
package secrets

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
)

// Resolver maps a URI to the plaintext secret it references.
//
// The returned string is the plaintext — callers must treat it as
// sensitive: don't log it, don't write it to disk uncontrolled,
// don't include it in error messages back to clients.
//
// Errors are surfaced unwrapped — the caller decides whether a
// missing secret is fatal (mpcd token at boot) or recoverable
// (cosigner intent for an unknown tenant).
type Resolver interface {
	Resolve(ctx context.Context, uri string) (string, error)
}

// ErrNoScheme is returned when a URI has no `<scheme>:` prefix AND
// the resolver was constructed without a literal-fallback default.
// Default() handles this case for back-compat; custom chains may not.
var ErrNoScheme = errors.New("secrets: URI missing <scheme>: prefix")

// ErrUnknownScheme is returned when the URI's scheme has no registered
// resolver. Helps operators distinguish a typo (e.g. `fle:/path`) from
// a missing secret value.
var ErrUnknownScheme = errors.New("secrets: unknown URI scheme")

// ErrKMSNotRegistered is returned by the kms scheme when no provider
// has been registered for the requested KMS family (aws, gcp, vault).
// Operators land in this branch when they configure a kms: URI but
// haven't imported a KMS provider package.
var ErrKMSNotRegistered = errors.New("secrets: no KMS provider registered — import a provider package (e.g. internal/secrets/awskms) in main")

// KMSProvider decrypts a KMS-wrapped ciphertext. The opaque-string
// shape is intentional: AWS KMS, GCP KMS, and Vault Transit all have
// different parameter formats; each provider parses its own slice
// of the URI after the family prefix.
//
// Implementations MUST be safe for concurrent use.
type KMSProvider interface {
	Decrypt(ctx context.Context, opaque string) (string, error)
}

// kmsRegistry holds KMS providers keyed by family (aws, gcp, vault).
// Populated by init() in concrete provider packages so the default
// binary stays free of cloud-SDK weight.
var kmsRegistry = map[string]KMSProvider{}

// RegisterKMS associates a KMSProvider with a family identifier
// (e.g. "aws", "gcp", "vault"). Call from a provider package's init().
// Overwrites any prior registration for the family — last write wins.
//
// NOT safe for concurrent use. The intended pattern is:
//
//	package main
//
//	import _ "github.com/luxfi/bridge/internal/secrets/awskms"
//	// awskms.init() calls secrets.RegisterKMS("aws", &awskms.Provider{})
func RegisterKMS(family string, p KMSProvider) {
	if family == "" || p == nil {
		return
	}
	kmsRegistry[family] = p
}

// Default returns a Resolver that recognizes the built-in schemes
// (literal, env, file, kms) and treats unprefixed values as
// `literal:<value>` for back-compat with the pre-secrets-package
// flags.
//
// The returned Resolver is safe for concurrent use.
func Default() Resolver {
	return defaultResolver{}
}

type defaultResolver struct{}

// Resolve implements Resolver. It dispatches on the URI's scheme
// prefix, treating unprefixed values as literal for back-compat.
func (defaultResolver) Resolve(ctx context.Context, uri string) (string, error) {
	scheme, rest, ok := splitScheme(uri)
	if !ok {
		// Back-compat: bare values are literal. Mirrors what every
		// pre-secrets flag did.
		return uri, nil
	}
	switch scheme {
	case "literal":
		return rest, nil
	case "env":
		return resolveEnv(rest)
	case "file":
		return resolveFile(rest)
	case "kms":
		return resolveKMS(ctx, rest)
	default:
		return "", fmt.Errorf("%w: %q", ErrUnknownScheme, scheme)
	}
}

// splitScheme returns (scheme, rest, true) if uri begins with a
// recognizable `<scheme>:` prefix where scheme is non-empty and
// consists of lowercase letters / digits. Returns (...false) when
// the URI is unprefixed (so callers fall back to literal handling).
//
// We deliberately reject schemes that contain `/` or `.` to avoid
// mistaking a `C:/path/to/file` on Windows or a domain-like literal
// for a scheme. Operators on Windows can still use `file:///C:/path`.
func splitScheme(uri string) (scheme, rest string, ok bool) {
	i := strings.IndexByte(uri, ':')
	if i <= 0 {
		return "", "", false
	}
	scheme = uri[:i]
	for j := 0; j < len(scheme); j++ {
		c := scheme[j]
		validLower := c >= 'a' && c <= 'z'
		validDigit := c >= '0' && c <= '9'
		if !validLower && !validDigit {
			return "", "", false
		}
	}
	return scheme, uri[i+1:], true
}

// resolveEnv reads `env:NAME` → os.Getenv("NAME"). An empty NAME or
// an unset env var returns an error so operators see the missing
// reference at boot rather than silently passing "" to mpcd.
func resolveEnv(name string) (string, error) {
	if name == "" {
		return "", errors.New("secrets: env: URI requires a variable name")
	}
	v, ok := os.LookupEnv(name)
	if !ok {
		return "", fmt.Errorf("secrets: env var %q unset", name)
	}
	return v, nil
}

// resolveFile reads `file:/path` → contents-of-file, with a single
// trailing newline stripped because almost every secret-management
// tool (kubectl create secret, vault write, vault agent template)
// emits one. Operators can defeat the strip by appending a sentinel
// to the file if they really need a trailing newline.
func resolveFile(path string) (string, error) {
	if path == "" {
		return "", errors.New("secrets: file: URI requires a path")
	}
	b, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("secrets: read %s: %w", path, err)
	}
	// Strip exactly one trailing \n (or \r\n) — multi-line secrets
	// like PEMs preserve their interior newlines.
	s := string(b)
	s = strings.TrimSuffix(s, "\n")
	s = strings.TrimSuffix(s, "\r")
	return s, nil
}

// resolveKMS routes `kms:<family>:<opaque>` to the registered provider
// for <family>. Returns ErrKMSNotRegistered when the family has no
// registered provider — actionable signal that the operator forgot
// to import the provider package.
func resolveKMS(ctx context.Context, rest string) (string, error) {
	i := strings.IndexByte(rest, ':')
	if i <= 0 {
		return "", errors.New("secrets: kms: URI must be kms:<family>:<opaque>")
	}
	family, opaque := rest[:i], rest[i+1:]
	p, ok := kmsRegistry[family]
	if !ok {
		return "", fmt.Errorf("%w: family=%q", ErrKMSNotRegistered, family)
	}
	return p.Decrypt(ctx, opaque)
}

// MustResolve calls r.Resolve and panics on error. Suitable for
// boot-time wiring where a missing secret is fatal. Do NOT use on
// request paths.
func MustResolve(ctx context.Context, r Resolver, uri string) string {
	v, err := r.Resolve(ctx, uri)
	if err != nil {
		panic("secrets: " + err.Error())
	}
	return v
}
