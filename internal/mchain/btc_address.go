package mchain

// btc_address.go — Bitcoin address re-encoding between mainnet and
// testnet network parameters.
//
// WHY THIS EXISTS: mpcd's BTC keygen returns mainnet-format P2PKH
// addresses (`1…`) even when the bridge requests an address for
// BITCOIN_TESTNET (verified empirically 2026-05-28 against the live
// cluster — a keygen for BITCOIN_TESTNET returned
// "1Ld2qdqUDKhvHZze2bWoZtZxznpZWB65Fi"). Without this re-encoder, a
// user depositing on testnet would see a mainnet address; if they
// sent real (mainnet) BTC to it, they'd lose funds.
//
// The fix belongs in mpcd long-term — it should accept the requesting
// network's chain parameters and pick the right version byte at
// derivation time. Until that lands, this package converts the
// returned address locally: same hash160 payload, different version
// byte, recomputed base58check digest. Conversion is idempotent on
// already-testnet input so callers can wrap unconditionally.
//
// Scope: handles P2PKH (most common, what mpcd produces) and P2SH
// (defensive, in case mpcd ever switches modes). Bech32 SegWit
// addresses (`bc1…` / `tb1…`) pass through unchanged when already
// testnet, and return an explicit error when mainnet — bech32
// re-encoding requires a different code path and shouldn't be silently
// converted. Native pure-Go base58check; no external dependencies.

import (
	"crypto/sha256"
	"errors"
	"fmt"
	"math/big"
	"strings"
)

const btcBase58Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

const (
	btcP2PKHMainnet byte = 0x00 // mainnet P2PKH addresses start with '1'
	btcP2PKHTestnet byte = 0x6f // testnet P2PKH addresses start with 'm' or 'n'
	btcP2SHMainnet  byte = 0x05 // mainnet P2SH addresses start with '3'
	btcP2SHTestnet  byte = 0xc4 // testnet P2SH addresses start with '2'
)

// isBTCTestnet reports whether the network's bridge-internal name
// designates a Bitcoin testnet variant. Used to gate calls to
// btcAddressForTestnet so the re-encoder only fires when the mpcd
// quirk actually applies.
func isBTCTestnet(network string) bool {
	switch strings.ToUpper(network) {
	case "BITCOIN_TESTNET", "BITCOIN_SIGNET", "BITCOIN_REGTEST":
		return true
	}
	return false
}

// btcAddressForTestnet returns the testnet-network equivalent of a
// mainnet Bitcoin P2PKH or P2SH address. The hash160 payload is
// preserved verbatim; the version byte changes (0x00 → 0x6f for P2PKH,
// 0x05 → 0xc4 for P2SH) and the 4-byte checksum is recomputed.
//
// Idempotent: returns the input unchanged when it's already testnet.
// Errors on bech32 mainnet input, malformed base58check, bad checksum,
// or unrecognized version bytes.
func btcAddressForTestnet(addr string) (string, error) {
	if addr == "" {
		return "", errors.New("btcAddressForTestnet: empty address")
	}
	// Bech32 — case-insensitive HRP per BIP-173, though the addresses
	// mpcd produces are lowercase. tb… is already testnet, return
	// unchanged. bc… is mainnet bech32 and would need a separate
	// converter (decode bech32, swap HRP, re-encode); we don't expect
	// mpcd to emit those, so surface as an error to flag if it ever
	// starts.
	low := strings.ToLower(addr)
	if strings.HasPrefix(low, "tb1") {
		return addr, nil
	}
	if strings.HasPrefix(low, "bc1") {
		return "", fmt.Errorf("btcAddressForTestnet: bech32 mainnet re-encoding not implemented (got %q)", addr)
	}

	payload, version, err := base58CheckDecode(addr)
	if err != nil {
		return "", fmt.Errorf("btcAddressForTestnet: %w", err)
	}
	if len(payload) != 20 {
		return "", fmt.Errorf("btcAddressForTestnet: payload must be 20 bytes (hash160), got %d", len(payload))
	}

	var newVersion byte
	switch version {
	case btcP2PKHMainnet:
		newVersion = btcP2PKHTestnet
	case btcP2SHMainnet:
		newVersion = btcP2SHTestnet
	case btcP2PKHTestnet, btcP2SHTestnet:
		return addr, nil
	default:
		return "", fmt.Errorf("btcAddressForTestnet: unrecognized version byte 0x%02x", version)
	}

	return base58CheckEncode(newVersion, payload), nil
}

// base58CheckEncode prepends the version byte, computes the 4-byte
// SHA256d checksum, and base58-encodes the concatenation.
func base58CheckEncode(version byte, payload []byte) string {
	full := make([]byte, 0, 1+len(payload)+4)
	full = append(full, version)
	full = append(full, payload...)
	checksum := sha256d(full)
	full = append(full, checksum[:4]...)
	return base58Encode(full)
}

// base58CheckDecode reverses base58CheckEncode. Returns the payload
// (everything after the version byte, before the checksum) and the
// version byte. Errors when the decoded form is too short to contain
// a checksum or when the trailing 4 bytes don't match SHA256d of the
// preceding bytes.
func base58CheckDecode(s string) (payload []byte, version byte, err error) {
	raw, err := base58Decode(s)
	if err != nil {
		return nil, 0, err
	}
	if len(raw) < 5 {
		return nil, 0, fmt.Errorf("base58CheckDecode: too short after decode (%d bytes)", len(raw))
	}
	versionAndPayload := raw[:len(raw)-4]
	gotChecksum := raw[len(raw)-4:]
	wantChecksum := sha256d(versionAndPayload)
	for i := 0; i < 4; i++ {
		if gotChecksum[i] != wantChecksum[i] {
			return nil, 0, errors.New("base58CheckDecode: checksum mismatch")
		}
	}
	return versionAndPayload[1:], versionAndPayload[0], nil
}

// sha256d returns SHA256(SHA256(data)) — Bitcoin's "double SHA-256".
func sha256d(data []byte) [32]byte {
	first := sha256.Sum256(data)
	return sha256.Sum256(first[:])
}

// base58Encode performs the canonical Bitcoin base58 encoding. Leading
// zero bytes become leading '1' characters in the output.
func base58Encode(input []byte) string {
	if len(input) == 0 {
		return ""
	}
	zeros := 0
	for _, b := range input {
		if b != 0 {
			break
		}
		zeros++
	}
	n := new(big.Int).SetBytes(input)
	base := big.NewInt(58)
	mod := new(big.Int)
	var encoded []byte
	for n.Sign() > 0 {
		n.DivMod(n, base, mod)
		encoded = append(encoded, btcBase58Alphabet[mod.Int64()])
	}
	for i := 0; i < zeros; i++ {
		encoded = append(encoded, '1')
	}
	for i, j := 0, len(encoded)-1; i < j; i, j = i+1, j-1 {
		encoded[i], encoded[j] = encoded[j], encoded[i]
	}
	return string(encoded)
}

// base58Decode reverses base58Encode. Leading '1' characters become
// leading zero bytes. Returns an error on any character outside the
// Bitcoin base58 alphabet.
func base58Decode(s string) ([]byte, error) {
	if s == "" {
		return nil, errors.New("base58Decode: empty input")
	}
	zeros := 0
	for i := 0; i < len(s) && s[i] == '1'; i++ {
		zeros++
	}
	n := new(big.Int)
	base := big.NewInt(58)
	digit := new(big.Int)
	for i := 0; i < len(s); i++ {
		idx := strings.IndexByte(btcBase58Alphabet, s[i])
		if idx < 0 {
			return nil, fmt.Errorf("base58Decode: invalid character %q at pos %d", s[i], i)
		}
		n.Mul(n, base)
		digit.SetInt64(int64(idx))
		n.Add(n, digit)
	}
	nb := n.Bytes()
	out := make([]byte, zeros+len(nb))
	copy(out[zeros:], nb)
	return out, nil
}
