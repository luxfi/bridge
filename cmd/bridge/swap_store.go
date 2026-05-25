package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"sync"
	"time"
)

// swap_store.go: native swap persistence for cmd/bridge.
//
// The Go binary owns swap CRUD now — BridgeVM is the LP-333 signer-set
// manager, not a swap API. This store is the source of truth for
// pending / in-flight / completed bridge requests; `cmd/bridge` is the
// "centralized helper" the boss described, with state durably (well,
// in-memory for now) tracked here.
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
	// Final settlement: funds arrived at destination address.
	SwapStatusCompleted SwapStatus = "completed"
	// Terminal failure (timeout, refund, etc.).
	SwapStatusFailed SwapStatus = "failed"
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
	Sender             string     `json:"sender,omitempty"`
	Refuel             bool       `json:"refuel"`
	UseDepositAddress  bool       `json:"use_deposit_address"`
	UseTeleporter      bool       `json:"use_teleporter"`
	AppName            string     `json:"app_name,omitempty"`

	// Receive economics (snapshot at quote/create time).
	ReceiveAmount    float64 `json:"receive_amount,omitempty"`
	MinReceiveAmount float64 `json:"min_receive_amount,omitempty"`
	ServiceFee       float64 `json:"service_fee,omitempty"`

	// Deposit address — legacy "wallet_name###address" format when
	// minted via internal/mchain.KeygenForDeposit.
	DepositAddress string `json:"deposit_address,omitempty"`

	// Source-side observation: tx hash, confirmed amount.
	SourceTxHash    string  `json:"source_tx_hash,omitempty"`
	DepositedAmount float64 `json:"deposited_amount,omitempty"`

	// Signing — populated when the MPC ceremony emits a signature.
	MPCSessionID string `json:"mpc_session_id,omitempty"`
	Signature    string `json:"signature,omitempty"`

	// DestRawTx is the fully-assembled, signed destination-chain raw
	// transaction (hex-encoded). The broadcast driver consumes this
	// field to push the tx onto the destination chain. Populated by
	// chain-specific tx-assembly code that combines Signature with the
	// swap intent into a wire-ready RLP-encoded (EVM) or chain-native
	// (BTC/SOL/TON/etc.) blob.
	//
	// As of Phase 4.7 the assembler is NOT implemented — Signature
	// alone is a placeholder digest, not a real tx. Until the
	// assembler lands, this field stays empty and the broadcast
	// driver skips the swap with a "missing tx assembly" debug log.
	DestRawTx string `json:"dest_raw_tx,omitempty"`

	// Destination-side broadcast — tx hash on the destination chain.
	DestTxHash string `json:"dest_tx_hash,omitempty"`

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
