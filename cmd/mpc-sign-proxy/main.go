// cmd/mpc-sign-proxy entrypoint. See proxy.go for the full wire
// contract and the mpcd two-upstream model.
//
// Typical deployment: dashboard for /sign + internal API for /keygen.
// This is the realistic config when the deployed mpcd image predates
// commit 0ac96d6 (which added the bridge-shape /sign on the internal
// API). All four upstream-related flags are set:
//
//	mpc-sign-proxy \
//	  --addr :9810 \
//	  --upstream-url        http://mpcd-dashboard.lux-mpc.svc:8081 \
//	  --upstream-token      "${MPCD_DASHBOARD_JWT}" \
//	  --keygen-upstream-url http://mpcd-internal.lux-mpc.svc:6000 \
//	  --keygen-upstream-token "${MPCD_INTERNAL_API_KEY}" \
//	  --sign-mode translate \
//	  --session-ttl 90s \
//	  --upstream-timeout 75s
//
// Modern mpcd (post-0ac96d6): both endpoints can share the internal API.
//
//	mpc-sign-proxy \
//	  --upstream-url   http://mpcd-internal.lux-mpc.svc:6000 \
//	  --upstream-token "${MPCD_INTERNAL_API_KEY}" \
//	  --sign-mode passthrough
//
// Then point cmd/bridge at it:
//
//	cmd/bridge --mpc-url http://mpc-sign-proxy.lux-bridge.svc:9810 ...

package main

import (
	"context"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	luxlog "github.com/luxfi/log"
)

var version = "dev"

func main() {
	addr := flag.String("addr", envOr("MPC_PROXY_ADDR", ":9810"), "listen address")
	upstreamURL := flag.String("upstream-url", envOr("MPC_PROXY_UPSTREAM_URL", ""),
		"upstream base URL for /sign. In translate mode this is the mpcd dashboard "+
			"(e.g. http://mpcd-dashboard.lux-mpc.svc:8081); in passthrough mode it's "+
			"the mpcd internal API (e.g. http://mpcd-internal.lux-mpc.svc:6000). Required.")
	upstreamToken := flag.String("upstream-token", envOr("MPC_PROXY_UPSTREAM_TOKEN", ""),
		"bearer JWT / API token for the /sign upstream. Required — mpcd rejects anonymous calls.")
	keygenUpstreamURL := flag.String("keygen-upstream-url", envOr("MPC_PROXY_KEYGEN_UPSTREAM_URL", ""),
		"upstream base URL for /keygen passthrough. Almost always the mpcd internal API "+
			"(e.g. http://mpcd-internal.lux-mpc.svc:6000) — the dashboard has no bridge-shape "+
			"keygen endpoint. Falls back to --upstream-url when empty.")
	keygenUpstreamToken := flag.String("keygen-upstream-token", envOr("MPC_PROXY_KEYGEN_UPSTREAM_TOKEN", ""),
		"bearer for the /keygen upstream. mpcd's internal API uses a static internalAPIKey "+
			"that usually differs from the dashboard JWT. Falls back to --upstream-token when empty.")
	signMode := flag.String("sign-mode", envOr("MPC_PROXY_SIGN_MODE", string(SignModeTranslate)),
		"how /sign is fulfilled: \"translate\" (default — dashboard two-step) or \"passthrough\" "+
			"(forward verbatim, requires modern mpcd internal API with /sign).")
	sessionTTL := flag.Duration("session-ttl", DefaultSessionTTL,
		"lifetime of each just-in-time session minted upstream (translate mode only). "+
			"Must outlive the sign call.")
	upstreamTimeout := flag.Duration("upstream-timeout", DefaultUpstreamTimeout,
		"per-call timeout for upstream requests. Sign + keygen ceremonies dominate; "+
			"75s default leaves room for ~60s server-side timeouts.")
	showVersion := flag.Bool("version", false, "print version and exit")
	flag.Parse()

	if *showVersion {
		fmt.Println(version)
		return
	}

	logger := luxlog.New("service", "mpc-sign-proxy")

	if *upstreamURL == "" {
		logger.Error("missing --upstream-url; proxy will reject every /sign + /keygen with 503")
	}
	if *upstreamToken == "" {
		logger.Error("missing --upstream-token; mpcd will reject every upstream call with 401")
	}

	mode := SignMode(strings.ToLower(*signMode))
	switch mode {
	case SignModeTranslate, SignModePassthrough:
	default:
		logger.Error("invalid --sign-mode; must be translate or passthrough", "got", *signMode)
		os.Exit(1)
	}

	proxy := &Proxy{
		UpstreamURL:         *upstreamURL,
		UpstreamToken:       *upstreamToken,
		KeygenUpstreamURL:   *keygenUpstreamURL,
		KeygenUpstreamToken: *keygenUpstreamToken,
		SignMode:            mode,
		SessionTTL:          *sessionTTL,
		HTTPClient:          &http.Client{Timeout: *upstreamTimeout},
		Logger:              logger,
	}

	mux := http.NewServeMux()
	proxy.Routes(mux)

	server := &http.Server{
		Addr:              *addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		keygenURL, _ := proxy.keygenUpstream()
		logger.Info("mpc-sign-proxy listening",
			"addr", *addr,
			"sign_upstream", *upstreamURL,
			"sign_mode", string(mode),
			"keygen_upstream", keygenURL,
			"session_ttl", *sessionTTL,
			"upstream_timeout", *upstreamTimeout,
			"version", version,
		)
		errCh <- server.ListenAndServe()
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	select {
	case sig := <-stop:
		logger.Info("shutdown signal received", "signal", sig.String())
	case err := <-errCh:
		if err != nil && err != http.ErrServerClosed {
			logger.Error("listen failed", "err", err)
			os.Exit(1)
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		logger.Error("shutdown", "err", err)
	}
	logger.Info("shutdown complete", "stats", proxy.Stats())
}

func envOr(k, fallback string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return fallback
}
