// Package main is the unified Lux bridge: a single Go binary that embeds
// the SPA, serves the bridge API natively for read paths (networks, tokens,
// quotes), and proxies MPC-heavy paths (swap orchestration, signer state)
// to the legacy Node backend during the migration to a fully native impl.
//
// Build: go build -o bridge ./cmd/bridge
// Run:   bridge --config /etc/bridge/networks.yaml
//
// Routes:
//
//	/                                       SPA (embedded; SPA-routing fallback)
//	/envs.js                                runtime config window.ENV = {...}
//	/icon.svg, /logo.svg                    per-host brand assets (disk override)
//	/health                                 service health
//	/v1/bridge/networks                     supported chains
//	/v1/bridge/tokens                       tokens per chain
//	/v1/bridge/quote                        price quote (proxied)
//	/v1/bridge/rate                         exchange rate (proxied)
//	/v1/bridge/limits                       swap limits (proxied)
//	/v1/bridge/swaps/*                      swap CRUD (proxied)
//	/v1/bridge/explorer/*                   tx lookup (proxied)
//	/v1/bridge/settings                     config (proxied)
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/luxfi/bridge"
)

var version = "dev"

func main() {
	cfgPath := flag.String("config", envOr("BRIDGE_CONFIG", "/etc/bridge/networks.yaml"), "path to networks.yaml")
	addr := flag.String("addr", envOr("BRIDGE_ADDR", ":8080"), "listen address")
	backend := flag.String("backend", envOr("BRIDGE_BACKEND_URL", ""), "legacy Node backend URL for proxied routes (empty disables proxy)")
	staticDir := flag.String("static", envOr("BRIDGE_STATIC_DIR", ""), "override embedded SPA from disk")
	profileFlag := flag.String("profile", envOr("BRIDGE_PROFILE", "classical-compat"),
		"bridge security profile: strict-pq | classical-compat")
	showVersion := flag.Bool("version", false, "print version and exit")
	flag.Parse()

	if *showVersion {
		fmt.Println(version)
		return
	}

	// Resolve the bridge profile. Default is classical-compat (the
	// user-facing UI talks to external L1s); operators pin
	// strict-pq for an internal Lux↔Lux bridge.
	profile, err := selectProfile(*profileFlag)
	if err != nil {
		log.Fatalf("bridge profile: %v", err)
	}
	log.Printf("bridge profile: %s (post_quantum_end_to_end=%t)",
		profile.Name, profile.IsPostQuantumEndToEnd())

	cfg, err := LoadConfig(*cfgPath)
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	frontend, err := NewFrontend(cfg, *staticDir)
	if err != nil {
		log.Fatalf("frontend: %v", err)
	}

	api := NewAPI(cfg, *backend)
	api.SetProfile(profile)

	mux := http.NewServeMux()
	api.Register(mux)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"status":"ok","version":%q,"backend_proxy":%t,"profile":%q,"post_quantum_end_to_end":%t}`,
			version, *backend != "", profile.Name, profile.IsPostQuantumEndToEnd())
	})
	mux.Handle("/", frontend)

	srv := &http.Server{
		Addr:              *addr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("lux-bridge %s listening on %s (backend=%q networks=%d)", version, *addr, *backend, len(cfg.Networks))
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
	log.Println("shutdown complete")
}

func envOr(k, fallback string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return fallback
}

// selectProfile resolves the --profile flag value to a bridge profile
// pointer. Refuses an unknown value rather than silently defaulting:
// an operator who typos the profile name must see the error rather
// than ship under the wrong posture.
func selectProfile(name string) (*bridge.BridgeProfile, error) {
	switch name {
	case "strict-pq", "lux-strict-pq", "lux-strict-pq-bridge":
		p := bridge.LuxStrictPQBridgeProfile
		return &p, nil
	case "classical-compat", "bridge-classical-compat-unsafe":
		p := bridge.BridgeClassicalCompat
		return &p, nil
	default:
		return nil, fmt.Errorf("unknown bridge profile %q (valid: strict-pq, classical-compat)", name)
	}
}
