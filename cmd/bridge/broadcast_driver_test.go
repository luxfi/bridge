package main

import (
	"context"
	"errors"
	"math/big"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/luxfi/bridge/internal/broadcast"
	"github.com/luxfi/bridge/internal/txassembler"
)

// =============================================================================
// Fake Broadcaster
// =============================================================================

type fakeBroadcaster struct {
	mu      sync.Mutex
	results map[string]string // key = network|rawTx — value = txHash on success
	errors  map[string]error
	calls   atomic.Int64
	lastNet string
	lastRaw string
}

func newFakeBroadcaster() *fakeBroadcaster {
	return &fakeBroadcaster{
		results: map[string]string{},
		errors:  map[string]error{},
	}
}

func (f *fakeBroadcaster) okFor(network, rawTx, txHash string) {
	f.mu.Lock()
	f.results[network+"|"+rawTx] = txHash
	f.mu.Unlock()
}

func (f *fakeBroadcaster) failFor(network, rawTx string, err error) {
	f.mu.Lock()
	f.errors[network+"|"+rawTx] = err
	f.mu.Unlock()
}

func (f *fakeBroadcaster) Broadcast(_ context.Context, network, rawTxHex string) (*broadcast.BroadcastResult, error) {
	f.calls.Add(1)
	f.mu.Lock()
	defer f.mu.Unlock()
	f.lastNet = network
	f.lastRaw = rawTxHex
	key := network + "|" + rawTxHex
	if err, ok := f.errors[key]; ok {
		return nil, err
	}
	if hash, ok := f.results[key]; ok {
		return &broadcast.BroadcastResult{TxHash: hash}, nil
	}
	return nil, errors.New("fakeBroadcaster: no result configured for " + key)
}

// =============================================================================
// Helpers
// =============================================================================

func seedBroadcastingSwap(t *testing.T, store SwapStore, destNet, rawTx string) *Swap {
	t.Helper()
	sw := &Swap{
		Status:             SwapStatusBroadcasting,
		Amount:             0.1,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		SourceAsset:        "ETH",
		DestinationNetwork: destNet,
		DestinationAsset:   "LUX",
		DestinationAddress: "0xrecipient",
		Signature:          "0xsig",
		MPCSessionID:       "sess",
		DestRawTx:          rawTx,
	}
	if err := store.Create(t.Context(), sw); err != nil {
		t.Fatalf("seed swap: %v", err)
	}
	return sw
}

// =============================================================================
// broadcastOne + state transitions
// =============================================================================

func TestBroadcast_AdvancesOnSuccess(t *testing.T) {
	store := NewInMemoryStore()
	bc := newFakeBroadcaster()
	sw := seedBroadcastingSwap(t, store, "LUX_TESTNET", "0xrawtx")
	bc.okFor("LUX_TESTNET", "0xrawtx", "0xfinaltxhash")

	d := NewBroadcastDriver(store, bc, time.Hour, nil)
	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusCompleted {
		t.Errorf("status = %q, want completed", got.Status)
	}
	if got.DestTxHash != "0xfinaltxhash" {
		t.Errorf("DestTxHash = %q, want 0xfinaltxhash", got.DestTxHash)
	}
	stats := d.Stats()
	if stats.Successes != 1 || stats.Failures != 0 || stats.SkippedNoRawTx != 0 {
		t.Errorf("unexpected stats: %+v", stats)
	}
}

func TestBroadcast_SkipsMissingRawTx(t *testing.T) {
	store := NewInMemoryStore()
	bc := newFakeBroadcaster()
	sw := &Swap{
		Status:             SwapStatusBroadcasting,
		DestinationNetwork: "LUX_TESTNET",
		Signature:          "0xsig",
		// DestRawTx deliberately empty
	}
	_ = store.Create(t.Context(), sw)

	d := NewBroadcastDriver(store, bc, time.Hour, nil)
	d.Tick(t.Context())

	if bc.calls.Load() != 0 {
		t.Errorf("broadcaster should not have been called; got %d", bc.calls.Load())
	}
	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBroadcasting {
		t.Errorf("status should be unchanged, got %q", got.Status)
	}
	if d.Stats().SkippedNoRawTx != 1 {
		t.Errorf("expected SkippedNoRawTx=1, got %d", d.Stats().SkippedNoRawTx)
	}
}

func TestBroadcast_LeavesAtBroadcastingOnFailure(t *testing.T) {
	store := NewInMemoryStore()
	bc := newFakeBroadcaster()
	sw := seedBroadcastingSwap(t, store, "LUX_TESTNET", "0xrawtx")
	bc.failFor("LUX_TESTNET", "0xrawtx", errors.New("nonce too low"))

	d := NewBroadcastDriver(store, bc, time.Hour, nil)
	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBroadcasting {
		t.Errorf("status should remain broadcasting on failure, got %q", got.Status)
	}
	if got.DestTxHash != "" {
		t.Errorf("DestTxHash should be empty on failure, got %q", got.DestTxHash)
	}
	if d.Stats().Failures != 1 || d.Stats().Successes != 0 {
		t.Errorf("unexpected stats: %+v", d.Stats())
	}
}

// TestBroadcast_StaleSolanaBlockhash_ResetsForResign verifies the
// Lux→Sol smoke-test recovery: when the cluster rejects a signed
// Solana tx with "Blockhash not found" (the baked-in recent_blockhash
// has expired past ~150 slots), the broadcast driver resets the swap
// to bridge_transfer_pending and clears DestRawTx + sign artifacts so
// the signing driver rebuilds with a fresh blockhash on its next tick.
// Without this, the same stale-blockhash tx loops forever and the user's
// deposit gets stuck even though all parties are signing correctly.
func TestBroadcast_StaleSolanaBlockhash_ResetsForResign(t *testing.T) {
	store := NewInMemoryStore()
	bc := newFakeBroadcaster()
	sw := seedBroadcastingSwap(t, store, "SOLANA_DEVNET", "base58rawtx")
	// seedBroadcastingSwap already sets Signature + MPCSessionID; the
	// assertion below confirms those get cleared along with DestRawTx.
	bc.failFor("SOLANA_DEVNET", "base58rawtx",
		errors.New("broadcast: solana sendTransaction: rpc -32002: Transaction simulation failed: Blockhash not found"))

	d := NewBroadcastDriver(store, bc, time.Hour, nil)
	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBridgeTransferPending {
		t.Fatalf("stale-blockhash should reset to bridge_transfer_pending for re-sign, got %q", got.Status)
	}
	if got.DestRawTx != "" || got.Signature != "" || got.MPCSessionID != "" {
		t.Errorf("DestRawTx/Signature/MPCSessionID should be cleared; got DestRawTx=%q Signature=%q MPCSessionID=%q",
			got.DestRawTx, got.Signature, got.MPCSessionID)
	}
	if got.BroadcastRebuilds != 1 {
		t.Errorf("BroadcastRebuilds should be 1 after first rebuild, got %d", got.BroadcastRebuilds)
	}
	if !strings.Contains(strings.ToLower(got.LastError), "blockhash expired") {
		t.Errorf("LastError should explain the cause; got %q", got.LastError)
	}
	if d.Stats().Rebuilds != 1 {
		t.Errorf("Rebuilds stat should be 1, got %d", d.Stats().Rebuilds)
	}
}

// TestBroadcast_StaleBlockhash_MaxRebuilds_RoutesToRefund pins the
// safety ceiling: after maxRebuilds consecutive blockhash-expired
// failures the swap moves to refund_pending so the deposit gets
// returned, instead of spinning forever against a broken cluster.
func TestBroadcast_StaleBlockhash_MaxRebuilds_RoutesToRefund(t *testing.T) {
	store := NewInMemoryStore()
	bc := newFakeBroadcaster()
	sw := seedBroadcastingSwap(t, store, "SOLANA_DEVNET", "base58rawtx")
	// Pre-seed with rebuilds at the ceiling-1 so one more failure
	// trips the cap. Keeps the test fast — no need to loop the driver
	// maxRebuilds times.
	_, _ = store.Patch(t.Context(), sw.ID, func(s *Swap) {
		s.BroadcastRebuilds = DefaultBroadcastMaxRebuilds - 1
	})
	bc.failFor("SOLANA_DEVNET", "base58rawtx",
		errors.New("broadcast: solana sendTransaction: rpc -32002: Blockhash not found"))

	d := NewBroadcastDriver(store, bc, time.Hour, nil)
	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusRefundPending {
		t.Fatalf("hitting rebuild ceiling should move to refund_pending, got %q", got.Status)
	}
	if got.BroadcastRebuilds != DefaultBroadcastMaxRebuilds {
		t.Errorf("BroadcastRebuilds should reach the ceiling exactly, got %d", got.BroadcastRebuilds)
	}
	if !strings.Contains(strings.ToLower(got.LastError), "stale blockhash") {
		t.Errorf("LastError should explain the ceiling hit, got %q", got.LastError)
	}
}

// TestBroadcast_SuccessClearsRebuildCounter pins the success path —
// after a swap finally lands, BroadcastRebuilds must reset so a
// future swap reusing this ID (or operator-driven recovery) starts
// from a clean counter.
func TestBroadcast_SuccessClearsRebuildCounter(t *testing.T) {
	store := NewInMemoryStore()
	bc := newFakeBroadcaster()
	sw := seedBroadcastingSwap(t, store, "SOLANA_DEVNET", "base58rawtx")
	_, _ = store.Patch(t.Context(), sw.ID, func(s *Swap) {
		s.BroadcastRebuilds = 2 // simulate prior expiries
	})
	bc.okFor("SOLANA_DEVNET", "base58rawtx", "5xxSigBase58")

	d := NewBroadcastDriver(store, bc, time.Hour, nil)
	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusCompleted {
		t.Fatalf("expected completed on success, got %q", got.Status)
	}
	if got.BroadcastRebuilds != 0 {
		t.Errorf("BroadcastRebuilds should reset to 0 on success, got %d", got.BroadcastRebuilds)
	}
}

// TestBroadcast_StaleTONSeqno_ResetsForResign mirrors the XRP-sequence
// recovery for TON. When toncenter rejects an external message because
// the wallet contract's seqno or valid_until is stale, the broadcast
// driver clears DestRawTx + sign artifacts and routes back to
// bridge_transfer_pending so the signing driver re-reads the current
// seqno and re-signs with a fresh valid_until.
func TestBroadcast_StaleTONSeqno_ResetsForResign(t *testing.T) {
	store := NewInMemoryStore()
	bc := newFakeBroadcaster()
	sw := seedBroadcastingSwap(t, store, "TON_TESTNET", "te6ccgEBAQ==")
	bc.failFor("TON_TESTNET", "te6ccgEBAQ==",
		errors.New("broadcast: sendBoc rpc -32000: LITE_SERVER_UNKNOWN: cannot apply external message to shard: External message was not accepted: exitcode=33, steps=1"))

	d := NewBroadcastDriver(store, bc, time.Hour, nil)
	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBridgeTransferPending {
		t.Fatalf("stale TON seqno should reset to bridge_transfer_pending for re-sign, got %q", got.Status)
	}
	if got.DestRawTx != "" || got.Signature != "" || got.MPCSessionID != "" {
		t.Errorf("DestRawTx/Signature/MPCSessionID should be cleared; got DestRawTx=%q Signature=%q MPCSessionID=%q",
			got.DestRawTx, got.Signature, got.MPCSessionID)
	}
	if got.BroadcastRebuilds != 1 {
		t.Errorf("BroadcastRebuilds should be 1 after first rebuild, got %d", got.BroadcastRebuilds)
	}
	if !strings.Contains(strings.ToLower(got.LastError), "seqno / valid_until stale") {
		t.Errorf("LastError should explain the cause; got %q", got.LastError)
	}
	if d.Stats().Rebuilds != 1 {
		t.Errorf("Rebuilds stat should be 1, got %d", d.Stats().Rebuilds)
	}
}

// TestBroadcast_StaleTONSeqno_MaxRebuilds_RoutesToRefund pins the
// ceiling: after maxRebuilds consecutive stale-seqno failures, the
// swap moves to refund_pending so the deposit gets returned instead of
// retrying a wallet contract that keeps refusing the message.
func TestBroadcast_StaleTONSeqno_MaxRebuilds_RoutesToRefund(t *testing.T) {
	store := NewInMemoryStore()
	bc := newFakeBroadcaster()
	sw := seedBroadcastingSwap(t, store, "TON_TESTNET", "te6ccgEBAQ==")
	_, _ = store.Patch(t.Context(), sw.ID, func(s *Swap) {
		s.BroadcastRebuilds = DefaultBroadcastMaxRebuilds - 1
	})
	bc.failFor("TON_TESTNET", "te6ccgEBAQ==",
		errors.New("broadcast: sendBoc rpc -32000: External message was not accepted: exitcode=36"))

	d := NewBroadcastDriver(store, bc, time.Hour, nil)
	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusRefundPending {
		t.Fatalf("hitting rebuild ceiling should move to refund_pending, got %q", got.Status)
	}
	if got.BroadcastRebuilds != DefaultBroadcastMaxRebuilds {
		t.Errorf("BroadcastRebuilds should reach the ceiling, got %d", got.BroadcastRebuilds)
	}
	if !strings.Contains(got.LastError, "successive broadcasts") {
		t.Errorf("LastError should explain the ceiling hit, got %q", got.LastError)
	}
}

// TestIsStaleTONSeqno_Matchers verifies the matcher recognizes the
// wallet-contract-refusal envelope without false positives on
// unrelated toncenter errors.
func TestIsStaleTONSeqno_Matchers(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want bool
	}{
		{"nil", nil, false},
		{"exit 33 stale seqno", errors.New("LITE_SERVER_UNKNOWN: External message was not accepted: exitcode=33"), true},
		{"exit 36 expired valid_until", errors.New("cannot apply external message to shard: External message was not accepted: exitcode=36"), true},
		{"case-insensitive", errors.New("external message WAS NOT accepted"), true},
		{"unrelated rate limit", errors.New("toncenter error: rate limited, retry after 1s"), false},
		{"random text", errors.New("connection refused"), false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := isStaleTONSeqno(tc.err); got != tc.want {
				t.Errorf("isStaleTONSeqno(%v) = %v, want %v", tc.err, got, tc.want)
			}
		})
	}
}

// TestBroadcast_StaleXRPSequence_ResetsForResign mirrors the Solana
// blockhash / TON seqno recovery for XRP. When XRPL returns
// terPRE_SEQ (current account sequence advanced past the tx's
// sequence) or tefPAST_SEQ (sequence already used), the broadcast
// driver clears DestRawTx + sign artifacts and routes back to
// bridge_transfer_pending so the signing driver re-reads the account
// sequence and re-signs.
func TestBroadcast_StaleXRPSequence_ResetsForResign(t *testing.T) {
	store := NewInMemoryStore()
	bc := newFakeBroadcaster()
	sw := seedBroadcastingSwap(t, store, "XRP_TESTNET", "DEADBEEF")
	bc.failFor("XRP_TESTNET", "DEADBEEF",
		errors.New("broadcast: submit rpc -97: xrpl engine_result=terPRE_SEQ: Missing/inapplicable prior transaction"))

	d := NewBroadcastDriver(store, bc, time.Hour, nil)
	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBridgeTransferPending {
		t.Fatalf("stale-sequence should reset to bridge_transfer_pending for re-sign, got %q", got.Status)
	}
	if got.DestRawTx != "" || got.Signature != "" || got.MPCSessionID != "" {
		t.Errorf("DestRawTx/Signature/MPCSessionID should be cleared; got DestRawTx=%q Signature=%q MPCSessionID=%q",
			got.DestRawTx, got.Signature, got.MPCSessionID)
	}
	if got.BroadcastRebuilds != 1 {
		t.Errorf("BroadcastRebuilds should be 1 after first rebuild, got %d", got.BroadcastRebuilds)
	}
	if !strings.Contains(strings.ToLower(got.LastError), "sequence stale") {
		t.Errorf("LastError should explain the cause; got %q", got.LastError)
	}
	if d.Stats().Rebuilds != 1 {
		t.Errorf("Rebuilds stat should be 1, got %d", d.Stats().Rebuilds)
	}
}

// TestBroadcast_StaleXRPSequence_MaxRebuilds_RoutesToRefund pins the
// ceiling: after maxRebuilds consecutive stale-sequence failures, the
// swap moves to refund_pending so the deposit gets returned.
func TestBroadcast_StaleXRPSequence_MaxRebuilds_RoutesToRefund(t *testing.T) {
	store := NewInMemoryStore()
	bc := newFakeBroadcaster()
	sw := seedBroadcastingSwap(t, store, "XRP_TESTNET", "DEADBEEF")
	_, _ = store.Patch(t.Context(), sw.ID, func(s *Swap) {
		s.BroadcastRebuilds = DefaultBroadcastMaxRebuilds - 1
	})
	bc.failFor("XRP_TESTNET", "DEADBEEF",
		errors.New("broadcast: submit rpc -99: xrpl engine_result=tefPAST_SEQ: This sequence number has already past"))

	d := NewBroadcastDriver(store, bc, time.Hour, nil)
	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusRefundPending {
		t.Fatalf("hitting rebuild ceiling should move to refund_pending, got %q", got.Status)
	}
	if got.BroadcastRebuilds != DefaultBroadcastMaxRebuilds {
		t.Errorf("BroadcastRebuilds should reach the ceiling, got %d", got.BroadcastRebuilds)
	}
	if !strings.Contains(strings.ToLower(got.LastError), "sequence stale") {
		t.Errorf("LastError should explain the ceiling hit, got %q", got.LastError)
	}
}

// TestIsStaleXRPSequence_Matchers verifies the matcher recognizes
// each XRPL stale-sequence code without false positives.
func TestIsStaleXRPSequence_Matchers(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want bool
	}{
		{"nil", nil, false},
		{"terPRE_SEQ", errors.New("engine_result=terPRE_SEQ: Missing/inapplicable prior transaction"), true},
		{"terPRE_SEQ lowercase", errors.New("got terpre_seq from xrpl"), true},
		{"tefPAST_SEQ", errors.New("engine_result=tefPAST_SEQ: This sequence number has already past"), true},
		{"tefALREADY", errors.New("engine_result=tefALREADY: this transaction is already in the ledger"), true},
		{"tecUNFUNDED unrelated", errors.New("engine_result=tecUNFUNDED_PAYMENT"), false},
		{"random text", errors.New("connection refused"), false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := isStaleXRPSequence(tc.err); got != tc.want {
				t.Errorf("isStaleXRPSequence(%v) = %v, want %v", tc.err, got, tc.want)
			}
		})
	}
}

// TestBroadcast_StaleBTCFee_ResetsForResign mirrors the Solana-blockhash /
// XRP-sequence recovery for Bitcoin. When bitcoind / mempool.space rejects
// the release tx because its feerate is below the relay or mempool floor,
// the broadcast driver clears DestRawTx + sign artifacts and routes back to
// bridge_transfer_pending so the signing driver re-quotes mempool.space's
// current feerate and re-signs. The original tx already signalled RBF
// (nSequence=0xfffffffd) so the higher-fee rebuild is a valid BIP-125
// replacement. Without this the same too-low-fee blob loops forever and the
// user's BTC never lands.
func TestBroadcast_StaleBTCFee_ResetsForResign(t *testing.T) {
	store := NewInMemoryStore()
	bc := newFakeBroadcaster()
	sw := seedBroadcastingSwap(t, store, "BITCOIN_TESTNET", "0200000001deadbeef")
	bc.failFor("BITCOIN_TESTNET", "0200000001deadbeef",
		errors.New("broadcast: btc POST /tx HTTP 400: sendrawtransaction RPC error: min relay fee not met, 250 < 1000"))

	d := NewBroadcastDriver(store, bc, time.Hour, nil)
	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBridgeTransferPending {
		t.Fatalf("stale-fee should reset to bridge_transfer_pending for re-sign, got %q", got.Status)
	}
	if got.DestRawTx != "" || got.Signature != "" || got.MPCSessionID != "" {
		t.Errorf("DestRawTx/Signature/MPCSessionID should be cleared; got DestRawTx=%q Signature=%q MPCSessionID=%q",
			got.DestRawTx, got.Signature, got.MPCSessionID)
	}
	if got.BroadcastRebuilds != 1 {
		t.Errorf("BroadcastRebuilds should be 1 after first rebuild, got %d", got.BroadcastRebuilds)
	}
	if !strings.Contains(strings.ToLower(got.LastError), "fee below relay floor") {
		t.Errorf("LastError should explain the cause; got %q", got.LastError)
	}
	if d.Stats().Rebuilds != 1 {
		t.Errorf("Rebuilds stat should be 1, got %d", d.Stats().Rebuilds)
	}
}

// TestBroadcast_StaleBTCFee_MaxRebuilds_RoutesToRefund pins the ceiling:
// after maxRebuilds consecutive fee rejections (a persistently overfull
// mempool, or a UTXO too small to carry a relayable fee), the swap moves to
// refund_pending so the deposit gets returned instead of looping forever.
func TestBroadcast_StaleBTCFee_MaxRebuilds_RoutesToRefund(t *testing.T) {
	store := NewInMemoryStore()
	bc := newFakeBroadcaster()
	sw := seedBroadcastingSwap(t, store, "BITCOIN_TESTNET", "0200000001deadbeef")
	_, _ = store.Patch(t.Context(), sw.ID, func(s *Swap) {
		s.BroadcastRebuilds = DefaultBroadcastMaxRebuilds - 1
	})
	bc.failFor("BITCOIN_TESTNET", "0200000001deadbeef",
		errors.New("broadcast: btc POST /tx HTTP 400: mempool min fee not met, 500 < 4200"))

	d := NewBroadcastDriver(store, bc, time.Hour, nil)
	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusRefundPending {
		t.Fatalf("hitting rebuild ceiling should move to refund_pending, got %q", got.Status)
	}
	if got.BroadcastRebuilds != DefaultBroadcastMaxRebuilds {
		t.Errorf("BroadcastRebuilds should reach the ceiling, got %d", got.BroadcastRebuilds)
	}
	if !strings.Contains(strings.ToLower(got.LastError), "routing to refund") {
		t.Errorf("LastError should explain the ceiling hit, got %q", got.LastError)
	}
}

// TestIsStaleBTCFee_Matchers verifies the matcher recognizes each fee-floor
// rejection without grabbing the unfunded-wallet case (which must stay at
// broadcasting + humanize, not rebuild) or unrelated errors.
func TestIsStaleBTCFee_Matchers(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want bool
	}{
		{"nil", nil, false},
		{"min relay fee not met", errors.New("sendrawtransaction RPC error: min relay fee not met, 250 < 1000"), true},
		{"mempool min fee not met", errors.New("mempool min fee not met, 500 < 4200"), true},
		{"rbf insufficient fee", errors.New("insufficient fee, rejecting replacement abc123; new feerate 1.0 <= old feerate 2.0"), true},
		{"uppercase", errors.New("MIN RELAY FEE NOT MET"), true},
		// Must NOT match: an unfunded release wallet is a different remedy
		// (fund the address) — rebuilding can't help. Pins that the geth
		// phrase "insufficient funds" doesn't collide with "insufficient fee".
		{"insufficient funds", errors.New("insufficient funds for gas * price + value"), false},
		// Must NOT match: a non-replaceable conflict isn't a fee problem.
		{"txn-mempool-conflict", errors.New("txn-mempool-conflict"), false},
		{"unrelated blockhash", errors.New("Blockhash not found"), false},
		{"random text", errors.New("connection refused"), false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := isStaleBTCFee(tc.err); got != tc.want {
				t.Errorf("isStaleBTCFee(%v) = %v, want %v", tc.err, got, tc.want)
			}
		})
	}
}

// TestBroadcast_SurfacesLastErrorOnInsufficientFunds pins the UX
// contract: when the destination chain rejects with "insufficient
// funds for gas * price + value", the swap stays at broadcasting
// (retryable — user just needs to fund the release address) AND
// LastError gets a clear human label so the SPA / UI can stop
// spinning blindly and tell the user what's wrong.
func TestBroadcast_SurfacesLastErrorOnInsufficientFunds(t *testing.T) {
	store := NewInMemoryStore()
	bc := newFakeBroadcaster()
	sw := seedBroadcastingSwap(t, store, "LUX_TESTNET", "0xrawtx")
	bc.failFor("LUX_TESTNET", "0xrawtx",
		errors.New("eth_sendRawTransaction rpc -32000: insufficient funds for gas * price + value: balance 0, tx cost 1525000000021000, overshot 1525000000021000"))

	d := NewBroadcastDriver(store, bc, time.Hour, nil)
	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBroadcasting {
		t.Errorf("status should remain broadcasting (recoverable), got %q", got.Status)
	}
	if got.LastError == "" {
		t.Fatal("expected LastError to be populated on insufficient-funds failure")
	}
	if !strings.Contains(strings.ToLower(got.LastError), "insufficient funds") {
		t.Errorf("LastError should label the cause as insufficient funds; got %q", got.LastError)
	}
	// Make sure we did NOT pass through the raw geth string — that's
	// internal noise; the SDK + UI render the human label.
	if strings.Contains(got.LastError, "tx cost 1525000000021000") {
		t.Errorf("LastError should be humanized, not the raw geth message; got %q", got.LastError)
	}
}

// TestBroadcast_ClearsLastErrorOnSuccess pins that after a previously-
// failing swap finally lands, the UI no longer shows the stale error.
func TestBroadcast_ClearsLastErrorOnSuccess(t *testing.T) {
	store := NewInMemoryStore()
	bc := newFakeBroadcaster()
	sw := seedBroadcastingSwap(t, store, "LUX_TESTNET", "0xrawtx")
	// Seed a prior LastError as though the previous tick failed.
	_, _ = store.Patch(t.Context(), sw.ID, func(s *Swap) {
		s.LastError = "Insufficient funds in release address — fund the MPC address"
	})
	bc.okFor("LUX_TESTNET", "0xrawtx", "0xok")

	d := NewBroadcastDriver(store, bc, time.Hour, nil)
	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusCompleted {
		t.Fatalf("status should be completed, got %q", got.Status)
	}
	if got.LastError != "" {
		t.Errorf("LastError must be cleared on success; got %q", got.LastError)
	}
}

// TestBroadcast_HumanizesGatewayFlake confirms a 502 from the krakend
// gateway becomes a generic transient-RPC label, not the raw HTTP
// status string. Users shouldn't see internals for what's just retry.
func TestBroadcast_HumanizesGatewayFlake(t *testing.T) {
	store := NewInMemoryStore()
	bc := newFakeBroadcaster()
	sw := seedBroadcastingSwap(t, store, "LUX_TESTNET", "0xrawtx")
	bc.failFor("LUX_TESTNET", "0xrawtx", errors.New("HTTP 502: gateway error"))

	d := NewBroadcastDriver(store, bc, time.Hour, nil)
	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if !strings.Contains(strings.ToLower(got.LastError), "unreachable") {
		t.Errorf("502 should humanize to 'unreachable / retrying'; got %q", got.LastError)
	}
}

func TestBroadcast_OnlyTouchesBroadcasting(t *testing.T) {
	store := NewInMemoryStore()
	bc := newFakeBroadcaster()

	good := seedBroadcastingSwap(t, store, "LUX_TESTNET", "0xraw1")
	bc.okFor("LUX_TESTNET", "0xraw1", "0xt1")

	// Seed swaps in other states with DestRawTx populated — they
	// must NOT be touched.
	pending := &Swap{
		Status:             SwapStatusBridgeTransferPending,
		DestinationNetwork: "LUX_TESTNET",
		DestRawTx:          "0xraw_pending",
	}
	_ = store.Create(t.Context(), pending)
	completed := &Swap{
		Status:             SwapStatusCompleted,
		DestinationNetwork: "LUX_TESTNET",
		DestRawTx:          "0xraw_completed",
		DestTxHash:         "0xtt",
	}
	_ = store.Create(t.Context(), completed)

	d := NewBroadcastDriver(store, bc, time.Hour, nil)
	d.Tick(t.Context())

	if bc.calls.Load() != 1 {
		t.Errorf("expected 1 broadcast call (only the SwapStatusBroadcasting one); got %d", bc.calls.Load())
	}
	got, _ := store.Get(t.Context(), good.ID)
	if got.Status != SwapStatusCompleted {
		t.Errorf("good swap should be completed, got %q", got.Status)
	}
	got, _ = store.Get(t.Context(), pending.ID)
	if got.Status != SwapStatusBridgeTransferPending {
		t.Errorf("pending swap should not be touched, got %q", got.Status)
	}
	got, _ = store.Get(t.Context(), completed.ID)
	if got.Status != SwapStatusCompleted {
		t.Errorf("completed swap should not be re-broadcast, got %q", got.Status)
	}
}

func TestBroadcast_RoutesByDestinationNetwork(t *testing.T) {
	store := NewInMemoryStore()
	bc := newFakeBroadcaster()

	luxSwap := seedBroadcastingSwap(t, store, "LUX_TESTNET", "0xluxrawtx")
	ethSwap := seedBroadcastingSwap(t, store, "ETHEREUM_SEPOLIA", "0xethrawtx")
	bc.okFor("LUX_TESTNET", "0xluxrawtx", "0xluxhash")
	bc.okFor("ETHEREUM_SEPOLIA", "0xethrawtx", "0xethhash")

	d := NewBroadcastDriver(store, bc, time.Hour, nil)
	d.Tick(t.Context())

	if bc.calls.Load() != 2 {
		t.Errorf("expected 2 broadcasts (one per swap), got %d", bc.calls.Load())
	}
	gotLux, _ := store.Get(t.Context(), luxSwap.ID)
	gotEth, _ := store.Get(t.Context(), ethSwap.ID)
	if gotLux.DestTxHash != "0xluxhash" {
		t.Errorf("LUX_TESTNET swap got %q, want 0xluxhash", gotLux.DestTxHash)
	}
	if gotEth.DestTxHash != "0xethhash" {
		t.Errorf("ETHEREUM_SEPOLIA swap got %q, want 0xethhash", gotEth.DestTxHash)
	}
}

func TestBroadcast_IdempotentAcrossTicks(t *testing.T) {
	store := NewInMemoryStore()
	bc := newFakeBroadcaster()
	sw := seedBroadcastingSwap(t, store, "LUX_TESTNET", "0xrawtx")
	bc.okFor("LUX_TESTNET", "0xrawtx", "0xfinal")

	d := NewBroadcastDriver(store, bc, time.Hour, nil)
	d.Tick(t.Context())
	d.Tick(t.Context())
	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusCompleted {
		t.Errorf("status = %q, want completed", got.Status)
	}
	if bc.calls.Load() != 1 {
		t.Errorf("expected 1 broadcast across 3 ticks (post-advance filtered); got %d", bc.calls.Load())
	}
}

// =============================================================================
// Lifecycle
// =============================================================================

func TestBroadcastDriver_Run_StopsOnContextCancel(t *testing.T) {
	d := NewBroadcastDriver(NewInMemoryStore(), newFakeBroadcaster(), 30*time.Millisecond, nil)
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)
	go func() { done <- d.Run(ctx) }()
	time.Sleep(80 * time.Millisecond)
	if !d.Running() {
		t.Error("Running() should be true")
	}
	cancel()
	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Errorf("expected context.Canceled, got %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("Run did not return after cancel")
	}
}

func TestBroadcastDriver_RefusesDoubleStart(t *testing.T) {
	d := NewBroadcastDriver(NewInMemoryStore(), newFakeBroadcaster(), 50*time.Millisecond, nil)
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	go func() { _ = d.Run(ctx) }()
	time.Sleep(20 * time.Millisecond)
	if err := d.Run(ctx); err != nil {
		t.Errorf("second Run should return nil, got %v", err)
	}
}

func TestBroadcastDriver_Stop_Idempotent(t *testing.T) {
	d := NewBroadcastDriver(NewInMemoryStore(), newFakeBroadcaster(), time.Second, nil)
	d.Stop()
	d.Stop()
}

func TestBroadcastDriverStats_StartsZero(t *testing.T) {
	d := NewBroadcastDriver(NewInMemoryStore(), newFakeBroadcaster(), time.Second, nil)
	s := d.Stats()
	if s.Ticks != 0 || s.Attempts != 0 || s.Successes != 0 ||
		s.Failures != 0 || s.SkippedNoRawTx != 0 || s.ListErrors != 0 {
		t.Errorf("expected zero stats, got %+v", s)
	}
}

// =============================================================================
// End-to-end with txassembler — produces a wire-correct raw tx
// =============================================================================

// This is the canonical e2e: deposit watcher confirms funds, signing
// driver (WITH the assembler) builds the destination tx + asks MPC to
// sign it + finalizes the raw signed tx, broadcast driver pushes it.
// All chain boundaries use fakes; the assembler produces a real
// EIP-155 RLP-encoded tx (not a placeholder).
func TestEndToEnd_FullPipelineWithAssembler(t *testing.T) {
	store := NewInMemoryStore()
	depCheck := newFakeChecker()
	signer := newFakeSigner()
	bcaster := newFakeBroadcaster()

	mpcAddr := "0x3535353535353535353535353535353535353535"
	sw := &Swap{
		Status:             SwapStatusUserDepositPending,
		Amount:             0.1,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		SourceAsset:        "ETH",
		DestinationNetwork: "LUX_TESTNET",
		DestinationAsset:   "LUX",
		DestinationAddress: "0xa28fAE14eB42e7A5C36Ad2D774a2b7Eb293c4473",
		DepositAddress:     "wallet-e2e-asm###" + mpcAddr,
		UseDepositAddress:  true,
	}
	if err := store.Create(t.Context(), sw); err != nil {
		t.Fatal(err)
	}

	// Stage 1: deposit confirmed → bridge_transfer_pending.
	depCheck.setVerdict("ETHEREUM_SEPOLIA", mpcAddr, true)
	NewDepositWatcher(store, depCheck, time.Hour, nil).Tick(t.Context())
	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBridgeTransferPending {
		t.Fatalf("after deposit watcher: %q", got.Status)
	}

	// Stage 2: signing driver with assembler → broadcasting + DestRawTx.
	prov := &txassembler.StaticProvider{
		Nonces:   map[string]uint64{"LUX_TESTNET|3535353535353535353535353535353535353535": 0},
		GasPrice: map[string]*big.Int{"LUX_TESTNET": big.NewInt(25_000_000_000)},
	}
	asm := txassembler.New(prov)
	asm.SetNetwork("LUX_TESTNET", txassembler.PerNetwork{
		ChainID:         big.NewInt(96368),
		DefaultGasLimit: 21000,
		NativeDecimals:  18,
	})

	// Synthetic 65-byte signature with recoveryID=0.
	sigHex := "0x" + strings.Repeat("01", 32) + strings.Repeat("02", 32) + "00"
	signer.ok("wallet-e2e-asm", sigHex, "sess-e2e-asm")

	sd := NewSigningDriver(store, signer, time.Hour, nil)
	sd.SetAssembler(asm)
	sd.Tick(t.Context())

	got, _ = store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBroadcasting {
		t.Fatalf("after signing driver: %q", got.Status)
	}
	if got.DestRawTx == "" {
		t.Fatal("DestRawTx should be populated by the assembler — no manual patch needed")
	}
	// The raw tx should decode as RLP (broadcasts as eth_sendRawTransaction).
	if !strings.HasPrefix(got.DestRawTx, "0x") {
		t.Errorf("DestRawTx should be 0x-prefixed, got %q", got.DestRawTx[:10])
	}

	// Stage 3: broadcast driver pushes the assembler-produced raw tx.
	bcaster.okFor("LUX_TESTNET", got.DestRawTx, "0xfinal-e2e-asm-txhash")
	NewBroadcastDriver(store, bcaster, time.Hour, nil).Tick(t.Context())

	got, _ = store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusCompleted {
		t.Fatalf("after broadcast: %q, want completed", got.Status)
	}
	if got.DestTxHash != "0xfinal-e2e-asm-txhash" {
		t.Errorf("DestTxHash = %q", got.DestTxHash)
	}
}

// =============================================================================
// End-to-end: deposit → signing → broadcasting → completed (all drivers, no assembler)
// =============================================================================

func TestEndToEnd_AllDriversChained(t *testing.T) {
	// Compose all three drivers + their fakes into a single in-process
	// pipeline and run a swap from user_deposit_pending all the way
	// through to completed.
	store := NewInMemoryStore()

	// Fakes for each chain interaction.
	depCheck := newFakeChecker()
	signer := newFakeSigner()
	bcaster := newFakeBroadcaster()

	// Seed a swap as if the SDK + mchain.KeygenForDeposit had just run.
	sw := &Swap{
		Status:             SwapStatusUserDepositPending,
		Amount:             0.1,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		SourceAsset:        "ETH",
		DestinationNetwork: "LUX_TESTNET",
		DestinationAsset:   "LUX",
		DestinationAddress: "0xrecipient",
		DepositAddress:     "wallet-e2e###0xdepositaddr",
		UseDepositAddress:  true,
	}
	if err := store.Create(t.Context(), sw); err != nil {
		t.Fatal(err)
	}

	// Stage 1: deposit watcher confirms funds → bridge_transfer_pending.
	depCheck.setVerdict("ETHEREUM_SEPOLIA", "0xdepositaddr", true)
	wWatch := NewDepositWatcher(store, depCheck, time.Hour, nil)
	wWatch.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBridgeTransferPending {
		t.Fatalf("after deposit watcher: status = %q, want bridge_transfer_pending", got.Status)
	}

	// Stage 2: signing driver gets MPC signature → broadcasting.
	signer.ok("wallet-e2e", "0xsig-e2e", "sess-e2e")
	wSign := NewSigningDriver(store, signer, time.Hour, nil)
	wSign.Tick(t.Context())

	got, _ = store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBroadcasting {
		t.Fatalf("after signing driver: status = %q, want broadcasting", got.Status)
	}
	if got.Signature != "0xsig-e2e" {
		t.Errorf("Signature = %q, want 0xsig-e2e", got.Signature)
	}

	// Stage 3 SETUP: the tx assembler would populate DestRawTx between
	// signing and broadcasting. Until that lands, fake it here so the
	// broadcast driver has something to push.
	_, _ = store.Patch(t.Context(), sw.ID, func(s *Swap) {
		s.DestRawTx = "0xraw-tx-e2e"
	})
	bcaster.okFor("LUX_TESTNET", "0xraw-tx-e2e", "0xfinal-tx-hash-e2e")

	// Stage 3: broadcast driver pushes → completed.
	wBcast := NewBroadcastDriver(store, bcaster, time.Hour, nil)
	wBcast.Tick(t.Context())

	got, _ = store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusCompleted {
		t.Fatalf("after broadcast driver: status = %q, want completed", got.Status)
	}
	if got.DestTxHash != "0xfinal-tx-hash-e2e" {
		t.Errorf("DestTxHash = %q, want 0xfinal-tx-hash-e2e", got.DestTxHash)
	}
}

// =============================================================================
// Part B — BTC confirmation watcher (accepted-but-never-confirms / eviction)
// =============================================================================

// fakeConfirmer is a deterministic ConfirmationChecker for the BTC
// confirmation-gate tests. Keyed by network|txid so a test can stage
// distinct verdicts (confirmed / unconfirmed / RPC error) per tx.
type fakeConfirmer struct {
	mu        sync.Mutex
	confirmed map[string]bool
	errs      map[string]error
	calls     atomic.Int64
}

func newFakeConfirmer() *fakeConfirmer {
	return &fakeConfirmer{confirmed: map[string]bool{}, errs: map[string]error{}}
}

func (f *fakeConfirmer) setConfirmed(network, txid string, v bool) {
	f.mu.Lock()
	f.confirmed[network+"|"+txid] = v
	f.mu.Unlock()
}

func (f *fakeConfirmer) setErr(network, txid string, e error) {
	f.mu.Lock()
	f.errs[network+"|"+txid] = e
	f.mu.Unlock()
}

func (f *fakeConfirmer) ConfirmationStatus(_ context.Context, network, txid string) (bool, error) {
	f.calls.Add(1)
	f.mu.Lock()
	defer f.mu.Unlock()
	key := network + "|" + txid
	if err, ok := f.errs[key]; ok {
		return false, err
	}
	return f.confirmed[key], nil
}

// seedAwaitingConfirmationSwap creates a BTC swap already parked in
// SwapStatusAwaitingConfirmation with a recorded release txid. Tests
// further Patch BroadcastAt / LastFeeRate / BroadcastRebuilds as needed.
func seedAwaitingConfirmationSwap(t *testing.T, store SwapStore, destNet, txid string) *Swap {
	t.Helper()
	sw := &Swap{
		Status:             SwapStatusAwaitingConfirmation,
		Amount:             0.01,
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		SourceAsset:        "ETH",
		DestinationNetwork: destNet,
		DestinationAsset:   "BTC",
		DestinationAddress: "tb1qrecipient",
		Signature:          "0xsig",
		MPCSessionID:       "sess",
		DestRawTx:          "0200000001deadbeef",
		DestTxHash:         txid,
		BroadcastAt:        time.Now().UTC(),
		LastFeeRate:        10,
	}
	if err := store.Create(t.Context(), sw); err != nil {
		t.Fatalf("seed awaiting-confirmation swap: %v", err)
	}
	return sw
}

// TestBroadcast_BTC_ParksAwaitingConfirmation pins the core Part B
// behaviour: a BTC release that the node ACCEPTS does NOT complete
// immediately — it parks in awaiting_confirmation (mempool admission is
// not final for Bitcoin) with BroadcastAt stamped for the watcher.
func TestBroadcast_BTC_ParksAwaitingConfirmation(t *testing.T) {
	store := NewInMemoryStore()
	bc := newFakeBroadcaster()
	sw := seedBroadcastingSwap(t, store, "BITCOIN_TESTNET", "0200000001deadbeef")
	bc.okFor("BITCOIN_TESTNET", "0200000001deadbeef", "btctxid123")

	d := NewBroadcastDriver(store, bc, time.Hour, nil)
	d.SetConfirmer(newFakeConfirmer())
	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusAwaitingConfirmation {
		t.Fatalf("status = %q, want awaiting_confirmation", got.Status)
	}
	if got.DestTxHash != "btctxid123" {
		t.Errorf("DestTxHash = %q, want btctxid123", got.DestTxHash)
	}
	if got.BroadcastAt.IsZero() {
		t.Error("BroadcastAt not stamped")
	}
	// Not a terminal success yet — successes increments only on confirm.
	if s := d.Stats(); s.Successes != 0 {
		t.Errorf("Successes = %d, want 0 (not confirmed yet)", s.Successes)
	}
}

// TestBroadcast_BTC_NoConfirmer_CompletesImmediately guards back-compat:
// a deploy without a BTC confirmer must NOT strand BTC swaps in the new
// state — it falls back to the legacy immediate-Completed behaviour.
func TestBroadcast_BTC_NoConfirmer_CompletesImmediately(t *testing.T) {
	store := NewInMemoryStore()
	bc := newFakeBroadcaster()
	sw := seedBroadcastingSwap(t, store, "BITCOIN_TESTNET", "0200000001deadbeef")
	bc.okFor("BITCOIN_TESTNET", "0200000001deadbeef", "btctxid123")

	d := NewBroadcastDriver(store, bc, time.Hour, nil) // no SetConfirmer
	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusCompleted {
		t.Fatalf("status = %q, want completed (no confirmer ⇒ legacy path)", got.Status)
	}
}

// TestConfirm_BTC_ConfirmedPromotesToCompleted: once the watcher sees
// the release tx mined, the swap reaches the terminal Completed state
// and the rebuild counter clears.
func TestConfirm_BTC_ConfirmedPromotesToCompleted(t *testing.T) {
	store := NewInMemoryStore()
	bc := newFakeBroadcaster()
	sw := seedAwaitingConfirmationSwap(t, store, "BITCOIN_TESTNET", "btctxidABC")
	_, _ = store.Patch(t.Context(), sw.ID, func(s *Swap) { s.BroadcastRebuilds = 2 })

	fc := newFakeConfirmer()
	fc.setConfirmed("BITCOIN_TESTNET", "btctxidABC", true)

	d := NewBroadcastDriver(store, bc, time.Hour, nil)
	d.SetConfirmer(fc)
	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusCompleted {
		t.Fatalf("status = %q, want completed", got.Status)
	}
	if got.BroadcastRebuilds != 0 {
		t.Errorf("BroadcastRebuilds = %d, want 0 (cleared on success)", got.BroadcastRebuilds)
	}
	if s := d.Stats(); s.Successes != 1 || s.ConfirmChecks != 1 {
		t.Errorf("stats = %+v, want Successes=1 ConfirmChecks=1", s)
	}
}

// TestConfirm_BTC_WithinTimeoutStaysParked: an unconfirmed tx still
// inside its timeout window is left alone — give the block a chance.
func TestConfirm_BTC_WithinTimeoutStaysParked(t *testing.T) {
	store := NewInMemoryStore()
	bc := newFakeBroadcaster()
	sw := seedAwaitingConfirmationSwap(t, store, "BITCOIN_TESTNET", "btctxidABC") // BroadcastAt = now

	fc := newFakeConfirmer()
	fc.setConfirmed("BITCOIN_TESTNET", "btctxidABC", false)

	d := NewBroadcastDriver(store, bc, time.Hour, nil)
	d.SetConfirmer(fc) // default 30m timeout — not elapsed
	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusAwaitingConfirmation {
		t.Fatalf("status = %q, want still awaiting_confirmation", got.Status)
	}
	if s := d.Stats(); s.Rebuilds != 0 || s.ConfirmTimeouts != 0 {
		t.Errorf("stats = %+v, want no rebuilds/timeouts", s)
	}
}

// TestConfirm_BTC_TimeoutRebuildsWithHigherFee: past the timeout, an
// unconfirmed tx is reset for re-sign — and crucially LastFeeRate is
// PRESERVED so PreSignBTC bumps strictly above the stuck tx (RBF).
func TestConfirm_BTC_TimeoutRebuildsWithHigherFee(t *testing.T) {
	store := NewInMemoryStore()
	bc := newFakeBroadcaster()
	sw := seedAwaitingConfirmationSwap(t, store, "BITCOIN_TESTNET", "btctxidABC")
	// Push BroadcastAt into the past so the default timeout has elapsed.
	_, _ = store.Patch(t.Context(), sw.ID, func(s *Swap) {
		s.BroadcastAt = time.Now().Add(-time.Hour).UTC()
		s.LastFeeRate = 42
	})

	fc := newFakeConfirmer()
	fc.setConfirmed("BITCOIN_TESTNET", "btctxidABC", false)

	d := NewBroadcastDriver(store, bc, time.Hour, nil)
	d.SetConfirmer(fc)
	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusBridgeTransferPending {
		t.Fatalf("status = %q, want bridge_transfer_pending (rebuild)", got.Status)
	}
	if got.DestRawTx != "" || got.Signature != "" || got.MPCSessionID != "" || got.DestTxHash != "" {
		t.Errorf("re-sign artifacts not cleared: rawtx=%q sig=%q sess=%q txhash=%q",
			got.DestRawTx, got.Signature, got.MPCSessionID, got.DestTxHash)
	}
	if got.LastFeeRate != 42 {
		t.Errorf("LastFeeRate = %d, want 42 preserved across rebuild (RBF bump floor)", got.LastFeeRate)
	}
	if got.BroadcastRebuilds != 1 {
		t.Errorf("BroadcastRebuilds = %d, want 1", got.BroadcastRebuilds)
	}
	if !strings.Contains(got.LastError, "higher RBF feerate") {
		t.Errorf("LastError = %q, want mention of higher RBF feerate", got.LastError)
	}
	if s := d.Stats(); s.Rebuilds != 1 || s.ConfirmTimeouts != 1 {
		t.Errorf("stats = %+v, want Rebuilds=1 ConfirmTimeouts=1", s)
	}
}

// TestConfirm_BTC_TimeoutMaxRebuildsRoutesToRefund: a tx that stays
// unconfirmed through the rebuild ceiling routes to refund rather than
// bumping the fee forever.
func TestConfirm_BTC_TimeoutMaxRebuildsRoutesToRefund(t *testing.T) {
	store := NewInMemoryStore()
	bc := newFakeBroadcaster()
	sw := seedAwaitingConfirmationSwap(t, store, "BITCOIN_TESTNET", "btctxidABC")
	_, _ = store.Patch(t.Context(), sw.ID, func(s *Swap) {
		s.BroadcastAt = time.Now().Add(-time.Hour).UTC()
		s.BroadcastRebuilds = DefaultBroadcastMaxRebuilds - 1
	})

	fc := newFakeConfirmer()
	fc.setConfirmed("BITCOIN_TESTNET", "btctxidABC", false)

	d := NewBroadcastDriver(store, bc, time.Hour, nil)
	d.SetConfirmer(fc)
	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusRefundPending {
		t.Fatalf("status = %q, want refund_pending at ceiling", got.Status)
	}
	if got.BroadcastRebuilds != DefaultBroadcastMaxRebuilds {
		t.Errorf("BroadcastRebuilds = %d, want %d", got.BroadcastRebuilds, DefaultBroadcastMaxRebuilds)
	}
	if !strings.Contains(got.LastError, "routing to refund") {
		t.Errorf("LastError = %q, want 'routing to refund'", got.LastError)
	}
}

// TestConfirm_BTC_ConfirmerErrorStaysParked: a transient confirmer RPC
// error must not disturb the swap — it stays parked for the next tick.
func TestConfirm_BTC_ConfirmerErrorStaysParked(t *testing.T) {
	store := NewInMemoryStore()
	bc := newFakeBroadcaster()
	sw := seedAwaitingConfirmationSwap(t, store, "BITCOIN_TESTNET", "btctxidABC")
	_, _ = store.Patch(t.Context(), sw.ID, func(s *Swap) {
		s.BroadcastAt = time.Now().Add(-time.Hour).UTC() // past timeout, but error wins
	})

	fc := newFakeConfirmer()
	fc.setErr("BITCOIN_TESTNET", "btctxidABC", errors.New("mempool.space HTTP 503"))

	d := NewBroadcastDriver(store, bc, time.Hour, nil)
	d.SetConfirmer(fc)
	d.Tick(t.Context())

	got, _ := store.Get(t.Context(), sw.ID)
	if got.Status != SwapStatusAwaitingConfirmation {
		t.Fatalf("status = %q, want unchanged awaiting_confirmation on RPC error", got.Status)
	}
	if s := d.Stats(); s.Rebuilds != 0 || s.ConfirmTimeouts != 0 {
		t.Errorf("stats = %+v, want no rebuild on transient error", s)
	}
}

// TestBumpBTCFeeRate pins the RBF bump policy: zero passes through (first
// attempt), otherwise +25% +1 so the replacement strictly out-bids even
// for tiny feerates where integer truncation would tie.
func TestBumpBTCFeeRate(t *testing.T) {
	cases := []struct {
		prev uint64
		want uint64
	}{
		{0, 0},     // first attempt — no floor
		{1, 2},     // 1 + 0 + 1
		{4, 6},     // 4 + 1 + 1
		{10, 13},   // 10 + 2 + 1
		{100, 126}, // 100 + 25 + 1
	}
	for _, tc := range cases {
		if got := bumpBTCFeeRate(tc.prev); got != tc.want {
			t.Errorf("bumpBTCFeeRate(%d) = %d, want %d", tc.prev, got, tc.want)
		}
		if tc.prev > 0 && bumpBTCFeeRate(tc.prev) <= tc.prev {
			t.Errorf("bumpBTCFeeRate(%d) did not strictly exceed input", tc.prev)
		}
	}
}
