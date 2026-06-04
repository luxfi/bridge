// fake-mpcd is a smoke-test stand-in for the real lux-mpc daemon.
//
// It exists for ONE purpose: prove the bridge's Solana code path
// (PreSignSolana → ed25519 → FinalizeSolana → broadcast) against a
// real Solana cluster without waiting for the production mpcd to ship
// FROST ed25519 keygen + threshold-ed25519 sign.
//
// Scope:
//   - /keygen — returns a fixed Solana base58 pubkey loaded from a
//     persistent ed25519 keypair on disk, plus a fixed (placeholder)
//     eth_address. The bridge accepts both fields without validating
//     that each /keygen returns a fresh wallet; reusing one key across
//     calls is fine for single-swap smoke testing.
//   - /sign — signs the supplied message via ed25519. Detects EVM
//     sighash requests (hex length == 64) and rejects them with a
//     clear error, since this stub has no ECDSA secp256k1 path.
//
// NOT a substitute for real mpcd:
//   - No threshold cryptography. Single key, single signer.
//   - No org_id / wallet_id namespacing. Every call returns the same
//     key.
//   - No persistence beyond the on-disk ed25519 keypair.
//   - No ECDSA support → Sol→Lux release leg unsupported.
//
// When to delete: as soon as real mpcd ships eddsa_pub_key on /keygen
// and the threshold-ed25519 /sign path.
package main

import (
	"crypto/ed25519"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/luxfi/bridge/internal/solanarpc"
)

func main() {
	addr := flag.String("addr", ":9900", "HTTP listen address")
	keyFile := flag.String("key-file", "/tmp/fake-mpcd-ed25519.key",
		"Persistent ed25519 private key (64 bytes raw). Generated on first run.")
	ethStub := flag.String("eth-address", "0xdeadbeef00000000000000000000000000000001",
		"Fixed eth_address returned by /keygen (the bridge never signs with this for the Lux→Sol path)")
	flag.Parse()

	priv := loadOrGenerateKey(*keyFile)
	pub := priv.Public().(ed25519.PublicKey)
	solBase58 := solanarpc.EncodeBase58(pub)

	fmt.Println("============================================================")
	fmt.Println(" fake-mpcd — smoke-test stand-in for lux-mpc")
	fmt.Println("============================================================")
	fmt.Printf(" listen:           %s\n", *addr)
	fmt.Printf(" ed25519 keyfile:  %s\n", *keyFile)
	fmt.Printf(" sol_address:      %s\n", solBase58)
	fmt.Printf(" eth_address stub: %s\n", *ethStub)
	fmt.Println("")
	fmt.Printf(" Fund this address with devnet SOL before running a Lux→Sol swap:\n")
	fmt.Printf("   https://faucet.solana.com/?address=%s\n", solBase58)
	fmt.Printf(" Or via CLI:\n")
	fmt.Printf("   solana airdrop 0.1 %s --url devnet\n", solBase58)
	fmt.Println("============================================================")
	fmt.Println("")

	mux := http.NewServeMux()
	mux.HandleFunc("/keygen", keygenHandler(solBase58, *ethStub, hex.EncodeToString(pub)))
	mux.HandleFunc("/sign", signHandler(priv))
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("ok"))
	})

	log.Printf("fake-mpcd listening on %s (sol_address=%s)", *addr, solBase58)
	if err := http.ListenAndServe(*addr, mux); err != nil {
		log.Fatalf("ListenAndServe: %v", err)
	}
}

// loadOrGenerateKey persists an ed25519 key across restarts so the
// funded Solana address survives a stub-process bounce. Generation
// happens at most once; subsequent runs reuse the existing file.
func loadOrGenerateKey(path string) ed25519.PrivateKey {
	if data, err := os.ReadFile(path); err == nil {
		if len(data) != ed25519.PrivateKeySize {
			log.Fatalf("key file %s: wrong length %d (want %d)",
				path, len(data), ed25519.PrivateKeySize)
		}
		log.Printf("loaded existing ed25519 key from %s", path)
		return ed25519.PrivateKey(data)
	}
	_, priv, err := ed25519.GenerateKey(nil)
	if err != nil {
		log.Fatalf("generate ed25519: %v", err)
	}
	if err := os.WriteFile(path, priv, 0o600); err != nil {
		log.Fatalf("save key to %s: %v", path, err)
	}
	log.Printf("generated new ed25519 key, saved to %s", path)
	return priv
}

// keygenHandler returns the bridge-compatible keygen response. The
// bridge's pickAddress reads sol_address for SOLANA_* and eth_address
// for ETH-family networks — populating both makes the same stub usable
// for either source/destination role in a Lux↔Sol swap.
func keygenHandler(solAddr, ethAddr, eddsaPubHex string) http.HandlerFunc {
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
		log.Printf("/keygen org_id=%q wallet_id=%q", req.OrgID, req.WalletID)
		resp := map[string]any{
			"wallet_id":     req.WalletID,
			"sol_address":   solAddr,
			"eth_address":   ethAddr,
			"eddsa_pub_key": eddsaPubHex,
			"result_type":   "success",
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}
}

// signHandler signs the supplied hex-encoded message with the stub's
// ed25519 key. Path matrix by wallet_id family:
//
//   solana / sol_  → ed25519 over the raw message bytes (legacy Solana
//                    message, ~150 B). Any length OK.
//   ton_   / -ton- → ed25519 over the raw message bytes (V4R2 cell
//                    hash, 32 B). The cell-hash being 32 B doesn't
//                    mean it's an EVM sighash — TON's wallet contract
//                    verifies ed25519 against the cell hash directly.
//   anything else  → assumed EVM. We reject 32-B messages here with
//                    a clear "use the real mpcd" error so EVM swaps
//                    misrouted to this stub fail loudly instead of
//                    producing an unverifiable ed25519 sig over a
//                    keccak sighash.
//
// Pattern mirrors mpc-router.familyFor; keep both call sites in sync.
func signHandler(priv ed25519.PrivateKey) http.HandlerFunc {
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
		msgHex := strings.TrimPrefix(strings.TrimPrefix(req.Message, "0x"), "0X")
		// EVM rejection only fires when the wallet_id ISN'T an
		// ed25519 family. TON cell hashes are also 32 B — they must
		// pass through to ed25519.Sign below.
		wid := strings.ToLower(req.WalletID)
		isEd25519 := strings.Contains(wid, "solana") ||
			strings.Contains(wid, "sol_") ||
			strings.Contains(wid, "ton_") ||
			strings.Contains(wid, "-ton-")
		if !isEd25519 && len(msgHex) == 64 {
			log.Printf("/sign REJECTED EVM-shaped sighash (32 B) wallet_id=%q", req.WalletID)
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"wallet_id":   req.WalletID,
				"error":       "fake-mpcd: ECDSA secp256k1 signing not supported (message is 32 B — looks like an EVM sighash). Use the real mpcd or a richer stub for EVM signing.",
				"error_code":  "unsupported_scheme",
				"result_type": "error",
			})
			return
		}
		msg, err := hex.DecodeString(msgHex)
		if err != nil {
			http.Error(w, "decode message hex: "+err.Error(), http.StatusBadRequest)
			return
		}
		sig := ed25519.Sign(priv, msg)
		log.Printf("/sign wallet_id=%q msg_len=%d sig_hex=%s…",
			req.WalletID, len(msg), hex.EncodeToString(sig)[:16])
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"wallet_id":   req.WalletID,
			"signature":   hex.EncodeToString(sig),
			"session_id":  "fake-mpcd-" + req.WalletID,
			"result_type": "success",
		})
	}
}
