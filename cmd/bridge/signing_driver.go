package main

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	luxlog "github.com/luxfi/log"

	"github.com/luxfi/bridge/internal/cosigners"
	"github.com/luxfi/bridge/internal/mchain"
	"github.com/luxfi/bridge/internal/txassembler"
)

// signing_driver.go: background goroutine that drives the MPC signing
// ceremony for swaps that have transitioned to bridge_transfer_pending.
//
// Pipeline position (relative to the other watchers):
//
//   user_deposit_pending      ── DepositWatcher (Phase 4.5) ──┐
//                                                              ▼
//   bridge_transfer_pending   ── SigningDriver (this file) ───┐
//                                                              ▼
//   bridge_transfer_pending_signing                             │
//                              (ceremony in progress)           ▼
//   bridge_transfer_pending_broadcasting                       ─┘
//                              (signature stored; ready for Phase 4.7)
//
// State transitions and idempotency:
//   - On tick start, lists swaps in SwapStatusBridgeTransferPending.
//   - For each, patches to SwapStatusSigning to claim it (so a
//     restart-mid-ceremony doesn't double-fire).
//   - With an Assembler attached (the production path; see main.go),
//     calls Assembler.PreSign to build the destination-chain EIP-155
//     sighash, hands it to mchain.SignForWallet, then calls
//     Assembler.Finalize to produce the wire-ready signed raw tx
//     stored on Swap.DestRawTx. Without one, falls back to a synthetic
//     digest — useful for tests but the resulting signature can't be
//     broadcast.
//   - On success: patches to SwapStatusBroadcasting + records
//     Signature + MPCSessionID (+ DestRawTx when assembled).
//   - On failure: patches BACK to bridge_transfer_pending so the next
//     tick retries (with exponential backoff in future work).
//
// Trust model + scope:
//   - The MPC cluster is the threshold-signing authority. This driver
//     is a thin orchestrator; it does not hold any key material.
//   - As of 2026-05 the live lux-mpc cluster (mpcd) doesn't expose a
//     /sign REST endpoint — only /keygen. SignForWallet targets the
//     expected REST shape; live validation is gated on the cluster
//     growing that endpoint or the operator pointing --mpc-url at a
//     proxy that bridges to the dashboard /v1/mpc/wallets/{id}/sessions
//     path (which IS implemented but requires JWT auth).

// MPCSigner is the 1-method interface the driver consumes. Pulls the
// dependency to an interface for testability (a fake satisfies it
// without spinning up HTTP). *mchain.Client satisfies natively.
type MPCSigner interface {
	SignForWallet(ctx context.Context, walletID, messageHex string) (*mchain.SignResult, error)
}

// SigningDriver polls bridge_transfer_pending swaps and drives them
// through the MPC signing ceremony. Concurrency-safe.
type SigningDriver struct {
	store    SwapStore
	signer   MPCSigner
	interval time.Duration
	logger   luxlog.Logger

	// Assembler, when set, replaces the placeholder buildSigningMessage
	// with a real destination-chain tx digest (EVM EIP-155 sighash or
	// Solana legacy-message bytes) and finalizes the signed raw tx
	// into Swap.DestRawTx after the MPC produces a signature.
	// When nil, the driver falls back to placeholder mode (signature
	// stored but no raw tx assembled — broadcaster will skip).
	assembler *txassembler.Assembler

	// solanaProvider supplies the recent blockhash for Solana
	// destination releases. Required when ANY swap targets a
	// SOLANA_* network; ignored for pure EVM workloads. Implemented
	// by *solanarpc.Client in production; tests inject a stub that
	// returns a deterministic blockhash. Nil + Solana destination
	// triggers a PreSign error that the rollback path catches.
	solanaProvider txassembler.SolanaProvider

	// tonProvider supplies the TON wallet contract state (seqno +
	// active) and broadcasts the signed BoC. Required when ANY swap
	// targets a TON_* network; ignored otherwise. Implemented by
	// *ton.TonCenterProvider in production. Nil + TON destination
	// triggers a PreSign error that the rollback path catches.
	tonProvider txassembler.TONProvider

	// perSignTimeout caps each individual SignForWallet call.
	// 75 s default covers the cluster-side 60 s ceremony timeout plus
	// headroom — matches the mchain client's keygen timeout.
	perSignTimeout time.Duration

	// maxQuoteAge caps the elapsed time between Swap.CreatedAt and the
	// signing moment. When > 0, swaps older than this are transitioned to
	// SwapStatusRefundPending instead of signed — the refund driver then
	// returns the user's source-chain deposit. Zero ⇒ disabled (legacy
	// behavior: sign at the create-time rate no matter how stale).
	maxQuoteAge time.Duration

	// cosignerDispatcher, when set, gates the broadcast-advancement on
	// layered-cosigner approval. After the native MPC quorum signs, the
	// driver dispatches each intent declared on Swap.Cosigners; only
	// when every result is StatusApproved does the swap advance to
	// SwapStatusBroadcasting. Any non-approved result (rejection,
	// transport failure, KMS miss, "not implemented" stub) transitions
	// the swap to SwapStatusRefundPending so the refund driver sweeps
	// the user's deposit back. Nil → cosigner gate disabled; swaps
	// with Cosigners populated still advance to broadcasting (legacy
	// behavior, used during the §13.6 cutover when Express is the
	// authoritative cosigner path).
	cosignerDispatcher cosigners.Dispatcher

	// maxSigningAttempts caps consecutive signing-driver failures per
	// swap. When >0 and a swap's SigningAttempts reaches this value
	// after a PreSign / MPC sign failure, the rollback path moves the
	// swap to SwapStatusRefundPending so the refund driver can return
	// the deposit. Catches persistent destination-RPC outages and
	// the empirical "destination chain has no tx assembler" case
	// (LUX → BITCOIN_TESTNET etc — txassembler is EVM-only today, so
	// a non-EVM destination would loop signing forever otherwise).
	// Zero ⇒ unbounded (legacy "retry forever").
	maxSigningAttempts int

	running atomic.Bool

	ticks       atomic.Uint64
	attempts    atomic.Uint64
	successes   atomic.Uint64
	failures    atomic.Uint64
	listErrors  atomic.Uint64
	stale       atomic.Uint64

	stopOnce      sync.Once
	cancelRunning context.CancelFunc
}

// SetAssembler attaches a tx assembler to the driver. When set, the
// signing driver will use real destination-chain sighashes (EVM
// EIP-155 or Solana legacy-message bytes) and finalize a wire-ready
// raw tx into Swap.DestRawTx. Optional — leaving it nil retains the
// v1 placeholder behavior.
func (d *SigningDriver) SetAssembler(asm *txassembler.Assembler) { d.assembler = asm }

// SetSolanaProvider attaches the blockhash provider used when a swap
// targets a SOLANA_* destination. Required for Lux→Sol (and any
// other family→Sol) releases. EVM-only deployments can leave this
// nil and the signing driver behaves identically to the pre-Solana
// version.
func (d *SigningDriver) SetSolanaProvider(p txassembler.SolanaProvider) { d.solanaProvider = p }

// SetTONProvider attaches the toncenter provider used when a swap
// targets a TON_* destination. Required for X→TON releases; ignored
// otherwise. EVM-only / SOL-only deployments can leave this nil and
// the signing driver behaves identically to the pre-TON version.
func (d *SigningDriver) SetTONProvider(p txassembler.TONProvider) { d.tonProvider = p }

// SetMaxQuoteAge configures the staleness guard. Swaps older than this
// at signing time are kicked to SwapStatusRefundPending instead of
// signed. Zero disables the guard (legacy behavior). Use a value
// matched to your destination asset's volatility — 5–15 min for ETH /
// BTC pairs, 30+ min for stable-coin pairs.
func (d *SigningDriver) SetMaxQuoteAge(age time.Duration) { d.maxQuoteAge = age }

// SetCosignerDispatcher attaches a layered-cosigner dispatcher. When
// set, every swap with a non-empty Swap.Cosigners list has its
// declared external custodians (Utila / Fireblocks) consulted AFTER
// the native MPC sign and BEFORE the swap advances to broadcasting.
// "All listed must approve" — any non-approved result moves the swap
// to SwapStatusRefundPending. Nil ⇒ the cosigner gate is bypassed and
// swaps advance to broadcasting on native sign alone (the legacy
// behavior; useful during the §13.6 cutover soak when app/server is
// still the authoritative cosigner path).
func (d *SigningDriver) SetCosignerDispatcher(disp cosigners.Dispatcher) {
	d.cosignerDispatcher = disp
}

// SetMaxSigningAttempts configures the persistent-failure ceiling.
// After this many consecutive PreSign / MPC sign failures, the swap
// moves to SwapStatusRefundPending so the refund driver can return
// the deposit. Zero disables the ceiling (legacy "retry forever").
// Defaults to DefaultMaxSigningAttempts when not set.
func (d *SigningDriver) SetMaxSigningAttempts(n int) {
	if n < 0 {
		n = 0
	}
	d.maxSigningAttempts = n
}

// DefaultMaxSigningAttempts is the post-rollback ceiling that routes
// a stuck swap to SwapStatusRefundPending. 10 attempts × ~10 s sign
// interval ≈ ~100 s of tolerance against transient destination-RPC
// outages, which is enough headroom for typical RPC flaps. A
// terminal failure (destination chain has no tx assembler) trips
// faster — every tick reliably hits the same error.
const DefaultMaxSigningAttempts = 10

// DefaultSigningInterval is the production-suitable tick cadence for
// the signing driver. Faster than the deposit watcher because once a
// swap reaches bridge_transfer_pending the user is actively waiting
// for completion.
const DefaultSigningInterval = 10 * time.Second

// DefaultPerSignTimeout caps each SignForWallet call.
const DefaultPerSignTimeout = 75 * time.Second

// NewSigningDriver builds a driver with sensible defaults.
func NewSigningDriver(store SwapStore, signer MPCSigner, interval time.Duration, logger luxlog.Logger) *SigningDriver {
	if interval <= 0 {
		interval = DefaultSigningInterval
	}
	return &SigningDriver{
		store:              store,
		signer:             signer,
		interval:           interval,
		logger:             logger,
		perSignTimeout:     DefaultPerSignTimeout,
		maxSigningAttempts: DefaultMaxSigningAttempts,
	}
}

// Running reports whether the driver loop is active.
func (d *SigningDriver) Running() bool { return d.running.Load() }

// SigningDriverStats is a point-in-time view of the driver's counters.
type SigningDriverStats struct {
	Ticks      uint64 `json:"ticks"`
	Attempts   uint64 `json:"attempts"`
	Successes  uint64 `json:"successes"`
	Failures   uint64 `json:"failures"`
	ListErrors uint64 `json:"list_errors"`
	Stale      uint64 `json:"stale"`
}

// Stats snapshots the counters. Safe for concurrent reads.
func (d *SigningDriver) Stats() SigningDriverStats {
	return SigningDriverStats{
		Ticks:      d.ticks.Load(),
		Attempts:   d.attempts.Load(),
		Successes:  d.successes.Load(),
		Failures:   d.failures.Load(),
		ListErrors: d.listErrors.Load(),
		Stale:      d.stale.Load(),
	}
}

// Run blocks until ctx is cancelled.
func (d *SigningDriver) Run(ctx context.Context) error {
	if !d.running.CompareAndSwap(false, true) {
		return nil
	}
	defer d.running.Store(false)

	ctx, cancel := context.WithCancel(ctx)
	d.cancelRunning = cancel
	defer cancel()

	if d.logger != nil {
		d.logger.Info("signing driver started",
			"interval", d.interval,
			"per_sign_timeout", d.perSignTimeout,
		)
	}

	d.tick(ctx) // immediate first tick
	ticker := time.NewTicker(d.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			if d.logger != nil {
				d.logger.Info("signing driver stopped",
					"reason", ctx.Err(),
					"stats", d.Stats(),
				)
			}
			return ctx.Err()
		case <-ticker.C:
			d.tick(ctx)
		}
	}
}

// Stop signals shutdown. Idempotent.
func (d *SigningDriver) Stop() {
	d.stopOnce.Do(func() {
		if d.cancelRunning != nil {
			d.cancelRunning()
		}
	})
}

// Tick runs a single iteration. Exported for tests.
func (d *SigningDriver) Tick(ctx context.Context) { d.tick(ctx) }

func (d *SigningDriver) tick(ctx context.Context) {
	d.ticks.Add(1)
	swaps, err := d.store.List(ctx, SwapFilter{Status: SwapStatusBridgeTransferPending})
	if err != nil {
		d.listErrors.Add(1)
		if d.logger != nil {
			d.logger.Warn("signing driver: list bridge_transfer_pending swaps", "err", err)
		}
		return
	}
	if len(swaps) == 0 {
		return
	}
	if d.logger != nil {
		d.logger.Debug("signing driver tick", "pending_sign", len(swaps))
	}
	for _, sw := range swaps {
		if ctx.Err() != nil {
			return
		}
		d.signOne(ctx, sw)
	}
}

// signOne drives one swap through the ceremony. Marks it as
// SwapStatusSigning before the request fires so a restart can detect
// "in-flight" state separately from "ready to sign."
func (d *SigningDriver) signOne(ctx context.Context, sw *Swap) {
	walletID, senderAddr := resolveReleaseSigning(sw)
	if walletID == "" {
		// Swap was created without a minted MPC wallet (likely
		// use_deposit_address=false). The signing flow doesn't apply
		// — that swap must complete via a different mechanism. Skip
		// silently.
		return
	}

	// Quote staleness guard. If the create-time quote is older than
	// MaxQuoteAge, the locked rate may have drifted enough that paying
	// out at that rate is operator-unfavorable (or user-unfavorable).
	// Refuse to sign and hand off to the refund driver instead.
	//
	// Order matters: this runs BEFORE the claim transition so a stale
	// swap never enters SwapStatusSigning — the refund driver picks it
	// up from SwapStatusRefundPending cleanly.
	if d.maxQuoteAge > 0 && !sw.CreatedAt.IsZero() && time.Since(sw.CreatedAt) > d.maxQuoteAge {
		age := time.Since(sw.CreatedAt).Round(time.Second)
		now := time.Now().UTC()
		claimed, err := d.store.Patch(ctx, sw.ID, func(s *Swap) {
			if s.Status != SwapStatusBridgeTransferPending {
				return
			}
			s.Status = SwapStatusRefundPending
			s.LastError = fmt.Sprintf("quote_stale: created %s ago, max age %s", age, d.maxQuoteAge)
			s.LastErrorAt = now
		})
		if err != nil || claimed == nil || claimed.Status != SwapStatusRefundPending {
			// Race with another transition (deposit re-confirmed, etc.)
			// — leave it alone for the next tick.
			return
		}
		d.stale.Add(1)
		if d.logger != nil {
			d.logger.Info("quote stale — handing off to refund driver",
				"swap_id", sw.ID,
				"age", age,
				"max_age", d.maxQuoteAge,
			)
		}
		return
	}

	d.attempts.Add(1)

	// Claim the swap by transitioning to "signing in progress" before
	// the (slow) ceremony call. A second driver instance polling at
	// the same moment will not see this swap in bridge_transfer_pending
	// anymore and will skip it.
	claimed, err := d.store.Patch(ctx, sw.ID, func(s *Swap) {
		if s.Status != SwapStatusBridgeTransferPending {
			return
		}
		s.Status = SwapStatusSigning
	})
	if err != nil || claimed == nil || claimed.Status != SwapStatusSigning {
		// Race with another driver / state already advanced — let it go.
		return
	}

	// Compute the signing message. With an assembler attached, this is
	// the actual destination-chain tx digest:
	//   - EVM destinations: EIP-155 sighash (32 bytes).
	//   - Solana destinations: serialized legacy message bytes (the
	//     full transaction message, NOT hashed — ed25519 hashes
	//     internally as part of its signing algorithm).
	// Without an assembler, fall back to the placeholder synthetic
	// digest — useful for early integration testing but the resulting
	// signature can't be broadcast as a real tx.
	var (
		msgHex      string
		unsignedEVM *txassembler.Unsigned       // populated for EVM destinations
		unsignedSol *txassembler.SolanaUnsigned // populated for Solana destinations
		unsignedTON *txassembler.TONUnsigned    // populated for TON destinations
	)
	if d.assembler != nil && senderAddr != "" {
		family := mchain.AddressTypeFor(sw.DestinationNetwork)
		switch family {
		case mchain.AddressTypeETH:
			u, aerr := d.assembler.PreSign(ctx, txassembler.SwapIntent{
				DestinationNetwork: sw.DestinationNetwork,
				DestinationAddress: sw.DestinationAddress,
				Amount:             releaseAmount(sw),
				SenderAddress:      senderAddr,
			})
			if aerr != nil {
				d.failures.Add(1)
				if d.logger != nil {
					d.logger.Warn("tx assembler PreSign failed",
						"swap_id", sw.ID,
						"err", aerr,
					)
				}
				d.rollbackOrFail(ctx, sw.ID, aerr,
					"Destination RPC unreachable while building tx — retrying",
					"PreSign")
				return
			}
			unsignedEVM = u
			msgHex = "0x" + hex.EncodeToString(u.SigHash[:])
		case mchain.AddressTypeSOL:
			if d.solanaProvider == nil {
				err := fmt.Errorf("solanaProvider not configured for %s", sw.DestinationNetwork)
				d.failures.Add(1)
				if d.logger != nil {
					d.logger.Warn("Solana provider missing", "swap_id", sw.ID, "err", err)
				}
				d.rollbackOrFail(ctx, sw.ID, err,
					"Solana provider not configured — retrying",
					"PreSignSolana")
				return
			}
			u, aerr := d.assembler.PreSignSolana(ctx, txassembler.SwapIntent{
				DestinationNetwork: sw.DestinationNetwork,
				DestinationAsset:   sw.DestinationAsset,
				DestinationAddress: sw.DestinationAddress,
				Amount:             releaseAmount(sw),
				SenderAddress:      senderAddr,
			}, d.solanaProvider)
			if aerr != nil {
				d.failures.Add(1)
				if d.logger != nil {
					d.logger.Warn("tx assembler PreSignSolana failed",
						"swap_id", sw.ID,
						"err", aerr,
					)
				}
				d.rollbackOrFail(ctx, sw.ID, aerr,
					"Solana RPC unreachable while building tx — retrying",
					"PreSignSolana")
				return
			}
			unsignedSol = u
			// Pass the message bytes verbatim — no 0x prefix, no
			// SHA-256 wrapper. The cluster's ed25519 signer must
			// hash internally per the curve spec.
			msgHex = hex.EncodeToString(u.Message)
		case mchain.AddressTypeTON:
			if d.tonProvider == nil {
				err := fmt.Errorf("tonProvider not configured for %s", sw.DestinationNetwork)
				d.failures.Add(1)
				if d.logger != nil {
					d.logger.Warn("TON provider missing", "swap_id", sw.ID, "err", err)
				}
				d.rollbackOrFail(ctx, sw.ID, err,
					"TON provider not configured — retrying",
					"PreSignTON")
				return
			}
			if sw.ReleasePubKey == "" {
				err := fmt.Errorf("swap %s lacks ReleasePubKey (release wallet keygen predates TON support)", sw.ID)
				d.failures.Add(1)
				if d.logger != nil {
					d.logger.Warn("TON release pubkey missing — re-mint required",
						"swap_id", sw.ID, "release_wallet_id", sw.ReleaseWalletID)
				}
				d.rollbackOrFail(ctx, sw.ID, err,
					"TON release wallet predates pubkey capture — delete release-wallets.json TON entry to re-mint",
					"PreSignTON")
				return
			}
			u, aerr := d.assembler.PreSignTON(ctx, txassembler.SwapIntent{
				DestinationNetwork: sw.DestinationNetwork,
				DestinationAsset:   sw.DestinationAsset,
				DestinationAddress: sw.DestinationAddress,
				Amount:             releaseAmount(sw),
				SenderAddress:      senderAddr,
			}, d.tonProvider, sw.ReleasePubKey)
			if aerr != nil {
				d.failures.Add(1)
				if d.logger != nil {
					d.logger.Warn("tx assembler PreSignTON failed",
						"swap_id", sw.ID,
						"err", aerr,
					)
				}
				d.rollbackOrFail(ctx, sw.ID, aerr,
					"TON RPC unreachable while building tx — retrying",
					"PreSignTON")
				return
			}
			unsignedTON = u
			msgHex = hex.EncodeToString(u.SigningHash)
		default:
			err := fmt.Errorf("tx assembly not implemented for %s family (network %s)",
				family, sw.DestinationNetwork)
			d.failures.Add(1)
			if d.logger != nil {
				d.logger.Warn("destination family unsupported", "swap_id", sw.ID, "err", err)
			}
			d.rollbackOrFail(ctx, sw.ID, err,
				"Destination chain family not implemented",
				"family dispatch")
			return
		}
	} else {
		msgHex = buildSigningMessage(sw)
	}

	sigCtx, cancel := context.WithTimeout(ctx, d.perSignTimeout)
	defer cancel()

	res, err := d.signer.SignForWallet(sigCtx, walletID, msgHex)
	if err != nil {
		d.failures.Add(1)
		if d.logger != nil {
			d.logger.Warn("signing ceremony failed",
				"swap_id", sw.ID,
				"wallet_id", walletID,
				"err", err,
			)
		}
		d.rollbackOrFail(ctx, sw.ID, err,
			"MPC signing ceremony failed — retrying",
			"MPC sign")
		return
	}

	// When the assembler was used, finalize the signed raw tx so the
	// broadcaster has something wire-ready to push. Branch on whichever
	// of the two unsigned* variables PreSign populated:
	//   - unsignedEVM ⇒ ParseRSV the EVM r||s||v, run EVM Finalize.
	//   - unsignedSol ⇒ hex-decode the 64-byte ed25519 sig, run FinalizeSolana.
	var destRawTx string
	switch {
	case unsignedEVM != nil:
		r, s, v, perr := txassembler.ParseRSV(res.Signature)
		if perr != nil {
			d.failures.Add(1)
			if d.logger != nil {
				d.logger.Warn("parse MPC signature failed",
					"swap_id", sw.ID,
					"err", perr,
				)
			}
			_, _ = d.store.Patch(ctx, sw.ID, func(swp *Swap) {
				if swp.Status == SwapStatusSigning {
					swp.Status = SwapStatusBridgeTransferPending
				}
			})
			return
		}
		rawTx, ferr := d.assembler.Finalize(unsignedEVM, r, s, v)
		if ferr != nil {
			d.failures.Add(1)
			if d.logger != nil {
				d.logger.Warn("tx assembler Finalize failed",
					"swap_id", sw.ID,
					"err", ferr,
				)
			}
			_, _ = d.store.Patch(ctx, sw.ID, func(swp *Swap) {
				if swp.Status == SwapStatusSigning {
					swp.Status = SwapStatusBridgeTransferPending
				}
			})
			return
		}
		destRawTx = rawTx

	case unsignedSol != nil:
		// MPC cluster returns the ed25519 sig as hex (with or
		// without "0x"). Strip the optional prefix and decode.
		sigHex := res.Signature
		if len(sigHex) >= 2 && (sigHex[:2] == "0x" || sigHex[:2] == "0X") {
			sigHex = sigHex[2:]
		}
		sigBytes, derr := hex.DecodeString(sigHex)
		if derr != nil {
			d.failures.Add(1)
			if d.logger != nil {
				d.logger.Warn("decode ed25519 signature failed",
					"swap_id", sw.ID,
					"err", derr,
				)
			}
			_, _ = d.store.Patch(ctx, sw.ID, func(swp *Swap) {
				if swp.Status == SwapStatusSigning {
					swp.Status = SwapStatusBridgeTransferPending
				}
			})
			return
		}
		rawTx, ferr := d.assembler.FinalizeSolana(unsignedSol, sigBytes)
		if ferr != nil {
			d.failures.Add(1)
			if d.logger != nil {
				d.logger.Warn("tx assembler FinalizeSolana failed",
					"swap_id", sw.ID,
					"err", ferr,
				)
			}
			_, _ = d.store.Patch(ctx, sw.ID, func(swp *Swap) {
				if swp.Status == SwapStatusSigning {
					swp.Status = SwapStatusBridgeTransferPending
				}
			})
			return
		}
		destRawTx = rawTx

	case unsignedTON != nil:
		// MPC cluster returns the ed25519 sig as hex (with or
		// without "0x"). Same convention as Solana — share the
		// strip-and-decode logic.
		sigHex := res.Signature
		if len(sigHex) >= 2 && (sigHex[:2] == "0x" || sigHex[:2] == "0X") {
			sigHex = sigHex[2:]
		}
		sigBytes, derr := hex.DecodeString(sigHex)
		if derr != nil {
			d.failures.Add(1)
			if d.logger != nil {
				d.logger.Warn("decode ed25519 signature failed",
					"swap_id", sw.ID,
					"err", derr,
				)
			}
			_, _ = d.store.Patch(ctx, sw.ID, func(swp *Swap) {
				if swp.Status == SwapStatusSigning {
					swp.Status = SwapStatusBridgeTransferPending
				}
			})
			return
		}
		boc, ferr := d.assembler.FinalizeTON(unsignedTON, sigBytes)
		if ferr != nil {
			d.failures.Add(1)
			if d.logger != nil {
				d.logger.Warn("tx assembler FinalizeTON failed",
					"swap_id", sw.ID,
					"err", ferr,
				)
			}
			_, _ = d.store.Patch(ctx, sw.ID, func(swp *Swap) {
				if swp.Status == SwapStatusSigning {
					swp.Status = SwapStatusBridgeTransferPending
				}
			})
			return
		}
		// Encode the BoC as base64 for the destRawTx string field.
		// The broadcast client base64-decodes it back to bytes before
		// POSTing to toncenter's sendBoc. Base64 is the natural wire
		// format for TON (matches what tonkeeper / toncenter expect).
		destRawTx = base64.StdEncoding.EncodeToString(boc)
	}

	// Layered-cosigner gate. If the SDK declared external cosigners
	// (Utila / Fireblocks) on this swap, dispatch them now — between
	// the native MPC sign and the broadcast advancement. Bridge policy
	// is "all listed must approve"; any non-approved result (rejection,
	// transport failure, KMS miss, stub-not-implemented) moves the
	// swap to SwapStatusRefundPending so the refund driver returns the
	// deposit. When d.cosignerDispatcher is nil OR sw.Cosigners is
	// empty, this block is a no-op and the legacy "advance to
	// broadcasting on native sign alone" behaviour applies.
	if d.cosignerDispatcher != nil && len(sw.Cosigners) > 0 {
		results, derr := d.cosignerDispatcher.Dispatch(ctx, cosigners.DispatchOptions{
			SwapID:          sw.ID,
			NativeSignature: res.Signature,
			TxHash:          destRawTx,
			Cosigners:       sw.Cosigners,
		})
		if derr != nil {
			// Dispatcher-level misconfiguration (e.g. empty SwapID
			// guard). The bug is on our side, not the swap's — log
			// and bail without transitioning. Next tick will retry,
			// giving the operator a chance to fix config.
			d.failures.Add(1)
			if d.logger != nil {
				d.logger.Error("cosigner dispatcher error",
					"swap_id", sw.ID, "err", derr,
				)
			}
			return
		}
		// Always persist results for audit, even on approval.
		_, _ = d.store.Patch(ctx, sw.ID, func(s *Swap) {
			if s.Status == SwapStatusSigning {
				s.CosignerResults = results
			}
		})
		if !cosigners.AllApproved(results) {
			firstFail := cosigners.FirstNonApproved(results)
			d.failures.Add(1)
			if d.logger != nil {
				d.logger.Warn("cosigner denied — refund",
					"swap_id", sw.ID,
					"kind", string(firstFail.Intent.Kind),
					"status", string(firstFail.Status),
					"reason", firstFail.Reason,
					"external_id", firstFail.ExternalID,
				)
			}
			_, _ = d.store.Patch(ctx, sw.ID, func(s *Swap) {
				if s.Status != SwapStatusSigning {
					return
				}
				s.Status = SwapStatusRefundPending
				s.LastError = fmt.Sprintf("cosigner %s %s: %s",
					firstFail.Intent.Kind, firstFail.Status, firstFail.Reason)
				s.LastErrorAt = time.Now().UTC()
			})
			return
		}
		// All approved — fall through to the broadcast-advance Patch
		// below as usual.
	}

	// Record signature + raw tx (if any) + advance to broadcasting.
	_, err = d.store.Patch(ctx, sw.ID, func(s *Swap) {
		if s.Status != SwapStatusSigning {
			return
		}
		s.Signature = res.Signature
		s.MPCSessionID = res.SessionID
		if destRawTx != "" {
			s.DestRawTx = destRawTx
		}
		s.Status = SwapStatusBroadcasting
		// Clear any prior transient error — we're past the signing
		// stage. The broadcast driver will set a fresh LastError if
		// the destination chain rejects the raw tx.
		s.LastError = ""
		s.LastErrorAt = time.Time{}
		// Reset the persistent-failure counter on success so a later
		// re-entry (which the bridge state machine doesn't currently
		// produce, but is defensively cheap) starts from zero.
		s.SigningAttempts = 0
	})
	if err != nil {
		if d.logger != nil {
			d.logger.Warn("persist signature",
				"swap_id", sw.ID,
				"err", err,
			)
		}
		d.failures.Add(1)
		return
	}
	d.successes.Add(1)
	if d.logger != nil {
		d.logger.Info("signature received → advanced to broadcasting",
			"swap_id", sw.ID,
			"wallet_id", walletID,
			"session_id", res.SessionID,
			"raw_tx_assembled", destRawTx != "",
		)
	}
}

// resolveReleaseSigning picks the MPC wallet that signs (and pays for)
// the destination-chain release tx. Prefers the long-lived per-network
// ReleaseWalletID/Address stored on the swap (added 2026-05 with the
// release-wallet split). Falls back to the per-swap deposit wallet for
// swaps created before the split landed AND for bridges running
// without --release-wallets-file. Fallback swaps will broadcast-fail
// with "insufficient funds in release address" unless the operator
// pre-funded the per-swap address — that's the bug the release wallet
// fixes, and the fallback only exists so legacy in-flight swaps don't
// stall the driver loop.
func resolveReleaseSigning(sw *Swap) (walletID, address string) {
	if sw.ReleaseWalletID != "" && sw.ReleaseAddress != "" {
		return sw.ReleaseWalletID, sw.ReleaseAddress
	}
	return extractWalletID(sw.DepositAddress), extractDepositAddress(sw.DepositAddress)
}

// releaseAmount picks the destination-asset amount the release tx
// should carry. Prefers the quote-snapshot ReceiveAmount (added
// 2026-05 alongside the release-wallet split — see swap_store.go
// docs) which is what the user was promised at swap-create time.
// Falls back to the raw input amount only when ReceiveAmount is zero
// — i.e. legacy swap rows created before the snapshot was wired, or
// swaps created against a bridge running without a quote engine.
//
// The fallback is a safety net for in-flight legacy rows. New swaps
// always have ReceiveAmount populated (swapsCreateNative now fails
// loudly if pricing isn't available), so the fallback path should
// rarely fire after the migration.
func releaseAmount(sw *Swap) float64 {
	if sw.ReceiveAmount > 0 {
		return sw.ReceiveAmount
	}
	return sw.Amount
}

// extractWalletID pulls the wallet-id half from the "wallet_name###address"
// envelope mchain returns. Returns "" when the envelope marker is missing
// or the input is empty.
func extractWalletID(deposit string) string {
	if deposit == "" {
		return ""
	}
	for i := 0; i+2 < len(deposit); i++ {
		if deposit[i] == '#' && deposit[i+1] == '#' && deposit[i+2] == '#' {
			return deposit[:i]
		}
	}
	return ""
}

// buildSigningMessage produces a deterministic 32-byte hex message
// the MPC cluster will sign for a given swap. This is a PLACEHOLDER —
// in the real Phase 4.7 pipeline the message should be the destination-
// chain release tx hash (e.g. an EVM tx digest or a Bitcoin sighash).
// Until that lands, signing over (swap_id || recipient || amount || dest)
// at least gives a reproducible identifier the cluster can attest to.
func buildSigningMessage(sw *Swap) string {
	var b []byte
	b = append(b, []byte(sw.ID)...)
	b = append(b, '|')
	b = append(b, []byte(sw.DestinationAddress)...)
	b = append(b, '|')
	b = append(b, []byte(strconv.FormatFloat(sw.Amount, 'f', -1, 64))...)
	b = append(b, '|')
	b = append(b, []byte(sw.DestinationNetwork)...)
	b = append(b, '|')
	b = append(b, []byte(sw.DestinationAsset)...)
	sum := sha256.Sum256(b)
	return "0x" + hex.EncodeToString(sum[:])
}

// rollbackOrFail is the shared rollback path for signing failures
// (PreSign + MPC sign). Increments Swap.SigningAttempts; below the
// d.maxSigningAttempts ceiling, rolls the status back to
// SwapStatusBridgeTransferPending so the next tick retries. At the
// ceiling, routes the swap to SwapStatusRefundPending with an
// operator-actionable LastError so the refund driver returns the
// user's deposit instead of looping forever — catches both
// transient destination-RPC outages and terminal cases like a
// destination chain with no tx assembler (today's BTC / SOL / TON
// gap surfaces this way).
//
// `cause` is the underlying error for logging; `userMsg` is the
// short string written to Swap.LastError for retries (the SDK shows
// this to the user). `stage` labels the failure for the ceiling-
// hit log message.
func (d *SigningDriver) rollbackOrFail(ctx context.Context, swapID string, cause error, userMsg, stage string) {
	var maxedOut bool
	var attempts int
	patched, _ := d.store.Patch(ctx, swapID, func(s *Swap) {
		if s.Status != SwapStatusSigning {
			return
		}
		s.SigningAttempts++
		attempts = s.SigningAttempts
		if d.maxSigningAttempts > 0 && s.SigningAttempts >= d.maxSigningAttempts {
			s.Status = SwapStatusRefundPending
			s.LastError = fmt.Sprintf(
				"Signing failed %d times at %s (max=%d) — moving to refund: %s",
				s.SigningAttempts, stage, d.maxSigningAttempts, truncSigningErr(cause, 120),
			)
			s.LastErrorAt = time.Now().UTC()
			maxedOut = true
			return
		}
		s.Status = SwapStatusBridgeTransferPending
		s.LastError = userMsg
	})
	if maxedOut && patched != nil && patched.Status == SwapStatusRefundPending {
		if d.logger != nil {
			d.logger.Warn("signing maxed out → refund_pending",
				"swap_id", swapID,
				"stage", stage,
				"attempts", attempts,
				"max", d.maxSigningAttempts,
				"final_err", cause,
			)
		}
	}
}

// truncSigningErr formats an error for inclusion in a user-visible
// LastError, with a length ceiling so we don't blow up the SDK display
// or the swap-row JSON budget on the rare upstream error that includes
// a megabyte of stack trace.
func truncSigningErr(err error, n int) string {
	if err == nil {
		return ""
	}
	msg := err.Error()
	if len(msg) <= n {
		return msg
	}
	return msg[:n] + "…"
}

// Compile-time check: *mchain.Client satisfies MPCSigner.
var _ MPCSigner = (*mchain.Client)(nil)

// Suppress unused-import warnings on the rare path where fmt isn't
// directly referenced after future edits. Keeps the import list stable.
var _ = fmt.Sprintf