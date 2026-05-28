package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	luxlog "github.com/luxfi/log"

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
	// with a real EVM EIP-155 tx digest and finalizes the signed raw
	// tx into Swap.DestRawTx after the MPC produces a signature.
	// When nil, the driver falls back to placeholder mode (signature
	// stored but no raw tx assembled — broadcaster will skip).
	assembler *txassembler.Assembler

	// perSignTimeout caps each individual SignForWallet call.
	// 75 s default covers the cluster-side 60 s ceremony timeout plus
	// headroom — matches the mchain client's keygen timeout.
	perSignTimeout time.Duration

	running atomic.Bool

	ticks       atomic.Uint64
	attempts    atomic.Uint64
	successes   atomic.Uint64
	failures    atomic.Uint64
	listErrors  atomic.Uint64

	stopOnce      sync.Once
	cancelRunning context.CancelFunc
}

// SetAssembler attaches a tx assembler to the driver. When set, the
// signing driver will use real EVM EIP-155 sighashes (not placeholder
// digests) and finalize a wire-ready raw tx into Swap.DestRawTx.
// Optional — leaving it nil retains the v1 placeholder behavior.
func (d *SigningDriver) SetAssembler(asm *txassembler.Assembler) { d.assembler = asm }

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
		store:          store,
		signer:         signer,
		interval:       interval,
		logger:         logger,
		perSignTimeout: DefaultPerSignTimeout,
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
}

// Stats snapshots the counters. Safe for concurrent reads.
func (d *SigningDriver) Stats() SigningDriverStats {
	return SigningDriverStats{
		Ticks:      d.ticks.Load(),
		Attempts:   d.attempts.Load(),
		Successes:  d.successes.Load(),
		Failures:   d.failures.Load(),
		ListErrors: d.listErrors.Load(),
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
	// the actual destination-chain tx sighash (a real EVM EIP-155
	// digest the destination chain will validate). Without one, fall
	// back to the placeholder synthetic digest — useful for early
	// integration testing but the resulting signature can't be
	// broadcast as a real tx.
	var msgHex string
	var unsigned *txassembler.Unsigned
	if d.assembler != nil && senderAddr != "" {
		var aerr error
		unsigned, aerr = d.assembler.PreSign(ctx, txassembler.SwapIntent{
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
			// Roll back — the swap is still deposit-confirmed; the
			// next tick will retry. (Often this means a transient
			// RPC failure querying nonce / gas price.)
			_, _ = d.store.Patch(ctx, sw.ID, func(s *Swap) {
				if s.Status == SwapStatusSigning {
					s.Status = SwapStatusBridgeTransferPending
				}
				s.LastError = "Destination RPC unreachable while building tx — retrying"
			})
			return
		}
		msgHex = "0x" + hex.EncodeToString(unsigned.SigHash[:])
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
		// Roll back to bridge_transfer_pending so the next tick retries.
		// Don't reset to user_deposit_pending — the deposit is still
		// confirmed; only the signing leg failed.
		_, _ = d.store.Patch(ctx, sw.ID, func(s *Swap) {
			if s.Status == SwapStatusSigning {
				s.Status = SwapStatusBridgeTransferPending
			}
			s.LastError = "MPC signing ceremony failed — retrying"
		})
		return
	}

	// When the assembler was used, finalize the signed raw tx so the
	// broadcaster has something wire-ready to push.
	var destRawTx string
	if unsigned != nil {
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
		rawTx, ferr := d.assembler.Finalize(unsigned, r, s, v)
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

// Compile-time check: *mchain.Client satisfies MPCSigner.
var _ MPCSigner = (*mchain.Client)(nil)

// Suppress unused-import warnings on the rare path where fmt isn't
// directly referenced after future edits. Keeps the import list stable.
var _ = fmt.Sprintf