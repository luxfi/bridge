package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	luxlog "github.com/luxfi/log"

	"github.com/luxfi/bridge/internal/broadcast"
	"github.com/luxfi/bridge/internal/depositcheck"
	"github.com/luxfi/bridge/internal/mchain"
	"github.com/luxfi/bridge/internal/txassembler"
)

// refund_driver.go: background goroutine that sweeps a swap's
// source-chain deposit back to the original sender when the
// destination broadcast leg has been stuck "insufficient funds" for
// too long.
//
// Pipeline position (off the main happy path):
//
//   bridge_transfer_pending_broadcasting   ── BroadcastDriver retrying ──┐
//                                                                         │
//   (LastError contains "insufficient funds" for > RefundAfter)            │
//                                                                         ▼
//   refunding                              ── RefundDriver (this file) ──┐
//                                                                         ▼
//   refunded                               (RefundTxHash populated; user got source-chain funds back)
//
// Decision policy in shouldRefund(). Execution policy in refundOne():
//   1. Patch status SwapStatusBroadcasting → SwapStatusRefunding so a
//      restart-mid-refund doesn't double-spend.
//   2. Read the source-chain balance at the MPC deposit address.
//   3. Build an EIP-155 refund tx FROM the MPC deposit address TO
//      the original sender for (balance − gas) on the source chain.
//   4. Have the MPC quorum sign the sighash. Same key signs the
//      destination release AND the source refund — same eth_address
//      on every EVM chain.
//   5. Broadcast on the source chain.
//   6. Patch status SwapStatusRefunding → SwapStatusRefunded +
//      RefundTxHash. Terminal.
//
// On any mid-flow failure, status rolls back to SwapStatusBroadcasting
// so the broadcast driver or refund driver can retry on the next tick.

// RefundDriver polls broadcasting swaps that have been blocked by
// insufficient funds for too long and sweeps the deposit back.
// Concurrency-safe; one instance per bridge process.
type RefundDriver struct {
	store     SwapStore
	signer    MPCSigner
	bcaster   Broadcaster
	assembler *txassembler.Assembler
	interval  time.Duration
	logger    luxlog.Logger

	// rpcOverrides shadows depositcheck's RPC URL table when querying
	// the source-chain balance of the MPC deposit address. Operators
	// set this via --source-rpc-overrides (same flag main.go reuses
	// across the deposit watcher + broadcast client + assembler).
	rpcOverrides map[string]string

	// httpClient is reused across balance queries; populated to the
	// configured timeout. Zero ⇒ http.DefaultClient.
	httpClient *http.Client

	// refundAfter is the grace window between LastErrorAt and now that
	// must elapse before the driver considers a swap unrecoverable.
	// 90s default — gives the user time to pre-fund via the faucet
	// helper before the bridge auto-reverts.
	refundAfter time.Duration

	// perSignTimeout caps each MPC sign call (mirrors signing_driver).
	perSignTimeout time.Duration
	// perBroadcastTimeout caps each source-chain broadcast.
	perBroadcastTimeout time.Duration
	// perBalanceTimeout caps each eth_getBalance call.
	perBalanceTimeout time.Duration

	// maxRefundAttempts caps consecutive refund-rollback iterations
	// per swap. When >0 and a swap's RefundAttempts reaches this
	// value after a failed refund step (MPC sign timeout, balance
	// fetch error, broadcast failure, etc.), the rollback path moves
	// the swap to SwapStatusFailed instead of returning it to
	// broadcasting. Catches persistent mpcd / cluster failures that
	// would otherwise oscillate refunding ↔ broadcasting forever
	// (the empirical case that motivated this guard:
	// swap_5010a8…1391's MPC sign endpoint returning 504 every time
	// because the wallet's MPC session state was lost on rotation).
	// Zero ⇒ unbounded (legacy behavior).
	maxRefundAttempts int

	// orphanRefundingAfter is how long a swap must sit in
	// SwapStatusRefunding (measured against Swap.UpdatedAt) before
	// the orphan-recovery path on each tick reclaims it. Orphans
	// happen when the bridge process is killed mid-refund: the swap
	// was claimed from broadcasting / refund_pending into refunding,
	// the in-flight MPC sign / balance fetch never completed, and
	// neither driver scans `refunding` on subsequent ticks. The
	// recovery rolls them back to SwapStatusRefundPending and bumps
	// RefundAttempts so the persistent-failure ceiling still applies
	// across orphan-restart cycles. Zero ⇒ orphan recovery disabled
	// (operator must intervene manually); defaults to
	// DefaultOrphanRefundingAfter.
	orphanRefundingAfter time.Duration

	running atomic.Bool

	ticks             atomic.Uint64
	candidates        atomic.Uint64
	successes         atomic.Uint64
	failures          atomic.Uint64
	terminalFailures  atomic.Uint64
	orphansRecovered  atomic.Uint64
	listErrors        atomic.Uint64

	stopOnce      sync.Once
	cancelRunning context.CancelFunc
}

// DefaultRefundInterval is the tick cadence for the refund driver.
// 15s is slow enough to not race the broadcast driver's 5s retries —
// the broadcast driver wins if a late funding tx lands.
const DefaultRefundInterval = 15 * time.Second

// DefaultRefundAfter is the elapsed-since-LastErrorAt threshold that
// triggers a refund. 90s lets the user run /root/bin/lux-faucet.sh
// before the bridge gives up.
const DefaultRefundAfter = 90 * time.Second

// DefaultRefundPerSignTimeout caps each MPC sign call.
const DefaultRefundPerSignTimeout = 75 * time.Second

// DefaultRefundPerBroadcastTimeout caps each source-chain broadcast.
const DefaultRefundPerBroadcastTimeout = 15 * time.Second

// DefaultRefundPerBalanceTimeout caps eth_getBalance.
const DefaultRefundPerBalanceTimeout = 8 * time.Second

// DefaultMaxRefundAttempts is the post-rollback ceiling that flips a
// stuck swap to SwapStatusFailed. 5 attempts ≈ 5 × refundInterval =
// ~75 s of cluster-failure tolerance before declaring the swap
// unrecoverable. Tune up for noisier clusters; tune down if operators
// would rather fail-fast than spend MPC quota retrying.
const DefaultMaxRefundAttempts = 5

// DefaultOrphanRefundingAfter is how long a swap can sit in
// SwapStatusRefunding before the orphan-recovery path reclaims it.
// 5 m is well past any reasonable in-flight refund cycle (the worst-
// case sum of perSignTimeout=75s + perBroadcastTimeout=15s +
// perBalanceTimeout=8s + slack). Tune up if your environment has
// unusually slow MPC ceremonies that legitimately exceed this; tune
// down if operators want faster recovery after a crash.
const DefaultOrphanRefundingAfter = 5 * time.Minute

// NewRefundDriver builds a driver with sensible defaults.
func NewRefundDriver(
	store SwapStore,
	signer MPCSigner,
	bcaster Broadcaster,
	assembler *txassembler.Assembler,
	interval, refundAfter time.Duration,
	rpcOverrides map[string]string,
	logger luxlog.Logger,
) *RefundDriver {
	if interval <= 0 {
		interval = DefaultRefundInterval
	}
	if refundAfter <= 0 {
		refundAfter = DefaultRefundAfter
	}
	return &RefundDriver{
		store:               store,
		signer:              signer,
		bcaster:             bcaster,
		assembler:           assembler,
		interval:            interval,
		refundAfter:         refundAfter,
		rpcOverrides:        rpcOverrides,
		httpClient:          &http.Client{Timeout: DefaultRefundPerBalanceTimeout},
		perSignTimeout:       DefaultRefundPerSignTimeout,
		perBroadcastTimeout:  DefaultRefundPerBroadcastTimeout,
		perBalanceTimeout:    DefaultRefundPerBalanceTimeout,
		maxRefundAttempts:    DefaultMaxRefundAttempts,
		orphanRefundingAfter: DefaultOrphanRefundingAfter,
		logger:               logger,
	}
}

// Running reports whether the driver loop is active.
func (d *RefundDriver) Running() bool { return d.running.Load() }

// SetMaxRefundAttempts configures the persistent-failure ceiling.
// After this many consecutive rollbacks (MPC sign / balance / broadcast
// errors on the refund leg), the swap moves to SwapStatusFailed
// instead of looping back to broadcasting. Zero disables the ceiling
// (legacy: retry forever). Defaults to DefaultMaxRefundAttempts when
// not set.
func (d *RefundDriver) SetMaxRefundAttempts(n int) {
	if n < 0 {
		n = 0
	}
	d.maxRefundAttempts = n
}

// SetOrphanRefundingAfter configures the orphan-recovery threshold.
// A swap in SwapStatusRefunding whose UpdatedAt is older than this
// duration is rolled back to SwapStatusRefundPending so the next
// refund tick can retry it. RefundAttempts is bumped on recovery so
// repeated orphan-restart cycles still hit the persistent-failure
// ceiling. Zero disables orphan recovery entirely (operator must
// intervene manually).
func (d *RefundDriver) SetOrphanRefundingAfter(after time.Duration) {
	if after < 0 {
		after = 0
	}
	d.orphanRefundingAfter = after
}

// RefundDriverStats is a point-in-time view of the driver's counters.
type RefundDriverStats struct {
	Ticks      uint64 `json:"ticks"`
	Candidates uint64 `json:"candidates"`
	Successes  uint64 `json:"successes"`
	Failures   uint64 `json:"failures"`
	// TerminalFailures counts swaps moved to SwapStatusFailed because
	// they were stuck broadcasting past the refund window AND could
	// not be auto-refunded (Sender or DepositAddress missing). These
	// require operator intervention to recover.
	TerminalFailures uint64 `json:"terminal_failures"`
	// OrphansRecovered counts swaps reclaimed from SwapStatusRefunding
	// by the orphan-recovery path. A non-zero value usually indicates
	// the bridge was killed mid-refund at some point; a steady stream
	// is a smell.
	OrphansRecovered uint64 `json:"orphans_recovered"`
	ListErrors       uint64 `json:"list_errors"`
}

// Stats returns a point-in-time snapshot.
func (d *RefundDriver) Stats() RefundDriverStats {
	return RefundDriverStats{
		Ticks:            d.ticks.Load(),
		Candidates:       d.candidates.Load(),
		Successes:        d.successes.Load(),
		Failures:         d.failures.Load(),
		TerminalFailures: d.terminalFailures.Load(),
		OrphansRecovered: d.orphansRecovered.Load(),
		ListErrors:       d.listErrors.Load(),
	}
}

// Run blocks until ctx is cancelled.
func (d *RefundDriver) Run(ctx context.Context) error {
	if !d.running.CompareAndSwap(false, true) {
		return nil
	}
	defer d.running.Store(false)

	ctx, cancel := context.WithCancel(ctx)
	d.cancelRunning = cancel
	defer cancel()

	if d.logger != nil {
		d.logger.Info("refund driver started",
			"interval", d.interval,
			"refund_after", d.refundAfter,
		)
	}
	d.tick(ctx)
	ticker := time.NewTicker(d.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			if d.logger != nil {
				d.logger.Info("refund driver stopped",
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
func (d *RefundDriver) Stop() {
	d.stopOnce.Do(func() {
		if d.cancelRunning != nil {
			d.cancelRunning()
		}
	})
}

// Tick runs a single iteration. Exported for tests.
func (d *RefundDriver) Tick(ctx context.Context) { d.tick(ctx) }

func (d *RefundDriver) tick(ctx context.Context) {
	d.ticks.Add(1)

	// Path 1: legacy — broadcasting swaps stuck on insufficient funds.
	// Trigger requires the 90 s grace window since LastErrorAt.
	swaps, err := d.store.List(ctx, SwapFilter{Status: SwapStatusBroadcasting})
	if err != nil {
		d.listErrors.Add(1)
		if d.logger != nil {
			d.logger.Warn("refund driver: list broadcasting swaps", "err", err)
		}
	}
	now := time.Now().UTC()
	for _, sw := range swaps {
		if ctx.Err() != nil {
			return
		}
		if d.shouldRefund(sw, now) {
			d.candidates.Add(1)
			d.refundOne(ctx, sw)
			continue
		}
		// Stuck-but-unrefundable: same trigger conditions as a refund
		// candidate (status, insufficient-funds error, grace window
		// elapsed) EXCEPT Sender / DepositAddress are missing so
		// auto-refund isn't possible. Route to terminal SwapStatusFailed
		// rather than letting the broadcast driver burn RPC quota
		// retrying forever. Operator can recover manually from the
		// recorded LastError + deposit / signature material on the
		// swap row.
		if d.isStuckUnrefundable(sw, now) {
			d.failTerminal(ctx, sw, now)
		}
	}

	// Path 2: stale-quote handoff from the signing driver. These swaps
	// are already tagged for refund — no insufficient-funds gate, no
	// grace window. Refund immediately.
	pending, err := d.store.List(ctx, SwapFilter{Status: SwapStatusRefundPending})
	if err != nil {
		d.listErrors.Add(1)
		if d.logger != nil {
			d.logger.Warn("refund driver: list refund_pending swaps", "err", err)
		}
		return
	}
	for _, sw := range pending {
		if ctx.Err() != nil {
			return
		}
		if sw.Sender == "" || sw.DepositAddress == "" {
			continue
		}
		d.candidates.Add(1)
		d.refundPending(ctx, sw)
	}

	// Path 3: orphan-refunding recovery. A swap in SwapStatusRefunding
	// whose UpdatedAt is older than orphanRefundingAfter was clearly
	// abandoned by a prior tick that died mid-flow (bridge crashed,
	// SIGTERM during the MPC sign / balance fetch, etc.). Roll it
	// back to SwapStatusRefundPending so the next tick re-enters the
	// pending path; bump RefundAttempts so repeated crash/recover
	// cycles still hit the persistent-failure ceiling.
	if d.orphanRefundingAfter > 0 {
		orphans, err := d.store.List(ctx, SwapFilter{Status: SwapStatusRefunding})
		if err != nil {
			d.listErrors.Add(1)
			if d.logger != nil {
				d.logger.Warn("refund driver: list refunding swaps", "err", err)
			}
			return
		}
		for _, sw := range orphans {
			if ctx.Err() != nil {
				return
			}
			if !d.isOrphanedRefunding(sw, now) {
				continue
			}
			d.recoverOrphan(ctx, sw, now)
		}
	}
}

// shouldRefund encodes the trigger policy: a swap is a refund
// candidate iff it has been stuck at broadcasting with an
// insufficient-funds error for longer than the configured window.
//
// Grace-window note: a swap with LastError populated but LastErrorAt
// zero is treated as definitely past the window. Some legacy code
// paths persisted the swap state without populating LastErrorAt, and
// retrying forever isn't a useful default. Operators who don't want
// this behaviour can either set --refund-after very high or run a
// one-time migration to backfill LastErrorAt.
func (d *RefundDriver) shouldRefund(sw *Swap, now time.Time) bool {
	if sw.Status != SwapStatusBroadcasting {
		return false
	}
	if sw.LastError == "" {
		return false
	}
	if !strings.Contains(strings.ToLower(sw.LastError), "insufficient funds") {
		return false
	}
	if !sw.LastErrorAt.IsZero() && now.Sub(sw.LastErrorAt) < d.refundAfter {
		return false
	}
	if sw.Sender == "" {
		// Nothing to refund TO. The original sender wasn't captured
		// on swap creation. Operator must trigger a manual sweep.
		return false
	}
	if sw.DepositAddress == "" {
		return false
	}
	return true
}

// isStuckUnrefundable reports whether a swap is stuck broadcasting AND
// can't be auto-refunded because the bridge doesn't have what it
// needs to construct the refund tx (Sender address or DepositAddress).
// The trigger conditions otherwise match shouldRefund: status =
// broadcasting, last error mentions "insufficient funds", and the
// refund-after grace window has elapsed since LastErrorAt. Swaps
// matching this predicate are routed to failTerminal so they leave
// the retry loop and surface as SwapStatusFailed for operator
// intervention.
//
// Mainly hits two scenarios:
//
//  1. Legacy swaps created before the Sender-fallback logic in
//     swaps_handler.go (older revisions of the create handler didn't
//     copy DestinationAddress to Sender on empty input).
//  2. Wallet-rotation residue — a swap signed by a release wallet
//     key that's since been rotated, where the chain reports
//     "insufficient funds" because the signature recovers to a
//     different address than the current release wallet. The
//     condition surfaces here once the refund-after window has
//     elapsed without progress.
func (d *RefundDriver) isStuckUnrefundable(sw *Swap, now time.Time) bool {
	if sw.Status != SwapStatusBroadcasting {
		return false
	}
	if sw.LastError == "" {
		return false
	}
	if !strings.Contains(strings.ToLower(sw.LastError), "insufficient funds") {
		return false
	}
	// Same grace-window note as shouldRefund: zero LastErrorAt is
	// treated as past-window so legacy state doesn't loop forever.
	if !sw.LastErrorAt.IsZero() && now.Sub(sw.LastErrorAt) < d.refundAfter {
		return false
	}
	// The whole point: refund-precondition fields are missing.
	return sw.Sender == "" || sw.DepositAddress == ""
}

// isOrphanedRefunding reports whether a swap in SwapStatusRefunding
// has been there long enough to be considered abandoned. Threshold
// compares against Swap.UpdatedAt — the store stamps it on every
// Patch, so a refund leg in normal progress (where every step writes
// the swap) keeps UpdatedAt fresh and stays under the threshold.
// Only swaps whose containing tick was killed mid-flow accumulate
// stale UpdatedAt.
func (d *RefundDriver) isOrphanedRefunding(sw *Swap, now time.Time) bool {
	if sw.Status != SwapStatusRefunding {
		return false
	}
	if sw.UpdatedAt.IsZero() {
		// Legacy persisted state without UpdatedAt — treat as old.
		// Better to recover loudly than leave a swap stuck forever.
		return true
	}
	return now.Sub(sw.UpdatedAt) >= d.orphanRefundingAfter
}

// recoverOrphan rolls an abandoned refunding swap back to
// SwapStatusRefundPending so the refund-pending path on a subsequent
// tick can retry the flow. Bumps RefundAttempts so the persistent-
// failure ceiling still applies across crash/restart cycles — an
// environment that crashes mid-refund repeatedly will eventually flip
// the swap to SwapStatusFailed via the ceiling path, surfacing the
// problem for ops.
//
// Idempotent: the inner Patch is gated on status == SwapStatusRefunding,
// so a parallel tick or already-recovered swap is a no-op.
func (d *RefundDriver) recoverOrphan(ctx context.Context, sw *Swap, now time.Time) {
	stale := now.Sub(sw.UpdatedAt).Round(time.Second)
	patched, err := d.store.Patch(ctx, sw.ID, func(s *Swap) {
		if s.Status != SwapStatusRefunding {
			return
		}
		s.Status = SwapStatusRefundPending
		s.RefundAttempts++
		// Surface the recovery on LastError so the SDK / operator can
		// see what happened. Don't overwrite LastErrorAt — preserves
		// the original "stuck since" stamp from before the orphan.
		s.LastError = fmt.Sprintf(
			"Recovered orphaned refund (stale for %s, attempt %d/%d): the prior refund leg was abandoned mid-flow",
			stale, s.RefundAttempts, d.maxRefundAttempts,
		)
	})
	if err != nil {
		d.failures.Add(1)
		if d.logger != nil {
			d.logger.Warn("orphan recovery patch error",
				"swap_id", sw.ID,
				"err", err,
			)
		}
		return
	}
	if patched == nil || patched.Status != SwapStatusRefundPending {
		// Lost the race or guard short-circuited.
		return
	}
	d.orphansRecovered.Add(1)
	if d.logger != nil {
		d.logger.Warn("orphaned refunding swap recovered",
			"swap_id", sw.ID,
			"stale_for", stale,
			"new_attempts", patched.RefundAttempts,
		)
	}
}

// failTerminal transitions a stuck-unrefundable swap to
// SwapStatusFailed (terminal) with a clear LastError that points the
// operator at the recovery material on the swap row (signature,
// deposit address, dest_raw_tx). Burns a terminalFailures counter so
// operators can monitor how often this fires — a steady stream of
// terminal failures usually means an upstream config issue (release
// wallet rotation, missing Sender propagation, etc.) rather than
// random one-off failures.
func (d *RefundDriver) failTerminal(ctx context.Context, sw *Swap, now time.Time) {
	var stuckFor string
	if sw.LastErrorAt.IsZero() {
		stuckFor = "(unknown — legacy swap with no error timestamp)"
	} else {
		stuckFor = now.Sub(sw.LastErrorAt).Round(time.Second).String()
	}
	reason := fmt.Sprintf(
		"stuck broadcasting for %s with %q — no auto-refund possible (sender_empty=%t, deposit_empty=%t); operator must sweep manually",
		stuckFor,
		sw.LastError,
		sw.Sender == "",
		sw.DepositAddress == "",
	)

	patched, err := d.store.Patch(ctx, sw.ID, func(s *Swap) {
		// Defensive re-check inside the lock: another tick or driver
		// could have advanced the swap before us. Only fail-terminal
		// from broadcasting; if it's already moved, skip.
		if s.Status != SwapStatusBroadcasting {
			return
		}
		s.Status = SwapStatusFailed
		s.LastError = reason
		s.LastErrorAt = now
	})
	if err != nil {
		d.failures.Add(1)
		if d.logger != nil {
			d.logger.Warn("fail-terminal patch error",
				"swap_id", sw.ID,
				"err", err,
			)
		}
		return
	}
	if patched == nil || patched.Status != SwapStatusFailed {
		// Lost the race or guard short-circuited — neither a success
		// nor a failure from our POV.
		return
	}
	d.terminalFailures.Add(1)
	if d.logger != nil {
		d.logger.Warn("swap stuck broadcasting → terminal failed",
			"swap_id", sw.ID,
			"stuck_for", stuckFor,
			"last_error", sw.LastError,
			"sender_empty", sw.Sender == "",
			"deposit_empty", sw.DepositAddress == "",
		)
	}
}

// refundOne is the per-swap refund flow. Atomic-ish: claims the swap
// via a status patch first so a parallel driver doesn't double-fire.
func (d *RefundDriver) refundOne(ctx context.Context, sw *Swap) {
	walletID := extractWalletID(sw.DepositAddress)
	depositAddr := extractDepositAddress(sw.DepositAddress)
	if walletID == "" || depositAddr == "" {
		return
	}

	// Claim the swap. If a parallel tick / restart raced us, give up.
	claimed, err := d.store.Patch(ctx, sw.ID, func(s *Swap) {
		if s.Status != SwapStatusBroadcasting {
			return
		}
		s.Status = SwapStatusRefunding
	})
	if err != nil || claimed == nil || claimed.Status != SwapStatusRefunding {
		return
	}
	if d.logger != nil {
		d.logger.Info("refund triggered",
			"swap_id", sw.ID,
			"deposit_addr", depositAddr,
			"sender", sw.Sender,
			"elapsed_since_last_error", time.Since(sw.LastErrorAt),
		)
	}

	d.executeRefund(ctx, sw, walletID, depositAddr)
}

// refundPending handles the stale-quote entry into the refund pipeline.
// The signing driver has already moved the swap to SwapStatusRefundPending
// (with LastError="quote_stale: ..."); we claim it into SwapStatusRefunding
// and run the same balance-sweep flow as refundOne.
func (d *RefundDriver) refundPending(ctx context.Context, sw *Swap) {
	walletID := extractWalletID(sw.DepositAddress)
	depositAddr := extractDepositAddress(sw.DepositAddress)
	if walletID == "" || depositAddr == "" {
		return
	}

	claimed, err := d.store.Patch(ctx, sw.ID, func(s *Swap) {
		if s.Status != SwapStatusRefundPending {
			return
		}
		s.Status = SwapStatusRefunding
	})
	if err != nil || claimed == nil || claimed.Status != SwapStatusRefunding {
		return
	}
	if d.logger != nil {
		d.logger.Info("refund triggered (stale quote)",
			"swap_id", sw.ID,
			"deposit_addr", depositAddr,
			"sender", sw.Sender,
			"quote_age", time.Since(sw.CreatedAt),
			"last_error", sw.LastError,
		)
	}

	d.executeRefund(ctx, sw, walletID, depositAddr)
}

// executeRefund runs the post-claim refund pipeline: read source-chain
// balance, build/sign/broadcast a sweep tx, mark the swap refunded.
// Caller must have already transitioned the swap to SwapStatusRefunding.
func (d *RefundDriver) executeRefund(ctx context.Context, sw *Swap, walletID, depositAddr string) {
	// Step 1 — get source-chain balance at the deposit address.
	balanceCtx, cancelBal := context.WithTimeout(ctx, d.perBalanceTimeout)
	balance, err := d.fetchBalance(balanceCtx, sw.SourceNetwork, depositAddr)
	cancelBal()
	if err != nil {
		d.rollback(ctx, sw.ID, fmt.Errorf("fetch balance: %w", err))
		return
	}

	// Step 2 — compute refund value = balance - (gasLimit * gasPrice).
	// We let the assembler tell us the gas price (it queries the
	// source-chain RPC). 21000 gas covers a pure native transfer.
	gasPrice, err := d.assembler.Provider.SuggestGasPrice(ctx, sw.SourceNetwork)
	if err != nil {
		d.rollback(ctx, sw.ID, fmt.Errorf("gas price: %w", err))
		return
	}
	gasCost := new(big.Int).Mul(gasPrice, big.NewInt(21000))
	refundValue := new(big.Int).Sub(balance, gasCost)
	if refundValue.Sign() <= 0 {
		// Balance can't cover gas. Nothing to refund. Skip — leave
		// status at refunding so an operator can see it stuck and
		// triage manually (vs silently rolling back, which would
		// re-fire on the next tick).
		_, _ = d.store.Patch(ctx, sw.ID, func(s *Swap) {
			s.LastError = fmt.Sprintf("Refund impossible: deposit balance %s wei < gas cost %s wei",
				balance.String(), gasCost.String())
		})
		d.failures.Add(1)
		if d.logger != nil {
			d.logger.Warn("refund impossible: balance < gas",
				"swap_id", sw.ID,
				"balance_wei", balance.String(),
				"gas_cost_wei", gasCost.String(),
			)
		}
		return
	}

	// Step 3 — build the unsigned refund tx via the source-chain
	// network config the assembler already knows about.
	unsigned, err := d.assembler.PreSignNativeTransfer(ctx, sw.SourceNetwork, depositAddr, sw.Sender, refundValue)
	if err != nil {
		d.rollback(ctx, sw.ID, fmt.Errorf("preSign refund: %w", err))
		return
	}

	// Step 4 — MPC sign the sighash.
	sigCtx, cancelSig := context.WithTimeout(ctx, d.perSignTimeout)
	res, err := d.signer.SignForWallet(sigCtx, walletID, fmt.Sprintf("0x%x", unsigned.SigHash))
	cancelSig()
	if err != nil {
		d.rollback(ctx, sw.ID, fmt.Errorf("MPC sign refund: %w", err))
		return
	}

	// Step 5 — finalize the signed raw tx.
	r, s, v, err := txassembler.ParseRSV(res.Signature)
	if err != nil {
		d.rollback(ctx, sw.ID, fmt.Errorf("parse refund signature: %w", err))
		return
	}
	rawTx, err := d.assembler.Finalize(unsigned, r, s, v)
	if err != nil {
		d.rollback(ctx, sw.ID, fmt.Errorf("finalize refund: %w", err))
		return
	}

	// Step 6 — broadcast on the source chain.
	pushCtx, cancelPush := context.WithTimeout(ctx, d.perBroadcastTimeout)
	bres, err := d.bcaster.Broadcast(pushCtx, sw.SourceNetwork, rawTx)
	cancelPush()
	if err != nil {
		d.rollback(ctx, sw.ID, fmt.Errorf("broadcast refund: %w", err))
		return
	}

	// Step 7 — mark refunded.
	_, _ = d.store.Patch(ctx, sw.ID, func(s *Swap) {
		s.Status = SwapStatusRefunded
		s.RefundTxHash = bres.TxHash
		s.LastError = ""
		s.LastErrorAt = time.Time{}
		// Clear the attempt counter on terminal success so a future
		// (unrelated) swap reusing the same ID — operationally
		// unlikely but defensively cheap — starts from a clean slate.
		s.RefundAttempts = 0
	})
	d.successes.Add(1)
	if d.logger != nil {
		d.logger.Info("refund completed",
			"swap_id", sw.ID,
			"refund_tx_hash", bres.TxHash,
			"refund_value_wei", refundValue.String(),
		)
	}
}

// fetchBalance queries eth_getBalance on the source chain's JSON-RPC
// endpoint. Uses the same URL resolution policy as the broadcast
// client + assembler: overrides shadow the depositcheck table.
func (d *RefundDriver) fetchBalance(ctx context.Context, network, addr string) (*big.Int, error) {
	url := d.rpcOverrides[network]
	if url == "" {
		url = depositcheck.RPCURLFor(network)
	}
	if url == "" {
		return nil, fmt.Errorf("no RPC URL configured for network %s", network)
	}

	body, _ := json.Marshal(map[string]any{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  "eth_getBalance",
		"params":  []any{addr, "latest"},
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := d.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("eth_getBalance HTTP %d: %s", resp.StatusCode, truncRefund(respBody, 200))
	}
	var parsed struct {
		Result string `json:"result"`
		Error  *struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		} `json:"error,omitempty"`
	}
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return nil, fmt.Errorf("decode balance: %w", err)
	}
	if parsed.Error != nil {
		return nil, fmt.Errorf("eth_getBalance rpc %d: %s", parsed.Error.Code, parsed.Error.Message)
	}
	hex := strings.TrimPrefix(strings.TrimPrefix(parsed.Result, "0x"), "0X")
	if hex == "" {
		return big.NewInt(0), nil
	}
	n, ok := new(big.Int).SetString(hex, 16)
	if !ok {
		return nil, fmt.Errorf("balance: invalid hex %q", parsed.Result)
	}
	return n, nil
}

// rollback returns the swap to SwapStatusBroadcasting so a future
// tick (refund OR broadcast — broadcast wins if user funded the
// release address in the meantime) can try again.
//
// Persistent-failure handling: each rollback increments
// Swap.RefundAttempts. When it reaches d.maxRefundAttempts, the
// rollback short-circuits to SwapStatusFailed instead of broadcasting
// — catches mpcd cluster outages, wallet-rotation residue, and other
// upstream conditions where retrying forever wastes MPC quota
// without ever making progress. Operators surface this via the
// terminal_failures counter + the swap's LastError.
func (d *RefundDriver) rollback(ctx context.Context, id string, cause error) {
	d.failures.Add(1)
	if d.logger != nil {
		d.logger.Warn("refund failed — rolling back",
			"swap_id", id,
			"err", cause,
		)
	}
	var maxedOut bool
	var attempts int
	patched, _ := d.store.Patch(ctx, id, func(s *Swap) {
		if s.Status != SwapStatusRefunding {
			return
		}
		s.RefundAttempts++
		attempts = s.RefundAttempts
		// Persistent-failure short-circuit: after maxRefundAttempts
		// consecutive failures, the refund flow has clearly not
		// going to recover on its own. Move to terminal failed with
		// an operator-actionable LastError. Zero maxRefundAttempts
		// disables this ceiling (legacy "retry forever").
		if d.maxRefundAttempts > 0 && s.RefundAttempts >= d.maxRefundAttempts {
			s.Status = SwapStatusFailed
			s.LastError = fmt.Sprintf(
				"Refund failed %d times (max=%d) — likely upstream mpcd / RPC issue: %s; manual recovery required",
				s.RefundAttempts, d.maxRefundAttempts, truncRefundErr(cause, 120),
			)
			s.LastErrorAt = time.Now().UTC()
			maxedOut = true
			return
		}
		s.Status = SwapStatusBroadcasting
		// IMPORTANT: leave LastError + LastErrorAt alone below the
		// ceiling. The broadcast driver overwrites LastError on its
		// next attempt with the canonical insufficient-funds string,
		// which is what shouldRefund matches on to re-pick the swap
		// for the next refund tick. If we wrote a "Refund attempt
		// N/M failed" message here, shouldRefund wouldn't match
		// (different text) and the refund cycle would stall in tests
		// that don't run the broadcast driver. RefundAttempts is the
		// only piece of state the rollback path needs to mutate
		// below the ceiling.
	})
	if maxedOut && patched != nil && patched.Status == SwapStatusFailed {
		d.terminalFailures.Add(1)
		if d.logger != nil {
			d.logger.Warn("refund maxed out → terminal failed",
				"swap_id", id,
				"attempts", attempts,
				"max", d.maxRefundAttempts,
				"final_err", cause,
			)
		}
	}
}

func truncRefund(b []byte, n int) string {
	if len(b) <= n {
		return string(b)
	}
	return string(b[:n]) + "…"
}

func truncRefundErr(err error, n int) string {
	if err == nil {
		return ""
	}
	s := err.Error()
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

// Compile-time interface guards (also serve as imports anchors).
var _ MPCSigner = (*mchain.Client)(nil)
var _ Broadcaster = (*broadcast.Client)(nil)
var _ = errors.New
