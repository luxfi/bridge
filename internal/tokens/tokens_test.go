package tokens

import (
	"strings"
	"testing"
)

func TestRegistry_RegisterAndLookup(t *testing.T) {
	r := NewRegistry()
	if err := r.Register(Info{Network: "ETHEREUM_SEPOLIA", Asset: "USDC", Contract: "0x1c7D", Decimals: 6}); err != nil {
		t.Fatal(err)
	}
	got, ok := r.Lookup("ETHEREUM_SEPOLIA", "USDC")
	if !ok {
		t.Fatal("expected hit")
	}
	if got.Decimals != 6 || got.Contract != "0x1c7D" {
		t.Errorf("unexpected info: %+v", got)
	}
}

func TestRegistry_Lookup_CaseInsensitive(t *testing.T) {
	r := NewRegistry()
	_ = r.Register(Info{Network: "LUX_TESTNET", Asset: "LUX", Decimals: 18})
	// All these should hit the same entry.
	for _, p := range []struct{ net, asset string }{
		{"LUX_TESTNET", "LUX"},
		{"lux_testnet", "lux"},
		{"Lux_Testnet", "Lux"},
	} {
		if _, ok := r.Lookup(p.net, p.asset); !ok {
			t.Errorf("expected hit for (%q, %q)", p.net, p.asset)
		}
	}
}

func TestRegistry_Lookup_Miss(t *testing.T) {
	r := NewRegistry()
	if got, ok := r.Lookup("ETHEREUM_SEPOLIA", "UNOBTAINIUM"); ok {
		t.Errorf("expected miss, got %+v", got)
	}
}

func TestRegistry_Register_Validates(t *testing.T) {
	r := NewRegistry()
	cases := []struct {
		name string
		in   Info
		want string
	}{
		{"no network", Info{Asset: "ETH", Decimals: 18}, "Network and Asset"},
		{"no asset", Info{Network: "X", Decimals: 18}, "Network and Asset"},
		{"negative decimals", Info{Network: "X", Asset: "Y", Decimals: -1}, "Decimals must be"},
		{"way too many decimals", Info{Network: "X", Asset: "Y", Decimals: 31}, "Decimals must be"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := r.Register(tc.in)
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Errorf("got %v, want %q in message", err, tc.want)
			}
		})
	}
}

func TestRegistry_Register_Overwrites(t *testing.T) {
	r := NewRegistry()
	_ = r.Register(Info{Network: "X", Asset: "USDC", Decimals: 18}) // wrong decimals
	_ = r.Register(Info{Network: "X", Asset: "USDC", Decimals: 6})  // correct
	got, _ := r.Lookup("X", "USDC")
	if got.Decimals != 6 {
		t.Errorf("second Register should overwrite; got Decimals=%d", got.Decimals)
	}
}

func TestRegistry_ForNetwork(t *testing.T) {
	r := NewRegistry()
	_ = r.Register(Info{Network: "ETHEREUM_SEPOLIA", Asset: "ETH", Decimals: 18})
	_ = r.Register(Info{Network: "ETHEREUM_SEPOLIA", Asset: "USDC", Contract: "0xabc", Decimals: 6})
	_ = r.Register(Info{Network: "LUX_TESTNET", Asset: "LUX", Decimals: 18})
	got := r.ForNetwork("ETHEREUM_SEPOLIA")
	if len(got) != 2 {
		t.Errorf("expected 2 assets on Sepolia, got %d: %+v", len(got), got)
	}
}

func TestInfo_IsNative(t *testing.T) {
	native := &Info{Network: "X", Asset: "ETH", Decimals: 18}
	erc20 := &Info{Network: "X", Asset: "USDC", Contract: "0xabc", Decimals: 6}
	if !native.IsNative() {
		t.Error("native (empty contract) should be IsNative()")
	}
	if erc20.IsNative() {
		t.Error("ERC-20 should NOT be IsNative()")
	}
	// Nil safety
	var nilInfo *Info
	if !nilInfo.IsNative() {
		t.Error("nil *Info should default to native (avoids per-caller nil checks)")
	}
}

func TestDefaultRegistry_HasCommonAssets(t *testing.T) {
	r := DefaultRegistry()
	// Sanity-check a handful of the most operationally important entries.
	cases := []struct {
		net, asset, contract string
		decimals             int
	}{
		{"ETHEREUM_MAINNET", "USDC", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", 6},
		{"ETHEREUM_MAINNET", "ETH", "", 18},
		{"ETHEREUM_SEPOLIA", "USDC", "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", 6},
		{"LUX_TESTNET", "LUX", "", 18},
		{"BSC_MAINNET", "USDC", "", 18}, // BSC USDC is 18 decimals — not 6!
		{"POLYGON_MAINNET", "USDC", "", 6},
		{"BITCOIN_TESTNET", "BTC", "", 8},
		{"SOLANA_DEVNET", "SOL", "", 9},
	}
	for _, tc := range cases {
		got, ok := r.Lookup(tc.net, tc.asset)
		if !ok {
			t.Errorf("expected default entry for (%s, %s)", tc.net, tc.asset)
			continue
		}
		if got.Decimals != tc.decimals {
			t.Errorf("%s/%s: Decimals = %d, want %d", tc.net, tc.asset, got.Decimals, tc.decimals)
		}
		if tc.contract != "" && got.Contract != tc.contract {
			t.Errorf("%s/%s: Contract = %q, want %q", tc.net, tc.asset, got.Contract, tc.contract)
		}
	}
}

func TestRegistry_Size(t *testing.T) {
	r := NewRegistry()
	if r.Size() != 0 {
		t.Errorf("expected 0, got %d", r.Size())
	}
	_ = r.Register(Info{Network: "X", Asset: "Y", Decimals: 18})
	if r.Size() != 1 {
		t.Errorf("expected 1, got %d", r.Size())
	}
}

func TestRegistry_NilSafety(t *testing.T) {
	var r *Registry
	if _, ok := r.Lookup("X", "Y"); ok {
		t.Error("nil Registry should miss every lookup")
	}
	if r.Size() != 0 {
		t.Error("nil Registry Size should be 0")
	}
	if got := r.ForNetwork("X"); got != nil {
		t.Errorf("nil Registry ForNetwork should be nil, got %v", got)
	}
	if err := r.Register(Info{Network: "X", Asset: "Y", Decimals: 18}); err == nil {
		t.Error("nil Registry Register should error")
	}
}
