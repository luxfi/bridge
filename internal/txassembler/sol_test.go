// Tests for the Solana destination-chain tx assembler.
//
// The strategy: each test spins up an httptest.Server that speaks just
// enough Solana JSON-RPC (getLatestBlockhash, optionally getAccountInfo)
// to make solana-go's *rpc.Client happy. We then assert on:
//   - SOLUnsigned.MessageBytes parses back into a valid Transaction
//   - Account[0] is the payer (the bridge convention)
//   - Native vs SPL instruction routing
//   - SPL ATA-create prepending
//   - Finalize round-trips through solana-go's parser

package txassembler

import (
	"context"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	bin "github.com/gagliardetto/binary"
	"github.com/gagliardetto/solana-go"
	ata "github.com/gagliardetto/solana-go/programs/associated-token-account"
	"github.com/gagliardetto/solana-go/programs/system"
	"github.com/gagliardetto/solana-go/programs/token"
	"github.com/gagliardetto/solana-go/rpc"
)

// =============================================================================
// Test fixtures
// =============================================================================

// Canonical test pubkeys. Picked from public Solana testnet addresses
// so they're 32-byte base58-clean and easily recognizable in test
// failure output.
const (
	// Pump.fun mint, just a stable 32-byte address.
	testPayer = "DjVE6JNiYqPL2QXyCUUh8rNjHrbz9hXHNYt99MQ59qw1"
	// Random valid recipient (Magic Eden royalty wallet).
	testRecipient = "FwJp6mD9LJSrf3PtCkc9b5b8AczyzKLpJtsk2bH9q3RJ"
	// USDC devnet mint.
	testMint = "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr"
)

// blockhashFixture is a known testnet blockhash (32 bytes, base58). The
// value doesn't matter for assembly — we just need something parseable.
const blockhashFixture = "GH7ome3EiwEr7tu9JuTh2dpYWBJK3z69Xm1ZE3MEguJk"

// rpcRequest is the JSON-RPC shape solana-go sends.
type rpcRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
}

// fakeSOLRPCServer mints an httptest.Server that handles
// getLatestBlockhash + getAccountInfo. Each test configures the
// destinationATAExists toggle to drive the ATA-create branch.
type fakeSOLRPCServer struct {
	t                     *testing.T
	server                *httptest.Server
	destinationATAExists  bool
	getAccountInfoCalls   int
	getLatestBlockhashAt  int
	lastGetAccountInfoAcc string
}

func newFakeSOLRPCServer(t *testing.T) *fakeSOLRPCServer {
	t.Helper()
	s := &fakeSOLRPCServer{t: t}
	s.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var req rpcRequest
		if err := json.Unmarshal(body, &req); err != nil {
			http.Error(w, "bad json", http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		switch req.Method {
		case "getLatestBlockhash":
			s.getLatestBlockhashAt++
			_, _ = w.Write([]byte(`{
				"jsonrpc":"2.0","id":1,
				"result":{
					"context":{"slot":12345},
					"value":{
						"blockhash":"` + blockhashFixture + `",
						"lastValidBlockHeight":99999
					}
				}
			}`))
		case "getAccountInfo":
			s.getAccountInfoCalls++
			// params is [pubkeyBase58, {encoding:"base64"}] — grab the
			// pubkey so tests can confirm we probed the right address.
			var params []json.RawMessage
			if err := json.Unmarshal(req.Params, &params); err == nil && len(params) > 0 {
				var addr string
				_ = json.Unmarshal(params[0], &addr)
				s.lastGetAccountInfoAcc = addr
			}
			if s.destinationATAExists {
				// Return a populated account-info shape so the assembler
				// thinks the ATA already exists.
				_, _ = w.Write([]byte(`{
					"jsonrpc":"2.0","id":1,
					"result":{
						"context":{"slot":12345},
						"value":{
							"lamports":2039280,
							"owner":"TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
							"data":["",""],
							"executable":false,
							"rentEpoch":0
						}
					}
				}`))
			} else {
				_, _ = w.Write([]byte(`{
					"jsonrpc":"2.0","id":1,
					"result":{
						"context":{"slot":12345},
						"value":null
					}
				}`))
			}
		default:
			t.Errorf("unexpected SOL RPC method: %s", req.Method)
			http.Error(w, "unsupported method", http.StatusBadRequest)
		}
	}))
	t.Cleanup(s.server.Close)
	return s
}

// asmFor builds an assembler pointed at the fake server for SOLANA_DEVNET.
func asmFor(s *fakeSOLRPCServer) *SOLAssembler {
	a := NewSOLAssembler()
	a.SetNetwork("SOLANA_DEVNET", SOLNetworkConfig{
		BlockhashURL: s.server.URL,
		Commitment:   rpc.CommitmentConfirmed,
	})
	return a
}

// =============================================================================
// SOLDefaultBlockhashURL
// =============================================================================

func TestSOLDefaultBlockhashURL(t *testing.T) {
	cases := []struct {
		net  string
		want string
	}{
		{"SOLANA_MAINNET", "https://api.mainnet-beta.solana.com"},
		{"SOLANA_DEVNET", "https://api.devnet.solana.com"},
		{"SOLANA_TESTNET", "https://api.testnet.solana.com"},
		{"MARS_MAINNET", ""},
	}
	for _, tc := range cases {
		if got := SOLDefaultBlockhashURL(tc.net); got != tc.want {
			t.Errorf("SOLDefaultBlockhashURL(%q) = %q, want %q", tc.net, got, tc.want)
		}
	}
}

// =============================================================================
// LamportsFromFloat
// =============================================================================

func TestLamportsFromFloat(t *testing.T) {
	cases := []struct {
		name     string
		amount   float64
		decimals int
		want     uint64
		wantErr  bool
	}{
		{"zero", 0.0, 9, 0, false},
		{"one SOL", 1.0, 9, 1_000_000_000, false},
		{"point five SOL", 0.5, 9, 500_000_000, false},
		{"point one USDC (6dp)", 0.1, 6, 100_000, false},
		{"micro SOL", 0.000_000_001, 9, 1, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := LamportsFromFloat(tc.amount, tc.decimals)
			if tc.wantErr {
				if err == nil {
					t.Errorf("expected error, got %v", got)
				}
				return
			}
			if err != nil {
				t.Errorf("err: %v", err)
				return
			}
			if got != tc.want {
				t.Errorf("got %d, want %d", got, tc.want)
			}
		})
	}
}

func TestLamportsFromFloat_NegativeRejected(t *testing.T) {
	if _, err := LamportsFromFloat(-1.0, 9); err == nil {
		t.Errorf("expected error for negative amount")
	}
}

// =============================================================================
// PreSign — happy path: native transfer
// =============================================================================

func TestSOLPreSign_NativeTransfer(t *testing.T) {
	srv := newFakeSOLRPCServer(t)
	a := asmFor(srv)

	u, err := a.PreSign(context.Background(), SOLSpec{
		Network:          "SOLANA_DEVNET",
		PayerAddress:     testPayer,
		RecipientAddress: testRecipient,
		LamportsAmount:   1_000_000, // 0.001 SOL
	})
	if err != nil {
		t.Fatalf("PreSign: %v", err)
	}
	if u == nil || u.tx == nil {
		t.Fatal("PreSign returned nil unsigned")
	}
	if u.Blockhash != blockhashFixture {
		t.Errorf("Blockhash = %q, want %q", u.Blockhash, blockhashFixture)
	}
	if len(u.MessageBytes) == 0 {
		t.Errorf("MessageBytes is empty")
	}

	// Account[0] MUST be the payer (Solana convention; the assembler
	// enforces this via TransactionPayer).
	if got, want := u.tx.Message.AccountKeys[0].String(), testPayer; got != want {
		t.Errorf("account[0] = %q, want %q", got, want)
	}

	// Exactly one instruction: system.Transfer.
	if got := len(u.tx.Message.Instructions); got != 1 {
		t.Fatalf("instructions = %d, want 1", got)
	}
	pidIdx := u.tx.Message.Instructions[0].ProgramIDIndex
	prog := u.tx.Message.AccountKeys[pidIdx]
	if !prog.Equals(solana.SystemProgramID) {
		t.Errorf("program = %s, want SystemProgramID", prog)
	}

	// Round-trip: MessageBytes must decode back to an identical Message.
	roundtrip, rerr := decodeSolanaMessage(u.MessageBytes)
	if rerr != nil {
		t.Fatalf("decode message: %v", rerr)
	}
	if got := roundtrip.AccountKeys[0].String(); got != testPayer {
		t.Errorf("roundtrip account[0] = %q, want %q", got, testPayer)
	}

	// No ATA probe should have been called for a native transfer.
	if srv.getAccountInfoCalls != 0 {
		t.Errorf("unexpected getAccountInfo calls for native transfer: %d", srv.getAccountInfoCalls)
	}
}

// =============================================================================
// PreSign — happy path: SPL transfer with destination ATA missing
// =============================================================================

func TestSOLPreSign_SPLTransfer_CreatesATAIfMissing(t *testing.T) {
	srv := newFakeSOLRPCServer(t)
	srv.destinationATAExists = false // → assembler must prepend ATA-create
	a := asmFor(srv)

	u, err := a.PreSign(context.Background(), SOLSpec{
		Network:          "SOLANA_DEVNET",
		PayerAddress:     testPayer,
		RecipientAddress: testRecipient,
		SourceMint:       testMint,
		LamportsAmount:   1_000_000, // 1 USDC at 6dp
	})
	if err != nil {
		t.Fatalf("PreSign: %v", err)
	}

	if got := len(u.tx.Message.Instructions); got != 2 {
		t.Fatalf("instructions = %d, want 2 (ata-create + token-transfer)", got)
	}

	// First instruction = ATA create against the ATA program ID.
	pidIdx0 := u.tx.Message.Instructions[0].ProgramIDIndex
	if prog := u.tx.Message.AccountKeys[pidIdx0]; !prog.Equals(ata.ProgramID) {
		t.Errorf("instr[0] program = %s, want ATA program", prog)
	}

	// Second instruction = token transfer against the SPL token program.
	pidIdx1 := u.tx.Message.Instructions[1].ProgramIDIndex
	if prog := u.tx.Message.AccountKeys[pidIdx1]; !prog.Equals(token.ProgramID) {
		t.Errorf("instr[1] program = %s, want Token program", prog)
	}

	// Confirm the assembler probed the destination ATA (not the source).
	wantDstATA, _, _ := solana.FindAssociatedTokenAddress(
		solana.MustPublicKeyFromBase58(testRecipient),
		solana.MustPublicKeyFromBase58(testMint),
	)
	if srv.lastGetAccountInfoAcc != wantDstATA.String() {
		t.Errorf("probed %q, want destination ATA %q", srv.lastGetAccountInfoAcc, wantDstATA)
	}
}

// =============================================================================
// PreSign — happy path: SPL transfer with destination ATA already present
// =============================================================================

func TestSOLPreSign_SPLTransfer_SkipsATAIfPresent(t *testing.T) {
	srv := newFakeSOLRPCServer(t)
	srv.destinationATAExists = true
	a := asmFor(srv)

	u, err := a.PreSign(context.Background(), SOLSpec{
		Network:          "SOLANA_DEVNET",
		PayerAddress:     testPayer,
		RecipientAddress: testRecipient,
		SourceMint:       testMint,
		LamportsAmount:   1_000_000,
	})
	if err != nil {
		t.Fatalf("PreSign: %v", err)
	}

	if got := len(u.tx.Message.Instructions); got != 1 {
		t.Fatalf("instructions = %d, want 1 (token-transfer only)", got)
	}
	pidIdx := u.tx.Message.Instructions[0].ProgramIDIndex
	if prog := u.tx.Message.AccountKeys[pidIdx]; !prog.Equals(token.ProgramID) {
		t.Errorf("program = %s, want Token program", prog)
	}
}

// =============================================================================
// PreSign — error paths
// =============================================================================

func TestSOLPreSign_UnknownNetwork(t *testing.T) {
	a := NewSOLAssembler()
	_, err := a.PreSign(context.Background(), SOLSpec{
		Network:          "SOLANA_MARS",
		PayerAddress:     testPayer,
		RecipientAddress: testRecipient,
		LamportsAmount:   1,
	})
	if err == nil {
		t.Fatal("expected error for unknown network")
	}
	if !strings.Contains(err.Error(), "no SOL network config") {
		t.Errorf("err = %v, want no-network-config message", err)
	}
}

func TestSOLPreSign_ZeroLamportsRejected(t *testing.T) {
	srv := newFakeSOLRPCServer(t)
	a := asmFor(srv)
	_, err := a.PreSign(context.Background(), SOLSpec{
		Network:          "SOLANA_DEVNET",
		PayerAddress:     testPayer,
		RecipientAddress: testRecipient,
		LamportsAmount:   0,
	})
	if err == nil {
		t.Fatal("expected error for zero lamports")
	}
}

func TestSOLPreSign_InvalidPayerAddress(t *testing.T) {
	srv := newFakeSOLRPCServer(t)
	a := asmFor(srv)
	_, err := a.PreSign(context.Background(), SOLSpec{
		Network:          "SOLANA_DEVNET",
		PayerAddress:     "not-a-base58-pubkey",
		RecipientAddress: testRecipient,
		LamportsAmount:   1_000_000,
	})
	if err == nil || !strings.Contains(err.Error(), "PayerAddress") {
		t.Errorf("err = %v, want PayerAddress error", err)
	}
}

// =============================================================================
// Finalize — round-trip through MarshalBinary + solana-go parser
// =============================================================================

func TestSOLFinalize_RoundTrip(t *testing.T) {
	srv := newFakeSOLRPCServer(t)
	a := asmFor(srv)

	u, err := a.PreSign(context.Background(), SOLSpec{
		Network:          "SOLANA_DEVNET",
		PayerAddress:     testPayer,
		RecipientAddress: testRecipient,
		LamportsAmount:   1_234_567,
	})
	if err != nil {
		t.Fatalf("PreSign: %v", err)
	}

	// Fake a 64-byte signature. We're testing the wire format, not the
	// cryptography.
	var sig [SOLSignatureLen]byte
	for i := range sig {
		sig[i] = byte(i)
	}

	rawB64, sigStr, err := a.Finalize(u, sig)
	if err != nil {
		t.Fatalf("Finalize: %v", err)
	}
	if rawB64 == "" || sigStr == "" {
		t.Fatalf("Finalize returned empty rawTx=%q sig=%q", rawB64, sigStr)
	}

	// Decode the signature back from base58 and confirm it matches.
	gotSig, perr := solana.SignatureFromBase58(sigStr)
	if perr != nil {
		t.Fatalf("parse base58 sig: %v", perr)
	}
	if [SOLSignatureLen]byte(gotSig) != sig {
		t.Errorf("sig round-trip mismatch")
	}

	// Decode rawB64 back into a Transaction and assert structure.
	raw, perr := base64.StdEncoding.DecodeString(rawB64)
	if perr != nil {
		t.Fatalf("decode b64: %v", perr)
	}
	var parsed solana.Transaction
	if err := parsed.UnmarshalWithDecoder(bin.NewBinDecoder(raw)); err != nil {
		t.Fatalf("parse tx: %v", err)
	}
	if len(parsed.Signatures) != 1 {
		t.Errorf("signatures = %d, want 1", len(parsed.Signatures))
	}
	if [SOLSignatureLen]byte(parsed.Signatures[0]) != sig {
		t.Errorf("first signature mismatch after round-trip")
	}
	if got := parsed.Message.AccountKeys[0].String(); got != testPayer {
		t.Errorf("parsed account[0] = %q, want %q", got, testPayer)
	}
	if got := parsed.Message.RecentBlockhash.String(); got != blockhashFixture {
		t.Errorf("parsed blockhash = %q, want %q", got, blockhashFixture)
	}
}

// =============================================================================
// ParseSOLSignatureHex
// =============================================================================

func TestParseSOLSignatureHex(t *testing.T) {
	// 64 bytes = 128 hex chars.
	good := strings.Repeat("ab", 64)
	out, err := ParseSOLSignatureHex(good)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	for _, b := range out {
		if b != 0xab {
			t.Errorf("byte = %#x, want 0xab", b)
			break
		}
	}

	// Accepts 0x prefix.
	if _, err := ParseSOLSignatureHex("0x" + good); err != nil {
		t.Errorf("0x prefix should be accepted: %v", err)
	}

	// Too short.
	if _, err := ParseSOLSignatureHex(strings.Repeat("ab", 32)); err == nil {
		t.Error("expected error for short sig")
	}
	// Non-hex chars.
	if _, err := ParseSOLSignatureHex(strings.Repeat("zz", 64)); err == nil {
		t.Error("expected error for invalid hex")
	}
}

// =============================================================================
// Helpers
// =============================================================================

// decodeSolanaMessage decodes a raw message buffer via solana-go's
// internal decoder. Used to confirm round-trip of PreSign's
// MessageBytes.
func decodeSolanaMessage(b []byte) (*solana.Message, error) {
	dec := bin.NewBinDecoder(b)
	var m solana.Message
	if err := m.UnmarshalWithDecoder(dec); err != nil {
		return nil, err
	}
	return &m, nil
}

// =============================================================================
// System program transfer encoder presence — sanity check
// =============================================================================

func TestSystemTransferInstructionBuildable(t *testing.T) {
	// Sanity: confirm the dependency exposes NewTransferInstruction with
	// the (uint64, payer, recipient) shape we're consuming. Catches a
	// solana-go API break before the rest of the assembler does.
	pk := solana.MustPublicKeyFromBase58(testPayer)
	rcv := solana.MustPublicKeyFromBase58(testRecipient)
	inst := system.NewTransferInstruction(1, pk, rcv).Build()
	if inst == nil {
		t.Fatal("system.NewTransferInstruction returned nil")
	}
	// Ensure we can extract instruction bytes — touches the encoder.
	if data, err := inst.Data(); err != nil || len(data) == 0 {
		t.Fatalf("inst.Data: %v len=%d", err, len(data))
	}
	// Decode the lamports field from the SystemProgram transfer
	// instruction's binary form to confirm we'd recover the amount.
	data, _ := inst.Data()
	if len(data) < 12 {
		t.Fatalf("instruction data len = %d, want at least 12", len(data))
	}
	// System Transfer layout: u32 discriminator (=2) || u64 little-endian lamports.
	disc := uint32(data[0]) | uint32(data[1])<<8 | uint32(data[2])<<16 | uint32(data[3])<<24
	if disc != 2 {
		t.Errorf("system transfer discriminator = %d, want 2", disc)
	}
	lamports := uint64(0)
	for i := 0; i < 8; i++ {
		lamports |= uint64(data[4+i]) << (8 * i)
	}
	if lamports != 1 {
		t.Errorf("lamports = %d, want 1", lamports)
	}

	// Ensure hex.EncodeToString is reachable (this package uses it).
	_ = hex.EncodeToString(data)
}
