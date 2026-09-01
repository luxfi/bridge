package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"sync"
	"time"
)

// swap_store.go: denormalized UX cache for the cmd/bridge daemon.
//
// AUTHORITATIVE STATE LIVES ON THE B-CHAIN. The bridge is
// permissionless and non-custodial — chains/bridgevm's swap store
// (built atop the validator quorum's consensus) is the source of truth
// for pending / in-flight / completed bridge requests. This local
// store is a cache so the daemon's HTTP API can answer reads quickly
// without round-tripping to /v1/chain/B/rpc for every request.
//
// ON CONFLICT, B-CHAIN WINS. Run `bridge --resync-swaps` to rebuild
// the local cache from authoritative chain state. The daemon refuses
// to mutate swap state in a way that contradicts what B-Chain has
// already accepted; pending writes that haven't yet been observed on
// chain are best-effort and will be reconciled by --resync-swaps or
// by the deposit-watcher's next tick (whichever happens first).
//
// The `SwapStore` interface is the seam where hanzoai/base or another
// durable backend slots in later. `InMemoryStore` is the dev default:
// concurrency-safe, lossy on restart, fine for testing + first deploys.
// For production durability, swap in a hanzoai/base-backed
// implementation that satisfies the same interface (see
// /root/luxify/mpc/cmd/mpcd/main.go for the base.New() pattern).

// =============================================================================
// Domain
// =============================================================================

// SwapStatus is the lifecycle state of a bridge intent.
type SwapStatus string

const (
	// User has submitted intent; deposit address minted; waiting for funds.
	SwapStatusUserDepositPending SwapStatus = "user_deposit_pending"
	// Deposit observed on source chain; ready to drive MPC ceremony.
	SwapStatusBridgeTransferPending SwapStatus = "bridge_transfer_pending"
	// MPC threshold quorum is signing the release tx.
	SwapStatusSigning SwapStatus = "bridge_transfer_pending_signing"
	// Signed payload broadcast on destination chain; waiting for inclusion.
	SwapStatusBroadcasting SwapStatus = "bridge_transfer_pending_broadcasting"
	// BTC-only intermediate state: the release tx was accepted into the
	// mempool but isn't confirmed yet. For every other family "broadcast
	// accepted" is effectively final, so they skip straight to Completed.
	// Bitcoin can accept a low-fee tx into the mempool and then never
	// mine it (fee market rises, or the tx is evicted), so a BTC release
	// only reaches Completed once the confirmation watcher in the
	// broadcast driver sees it in a block. While here, the watcher either
	// promotes it to Completed or — after a timeout — rebuilds it with a
	// higher (RBF) feerate. Non-terminal; the SDK/UI must render this as
	// "in progress", NOT done.
	SwapStatusAwaitingConfirmation SwapStatus = "bridge_transfer_pending_confirmation"
	// Final settlement: funds arrived at destination address.
	SwapStatusCompleted SwapStatus = "completed"
	// Destination broadcast couldn't land (e.g. insufficient funds at the
	// MPC release address) and a timeout elapsed; the refund driver is
	// sweeping the source-chain deposit back to the original sender.
	SwapStatusRefunding SwapStatus = "refunding"
	// Refund tx confirmed on the source chain — sender got their funds
	// back minus source-chain gas. Terminal state.
	SwapStatusRefunded SwapStatus = "refunded"
	// Terminal failure (refund attempted but unrecoverable, etc.).
	SwapStatusFailed SwapStatus = "failed"
	// Terminal failure: gas pre-check in the signing driver determined
	// the release wallet does not hold enough native token to cover
	// (gasLimit * gasPrice + value) on the destination chain. The
	// signing driver writes this state BEFORE spending the 75s
	// signing-ceremony budget — operator must fund the wallet listed
	// in Swap.ReleaseWalletID, then a follow-up manual nudge can
	// resurrect the swap. Distinct from SwapStatusBroadcasting +
	// "Insufficient funds" LastError (which can self-recover on
	// next tick once funds arrive); this state is pre-sign and the
	// swap deliberately does NOT retry until an operator intervenes.
	SwapStatusFailedInsufficientReleaseGas SwapStatus = "failed_insufficient_release_gas"
	// User-cancelled before deposit.
	SwapStatusCancelled SwapStatus = "cancelled"
)

// Swap is the canonical bridge-intent record. The shape is a superset
// of the legacy app/server Prisma model — every field the TS SDK reads
// has an equivalent here, plus the MPC fields the modern pipeline
// needs.
//
// snake_case JSON tags match the legacy wire contract.
type Swap struct {
	ID                 string     `json:"id"`
	Status             SwapStatus `json:"status"`
	Amount             float64    `json:"amount"`
	SourceNetwork      string     `json:"source_network"`
	SourceAsset        string     `json:"source_asset"`
	DestinationNetwork string     `json:"destination_network"`
	DestinationAsset   string     `json:"destination_asset"`
	DestinationAddress string     `json:"destination_address"`
	// DestinationTag is the optional XRP destination tag — a 32-bit memo
	// XRP exchanges/custodians require to credit a pooled-deposit payout
	// to the right sub-account. nil for destinations that don't use one
	// (personal r-addresses, and every non-XRP chain). Validated to fit
	// uint32 at the API boundary (swaps_handler.go) and read by the XRP
	// signing path (signOneXRP) which carries it onto the Payment.
	DestinationTag *uint32 `json:"destination_tag,omitempty"`
	Sender         string  `json:"sender,omitempty"`
	Refuel             bool       `json:"refuel"`
	UseDepositAddress  bool       `json:"use_deposit_address"`
	UseTeleporter      bool       `json:"use_teleporter"`
	AppName            string     `json:"app_name,omitempty"`

	// Receive economics (snapshot at quote/create time).
	ReceiveAmount    float64 `json:"receive_amount,omitempty"`
	MinReceiveAmount float64 `json:"min_receive_amount,omitempty"`
	ServiceFee       float64 `json:"service_fee,omitempty"`

	// Deposit address — legacy "wallet_name###address" format when
	// minted via internal/mchain.KeygenForDeposit. This is the
	// PER-SWAP source-chain receive address. The user sends source
	// funds here; the refund driver also signs from this address
	// when sweeping a stuck swap back to its original sender.
	DepositAddress string `json:"deposit_address,omitempty"`

	// ReleaseWalletID is the MPC wallet identifier for the long-lived
	// per-DESTINATION-network release wallet. Populated at swap-create
	// time by mchain.ReleaseWalletStore.GetOrCreate and reused by
	// every swap to the same destination network. Distinct from
	// DepositAddress, which is a fresh keygen per swap on the source
	// side. The signing driver targets this wallet (not the deposit
	// wallet) when producing the destination-chain release tx, because
	// only this wallet's destination-chain address holds the
	// operator-funded liquidity needed to pay the user.
	//
	// Empty for swaps created before the release-wallet split landed
	// (2026-05) and for swaps created against a bridge process that
	// has no --mpc-url configured. In those legacy paths the signing
	// driver falls back to the deposit wallet — those swaps will
	// fail-and-refund unless the operator pre-funded the per-swap
	// release address out of band.
	ReleaseWalletID string `json:"release_wallet_id,omitempty"`
	// ReleaseAddress is the destination-network address controlled by
	// ReleaseWalletID. The signing driver passes this to the tx
	// assembler as SenderAddress so the release tx draws from
	// operator-funded liquidity, not from the (always-empty) per-swap
	// deposit wallet.
	ReleaseAddress string `json:"release_address,omitempty"`

	// Source-side observation: tx hash, confirmed amount.
	SourceTxHash    string  `json:"source_tx_hash,omitempty"`
	DepositedAmount float64 `json:"deposited_amount,omitempty"`

	// Signing — populated when the MPC ceremony emits a signature.
	MPCSessionID string `json:"mpc_session_id,omitempty"`
	Signature    string `json:"signature,omitempty"`

	// ReleasePubKey is the hex-encoded 33-byte compressed secp256k1
	// pubkey for the release wallet. Required by the DOT signing
	// path so the assembler can derive the AccountId32 and pick the
	// right ECDSA recovery byte. Empty for swaps that never use a
	// substrate destination.
	ReleasePubKey string `json:"release_pub_key,omitempty"`

	// DestRawTx is the fully-assembled, signed destination-chain raw
	// transaction (hex-encoded). The broadcast driver consumes this
	// field to push the tx onto the destination chain. Populated by
	// the signing driver when a txassembler.Assembler is attached:
	// PreSign builds the unsigned RLP, the MPC signs the sighash, then
	// Finalize re-encodes with the signature into wire-ready bytes.
	//
	// EVM destinations are fully implemented (EIP-155). Non-EVM
	// destination chains (BTC/SOL/TON) still need chain-specific
	// assemblers; until those land their swaps stall here and the
	// broadcaster skips them with a "missing tx assembly" debug log.
	DestRawTx string `json:"dest_raw_tx,omitempty"`

	// Destination-side broadcast — tx hash on the destination chain.
	DestTxHash string `json:"dest_tx_hash,omitempty"`

	// LastError holds the most-recent transient error from the signing
	// or broadcast driver. The drivers keep retrying (the swap is
	// recoverable — usually a flaky RPC or a release-address that
	// needs funding), but exposing the error lets the SDK and UI tell
	// the user WHY progress has stalled instead of letting them stare
	// at a "broadcasting" spinner for the full 5-minute SPA timeout.
	//
	// Drivers MUST clear this field on success (set to ""). Treat it
	// as transient state, not historical log — once the swap reaches
	// `completed`, the field should be empty.
	LastError string `json:"last_error,omitempty"`

	// LastErrorAt is when LastError last transitioned from empty to set.
	// The refund driver uses elapsed time since this stamp to decide
	// when a stalled-at-broadcasting swap should be reverted (i.e. the
	// destination chain has been rejecting "insufficient funds" for
	// long enough that the user clearly isn't going to fund the
	// release address). Zero value = no error active.
	LastErrorAt time.Time `json:"last_error_at,omitempty"`

	// LastFeeRate is the sat/vB feerate of the most recent BTC release
	// attempt, persisted by the signing driver when it finalizes a BTC
	// tx. The confirmation watcher / submit-reject handler use it as the
	// floor for the next rebuild so an RBF replacement strictly out-bids
	// the tx it replaces (BIP-125 requires a higher absolute fee). Zero
	// for non-BTC swaps and for the first BTC attempt (no prior fee to
	// beat — PreSign just uses the live mempool estimate). Survives a
	// rebuild reset so the bump compounds across successive attempts.
	LastFeeRate int64 `json:"last_fee_rate,omitempty"`

	// BroadcastAt stamps when the current destination tx was accepted
	// into the mempool. The BTC confirmation watcher measures its
	// rebuild timeout from here; refreshed on every (re)broadcast so the
	// clock restarts for each replacement tx. Unused by non-BTC families.
	BroadcastAt time.Time `json:"broadcast_at,omitempty"`

	// BroadcastRebuilds counts broadcast→rebuild→sign→broadcast cycles
	// for this swap — BTC submit-rejects (fee below relay floor) and
	// confirmation timeouts both draw from this shared ceiling. Capped
	// by the broadcast driver's maxRebuilds to prevent bumping the fee
	// forever when the destination is genuinely broken; past the cap
	// the swap moves to SwapStatusFailed. Cleared on terminal success.
	BroadcastRebuilds int `json:"broadcast_rebuilds,omitempty"`

	// RefundTxHash is the source-chain transaction hash of the refund
	// sweep (from MPC deposit address back to Sender) once the refund
	// driver successfully broadcasts. Populated together with
	// Status=SwapStatusRefunded.
	RefundTxHash string `json:"refund_tx_hash,omitempty"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// SwapFilter narrows List queries. Empty fields mean "any".
type SwapFilter struct {
	Status        SwapStatus
	SourceNetwork string
	Limit         int // 0 → no limit
}

// =============================================================================
// SwapStore interface
// =============================================================================

// ErrSwapNotFound is returned by Get / Patch when the id isn't in
// the store. Distinguishes from other failure modes (e.g. concurrent
// update conflicts).
var ErrSwapNotFound = errors.New("swap_store: swap not found")

// SwapStore is the persistence boundary. Implementations:
//   - InMemoryStore     — sync.Map-backed, lossy on restart.
//   - (future) BaseStore — hanzoai/base-backed, per-tenant SQLite.
type SwapStore interface {
	// Create persists a new swap. ID must be unique; an existing id
	// returns an error. The store sets CreatedAt + UpdatedAt.
	Create(ctx context.Context, swap *Swap) error
	// Get returns the swap by id; ErrSwapNotFound if absent.
	Get(ctx context.Context, id string) (*Swap, error)
	// Patch atomically mutates a swap. fn is called with a fresh copy;
	// the returned snapshot is written back under the store's lock.
	// Implementations MUST set UpdatedAt = time.Now() before persisting.
	Patch(ctx context.Context, id string, fn func(*Swap)) (*Swap, error)
	// List returns swaps matching filter. Order is newest-first.
	List(ctx context.Context, filter SwapFilter) ([]*Swap, error)
}

// =============================================================================
// InMemoryStore
// =============================================================================

// InMemoryStore is the dev/default SwapStore. Safe for concurrent use.
type InMemoryStore struct {
	mu      sync.RWMutex
	swaps   map[string]*Swap
	now     func() time.Time // overridable in tests
	idMaker func() string    // overridable in tests

	// Release-pool persistence — lazily initialized on first
	// LoadEntries/PutEntry call. Lives here (rather than as a
	// separate type) so the in-memory test setup boots with a
	// single NewInMemoryStore() call. The inMemoryReleasePool is
	// itself multi-family (entries keyed by (family, idx)), so this
	// single slot handles every family the bridge supports.
	poolOnce sync.Once
	pool     *inMemoryReleasePool
}

// NewInMemoryStore returns an empty in-memory store.
func NewInMemoryStore() *InMemoryStore {
	return &InMemoryStore{
		swaps:   make(map[string]*Swap),
		now:     time.Now,
		idMaker: randSwapID,
	}
}

// Create assigns an id if the swap doesn't have one, sets timestamps,
// and persists. Returns an error if the id already exists.
func (s *InMemoryStore) Create(_ context.Context, swap *Swap) error {
	if swap == nil {
		return errors.New("swap_store: nil swap")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if swap.ID == "" {
		swap.ID = s.idMaker()
	}
	if _, exists := s.swaps[swap.ID]; exists {
		return errors.New("swap_store: duplicate id " + swap.ID)
	}
	now := s.now()
	if swap.CreatedAt.IsZero() {
		swap.CreatedAt = now
	}
	swap.UpdatedAt = now
	if swap.Status == "" {
		swap.Status = SwapStatusUserDepositPending
	}
	// Store a copy so external mutation doesn't affect persisted state.
	cp := *swap
	s.swaps[swap.ID] = &cp
	return nil
}

// Get returns a copy of the swap. Copying prevents callers from
// accidentally mutating store state.
func (s *InMemoryStore) Get(_ context.Context, id string) (*Swap, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	sw, ok := s.swaps[id]
	if !ok {
		return nil, ErrSwapNotFound
	}
	cp := *sw
	return &cp, nil
}

// Patch applies fn under the store's lock. fn receives a working
// copy; the snapshot it leaves behind is what's persisted.
func (s *InMemoryStore) Patch(_ context.Context, id string, fn func(*Swap)) (*Swap, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	sw, ok := s.swaps[id]
	if !ok {
		return nil, ErrSwapNotFound
	}
	cp := *sw
	fn(&cp)
	cp.UpdatedAt = s.now()
	s.swaps[id] = &cp
	out := cp
	return &out, nil
}

// List returns swaps matching the filter, newest-first.
func (s *InMemoryStore) List(_ context.Context, filter SwapFilter) ([]*Swap, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]*Swap, 0, len(s.swaps))
	for _, sw := range s.swaps {
		if filter.Status != "" && sw.Status != filter.Status {
			continue
		}
		if filter.SourceNetwork != "" && sw.SourceNetwork != filter.SourceNetwork {
			continue
		}
		cp := *sw
		out = append(out, &cp)
	}
	// Newest-first sort. Reverse insertion order is approximately
	// correct but not exact under concurrent inserts, so sort by
	// CreatedAt explicitly.
	sortSwapsNewestFirst(out)
	if filter.Limit > 0 && len(out) > filter.Limit {
		out = out[:filter.Limit]
	}
	return out, nil
}

// =============================================================================
// Helpers
// =============================================================================

// randSwapID generates a swap id like "swap_<8-byte hex>".
// Cryptographic randomness so concurrent processes never collide.
func randSwapID() string {
	var buf [8]byte
	if _, err := rand.Read(buf[:]); err != nil {
		// Practically unreachable on Linux/macOS. Fall back to
		// time-based; better than panicking.
		return "swap_" + hex.EncodeToString([]byte(time.Now().UTC().Format(time.RFC3339Nano)))
	}
	return "swap_" + hex.EncodeToString(buf[:])
}

func sortSwapsNewestFirst(swaps []*Swap) {
	// stdlib sort with a closure; the list is small (< 1000 swaps in
	// typical dev / first-deploy load) so an O(n log n) sort is fine.
	for i := 1; i < len(swaps); i++ {
		for j := i; j > 0 && swaps[j-1].CreatedAt.Before(swaps[j].CreatedAt); j-- {
			swaps[j-1], swaps[j] = swaps[j], swaps[j-1]
		}
	}
}
