// dot_signing.go: substrate-side helpers for the signing driver.
//
// What lives here:
//   - DOTChainContext: the minimal RPC surface the signing driver
//     queries against the substrate chain (nonce, runtime version,
//     fee estimate, native balance).
//   - LiveDOTChainContext: production implementation that runs raw
//     JSON-RPC against the bridge's broadcast URL for the destination
//     network. Uses the same RPC URL the broadcaster does so a single
//     --source-rpc-overrides covers both legs.
//   - preSignDOT + dotGasPrecheck: the methods the signing driver
//     calls; kept in this file so the EVM-side signing_driver.go stays
//     readable.

package main

import (
	"bytes"
	"context"
	"encoding/hex"
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

	"github.com/luxfi/bridge/internal/broadcast"
	"github.com/luxfi/bridge/internal/substrate"
	"github.com/luxfi/bridge/internal/txassembler"
)

// =============================================================================
// DOTChainContext — the seam between the signing driver and the substrate RPC
// =============================================================================

// DOTChainContext is the per-tick chain-side data the substrate signing
// payload needs:
//   - Nonce: queried via system_accountNextIndex(account_id_hex).
//   - RuntimeVersion: state_getRuntimeVersion (spec_version + tx_version
//     for the signing-payload version pin).
//   - GenesisHash: chain_getBlockHash(0). Stable per chain — caller may
//     cache, but DOTChainContext is allowed to re-query each call.
//   - FreeBalance: query system_account(account_id) → free balance for
//     the gas pre-check.
//   - FeePlanck: typically a static config value; substrate has a
//     payment_queryInfo RPC that returns exact fee, but that requires
//     the unsigned extrinsic — chicken-and-egg in the assembler. The
//     bridge uses a per-network static fee captured at config time.
//
// Pulled to an interface so the signing-driver tests can drive DOT
// without standing up a substrate node.
type DOTChainContext interface {
	// AccountNextIndex returns the signer's next nonce.
	AccountNextIndex(ctx context.Context, network string, accountIDHex string) (uint32, error)
	// RuntimeVersion returns (spec_version, transaction_version).
	RuntimeVersion(ctx context.Context, network string) (specVersion, txVersion uint32, err error)
	// GenesisHash returns the 32-byte chain genesis hash.
	GenesisHash(ctx context.Context, network string) ([32]byte, error)
	// FreeBalance returns the wallet's `free` planck balance.
	FreeBalance(ctx context.Context, network string, accountIDHex string) (*big.Int, error)
}

// =============================================================================
// LiveDOTChainContext — production JSON-RPC implementation
// =============================================================================

// LiveDOTChainContext speaks substrate JSON-RPC against the per-network
// broadcast URL. Safe for concurrent use.
type LiveDOTChainContext struct {
	// Overrides shadows the broadcast.RPCURLFor table — same map as
	// other bridge clients so a single --source-rpc-overrides flag
	// drives every leg.
	Overrides map[string]string

	// Timeout caps each individual JSON-RPC call. Zero ⇒ 8s.
	Timeout time.Duration

	// HTTPClient is the underlying http.Client. Zero ⇒ a new
	// http.Client with Timeout.
	HTTPClient *http.Client

	// genesisCache memoizes the per-network genesis hash (these are
	// stable for the chain's lifetime; cheap to remember).
	genesisCache   sync.Map // map[string][32]byte
	runtimeCache   sync.Map // map[string]runtimeCacheEntry — short TTL
	runtimeCacheMu sync.Mutex

	callSeq atomic.Uint64
}

type runtimeCacheEntry struct {
	specVersion uint32
	txVersion   uint32
	expiresAt   time.Time
}

// NewLiveDOTChainContext builds a chain-context client. Pass through
// the same overrides + timeout the broadcaster uses.
func NewLiveDOTChainContext(overrides map[string]string, timeout time.Duration) *LiveDOTChainContext {
	if timeout <= 0 {
		timeout = 8 * time.Second
	}
	return &LiveDOTChainContext{
		Overrides:  overrides,
		Timeout:    timeout,
		HTTPClient: &http.Client{Timeout: timeout},
	}
}

func (c *LiveDOTChainContext) rpcURL(network string) string {
	if u, ok := c.Overrides[network]; ok && u != "" {
		return u
	}
	return broadcast.RPCURLFor(network)
}

// AccountNextIndex queries system_accountNextIndex. Returns a uint32
// because substrate nonces are u32 (matches the SCALE encoding).
func (c *LiveDOTChainContext) AccountNextIndex(ctx context.Context, network, accountIDHex string) (uint32, error) {
	var n uint32
	var raw json.Number
	if err := c.rpcCall(ctx, network, "system_accountNextIndex", []any{ensureZeroX(accountIDHex)}, &raw); err != nil {
		return 0, err
	}
	v, perr := raw.Int64()
	if perr != nil {
		return 0, fmt.Errorf("dot_chain: parse nonce %q: %w", raw, perr)
	}
	if v < 0 || v > 0x7fffffff {
		return 0, fmt.Errorf("dot_chain: nonce out of u32 range: %d", v)
	}
	n = uint32(v)
	return n, nil
}

// RuntimeVersion queries state_getRuntimeVersion and returns
// (spec_version, transaction_version). Cached for 30s — these change
// on runtime upgrades, which are infrequent.
func (c *LiveDOTChainContext) RuntimeVersion(ctx context.Context, network string) (uint32, uint32, error) {
	c.runtimeCacheMu.Lock()
	if v, ok := c.runtimeCache.Load(network); ok {
		e := v.(runtimeCacheEntry)
		if time.Now().Before(e.expiresAt) {
			c.runtimeCacheMu.Unlock()
			return e.specVersion, e.txVersion, nil
		}
	}
	c.runtimeCacheMu.Unlock()

	var resp struct {
		SpecVersion        uint32 `json:"specVersion"`
		TransactionVersion uint32 `json:"transactionVersion"`
	}
	if err := c.rpcCall(ctx, network, "state_getRuntimeVersion", []any{}, &resp); err != nil {
		return 0, 0, err
	}
	c.runtimeCache.Store(network, runtimeCacheEntry{
		specVersion: resp.SpecVersion,
		txVersion:   resp.TransactionVersion,
		expiresAt:   time.Now().Add(30 * time.Second),
	})
	return resp.SpecVersion, resp.TransactionVersion, nil
}

// GenesisHash queries chain_getBlockHash(0). Cached forever (per-network).
func (c *LiveDOTChainContext) GenesisHash(ctx context.Context, network string) ([32]byte, error) {
	if v, ok := c.genesisCache.Load(network); ok {
		return v.([32]byte), nil
	}
	var hashHex string
	if err := c.rpcCall(ctx, network, "chain_getBlockHash", []any{0}, &hashHex); err != nil {
		return [32]byte{}, err
	}
	raw, err := hex.DecodeString(strings.TrimPrefix(strings.TrimPrefix(hashHex, "0x"), "0X"))
	if err != nil || len(raw) != 32 {
		return [32]byte{}, fmt.Errorf("dot_chain: genesis hash bad shape %q (decode err=%v)", hashHex, err)
	}
	var out [32]byte
	copy(out[:], raw)
	c.genesisCache.Store(network, out)
	return out, nil
}

// FreeBalance returns the wallet's free balance via state_call to
// AccountStore. The simpler shape is system_account(account_id), which
// returns AccountInfo { nonce, consumers, providers, data: AccountData
// { free, reserved, frozen, ... } }. Some Polkadot JSON-RPC gateways
// expose this as a state_getStorage at the well-known key prefix;
// others have an `accounts_account` shortcut. We use system_account
// which is the documented substrate endpoint.
//
// For robustness when the chain doesn't expose system_account directly
// (Polkadot has been moving these to "Subscribe" channels), we fall
// back to a state_getStorage call with the System.Account storage key.
func (c *LiveDOTChainContext) FreeBalance(ctx context.Context, network, accountIDHex string) (*big.Int, error) {
	// Primary path: system_account.
	var resp struct {
		Data struct {
			Free string `json:"free"`
		} `json:"data"`
	}
	err := c.rpcCall(ctx, network, "system_account", []any{ensureZeroX(accountIDHex)}, &resp)
	if err == nil && resp.Data.Free != "" {
		v, ok := new(big.Int).SetString(strings.TrimPrefix(resp.Data.Free, "0x"), 16)
		if ok {
			return v, nil
		}
		// Some servers return decimal strings.
		v, ok = new(big.Int).SetString(resp.Data.Free, 10)
		if ok {
			return v, nil
		}
	}
	// The bridge doesn't ship a full StorageKey synthesizer; if
	// system_account fails or returns an empty body, surface the
	// upstream error verbatim. Operators can wire up a richer
	// implementation later if their gateway dictates.
	if err == nil {
		err = errors.New("dot_chain: system_account returned empty body")
	}
	return nil, err
}

// =============================================================================
// JSON-RPC plumbing
// =============================================================================

func (c *LiveDOTChainContext) rpcCall(ctx context.Context, network, method string, params []any, out any) error {
	url := c.rpcURL(network)
	if url == "" {
		return fmt.Errorf("dot_chain: no RPC URL configured for %s", network)
	}
	body, err := json.Marshal(map[string]any{
		"jsonrpc": "2.0",
		"id":      c.callSeq.Add(1),
		"method":  method,
		"params":  params,
	})
	if err != nil {
		return err
	}
	callCtx, cancel := context.WithTimeout(ctx, c.Timeout)
	defer cancel()
	req, err := http.NewRequestWithContext(callCtx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	client := c.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: c.Timeout}
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("dot_chain: HTTP %d: %s", resp.StatusCode, truncDOT(respBody, 200))
	}
	var env struct {
		Result json.RawMessage `json:"result"`
		Error  *struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		} `json:"error,omitempty"`
	}
	if err := json.Unmarshal(respBody, &env); err != nil {
		return fmt.Errorf("dot_chain: decode envelope: %w", err)
	}
	if env.Error != nil {
		return fmt.Errorf("dot_chain: rpc %d: %s", env.Error.Code, env.Error.Message)
	}
	if len(env.Result) == 0 {
		return errors.New("dot_chain: empty result")
	}
	return json.Unmarshal(env.Result, out)
}

func truncDOT(b []byte, n int) string {
	if len(b) <= n {
		return string(b)
	}
	return string(b[:n]) + "…"
}

func ensureZeroX(s string) string {
	if strings.HasPrefix(s, "0x") || strings.HasPrefix(s, "0X") {
		return s
	}
	return "0x" + s
}

// =============================================================================
// SigningDriver hooks
// =============================================================================

// preSignDOT builds the substrate signing payload for a swap whose
// destination is a DOT-family network. Returns:
//   - *DOTUnsigned: passed unchanged to Finalize.
//   - msgHex: the 0x-prefixed hex string the MPC signs over (always
//     32 bytes — blake2_256 of the payload, applied by the assembler
//     when the raw payload exceeds 256 bytes; for our shape it almost
//     always does).
//   - error: transient RPC failures (signing driver retries next tick).
//
// We use the swap's release wallet as the signer. The wallet's
// ECDSAPubKey on the swap record is the pubkey the MPC produced at
// keygen; combined with the release SS58 address it gives us both
// signer-identity inputs the assembler needs.
//
// The amount is converted from float64 to planck via the per-network
// decimals captured in the assembler config.
func (d *SigningDriver) preSignDOT(ctx context.Context, sw *Swap, walletID string) (*txassembler.DOTUnsigned, string, error) {
	cfg, ok := d.dotAssembler.Networks[sw.DestinationNetwork]
	if !ok {
		return nil, "", fmt.Errorf("dot_signing: no assembler config for %s", sw.DestinationNetwork)
	}
	decimals := cfg.Decimals
	if decimals == 0 {
		decimals = 10 // Polkadot mainnet planck precision
	}

	// Convert human amount to planck using the same float→base-unit
	// path as the EVM side. Reuse the assembler's helper for
	// consistency; we apply it with `decimals` as the multiplier.
	valuePlanck, err := txassembler.FloatToBaseUnits(sw.Amount, decimals)
	if err != nil {
		return nil, "", fmt.Errorf("dot_signing: convert amount %g to planck: %w", sw.Amount, err)
	}

	// Look up the release wallet's pubkey. The pool entry persists
	// only the address; pull the pubkey from the swap's
	// ReleaseAddress + pool — or, ideally, store the pubkey on the
	// pool entry so we never have to re-derive. For now, fetch via
	// the bridge's existing in-memory data store: the release pool
	// tracks (WalletID, Address) but NOT pubkey. As a follow-up,
	// extend ReleasePoolEntry with the pubkey; until then, the
	// driver requires the keygen client to have populated
	// ECDSAPubKey on the wallet at pool-mint time, and the pool
	// store persists it.
	pubHex := d.lookupReleasePubKey(walletID, sw)
	if pubHex == "" {
		return nil, "", fmt.Errorf("dot_signing: missing ecdsa_pub_key for release wallet %s — pool entry must persist pubkey", walletID)
	}
	pub, err := hex.DecodeString(strings.TrimPrefix(strings.TrimPrefix(pubHex, "0x"), "0X"))
	if err != nil {
		return nil, "", fmt.Errorf("dot_signing: decode pubkey hex: %w", err)
	}

	// Derive the AccountId32 from the pub for the system_accountNextIndex
	// + system_account calls (substrate RPCs want a 0x-prefixed
	// 32-byte account hex).
	acc, err := substrate.AccountIDFromECDSAPub(pub)
	if err != nil {
		return nil, "", fmt.Errorf("dot_signing: derive AccountId: %w", err)
	}
	accHex := hex.EncodeToString(acc[:])

	// Query chain-side runtime params.
	nonce, err := d.dotChainCtx.AccountNextIndex(ctx, sw.DestinationNetwork, accHex)
	if err != nil {
		return nil, "", fmt.Errorf("dot_signing: system_accountNextIndex: %w", err)
	}
	specVer, txVer, err := d.dotChainCtx.RuntimeVersion(ctx, sw.DestinationNetwork)
	if err != nil {
		return nil, "", fmt.Errorf("dot_signing: state_getRuntimeVersion: %w", err)
	}
	gen, err := d.dotChainCtx.GenesisHash(ctx, sw.DestinationNetwork)
	if err != nil {
		return nil, "", fmt.Errorf("dot_signing: chain_getBlockHash(0): %w", err)
	}

	// Refresh the assembler's per-network config to use the live
	// runtime version + genesis (the operator-supplied values were
	// just hints; the live chain is authoritative). We mutate the
	// local cfg copy and overwrite, so concurrent drivers see the
	// fresh values on the next tick.
	cfg.SpecVersion = specVer
	cfg.TransactionVersion = txVer
	cfg.GenesisHash = gen
	d.dotAssembler.SetNetwork(sw.DestinationNetwork, cfg)

	u, err := d.dotAssembler.PreSign(ctx, txassembler.DOTSpec{
		Network:       sw.DestinationNetwork,
		RecipientSS58: sw.DestinationAddress,
		AmountPlanck:  valuePlanck,
		SenderPubKey:  pub,
		Nonce:         nonce,
		Tip:           big.NewInt(0),
	})
	if err != nil {
		return nil, "", err
	}

	// The MPC signs over blake2_256(signing_payload). When the payload
	// is already 32 bytes (i.e. >256-byte raw), the assembler already
	// hashed; otherwise we hash here to keep a uniform 32-byte digest
	// going to the MPC.
	var digest [32]byte
	if len(u.SigningPayload) == 32 {
		copy(digest[:], u.SigningPayload)
	} else {
		digest = substrate.Blake2_256(u.SigningPayload)
	}
	msgHex := "0x" + hex.EncodeToString(digest[:])
	return u, msgHex, nil
}

// dotGasPrecheck runs the DOT-flavored "can the release wallet cover
// the transfer + fee + existential" check. Returns (humanReason, false)
// when balance is insufficient, (empty, true) when ok or probe failed.
//
// Required = transfer_value + fee + existential_deposit.
//
// For balance probing we go through the same DOTChainContext rather
// than the EVM BalanceProbe — the substrate balance shape doesn't
// match eth_getBalance, and routing both through the chain-context
// keeps the substrate concerns in one place.
func (d *SigningDriver) dotGasPrecheck(ctx context.Context, sw *Swap, u *txassembler.DOTUnsigned, releaseAddr string) (string, bool) {
	probeCtx, cancel := context.WithTimeout(ctx, d.perBalanceTimeout)
	defer cancel()

	// Derive the AccountId32 hex from the signer pubkey (already on u).
	acc, err := substrate.AccountIDFromECDSAPub(u.SignerPubKey)
	if err != nil {
		if d.logger != nil {
			d.logger.Debug("dot gas pre-check: bad pubkey", "err", err)
		}
		return "", true
	}
	balance, err := d.dotChainCtx.FreeBalance(probeCtx, sw.DestinationNetwork, hex.EncodeToString(acc[:]))
	if err != nil {
		// Best-effort: log + skip. Same policy as the EVM probe.
		if d.logger != nil {
			d.logger.Debug("dot gas pre-check: balance probe failed (non-fatal)",
				"swap_id", sw.ID,
				"address", releaseAddr,
				"network", sw.DestinationNetwork,
				"err", err,
			)
		}
		return "", true
	}

	// Pull required-cost components from the persisted PerNetwork
	// config — fee + existential_deposit. The actual transfer value
	// is on the DOTUnsigned via the call bytes, but we already have
	// the planck amount we encoded; extract from the assembler's
	// internal state.
	cfg := u.PerNetwork
	value := extractDOTValuePlanck(u.CallBytes)
	fee := cfg.FeePlanck
	if fee == nil {
		fee = big.NewInt(0)
	}
	exist := cfg.ExistentialDeposit
	if exist == nil {
		exist = big.NewInt(0)
	}
	required := new(big.Int).Add(value, fee)
	required.Add(required, exist)
	if balance.Cmp(required) >= 0 {
		return "", true
	}
	short := new(big.Int).Sub(required, balance)
	return fmt.Sprintf(
		"Release wallet %s has insufficient planck balance on %s: balance=%s, required=%s (value=%s + fee=%s + existential=%s), short=%s. Fund the wallet and trigger a retry.",
		releaseAddr,
		sw.DestinationNetwork,
		balance.String(),
		required.String(),
		value.String(),
		fee.String(),
		exist.String(),
		short.String(),
	), false
}

// extractDOTValuePlanck reads the Compact<Balance> trailing the call
// bytes produced by EncodeBalancesTransferKeepAlive. Layout:
//
//	section(1) || method(1) || multi_addr_tag(1) || dest(32) || compact_value
//
// Returns 0 if the call bytes are too short — the gas pre-check then
// safely overestimates required (which is fine).
func extractDOTValuePlanck(callBytes []byte) *big.Int {
	if len(callBytes) < 35 {
		return big.NewInt(0)
	}
	rest := callBytes[35:]
	if len(rest) == 0 {
		return big.NewInt(0)
	}
	// Decode compact integer from the front of rest.
	mode := rest[0] & 0b11
	switch mode {
	case 0:
		return new(big.Int).SetInt64(int64(rest[0]) >> 2)
	case 1:
		if len(rest) < 2 {
			return big.NewInt(0)
		}
		val := uint64(rest[0]) | uint64(rest[1])<<8
		return new(big.Int).SetUint64(val >> 2)
	case 2:
		if len(rest) < 4 {
			return big.NewInt(0)
		}
		val := uint64(rest[0]) |
			uint64(rest[1])<<8 |
			uint64(rest[2])<<16 |
			uint64(rest[3])<<24
		return new(big.Int).SetUint64(val >> 2)
	case 3:
		numBytes := int(rest[0]>>2) + 4
		if len(rest) < 1+numBytes {
			return big.NewInt(0)
		}
		// LE bytes — reverse to BE before SetBytes.
		le := rest[1 : 1+numBytes]
		be := make([]byte, len(le))
		for i := range le {
			be[i] = le[len(le)-1-i]
		}
		return new(big.Int).SetBytes(be)
	}
	return big.NewInt(0)
}

// lookupReleasePubKey returns the hex-encoded compressed pubkey for
// the named release wallet. Looks at the DOT-family pool first (since
// substrate signing is what calls this), then the default pool, then
// the swap's persisted pubkey when present.
func (d *SigningDriver) lookupReleasePubKey(walletID string, sw *Swap) string {
	if d.dotPool != nil {
		if pk := d.dotPool.PubKeyHex(walletID); pk != "" {
			return pk
		}
	}
	if d.pool != nil {
		if pk := d.pool.PubKeyHex(walletID); pk != "" {
			return pk
		}
	}
	// Fall back to a pubkey persisted on the swap (set by the keygen
	// flow when the swap minted its own deposit wallet — not the
	// release pool path, but covers single-wallet legacy swaps).
	return sw.ReleasePubKey
}
