package main

import (
	"context"
	"net/http"
	"os"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/zap-proto/zip"
	middleware "github.com/zap-proto/zip/middleware"

	"github.com/luxfi/bridge/internal/bchain"
)

// The two /admin/swaps handlers mutate any swap by id and authenticate nobody —
// their own comments say "operator-only … no auth … do not expose externally".
// They now sit on the operator listener (api.RegisterAdmin), and even there
// only when an operator asks: two decisions before an arbitrary caller can
// rewind a swap.
//
// The pair below is the difference between a comment and a control. The first
// fails if the routes come back by default. The second fails if the flag stops
// mounting them — which would otherwise make the first pass for a reason that
// has nothing to do with the flag.
//
// Both use a swap that exists. An absent id is answered 404 by the handler
// itself, which is the same status the router gives for a route that was never
// mounted, so an unknown id cannot tell "off" from "reachable and empty".

const seededSwap = "swap-under-test"

func adminRig(t *testing.T, enable bool) (public, admin *zip.App) {
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
	public = zip.New(zip.Config{AppName: "lux-bridge-test-public", DisableStartupMessage: true})
	public.Use(middleware.Recover(), middleware.RequestID())
	api.Register(public)
	admin = zip.New(zip.Config{AppName: "lux-bridge-test-admin", DisableStartupMessage: true})
	admin.Use(middleware.Recover(), middleware.RequestID())
	api.RegisterAdmin(admin)
	return public, admin
}

// Mounted at the root of the operator listener, not under /v1/bridge or /api.
var adminPaths = []string{
	"/admin/swaps/" + seededSwap + "/reset",
	"/admin/swaps/" + seededSwap + "/inject-raw-tx",
}

func TestAdminSwapRoutesAreAbsentByDefault(t *testing.T) {
	_, admin := adminRig(t, false)
	for _, path := range adminPaths {
		status, _ := fireRequest(t, admin, "POST", path, nil)
		if status != http.StatusNotFound {
			t.Fatalf("POST %s answered %d with the flag off — an uncredentialed swap mutator is reachable by default", path, status)
		}
	}
}

func TestAdminSwapRoutesMountWhenAskedFor(t *testing.T) {
	_, admin := adminRig(t, true)
	for _, path := range adminPaths {
		status, _ := fireRequest(t, admin, "POST", path, nil)
		if status == http.StatusNotFound {
			t.Fatalf("POST %s answered 404 with the flag on — the flag mounts nothing, so the default-off test passes for the wrong reason", path)
		}
	}
}

// And with the flag on, they are still absent from the listener the edge
// routes. The flag says an operator wants them; it does not say the internet
// does.
func TestAdminSwapRoutesNeverReachThePublicListener(t *testing.T) {
	public, _ := adminRig(t, true)
	for _, path := range adminPaths {
		status, body := fireRequest(t, public, "POST", path, nil)
		if status != http.StatusNotFound {
			t.Fatalf("POST %s answered %d on the public listener; body=%s", path, status, body)
		}
	}
}

// And the thing the gate is actually protecting: with the routes mounted,
// anyone who can reach the listener can rewind a swap's status and blank its
// signature. No header, no token, no session. This test states that plainly, so
// the default-off posture above reads as a decision rather than a preference.
func TestResetRewindsASwapWithNoCredential(t *testing.T) {
	_, admin := adminRig(t, true)
	status, _ := fireRequest(t, admin, "POST", "/admin/swaps/"+seededSwap+"/reset", nil)
	if status != http.StatusOK {
		t.Fatalf("reset answered %d; expected the handler to accept an unauthenticated caller", status)
	}
}

// The default this flag is built from decides whether uncredentialed routes are
// mounted, and every spelling below is one an operator reaches for to say "off".
// `envOr(k, "") != ""` answered true to all of them, because it asks whether the
// variable is set rather than what it says.
func TestAdminRoutesStayOffForEverySpellingOfOff(t *testing.T) {
	for _, off := range []string{"false", "0", "off", "no", "n", "f", "FALSE", "Off", ""} {
		t.Setenv("BRIDGE_ADMIN_ROUTES", off)
		if envBool("BRIDGE_ADMIN_ROUTES", false) {
			t.Errorf("BRIDGE_ADMIN_ROUTES=%q mounted the admin routes", off)
		}
	}
	for _, on := range []string{"true", "1", "yes", "on", "TRUE"} {
		t.Setenv("BRIDGE_ADMIN_ROUTES", on)
		if !envBool("BRIDGE_ADMIN_ROUTES", false) {
			t.Errorf("BRIDGE_ADMIN_ROUTES=%q did not mount the admin routes", on)
		}
	}
	// A value that is neither keeps the safe default rather than guessing.
	t.Setenv("BRIDGE_ADMIN_ROUTES", "maybe")
	if envBool("BRIDGE_ADMIN_ROUTES", false) {
		t.Error("an unparseable value mounted the admin routes")
	}
}

// The defect was not in envBool, which was already right — it was in the one
// call site that did not use it. A flag whose default is `envOr(k, "") != ""`
// is a switch that reads every spelling of "off" as on, so the shape is barred
// from this file outright rather than fixed once where it was noticed.
func TestNoBooleanFlagIsBuiltFromASetnessTest(t *testing.T) {
	src, err := os.ReadFile("main.go")
	if err != nil {
		t.Fatalf("read main.go: %v", err)
	}
	bad := regexp.MustCompile(`envOr\([^)]*\)\s*!=\s*""`)
	for i, line := range strings.Split(string(src), "\n") {
		if bad.MatchString(line) && !strings.HasPrefix(strings.TrimSpace(line), "//") {
			t.Errorf("main.go:%d builds a boolean from whether a variable is set, not what it says: %s",
				i+1, strings.TrimSpace(line))
		}
	}
}
