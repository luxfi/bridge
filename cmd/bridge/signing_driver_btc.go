package main

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/luxfi/bridge/internal/txassembler"
)

// signing_driver_btc.go: BTC-specific signOne path.
//
// Why this is separate: BTC's signing ceremony requires one MPC sign
// call PER input — N sighashes, N (r, s) pairs, N witness stacks —
// while EVM uses a single sighash for the whole tx. Threading the
// BTC loop through the EVM path would tangle two unrelated concerns;
// keeping them as sibling functions in a sibling file keeps each
// readable.
//
// Concurrency: methods here run inside the per-swap goroutine the
// driver's tick spawns; the per-tick lock comes from the upstream
// store.Patch call (status claim).

// isBTCNetwork reports whether the given network internal name refers
// to a Bitcoin network. The signing driver dispatches BTC swaps to
// signOneBTC instead of the EVM signOne path.
func isBTCNetwork(network string) bool {
	up := strings.ToUpper(network)
	return strings.HasPrefix(up, "BITCOIN_")
}

// btcNetworkFromInternalName maps internal_name → BTCNetwork. Defaults
// to mainnet when the name is unrecognized (so testnet calls only get
// the testnet path when explicitly named).
func btcNetworkFromInternalName(network string) txassembler.BTCNetwork {
	if strings.EqualFold(network, "BITCOIN_TESTNET") ||
		strings.EqualFold(network, "BITCOIN_TESTNET3") ||
		strings.EqualFold(network, "BITCOIN_SIGNET") {
		return txassembler.BTCTestnet
	}
	return txassembler.BTCMainnet
}

// signOneBTC mirrors signOne for the BTC release flow.
//
// Pipeline:
//  1. Pick a BTC release wallet from the BTC pool (no fallback to
//     deposit-as-release — BTC deposit watching isn't implemented in
//     the bridge today and pool-only mode is the only safe path).
//  2. Claim the swap (status → signing).
//  3. PreSign the BTC tx: pulls UTXOs, picks a set, builds wire tx,
//     emits per-input sighashes.
//  4. Gas pre-check: query the release wallet's confirmed BTC balance;
//     short-circuit on insufficient funds (value + fee).
//  5. For each sighash, call SignForWallet on the MPC cluster. The
//     dashboard's /v1/mpc/sign accepts a 32-byte hex digest, signs it
//     with the wallet's ECDSA share, returns {r, s}.
//  6. Parse all (r, s) pairs, call Finalize → raw tx + canonical txid.
//  7. Persist DestRawTx + advance to broadcasting.
//
// Failure modes:
//   - assembler PreSign fails → roll back to bridge_transfer_pending
//     (transient: probably a mempool.space hiccup).
//   - gas pre-check fails → SwapStatusFailedInsufficientReleaseGas.
//   - any sign call fails → roll back to bridge_transfer_pending;
//     don't try to use the partial signatures.
//   - Finalize fails → roll back; this shouldn't happen with valid
//     signatures but the assembler validates pubkey length etc.
func (d *SigningDriver) signOneBTC(ctx context.Context, sw *Swap) {
	if d.btcAssembler == nil {
		// No BTC assembler configured — stall silently (mirror what
		// the EVM path does when the assembler is missing).
		if d.logger != nil {
			d.logger.Debug("signing driver: BTC assembler not configured, skipping",
				"swap_id", sw.ID,
				"network", sw.DestinationNetwork,
			)
		}
		return
	}
	if d.btcPool == nil || d.btcPool.Size() == 0 {
		if d.logger != nil {
			d.logger.Warn("signing driver: BTC release pool empty — cannot sign",
				"swap_id", sw.ID,
				"network", sw.DestinationNetwork,
			)
		}
		return
	}

	// Step 1 — pick a BTC release wallet.
	entry, perr := d.btcPool.Acquire(ctx, sw.DestinationNetwork)
	if perr != nil || entry == nil {
		if d.logger != nil {
			d.logger.Warn("BTC release pool acquire failed",
				"swap_id", sw.ID,
				"err", perr,
			)
		}
		return
	}
	if len(entry.Pubkey) == 0 {
		if d.logger != nil {
			d.logger.Warn("BTC release wallet has no pubkey — cannot sign",
				"swap_id", sw.ID,
				"wallet_id", entry.WalletID,
			)
		}
		return
	}

	d.attempts.Add(1)

	// Step 2 — claim the swap.
	claimed, err := d.store.Patch(ctx, sw.ID, func(s *Swap) {
		if s.Status != SwapStatusBridgeTransferPending {
			return
		}
		s.Status = SwapStatusSigning
		s.ReleaseWalletID = entry.WalletID
		s.ReleaseAddress = entry.Address
	})
	if err != nil || claimed == nil || claimed.Status != SwapStatusSigning {
		return
	}

	// Step 3 — PreSign. Convert the swap's float Amount to sats.
	// BTC has 8 decimal places, so 1 BTC == 1e8 sat. Multiplication
	// is done with float math then truncated — for the values
	// bridges handle (mBTC scale typically), float precision is
	// adequate. Operators sending whole-BTC quantities should still
	// be safe (1.0 → 100_000_000 exactly).
	valueSat := int64(sw.Amount * 1e8)
	if valueSat <= 0 {
		d.failures.Add(1)
		if d.logger != nil {
			d.logger.Warn("BTC swap amount converts to ≤ 0 sat",
				"swap_id", sw.ID,
				"amount", sw.Amount,
			)
		}
		_, _ = d.store.Patch(ctx, sw.ID, func(s *Swap) {
			if s.Status == SwapStatusSigning {
				s.Status = SwapStatusBridgeTransferPending
			}
			s.LastError = "BTC swap amount converts to 0 sat — increase amount"
		})
		return
	}

	spec := txassembler.BTCSpec{
		Network:     btcNetworkFromInternalName(sw.DestinationNetwork),
		FromAddress: entry.Address,
		FromPubKey:  entry.Pubkey,
		ToAddress:   sw.DestinationAddress,
		ValueSat:    valueSat,
	}
	sighashes, unsigned, aerr := d.btcAssembler.PreSign(ctx, spec)
	if aerr != nil {
		d.failures.Add(1)
		if d.logger != nil {
			d.logger.Warn("BTC PreSign failed",
				"swap_id", sw.ID,
				"err", aerr,
			)
		}
		isInsufficient := errors.Is(aerr, txassembler.ErrBTCInsufficientFunds)
		_, _ = d.store.Patch(ctx, sw.ID, func(s *Swap) {
			if s.Status != SwapStatusSigning {
				return
			}
			if isInsufficient {
				s.Status = SwapStatusFailedInsufficientReleaseGas
				s.LastErrorAt = time.Now().UTC()
				s.LastError = fmt.Sprintf(
					"BTC release wallet %s has insufficient funds for %d sat (value) + fee. Fund and trigger a retry.",
					entry.Address, valueSat,
				)
			} else {
				s.Status = SwapStatusBridgeTransferPending
				s.LastError = "BTC mempool/UTXO source unreachable while building tx — retrying"
			}
		})
		if isInsufficient {
			d.shortCircuited.Add(1)
		}
		return
	}

	// Step 4 — gas pre-check (BTC-specific). The assembler's PreSign
	// already short-circuits insufficient funds (we mapped that above
	// to SwapStatusFailedInsufficientReleaseGas), but we also want a
	// secondary balance check against the live confirmed balance —
	// catches the case where mempool.space's UTXO endpoint and its
	// /address endpoint disagree under network partition.
	if d.btcBalanceProbe != nil {
		probeCtx, cancel := context.WithTimeout(ctx, d.perBalanceTimeout)
		balance, berr := d.btcBalanceProbe.BalanceSat(probeCtx, spec.Network, entry.Address)
		cancel()
		if berr == nil {
			required := valueSat + unsigned.FeeSat
			if balance < required {
				d.shortCircuited.Add(1)
				reason := fmt.Sprintf(
					"BTC release wallet %s confirmed balance %d sat < required %d sat (value=%d + fee=%d). Fund wallet and trigger retry.",
					entry.Address, balance, required, valueSat, unsigned.FeeSat,
				)
				_, _ = d.store.Patch(ctx, sw.ID, func(s *Swap) {
					if s.Status == SwapStatusSigning {
						s.Status = SwapStatusFailedInsufficientReleaseGas
					}
					s.LastError = reason
					s.LastErrorAt = time.Now().UTC()
				})
				if d.logger != nil {
					d.logger.Warn("BTC gas pre-check failed",
						"swap_id", sw.ID,
						"wallet_id", entry.WalletID,
						"address", entry.Address,
						"reason", reason,
					)
				}
				return
			}
		} else if d.logger != nil {
			// Probe failure is best-effort; log and continue.
			d.logger.Debug("BTC balance probe failed (non-fatal)",
				"swap_id", sw.ID,
				"address", entry.Address,
				"err", berr,
			)
		}
	}

	// Step 5 — sign each input.
	sigs := make([]txassembler.BTCECDSASig, len(sighashes))
	for i, digest := range sighashes {
		sigCtx, cancel := context.WithTimeout(ctx, d.perSignTimeout)
		msgHex := "0x" + hex.EncodeToString(digest)
		res, signErr := d.signer.SignForWallet(sigCtx, entry.WalletID, msgHex)
		cancel()
		if signErr != nil {
			d.failures.Add(1)
			if d.logger != nil {
				d.logger.Warn("BTC signing ceremony failed",
					"swap_id", sw.ID,
					"wallet_id", entry.WalletID,
					"input_idx", i,
					"err", signErr,
				)
			}
			_, _ = d.store.Patch(ctx, sw.ID, func(s *Swap) {
				if s.Status == SwapStatusSigning {
					s.Status = SwapStatusBridgeTransferPending
				}
				s.LastError = "BTC MPC signing failed — retrying"
			})
			return
		}
		// Parse the dashboard's signature. The dashboard typically
		// returns r+s as separate hex fields; SignResult assembles
		// them into a 65-byte hex blob via parseDashboardSignResponse.
		// We split it back into (r, s) here.
		sig, parseErr := parseBTCSig(res.Signature)
		if parseErr != nil {
			d.failures.Add(1)
			if d.logger != nil {
				d.logger.Warn("BTC parse MPC signature failed",
					"swap_id", sw.ID,
					"input_idx", i,
					"err", parseErr,
				)
			}
			_, _ = d.store.Patch(ctx, sw.ID, func(s *Swap) {
				if s.Status == SwapStatusSigning {
					s.Status = SwapStatusBridgeTransferPending
				}
			})
			return
		}
		sigs[i] = *sig
	}

	// Step 6 — Finalize.
	rawTx, txid, ferr := d.btcAssembler.Finalize(unsigned, sigs)
	if ferr != nil {
		d.failures.Add(1)
		if d.logger != nil {
			d.logger.Warn("BTC Finalize failed",
				"swap_id", sw.ID,
				"err", ferr,
			)
		}
		_, _ = d.store.Patch(ctx, sw.ID, func(s *Swap) {
			if s.Status == SwapStatusSigning {
				s.Status = SwapStatusBridgeTransferPending
			}
		})
		return
	}
	rawTxHex := hex.EncodeToString(rawTx)

	// Step 7 — persist + advance.
	_, err = d.store.Patch(ctx, sw.ID, func(s *Swap) {
		if s.Status != SwapStatusSigning {
			return
		}
		s.DestRawTx = rawTxHex
		s.Status = SwapStatusBroadcasting
		s.LastError = ""
		s.LastErrorAt = time.Time{}
	})
	if err != nil {
		d.failures.Add(1)
		if d.logger != nil {
			d.logger.Warn("BTC persist DestRawTx",
				"swap_id", sw.ID,
				"err", err,
			)
		}
		return
	}
	d.successes.Add(1)
	if d.logger != nil {
		d.logger.Info("BTC signature received → advanced to broadcasting",
			"swap_id", sw.ID,
			"wallet_id", entry.WalletID,
			"txid", txid,
			"inputs", len(sighashes),
			"fee_sat", unsigned.FeeSat,
		)
	}
}

// parseBTCSig converts the MPC dashboard's signature surface into
// the (r, s) shape Finalize expects.
//
// The dashboard returns r+s either as a 65-byte concatenation that
// the upstream parseDashboardSignResponse already assembled into a
// hex string of length 130 (62 r-hex + 64 s-hex + 2 v-hex, padded),
// OR as a 130-char string that ParseRSV in txassembler/assembler.go
// already canonicalizes to low-s. We re-use ParseRSV to ride the
// existing low-s canonicalization logic, then re-pack into BTCECDSASig.
func parseBTCSig(signature string) (*txassembler.BTCECDSASig, error) {
	if signature == "" {
		return nil, errors.New("empty signature")
	}
	r, s, _, err := txassembler.ParseRSV(signature)
	if err != nil {
		return nil, fmt.Errorf("parse RSV: %w", err)
	}
	return &txassembler.BTCECDSASig{R: r, S: s}, nil
}
