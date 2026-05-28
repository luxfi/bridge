// dot_crypto.go: self-contained secp256k1 ECDSA verify for the
// recovery-byte determination in DOTAssembler.Finalize.
//
// Why hand-rolled: the bridge's existing crypto deps are luxfi/crypto
// (CGO) and the EVM assembler's math/big-only RLP path. Adding the
// CGO secp256k1 build dep would force every consumer of internal/txassembler
// to link against a C compiler. Substrate-target binaries are already
// no-cgo (see Dockerfile). So we implement secp256k1 ECDSA verify in
// pure Go using math/big — about 100 lines.
//
// Scope: VERIFY only. We don't need to sign here (the MPC does that)
// or recover a pubkey from scratch (we have a candidate pubkey and a
// signature; we just check whether the signature verifies under that
// pubkey).
//
// References:
//   - SEC 1: Elliptic Curve Cryptography (the secp256k1 curve params)
//   - RFC 6979 / NIST FIPS 186-4 for ECDSA verification
//
// Correctness: cross-tested against a known-good secp256k1 reference
// (signature produced by a well-known seed → verify both succeeds and
// fails on wrong pubkey).

package txassembler

import (
	"math/big"
)

// Secp256k1 curve parameters.
var (
	// secp256k1P is the field prime: 2^256 - 2^32 - 977.
	secp256k1P, _ = new(big.Int).SetString(
		"fffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f", 16)
	// Generator G — uncompressed (Gx, Gy).
	secp256k1Gx, _ = new(big.Int).SetString(
		"79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798", 16)
	secp256k1Gy, _ = new(big.Int).SetString(
		"483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8", 16)
	// b = 7 (curve equation y^2 = x^3 + 7 mod P)
	secp256k1B = big.NewInt(7)
	// Order n already defined in assembler.go as secp256k1N.
)

// =============================================================================
// Point math — affine coordinates with explicit point-at-infinity flag
// =============================================================================

type secp256k1Point struct {
	x, y *big.Int
	inf  bool // identity / point at infinity
}

func newSecp256k1Point(x, y *big.Int) secp256k1Point {
	return secp256k1Point{x: new(big.Int).Set(x), y: new(big.Int).Set(y)}
}

func infinity() secp256k1Point {
	return secp256k1Point{inf: true}
}

// modP reduces a value into [0, P).
func modP(a *big.Int) *big.Int {
	r := new(big.Int).Mod(a, secp256k1P)
	if r.Sign() < 0 {
		r.Add(r, secp256k1P)
	}
	return r
}

// modInverseP returns a^-1 mod P via Fermat's little theorem.
// (P is prime, so a^(P-2) ≡ a^-1.)
func modInverseP(a *big.Int) *big.Int {
	return new(big.Int).Exp(a, new(big.Int).Sub(secp256k1P, big.NewInt(2)), secp256k1P)
}

// secp256k1Add implements affine point addition. Standard formula; both
// inputs must be on the curve. Handles identity + doubling correctly.
func secp256k1Add(p, q secp256k1Point) secp256k1Point {
	if p.inf {
		return q
	}
	if q.inf {
		return p
	}
	// p + (-p) → infinity.
	if p.x.Cmp(q.x) == 0 {
		// Same x — either doubling or vertical-line case.
		if p.y.Cmp(q.y) != 0 {
			return infinity()
		}
		// Doubling: λ = 3x^2 / 2y.
		num := new(big.Int).Mul(p.x, p.x)
		num.Mul(num, big.NewInt(3))
		num = modP(num)
		den := new(big.Int).Lsh(p.y, 1) // 2y
		den = modP(den)
		lambda := new(big.Int).Mul(num, modInverseP(den))
		lambda = modP(lambda)

		x3 := new(big.Int).Mul(lambda, lambda)
		x3.Sub(x3, new(big.Int).Lsh(p.x, 1))
		x3 = modP(x3)

		y3 := new(big.Int).Sub(p.x, x3)
		y3.Mul(y3, lambda)
		y3.Sub(y3, p.y)
		y3 = modP(y3)
		return newSecp256k1Point(x3, y3)
	}

	// Addition: λ = (y2 - y1) / (x2 - x1).
	num := new(big.Int).Sub(q.y, p.y)
	num = modP(num)
	den := new(big.Int).Sub(q.x, p.x)
	den = modP(den)
	lambda := new(big.Int).Mul(num, modInverseP(den))
	lambda = modP(lambda)

	x3 := new(big.Int).Mul(lambda, lambda)
	x3.Sub(x3, p.x)
	x3.Sub(x3, q.x)
	x3 = modP(x3)

	y3 := new(big.Int).Sub(p.x, x3)
	y3.Mul(y3, lambda)
	y3.Sub(y3, p.y)
	y3 = modP(y3)

	return newSecp256k1Point(x3, y3)
}

// secp256k1ScalarMult implements simple double-and-add scalar
// multiplication. Not constant-time — fine for verification (no secrets
// involved; just the public scalars in an ECDSA verification).
func secp256k1ScalarMult(p secp256k1Point, k *big.Int) secp256k1Point {
	if k.Sign() == 0 || p.inf {
		return infinity()
	}
	res := infinity()
	cur := p
	// Iterate bits low→high.
	bits := k.BitLen()
	for i := 0; i < bits; i++ {
		if k.Bit(i) == 1 {
			res = secp256k1Add(res, cur)
		}
		cur = secp256k1Add(cur, cur)
	}
	return res
}

// =============================================================================
// Compressed pubkey decoding
// =============================================================================

// decodeCompressedPub parses a 33-byte SEC-1 compressed pubkey into
// (x, y) on secp256k1. Returns (nil, nil, false) on bad input.
func decodeCompressedPub(b []byte) (x, y *big.Int, ok bool) {
	if len(b) != 33 {
		return nil, nil, false
	}
	prefix := b[0]
	if prefix != 0x02 && prefix != 0x03 {
		return nil, nil, false
	}
	x = new(big.Int).SetBytes(b[1:])
	if x.Cmp(secp256k1P) >= 0 {
		return nil, nil, false
	}
	// y^2 = x^3 + 7 mod P
	x3 := new(big.Int).Mul(x, x)
	x3.Mul(x3, x)
	x3.Add(x3, secp256k1B)
	x3 = modP(x3)
	// y = sqrt(x3) via tonelli-shanks; since P ≡ 3 mod 4 the shortcut
	// y = x3^((P+1)/4) mod P works.
	exp := new(big.Int).Add(secp256k1P, big.NewInt(1))
	exp.Rsh(exp, 2)
	y = new(big.Int).Exp(x3, exp, secp256k1P)
	// Pick the parity matching the prefix.
	yIsOdd := y.Bit(0) == 1
	wantOdd := prefix == 0x03
	if yIsOdd != wantOdd {
		y = new(big.Int).Sub(secp256k1P, y)
	}
	return x, y, true
}

// =============================================================================
// ECDSA verify
// =============================================================================

// ecdsaVerifyCompressed verifies an ECDSA signature against the given
// 33-byte compressed pubkey. msgHash is the 32-byte pre-image hash
// (substrate's blake2_256 over the signing payload). sig is the 64-byte
// (r||s) form — the recovery byte is not used here (caller already
// resolved which v made the recovered pubkey match; this verify is the
// authoritative check).
//
// Returns true on a valid signature, false otherwise.
func ecdsaVerifyCompressed(msgHash, sig64, compressedPub []byte) bool {
	if len(sig64) != 64 {
		return false
	}
	x, y, ok := decodeCompressedPub(compressedPub)
	if !ok {
		return false
	}
	r := new(big.Int).SetBytes(sig64[:32])
	s := new(big.Int).SetBytes(sig64[32:64])
	// r, s ∈ (0, n).
	if r.Sign() <= 0 || s.Sign() <= 0 ||
		r.Cmp(secp256k1N) >= 0 || s.Cmp(secp256k1N) >= 0 {
		return false
	}
	// Lift msgHash to a field element (mod n).
	z := new(big.Int).SetBytes(msgHash)
	// If the hash is longer than the order length, truncate. For our
	// 32-byte input and 256-bit order, that's already the right size.
	if z.Cmp(secp256k1N) >= 0 {
		z.Mod(z, secp256k1N)
	}
	// w = s^-1 mod n.
	w := new(big.Int).ModInverse(s, secp256k1N)
	if w == nil {
		return false
	}
	// u1 = z·w mod n; u2 = r·w mod n.
	u1 := new(big.Int).Mul(z, w)
	u1.Mod(u1, secp256k1N)
	u2 := new(big.Int).Mul(r, w)
	u2.Mod(u2, secp256k1N)
	// (x1, y1) = u1·G + u2·Q
	g := newSecp256k1Point(secp256k1Gx, secp256k1Gy)
	q := newSecp256k1Point(x, y)
	p1 := secp256k1ScalarMult(g, u1)
	p2 := secp256k1ScalarMult(q, u2)
	sum := secp256k1Add(p1, p2)
	if sum.inf {
		return false
	}
	// Valid iff x1 mod n == r.
	x1modN := new(big.Int).Mod(sum.x, secp256k1N)
	return x1modN.Cmp(r) == 0
}
