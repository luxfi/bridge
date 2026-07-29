package ton

import (
	"bytes"
	"crypto/ed25519"
	"testing"
	"time"

	"github.com/xssnick/tonutils-go/ton/wallet"
)

// fixedNow pins valid_until so hash-determinism tests aren't racing the
// clock across two calls a few nanoseconds apart.
func fixedNow() time.Time {
	return time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
}

func mustKey(t *testing.T) ed25519.PublicKey {
	t.Helper()
	pub, _, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatalf("generate ed25519 key: %v", err)
	}
	return pub
}

// mustRecipient derives a real, valid V4R2 address string from a throwaway
// keypair — guarantees address.ParseAddr accepts it without hand-rolling a
// TON address encoding in the test.
func mustRecipient(t *testing.T) string {
	t.Helper()
	pub, _, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatalf("generate recipient key: %v", err)
	}
	addr, err := wallet.AddressFromPubKey(pub, wallet.V4R2, wallet.DefaultSubwallet)
	if err != nil {
		t.Fatalf("derive recipient address: %v", err)
	}
	return addr.String()
}

func TestBuildUnsignedTransfer_HappyPath(t *testing.T) {
	pub := mustKey(t)
	recipient := mustRecipient(t)

	msg, err := BuildUnsignedTransfer(pub, 3, recipient, 1_000_000_000, "", true, fixedNow)
	if err != nil {
		t.Fatalf("BuildUnsignedTransfer: %v", err)
	}
	if len(msg.SigningHash) != 32 {
		t.Errorf("SigningHash length = %d, want 32", len(msg.SigningHash))
	}
	if msg.PayloadCell == nil {
		t.Error("PayloadCell is nil")
	}
	if msg.WalletAddress == nil {
		t.Error("WalletAddress is nil")
	}
	if !bytes.Equal(msg.PubKey, pub) {
		t.Error("PubKey not carried through")
	}
	if msg.Recipient != recipient {
		t.Errorf("Recipient = %q, want %q", msg.Recipient, recipient)
	}
	if msg.AmountNanoTON != 1_000_000_000 {
		t.Errorf("AmountNanoTON = %d, want 1e9", msg.AmountNanoTON)
	}
	wantValidUntil := fixedNow().Add(DefaultMessageTTL).Unix()
	if msg.ValidUntil != wantValidUntil {
		t.Errorf("ValidUntil = %d, want %d", msg.ValidUntil, wantValidUntil)
	}
}

// TestBuildUnsignedTransfer_ActiveOmitsStateInit pins the deploy-vs-already-
// deployed contract split: the first transfer from a fresh release wallet
// MUST carry StateInit so the contract deploys atomically with the send, or
// the external message has nothing to execute against. Every later
// transfer must NOT carry it — sending StateInit on an already-deployed
// contract is at best wasted bytes, and tonutils-go's ExternalMessage
// encoding treats its presence as "deploy this," which would be wrong.
func TestBuildUnsignedTransfer_ActiveOmitsStateInit(t *testing.T) {
	pub := mustKey(t)
	recipient := mustRecipient(t)

	deployed, err := BuildUnsignedTransfer(pub, 0, recipient, 1, "", true, fixedNow)
	if err != nil {
		t.Fatalf("active=true: %v", err)
	}
	if deployed.StateInit != nil {
		t.Error("active=true (contract already deployed) should omit StateInit, got non-nil")
	}

	fresh, err := BuildUnsignedTransfer(pub, 0, recipient, 1, "", false, fixedNow)
	if err != nil {
		t.Fatalf("active=false: %v", err)
	}
	if fresh.StateInit == nil {
		t.Error("active=false (undeployed contract) should attach StateInit, got nil")
	}
}

func TestBuildUnsignedTransfer_RejectsBadPubKeyLength(t *testing.T) {
	_, err := BuildUnsignedTransfer(make([]byte, 16), 0, mustRecipient(t), 1, "", true, fixedNow)
	if err == nil {
		t.Fatal("expected error for short pubkey, got nil")
	}
}

func TestBuildUnsignedTransfer_RejectsZeroAmount(t *testing.T) {
	_, err := BuildUnsignedTransfer(mustKey(t), 0, mustRecipient(t), 0, "", true, fixedNow)
	if err == nil {
		t.Fatal("expected error for zero amount, got nil")
	}
}

func TestBuildUnsignedTransfer_RejectsUnparseableRecipient(t *testing.T) {
	_, err := BuildUnsignedTransfer(mustKey(t), 0, "not-a-ton-address", 1, "", true, fixedNow)
	if err == nil {
		t.Fatal("expected error for unparseable recipient, got nil")
	}
}

// TestBuildUnsignedTransfer_NilNowFnDefaultsToTimeNow confirms the nil
// convenience path documented on BuildUnsignedTransfer doesn't panic and
// produces a ValidUntil in the future.
func TestBuildUnsignedTransfer_NilNowFnDefaultsToTimeNow(t *testing.T) {
	before := time.Now().Unix()
	msg, err := BuildUnsignedTransfer(mustKey(t), 0, mustRecipient(t), 1, "", true, nil)
	if err != nil {
		t.Fatalf("BuildUnsignedTransfer with nil nowFn: %v", err)
	}
	if msg.ValidUntil <= before {
		t.Errorf("ValidUntil = %d, want > %d (before call)", msg.ValidUntil, before)
	}
}

// TestBuildUnsignedTransfer_SigningHashDeterministic pins that identical
// inputs (including the clock) produce byte-identical hashes — the MPC
// cluster signs this hash, so any nondeterminism here would make the
// signature-verification step in FinalizeSignedExternalMessage flaky.
func TestBuildUnsignedTransfer_SigningHashDeterministic(t *testing.T) {
	pub := mustKey(t)
	recipient := mustRecipient(t)

	a, err := BuildUnsignedTransfer(pub, 5, recipient, 42, "hello", true, fixedNow)
	if err != nil {
		t.Fatalf("first build: %v", err)
	}
	b, err := BuildUnsignedTransfer(pub, 5, recipient, 42, "hello", true, fixedNow)
	if err != nil {
		t.Fatalf("second build: %v", err)
	}
	if !bytes.Equal(a.SigningHash, b.SigningHash) {
		t.Error("SigningHash differs across two calls with identical inputs")
	}
}

// TestBuildUnsignedTransfer_SeqnoChangesHash guards against a
// same-millisecond-keygen-style bug for the release-wallet family: two
// transfers built at different seqnos MUST produce different signing
// hashes, or a stale-seqno replay could slip through unnoticed.
func TestBuildUnsignedTransfer_SeqnoChangesHash(t *testing.T) {
	pub := mustKey(t)
	recipient := mustRecipient(t)

	a, err := BuildUnsignedTransfer(pub, 1, recipient, 42, "", true, fixedNow)
	if err != nil {
		t.Fatalf("seqno=1: %v", err)
	}
	b, err := BuildUnsignedTransfer(pub, 2, recipient, 42, "", true, fixedNow)
	if err != nil {
		t.Fatalf("seqno=2: %v", err)
	}
	if bytes.Equal(a.SigningHash, b.SigningHash) {
		t.Error("different seqnos produced the same SigningHash")
	}
}

func TestBuildUnsignedTransfer_CommentChangesHash(t *testing.T) {
	pub := mustKey(t)
	recipient := mustRecipient(t)

	plain, err := BuildUnsignedTransfer(pub, 0, recipient, 42, "", true, fixedNow)
	if err != nil {
		t.Fatalf("no comment: %v", err)
	}
	withComment, err := BuildUnsignedTransfer(pub, 0, recipient, 42, "swap_abc123", true, fixedNow)
	if err != nil {
		t.Fatalf("with comment: %v", err)
	}
	if bytes.Equal(plain.SigningHash, withComment.SigningHash) {
		t.Error("adding a comment did not change SigningHash")
	}
}

func signMessage(t *testing.T, priv ed25519.PrivateKey, msg *UnsignedMessage) []byte {
	t.Helper()
	return ed25519.Sign(priv, msg.SigningHash)
}

func TestFinalizeSignedExternalMessage_HappyPath(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	msg, err := BuildUnsignedTransfer(pub, 0, mustRecipient(t), 1_000_000, "", true, fixedNow)
	if err != nil {
		t.Fatalf("BuildUnsignedTransfer: %v", err)
	}
	sig := signMessage(t, priv, msg)

	boc, err := FinalizeSignedExternalMessage(msg, sig)
	if err != nil {
		t.Fatalf("FinalizeSignedExternalMessage: %v", err)
	}
	if len(boc) == 0 {
		t.Error("expected non-empty BoC")
	}
}

func TestFinalizeSignedExternalMessage_RejectsWrongLengthSignature(t *testing.T) {
	pub := mustKey(t)
	msg, err := BuildUnsignedTransfer(pub, 0, mustRecipient(t), 1, "", true, fixedNow)
	if err != nil {
		t.Fatalf("BuildUnsignedTransfer: %v", err)
	}
	_, err = FinalizeSignedExternalMessage(msg, make([]byte, 63))
	if err == nil {
		t.Fatal("expected error for a 63-byte signature, got nil")
	}
}

// TestFinalizeSignedExternalMessage_RejectsSignatureFromWrongKey is the
// important one: this is the check that stands between a malformed /
// mismatched MPC response and a doomed (or, worse, forged-looking)
// transaction reaching toncenter. A signature that's structurally valid
// (right length) but doesn't verify against this wallet's pubkey + hash
// must be rejected before broadcast, not after.
func TestFinalizeSignedExternalMessage_RejectsSignatureFromWrongKey(t *testing.T) {
	pub, _, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatalf("generate wallet key: %v", err)
	}
	_, otherPriv, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatalf("generate other key: %v", err)
	}
	msg, err := BuildUnsignedTransfer(pub, 0, mustRecipient(t), 1, "", true, fixedNow)
	if err != nil {
		t.Fatalf("BuildUnsignedTransfer: %v", err)
	}
	// Sign with a DIFFERENT private key than the one whose pubkey the
	// message was built for.
	wrongSig := ed25519.Sign(otherPriv, msg.SigningHash)

	_, err = FinalizeSignedExternalMessage(msg, wrongSig)
	if err == nil {
		t.Fatal("expected signature-verification error, got nil")
	}
}

func TestFinalizeSignedExternalMessage_RejectsNilMessage(t *testing.T) {
	_, err := FinalizeSignedExternalMessage(nil, make([]byte, ed25519.SignatureSize))
	if err == nil {
		t.Fatal("expected error for nil UnsignedMessage, got nil")
	}
}

func TestFinalizeSignedExternalMessage_CarriesStateInitForFreshWallet(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	msg, err := BuildUnsignedTransfer(pub, 0, mustRecipient(t), 1, "", false /* fresh */, fixedNow)
	if err != nil {
		t.Fatalf("BuildUnsignedTransfer: %v", err)
	}
	if msg.StateInit == nil {
		t.Fatal("expected StateInit on a fresh-wallet message")
	}
	sig := signMessage(t, priv, msg)
	boc, err := FinalizeSignedExternalMessage(msg, sig)
	if err != nil {
		t.Fatalf("FinalizeSignedExternalMessage: %v", err)
	}
	if len(boc) == 0 {
		t.Error("expected non-empty BoC for a fresh-wallet deploy+transfer")
	}
}
