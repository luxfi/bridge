package txassembler

import (
	"context"
	"encoding/binary"
	"testing"

	"github.com/luxfi/bridge/internal/solanarpc"
)

// fakeSolanaProvider returns a fixed blockhash. Lets the test pin
// every output byte without an HTTP server in the loop.
type fakeSolanaProvider struct {
	blockhash            string
	lastValidBlockHeight uint64
	err                  error
}

func (f *fakeSolanaProvider) GetLatestBlockhash(_ context.Context) (*solanarpc.LatestBlockhash, error) {
	if f.err != nil {
		return nil, f.err
	}
	return &solanarpc.LatestBlockhash{
		Blockhash:            f.blockhash,
		LastValidBlockHeight: f.lastValidBlockHeight,
	}, nil
}

// =============================================================================
// PreSignSolana
// =============================================================================

const (
	// Real pubkey examples — base58 of arbitrary 32-byte payloads.
	// Picked to be valid base58, not on-curve (doesn't matter for
	// message-construction tests).
	releasePubkey = "DRpbCBMxVnDK7maPM5tGv6MvB3v1sRMC86PZ8okm21hy"
	recipientPK   = "Hk5h7Cf68HrLqZj3PaaT9KQpgr1mEZQ5oG2cxQUEr5pa"
	// canonical "all 1s" base58 of the all-zero 32-byte buffer
	// (verified offline against gagliardetto/solana-go).
	allZeros32B58 = "11111111111111111111111111111111"
)

func TestPreSignSolana_BuildsCorrectMessage(t *testing.T) {
	a := &Assembler{}
	prov := &fakeSolanaProvider{
		blockhash:            "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
		lastValidBlockHeight: 200,
	}

	got, err := a.PreSignSolana(context.Background(), SwapIntent{
		DestinationNetwork: "SOLANA_MAINNET",
		DestinationAsset:   "SOL",
		DestinationAddress: recipientPK,
		Amount:             0.5, // 0.5 SOL → 500_000_000 lamports
		SenderAddress:      releasePubkey,
	}, prov)
	if err != nil {
		t.Fatalf("PreSignSolana: %v", err)
	}

	if got.Network != "SOLANA_MAINNET" {
		t.Errorf("Network = %q want SOLANA_MAINNET", got.Network)
	}
	if got.Lamports != 500_000_000 {
		t.Errorf("Lamports = %d want 500000000", got.Lamports)
	}
	if got.Blockhash != prov.blockhash {
		t.Errorf("Blockhash = %q want %q", got.Blockhash, prov.blockhash)
	}

	// Header: [num_required_signatures=1, num_readonly_signed=0,
	// num_readonly_unsigned=1]
	if got.Message[0] != 1 || got.Message[1] != 0 || got.Message[2] != 1 {
		t.Errorf("header = %v want [1 0 1]", got.Message[:3])
	}

	// account_keys: compact-u16 length (1 byte = 3), then 3 × 32-byte
	// pubkeys [from, to, systemProgram].
	if got.Message[3] != 3 {
		t.Errorf("account_keys length = %d want 3", got.Message[3])
	}
	gotFrom := got.Message[4:36]
	gotTo := got.Message[36:68]
	gotSystem := got.Message[68:100]

	fromBytes, _ := solanarpc.DecodeBase58(releasePubkey)
	toBytes, _ := solanarpc.DecodeBase58(recipientPK)
	if !bytesEqual(gotFrom, fromBytes) {
		t.Errorf("account_keys[0] (from) mismatch")
	}
	if !bytesEqual(gotTo, toBytes) {
		t.Errorf("account_keys[1] (to) mismatch")
	}
	for _, b := range gotSystem {
		if b != 0 {
			t.Errorf("account_keys[2] (SystemProgram) should be all zeros")
			break
		}
	}

	// Recent blockhash at offset 100, 32 bytes.
	hashBytes, _ := solanarpc.DecodeBase58(prov.blockhash)
	if !bytesEqual(got.Message[100:132], hashBytes) {
		t.Errorf("blockhash bytes mismatch")
	}

	// Instructions: compact-u16 length (1 byte = 1).
	if got.Message[132] != 1 {
		t.Errorf("instructions length = %d want 1", got.Message[132])
	}

	// Instruction: program_id_index=2, account_indices=[0,1], data=12 bytes.
	if got.Message[133] != 2 {
		t.Errorf("program_id_index = %d want 2", got.Message[133])
	}
	if got.Message[134] != 2 || got.Message[135] != 0 || got.Message[136] != 1 {
		t.Errorf("account_indices header+values = %v want [2 0 1]", got.Message[134:137])
	}
	if got.Message[137] != 12 {
		t.Errorf("data length = %d want 12", got.Message[137])
	}
	// data[0..4) = u32 LE = 2; data[4..12) = u64 LE = 500_000_000.
	gotInstr := got.Message[138:150]
	if binary.LittleEndian.Uint32(gotInstr[0:4]) != 2 {
		t.Errorf("instruction discriminator = %d want 2", binary.LittleEndian.Uint32(gotInstr[0:4]))
	}
	if binary.LittleEndian.Uint64(gotInstr[4:12]) != 500_000_000 {
		t.Errorf("lamports = %d want 500000000", binary.LittleEndian.Uint64(gotInstr[4:12]))
	}

	// Total message length: 3 (header) + 1 (account_keys count) +
	// 96 (3×32) + 32 (blockhash) + 1 (instr count) + 1 (program_idx)
	// + 1 (indices count) + 2 (indices) + 1 (data len) + 12 (data)
	// = 150 bytes.
	if len(got.Message) != 150 {
		t.Errorf("Message length = %d want 150", len(got.Message))
	}
}

func TestPreSignSolana_RejectsBadSender(t *testing.T) {
	a := &Assembler{}
	prov := &fakeSolanaProvider{blockhash: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"}
	_, err := a.PreSignSolana(context.Background(), SwapIntent{
		DestinationNetwork: "SOLANA_MAINNET",
		DestinationAsset:   "SOL",
		DestinationAddress: recipientPK,
		Amount:             0.1,
		SenderAddress:      "not-base58!",
	}, prov)
	if err == nil {
		t.Fatal("expected error for invalid base58 sender")
	}
}

func TestPreSignSolana_RejectsBadRecipient(t *testing.T) {
	a := &Assembler{}
	prov := &fakeSolanaProvider{blockhash: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"}
	_, err := a.PreSignSolana(context.Background(), SwapIntent{
		DestinationNetwork: "SOLANA_MAINNET",
		DestinationAsset:   "SOL",
		DestinationAddress: "invalid",
		Amount:             0.1,
		SenderAddress:      releasePubkey,
	}, prov)
	if err == nil {
		t.Fatal("expected error for invalid base58 recipient")
	}
}

func TestPreSignSolana_RequiresProvider(t *testing.T) {
	a := &Assembler{}
	_, err := a.PreSignSolana(context.Background(), SwapIntent{
		DestinationNetwork: "SOLANA_MAINNET",
		DestinationAsset:   "SOL",
		DestinationAddress: recipientPK,
		Amount:             0.1,
		SenderAddress:      releasePubkey,
	}, nil)
	if err == nil {
		t.Fatal("expected error for nil provider")
	}
}

// =============================================================================
// FinalizeSolana
// =============================================================================

func TestFinalizeSolana_AssemblesFullTx(t *testing.T) {
	a := &Assembler{}
	prov := &fakeSolanaProvider{blockhash: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"}
	unsigned, err := a.PreSignSolana(context.Background(), SwapIntent{
		DestinationNetwork: "SOLANA_MAINNET",
		DestinationAsset:   "SOL",
		DestinationAddress: recipientPK,
		Amount:             0.001,
		SenderAddress:      releasePubkey,
	}, prov)
	if err != nil {
		t.Fatalf("PreSignSolana: %v", err)
	}

	// Build a fake 64-byte signature (real one would come from MPC).
	sig := make([]byte, 64)
	for i := range sig {
		sig[i] = byte(i ^ 0x5a)
	}

	rawTxB58, err := a.FinalizeSolana(unsigned, sig)
	if err != nil {
		t.Fatalf("FinalizeSolana: %v", err)
	}
	rawTx, err := solanarpc.DecodeBase58(rawTxB58)
	if err != nil {
		t.Fatalf("decode raw tx: %v", err)
	}

	// Layout: [compact-u16=1: 1 byte][sig: 64 bytes][message: 150]
	wantLen := 1 + 64 + len(unsigned.Message)
	if len(rawTx) != wantLen {
		t.Errorf("raw tx length = %d want %d", len(rawTx), wantLen)
	}
	if rawTx[0] != 1 {
		t.Errorf("sig count = %d want 1", rawTx[0])
	}
	if !bytesEqual(rawTx[1:65], sig) {
		t.Errorf("signature bytes mismatch")
	}
	if !bytesEqual(rawTx[65:], unsigned.Message) {
		t.Errorf("trailing message bytes mismatch")
	}
}

func TestFinalizeSolana_RejectsBadSigLength(t *testing.T) {
	a := &Assembler{}
	unsigned := &SolanaUnsigned{
		Network: "SOLANA_MAINNET",
		Message: []byte("hello"),
	}
	_, err := a.FinalizeSolana(unsigned, make([]byte, 32))
	if err == nil {
		t.Fatal("expected error for wrong-size signature")
	}
}

func TestFinalizeSolana_RejectsNilUnsigned(t *testing.T) {
	a := &Assembler{}
	_, err := a.FinalizeSolana(nil, make([]byte, 64))
	if err == nil {
		t.Fatal("expected error for nil unsigned")
	}
}

// =============================================================================
// Low-level helpers
// =============================================================================

func TestEncodeCompactU16(t *testing.T) {
	cases := []struct {
		in   int
		want []byte
	}{
		{0, []byte{0}},
		{1, []byte{1}},
		{127, []byte{127}},
		{128, []byte{0x80, 0x01}},
		{255, []byte{0xff, 0x01}},
		{0x3fff, []byte{0xff, 0x7f}},
		{0x4000, []byte{0x80, 0x80, 0x01}},
		{0xffff, []byte{0xff, 0xff, 0x03}},
	}
	for _, tc := range cases {
		got := encodeCompactU16(tc.in)
		if !bytesEqual(got, tc.want) {
			t.Errorf("encodeCompactU16(%d) = %x want %x", tc.in, got, tc.want)
		}
	}
}

func TestEncodeSystemTransfer(t *testing.T) {
	got := encodeSystemTransfer(1_500_000_000)
	if len(got) != 12 {
		t.Fatalf("length = %d want 12", len(got))
	}
	if binary.LittleEndian.Uint32(got[0:4]) != 2 {
		t.Errorf("discriminator wrong")
	}
	if binary.LittleEndian.Uint64(got[4:12]) != 1_500_000_000 {
		t.Errorf("lamports wrong")
	}
}

func TestFloatToLamports(t *testing.T) {
	cases := []struct {
		amount   float64
		decimals uint8
		want     uint64
	}{
		{1.0, 9, 1_000_000_000},
		{0.5, 9, 500_000_000},
		{0.000_000_001, 9, 1},
		{0, 9, 0},
	}
	for _, tc := range cases {
		got, err := floatToLamports(tc.amount, tc.decimals)
		if err != nil {
			t.Errorf("floatToLamports(%v, %d): %v", tc.amount, tc.decimals, err)
		}
		if got != tc.want {
			t.Errorf("floatToLamports(%v, %d) = %d want %d", tc.amount, tc.decimals, got, tc.want)
		}
	}

	if _, err := floatToLamports(-1, 9); err == nil {
		t.Error("expected error for negative amount")
	}
}

func bytesEqual(a, b []byte) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
