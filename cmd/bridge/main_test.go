package main

import (
	"reflect"
	"strings"
	"testing"

	"github.com/luxfi/bridge"
)

// Coverage for the small helpers in main.go. The main() function itself
// isn't easily testable (it owns the process lifecycle); per-helper
// coverage is the right granularity.

func TestParseRPCOverrides_Happy(t *testing.T) {
	got, err := parseRPCOverrides("ETHEREUM_SEPOLIA=https://example.test/eth, BITCOIN_TESTNET=https://example.test/btc/api")
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]string{
		"ETHEREUM_SEPOLIA": "https://example.test/eth",
		"BITCOIN_TESTNET":  "https://example.test/btc/api",
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
}

func TestParseRPCOverrides_Empty(t *testing.T) {
	got, err := parseRPCOverrides("")
	if err != nil {
		t.Fatal(err)
	}
	if got != nil {
		t.Errorf("expected nil map for empty input, got %v", got)
	}
	got, err = parseRPCOverrides("   ")
	if err != nil {
		t.Fatal(err)
	}
	if got != nil {
		t.Errorf("expected nil map for whitespace input, got %v", got)
	}
}

func TestParseRPCOverrides_Malformed(t *testing.T) {
	cases := []string{
		"no_equals_here",          // no '='
		"=missing_network",        // empty key
		"NETWORK=",                // empty value
		"=",                       // both empty
		"OK=https://x, BAD",       // mix of good + bad
	}
	for _, c := range cases {
		_, err := parseRPCOverrides(c)
		if err == nil {
			t.Errorf("expected error for %q, got nil", c)
		} else if !strings.Contains(err.Error(), "malformed override") {
			t.Errorf("unexpected error for %q: %v", c, err)
		}
	}
}

func TestParseRPCOverrides_SkipsEmptyTokens(t *testing.T) {
	// Trailing comma + double comma shouldn't error.
	got, err := parseRPCOverrides("ETHEREUM_SEPOLIA=https://x,,")
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got["ETHEREUM_SEPOLIA"] != "https://x" {
		t.Errorf("unexpected: %v", got)
	}
}

func TestParseRPCOverrides_PreservesURLContainingEquals(t *testing.T) {
	// A URL with `?key=value` query string MUST round-trip — we split
	// on the FIRST '=' only.
	got, err := parseRPCOverrides("ETHEREUM_SEPOLIA=https://example.test/?apikey=secret&v=1")
	if err != nil {
		t.Fatal(err)
	}
	want := "https://example.test/?apikey=secret&v=1"
	if got["ETHEREUM_SEPOLIA"] != want {
		t.Errorf("got %q, want %q", got["ETHEREUM_SEPOLIA"], want)
	}
}

// =============================================================================
// envOr / envBool / envInt64
// =============================================================================

func TestEnvOr(t *testing.T) {
	t.Setenv("BRIDGE_TEST_ENVOR", "set-value")
	if got := envOr("BRIDGE_TEST_ENVOR", "fallback"); got != "set-value" {
		t.Errorf("got %q, want set-value", got)
	}
	if got := envOr("BRIDGE_TEST_ENVOR_UNSET", "fallback"); got != "fallback" {
		t.Errorf("got %q, want fallback for an unset var", got)
	}
}

func TestEnvBool(t *testing.T) {
	cases := []struct {
		val      string
		fallback bool
		want     bool
	}{
		{"true", false, true},
		{"TRUE", false, true},
		{"1", false, true},
		{"yes", false, true},
		{"on", false, true},
		{"false", true, false},
		{"0", true, false},
		{"no", true, false},
		{"off", true, false},
		{"garbage", true, true},  // unparseable -> fallback, not false
		{"garbage", false, false}, // unparseable -> fallback, not true
	}
	for _, c := range cases {
		t.Run(c.val+"/"+boolStr(c.fallback), func(t *testing.T) {
			t.Setenv("BRIDGE_TEST_ENVBOOL", c.val)
			if got := envBool("BRIDGE_TEST_ENVBOOL", c.fallback); got != c.want {
				t.Errorf("envBool(%q, fallback=%v) = %v, want %v", c.val, c.fallback, got, c.want)
			}
		})
	}
}

func TestEnvBool_UnsetUsesFallback(t *testing.T) {
	if got := envBool("BRIDGE_TEST_ENVBOOL_UNSET", true); got != true {
		t.Errorf("got %v, want fallback true for an unset var", got)
	}
}

func boolStr(b bool) string {
	if b {
		return "true"
	}
	return "false"
}

func TestEnvInt64(t *testing.T) {
	t.Setenv("BRIDGE_TEST_ENVINT64", "5000")
	if got := envInt64("BRIDGE_TEST_ENVINT64", 100); got != 5000 {
		t.Errorf("got %d, want 5000", got)
	}
}

func TestEnvInt64_UnsetUsesDefault(t *testing.T) {
	if got := envInt64("BRIDGE_TEST_ENVINT64_UNSET", 100); got != 100 {
		t.Errorf("got %d, want default 100", got)
	}
}

func TestEnvInt64_UnparseableUsesDefault(t *testing.T) {
	t.Setenv("BRIDGE_TEST_ENVINT64_BAD", "not-a-number")
	if got := envInt64("BRIDGE_TEST_ENVINT64_BAD", 100); got != 100 {
		t.Errorf("got %d, want default 100 for unparseable input", got)
	}
}

// TestEnvInt64_RejectsNonPositive pins a deliberate constraint: a
// zero or negative value in the env is treated as invalid config
// (falls back to the default) rather than accepted verbatim -- every
// real caller (e.g. FIREBLOCKS_COSIGNER_TIMEOUT_MS) is a duration-like
// knob where <=0 makes no sense.
func TestEnvInt64_RejectsNonPositive(t *testing.T) {
	t.Setenv("BRIDGE_TEST_ENVINT64_NEG", "-5")
	if got := envInt64("BRIDGE_TEST_ENVINT64_NEG", 100); got != 100 {
		t.Errorf("got %d, want default 100 for a negative value", got)
	}
	t.Setenv("BRIDGE_TEST_ENVINT64_ZERO", "0")
	if got := envInt64("BRIDGE_TEST_ENVINT64_ZERO", 100); got != 100 {
		t.Errorf("got %d, want default 100 for zero", got)
	}
}

// =============================================================================
// selectProfile
// =============================================================================

func TestSelectProfile_KnownNames(t *testing.T) {
	for _, name := range []string{"strict-pq", "lux-strict-pq", "lux-strict-pq-bridge"} {
		p, err := selectProfile(name)
		if err != nil {
			t.Errorf("selectProfile(%q): %v", name, err)
			continue
		}
		if p.Name != bridge.LuxStrictPQBridgeProfile.Name {
			t.Errorf("selectProfile(%q).Name = %q, want the strict-PQ profile", name, p.Name)
		}
	}
	for _, name := range []string{"classical-compat", "bridge-classical-compat-unsafe"} {
		p, err := selectProfile(name)
		if err != nil {
			t.Errorf("selectProfile(%q): %v", name, err)
			continue
		}
		if p.Name != bridge.BridgeClassicalCompat.Name {
			t.Errorf("selectProfile(%q).Name = %q, want the classical-compat profile", name, p.Name)
		}
	}
}

// An operator typo in --profile must fail loudly, never silently
// default to a posture the operator didn't ask for.
func TestSelectProfile_UnknownNameErrors(t *testing.T) {
	_, err := selectProfile("strict-pq-typo")
	if err == nil {
		t.Fatal("expected an error for an unknown profile name, got nil")
	}
	if !strings.Contains(err.Error(), "strict-pq-typo") {
		t.Errorf("error should name the bad value, got %q", err.Error())
	}
}
