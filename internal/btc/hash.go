// Bitcoin hashing primitives.
package btc

import (
	"crypto/sha256"

	"golang.org/x/crypto/ripemd160"
)

// Hash160 returns RIPEMD160(SHA256(data)) — Bitcoin's "hash160", used
// for P2PKH and P2WPKH script payloads. The hash is 20 bytes wide.
func Hash160(data []byte) [20]byte {
	sha := sha256.Sum256(data)
	r := ripemd160.New()
	_, _ = r.Write(sha[:])
	var out [20]byte
	copy(out[:], r.Sum(nil))
	return out
}
