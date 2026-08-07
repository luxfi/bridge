package mchain

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"sync"
)

// release_store.go: per-network release-wallet registry.
//
// A "release wallet" is the long-lived MPC wallet that signs and pays
// out settlements on a destination chain. One per destination network —
// *not* per swap. The operator pre-funds the release wallet's
// destination-chain address with native gas + bridged liquidity; on
// every swap completion the MPC quorum signs a tx FROM that address TO
// the user's destination address.
//
// Contrast with per-swap deposit wallets (KeygenForDeposit), which are
// minted fresh every swap so a compromise of one keygen exposes only
// one swap's worth of source-chain funds. Release wallets need to be
// stable because:
//
//  1. They hold real treasury. Rotating addresses every swap leaves
//     stranded balance behind and breaks operator accounting.
//  2. Funding them is an out-of-band operator action. Static addresses
//     keep ops + monitoring tractable.
//  3. Throughput: signing reuses the cluster-cached key shares for the
//     wallet on every release tx.
//
// Persistence: when StorePath is set, the store serializes the wallet
// map to JSON on every successful mint, and reloads on construction.
// This matches the persistence model of the swap store (--data-dir): a
// single PV-backed file survives pod restarts. When StorePath is empty
// the store runs in-memory — fine for tests and first-deploys, but
// every restart re-mints release wallets and any liquidity sitting at
// the old address is stranded.

// ReleaseWalletStore mints (and caches) the per-network release wallet.
//
// GetOrCreate is idempotent: the first call mints a fresh MPC wallet
// via the underlying Client.KeygenForDeposit primitive (mpcd doesn't
// have a separate "release" endpoint — the cluster doesn't distinguish
// wallet purpose, only the bridge does). Subsequent calls return the
// cached entry. The `network` argument is the destination network's
// internal name (e.g. "LUX_TESTNET").
type ReleaseWalletStore interface {
	GetOrCreate(ctx context.Context, network string) (*Wallet, error)
}

// ReleaseWalletLister is an optional capability of a ReleaseWalletStore:
// enumerate every wallet already minted, without minting new ones.
// Health/monitoring pollers use this to iterate the active release
// wallets on a timer. FileReleaseStore implements it; minimal test
// doubles for ReleaseWalletStore are not required to.
type ReleaseWalletLister interface {
	ListReleaseWallets() map[string]Wallet
}

// FileReleaseStore is a ReleaseWalletStore backed by a Client for fresh
// keygen and (optionally) a JSON file for persistence. Safe for
// concurrent use.
type FileReleaseStore struct {
	client *Client
	path   string // empty ⇒ in-memory only

	mu    sync.Mutex
	cache map[string]*Wallet // network → wallet
}

// NewFileReleaseStore constructs a release-wallet store that mints via
// client and persists to path. When path is empty, the store is
// in-memory only — every restart re-mints, which strands any
// pre-funded liquidity at the old release address. Prefer a PV-backed
// path in prod.
//
// On construction the store eagerly loads existing wallets from path
// so the bridge can resume servicing destinations without waiting for
// a fresh keygen. A missing file is not an error — it just means no
// release wallets have been minted yet.
func NewFileReleaseStore(client *Client, path string) (*FileReleaseStore, error) {
	if client == nil {
		return nil, errors.New("mchain: release store requires a non-nil Client")
	}
	s := &FileReleaseStore{
		client: client,
		path:   path,
		cache:  map[string]*Wallet{},
	}
	if path != "" {
		if err := s.loadLocked(); err != nil && !errors.Is(err, os.ErrNotExist) {
			return nil, fmt.Errorf("mchain: load release wallets from %s: %w", path, err)
		}
	}
	return s, nil
}

// GetOrCreate returns the release wallet for network. If absent, mints
// a fresh one via the underlying MPC keygen primitive and persists it.
//
// The lock is held across the keygen + persist round-trip so two
// concurrent callers for the same network don't mint two wallets. This
// serializes first-time mints for distinct networks too, which is
// acceptable: minting happens at most once per network for the
// lifetime of the store, and operators don't bring up dozens of new
// chains at once.
func (s *FileReleaseStore) GetOrCreate(ctx context.Context, network string) (*Wallet, error) {
	if network == "" {
		return nil, errors.New("mchain: release wallet network is required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if w, ok := s.cache[network]; ok && w != nil {
		// Return a copy so callers can't mutate the cached entry.
		cp := *w
		return &cp, nil
	}
	w, err := s.client.KeygenForDeposit(ctx, network)
	if err != nil {
		return nil, fmt.Errorf("mchain: keygen release wallet for %s: %w", network, err)
	}
	s.cache[network] = w
	if s.path != "" {
		if err := s.persistLocked(); err != nil {
			// Roll back the cache entry so the next call retries the
			// mint rather than returning a wallet whose key material
			// only the mpcd cluster knows about. Leaving stale cache
			// state pointing at a "wallet" we couldn't durably record
			// would silently strand future funding.
			delete(s.cache, network)
			return nil, fmt.Errorf("mchain: persist release wallets to %s: %w", s.path, err)
		}
	}
	cp := *w
	return &cp, nil
}

// ListReleaseWallets returns a snapshot copy of every wallet minted so
// far, keyed by network. Cheap (lock + copy) — safe to call on a
// health-check timer. Implements ReleaseWalletLister.
func (s *FileReleaseStore) ListReleaseWallets() map[string]Wallet {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make(map[string]Wallet, len(s.cache))
	for network, w := range s.cache {
		if w != nil {
			out[network] = *w
		}
	}
	return out
}

// fileShape is the JSON layout written to s.path. Versioned so a
// future store-format change can add fields without breaking existing
// files.
type fileShape struct {
	Version int                `json:"version"`
	Wallets map[string]*Wallet `json:"wallets"`
}

const releaseStoreVersion = 1

// loadLocked reads s.path into s.cache. Caller must hold s.mu.
func (s *FileReleaseStore) loadLocked() error {
	data, err := os.ReadFile(s.path)
	if err != nil {
		return err
	}
	if len(data) == 0 {
		return nil
	}
	var doc fileShape
	if err := json.Unmarshal(data, &doc); err != nil {
		return fmt.Errorf("decode: %w", err)
	}
	for network, w := range doc.Wallets {
		if w == nil {
			continue
		}
		cp := *w
		s.cache[network] = &cp
	}
	return nil
}

// persistLocked atomically writes s.cache to s.path. Caller must hold
// s.mu. Atomic via write-then-rename so a crash mid-write can't leave
// a truncated file that fails to parse on next boot.
func (s *FileReleaseStore) persistLocked() error {
	doc := fileShape{Version: releaseStoreVersion, Wallets: s.cache}
	data, err := json.MarshalIndent(&doc, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

// Compile-time interface check.
var _ ReleaseWalletStore = (*FileReleaseStore)(nil)
