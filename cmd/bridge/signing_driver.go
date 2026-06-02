package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
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
//
// SignForWallet defaults to ECDSA/secp256k1 — preserved for legacy
// callers that don't know about curves. The driver routes Solana (and
// future Ed25519 destinations) through CurveSigner.SignForWalletOnCurve
// when the dependency is available.
type MPCSigner interface {
	SignForWallet(ctx context.Context, walletID, messageHex string) (*mchain.SignResult, error)
}

// CurveSigner is the wider interface that routes signing requests with
// an explicit curve hint. *mchain.Client satisfies it natively; tests
// implement it directly. The driver checks for this at runtime and
// only requires it for non-secp256k1 destinations.
type CurveSigner interface {
	SignForWalletOnCurve(ctx context.Context, walletID, messageHex string, curve mchain.Curve) (*mchain.SignResult, error)
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

	// solAssembler is the Solana counterpart of `assembler`. When the
	// destination network is in the SOL family, PreSign returns a v0
	// message + payer + recent blockhash, and Finalize slots the
	// Ed25519 signature into the wire-ready transaction. Optional —
	// when nil, SOL destinations stall in bridge_transfer_pending until
	// an operator configures one (matches the existing EVM-without-
	// assembler behaviour).
	solAssembler *txassembler.SOLAssembler

	// pool / poolSet wire the release-wallet pool(s).
	//
	// pool is the legacy single-pool field (one family — typically EVM).
	// Kept for backward compat with the existing test setups.
	//
	// poolSet is the new multi-family router. When set, takes precedence
	// over pool — the driver routes Acquire by destination family. Both
	// can coexist: pool serves as the fallback for callers that haven't
	// migrated to the per-family shape.
	pool    *ReleasePool
	poolSet *ReleasePoolSet

	// gasProbe, when set, runs an eth_getBalance check against the
	// release wallet's destination-chain balance before signing.
	// Short-circuits the swap to SwapStatusFailedInsufficientReleaseGas
	// if balance < (gasLimit * gasPrice + value). Optional — nil
	// disables the gas pre-check entirely.
	gasProbe BalanceProbe

	// perSignTimeout caps each individual SignForWallet call.
	// 75 s default covers the cluster-side 60 s ceremony timeout plus
	// headroom — matches the mchain client's keygen timeout.
	perSignTimeout time.Duration

	// perBalanceTimeout caps the gas pre-check eth_getBalance call.
	perBalanceTimeout time.Duration

	running atomic.Bool

	ticks      atomic.Uint64
	attempts   atomic.Uint64
	successes  atomic.Uint64
	failures   atomic.Uint64
	listErrors atomic.Uint64
	// shortCircuited counts swaps that failed pre-sign on the gas
	// check. Distinct from failures so operator dashboards can show
	// "swap failed because operator hasn't funded a pool wallet"
	// separately from "MPC ceremony / RPC flake".
	shortCircuited atomic.Uint64

	stopOnce      sync.Once
	cancelRunning context.CancelFunc
}

// SetAssembler attaches a tx assembler to the driver. When set, the
// signing driver will use real EVM EIP-155 sighashes (not placeholder
// digests) and finalize a wire-ready raw tx into Swap.DestRawTx.
// Optional — leaving it nil retains the v1 placeholder behavior.
func (d *SigningDriver) SetAssembler(asm *txassembler.Assembler) { d.assembler = asm }

// SetReleasePool wires the static release pool. With a pool attached,
// signOne rotates wallets per-swap and persists ReleaseWalletID on
// the Swap record so the broadcaster + refund driver know which
// pool wallet holds the funds.
func (d *SigningDriver) SetReleasePool(pool *ReleasePool) { d.pool = pool }

// SetReleasePoolSet wires the multi-family release-pool router. With
// a set attached, signOne routes Acquire by destination network family
// (EVM vs SOL vs BTC) — each family gets its own rotation cursor and
// its own keygen curve. Takes precedence over SetReleasePool when both
// are configured.
func (d *SigningDriver) SetReleasePoolSet(set *ReleasePoolSet) { d.poolSet = set }

// SetSOLAssembler wires the Solana destination assembler. Without this,
// SOL destinations stall in bridge_transfer_pending — the driver has
// no way to build a v0 message to sign.
func (d *SigningDriver) SetSOLAssembler(asm *txassembler.SOLAssembler) { d.solAssembler = asm }

// SetGasProbe attaches a destination-chain balance probe. With a
// probe set, signOne queries the release wallet's balance BEFORE
// calling the MPC sign and short-circuits to
// SwapStatusFailedInsufficientReleaseGas when balance can't cover
// (gasLimit * gasPrice + value).
func (d *SigningDriver) SetGasProbe(p BalanceProbe) { d.gasProbe = p }

// DefaultSigningInterval is the production-suitable tick cadence for
// the signing driver. Faster than the deposit watcher because once a
// swap reaches bridge_transfer_pending the user is actively waiting
// for completion.
const DefaultSigningInterval = 10 * time.Second

// DefaultPerSignTimeout caps each SignForWallet call.
const DefaultPerSignTimeout = 75 * time.Second

// DefaultPerBalanceTimeout caps each gas-precheck eth_getBalance call.
// Generous because destination RPCs (e.g. api.lux-test.network behind
// krakend) occasionally hiccup on cold connections, but short enough
// to fail the pre-check cleanly rather than blocking the signing tick.
const DefaultPerBalanceTimeout = 8 * time.Second

// NewSigningDriver builds a driver with sensible defaults.
func NewSigningDriver(store SwapStore, signer MPCSigner, interval time.Duration, logger luxlog.Logger) *SigningDriver {
	if interval <= 0 {
		interval = DefaultSigningInterval
	}
	return &SigningDriver{
		store:             store,
		signer:            signer,
		interval:          interval,
		logger:            logger,
		perSignTimeout:    DefaultPerSignTimeout,
		perBalanceTimeout: DefaultPerBalanceTimeout,
	}
}

// Running reports whether the driver loop is active.
func (d *SigningDriver) Running() bool { return d.running.Load() }

// SigningDriverStats is a point-in-time view of the driver's counters.
type SigningDriverStats struct {
	Ticks          uint64 `json:"ticks"`
	Attempts       uint64 `json:"attempts"`
	Successes      uint64 `json:"successes"`
	Failures       uint64 `json:"failures"`
	ListErrors     uint64 `json:"list_errors"`
	ShortCircuited uint64 `json:"short_circuited"`
}

// Stats snapshots the counters. Safe for concurrent reads.
func (d *SigningDriver) Stats() SigningDriverStats {
	return SigningDriverStats{
		Ticks:          d.ticks.Load(),
		Attempts:       d.attempts.Load(),
		Successes:      d.successes.Load(),
		Failures:       d.failures.Load(),
		ListErrors:     d.listErrors.Load(),
		ShortCircuited: d.shortCircuited.Load(),
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
//
// Pool integration: when d.pool is set, the driver picks a release
// wallet via Acquire() and uses it as the sender for both the
// assembler's PreSign call and the MPC sign call. Without a pool,
// it falls back to the legacy "deposit wallet doubles as release
// wallet" semantics (extractWalletID(DepositAddress)).
//
// Gas pre-check: when d.gasProbe is set, the driver queries the
// release wallet's destination-chain native balance after PreSign
// (which gave us the exact GasPrice + GasLimit + Value). If the
// balance can't cover (gasLimit * gasPrice + value), the swap is
// short-circuited to SwapStatusFailedInsufficientReleaseGas and the
// MPC ceremony is skipped entirely. Saves the 75s sign-then-fail
// dance the broadcast driver previously had to absorb.
func (d *SigningDriver) signOne(ctx context.Context, sw *Swap) {
	// Step 1 — pick a signing wallet. PoolSet path takes precedence
	// (multi-family routing); single Pool is the legacy single-family
	// path; final fallback is the deposit-as-release path that handled
	// v1 swaps.
	var walletID, senderAddr string
	usingPool := false
	if d.poolSet != nil {
		entry, perr := d.poolSet.Acquire(ctx, sw.DestinationNetwork)
		if perr == nil && entry != nil {
			walletID = entry.WalletID
			senderAddr = entry.Address
			usingPool = true
		} else if d.logger != nil && perr != nil && !errors.Is(perr, ErrEmptyPool) && !errors.Is(perr, ErrNoPoolForFamily) {
			d.logger.Warn("release pool set acquire failed; falling back to single pool / deposit wallet",
				"swap_id", sw.ID,
				"err", perr,
			)
		}
	}
	if walletID == "" && d.pool != nil && d.pool.Size() > 0 {
		entry, perr := d.pool.Acquire(ctx, sw.DestinationNetwork)
		if perr == nil && entry != nil {
			walletID = entry.WalletID
			senderAddr = entry.Address
			usingPool = true
		} else if d.logger != nil && perr != nil && !errors.Is(perr, ErrEmptyPool) {
			d.logger.Warn("release pool acquire failed; falling back to deposit wallet",
				"swap_id", sw.ID,
				"err", perr,
			)
		}
	}
	if walletID == "" {
		walletID = extractWalletID(sw.DepositAddress)
		senderAddr = extractDepositAddress(sw.DepositAddress)
	}
	if walletID == "" {
		// Swap was created without a minted MPC wallet (likely
		// use_deposit_address=false). The signing flow doesn't apply
		// — that swap must complete via a different mechanism. Skip
		// silently.
		return
	}

	d.attempts.Add(1)

	// Step 2 — claim the swap by transitioning to "signing in progress"
	// before the (slow) ceremony call. A second driver instance polling
	// at the same moment will not see this swap in
	// bridge_transfer_pending anymore and will skip it. We persist
	// the chosen release-wallet metadata here so the broadcast +
	// refund drivers can read it back later.
	claimed, err := d.store.Patch(ctx, sw.ID, func(s *Swap) {
		if s.Status != SwapStatusBridgeTransferPending {
			return
		}
		s.Status = SwapStatusSigning
		if usingPool {
			s.ReleaseWalletID = walletID
			s.ReleaseAddress = senderAddr
		}
	})
	if err != nil || claimed == nil || claimed.Status != SwapStatusSigning {
		// Race with another driver / state already advanced — let it go.
		return
	}

	// Step 3 — branch by destination family. SOL has its own message
	// build + sign + finalize path because the cryptographic primitives
	// are different (Ed25519 vs ECDSA, 64-byte sig vs 65-byte recoverable,
	// no nonce/gas concept).
	if mchain.AddressTypeFor(sw.DestinationNetwork) == mchain.AddressTypeSOL {
		d.signOneSOL(ctx, sw, walletID, senderAddr)
		return
	}

	// Step 3 — compute the signing message. With an assembler attached,
	// this is the actual destination-chain tx sighash (a real EVM
	// EIP-155 digest the destination chain will validate). Without
	// one, fall back to the placeholder synthetic digest — useful
	// for early integration testing but the resulting signature
	// can't be broadcast as a real tx.
	var msgHex string
	var unsigned *txassembler.Unsigned
	if d.assembler != nil && senderAddr != "" {
		var aerr error
		unsigned, aerr = d.assembler.PreSign(ctx, txassembler.SwapIntent{
			DestinationNetwork: sw.DestinationNetwork,
			DestinationAsset:   sw.DestinationAsset,
			DestinationAddress: sw.DestinationAddress,
			Amount:             sw.Amount,
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

		// Step 4 — gas pre-check. We have the exact gasPrice, gasLimit,
		// and value from PreSign; query the release wallet balance and
		// short-circuit the swap before burning the MPC ceremony if
		// the wallet can't cover the destination cost. Skip when no
		// probe is configured (legacy / test setups).
		if d.gasProbe != nil {
			if reason, ok := d.gasPrecheck(ctx, sw, unsigned, senderAddr); !ok {
				d.shortCircuited.Add(1)
				_, _ = d.store.Patch(ctx, sw.ID, func(s *Swap) {
					if s.Status == SwapStatusSigning {
						s.Status = SwapStatusFailedInsufficientReleaseGas
					}
					s.LastError = reason
					s.LastErrorAt = time.Now().UTC()
				})
				if d.logger != nil {
					d.logger.Warn("gas pre-check failed — swap short-circuited",
						"swap_id", sw.ID,
						"release_wallet_id", walletID,
						"release_address", senderAddr,
						"network", sw.DestinationNetwork,
						"reason", reason,
					)
				}
				return
			}
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

// =============================================================================
// SOL signing path
// =============================================================================

// SOL fee constants. Solana's base transaction fee is 5_000 lamports
// per signature; the rent-exempt minimum for a token account is
// ~2_039_280 lamports (refreshed periodically by the cluster, but
// pinned here for the gas pre-check approximation). The real
// rent-exempt floor can be queried via
// getMinimumBalanceForRentExemption; we keep a constant for the
// pre-check because a stale read would only over-fund slightly.
const (
	solBaseFeeLamports     uint64 = 5_000
	solATARentExemptApprox uint64 = 2_039_280
)

// signOneSOL is the Solana branch of signOne. Builds a v0 message via
// SOLAssembler.PreSign, gas-prechecks against the release wallet's
// lamport balance, runs the Ed25519 MPC ceremony with curve hint, then
// finalizes the wire-ready transaction and persists.
func (d *SigningDriver) signOneSOL(ctx context.Context, sw *Swap, walletID, senderAddr string) {
	if d.solAssembler == nil {
		// SOL destination but no assembler configured — roll back so
		// the swap stays at bridge_transfer_pending, and surface a
		// clear LastError so the operator knows to wire one up.
		_, _ = d.store.Patch(ctx, sw.ID, func(s *Swap) {
			if s.Status == SwapStatusSigning {
				s.Status = SwapStatusBridgeTransferPending
			}
			s.LastError = "SOL destination requires SOLAssembler — bridge not configured for Solana yet"
		})
		d.failures.Add(1)
		return
	}

	// Resolve human-readable amount → lamports. Native SOL uses 9
	// decimals; SPL tokens vary. For now the bridge assumes native SOL
	// unless DestinationAsset is something other than "SOL". The token
	// registry should grow SPL metadata as part of the SPL release work.
	decimals := 9
	if d.assembler != nil && d.assembler.Tokens != nil && sw.DestinationAsset != "" {
		if info, ok := d.assembler.Tokens.Lookup(sw.DestinationNetwork, sw.DestinationAsset); ok {
			decimals = info.Decimals
		}
	}
	lamports, err := txassembler.LamportsFromFloat(sw.Amount, decimals)
	if err != nil {
		d.failures.Add(1)
		if d.logger != nil {
			d.logger.Warn("SOL lamport conversion failed",
				"swap_id", sw.ID,
				"amount", sw.Amount,
				"decimals", decimals,
				"err", err,
			)
		}
		_, _ = d.store.Patch(ctx, sw.ID, func(s *Swap) {
			if s.Status == SwapStatusSigning {
				s.Status = SwapStatusBridgeTransferPending
			}
			s.LastError = "SOL amount conversion failed: " + err.Error()
		})
		return
	}

	// Look up SPL mint when the asset isn't native SOL.
	mint := ""
	if d.assembler != nil && d.assembler.Tokens != nil && sw.DestinationAsset != "" && sw.DestinationAsset != "SOL" {
		if info, ok := d.assembler.Tokens.Lookup(sw.DestinationNetwork, sw.DestinationAsset); ok && info.Contract != "" {
			mint = info.Contract
		}
	}

	unsigned, aerr := d.solAssembler.PreSign(ctx, txassembler.SOLSpec{
		Network:          sw.DestinationNetwork,
		PayerAddress:     senderAddr,
		RecipientAddress: sw.DestinationAddress,
		LamportsAmount:   lamports,
		SourceMint:       mint,
	})
	if aerr != nil {
		d.failures.Add(1)
		if d.logger != nil {
			d.logger.Warn("SOL assembler PreSign failed",
				"swap_id", sw.ID,
				"err", aerr,
			)
		}
		_, _ = d.store.Patch(ctx, sw.ID, func(s *Swap) {
			if s.Status == SwapStatusSigning {
				s.Status = SwapStatusBridgeTransferPending
			}
			s.LastError = "SOL RPC unreachable while building tx — retrying"
		})
		return
	}

	// Gas pre-check (lamport balance). Skip when no probe is configured.
	if d.gasProbe != nil {
		reason, ok := d.gasPrecheckSOL(ctx, sw, senderAddr, lamports, mint != "")
		if !ok {
			d.shortCircuited.Add(1)
			_, _ = d.store.Patch(ctx, sw.ID, func(s *Swap) {
				if s.Status == SwapStatusSigning {
					s.Status = SwapStatusFailedInsufficientReleaseGas
				}
				s.LastError = reason
				s.LastErrorAt = time.Now().UTC()
			})
			if d.logger != nil {
				d.logger.Warn("SOL gas pre-check failed — swap short-circuited",
					"swap_id", sw.ID,
					"release_wallet_id", walletID,
					"release_address", senderAddr,
					"network", sw.DestinationNetwork,
					"reason", reason,
				)
			}
			return
		}
	}

	// Run the MPC ceremony on the Ed25519 curve. The message bytes
	// (NOT a digest) get hex-encoded as the cluster expects.
	msgHex := "0x" + hex.EncodeToString(unsigned.MessageBytes)
	sigCtx, cancel := context.WithTimeout(ctx, d.perSignTimeout)
	defer cancel()
	res, err := d.signOnCurve(sigCtx, walletID, msgHex, mchain.CurveEd25519)
	if err != nil {
		d.failures.Add(1)
		if d.logger != nil {
			d.logger.Warn("SOL signing ceremony failed",
				"swap_id", sw.ID,
				"wallet_id", walletID,
				"err", err,
			)
		}
		_, _ = d.store.Patch(ctx, sw.ID, func(s *Swap) {
			if s.Status == SwapStatusSigning {
				s.Status = SwapStatusBridgeTransferPending
			}
			s.LastError = "SOL MPC signing ceremony failed — retrying"
		})
		return
	}

	// Parse the 64-byte Ed25519 signature and finalize.
	sigBytes, perr := txassembler.ParseSOLSignatureHex(res.Signature)
	if perr != nil {
		d.failures.Add(1)
		if d.logger != nil {
			d.logger.Warn("SOL signature parse failed",
				"swap_id", sw.ID,
				"err", perr,
			)
		}
		_, _ = d.store.Patch(ctx, sw.ID, func(s *Swap) {
			if s.Status == SwapStatusSigning {
				s.Status = SwapStatusBridgeTransferPending
			}
			s.LastError = "SOL MPC returned malformed signature"
		})
		return
	}
	rawTxB64, sigStr, ferr := d.solAssembler.Finalize(unsigned, sigBytes)
	if ferr != nil {
		d.failures.Add(1)
		if d.logger != nil {
			d.logger.Warn("SOL assembler Finalize failed",
				"swap_id", sw.ID,
				"err", ferr,
			)
		}
		_, _ = d.store.Patch(ctx, sw.ID, func(s *Swap) {
			if s.Status == SwapStatusSigning {
				s.Status = SwapStatusBridgeTransferPending
			}
			s.LastError = "SOL tx finalize failed: " + ferr.Error()
		})
		return
	}

	_, err = d.store.Patch(ctx, sw.ID, func(s *Swap) {
		if s.Status != SwapStatusSigning {
			return
		}
		s.Signature = sigStr // base58, doubles as the canonical SOL tx-hash identifier
		s.MPCSessionID = res.SessionID
		s.DestRawTx = rawTxB64
		s.Status = SwapStatusBroadcasting
		s.LastError = ""
		s.LastErrorAt = time.Time{}
	})
	if err != nil {
		d.failures.Add(1)
		if d.logger != nil {
			d.logger.Warn("SOL persist signature",
				"swap_id", sw.ID,
				"err", err,
			)
		}
		return
	}
	d.successes.Add(1)
	if d.logger != nil {
		d.logger.Info("SOL signature received → advanced to broadcasting",
			"swap_id", sw.ID,
			"wallet_id", walletID,
			"session_id", res.SessionID,
			"signature", sigStr,
			"blockhash", unsigned.Blockhash,
		)
	}
}

// signOnCurve routes the sign call through CurveSigner when the
// underlying *mchain.Client supports it. Falls back to SignForWallet
// (secp256k1) for mocks that haven't grown the curve hint — the SOL
// finalizer will then reject the result with a clear "signature must
// be 64 bytes" error, so a deployment mismatch fails fast.
func (d *SigningDriver) signOnCurve(ctx context.Context, walletID, messageHex string, curve mchain.Curve) (*mchain.SignResult, error) {
	if cs, ok := d.signer.(CurveSigner); ok {
		return cs.SignForWalletOnCurve(ctx, walletID, messageHex, curve)
	}
	return d.signer.SignForWallet(ctx, walletID, messageHex)
}

// gasPrecheckSOL verifies the release wallet's lamport balance covers
// the fee + (when SPL with ATA creation) the rent-exempt minimum.
// Native SOL transfers also need the LamportsAmount itself on top of
// the fee. Returns (reason, false) when insufficient; (empty, true)
// otherwise (or on probe failure — best-effort).
func (d *SigningDriver) gasPrecheckSOL(ctx context.Context, sw *Swap, releaseAddr string, lamports uint64, isSPL bool) (string, bool) {
	probeCtx, cancel := context.WithTimeout(ctx, d.perBalanceTimeout)
	defer cancel()
	balance, err := d.gasProbe.BalanceAt(probeCtx, sw.DestinationNetwork, releaseAddr)
	if err != nil {
		if d.logger != nil {
			d.logger.Debug("SOL gas pre-check: balance probe failed (non-fatal — skipped)",
				"swap_id", sw.ID,
				"address", releaseAddr,
				"network", sw.DestinationNetwork,
				"err", err,
			)
		}
		return "", true
	}
	required := solBaseFeeLamports
	if !isSPL {
		// Native SOL: pay the lamports out of the release wallet too.
		required += lamports
	} else {
		// SPL: lamports come from the source ATA, not the wallet's
		// native balance. The wallet only pays the fee + (potentially)
		// the destination-ATA rent-exempt minimum. We don't know
		// whether the assembler ended up prepending the ATA-create
		// instruction without re-running PreSign, but we provision for
		// the worst case here so the pre-check stays conservative.
		required += solATARentExemptApprox
	}
	if balance.Uint64() >= required {
		return "", true
	}
	short := required - balance.Uint64()
	return fmt.Sprintf(
		"SOL release wallet %s has insufficient lamport balance on %s: balance=%d lamports, required=%d lamports (baseFee=%d, value=%d, splATARent=%d), short=%d lamports. Fund the wallet and trigger a retry.",
		releaseAddr,
		sw.DestinationNetwork,
		balance.Uint64(),
		required,
		solBaseFeeLamports,
		map[bool]uint64{true: 0, false: lamports}[isSPL],
		map[bool]uint64{true: solATARentExemptApprox, false: 0}[isSPL],
		short,
	), false
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

// gasPrecheck verifies the release wallet's destination-chain balance
// covers (gasLimit * gasPrice + value). Returns (humanReadableReason, false)
// when insufficient; (empty, true) when balance is sufficient or the
// probe failed (probe failures must NOT block the swap — the
// existing broadcast-retry path still handles transient RPC issues).
func (d *SigningDriver) gasPrecheck(ctx context.Context, sw *Swap, u *txassembler.Unsigned, releaseAddr string) (string, bool) {
	probeCtx, cancel := context.WithTimeout(ctx, d.perBalanceTimeout)
	defer cancel()
	balance, err := d.gasProbe.BalanceAt(probeCtx, sw.DestinationNetwork, releaseAddr)
	if err != nil {
		// Best-effort: log and skip the pre-check. We'd rather let
		// the broadcast leg retry than refuse to sign a swap we
		// can't verify.
		if d.logger != nil {
			d.logger.Debug("gas pre-check: balance probe failed (non-fatal — pre-check skipped)",
				"swap_id", sw.ID,
				"address", releaseAddr,
				"network", sw.DestinationNetwork,
				"err", err,
			)
		}
		return "", true
	}
	// Required cost = (gasLimit * gasPrice) + value. The assembler's
	// Value is already in base units (wei); gasPrice is wei/gas;
	// gasLimit is uint64. Use big.Int math to avoid overflow.
	gasCost := new(big.Int).Mul(u.GasPrice, new(big.Int).SetUint64(u.GasLimit))
	required := new(big.Int).Add(gasCost, u.Value)
	if balance.Cmp(required) >= 0 {
		return "", true
	}
	short := new(big.Int).Sub(required, balance)
	return fmt.Sprintf(
		"Release wallet %s has insufficient native balance on %s: balance=%s wei, required=%s wei (gasCost=%s + value=%s), short=%s wei. Fund the wallet and trigger a retry.",
		releaseAddr,
		sw.DestinationNetwork,
		balance.String(),
		required.String(),
		gasCost.String(),
		u.Value.String(),
		short.String(),
	), false
}

// Compile-time check: *mchain.Client satisfies MPCSigner.
var _ MPCSigner = (*mchain.Client)(nil)

// Suppress unused-import warnings on the rare path where fmt isn't
// directly referenced after future edits. Keeps the import list stable.
var _ = fmt.Sprintf
