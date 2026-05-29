package cosigners

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"time"
)

// fireblocks_jwt.go — RS256 JWT signing for the Fireblocks REST API.
//
// Fireblocks authenticates every API call with two headers:
//
//	Authorization: Bearer <JWT>
//	X-API-Key:     <intent.APIKey>
//
// The JWT is signed with the tenant's RSA private key (PEM, fetched
// from KMS or the env-fallback by the SecretStore) and carries the
// canonical claim set Fireblocks expects. The claim `bodyHash` is the
// SHA-256 hex digest of the request body — an empty string for GET.
// Claims live only 30 seconds (Fireblocks rejects anything older or
// claiming more than 55 s of validity) so we mint a fresh JWT per
// request, never reuse.
//
// This file implements just enough of RFC 7519 (JWT) + RFC 3447 (PKCS1
// v1.5 RSA) to talk to Fireblocks. Using a dedicated JWT library
// (`golang-jwt/jwt`, `go-jose`) would work but the bridge's go.mod
// currently has neither and the spec we need is ~80 LOC; not worth
// the dep churn. The signing path is covered by tests against a
// freshly-generated RSA-2048 key and a manually-verified signature.

// fireblocksJWTHeader is constant for every Fireblocks call. RS256 is
// the only algorithm Fireblocks accepts. Pre-encoding it avoids a hot-
// path JSON marshal per request.
//
// Decoded form: `{"alg":"RS256","typ":"JWT"}`.
const fireblocksJWTHeader = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9"

// fireblocksJWTClaims is the claim set Fireblocks requires.
//
// Field names are the on-the-wire JSON keys (snake_case for nonce/iat/
// exp/sub per RFC 7519; camelCase for bodyHash per Fireblocks docs).
type fireblocksJWTClaims struct {
	URI      string `json:"uri"`
	Nonce    string `json:"nonce"`
	IssuedAt int64  `json:"iat"`
	Expires  int64  `json:"exp"`
	Subject  string `json:"sub"`
	BodyHash string `json:"bodyHash"`
}

// fireblocksJWTValidity is how long Fireblocks accepts a JWT for. The
// docs allow up to 55 s; we use 30 s to give clock-skew headroom on
// both ends. Each call mints a fresh JWT — never reuse, because the
// nonce is the only thing preventing replay within the window.
const fireblocksJWTValidity = 30 * time.Second

// signFireblocksJWT builds + signs the JWT for one Fireblocks API call.
//
//   - uri:      relative path including query string ("/v1/transactions",
//     "/v1/transactions/abc?status=COMPLETED", etc.).
//   - body:     marshalled request body — empty / nil for GET requests.
//     bodyHash claim becomes sha256(empty) for missing body,
//     matching the Fireblocks docs' "empty payload" rule.
//   - apiKey:   the tenant's PUBLIC API key (intent.APIKey). Goes into
//     the `sub` claim AND the `X-API-Key` header set by the
//     caller.
//   - privKey:  the tenant's RSA private key (parsed by
//     parseRSAPrivateKey from the PEM the SecretStore returned).
//   - now:      time source — injectable so tests can pin iat/exp.
//   - nonce:    per-call uniqueness token. Tests inject a deterministic
//     value; production calls pass a hex-encoded crypto/rand
//     read via fireblocksNonce().
//
// Returns the compact-serialised JWT (`<header>.<claims>.<signature>`).
func signFireblocksJWT(uri string, body []byte, apiKey string, privKey *rsa.PrivateKey, now time.Time, nonce string) (string, error) {
	if privKey == nil {
		return "", errors.New("fireblocks jwt: nil private key")
	}
	if apiKey == "" {
		return "", errors.New("fireblocks jwt: empty api key")
	}

	bodyHash := sha256.Sum256(body)
	claims := fireblocksJWTClaims{
		URI:      uri,
		Nonce:    nonce,
		IssuedAt: now.Unix(),
		Expires:  now.Add(fireblocksJWTValidity).Unix(),
		Subject:  apiKey,
		BodyHash: hex.EncodeToString(bodyHash[:]),
	}
	claimsJSON, err := json.Marshal(claims)
	if err != nil {
		return "", fmt.Errorf("fireblocks jwt: marshal claims: %w", err)
	}
	claimsB64 := base64.RawURLEncoding.EncodeToString(claimsJSON)

	signingInput := fireblocksJWTHeader + "." + claimsB64
	signingHash := sha256.Sum256([]byte(signingInput))

	sig, err := rsa.SignPKCS1v15(rand.Reader, privKey, crypto.SHA256, signingHash[:])
	if err != nil {
		return "", fmt.Errorf("fireblocks jwt: sign: %w", err)
	}
	sigB64 := base64.RawURLEncoding.EncodeToString(sig)

	return signingInput + "." + sigB64, nil
}

// parseRSAPrivateKey decodes a PEM-encoded RSA private key. Accepts
// both formats Fireblocks tenants commonly ship:
//
//   - PKCS#1: `-----BEGIN RSA PRIVATE KEY-----`
//   - PKCS#8: `-----BEGIN PRIVATE KEY-----`
//
// PKCS#8 carries an outer AlgorithmIdentifier so a single decoder
// covers RSA / EC / Ed25519; we additionally assert the parsed key IS
// RSA before returning so a misconfigured tenant gets a clear error
// rather than a runtime panic during signing.
//
// Leading / trailing whitespace and BOM bytes are tolerated — KMS dumps
// sometimes carry these.
func parseRSAPrivateKey(pemSrc string) (*rsa.PrivateKey, error) {
	if pemSrc == "" {
		return nil, errors.New("fireblocks jwt: empty PEM")
	}
	block, _ := pem.Decode([]byte(pemSrc))
	if block == nil {
		return nil, errors.New("fireblocks jwt: no PEM block (bad format)")
	}

	// Try PKCS#1 (RSA-only, `RSA PRIVATE KEY` header) first since it's
	// the cheaper parse.
	if key, err := x509.ParsePKCS1PrivateKey(block.Bytes); err == nil {
		return key, nil
	}

	// Fall through to PKCS#8 (`PRIVATE KEY` header). The cast
	// rejects non-RSA keys with a clear message.
	parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("fireblocks jwt: parse PEM (tried PKCS#1 + PKCS#8): %w", err)
	}
	key, ok := parsed.(*rsa.PrivateKey)
	if !ok {
		return nil, fmt.Errorf("fireblocks jwt: PEM is %T, not RSA", parsed)
	}
	return key, nil
}

// fireblocksNonce returns a 16-byte random hex string for per-call JWT
// uniqueness. crypto/rand backs this; in tests a fixed-value generator
// can be plugged into FireblocksRESTFamily.Nonce instead.
func fireblocksNonce() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		// crypto/rand failing is catastrophic — surface a clearly-bogus
		// nonce so the request fails-fast at JWT verification time
		// rather than appearing successful.
		return "FALLBACK_NONCE_RAND_READ_FAILED"
	}
	return hex.EncodeToString(b[:])
}
