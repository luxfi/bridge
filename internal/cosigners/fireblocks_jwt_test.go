// Tests for parseRSAPrivateKey and fireblocksNonce. Both back the JWT
// signing path for the Fireblocks institutional cosign flow
// (FireblocksRESTFamily -- see architecture_cosigners memory: this is
// the real, non-scaffold cosigner). fireblocks_test.go's
// TestFireblocks_MalformedPEM_Failed already covers one negative case
// end-to-end through RunFireblocks; these tests cover parseRSAPrivateKey
// directly and more exhaustively -- including the PKCS#8 branch, the
// non-RSA-key rejection, and the whitespace-tolerance claim the
// function's own doc comment makes but nothing previously verified.
package cosigners

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/hex"
	"encoding/pem"
	"strings"
	"testing"
)

func TestParseRSAPrivateKey_PKCS1(t *testing.T) {
	key, pemStr := generateTestKey(t) // PKCS#1, "RSA PRIVATE KEY" header
	got, err := parseRSAPrivateKey(pemStr)
	if err != nil {
		t.Fatalf("parseRSAPrivateKey: %v", err)
	}
	if got.N.Cmp(key.N) != 0 {
		t.Error("parsed key modulus doesn't match the original -- wrong key returned")
	}
}

func TestParseRSAPrivateKey_PKCS8(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate rsa key: %v", err)
	}
	pkcs8, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		t.Fatalf("MarshalPKCS8PrivateKey: %v", err)
	}
	pemStr := string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: pkcs8}))

	got, err := parseRSAPrivateKey(pemStr)
	if err != nil {
		t.Fatalf("parseRSAPrivateKey (PKCS#8): %v", err)
	}
	if got.N.Cmp(key.N) != 0 {
		t.Error("parsed key modulus doesn't match the original -- wrong key returned")
	}
}

func TestParseRSAPrivateKey_EmptyPEM(t *testing.T) {
	_, err := parseRSAPrivateKey("")
	if err == nil || !strings.Contains(err.Error(), "empty") {
		t.Errorf("err = %v, want an empty-PEM rejection", err)
	}
}

func TestParseRSAPrivateKey_NoPEMBlock(t *testing.T) {
	_, err := parseRSAPrivateKey("this is definitely not a PEM file")
	if err == nil {
		t.Fatal("expected an error for a non-PEM string, got nil")
	}
}

// TestParseRSAPrivateKey_PKCS8NonRSA is the one that matters most: a
// PKCS#8 block decodes fine for ANY key algorithm (EC, Ed25519, RSA),
// so the RSA-specific type assertion is the only thing standing
// between a misconfigured tenant (who pasted the wrong key type) and
// either a confusing downstream panic or -- worse -- silently
// succeeding with a key that can't actually produce a valid signature
// the way the caller expects.
func TestParseRSAPrivateKey_PKCS8NonRSA(t *testing.T) {
	ecKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("generate ec key: %v", err)
	}
	pkcs8, err := x509.MarshalPKCS8PrivateKey(ecKey)
	if err != nil {
		t.Fatalf("MarshalPKCS8PrivateKey: %v", err)
	}
	pemStr := string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: pkcs8}))

	_, err = parseRSAPrivateKey(pemStr)
	if err == nil {
		t.Fatal("expected an error for a non-RSA (EC) key, got nil")
	}
	if !strings.Contains(err.Error(), "not RSA") {
		t.Errorf("err = %v, want it to name the type mismatch", err)
	}
}

// TestParseRSAPrivateKey_ToleratesWhitespace checks the doc comment's
// claim ("leading/trailing whitespace and BOM bytes are tolerated")
// actually holds, rather than trusting the comment. It didn't, on the
// first pass: encoding/pem.Decode only skips lines that are entirely
// blank before the "-----BEGIN" marker -- a stray space/tab directly
// in front of "-----BEGIN" (exactly what indentation from a pasted KMS
// dump produces) made it return nil instead of skipping past it. Found
// by this test failing against real stdlib behavior (verified in
// isolation, not assumed); fixed by trimming the whole input in
// parseRSAPrivateKey before decoding.
func TestParseRSAPrivateKey_ToleratesWhitespace(t *testing.T) {
	_, pemStr := generateTestKey(t)
	padded := "\n\n  \t" + pemStr + "\n\n   "
	if _, err := parseRSAPrivateKey(padded); err != nil {
		t.Errorf("parseRSAPrivateKey with padding whitespace: %v (doc comment claims this should be tolerated)", err)
	}
}

// TestParseRSAPrivateKey_ToleratesLeadingBOM checks the doc comment's
// other claim -- a leading UTF-8 BOM (which a Windows-edited KMS
// export can carry) must not break parsing.
func TestParseRSAPrivateKey_ToleratesLeadingBOM(t *testing.T) {
	_, pemStr := generateTestKey(t)
	withBOM := "\uFEFF" + pemStr
	if _, err := parseRSAPrivateKey(withBOM); err != nil {
		t.Errorf("parseRSAPrivateKey with a leading BOM: %v (doc comment claims this should be tolerated)", err)
	}
}

func TestFireblocksNonce_ReturnsValidHexOfCorrectLength(t *testing.T) {
	n := fireblocksNonce()
	b, err := hex.DecodeString(n)
	if err != nil {
		t.Fatalf("fireblocksNonce() = %q is not valid hex: %v", n, err)
	}
	if len(b) != 16 {
		t.Errorf("decoded nonce length = %d bytes, want 16", len(b))
	}
}

// TestFireblocksNonce_ReturnsDistinctValues confirms actual randomness,
// not just "returns a string of the right shape" -- a hardcoded or
// stuck-RNG nonce would let a replayed JWT collide.
func TestFireblocksNonce_ReturnsDistinctValues(t *testing.T) {
	seen := make(map[string]bool, 50)
	for i := 0; i < 50; i++ {
		n := fireblocksNonce()
		if seen[n] {
			t.Fatalf("fireblocksNonce() produced a duplicate value %q across only 50 calls -- RNG looks broken", n)
		}
		seen[n] = true
	}
}
