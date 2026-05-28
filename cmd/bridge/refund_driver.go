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

	running atomic.Bool

	ticks      atomic.Uint64
	candidates atomic.Uint64
	successes  atomic.Uint64
	failures   atomic.Uint64
	listErrors atomic.Uint64

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
		perSignTimeout:      DefaultRefundPerSignTimeout,
		perBroadcastTimeout: DefaultRefundPerBroadcastTimeout,
		perBalanceTimeout:   DefaultRefundPerBalanceTimeout,
		logger:              logger,
	}
}

// Running reports whether the driver loop is active.
func (d *RefundDriver) Running() bool { return d.running.Load() }

// RefundDriverStats is a point-in-time view of the driver's counters.
type RefundDriverStats struct {
	Ticks      uint64 `json:"ticks"`
	Candidates uint64 `json:"candidates"`
	Successes  uint64 `json:"successes"`
	Failures   uint64 `json:"failures"`
	ListErrors uint64 `json:"list_errors"`
}

// Stats returns a point-in-time snapshot.
func (d *RefundDriver) Stats() RefundDriverStats {
	return RefundDriverStats{
		Ticks:      d.ticks.Load(),
		Candidates: d.candidates.Load(),
		Successes:  d.successes.Load(),
		Failures:   d.failures.Load(),
		ListErrors: d.listErrors.Load(),
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
		if !d.shouldRefund(sw, now) {
			continue
		}
		d.candidates.Add(1)
		d.refundOne(ctx, sw)
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
}

// shouldRefund encodes the trigger policy: a swap is a refund
// candidate iff it has been stuck at broadcasting with an
// insufficient-funds error for longer than the configured window.
func (d *RefundDriver) shouldRefund(sw *Swap, now time.Time) bool {
	if sw.Status != SwapStatusBroadcasting {
		return false
	}
	if sw.LastError == "" || sw.LastErrorAt.IsZero() {
		return false
	}
	if !strings.Contains(strings.ToLower(sw.LastError), "insufficient funds") {
		return false
	}
	if now.Sub(sw.LastErrorAt) < d.refundAfter {
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
func (d *RefundDriver) rollback(ctx context.Context, id string, cause error) {
	d.failures.Add(1)
	if d.logger != nil {
		d.logger.Warn("refund failed — rolling back to broadcasting",
			"swap_id", id,
			"err", cause,
		)
	}
	_, _ = d.store.Patch(ctx, id, func(s *Swap) {
		if s.Status != SwapStatusRefunding {
			return
		}
		s.Status = SwapStatusBroadcasting
		// Surface the refund failure on LastError so operators can
		// see why the auto-revert didn't land. Doesn't reset
		// LastErrorAt — keeps next-tick eligibility window unchanged.
		s.LastError = "Refund attempt failed (retrying): " + truncRefundErr(cause, 120)
	})
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
