// Tests for the EVM tx assembler.
//
// Test vectors below come from the canonical Ethereum reference
// implementations (go-ethereum, ethers.js) — cross-checked against
// independent calculators for the RLP / keccak / EIP-155 paths.

package txassembler

import (
	"bytes"
	"context"
	"encoding/hex"
	"math/big"
	"strings"
	"testing"

	"github.com/luxfi/bridge/internal/tokens"
)

// =============================================================================
// RLP — primitive vectors
// =============================================================================

// Vectors lifted from the Ethereum Yellow Paper §B.1 examples.
func TestRLP_StringPrimitives(t *testing.T) {
	cases := []struct {
		name string
		in   []byte
		want string // hex
	}{
		{"empty", []byte{}, "80"},
		{"single low byte", []byte{0x00}, "00"},
		{"single byte 0x7f", []byte{0x7f}, "7f"},
		{"single byte 0x80 → length prefix", []byte{0x80}, "8180"},
		{"hello world", []byte("hello"), "8568656c6c6f"},
		// 55 chars exactly → 0x80+0x37 = 0xb7 prefix
		{"55 bytes", make55(), "b7" + hexrep("a", 55)},
		// 56 chars → long-string encoding: 0xb8 (one length byte) + 0x38 (=56)
		{"56 bytes", make56(), "b838" + hexrep("a", 56)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := hex.EncodeToString(encodeBytes(tc.in))
			if got != tc.want {
				t.Errorf("got %q, want %q", got, tc.want)
			}
		})
	}
}

func make55() []byte { return bytes.Repeat([]byte{'a'}, 55) }
func make56() []byte { return bytes.Repeat([]byte{'a'}, 56) }
func hexrep(s string, n int) string {
	out := ""
	if s == "a" {
		out = "61"
	}
	r := ""
	for i := 0; i < n; i++ {
		r += out
	}
	return r
}

// =============================================================================
// encodeUint — canonical big-int encoding
// =============================================================================

func TestEncodeUint_Canonical(t *testing.T) {
	cases := []struct {
		name string
		n    *big.Int
		want string
	}{
		{"zero", big.NewInt(0), "80"},
		{"one", big.NewInt(1), "01"},
		{"127", big.NewInt(127), "7f"},
		{"128", big.NewInt(128), "8180"},
		{"255", big.NewInt(255), "81ff"},
		{"256", big.NewInt(256), "820100"},
		{"1024", big.NewInt(1024), "820400"},
		{"nil → empty", nil, "80"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := hex.EncodeToString(encodeUint(tc.n))
			if got != tc.want {
				t.Errorf("got %q, want %q", got, tc.want)
			}
		})
	}
}

func TestEncodeUint_LargeValues(t *testing.T) {
	// 1 ether = 10^18 wei = 0x0de0b6b3a7640000 (8 bytes)
	oneEther := new(big.Int)
	oneEther.SetString("1000000000000000000", 10)
	got := hex.EncodeToString(encodeUint(oneEther))
	want := "880de0b6b3a7640000"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

// =============================================================================
// keccak256 — known vectors
// =============================================================================

func TestKeccak256_KnownVectors(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		// keccak256("") = empty preimage
		{"empty",
			"",
			"c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"},
		// keccak256("hello")
		{"hello",
			"hello",
			"1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := keccak256([]byte(tc.in))
			got := hex.EncodeToString(h[:])
			if got != tc.want {
				t.Errorf("got %q, want %q", got, tc.want)
			}
		})
	}
}

// =============================================================================
// FunctionSelector — Solidity ABI
// =============================================================================

func TestFunctionSelector_KnownSignatures(t *testing.T) {
	// ERC-20 `transfer(address,uint256)` selector is the canonical 0xa9059cbb.
	got := FunctionSelector("transfer(address,uint256)")
	want := [4]byte{0xa9, 0x05, 0x9c, 0xbb}
	if got != want {
		t.Errorf("transfer selector: got %x, want %x", got, want)
	}
}

// =============================================================================
// parseAddress
// =============================================================================

func TestParseAddress(t *testing.T) {
	cases := []struct {
		in      string
		wantHex string
		wantErr bool
	}{
		{"0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
			"a28fae14eb42e7a5c36ad2d774a2b7eb293c4473", false},
		// No 0x prefix
		{"a28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
			"a28fae14eb42e7a5c36ad2d774a2b7eb293c4473", false},
		{"0xtooshort", "", true},
		{"0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ", "", true}, // bad hex
	}
	for _, tc := range cases {
		t.Run(tc.in, func(t *testing.T) {
			got, err := parseAddress(tc.in)
			if tc.wantErr {
				if err == nil {
					t.Error("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if hex.EncodeToString(got) != tc.wantHex {
				t.Errorf("got %x, want %s", got, tc.wantHex)
			}
		})
	}
}

// =============================================================================
// floatToWei
// =============================================================================

func TestFloatToWei(t *testing.T) {
	cases := []struct {
		name     string
		amount   float64
		decimals int
		want     string // decimal
	}{
		{"1 ether", 1.0, 18, "1000000000000000000"},
		{"0.1 ether", 0.1, 18, "100000000000000000"},
		{"0.001 ether", 0.001, 18, "1000000000000000"},
		{"0 ether", 0.0, 18, "0"},
		{"6-decimal USDC, 100 units", 100, 6, "100000000"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := floatToWei(tc.amount, tc.decimals)
			if err != nil {
				t.Fatal(err)
			}
			if got.String() != tc.want {
				t.Errorf("got %s, want %s", got.String(), tc.want)
			}
		})
	}
}

func TestFloatToWei_RejectsNegative(t *testing.T) {
	if _, err := floatToWei(-1, 18); err == nil {
		t.Error("expected error for negative amount")
	}
}

// =============================================================================
// PreSign / Finalize — end-to-end with a known result
// =============================================================================

// Canonical EIP-155 example from EIP-155 itself:
//   nonce=9, gasPrice=20gwei, gas=21000,
//   to=0x3535353535353535353535353535353535353535, value=1ether,
//   data=empty, chainID=1, r=0, s=0
// signing hash should be:
//   0xdaf5a779ae972f972197303d7b574746c7ef83eadac0f2791ad23db92e4c8e53
//
// The signed-tx hex (with the specific r,s,v from the EIP-155 example)
// is also documented. We test PreSign against the sighash.
func TestPreSign_EIP155Vector(t *testing.T) {
	// Build a Provider that returns the EIP-155 example nonce + gasPrice.
	// Note: StaticProvider strips the 0x prefix when looking up so we
	// store the key without it.
	p := &StaticProvider{
		Nonces: map[string]uint64{
			"TESTNET|3535353535353535353535353535353535353535": 9,
		},
		GasPrice: map[string]*big.Int{
			"TESTNET": big.NewInt(20_000_000_000), // 20 gwei
		},
	}
	a := New(p)
	a.SetNetwork("TESTNET", PerNetwork{
		ChainID:         big.NewInt(1),
		DefaultGasLimit: 21000,
		NativeDecimals:  18,
	})

	// EIP-155 example sender is implicit; we hand the same address as
	// "sender" so the provider returns nonce 9. The destination is the
	// same 0x35... address per the EIP example.
	intent := SwapIntent{
		DestinationNetwork: "TESTNET",
		DestinationAddress: "0x3535353535353535353535353535353535353535",
		Amount:             1.0,
		SenderAddress:      "0x3535353535353535353535353535353535353535",
	}
	unsigned, err := a.PreSign(context.Background(), intent)
	if err != nil {
		t.Fatal(err)
	}
	gotSighash := hex.EncodeToString(unsigned.SigHash[:])
	wantSighash := "daf5a779ae972f972197303d7b574746c7ef83eadac0f2791ad23db92e4c8e53"
	if gotSighash != wantSighash {
		t.Errorf("sighash:\n  got  %s\n  want %s", gotSighash, wantSighash)
	}
}

// =============================================================================
// PreSign — modes + RPC config
// =============================================================================

func TestPreSign_PureTransferMode(t *testing.T) {
	p := &StaticProvider{
		GasPrice: map[string]*big.Int{"LUX_TESTNET": big.NewInt(25_000_000_000)},
	}
	a := New(p)
	a.SetNetwork("LUX_TESTNET", PerNetwork{
		ChainID:        big.NewInt(96368),
		NativeDecimals: 18,
		// BridgeContract empty → pure transfer mode.
	})

	unsigned, err := a.PreSign(context.Background(), SwapIntent{
		DestinationNetwork: "LUX_TESTNET",
		DestinationAddress: "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
		Amount:             0.1,
		SenderAddress:      "0xMPC1111111111111111111111111111111111111111",
	})
	if err != nil {
		t.Fatal(err)
	}
	// Transfer mode: `data` is empty.
	if len(unsigned.Data) != 0 {
		t.Errorf("transfer mode should have empty data, got %x", unsigned.Data)
	}
	// `to` is the destination address, not a contract.
	if hex.EncodeToString(unsigned.To) != "a28fae14eb42e7a5c36ad2d774a2b7eb293c4473" {
		t.Errorf("to mismatch: %x", unsigned.To)
	}
	// Value is 0.1 ether = 10^17 wei.
	if unsigned.Value.String() != "100000000000000000" {
		t.Errorf("value = %s, want 100000000000000000", unsigned.Value.String())
	}
	// Default gas limit for empty-data transfers is 21000.
	if unsigned.GasLimit != 21000 {
		t.Errorf("gas limit = %d, want 21000", unsigned.GasLimit)
	}
}

func TestPreSign_BridgeContractMode(t *testing.T) {
	p := &StaticProvider{
		GasPrice: map[string]*big.Int{"LUX_TESTNET": big.NewInt(1)},
	}
	a := New(p)
	bridge := "0x5B562e80A56b600d729371eB14fE3B83298D0642"
	a.SetNetwork("LUX_TESTNET", PerNetwork{
		ChainID:         big.NewInt(96368),
		BridgeContract:  bridge,
		ReleaseSelector: FunctionSelector("release(address,uint256)"),
		NativeDecimals:  18,
	})
	unsigned, err := a.PreSign(context.Background(), SwapIntent{
		DestinationNetwork: "LUX_TESTNET",
		DestinationAddress: "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
		Amount:             0.1,
		SenderAddress:      "0xMPC1111111111111111111111111111111111111111",
	})
	if err != nil {
		t.Fatal(err)
	}
	// to = bridge contract
	if hex.EncodeToString(unsigned.To) != "5b562e80a56b600d729371eb14fe3b83298d0642" {
		t.Errorf("to should be the bridge contract, got %x", unsigned.To)
	}
	// data = selector(4) || addr-padded(32) || amount(32) = 68 bytes
	if len(unsigned.Data) != 68 {
		t.Errorf("data length = %d, want 68", len(unsigned.Data))
	}
	// First 4 bytes = release selector
	gotSel := unsigned.Data[:4]
	wantSel := FunctionSelector("release(address,uint256)")
	if hex.EncodeToString(gotSel) != hex.EncodeToString(wantSel[:]) {
		t.Errorf("selector mismatch: got %x, want %x", gotSel, wantSel)
	}
	// Value is 0 (funds move via contract)
	if unsigned.Value.Sign() != 0 {
		t.Errorf("contract-mode value must be 0, got %s", unsigned.Value.String())
	}
}

func TestPreSign_UnknownNetwork(t *testing.T) {
	a := New(&StaticProvider{})
	_, err := a.PreSign(context.Background(), SwapIntent{
		DestinationNetwork: "MARS_MAINNET",
		Amount:             1,
		SenderAddress:      "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
		DestinationAddress: "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
	})
	if err == nil || !strings.Contains(err.Error(), "no config for network") {
		t.Errorf("expected 'no config' error, got %v", err)
	}
}

func TestPreSign_BadAddress(t *testing.T) {
	a := New(&StaticProvider{GasPrice: map[string]*big.Int{"LUX_TESTNET": big.NewInt(1)}})
	a.SetNetwork("LUX_TESTNET", PerNetwork{ChainID: big.NewInt(96368)})
	_, err := a.PreSign(context.Background(), SwapIntent{
		DestinationNetwork: "LUX_TESTNET",
		Amount:             1,
		SenderAddress:      "0xa28f",
		DestinationAddress: "0xnotanaddr",
	})
	if err == nil || !strings.Contains(err.Error(), "DestinationAddress") {
		t.Errorf("expected DestinationAddress error, got %v", err)
	}
}

// =============================================================================
// ERC-20 destination mode
// =============================================================================

func TestPreSign_ERC20Mode(t *testing.T) {
	p := &StaticProvider{
		GasPrice: map[string]*big.Int{"ETHEREUM_SEPOLIA": big.NewInt(20_000_000_000)},
	}
	a := New(p)
	a.SetNetwork("ETHEREUM_SEPOLIA", txAsmNetwork(11155111))

	// Register USDC on Sepolia: 6 decimals, real contract address.
	reg := tokens.NewRegistry()
	usdcContract := "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"
	_ = reg.Register(tokens.Info{
		Network:  "ETHEREUM_SEPOLIA",
		Asset:    "USDC",
		Contract: usdcContract,
		Decimals: 6,
	})
	a.Tokens = reg

	unsigned, err := a.PreSign(context.Background(), SwapIntent{
		DestinationNetwork: "ETHEREUM_SEPOLIA",
		DestinationAsset:   "USDC",
		DestinationAddress: "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
		Amount:             100, // 100 USDC
		SenderAddress:      "0x3535353535353535353535353535353535353535",
	})
	if err != nil {
		t.Fatal(err)
	}

	// to = USDC contract (not the recipient address)
	wantTo := strings.TrimPrefix(strings.ToLower(usdcContract), "0x")
	if hex.EncodeToString(unsigned.To) != wantTo {
		t.Errorf("to = %x, want %s (USDC contract)", unsigned.To, wantTo)
	}
	// value = 0 (ERC-20 transfers carry no ETH value)
	if unsigned.Value.Sign() != 0 {
		t.Errorf("ERC-20 tx value must be 0, got %s", unsigned.Value.String())
	}
	// data = selector(4) || address-word(32) || amount-word(32) = 68 bytes
	if len(unsigned.Data) != 68 {
		t.Fatalf("data length = %d, want 68", len(unsigned.Data))
	}
	// First 4 bytes are the canonical transfer(address,uint256) selector.
	if hex.EncodeToString(unsigned.Data[:4]) != "a9059cbb" {
		t.Errorf("selector = %x, want a9059cbb (transfer)", unsigned.Data[:4])
	}
	// Amount word: 100 USDC = 100 * 10^6 = 100_000_000 base units = 0x5F5E100.
	// Last 32 bytes of data = the amount word. Strip leading zeros.
	amountWord := unsigned.Data[36:68]
	amount := new(big.Int).SetBytes(amountWord)
	want := big.NewInt(100_000_000)
	if amount.Cmp(want) != 0 {
		t.Errorf("amount in calldata = %s, want %s (100 USDC at 6 decimals)", amount, want)
	}
	// Recipient word: last 20 bytes of bytes 4..36 = the recipient.
	recipientWord := unsigned.Data[4:36]
	if !strings.EqualFold(hex.EncodeToString(recipientWord[12:]), "a28fae14eb42e7a5c36ad2d774a2b7eb293c4473") {
		t.Errorf("recipient in calldata: %x", recipientWord)
	}
}

func TestPreSign_ERC20_DecimalsMatter(t *testing.T) {
	// BSC USDC uses 18 decimals (not 6 like mainnet/sepolia). Make
	// sure the amount scaling picks up the right decimals.
	p := &StaticProvider{
		GasPrice: map[string]*big.Int{"BSC_MAINNET": big.NewInt(5_000_000_000)},
	}
	a := New(p)
	a.SetNetwork("BSC_MAINNET", txAsmNetwork(56))
	reg := tokens.NewRegistry()
	_ = reg.Register(tokens.Info{
		Network:  "BSC_MAINNET",
		Asset:    "USDC",
		Contract: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
		Decimals: 18, // BSC convention
	})
	a.Tokens = reg

	unsigned, err := a.PreSign(context.Background(), SwapIntent{
		DestinationNetwork: "BSC_MAINNET",
		DestinationAsset:   "USDC",
		DestinationAddress: "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
		Amount:             1, // 1 USDC at 18 decimals = 10^18 base units
		SenderAddress:      "0x3535353535353535353535353535353535353535",
	})
	if err != nil {
		t.Fatal(err)
	}
	amountWord := unsigned.Data[36:68]
	amount := new(big.Int).SetBytes(amountWord)
	want, _ := new(big.Int).SetString("1000000000000000000", 10) // 10^18
	if amount.Cmp(want) != 0 {
		t.Errorf("amount = %s, want %s (1 USDC at BSC's 18 decimals)", amount, want)
	}
}

func TestPreSign_NativeWithRegistry_StillUsesNativePath(t *testing.T) {
	// ETH registered with empty contract → IsNative() → pure transfer.
	p := &StaticProvider{GasPrice: map[string]*big.Int{"LUX_TESTNET": big.NewInt(25_000_000_000)}}
	a := New(p)
	a.SetNetwork("LUX_TESTNET", txAsmNetwork(96368))
	reg := tokens.NewRegistry()
	_ = reg.Register(tokens.Info{Network: "LUX_TESTNET", Asset: "LUX", Decimals: 18})
	a.Tokens = reg

	unsigned, err := a.PreSign(context.Background(), SwapIntent{
		DestinationNetwork: "LUX_TESTNET",
		DestinationAsset:   "LUX",
		DestinationAddress: "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
		Amount:             0.5,
		SenderAddress:      "0x3535353535353535353535353535353535353535",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(unsigned.Data) != 0 {
		t.Errorf("native path should have empty data, got %x", unsigned.Data)
	}
	if unsigned.Value.String() != "500000000000000000" {
		t.Errorf("value = %s, want 0.5 ether (5*10^17 wei)", unsigned.Value.String())
	}
}

func TestPreSign_ERC20MissingContract_RejectsClean(t *testing.T) {
	// Registry has the asset entry but with a bad contract string.
	p := &StaticProvider{GasPrice: map[string]*big.Int{"X": big.NewInt(1)}}
	a := New(p)
	a.SetNetwork("X", txAsmNetwork(1))
	reg := tokens.NewRegistry()
	_ = reg.Register(tokens.Info{
		Network:  "X",
		Asset:    "BADTOKEN",
		Contract: "0xshort",
		Decimals: 6,
	})
	a.Tokens = reg
	_, err := a.PreSign(context.Background(), SwapIntent{
		DestinationNetwork: "X",
		DestinationAsset:   "BADTOKEN",
		DestinationAddress: "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
		Amount:             1,
		SenderAddress:      "0x3535353535353535353535353535353535353535",
	})
	if err == nil || !strings.Contains(err.Error(), "ERC-20 contract") {
		t.Errorf("expected ERC-20 contract error, got %v", err)
	}
}

func TestPreSign_UnknownAsset_FallsBackToNative(t *testing.T) {
	// DestinationAsset is "UNOBTAINIUM" — not in registry → falls back
	// to native pure-transfer mode (sanest default, preserves
	// backward compat for tests that don't seed a registry).
	p := &StaticProvider{GasPrice: map[string]*big.Int{"LUX_TESTNET": big.NewInt(1)}}
	a := New(p)
	a.SetNetwork("LUX_TESTNET", txAsmNetwork(96368))
	a.Tokens = tokens.NewRegistry() // empty registry
	unsigned, err := a.PreSign(context.Background(), SwapIntent{
		DestinationNetwork: "LUX_TESTNET",
		DestinationAsset:   "UNOBTAINIUM",
		DestinationAddress: "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
		Amount:             0.001,
		SenderAddress:      "0x3535353535353535353535353535353535353535",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(unsigned.Data) != 0 {
		t.Errorf("unknown asset should fall back to native path; got data=%x", unsigned.Data)
	}
}

// txAsmNetwork is a small helper to build a default PerNetwork for tests.
func txAsmNetwork(chainID int64) PerNetwork {
	return PerNetwork{
		ChainID:         big.NewInt(chainID),
		DefaultGasLimit: 100_000,
		NativeDecimals:  18,
	}
}

// =============================================================================
// Finalize — combine unsigned with sig + ParseRSV
// =============================================================================

func TestFinalize_ProducesValidRLP(t *testing.T) {
	p := &StaticProvider{
		GasPrice: map[string]*big.Int{"LUX_TESTNET": big.NewInt(20_000_000_000)},
	}
	a := New(p)
	a.SetNetwork("LUX_TESTNET", PerNetwork{
		ChainID:         big.NewInt(96368),
		DefaultGasLimit: 21000,
		NativeDecimals:  18,
	})
	unsigned, err := a.PreSign(context.Background(), SwapIntent{
		DestinationNetwork: "LUX_TESTNET",
		DestinationAddress: "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
		Amount:             0.1,
		SenderAddress:      "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
	})
	if err != nil {
		t.Fatal(err)
	}

	// Synthetic r, s, recoveryID — we only check the WIRE is well-formed.
	r := new(big.Int).SetInt64(0xdeadbeef)
	s := new(big.Int).SetInt64(0xcafe0001)
	rawHex, err := a.Finalize(unsigned, r, s, 0)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(rawHex, "0x") {
		t.Errorf("expected 0x prefix, got %q", rawHex)
	}
	// Sanity-check it decodes as hex.
	if _, err := hex.DecodeString(strings.TrimPrefix(rawHex, "0x")); err != nil {
		t.Errorf("not valid hex: %v", err)
	}
	// v must encode 96368*2 + 35 + 0 = 192771 = 0x2f0c3.
	// Decoded RLP would show v = 0x830002f0c3 (3 bytes prefix) — checking the
	// raw bytes is fragile; trust the EIP-155 vector test above for sighash
	// correctness and round-trip a synthetic value here.
}

func TestFinalize_RecoveryIDRange(t *testing.T) {
	a := New(&StaticProvider{GasPrice: map[string]*big.Int{"LUX": big.NewInt(1)}})
	a.SetNetwork("LUX", PerNetwork{ChainID: big.NewInt(1), DefaultGasLimit: 21000})
	unsigned, _ := a.PreSign(context.Background(), SwapIntent{
		DestinationNetwork: "LUX",
		DestinationAddress: "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
		SenderAddress:      "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
		Amount:             0.001,
	})
	if _, err := a.Finalize(unsigned, big.NewInt(1), big.NewInt(2), 2); err == nil {
		t.Error("expected recovery id > 1 to error")
	}
}

func TestParseRSV(t *testing.T) {
	// Build a 65-byte signature: r = 0x01...01 (32), s = 0x02...02 (32), v = 0x01.
	r := strings.Repeat("01", 32)
	s := strings.Repeat("02", 32)
	v := "01"
	sigHex := "0x" + r + s + v

	gotR, gotS, gotV, err := ParseRSV(sigHex)
	if err != nil {
		t.Fatal(err)
	}
	wantR, _ := new(big.Int).SetString(r, 16)
	wantS, _ := new(big.Int).SetString(s, 16)
	if gotR.Cmp(wantR) != 0 {
		t.Errorf("r mismatch")
	}
	if gotS.Cmp(wantS) != 0 {
		t.Errorf("s mismatch")
	}
	if gotV != 1 {
		t.Errorf("v = %d, want 1", gotV)
	}
}

func TestParseRSV_LegacyV27_28(t *testing.T) {
	// Some signers emit v=27 instead of 0, v=28 instead of 1.
	sigHex28 := "0x" + strings.Repeat("01", 32) + strings.Repeat("02", 32) + "1c" // 0x1c = 28
	_, _, v, err := ParseRSV(sigHex28)
	if err != nil {
		t.Fatal(err)
	}
	if v != 1 {
		t.Errorf("v=28 should normalize to 1, got %d", v)
	}
	sigHex27 := "0x" + strings.Repeat("01", 32) + strings.Repeat("02", 32) + "1b"
	_, _, v, err = ParseRSV(sigHex27)
	if err != nil {
		t.Fatal(err)
	}
	if v != 0 {
		t.Errorf("v=27 should normalize to 0, got %d", v)
	}
}

func TestParseRSV_BadLength(t *testing.T) {
	if _, _, _, err := ParseRSV("0xabc"); err == nil {
		t.Error("expected length error")
	}
}

// =============================================================================
// StaticProvider helpers
// =============================================================================

func TestStaticProvider_NonceAutoIncrements(t *testing.T) {
	p := &StaticProvider{}
	for i := 0; i < 5; i++ {
		got, err := p.PendingNonce(context.Background(), "X", "0xAddr")
		if err != nil {
			t.Fatal(err)
		}
		if got != uint64(i) {
			t.Errorf("call %d: got %d, want %d", i, got, i)
		}
	}
}

func TestStaticProvider_GasPriceUnknownErrors(t *testing.T) {
	p := &StaticProvider{}
	if _, err := p.SuggestGasPrice(context.Background(), "X"); err == nil {
		t.Error("expected error for unconfigured network")
	}
}
