// mpc-router — family-aware MPC routing proxy.
//
// The bridge points both --mpc-url and --mpc-private-url at this proxy.
// On every /keygen and /sign request it inspects the wallet_id and
// routes to a backend by signature family:
//
//	wallet_id is Solana / TON / XRP family → ed25519 backend (mpcd-single)
//	anything else (EVM / BTC)              → ECDSA backend (real mpcd)
//
// Why this exists:
//   - Real mpcd (lux-mpc) signs ECDSA secp256k1 but has no production
//     ed25519 keygen yet — cluster-FROST is the deferred epic (task #112).
//   - mpcd-single signs ed25519 from an HKDF-derived per-wallet key but
//     has no ECDSA path.
//
// Neither backend alone covers both swap directions; this proxy stitches
// them into one coherent MPC endpoint so EVM↔{Sol,TON,XRP} works in both
// directions simultaneously. When real mpcd gains native threshold
// ed25519, point --eddsa-url at it and retire mpcd-single — no bridge
// change, just a router flag flip.
//
// Custody note: this is plumbing, not a signer. It forwards request
// bodies verbatim and never sees key material; the custody posture is
// whatever the two backends provide (single-seed for mpcd-single,
// t-of-n for real mpcd). Productionized from the smoke-test
// /tmp/mpc-router.go per REQUIREMENTS §13.7 G7.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/luxfi/bridge/internal/secrets"
)

// version is overridden at build time via -ldflags "-X main.version=...".
var version = "dev"

// router holds the resolved backend config. Constructed once in main and
// reused for the process lifetime; the zero value is not usable (use the
// fields directly in tests). Stateless beyond config — safe for the
// concurrent requests net/http drives.
type router struct {
	eddsaURL   string
	eddsaToken string
	ecdsaURL   string
	ecdsaToken string
	client     *http.Client
}

func main() {
	addr := flag.String("addr", ":9700", "HTTP listen address")
	eddsaURL := flag.String("eddsa-url", "http://localhost:9900",
		"ed25519 backend base URL (mpcd-single, or a future threshold-ed25519 mpcd). Receives Solana/TON/XRP keygen+sign.")
	eddsaToken := flag.String("eddsa-token", "",
		"Secrets URI for the ed25519 backend bearer token. Schemes: literal:<v>, env:<NAME>, file:<path>, kms:<...>; unprefixed = literal. Empty (default) sends no Authorization header — mpcd-single needs none.")
	ecdsaURL := flag.String("ecdsa-url", "http://localhost:9800",
		"ECDSA backend base URL (real mpcd / lux-mpc cluster). Receives EVM/BTC keygen+sign.")
	ecdsaToken := flag.String("ecdsa-token", "bridge-testnet-key",
		"Secrets URI for the ECDSA backend bearer token. Schemes as --eddsa-token; unprefixed value is treated as a literal token (back-compat with the smoke default).")
	backendTimeout := flag.Duration("backend-timeout", 125*time.Second,
		"per-request timeout when forwarding to a backend. Kept just under the bridge's MPC client timeout so a hung backend surfaces as a 502 here rather than a client-side cancel.")
	flag.Parse()

	ctx := context.Background()
	resolver := secrets.Default()
	edTok, err := resolveToken(ctx, resolver, *eddsaToken)
	if err != nil {
		log.Fatalf("resolve --eddsa-token: %v", err)
	}
	ecTok, err := resolveToken(ctx, resolver, *ecdsaToken)
	if err != nil {
		log.Fatalf("resolve --ecdsa-token: %v", err)
	}

	rt := &router{
		eddsaURL:   strings.TrimRight(*eddsaURL, "/"),
		eddsaToken: edTok,
		ecdsaURL:   strings.TrimRight(*ecdsaURL, "/"),
		ecdsaToken: ecTok,
		client:     &http.Client{Timeout: *backendTimeout},
	}

	log.Println("============================================================")
	log.Printf(" mpc-router %s — family-aware MPC routing proxy", version)
	log.Println("============================================================")
	log.Printf(" listen:     %s", *addr)
	log.Printf(" eddsa  →    %s  (Solana/TON/XRP, auth=%s)", rt.eddsaURL, tokenState(rt.eddsaToken))
	log.Printf(" ecdsa  →    %s  (EVM/BTC, auth=%s)", rt.ecdsaURL, tokenState(rt.ecdsaToken))
	log.Println("============================================================")

	srv := &http.Server{
		Addr:         *addr,
		Handler:      rt.mux(),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: *backendTimeout + 5*time.Second,
	}
	if err := srv.ListenAndServe(); err != nil {
		log.Fatalf("ListenAndServe: %v", err)
	}
}

// resolveToken resolves a secrets URI to its concrete token value. Empty
// input stays empty (no auth header) without touching the resolver, so a
// no-token backend like mpcd-single doesn't require a secrets source.
func resolveToken(ctx context.Context, r secrets.Resolver, uri string) (string, error) {
	if uri == "" {
		return "", nil
	}
	return r.Resolve(ctx, uri)
}

// tokenState describes a token for the startup banner without leaking it.
func tokenState(tok string) string {
	if tok == "" {
		return "none"
	}
	return "set"
}

func (rt *router) mux() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("/keygen", rt.opHandler("keygen"))
	mux.HandleFunc("/sign", rt.opHandler("sign"))
	// /healthz is a liveness probe — it reports that the proxy process is
	// up and serving. It deliberately does NOT probe the backends: a
	// backend outage should surface as a 502 on a real request (and in
	// the bridge's own MPC metrics), not flap the router's own liveness
	// and trigger a pod restart that fixes nothing.
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok","service":"mpc-router"}`))
	})
	return mux
}

// opHandler proxies one MPC operation (keygen/sign). It parses only the
// wallet_id to pick a backend, then forwards the ORIGINAL request body
// verbatim so no field is dropped in translation.
func (rt *router) opHandler(op string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		body, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		var req struct {
			WalletID string `json:"wallet_id"`
		}
		if err := json.Unmarshal(body, &req); err != nil {
			log.Printf("%s: bad json: %v", op, err)
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		backend, token := rt.ecdsaURL, rt.ecdsaToken
		family := familyFor(req.WalletID)
		if family == "eddsa" {
			backend, token = rt.eddsaURL, rt.eddsaToken
		}
		log.Printf("%s wallet_id=%q family=%s → %s", op, req.WalletID, family, backend)
		rt.forward(w, backend+"/"+op, body, token)
	}
}

// forward POSTs body to url with the backend's bearer token (when set)
// and streams the backend's status, headers, and body back to the
// caller unchanged. A transport-level failure surfaces as 502 so the
// bridge's MPC client transitions out of "pending" instead of hanging.
func (rt *router) forward(w http.ResponseWriter, url string, body []byte, token string) {
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := rt.client.Do(req)
	if err != nil {
		log.Printf("backend %s error: %v", url, err)
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	defer func() { _ = resp.Body.Close() }()
	for k, vs := range resp.Header {
		for _, v := range vs {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

// familyFor classifies a wallet_id by signature family. Kept byte-for-byte
// in sync with cmd/mpcd-single's familyFor and the bridge's mpc-router
// routing contract: the bridge maps TON + XRP onto the Solana keygen slot
// (mchain pickAddress "TON + XRP share the SOL keygen slot"), so all three
// ed25519 families match here and route to the ed25519 backend.
//
// Matched case-insensitively against substring markers:
//
//	solana, sol_                 → eddsa (Solana family)
//	ton_, -ton-                  → eddsa (TON)
//	xrp_, -xrp-                  → eddsa (XRPL ed25519 path)
//	anything else (EVM, BTC)     → ecdsa (real mpcd cluster)
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
