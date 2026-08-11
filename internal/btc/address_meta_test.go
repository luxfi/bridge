package btc

import "testing"

func TestParamsFor_KnownNetworks(t *testing.T) {
	cases := []struct {
		name string
		want NetworkParams
	}{
		{"BITCOIN_MAINNET", MainnetParams},
		{"bitcoin_mainnet", MainnetParams}, // case-insensitive
		{"BITCOIN_TESTNET", TestnetParams},
		{"BITCOIN_TESTNET3", TestnetParams},
		{"BITCOIN_SIGNET", TestnetParams},
		{"BITCOIN_REGTEST", TestnetParams},
	}
	for _, c := range cases {
		got, ok := ParamsFor(c.name)
		if !ok {
			t.Errorf("ParamsFor(%q): ok = false, want true", c.name)
			continue
		}
		if got != c.want {
			t.Errorf("ParamsFor(%q) = %+v, want %+v", c.name, got, c.want)
		}
	}
}

// TestParamsFor_MainnetAndTestnetPrefixesDiffer guards against a copy-paste
// bug that wires both branches to the same NetworkParams value -- which
// would make an address decode against the wrong network's version bytes
// without any decode-time error.
func TestParamsFor_MainnetAndTestnetPrefixesDiffer(t *testing.T) {
	if MainnetParams.P2PKHPrefix == TestnetParams.P2PKHPrefix {
		t.Error("MainnetParams and TestnetParams share the same P2PKH prefix -- network confusion risk")
	}
	if MainnetParams.Bech32HRP == TestnetParams.Bech32HRP {
		t.Error("MainnetParams and TestnetParams share the same bech32 HRP -- network confusion risk")
	}
}

func TestParamsFor_UnknownNetworkReturnsFalse(t *testing.T) {
	got, ok := ParamsFor("ETHEREUM_MAINNET")
	if ok {
		t.Errorf("ParamsFor(unknown): ok = true, want false")
	}
	if got != (NetworkParams{}) {
		t.Errorf("ParamsFor(unknown) = %+v, want the zero value", got)
	}
}

func TestScriptKind_String(t *testing.T) {
	cases := []struct {
		kind ScriptKind
		want string
	}{
		{ScriptP2PKH, "P2PKH"},
		{ScriptP2SH, "P2SH"},
		{ScriptP2WPKH, "P2WPKH"},
		{ScriptP2WSH, "P2WSH"},
		{ScriptUnknown, "unknown"},
		{ScriptKind(99), "unknown"}, // out-of-range value must not panic
	}
	for _, c := range cases {
		if got := c.kind.String(); got != c.want {
			t.Errorf("ScriptKind(%d).String() = %q, want %q", c.kind, got, c.want)
		}
	}
}
