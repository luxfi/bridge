// Tests for PreSignNativeTransfer -- the EVM refund-sweep tx builder
// consumed by executeRefundEVM. Driver-level tests in
// cmd/bridge/refund_driver_test.go already exercise it end-to-end
// through fixed, hand-picked values; this file pins its own behavior
// directly and independently, including against a published,
// externally-verifiable test vector rather than a self-referential
// reconstruction.
package txassembler

import (
	"context"
	"encoding/hex"
	"errors"
	"math/big"
	"testing"
)

// errProvider lets tests force PendingNonce/SuggestGasPrice failures --
// StaticProvider never errors, so it can't cover these paths.
type errProvider struct {
	nonce       uint64
	nonceErr    error
	gasPrice    *big.Int
	gasPriceErr error
}

func (p *errProvider) PendingNonce(_ context.Context, _, _ string) (uint64, error) {
	if p.nonceErr != nil {
		return 0, p.nonceErr
	}
	return p.nonce, nil
}
func (p *errProvider) SuggestGasPrice(_ context.Context, _ string) (*big.Int, error) {
	if p.gasPriceErr != nil {
		return nil, p.gasPriceErr
	}
	return p.gasPrice, nil
}

// TestPreSignNativeTransfer_EIP155Vector reuses the exact published
// EIP-155 example (nonce=9, gasPrice=20 gwei, gasLimit=21000,
// to=0x3535...35, value=1 ETH, chainID=1) that TestPreSign_EIP155Vector
// already validates PreSign's pure-transfer mode against. Same wire
// shape, different entry point -- if PreSignNativeTransfer's RLP
// encoding ever drifts from PreSign's (e.g. a field order bug specific
// to the refund path), this independently-known-correct vector catches
// it without relying on either function to "agree with itself."
func TestPreSignNativeTransfer_EIP155Vector(t *testing.T) {
	const addr = "0x3535353535353535353535353535353535353535"
	p := &StaticProvider{
		Nonces:   map[string]uint64{"TESTNET|3535353535353535353535353535353535353535": 9},
		GasPrice: map[string]*big.Int{"TESTNET": big.NewInt(20_000_000_000)},
	}
	a := New(p)
	a.SetNetwork("TESTNET", PerNetwork{ChainID: big.NewInt(1), DefaultGasLimit: 21000})

	valueWei, ok := new(big.Int).SetString("1000000000000000000", 10) // 1 ETH
	if !ok {
		t.Fatal("bad test fixture: value string didn't parse")
	}

	unsigned, err := a.PreSignNativeTransfer(context.Background(), "TESTNET", addr, addr, valueWei)
	if err != nil {
		t.Fatalf("PreSignNativeTransfer: %v", err)
	}
	gotSighash := hex.EncodeToString(unsigned.SigHash[:])
	const wantSighash = "daf5a779ae972f972197303d7b574746c7ef83eadac0f2791ad23db92e4c8e53"
	if gotSighash != wantSighash {
		t.Errorf("sighash:\n  got  %s\n  want %s (published EIP-155 example vector)", gotSighash, wantSighash)
	}
	if unsigned.Nonce != 9 {
		t.Errorf("Nonce = %d, want 9", unsigned.Nonce)
	}
	if unsigned.GasLimit != 21000 {
		t.Errorf("GasLimit = %d, want 21000", unsigned.GasLimit)
	}
	if len(unsigned.Data) != 0 {
		t.Errorf("native transfer must have empty data, got %x", unsigned.Data)
	}
}

func TestPreSignNativeTransfer_UsesDefaultGasPriceWhenConfigured_NotLiveSuggest(t *testing.T) {
	// gasPriceErr set: if the assembler ever called SuggestGasPrice
	// despite DefaultGasPriceWei being configured, this test fails
	// with that error instead of silently using the wrong price.
	p := &errProvider{nonce: 1, gasPriceErr: errors.New("SuggestGasPrice should not have been called")}
	a := New(p)
	a.SetNetwork("TESTNET", PerNetwork{
		ChainID:            big.NewInt(1),
		DefaultGasLimit:    21000,
		DefaultGasPriceWei: big.NewInt(7_000_000_000), // 7 gwei override
	})

	unsigned, err := a.PreSignNativeTransfer(context.Background(), "TESTNET",
		"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		big.NewInt(1000))
	if err != nil {
		t.Fatalf("PreSignNativeTransfer: %v", err)
	}
	if unsigned.GasPrice.Cmp(big.NewInt(7_000_000_000)) != 0 {
		t.Errorf("GasPrice = %s, want the configured 7 gwei override, not a live-fetched value", unsigned.GasPrice.String())
	}
}

func TestPreSignNativeTransfer_FallsBackToLiveGasPriceWhenUnconfigured(t *testing.T) {
	p := &errProvider{nonce: 1, gasPrice: big.NewInt(42_000_000_000)}
	a := New(p)
	a.SetNetwork("TESTNET", PerNetwork{ChainID: big.NewInt(1), DefaultGasLimit: 21000})
	// DefaultGasPriceWei left unset.

	unsigned, err := a.PreSignNativeTransfer(context.Background(), "TESTNET",
		"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		big.NewInt(1000))
	if err != nil {
		t.Fatalf("PreSignNativeTransfer: %v", err)
	}
	if unsigned.GasPrice.Cmp(big.NewInt(42_000_000_000)) != 0 {
		t.Errorf("GasPrice = %s, want the live-suggested 42 gwei", unsigned.GasPrice.String())
	}
}

func TestPreSignNativeTransfer_DefaultsGasLimitTo21000WhenUnconfigured(t *testing.T) {
	p := &StaticProvider{GasPrice: map[string]*big.Int{"TESTNET": big.NewInt(1)}}
	a := New(p)
	a.SetNetwork("TESTNET", PerNetwork{ChainID: big.NewInt(1)}) // DefaultGasLimit left unset (zero value)

	unsigned, err := a.PreSignNativeTransfer(context.Background(), "TESTNET",
		"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		big.NewInt(1000))
	if err != nil {
		t.Fatalf("PreSignNativeTransfer: %v", err)
	}
	if unsigned.GasLimit != 21000 {
		t.Errorf("GasLimit = %d, want the 21000 default for a pure native transfer", unsigned.GasLimit)
	}
}

func TestPreSignNativeTransfer_UnknownNetworkRejected(t *testing.T) {
	a := New(&StaticProvider{})
	_, err := a.PreSignNativeTransfer(context.Background(), "NOT_CONFIGURED",
		"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		big.NewInt(1000))
	if err == nil {
		t.Fatal("expected an error for an unconfigured network, got nil")
	}
}

func TestPreSignNativeTransfer_MissingChainIDRejected(t *testing.T) {
	a := New(&StaticProvider{})
	a.SetNetwork("TESTNET", PerNetwork{}) // ChainID left nil
	_, err := a.PreSignNativeTransfer(context.Background(), "TESTNET",
		"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		big.NewInt(1000))
	if err == nil {
		t.Fatal("expected an error for a missing ChainID, got nil")
	}
}

func TestPreSignNativeTransfer_RejectsNilValue(t *testing.T) {
	a := New(&StaticProvider{})
	a.SetNetwork("TESTNET", PerNetwork{ChainID: big.NewInt(1)})
	_, err := a.PreSignNativeTransfer(context.Background(), "TESTNET",
		"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		nil)
	if err == nil {
		t.Fatal("expected an error for a nil valueWei, got nil")
	}
}

func TestPreSignNativeTransfer_RejectsNegativeValue(t *testing.T) {
	a := New(&StaticProvider{})
	a.SetNetwork("TESTNET", PerNetwork{ChainID: big.NewInt(1)})
	_, err := a.PreSignNativeTransfer(context.Background(), "TESTNET",
		"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		big.NewInt(-1))
	if err == nil {
		t.Fatal("expected an error for a negative valueWei, got nil")
	}
}

func TestPreSignNativeTransfer_RejectsBadToAddress(t *testing.T) {
	a := New(&StaticProvider{GasPrice: map[string]*big.Int{"TESTNET": big.NewInt(1)}})
	a.SetNetwork("TESTNET", PerNetwork{ChainID: big.NewInt(1)})
	_, err := a.PreSignNativeTransfer(context.Background(), "TESTNET",
		"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"not-an-address",
		big.NewInt(1000))
	if err == nil {
		t.Fatal("expected an error for a malformed toAddress, got nil")
	}
}

func TestPreSignNativeTransfer_PendingNonceErrorSurfaces(t *testing.T) {
	p := &errProvider{nonceErr: errors.New("rpc: connection refused")}
	a := New(p)
	a.SetNetwork("TESTNET", PerNetwork{ChainID: big.NewInt(1)})
	_, err := a.PreSignNativeTransfer(context.Background(), "TESTNET",
		"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		big.NewInt(1000))
	if err == nil || err.Error() == "" {
		t.Fatal("expected the PendingNonce error to surface")
	}
}

func TestPreSignNativeTransfer_SuggestGasPriceErrorSurfaces(t *testing.T) {
	p := &errProvider{nonce: 1, gasPriceErr: errors.New("rpc: timeout")}
	a := New(p)
	a.SetNetwork("TESTNET", PerNetwork{ChainID: big.NewInt(1)}) // no DefaultGasPriceWei, forces live fetch
	_, err := a.PreSignNativeTransfer(context.Background(), "TESTNET",
		"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		big.NewInt(1000))
	if err == nil {
		t.Fatal("expected the SuggestGasPrice error to surface")
	}
}
