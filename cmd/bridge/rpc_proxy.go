package main

import (
	"bytes"
	"io"
	"net/http"
	"time"

	"github.com/hanzoai/zip"
	luxlog "github.com/luxfi/log"
)

// rpc_proxy.go — same-origin JSON-RPC reverse proxy for the embedded SPA.
//
// Motivation: the public Lux RPC gateway at api.lux.network /
// api.lux-test.network has a strict CORS allow-list — bridge.lux.network
// is not in it, so wagmi's useBalance() never resolves on Lux chains
// (the browser blocks every response). Proxying through the bridge
// backend (same-origin) sidesteps the allow-list without changing
// gateway config. The bridge already speaks to these RPCs server-side
// for the deposit watcher, so the network path is identical; only the
// browser-vs-bridge actor changes.
//
// Properties of the proxy:
//   - POST only (JSON-RPC is POST-only over HTTP).
//   - Body forwarded verbatim. No introspection / no rewriting of the
//     JSON-RPC envelope — anything that works directly against the
//     upstream works here.
//   - Upstream timeout is bounded so a slow Lux node can't hold the
//     browser tab's wagmi loop hostage.
//   - No auth header is forwarded — the upstream is a public RPC.
//   - Read-only by intent: even though POST is allowed, the upstream
//     enforces what's safe (eth_call, eth_getBalance, etc. are
//     read-only; eth_sendRawTransaction relays signed bytes that
//     anyone could broadcast directly). Adding a method allow-list
//     here would just duplicate gateway policy.

// DefaultRPCProxyTimeout bounds each upstream request. 12s is generous
// enough for a slow Lux node + Cloudflare edge while still well under
// browser-side fetch timeouts.
const DefaultRPCProxyTimeout = 12 * time.Second

// rpcProxy builds a zip handler that forwards POST bodies to upstreamURL
// verbatim. Returns nil when upstreamURL is empty (caller MUST handle
// nil and skip route registration in that case).
//
// Logger may be nil; when set, failures (transport errors, non-2xx
// upstream responses) are logged at Warn so operators see CORS-proxy
// degradation as early as the same-origin gateway degradation would be.
func rpcProxy(upstreamURL string, timeout time.Duration, logger luxlog.Logger) zip.Handler {
	if upstreamURL == "" {
		return nil
	}
	if timeout <= 0 {
		timeout = DefaultRPCProxyTimeout
	}
	client := &http.Client{Timeout: timeout}

	return func(c *zip.Ctx) error {
		// c.Body() is the raw POST body from fasthttp. Build a stdlib
		// request to forward via http.Client (gives us HTTP/2 to the
		// upstream + connection pooling that fasthttp wouldn't share
		// with the framework's inbound side).
		body := c.Body()
		req, err := http.NewRequestWithContext(c.Context(), http.MethodPost, upstreamURL, bytes.NewReader(body))
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{
				"error":  "rpc_proxy_build_request_failed",
				"detail": err.Error(),
			})
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "application/json")

		resp, err := client.Do(req)
		if err != nil {
			if logger != nil {
				logger.Warn("rpc proxy upstream error",
					"upstream", upstreamURL,
					"err", err,
				)
			}
			return c.JSON(http.StatusBadGateway, map[string]string{
				"error":  "rpc_proxy_upstream_unreachable",
				"detail": err.Error(),
			})
		}
		defer resp.Body.Close()
		respBody, err := io.ReadAll(resp.Body)
		if err != nil {
			return c.JSON(http.StatusBadGateway, map[string]string{
				"error":  "rpc_proxy_read_upstream_body_failed",
				"detail": err.Error(),
			})
		}
		// Always return JSON content-type — every upstream we care
		// about (Lux gateway, Erigon, geth) sends JSON for JSON-RPC.
		c.SetHeader("Content-Type", "application/json")
		return c.Bytes(resp.StatusCode, respBody)
	}
}
