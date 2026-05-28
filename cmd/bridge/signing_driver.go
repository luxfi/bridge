package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"math/big"
	"strconv"
	"strings"
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

	// tonAssembler is the TON-family equivalent of assembler. Picked
	// when the destination is a TON_* network. nil ⇒ TON destinations
	// fall back to placeholder mode (same behaviour as EVM without an
	// assembler attached).
	tonAssembler *txassembler.TONAssembler

	// pool, when set, rotates release wallets per-swap instead of
	// reusing the deposit wallet. The deposit wallet has no
	// guaranteed funding on the destination chain; the pool wallets
	// are pre-funded by the operator. Optional — nil keeps the
	// legacy deposit-as-release semantics for backward compat.
	pool *ReleasePool

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

// SetTONAssembler attaches a TON-family tx assembler. The driver
// uses this when the destination is a TON network (TON_MAINNET /
// TON_TESTNET) and a pool entry of AddressTypeTON has been minted.
func (d *SigningDriver) SetTONAssembler(asm *txassembler.TONAssembler) { d.tonAssembler = asm }

// SetReleasePool wires the static release pool. With a pool attached,
// signOne rotates wallets per-swap and persists ReleaseWalletID on
// the Swap record so the broadcaster + refund driver know which
// pool wallet holds the funds.
func (d *SigningDriver) SetReleasePool(pool *ReleasePool) { d.pool = pool }

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
	// Step 1 — pick a signing wallet. Pool path takes precedence
	// when configured; otherwise fall back to the deposit-as-release
	// path that handled v1 swaps.
	var walletID, senderAddr string
	usingPool := false
	if d.pool != nil && d.pool.Size() > 0 {
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

	// Step 3 — compute the signing message. With an assembler attached,
	// this is the actual destination-chain tx sighash (a real EVM
	// EIP-155 digest the destination chain will validate, or a TON
	// v4r2 body hash). Without one, fall back to the placeholder
	// synthetic digest — useful for early integration testing but the
	// resulting signature can't be broadcast as a real tx.
	//
	// Family dispatch: TON destinations route through tonAssembler if
	// configured. Anything else (EVM today, more later) uses the
	// default EVM assembler.
	var msgHex string
	var unsigned *txassembler.Unsigned
	var tonUnsigned *txassembler.TONUnsigned
	family := mchain.AddressTypeFor(sw.DestinationNetwork)

	switch {
	case family == mchain.AddressTypeTON && d.tonAssembler != nil:
		// TON path. Need the source pubkey + address — pool entry
		// carries both since the keygen surface was extended.
		entry := d.lookupPoolEntry(walletID)
		if entry == nil || entry.EDDSAPubKey == "" {
			d.failures.Add(1)
			if d.logger != nil {
				d.logger.Warn("TON signing requires EDDSAPubKey on release pool entry",
					"swap_id", sw.ID,
					"wallet_id", walletID,
				)
			}
			_, _ = d.store.Patch(ctx, sw.ID, func(s *Swap) {
				if s.Status == SwapStatusSigning {
					s.Status = SwapStatusBridgeTransferPending
				}
				s.LastError = "Release wallet missing TON ed25519 pubkey — operator must re-keygen with Ed25519 curve"
			})
			return
		}
		pubkey, perr := hex.DecodeString(strings.TrimPrefix(strings.TrimPrefix(entry.EDDSAPubKey, "0x"), "0X"))
		if perr != nil {
			d.failures.Add(1)
			_, _ = d.store.Patch(ctx, sw.ID, func(s *Swap) {
				if s.Status == SwapStatusSigning {
					s.Status = SwapStatusBridgeTransferPending
				}
				s.LastError = "Release wallet has malformed ed25519 pubkey: " + perr.Error()
			})
			return
		}
		amountNano := tonAmountToNano(sw.Amount)
		spec := txassembler.TONSpec{
			Network:            sw.DestinationNetwork,
			SourcePubKey:       pubkey,
			SourceAddress:      entry.Address,
			DestinationAddress: sw.DestinationAddress,
			Asset:              sw.DestinationAsset,
			AmountNano:         amountNano,
		}
		tu, terr := d.tonAssembler.PreSignTON(ctx, spec)
		if terr != nil {
			d.failures.Add(1)
			if d.logger != nil {
				d.logger.Warn("TON tx assembler PreSign failed",
					"swap_id", sw.ID,
					"err", terr,
				)
			}
			_, _ = d.store.Patch(ctx, sw.ID, func(s *Swap) {
				if s.Status == SwapStatusSigning {
					s.Status = SwapStatusBridgeTransferPending
				}
				s.LastError = "TON tx assembly failed — retrying: " + terr.Error()
			})
			return
		}
		tonUnsigned = tu
		msgHex = "0x" + hex.EncodeToString(tu.SigHash[:])

		// Gas pre-check for TON: balance is in nanoton; required
		// includes the user value plus a small gas estimate (~0.05
		// TON native, ~0.15 TON for jetton transfers because the
		// jetton call carries forward TON + gas).
		if d.gasProbe != nil {
			if reason, ok := d.gasPrecheckTON(ctx, sw, spec, entry.Address); !ok {
				d.shortCircuited.Add(1)
				_, _ = d.store.Patch(ctx, sw.ID, func(s *Swap) {
					if s.Status == SwapStatusSigning {
						s.Status = SwapStatusFailedInsufficientReleaseGas
					}
					s.LastError = reason
					s.LastErrorAt = time.Now().UTC()
				})
				if d.logger != nil {
					d.logger.Warn("gas pre-check failed — TON swap short-circuited",
						"swap_id", sw.ID,
						"release_wallet_id", walletID,
						"release_address", entry.Address,
						"network", sw.DestinationNetwork,
						"reason", reason,
					)
				}
				return
			}
		}

	case d.assembler != nil && senderAddr != "":
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
	default:
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
	// broadcaster has something wire-ready to push. EVM and TON
	// branches diverge on signature shape (65-byte secp256k1 r||s||v
	// vs 64-byte Ed25519) and finalization (EIP-155 RLP vs TON BOC),
	// but both produce a Swap.DestRawTx value the broadcast layer
	// consumes uniformly.
	var destRawTx string
	switch {
	case tonUnsigned != nil:
		bocB64, _, ferr := d.tonAssembler.FinalizeTONHex(tonUnsigned, res.Signature)
		if ferr != nil {
			d.failures.Add(1)
			if d.logger != nil {
				d.logger.Warn("TON tx assembler Finalize failed",
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
		destRawTx = bocB64
	case unsigned != nil:
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

// =============================================================================
// TON helpers
// =============================================================================

// lookupPoolEntry returns the pool entry matching `walletID`, or nil
// when the pool is unset / the wallet isn't in the pool. Used by the
// TON signing path to fetch the EDDSAPubKey + canonical address that
// the EVM path doesn't need.
func (d *SigningDriver) lookupPoolEntry(walletID string) *ReleasePoolEntry {
	if d.pool == nil {
		return nil
	}
	for _, e := range d.pool.Entries() {
		if e.WalletID == walletID {
			cp := e
			return &cp
		}
	}
	return nil
}

// tonAmountToNano converts a human-readable TON amount (e.g. 1.5)
// into nanoton (1e9 base units). Defensive against IEEE-754 wobble
// by formatting + parsing as fixed-point.
func tonAmountToNano(amount float64) *big.Int {
	if amount <= 0 || math.IsNaN(amount) || math.IsInf(amount, 0) {
		return big.NewInt(0)
	}
	// 9 decimal places of precision — exactly the nanoton resolution.
	formatted := strconv.FormatFloat(amount, 'f', 9, 64)
	intPart, fracPart := formatted, ""
	if idx := strings.Index(formatted, "."); idx >= 0 {
		intPart = formatted[:idx]
		fracPart = formatted[idx+1:]
	}
	if pad := 9 - len(fracPart); pad > 0 {
		fracPart += strings.Repeat("0", pad)
	} else if pad < 0 {
		fracPart = fracPart[:9]
	}
	combined := intPart + fracPart
	combined = strings.TrimLeft(combined, "0")
	if combined == "" {
		return big.NewInt(0)
	}
	n, ok := new(big.Int).SetString(combined, 10)
	if !ok {
		return big.NewInt(0)
	}
	return n
}

// gasPrecheckTON verifies the release wallet has enough nanoton to
// cover (amount + gas) on a TON send. The signing-driver's general
// gasPrecheck is EVM-shaped (wei + gasLimit*gasPrice + value), so the
// TON branch needs its own.
//
// Gas estimate: 0.05 TON for a native transfer, 0.15 TON for a
// jetton transfer (which carries forward-TON + master-call gas).
// These are conservative — actual production costs hover around half
// these values on testnet.
func (d *SigningDriver) gasPrecheckTON(
	ctx context.Context,
	sw *Swap,
	spec txassembler.TONSpec,
	releaseAddr string,
) (string, bool) {
	probeCtx, cancel := context.WithTimeout(ctx, d.perBalanceTimeout)
	defer cancel()
	balance, err := d.gasProbe.BalanceAt(probeCtx, sw.DestinationNetwork, releaseAddr)
	if err != nil {
		// Best-effort: log + skip. Same policy as the EVM pre-check —
		// don't refuse to sign a swap we can't verify.
		if d.logger != nil {
			d.logger.Debug("ton gas pre-check: balance probe failed (non-fatal — pre-check skipped)",
				"swap_id", sw.ID,
				"address", releaseAddr,
				"network", sw.DestinationNetwork,
				"err", err,
			)
		}
		return "", true
	}
	var gasEstimate *big.Int
	if isTONNativeAsset(spec.Asset) {
		gasEstimate = big.NewInt(txassembler.TONJettonBodyValueNano) // 0.05 TON
	} else {
		// Jetton: body carries 0.05 TON to the master + 0.05 TON
		// forward to the destination jetton wallet ⇒ ~0.10 TON net,
		// pad to 0.15 for storage rounding.
		gasEstimate = big.NewInt(txassembler.TONJettonBodyValueNano + txassembler.TONJettonForwardNano + 50_000_000)
	}
	// For native transfers, the user value also leaves the wallet.
	// For jetton transfers, the user value moves between jetton
	// wallets, NOT out of our release wallet — only gas leaves.
	required := new(big.Int).Set(gasEstimate)
	if isTONNativeAsset(spec.Asset) {
		required.Add(required, spec.AmountNano)
	}
	if balance.Cmp(required) >= 0 {
		return "", true
	}
	short := new(big.Int).Sub(required, balance)
	return fmt.Sprintf(
		"Release wallet %s has insufficient nanoton balance on %s: balance=%s nanoton, required=%s nanoton (gas=%s + value=%s), short=%s nanoton. Fund the wallet and trigger a retry.",
		releaseAddr,
		sw.DestinationNetwork,
		balance.String(),
		required.String(),
		gasEstimate.String(),
		spec.AmountNano.String(),
		short.String(),
	), false
}

// isTONNativeAsset duplicates the txassembler heuristic so the
// signing driver doesn't need to call into the assembler just for
// this branch.
func isTONNativeAsset(asset string) bool {
	switch strings.ToUpper(strings.TrimSpace(asset)) {
	case "", "TON", "TONCOIN":
		return true
	}
	return false
}

// Suppress unused-import warnings on the rare path where fmt isn't
// directly referenced after future edits. Keeps the import list stable.
var _ = fmt.Sprintf