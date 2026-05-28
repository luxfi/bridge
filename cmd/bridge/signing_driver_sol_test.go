package main

import (
	"context"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"io"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	bin "github.com/gagliardetto/binary"
	"github.com/gagliardetto/solana-go"
	"github.com/gagliardetto/solana-go/rpc"

	"github.com/luxfi/bridge/internal/mchain"
	"github.com/luxfi/bridge/internal/txassembler"
)

// =============================================================================
// Curve-aware fake signer
// =============================================================================

// curveFakeSigner satisfies both MPCSigner and CurveSigner. It records
// the curve hint per call so tests can assert SOL flows requested
// Ed25519.
type curveFakeSigner struct {
	mu        sync.Mutex
	signature string
	sessionID string
	lastCurve mchain.Curve
	calls     atomic.Int64
}

func (f *curveFakeSigner) SignForWallet(_ context.Context, _, _ string) (*mchain.SignResult, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls.Add(1)
	f.lastCurve = mchain.CurveSecp256k1
	return &mchain.SignResult{Signature: f.signature, SessionID: f.sessionID}, nil
}

func (f *curveFakeSigner) SignForWalletOnCurve(_ context.Context, _, _ string, curve mchain.Curve) (*mchain.SignResult, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls.Add(1)
	f.lastCurve = curve
	return &mchain.SignResult{Signature: f.signature, SessionID: f.sessionID}, nil
}

// Compile-time confirmation that the fake satisfies the curve interface.
var _ CurveSigner = (*curveFakeSigner)(nil)

// =============================================================================
// Lamport balance probe
// =============================================================================

// lamportProbe returns a fixed lamport balance regardless of address.
// Distinct from fakeProbe (wei units) so tests don't accidentally
// conflate the two.
type lamportProbe struct {
	balance int64
}

func (p *lamportProbe) BalanceAt(_ context.Context, _, _ string) (*big.Int, error) {
	return big.NewInt(p.balance), nil
}

// =============================================================================
// Fake Solana RPC for the SOL assembler
// =============================================================================

const (
	solTestPayer     = "DjVE6JNiYqPL2QXyCUUh8rNjHrbz9hXHNYt99MQ59qw1"
	solTestRecipient = "FwJp6mD9LJSrf3PtCkc9b5b8AczyzKLpJtsk2bH9q3RJ"
	solTestBlockhash = "GH7ome3EiwEr7tu9JuTh2dpYWBJK3z69Xm1ZE3MEguJk"
)

// newSOLRPCFake spins up a httptest server that answers the calls the
// SOLAssembler needs (getLatestBlockhash + getAccountInfo).
func newSOLRPCFake(t *testing.T) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var req struct {
			Method string `json:"method"`
		}
		_ = json.Unmarshal(body, &req)
		w.Header().Set("Content-Type", "application/json")
		switch req.Method {
		case "getLatestBlockhash":
			_, _ = w.Write([]byte(`{
				"jsonrpc":"2.0","id":1,
				"result":{"context":{"slot":1},"value":{"blockhash":"` + solTestBlockhash + `","lastValidBlockHeight":99999}}
			}`))
		case "getAccountInfo":
			_, _ = w.Write([]byte(`{"jsonrpc":"2.0","id":1,"result":{"context":{"slot":1},"value":null}}`))
		default:
			http.Error(w, "unsupported method "+req.Method, http.StatusBadRequest)
		}
	}))
	t.Cleanup(srv.Close)
	return srv
}

// =============================================================================
// signOneSOL — happy path
// =============================================================================

func TestSigning_SOL_BuildsSignsAndFinalizes(t *testing.T) {
	store := NewInMemoryStore()

	// Build a SOL swap pre-positioned at bridge_transfer_pending.
	sw := &Swap{
		Status:             SwapStatusBridgeTransferPending,
		Amount:             0.001, // 1_000_000 lamports
		SourceNetwork:      "ETHEREUM_SEPOLIA",
		SourceAsset:        "ETH",
		DestinationNetwork: "SOLANA_DEVNET",
		DestinationAsset:   "SOL",
		DestinationAddress: solTestRecipient,
		// Legacy deposit envelope so the driver has a wallet id +
		// sender (we're not using the pool path in this test).
		DepositAddress: "wallet-1###" + solTestPayer,
	}
	if err := store.Create(context.Background(), sw); err != nil {
		t.Fatalf("create: %v", err)
	}

	// SOL assembler pointed at the fake RPC.
	solRPC := newSOLRPCFake(t)
	solAsm := txassembler.NewSOLAssembler()
	solAsm.SetNetwork("SOLANA_DEVNET", txassembler.SOLNetworkConfig{
		BlockhashURL: solRPC.URL,
		Commitment:   rpc.CommitmentConfirmed,
	})

	// Fake signer that returns a deterministic 64-byte Ed25519 sig.
	var sigBytes [64]byte
	for i := range sigBytes {
		sigBytes[i] = byte(i + 1)
	}
	signer := &curveFakeSigner{
		signature: hex.EncodeToString(sigBytes[:]),
		sessionID: "sess-sol-1",
	}

	driver := NewSigningDriver(store, signer, time.Second, nil)
	driver.SetSOLAssembler(solAsm)

	driver.Tick(context.Background())

	// Curve hint must have been Ed25519.
	if signer.lastCurve != mchain.CurveEd25519 {
		t.Errorf("lastCurve = %q, want ed25519", signer.lastCurve)
	}

	// Swap must have advanced to broadcasting with a populated DestRawTx
	// and a base58 signature in Signature.
	got, _ := store.Get(context.Background(), sw.ID)
	if got.Status != SwapStatusBroadcasting {
		t.Fatalf("status = %q, want broadcasting", got.Status)
	}
	if got.DestRawTx == "" {
		t.Errorf("DestRawTx is empty")
	}
	if got.Signature == "" {
		t.Errorf("Signature is empty")
	}

	// DestRawTx must base64-decode and round-trip through solana-go's
	// transaction parser, with the right signature in slot 0.
	raw, derr := base64.StdEncoding.DecodeString(got.DestRawTx)
	if derr != nil {
		t.Fatalf("decode raw tx: %v", derr)
	}
	var parsed solana.Transaction
	if err := parsed.UnmarshalWithDecoder(bin.NewBinDecoder(raw)); err != nil {
		t.Fatalf("parse tx: %v", err)
	}
	if len(parsed.Signatures) != 1 {
		t.Fatalf("signatures len = %d, want 1", len(parsed.Signatures))
	}
	if [64]byte(parsed.Signatures[0]) != sigBytes {
		t.Errorf("on-wire signature differs from MPC output")
	}
	if got := parsed.Message.RecentBlockhash.String(); got != solTestBlockhash {
		t.Errorf("blockhash = %q, want %q", got, solTestBlockhash)
	}
	if got := parsed.Message.AccountKeys[0].String(); got != solTestPayer {
		t.Errorf("account[0] = %q, want payer %q", got, solTestPayer)
	}
}

// =============================================================================
// signOneSOL — no assembler configured
// =============================================================================

func TestSigning_SOL_WithoutAssemblerRollsBack(t *testing.T) {
	store := NewInMemoryStore()
	sw := &Swap{
		Status:             SwapStatusBridgeTransferPending,
		Amount:             0.001,
		DestinationNetwork: "SOLANA_DEVNET",
		DestinationAsset:   "SOL",
		DestinationAddress: solTestRecipient,
		DepositAddress:     "wallet-1###" + solTestPayer,
	}
	_ = store.Create(context.Background(), sw)

	driver := NewSigningDriver(store, &curveFakeSigner{}, time.Second, nil)
	// Deliberately do NOT SetSOLAssembler.
	driver.Tick(context.Background())

	got, _ := store.Get(context.Background(), sw.ID)
	if got.Status != SwapStatusBridgeTransferPending {
		t.Errorf("status = %q, want rolled back to bridge_transfer_pending", got.Status)
	}
	if !strings.Contains(got.LastError, "SOLAssembler") {
		t.Errorf("LastError = %q, want mention of SOLAssembler", got.LastError)
	}
}

// =============================================================================
// signOneSOL — malformed signature from MPC
// =============================================================================

func TestSigning_SOL_MalformedSignatureRollsBack(t *testing.T) {
	store := NewInMemoryStore()
	sw := &Swap{
		Status:             SwapStatusBridgeTransferPending,
		Amount:             0.001,
		DestinationNetwork: "SOLANA_DEVNET",
		DestinationAsset:   "SOL",
		DestinationAddress: solTestRecipient,
		DepositAddress:     "wallet-1###" + solTestPayer,
	}
	_ = store.Create(context.Background(), sw)

	solRPC := newSOLRPCFake(t)
	solAsm := txassembler.NewSOLAssembler()
	solAsm.SetNetwork("SOLANA_DEVNET", txassembler.SOLNetworkConfig{BlockhashURL: solRPC.URL})

	// 32-byte signature ≠ 64 bytes Ed25519 — finalize must reject.
	signer := &curveFakeSigner{signature: strings.Repeat("ab", 32), sessionID: "sess"}

	driver := NewSigningDriver(store, signer, time.Second, nil)
	driver.SetSOLAssembler(solAsm)
	driver.Tick(context.Background())

	got, _ := store.Get(context.Background(), sw.ID)
	if got.Status != SwapStatusBridgeTransferPending {
		t.Errorf("status = %q, want rolled back", got.Status)
	}
	if !strings.Contains(got.LastError, "malformed signature") {
		t.Errorf("LastError = %q, want malformed-signature message", got.LastError)
	}
}

// =============================================================================
// signOneSOL — gas pre-check short-circuit (insufficient lamports)
// =============================================================================

func TestSigning_SOL_GasPrecheckShortCircuits(t *testing.T) {
	store := NewInMemoryStore()
	sw := &Swap{
		Status:             SwapStatusBridgeTransferPending,
		Amount:             0.001, // 1_000_000 lamports
		DestinationNetwork: "SOLANA_DEVNET",
		DestinationAsset:   "SOL",
		DestinationAddress: solTestRecipient,
		DepositAddress:     "wallet-1###" + solTestPayer,
	}
	_ = store.Create(context.Background(), sw)

	solRPC := newSOLRPCFake(t)
	solAsm := txassembler.NewSOLAssembler()
	solAsm.SetNetwork("SOLANA_DEVNET", txassembler.SOLNetworkConfig{BlockhashURL: solRPC.URL})

	signer := &curveFakeSigner{
		signature: hex.EncodeToString(make([]byte, 64)),
		sessionID: "sess",
	}

	// Balance is 100 lamports — required is ~1_005_000. Must short-circuit.
	driver := NewSigningDriver(store, signer, time.Second, nil)
	driver.SetSOLAssembler(solAsm)
	driver.SetGasProbe(&lamportProbe{balance: 100})
	driver.Tick(context.Background())

	got, _ := store.Get(context.Background(), sw.ID)
	if got.Status != SwapStatusFailedInsufficientReleaseGas {
		t.Errorf("status = %q, want failed_insufficient_release_gas", got.Status)
	}
	if !strings.Contains(got.LastError, "lamport") {
		t.Errorf("LastError = %q, want lamport-related message", got.LastError)
	}
	if signer.calls.Load() != 0 {
		t.Errorf("signer.calls = %d, want 0 (pre-check should short-circuit before sign)", signer.calls.Load())
	}
}
