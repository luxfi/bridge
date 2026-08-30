package main

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/zap-proto/zip"
	middleware "github.com/zap-proto/zip/middleware"

	"github.com/luxfi/bridge/internal/bchain"
)

// The two /admin/swaps handlers mutate any swap by id and authenticate nobody —
// their own comments say "operator-only … no auth … do not expose externally".
// They were mounted on the same app as the public routes, so the only thing
// keeping them unreachable was that they sit at the app root while the edge
// forwards /v1/bridge and /api. That is a property of the ingress rules, not of
// this program, and it holds until someone adds a catch-all.
//
// The pair below is the difference between a comment and a control. The first
// fails if the routes come back by default. The second fails if the flag stops
// mounting them — which would otherwise make the first pass for a reason that
// has nothing to do with the gate.
//
// Both use a swap that exists. An absent id is answered 404 by the handler
// itself, which is the same status the router gives for a route that was never
// mounted, so an unknown id cannot tell "gated" from "reachable and empty".

const seededSwap = "swap-under-test"

func adminRig(t *testing.T, enable bool) *zip.App {
	t.Helper()
	store := NewInMemoryStore()
	if err := store.Create(context.Background(), &Swap{
		ID:     seededSwap,
		Status: SwapStatusCompleted,
	}); err != nil {
		t.Fatalf("seed swap: %v", err)
	}
	// A bchain client is required, not decorative: the whole native-swap block
	// — admin routes included — is behind `a.store != nil && a.bchain != nil`.
	// It never dials; the router is what is under test.
	api := NewAPI(Config{}, "", bchain.New("http://127.0.0.1:0", time.Second), nil, nil, store)
	if enable {
		api.EnableAdminRoutes()
	}
	app := zip.New(zip.Config{AppName: "lux-bridge-test-admin", DisableStartupMessage: true})
	app.Use(middleware.Recover(), middleware.RequestID())
	api.Register(app)
	return app
}

// Mounted at the app root, not under /v1/bridge or /api.
var adminPaths = []string{
	"/admin/swaps/" + seededSwap + "/reset",
	"/admin/swaps/" + seededSwap + "/inject-raw-tx",
}

func TestAdminSwapRoutesAreAbsentByDefault(t *testing.T) {
	app := adminRig(t, false)
	for _, path := range adminPaths {
		status, _ := fireRequest(t, app, "POST", path, nil)
		if status != http.StatusNotFound {
			t.Fatalf("POST %s answered %d with the flag off — an uncredentialed swap mutator is reachable by default", path, status)
		}
	}
}

func TestAdminSwapRoutesMountWhenAskedFor(t *testing.T) {
	app := adminRig(t, true)
	for _, path := range adminPaths {
		status, _ := fireRequest(t, app, "POST", path, nil)
		if status == http.StatusNotFound {
			t.Fatalf("POST %s answered 404 with the flag on — the flag mounts nothing, so the default-off test passes for the wrong reason", path)
		}
	}
}

// And the thing the gate is actually protecting: with the routes mounted,
// anyone who can reach the listener can rewind a swap's status and blank its
// signature. No header, no token, no session. This test states that plainly, so
// the default-off posture above reads as a decision rather than a preference.
func TestResetRewindsASwapWithNoCredential(t *testing.T) {
	app := adminRig(t, true)
	status, _ := fireRequest(t, app, "POST", "/admin/swaps/"+seededSwap+"/reset", nil)
	if status != http.StatusOK {
		t.Fatalf("reset answered %d; expected the handler to accept an unauthenticated caller", status)
	}
}
