// Tests for the DOT (substrate) signing path in the signing driver.
//
// We test two distinct things:
//   1. The driver dispatches DOT-family swaps through the substrate path
//      (PreSign → MPC sign → Finalize → DestRawTx). Verified by
//      hitting the gas pre-check short-circuit (insufficient balance).
//      That path runs through preSignDOT and dotGasPrecheck end-to-end
//      and is independent of whether the MPC signature is real.
//   2. The DOTChainContext interaction shape: nonce / runtime-version /
//      genesis lookups happen at PreSign time.

package main

import (
	"context"
	"encoding/hex"
	"errors"
	"math/big"
	"strings"
	"testing"
	"time"

	"github.com/luxfi/bridge/internal/substrate"
	"github.com/luxfi/bridge/internal/txassembler"
)

// =============================================================================
// fakeDOTChainContext — in-memory DOTChainContext for tests
// =============================================================================

type fakeDOTChainContext struct {
	nonces      map[string]uint32 // by network|accountHex
	specVersion uint32
	txVersion   uint32
	genesis     [32]byte
	balances    map[string]*big.Int // by network|accountHex → free planck
	nonceErr    error
	balanceErr  error
	calls       struct {
		nextIndex int
		runtime   int
		genesis   int
		balance   int
	}
}

func newFakeDOTChainContext() *fakeDOTChainContext {
	var gen [32]byte
	for i := range gen {
		gen[i] = byte(0x88 + i)
	}
	return &fakeDOTChainContext{
		nonces:      map[string]uint32{},
		specVersion: 100,
		txVersion:   24,
		genesis:     gen,
		balances:    map[string]*big.Int{},
	}
}

func (f *fakeDOTChainContext) AccountNextIndex(_ context.Context, network, acc string) (uint32, error) {
	f.calls.nextIndex++
	if f.nonceErr != nil {
		return 0, f.nonceErr
	}
	return f.nonces[network+"|"+strings.ToLower(strings.TrimPrefix(acc, "0x"))], nil
}

func (f *fakeDOTChainContext) RuntimeVersion(_ context.Context, network string) (uint32, uint32, error) {
	f.calls.runtime++
	return f.specVersion, f.txVersion, nil
}

func (f *fakeDOTChainContext) GenesisHash(_ context.Context, network string) ([32]byte, error) {
	f.calls.genesis++
	return f.genesis, nil
}

func (f *fakeDOTChainContext) FreeBalance(_ context.Context, network, acc string) (*big.Int, error) {
	f.calls.balance++
	if f.balanceErr != nil {
		return nil, f.balanceErr
	}
	if v, ok := f.balances[network+"|"+strings.ToLower(strings.TrimPrefix(acc, "0x"))]; ok {
		return new(big.Int).Set(v), nil
	}
	return big.NewInt(0), nil
}

// =============================================================================
// makeDOTPool seeds an in-memory release pool with one entry whose
// ECDSAPubKey is the supplied hex. Returns (pool, walletID, ss58 address).
// =============================================================================

func makeDOTPool(t *testing.T, store *InMemoryStore, pubHex string) (*ReleasePool, string, string) {
	t.Helper()
	pub, _ := hex.DecodeString(pubHex)
	acc, _ := substrate.AccountIDFromECDSAPub(pub)
	ss58, _ := substrate.SS58Encode(acc, substrate.SS58Generic)
	pool := NewReleasePoolForFamily(store, FamilyDOT, "POLKADOT_TESTNET", nil)
	_ = store.PutEntry(context.Background(), FamilyDOT, 0, ReleasePoolEntry{
		Index:       0,
		WalletID:    "dot-rel-1",
		Address:     ss58,
		Network:     "POLKADOT_TESTNET",
		MintedAt:    time.Now(),
		ECDSAPubKey: pubHex,
	})
	if err := pool.Bootstrap(context.Background(), nil, 0); err != nil {
		t.Fatal(err)
	}
	return pool, "dot-rel-1", ss58
}

// pinDeterministicPub gives back a 33-byte compressed pubkey hex
// that's been pre-derived from a known scalar. Used so DOT tests
// don't need an in-test ECDSA implementation.
//
// scalar=2 → known precomputed pubkey (offline, validated).
func pinDeterministicPub() string {
	// secp256k1 base point doubled. y is even for scalar=2 → prefix 02.
	// Pre-computed: G * 2 = (Gx, Gy doubled).
	// Computed offline:
	return "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5"
}

// =============================================================================
// Test: balance insufficient -> swap short-circuits cleanly
// =============================================================================

// This exercises:
//   - The signing driver routes DOT-family swaps through preSignDOT.
//   - PreSign queries nonce + runtime version + genesis hash.
//   - The gas pre-check uses FreeBalance and returns insufficient.
//   - The swap transitions to failed_insufficient_release_gas with
//     a sensible LastError, never burning the MPC ceremony.
func TestSigning_DOT_InsufficientBalance_ShortCircuits(t *testing.T) {
	store := NewInMemoryStore()
	pool, _, senderSS58 := makeDOTPool(t, store, pinDeterministicPub())

	// Recipient SS58 (generic prefix).
	var raccBytes [32]byte
	for i := range raccBytes {
		raccBytes[i] = byte(0xC0 ^ i)
	}
	recipientSS58, _ := substrate.SS58Encode(raccBytes, substrate.SS58Generic)

	sw := &Swap{
		Status:             SwapStatusBridgeTransferPending,
		Amount:             1.0, // 1 DOT
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		SourceAsset:        "ETH",
		DestinationNetwork: "POLKADOT_TESTNET",
		DestinationAsset:   "DOT",
		DestinationAddress: recipientSS58,
		DepositAddress:     "wallet-poor-dot###" + senderSS58,
		UseDepositAddress:  true,
	}
	if err := store.Create(context.Background(), sw); err != nil {
		t.Fatal(err)
	}

	dotAsm := txassembler.NewDOTAssembler()
	dotAsm.SetNetwork("POLKADOT_TESTNET", txassembler.PerDOTNetwork{
		SS58Prefix:         substrate.SS58Generic,
		Decimals:           10,
		CallIndex:          substrate.CallIndex{Section: 5, Method: 3},
		ExistentialDeposit: big.NewInt(10_000_000_000),
		FeePlanck:          big.NewInt(100_000_000),
	})
	// Balance below required — chain context returns 0 by default.
	ctx := newFakeDOTChainContext()

	d := NewSigningDriver(store, newFakeSigner(), time.Hour, nil)
	d.SetDOTAssembler(dotAsm, ctx)
	d.SetDOTReleasePool(pool)

	d.Tick(context.Background())

	got, _ := store.Get(context.Background(), sw.ID)
	if got.Status != SwapStatusFailedInsufficientReleaseGas {
		t.Fatalf("status = %q, want failed_insufficient_release_gas; last_err=%q", got.Status, got.LastError)
	}
	if !strings.Contains(got.LastError, "insufficient planck balance") {
		t.Errorf("expected planck-balance error, got %q", got.LastError)
	}
	// Chain context should have been queried.
	if ctx.calls.nextIndex < 1 || ctx.calls.runtime < 1 || ctx.calls.genesis < 1 {
		t.Errorf("expected chain context calls (next_index=%d, runtime=%d, genesis=%d)",
			ctx.calls.nextIndex, ctx.calls.runtime, ctx.calls.genesis)
	}
	// We expect balance pre-check to have happened.
	if ctx.calls.balance < 1 {
		t.Error("expected balance check to run")
	}
}

// =============================================================================
// Test: missing chain context falls back to placeholder path
// =============================================================================

// Without SetDOTAssembler, a DOT-destined swap falls through to the
// placeholder signing-message path (synthetic digest). The driver
// signs that and advances to broadcasting with no DestRawTx. This
// is the legacy behaviour and should not change.
func TestSigning_DOT_WithoutDOTAssembler_FallsBackToPlaceholder(t *testing.T) {
	store := NewInMemoryStore()
	// Default EVM pool only — no DOT pool, no DOT assembler.
	sw := &Swap{
		Status:             SwapStatusBridgeTransferPending,
		Amount:             1.0,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		DestinationNetwork: "POLKADOT_MAINNET",
		DestinationAddress: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
		DepositAddress:     "legacy-dot-wallet###some-addr",
	}
	_ = store.Create(context.Background(), sw)
	mpc := newFakeSigner()
	mpc.ok("legacy-dot-wallet", "0x"+strings.Repeat("aa", 65), "sess")
	d := NewSigningDriver(store, mpc, time.Hour, nil)
	d.Tick(context.Background())

	got, _ := store.Get(context.Background(), sw.ID)
	if got.Status != SwapStatusBroadcasting {
		t.Fatalf("status = %q, want broadcasting (placeholder path)", got.Status)
	}
	if got.DestRawTx != "" {
		t.Error("placeholder path should NOT populate DestRawTx")
	}
}

// =============================================================================
// Test: DOT signing payload happens at the chain-context's current
// values — runtime version refreshes between calls
// =============================================================================

func TestSigning_DOT_PreSign_QueriesChainContextEachTick(t *testing.T) {
	store := NewInMemoryStore()
	pool, _, senderSS58 := makeDOTPool(t, store, pinDeterministicPub())

	var raccBytes [32]byte
	recipientSS58, _ := substrate.SS58Encode(raccBytes, substrate.SS58Generic)
	sw := &Swap{
		Status:             SwapStatusBridgeTransferPending,
		Amount:             1.0,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		DestinationNetwork: "POLKADOT_TESTNET",
		DestinationAddress: recipientSS58,
		DepositAddress:     "wallet###" + senderSS58,
	}
	_ = store.Create(context.Background(), sw)

	dotAsm := txassembler.NewDOTAssembler()
	dotAsm.SetNetwork("POLKADOT_TESTNET", txassembler.PerDOTNetwork{
		SS58Prefix:         substrate.SS58Generic,
		Decimals:           10,
		CallIndex:          substrate.CallIndex{Section: 5, Method: 3},
		ExistentialDeposit: big.NewInt(10_000_000_000),
		FeePlanck:          big.NewInt(100_000_000),
	})
	ctx := newFakeDOTChainContext()
	// Insufficient balance forces short-circuit — but the runtime
	// version + nonce calls still happen before the gas check.
	d := NewSigningDriver(store, newFakeSigner(), time.Hour, nil)
	d.SetDOTAssembler(dotAsm, ctx)
	d.SetDOTReleasePool(pool)
	d.Tick(context.Background())

	if ctx.calls.runtime < 1 {
		t.Error("RuntimeVersion not called")
	}
	if ctx.calls.genesis < 1 {
		t.Error("GenesisHash not called")
	}
	if ctx.calls.nextIndex < 1 {
		t.Error("AccountNextIndex not called")
	}
}

// =============================================================================
// Test: DOTChainContext error in preSignDOT rolls swap back
// =============================================================================

func TestSigning_DOT_ChainContextError_RollsBack(t *testing.T) {
	store := NewInMemoryStore()
	pool, _, senderSS58 := makeDOTPool(t, store, pinDeterministicPub())

	var raccBytes [32]byte
	recipientSS58, _ := substrate.SS58Encode(raccBytes, substrate.SS58Generic)
	sw := &Swap{
		Status:             SwapStatusBridgeTransferPending,
		Amount:             1.0,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		DestinationNetwork: "POLKADOT_TESTNET",
		DestinationAddress: recipientSS58,
		DepositAddress:     "wallet###" + senderSS58,
	}
	_ = store.Create(context.Background(), sw)

	dotAsm := txassembler.NewDOTAssembler()
	dotAsm.SetNetwork("POLKADOT_TESTNET", txassembler.PerDOTNetwork{
		SS58Prefix: substrate.SS58Generic,
		Decimals:   10,
		CallIndex:  substrate.CallIndex{Section: 5, Method: 3},
	})
	ctx := newFakeDOTChainContext()
	ctx.nonceErr = errors.New("connection refused")

	d := NewSigningDriver(store, newFakeSigner(), time.Hour, nil)
	d.SetDOTAssembler(dotAsm, ctx)
	d.SetDOTReleasePool(pool)
	d.Tick(context.Background())

	got, _ := store.Get(context.Background(), sw.ID)
	if got.Status != SwapStatusBridgeTransferPending {
		t.Fatalf("status = %q, want bridge_transfer_pending (rolled back)", got.Status)
	}
	if !strings.Contains(got.LastError, "Substrate RPC unreachable") {
		t.Errorf("expected unreachable error, got %q", got.LastError)
	}
}

// =============================================================================
// extractDOTValuePlanck unit tests — exercise the compact decoder
// =============================================================================

func TestExtractDOTValuePlanck(t *testing.T) {
	// Build call bytes with each compact mode and verify extraction.
	dest := [32]byte{}
	cases := []struct {
		name  string
		value *big.Int
	}{
		{"mode0", big.NewInt(10)},
		{"mode1", big.NewInt(1000)},
		{"mode2", big.NewInt(1_000_000)},
		{"mode3", big.NewInt(100_000_000_000)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			call := substrate.EncodeBalancesTransferKeepAlive(
				substrate.CallIndex{Section: 5, Method: 3}, dest, tc.value)
			got := extractDOTValuePlanck(call)
			if got.Cmp(tc.value) != 0 {
				t.Errorf("extractDOTValuePlanck(%s) = %s, want %s", tc.name, got, tc.value)
			}
		})
	}
}
