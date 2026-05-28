package main

import (
	"context"
	"math/big"
	"testing"
	"time"

	"github.com/luxfi/bridge/internal/txassembler"
)

// gas_precheck_test.go: exercises the signing driver's gas pre-check
// short-circuit. The signing driver should refuse to enter the MPC
// ceremony when the release wallet can't cover destination gas.
//
// We use a StaticProvider for the assembler (deterministic gas/nonce),
// a fakeProbe for the balance, and the fakeSigner from
// signing_driver_test.go to assert NO sign call happens on the
// short-circuit path.

// helper: pool with one wallet at a known address, ready for use by
// the signing driver.
func mintSinglePool(t *testing.T, store *InMemoryStore, walletID, address string) *ReleasePool {
	t.Helper()
	pool := NewReleasePool(store, "LUX_TESTNET", nil)
	if err := store.PutEntry(context.Background(), 0, ReleasePoolEntry{
		Index:    0,
		WalletID: walletID,
		Address:  address,
		Network:  "LUX_TESTNET",
		MintedAt: time.Now().UTC(),
	}); err != nil {
		t.Fatalf("seed pool: %v", err)
	}
	if err := pool.Bootstrap(context.Background(), nil, 0); err != nil {
		t.Fatalf("Bootstrap reload: %v", err)
	}
	if pool.Size() != 1 {
		t.Fatalf("pool size = %d, want 1", pool.Size())
	}
	return pool
}

// helper: an Assembler set up for LUX_TESTNET native transfer with
// a known gas price / limit so the test can compute the expected cost.
func newTestAssembler(gasPriceWei int64, gasLimit uint64) *txassembler.Assembler {
	prov := &txassembler.StaticProvider{
		Nonces:   map[string]uint64{},
		GasPrice: map[string]*big.Int{"LUX_TESTNET": big.NewInt(gasPriceWei)},
	}
	asm := txassembler.New(prov)
	asm.SetNetwork("LUX_TESTNET", txassembler.PerNetwork{
		ChainID:         big.NewInt(96368),
		DefaultGasLimit: gasLimit,
		NativeDecimals:  18,
	})
	return asm
}

func TestGasPrecheck_InsufficientBalance_ShortCircuits(t *testing.T) {
	store := NewInMemoryStore()
	signer := newFakeSigner()
	probe := newFakeProbe()

	walletID := "pool-w-1"
	releaseAddr := "0xPoolWallet1"
	pool := mintSinglePool(t, store, walletID, releaseAddr)

	// Balance is 0; required = 21000 * 1 gwei + value
	probe.set(releaseAddr, 0)

	sw := &Swap{
		Status:             SwapStatusBridgeTransferPending,
		Amount:             0.001,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		SourceAsset:        "ETH",
		DestinationNetwork: "LUX_TESTNET",
		DestinationAsset:   "LUX",
		DestinationAddress: "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
		DepositAddress:     "deposit-w###0xDepositAddr",
		UseDepositAddress:  true,
	}
	if err := store.Create(context.Background(), sw); err != nil {
		t.Fatal(err)
	}

	d := NewSigningDriver(store, signer, time.Hour, nil)
	d.SetAssembler(newTestAssembler(1_000_000_000, 21000))
	d.SetReleasePool(pool)
	d.SetGasProbe(probe)

	d.Tick(context.Background())

	got, _ := store.Get(context.Background(), sw.ID)
	if got.Status != SwapStatusFailedInsufficientReleaseGas {
		t.Errorf("status = %q, want failed_insufficient_release_gas", got.Status)
	}
	if got.LastError == "" {
		t.Error("expected LastError to be populated with a reason")
	}
	if got.ReleaseWalletID != walletID {
		t.Errorf("ReleaseWalletID = %q, want %q", got.ReleaseWalletID, walletID)
	}
	if got.ReleaseAddress != releaseAddr {
		t.Errorf("ReleaseAddress = %q, want %q", got.ReleaseAddress, releaseAddr)
	}

	// MPC ceremony MUST NOT have been called — that's the whole point.
	if signer.calls.Load() != 0 {
		t.Errorf("signer should not be called when gas pre-check fails; got %d", signer.calls.Load())
	}
	stats := d.Stats()
	if stats.ShortCircuited != 1 {
		t.Errorf("ShortCircuited = %d, want 1", stats.ShortCircuited)
	}
	if stats.Failures != 0 {
		t.Errorf("Failures = %d, want 0 (short-circuit is a distinct counter)", stats.Failures)
	}
}

func TestGasPrecheck_SufficientBalance_ProceedsToSign(t *testing.T) {
	store := NewInMemoryStore()
	signer := newFakeSigner()
	probe := newFakeProbe()

	walletID := "pool-w-2"
	releaseAddr := "0xPoolWallet2"
	pool := mintSinglePool(t, store, walletID, releaseAddr)

	// Plenty of balance: 1 ETH.
	probe.set(releaseAddr, 1_000_000_000_000_000_000)

	sw := &Swap{
		Status:             SwapStatusBridgeTransferPending,
		Amount:             0.001,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		SourceAsset:        "ETH",
		DestinationNetwork: "LUX_TESTNET",
		DestinationAsset:   "LUX",
		DestinationAddress: "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
		DepositAddress:     "deposit-w###0xDepositAddr",
		UseDepositAddress:  true,
	}
	if err := store.Create(context.Background(), sw); err != nil {
		t.Fatal(err)
	}
	// MPC returns a 65-byte signature so finalize can decode it.
	signer.ok(walletID, "0x"+repeatHex("01", 32)+repeatHex("02", 32)+"00", "sess")

	d := NewSigningDriver(store, signer, time.Hour, nil)
	d.SetAssembler(newTestAssembler(1_000_000_000, 21000))
	d.SetReleasePool(pool)
	d.SetGasProbe(probe)

	d.Tick(context.Background())

	got, _ := store.Get(context.Background(), sw.ID)
	if got.Status != SwapStatusBroadcasting {
		t.Errorf("status = %q, want broadcasting (gas sufficient → proceed)", got.Status)
	}
	if signer.calls.Load() != 1 {
		t.Errorf("expected 1 signer call, got %d", signer.calls.Load())
	}
	stats := d.Stats()
	if stats.ShortCircuited != 0 {
		t.Errorf("ShortCircuited = %d, want 0", stats.ShortCircuited)
	}
}

func TestGasPrecheck_ProbeErrorDoesNotBlock(t *testing.T) {
	// Balance probe failure must be best-effort — we'd rather sign
	// and let the broadcast leg discover insufficient funds than
	// refuse to sign because we couldn't verify.
	store := NewInMemoryStore()
	signer := newFakeSigner()
	probe := newFakeProbe()
	probe.err = context.DeadlineExceeded // simulate transient RPC

	walletID := "pool-w-3"
	pool := mintSinglePool(t, store, walletID, "0xPoolWallet3")

	sw := &Swap{
		Status:             SwapStatusBridgeTransferPending,
		Amount:             0.001,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		SourceAsset:        "ETH",
		DestinationNetwork: "LUX_TESTNET",
		DestinationAsset:   "LUX",
		DestinationAddress: "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
		DepositAddress:     "deposit-w###0xDepositAddr",
		UseDepositAddress:  true,
	}
	_ = store.Create(context.Background(), sw)
	// 65-byte signature with valid v=0 byte at the end. The 0xaa…aa
	// for r+s is fine — ParseRSV only validates the recovery byte.
	signer.ok(walletID, "0x"+repeatHex("aa", 32)+repeatHex("bb", 32)+"00", "sess")

	d := NewSigningDriver(store, signer, time.Hour, nil)
	d.SetAssembler(newTestAssembler(1_000_000_000, 21000))
	d.SetReleasePool(pool)
	d.SetGasProbe(probe)

	d.Tick(context.Background())

	got, _ := store.Get(context.Background(), sw.ID)
	if got.Status != SwapStatusBroadcasting {
		t.Errorf("status = %q, want broadcasting despite probe error", got.Status)
	}
	if d.Stats().ShortCircuited != 0 {
		t.Error("ShortCircuited should be 0 when probe returned an error (skipped, not failed)")
	}
}

// repeatHex is a tiny local helper so we don't reach into strings.Repeat
// from this file (avoids adding the import for a one-line need).
func repeatHex(s string, n int) string {
	out := ""
	for i := 0; i < n; i++ {
		out += s
	}
	return out
}
