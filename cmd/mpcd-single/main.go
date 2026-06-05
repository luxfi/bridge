// mpcd-single is a single-signer mpcd that mirrors the on-the-wire API
// of the production lux-mpc daemon (/keygen + /sign) but derives every
// per-wallet ed25519 key deterministically from one master seed.
//
// Why this exists:
//   - Real cluster-FROST ed25519 keygen+sign in lux-mpc is its own
//     multi-week program (see task #112 / mpc_eddsa epic). Until that
//     ships, ed25519 chains (Solana, TON, XRP) need *some* signer.
//   - The previous stub (fake-mpcd) used ONE hardcoded ed25519 key for
//     every wallet — every deposit address could be signed by the same
//     secret. That's the actual problem; threshold custody is the
//     longer-term answer.
//
// What this fixes:
//   - One master seed (32 bytes), loaded via the bridge's secrets
//     Resolver — file/env/kms/literal. KMS-rooted custody for real
//     deployments; auto-generated file for dev.
//   - Per-wallet ed25519 keypair derived via HKDF-SHA-512(master, info=
//     wallet_id || "ed25519-priv-seed", salt=protocol-version). Two
//     different wallet_ids produce two different keys; the same
//     wallet_id is stable across restarts.
//   - No private keys persisted per wallet — derivation is the storage.
//   - eth_address is a deterministic per-wallet *stub* (sha256 of an
//     HKDF expansion). It is NOT a usable EVM signing key; mpcd-single
//     has no ECDSA. The bridge routes ECDSA traffic to real mpcd via
//     mpc-router, so the field is returned only for back-compat with
//     callers that read it without intending to sign.
//
// What this is NOT:
//   - Threshold custody. ONE signer holds the master seed; compromise of
//     that seed compromises every derived wallet. Treat it like an HSM-
//     backed hot wallet, not a t-of-n cluster.
//   - An ECDSA signer. Route ECDSA traffic to real mpcd.
package main

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"

	"golang.org/x/crypto/hkdf"

	"github.com/luxfi/bridge/internal/secrets"
	"github.com/luxfi/bridge/internal/solanarpc"
)

const (
	// hkdfSaltV1 anchors the derivation schedule to this binary's
	// version. If the derivation algorithm ever changes (different
	// curve, different HKDF parameters), bump to V2 so existing wallets
	// are not silently re-derived under a new key.
	hkdfSaltV1 = "lux-bridge-mpcd-single/v1"

	// edInfoLabel + ethStubInfoLabel give domain separation: an HKDF
	// with the same secret + salt + walletID but different info MUST
	// produce uncorrelated outputs.
	edInfoLabel      = "ed25519-priv-seed"
	ethStubInfoLabel = "eth-address-stub"

	masterSeedLen = 32
)

func main() {
	addr := flag.String("addr", ":9900", "HTTP listen address")
	masterSeedURI := flag.String("master-seed",
		"file:/var/lib/mpcd-single/master.seed",
		"Secrets URI for the master seed. Schemes: literal:<hex32>, env:<NAME>, file:<path>, kms:<...>. Value (after Resolver) must be 32 bytes of random key material — hex-encoded for literal/env/file, raw bytes for kms.")
	autoCreate := flag.Bool("auto-create-seed", true,
		"For file: scheme, generate a new 32-byte master seed and write it (0600) if the file is missing. Convenient for dev; in production prefer pre-provisioning the file or using a kms: URI.")
	flag.Parse()

	ctx := context.Background()
	seed, generated, err := loadMasterSeed(ctx, *masterSeedURI, *autoCreate)
	if err != nil {
		log.Fatalf("master seed: %v", err)
	}

	fmt.Println("============================================================")
	fmt.Println(" mpcd-single — single-signer mpcd (HKDF per-wallet ed25519)")
	fmt.Println("============================================================")
	fmt.Printf(" listen:        %s\n", *addr)
	fmt.Printf(" master-seed:   %s\n", *masterSeedURI)
	fmt.Printf(" seed-fingerpr: %s\n", seedFingerprint(seed))
	if generated {
		fmt.Println(" *** GENERATED A NEW MASTER SEED ***")
		fmt.Println(" Back this up. Every previously-derived deposit address")
		fmt.Println(" now depends on this seed.")
	}
	fmt.Println("============================================================")
	fmt.Println()

	mux := http.NewServeMux()
	mux.HandleFunc("/keygen", keygenHandler(seed))
	mux.HandleFunc("/sign", signHandler(seed))
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("ok"))
	})

	log.Printf("mpcd-single listening on %s", *addr)
	if err := http.ListenAndServe(*addr, mux); err != nil {
		log.Fatalf("ListenAndServe: %v", err)
	}
}

// loadMasterSeed resolves the master seed via the secrets Resolver. For
// file: URIs we add an auto-create path so dev runs are zero-config; all
// other schemes fail loudly if the source is missing.
//
// The Resolver returns the resolved string verbatim. For literal/env/
// file, the string is hex-encoded key material; for kms, providers
// typically also return hex (raw bytes leak via env-var quoting). We
// hex-decode unconditionally and reject anything that isn't exactly
// masterSeedLen bytes.
func loadMasterSeed(ctx context.Context, uri string, autoCreate bool) ([]byte, bool, error) {
	resolver := secrets.Default()

	generated := false
	resolved, err := resolver.Resolve(ctx, uri)
	if err != nil && autoCreate && strings.HasPrefix(uri, "file:") {
		path := strings.TrimPrefix(uri, "file:")
		if _, statErr := os.Stat(path); errors.Is(statErr, os.ErrNotExist) {
			if dir := pathDir(path); dir != "" {
				_ = os.MkdirAll(dir, 0o700)
			}
			fresh := make([]byte, masterSeedLen)
			if _, e := rand.Read(fresh); e != nil {
				return nil, false, fmt.Errorf("generate seed: %w", e)
			}
			if e := os.WriteFile(path, []byte(hex.EncodeToString(fresh)), 0o600); e != nil {
				return nil, false, fmt.Errorf("write seed to %s: %w", path, e)
			}
			generated = true
			resolved = hex.EncodeToString(fresh)
		} else {
			return nil, false, err
		}
	} else if err != nil {
		return nil, false, err
	}

	seed, err := hex.DecodeString(strings.TrimSpace(resolved))
	if err != nil {
		return nil, false, fmt.Errorf("decode seed hex: %w", err)
	}
	if len(seed) != masterSeedLen {
		return nil, false, fmt.Errorf("master seed must be %d bytes (got %d)", masterSeedLen, len(seed))
	}
	return seed, generated, nil
}

func pathDir(path string) string {
	i := strings.LastIndex(path, "/")
	if i < 0 {
		return ""
	}
	return path[:i]
}

// seedFingerprint returns a non-reversible 8-byte tag of the seed so an
// operator can confirm at a glance which seed a process is using
// (matches across restarts, diverges between deployments) without
// leaking the seed itself in logs.
func seedFingerprint(seed []byte) string {
	h := sha256.Sum256(append([]byte("mpcd-single-fingerprint/v1|"), seed...))
	return hex.EncodeToString(h[:8])
}

// familyFor classifies a wallet_id by signature family. Mirrors the
// routing in /tmp/mpc-router so 32-byte ed25519 messages (TON cell
// hashes, XRPL SHA-512Half digests) don't get rejected as
// EVM-shaped sighashes downstream.
//
// Inputs are matched case-insensitively against substring markers:
//
//	solana, sol_                 → eddsa (Solana family)
//	ton_, -ton-                  → eddsa (TON)
//	xrp_, -xrp-                  → eddsa (XRPL ed25519 path)
//	anything else                → ecdsa (assumed EVM/BTC; not signable here)
func familyFor(walletID string) string {
	wid := strings.ToLower(walletID)
	switch {
	case strings.Contains(wid, "solana"),
		strings.Contains(wid, "sol_"),
		strings.Contains(wid, "ton_"),
		strings.Contains(wid, "-ton-"),
		strings.Contains(wid, "xrp_"),
		strings.Contains(wid, "-xrp-"):
		return "eddsa"
	default:
		return "ecdsa"
	}
}

// deriveEd25519Key derives a per-wallet ed25519 keypair from the master
// seed. Determinism guarantee: same (seed, walletID) → same key across
// restarts and across processes. Uniqueness: different walletIDs
// produce uncorrelated keys.
func deriveEd25519Key(masterSeed []byte, walletID string) ed25519.PrivateKey {
	info := walletID + "|" + edInfoLabel
	seed := hkdfDerive(masterSeed, hkdfSaltV1, info, ed25519.SeedSize)
	return ed25519.NewKeyFromSeed(seed)
}

// deriveEthAddressStub returns a deterministic per-wallet 20-byte hex
// string shaped like an EVM address. It is NOT a usable signing key;
// mpcd-single has no ECDSA path. Existing /keygen callers that read
// eth_address get a stable per-wallet value instead of a single
// hardcoded stub (which would collide across all wallets).
func deriveEthAddressStub(masterSeed []byte, walletID string) string {
	info := walletID + "|" + ethStubInfoLabel
	raw := hkdfDerive(masterSeed, hkdfSaltV1, info, 32)
	h := sha256.Sum256(raw)
	return "0x" + hex.EncodeToString(h[:20])
}

func hkdfDerive(secret []byte, salt, info string, outLen int) []byte {
	r := hkdf.New(sha512.New, secret, []byte(salt), []byte(info))
	out := make([]byte, outLen)
	if _, err := io.ReadFull(r, out); err != nil {
		panic(fmt.Errorf("hkdf read: %w", err))
	}
	return out
}

// keygenHandler returns the bridge-compatible keygen response.
// Per-wallet ed25519 key is derived on every call; the result is
// deterministic so the bridge can re-call with the same wallet_id
// and get the same deposit address back (no stored state).
func keygenHandler(masterSeed []byte) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			OrgID    string `json:"org_id"`
			WalletID string `json:"wallet_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "bad json: "+err.Error(), http.StatusBadRequest)
			return
		}
		if req.WalletID == "" {
			http.Error(w, "wallet_id required", http.StatusBadRequest)
			return
		}
		priv := deriveEd25519Key(masterSeed, req.WalletID)
		pub := priv.Public().(ed25519.PublicKey)
		solBase58 := solanarpc.EncodeBase58(pub)
		ethStub := deriveEthAddressStub(masterSeed, req.WalletID)

		log.Printf("/keygen org_id=%q wallet_id=%q sol=%s", req.OrgID, req.WalletID, solBase58)
		resp := map[string]any{
			"wallet_id":     req.WalletID,
			"sol_address":   solBase58,
			"eth_address":   ethStub,
			"eddsa_pub_key": hex.EncodeToString(pub),
			"result_type":   "success",
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}
}

// signHandler signs the supplied hex message with the wallet-derived
// ed25519 key. ecdsa-family wallet_ids are rejected with a clear error
// so misrouted EVM signs fail loudly here instead of producing an
// unverifiable ed25519 signature.
func signHandler(masterSeed []byte) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			OrgID    string `json:"org_id"`
			WalletID string `json:"wallet_id"`
			Message  string `json:"message"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "bad json: "+err.Error(), http.StatusBadRequest)
			return
		}
		if req.WalletID == "" {
			http.Error(w, "wallet_id required", http.StatusBadRequest)
			return
		}
		family := familyFor(req.WalletID)
		if family != "eddsa" {
			log.Printf("/sign REJECTED non-eddsa wallet_id=%q (mpcd-single has no ECDSA path; route via mpc-router)", req.WalletID)
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"wallet_id":   req.WalletID,
				"error":       "mpcd-single: ECDSA secp256k1 signing not supported. Route ECDSA traffic to real mpcd via mpc-router.",
				"error_code":  "unsupported_scheme",
				"result_type": "error",
			})
			return
		}

		msgHex := strings.TrimPrefix(strings.TrimPrefix(req.Message, "0x"), "0X")
		msg, err := hex.DecodeString(msgHex)
		if err != nil {
			http.Error(w, "decode message hex: "+err.Error(), http.StatusBadRequest)
			return
		}
		priv := deriveEd25519Key(masterSeed, req.WalletID)
		sig := ed25519.Sign(priv, msg)
		sigHex := hex.EncodeToString(sig)
		log.Printf("/sign wallet_id=%q msg_len=%d sig=%s…", req.WalletID, len(msg), sigHex[:16])
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"wallet_id":   req.WalletID,
			"signature":   sigHex,
			"session_id":  "mpcd-single-" + req.WalletID,
			"result_type": "success",
		})
	}
}
