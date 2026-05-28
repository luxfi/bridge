package main

import (
	"reflect"
	"strings"
	"testing"
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
