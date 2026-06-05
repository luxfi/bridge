// Package mchain is a Go client for the Lux MPC keygen REST API (m-chain).
//
// This is the Go port of `app/server/src/domain/mpc-wallet.ts` —
// specifically `createMPCWalletForDeposit`, which triggers a fresh MPC
// keygen on the cluster and returns a chain-appropriate deposit
// address (ETH for EVM, BTC for Bitcoin, SOL for Solana, etc.).
//
// Naming: the boss calls it "m-chain" in the broader sense ("proxy to
// b-chain and m-chain"). The MPC keygen API is HTTP (port 9800 internal
// k8s service `http://mpc-node-0.mpc-node-headless.lux-mpc.svc:9800`),
// not a JSON-RPC chain endpoint — those live at `/ext/bc/T/rpc` and
// are handled by internal/bchain's ThresholdRPCURL path. Both belong
// to the m-chain "layer" by the boss's vocabulary.
//
// Trust model: the keygen URL is treated as a trusted internal service
// — secrets do leave the MPC cluster via the keygen response in the
// form of public addresses + public keys. Private key material never
// crosses this boundary (that's the whole point of the MPC threshold:
// no node ever holds a complete key).
//
// Concurrency: a *Client is safe for use by multiple goroutines.
package mchain

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// =============================================================================
// Network → address-type registry
// =============================================================================

// AddressType is the signature scheme / address-encoding scheme an MPC
// keygen result must surface for a given source network.
type AddressType string

const (
	AddressTypeETH AddressType = "eth"
	AddressTypeBTC AddressType = "btc"
	AddressTypeSOL AddressType = "sol"
	AddressTypeTON AddressType = "ton"
	AddressTypeXRP AddressType = "xrp"
	AddressTypeDOT AddressType = "dot"
)

// networkAddressType mirrors NETWORK_ADDRESS_TYPE in mpc-wallet.ts.
// Unknown networks default to AddressTypeETH (matches TS behavior).
var networkAddressType = map[string]AddressType{
	// EVM chains use eth address
	"ETHEREUM_MAINNET":  AddressTypeETH,
	"ETHEREUM_SEPOLIA":  AddressTypeETH,
	"ETHEREUM_GOERLI":   AddressTypeETH,
	"BASE_MAINNET":      AddressTypeETH,
	"BASE_SEPOLIA":      AddressTypeETH,
	"HOLESKY_TESTNET":   AddressTypeETH,
	"LUX_MAINNET":       AddressTypeETH,
	"LUX_TESTNET":       AddressTypeETH,
	"LUX_DEVNET":        AddressTypeETH,
	"LUX_LOCAL":         AddressTypeETH,
	"ZOO_LOCAL":         AddressTypeETH,
	"ZOO_MAINNET":       AddressTypeETH,
	"ZOO_TESTNET":       AddressTypeETH,
	"ZOO_DEVNET":        AddressTypeETH,
	"BSC_MAINNET":       AddressTypeETH,
	"BSC_TESTNET":       AddressTypeETH,
	"POLYGON_MAINNET":   AddressTypeETH,
	"ARBITRUM_MAINNET":  AddressTypeETH,
	"OPTIMISM_MAINNET":  AddressTypeETH,
	"AVAX_MAINNET":      AddressTypeETH,
	"FANTOM_MAINNET":    AddressTypeETH,
	"CELO_MAINNET":      AddressTypeETH,
	"GNOSIS_MAINNET":    AddressTypeETH,
	"AURORA_MAINNET":    AddressTypeETH,
	"ZORA_MAINNET":      AddressTypeETH,
	"BLAST_MAINNET":     AddressTypeETH,
	"LINEA_MAINNET":     AddressTypeETH,
	// Bitcoin
	"BITCOIN_MAINNET": AddressTypeBTC,
	"BITCOIN_TESTNET": AddressTypeBTC,
	// Solana
	"SOLANA_MAINNET": AddressTypeSOL,
	"SOLANA_DEVNET":  AddressTypeSOL,
	"SOLANA_TESTNET": AddressTypeSOL,
	// TON
	"TON_MAINNET": AddressTypeTON,
	"TON_TESTNET": AddressTypeTON,
	// XRP
	"XRP_MAINNET": AddressTypeXRP,
	"XRP_TESTNET": AddressTypeXRP,
	// Polkadot / Substrate
	"POLKADOT_MAINNET": AddressTypeDOT,
	// Cardano — placeholder (Ed25519); use the sol address slot until a
	// proper Cardano encoder lands. Matches TS mpc-wallet.ts behaviour.
	"CARDANO_MAINNET": AddressTypeSOL,
}

// AddressTypeFor returns the configured address type for an
// MPC-supported network. Unknown networks default to AddressTypeETH —
// safe because every BridgeVM-supported chain is at minimum an EVM,
// and an EVM 0x… address is meaningful as a fallback identifier.
func AddressTypeFor(networkInternalName string) AddressType {
	if t, ok := networkAddressType[networkInternalName]; ok {
		return t
	}
	return AddressTypeETH
}

// =============================================================================
// Types
// =============================================================================

// keygenResult mirrors the MPCKeygenResult wire shape from
// mpc-wallet.ts. Internal to the package; callers consume *Wallet.
type keygenResult struct {
	WalletID     string `json:"wallet_id"`
	ECDSAPubKey  string `json:"ecdsa_pub_key"`
	EDDSAPubKey  string `json:"eddsa_pub_key"`
	ETHAddress   string `json:"eth_address"`
	BTCAddress   string `json:"btc_address"`
	SOLAddress   string `json:"sol_address"`
	ResultType   string `json:"result_type"`
	Error        string `json:"error"`
}

// Wallet is the public result of a keygen for one bridge deposit OR for
// a long-lived per-network release wallet. Caller stores Name + Address;
// Name doubles as the MPC wallet identifier that the deposit-watcher and
// signing-session code use to recover the underlying key shares.
//
// JSON tags are present because FileReleaseStore serializes Wallet to
// disk so per-network release wallets survive bridge restarts.
type Wallet struct {
	// Name is the MPC wallet identifier (e.g. "bridge-ethereum_sepolia-1718000000").
	Name string `json:"name"`
	// Address is the chain-appropriate receive/payout address derived
	// from the keygen output, picked according to AddressTypeFor(network).
	Address string `json:"address"`
	// AddressType is the family of Address. Useful for downstream code
	// that needs to render or validate the address.
	AddressType AddressType `json:"address_type"`
	// PubKeyHex is the raw ed25519 public key (32 bytes, hex-encoded)
	// returned by the keygen. Populated only for AddressTypeSOL and
	// AddressTypeTON — those are the only families that need the raw
	// pubkey after Address has been derived. TON specifically needs it
	// because the user-facing Address is a contract hash; building the
	// release tx still requires the pubkey to construct the wallet
	// contract's StateInit + state-bound signing message.
	PubKeyHex string `json:"pub_key_hex,omitempty"`
}

// LegacyDepositString returns the "wallet_name###address" string the
// TS SDK and legacy Express server use as the on-the-wire
// representation of a deposit address. The SDK splits on `###` —
// preserve that contract on the proxy-to-SDK boundary.
func (w *Wallet) LegacyDepositString() string {
	if w == nil {
		return ""
	}
	return w.Name + "###" + w.Address
}

// MPCError surfaces keygen failures distinct from generic errors so
// callers can inspect Code/HTTPStatus and translate to HTTP responses.
type MPCError struct {
	Op         string // e.g. "keygen"
	HTTPStatus int    // 0 if the error didn't involve an HTTP response
	Message    string
}

func (e *MPCError) Error() string {
	if e.HTTPStatus != 0 {
		return fmt.Sprintf("mchain: %s HTTP %d: %s", e.Op, e.HTTPStatus, e.Message)
	}
	return fmt.Sprintf("mchain: %s: %s", e.Op, e.Message)
}

// ErrSubstrateNotImplemented is returned when a Polkadot/Substrate
// keygen is requested. Substrate addresses require SS58 encoding from
// the ed25519 public key; the Go bridge doesn't depend on an SS58
// library yet. Surfaces as a clear error so callers know to wait or
// route the swap through a different path.
var ErrSubstrateNotImplemented = errors.New(
	"mchain: substrate (dot) address derivation not implemented; needs SS58 encoder",
)

// =============================================================================
// Client
// =============================================================================

// DefaultKeygenTimeout matches the 120s timeout in mpc-wallet.ts.
// Keygen rounds can be slow (multi-round MPC protocol over WAN), so
// the default is generous; tighten in tests.
const DefaultKeygenTimeout = 120 * time.Second

// Client is a Go client for the MPC keygen REST API. Construct one
// with New(...) or by populating fields on a zero-value Client.
type Client struct {
	// APIURL is the MPC service base URL (e.g.
	// `http://mpc-node-0.mpc-node-headless.lux-mpc.svc:9800`). The
	// /keygen endpoint is appended automatically. Required.
	APIURL string

	// Token is the internal API bearer token. The mpcd daemon protects
	// every endpoint except /health and /healthz behind
	// `Authorization: Bearer <token>` (see mpcd main.go:441).
	// Source the value from MPC_INTERNAL_API_KEY in production; in dev
	// it can be derived from the node identity via DeriveInternalKey.
	// Empty Token means no Authorization header — works only against
	// daemons started without auth.
	Token string

	// OrgID is the default tenant identifier the daemon multiplexes
	// keygen requests by. Required by mpcd; if empty, KeygenForDeposit
	// returns an MPCError early rather than letting the cluster 400.
	// Override per-call via KeygenForDepositWithOrg.
	OrgID string

	// Timeout bounds each individual keygen call. Zero means
	// DefaultKeygenTimeout. The caller's context.Context is also honored.
	Timeout time.Duration

	// HTTPClient is the underlying http.Client. Zero means
	// http.DefaultClient (no per-request timeout from the client
	// itself; Client.Timeout supplies that via context).
	HTTPClient *http.Client

	// Clock is the time source for wallet-id construction. Tests
	// override; production leaves it nil.
	Clock func() time.Time
}

// New constructs a Client pointing at apiURL with no Bearer token and
// no org id. Suitable for dev clusters started without auth. For prod,
// prefer NewAuthed or populate Token + OrgID on a zero-value Client.
func New(apiURL string, timeout time.Duration) *Client {
	return &Client{APIURL: apiURL, Timeout: timeout}
}

// NewAuthed constructs an auth-ready Client. token + orgID are
// required by the live mpcd daemon (see /root/luxify/mpc/cmd/mpcd/main.go
// line 441 onwards for the auth middleware; line 599 for the keygen
// request shape).
func NewAuthed(apiURL, token, orgID string, timeout time.Duration) *Client {
	return &Client{
		APIURL:  apiURL,
		Token:   token,
		OrgID:   orgID,
		Timeout: timeout,
	}
}

// DeriveInternalKey computes the deterministic internal API key the
// mpcd daemon derives when MPC_INTERNAL_API_KEY is not set:
//
//	SHA-256(ed25519 seed || "mpc-internal-api"), hex-encoded.
//
// `identityJSON` is the raw bytes of `${keysDir}/${nodeID}_identity.json`
// (the file written by mpcd's loadOrGenerateIdentity). Returns the hex
// string suitable for use as `Authorization: Bearer <key>`.
//
// Convenience for local dev where the operator can read the identity
// file directly. Production deployments should set MPC_INTERNAL_API_KEY
// on every node and pass it to the client via Token instead.
func DeriveInternalKey(identityJSON []byte) (string, error) {
	var id struct {
		PrivateKey string `json:"private_key"`
	}
	if err := json.Unmarshal(identityJSON, &id); err != nil {
		return "", fmt.Errorf("mchain: parse identity json: %w", err)
	}
	priv, err := hex.DecodeString(id.PrivateKey)
	if err != nil {
		return "", fmt.Errorf("mchain: decode private_key hex: %w", err)
	}
	if len(priv) != 64 { // ed25519.PrivateKeySize
		return "", fmt.Errorf("mchain: unexpected private_key length %d (want 64)", len(priv))
	}
	seed := priv[:32] // ed25519.PrivateKey.Seed()
	sum := sha256.Sum256(append(seed, []byte("mpc-internal-api")...))
	return hex.EncodeToString(sum[:]), nil
}

func (c *Client) httpClient() *http.Client {
	if c.HTTPClient != nil {
		return c.HTTPClient
	}
	return http.DefaultClient
}

func (c *Client) timeout() time.Duration {
	if c.Timeout > 0 {
		return c.Timeout
	}
	return DefaultKeygenTimeout
}

func (c *Client) now() time.Time {
	if c.Clock != nil {
		return c.Clock()
	}
	return time.Now()
}

// buildWalletID matches mpc-wallet.ts:
// `bridge-${networkInternalName.toLowerCase()}-${Date.now()}`.
// Date.now() in JS is milliseconds-since-epoch; we match that exactly
// so two implementations can produce identical ids given the same clock.
func (c *Client) buildWalletID(networkInternalName string) string {
	return fmt.Sprintf("bridge-%s-%d",
		strings.ToLower(networkInternalName),
		c.now().UnixMilli(),
	)
}

// =============================================================================
// KeygenForDeposit
// =============================================================================

// KeygenForDeposit triggers a fresh MPC keygen on the cluster and
// returns a *Wallet containing the chain-appropriate address. Uses
// Client.OrgID as the tenant identifier; for per-call override use
// KeygenForDepositWithOrg.
//
// This is the Go port of `createMPCWalletForDeposit` in mpc-wallet.ts,
// updated to match the live mpcd contract:
//   POST `${APIURL}/keygen` with `{org_id, wallet_id}` body and
//   `Authorization: Bearer <Token>` header.
//
// Errors:
//   - *MPCError{Op:"keygen", Message:"OrgID not configured"} when Client.OrgID is empty.
//   - *MPCError when the HTTP transport fails or the cluster returns
//     a non-2xx response. Inspect .HTTPStatus.
//   - *MPCError with Op="keygen" + Message="result_type=..." when the
//     cluster's MPCKeygenResult.result_type is set and not "success".
//   - ErrSubstrateNotImplemented for DOT requests.
//   - context.Canceled / context.DeadlineExceeded when the caller's
//     ctx (or the per-request timeout) fires first.
func (c *Client) KeygenForDeposit(ctx context.Context, networkInternalName string) (*Wallet, error) {
	return c.KeygenForDepositWithOrg(ctx, networkInternalName, c.OrgID)
}

// KeygenForDepositWithOrg is KeygenForDeposit with an explicit per-call
// orgID, useful for multi-tenant proxies that route by request header
// or path segment.
func (c *Client) KeygenForDepositWithOrg(ctx context.Context, networkInternalName, orgID string) (*Wallet, error) {
	if c.APIURL == "" {
		return nil, &MPCError{Op: "keygen", Message: "APIURL not configured"}
	}

	// DOT check fires BEFORE the org_id check: a DOT keygen can't
	// succeed regardless of auth, so the more informative
	// ErrSubstrateNotImplemented wins.
	addrType := AddressTypeFor(networkInternalName)
	if addrType == AddressTypeDOT {
		return nil, ErrSubstrateNotImplemented
	}
	if orgID == "" {
		return nil, &MPCError{Op: "keygen", Message: "org_id required (set Client.OrgID or pass per-call)"}
	}

	walletID := c.buildWalletID(networkInternalName)

	body, err := json.Marshal(map[string]string{
		"org_id":    orgID,
		"wallet_id": walletID,
	})
	if err != nil {
		return nil, fmt.Errorf("mchain: marshal keygen body: %w", err)
	}

	callCtx, cancel := context.WithTimeout(ctx, c.timeout())
	defer cancel()

	req, err := http.NewRequestWithContext(callCtx, http.MethodPost,
		strings.TrimRight(c.APIURL, "/")+"/keygen",
		bytes.NewReader(body),
	)
	if err != nil {
		return nil, fmt.Errorf("mchain: build keygen request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	if c.Token != "" {
		req.Header.Set("Authorization", "Bearer "+c.Token)
	}

	resp, err := c.httpClient().Do(req)
	if err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return nil, err
		}
		return nil, &MPCError{Op: "keygen", Message: err.Error()}
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, &MPCError{
			Op:         "keygen",
			HTTPStatus: resp.StatusCode,
			Message:    fmt.Sprintf("HTTP %d: %s", resp.StatusCode, truncate(respBody, 256)),
		}
	}

	var result keygenResult
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, &MPCError{
			Op:         "keygen",
			HTTPStatus: resp.StatusCode,
			Message:    fmt.Sprintf("decode response: %v (body=%s)", err, truncate(respBody, 200)),
		}
	}

	if result.ResultType != "" && result.ResultType != "success" {
		msg := result.Error
		if msg == "" {
			msg = "unknown"
		}
		return nil, &MPCError{
			Op:      "keygen",
			Message: fmt.Sprintf("result_type=%s: %s", result.ResultType, msg),
		}
	}

	address, err := pickAddress(&result, addrType)
	if err != nil {
		return nil, err
	}

	// Bitcoin testnet patch: mpcd returns mainnet-format P2PKH addresses
	// for BTC keygens regardless of the requesting network's testnet flag
	// (verified empirically against the live cluster on 2026-05-28).
	// Re-encode locally so BITCOIN_TESTNET deposits actually land at a
	// valid testnet address. The fix belongs in mpcd long-term; this is
	// a stopgap so the bridge isn't blocked. Idempotent on input that's
	// already testnet — once mpcd is fixed, this call becomes a no-op.
	if addrType == AddressTypeBTC && isBTCTestnet(networkInternalName) {
		converted, convErr := btcAddressForTestnet(address)
		if convErr != nil {
			return nil, &MPCError{
				Op:      "keygen",
				Message: fmt.Sprintf("btc testnet address re-encode: %v", convErr),
			}
		}
		address = converted
	}

	// TON patch: the SOL slot carries the raw ed25519 pubkey, not a TON
	// wallet contract address. Real TON wallets are smart contracts whose
	// address = hash(StateInit). Derive the V4R2 contract address and
	// format it with the right testnet/mainnet flag so the user sees a
	// fundable kQ.../0Q.../EQ.../UQ... string instead of a Solana-format
	// pubkey. PubKeyHex is captured separately so the signing driver can
	// rebuild the wallet contract for message construction.
	var pubKeyHex string
	if addrType == AddressTypeTON {
		converted, convErr := tonAddressFromEd25519PubKey(address, isTONTestnet(networkInternalName))
		if convErr != nil {
			return nil, &MPCError{
				Op:      "keygen",
				Message: fmt.Sprintf("ton wallet address derive: %v", convErr),
			}
		}
		hexKey, hexErr := hexEd25519FromBase58(address)
		if hexErr != nil {
			return nil, &MPCError{
				Op:      "keygen",
				Message: fmt.Sprintf("ton pubkey hex encode: %v", hexErr),
			}
		}
		address = converted
		pubKeyHex = hexKey
	} else if addrType == AddressTypeSOL {
		// Symmetry with TON: same slot carries the same shape (raw
		// ed25519 pubkey base58-encoded). Solana's signing path
		// currently re-decodes from the address; capturing pubKeyHex
		// here lets us migrate that path to the same convention.
		hexKey, hexErr := hexEd25519FromBase58(address)
		if hexErr != nil {
			return nil, &MPCError{
				Op:      "keygen",
				Message: fmt.Sprintf("sol pubkey hex encode: %v", hexErr),
			}
		}
		pubKeyHex = hexKey
	} else if addrType == AddressTypeXRP {
		// XRP r-address derivation: SHA-256 → RIPEMD-160 of (0xED ||
		// pubkey), base58 with Ripple alphabet. r-addresses are
		// network-agnostic (no testnet/mainnet prefix distinction);
		// the bridge picks the XRPL RPC endpoint by network name at
		// deposit-watch / broadcast time, not by address shape.
		converted, convErr := xrpAddressFromEd25519PubKey(address)
		if convErr != nil {
			return nil, &MPCError{
				Op:      "keygen",
				Message: fmt.Sprintf("xrp r-address derive: %v", convErr),
			}
		}
		hexKey, hexErr := hexEd25519FromBase58(address)
		if hexErr != nil {
			return nil, &MPCError{
				Op:      "keygen",
				Message: fmt.Sprintf("xrp pubkey hex encode: %v", hexErr),
			}
		}
		address = converted
		pubKeyHex = hexKey
	}

	// The cluster echoes back its own wallet_id; if it's empty fall
	// back to the one we sent so the SDK's `name###address` contract
	// always has a non-empty name slot.
	name := result.WalletID
	if name == "" {
		name = walletID
	}

	return &Wallet{
		Name:        name,
		Address:     address,
		AddressType: addrType,
		PubKeyHex:   pubKeyHex,
	}, nil
}

// =============================================================================
// SignForWallet — threshold signing for a previously-keygen'd wallet
// =============================================================================

// SignResult is the success payload returned by the /sign endpoint.
// Shape mirrors the keygen response style: `result_type=success` →
// `signature` + `session_id` populated; otherwise `error` + `error_code`.
type SignResult struct {
	Signature string `json:"signature"`
	SessionID string `json:"session_id"`
}

// signResultWire is the on-wire envelope. Internal — callers consume
// *SignResult through SignForWallet.
type signResultWire struct {
	WalletID   string `json:"wallet_id"`
	Signature  string `json:"signature"`
	SessionID  string `json:"session_id"`
	ResultType string `json:"result_type"`
	Error      string `json:"error"`
}

// SignForWallet requests a threshold signature on `messageHex` from
// the MPC cluster for the previously-generated wallet identified by
// `walletID`. messageHex is the hex-encoded message digest the
// cluster will sign (typically a 32-byte hash for ECDSA / Ed25519).
//
// Returns *SignResult on success. *MPCError on transport / auth /
// result_type failures. context errors on cancellation / timeout.
//
// Wire shape (mirrors /keygen):
//   POST `${APIURL}/sign`
//   Authorization: Bearer <Token>
//   Content-Type: application/json
//   {"org_id":"...","wallet_id":"...","message":"<hex>"}
//
// Response on success: {wallet_id, signature, session_id, result_type:"success"}
// Response on cluster-side failure: {wallet_id, error, error_code, result_type:"error"}
//
// Note: as of 2026-05, the live lux-mpc daemon (mpcd) exposes /keygen
// on the internal API port (:6000) but NOT /sign — the dashboard API
// (port 8081, gated on MPC_JWT_SECRET) hosts signing under
// /v1/mpc/wallets/{id}/sessions. This method targets the simpler /sign
// shape that the cluster is expected to grow; callers can point Client
// at a custom URL if their deployment routes differently.
func (c *Client) SignForWallet(ctx context.Context, walletID, messageHex string) (*SignResult, error) {
	return c.SignForWalletWithOrg(ctx, walletID, messageHex, c.OrgID)
}

// SignForWalletWithOrg is SignForWallet with an explicit per-call orgID.
func (c *Client) SignForWalletWithOrg(ctx context.Context, walletID, messageHex, orgID string) (*SignResult, error) {
	if c.APIURL == "" {
		return nil, &MPCError{Op: "sign", Message: "APIURL not configured"}
	}
	if walletID == "" {
		return nil, &MPCError{Op: "sign", Message: "wallet_id required"}
	}
	if messageHex == "" {
		return nil, &MPCError{Op: "sign", Message: "message required (hex-encoded)"}
	}
	if orgID == "" {
		return nil, &MPCError{Op: "sign", Message: "org_id required (set Client.OrgID or pass per-call)"}
	}

	body, err := json.Marshal(map[string]string{
		"org_id":    orgID,
		"wallet_id": walletID,
		"message":   messageHex,
	})
	if err != nil {
		return nil, fmt.Errorf("mchain: marshal sign body: %w", err)
	}

	callCtx, cancel := context.WithTimeout(ctx, c.timeout())
	defer cancel()

	req, err := http.NewRequestWithContext(callCtx, http.MethodPost,
		strings.TrimRight(c.APIURL, "/")+"/sign",
		bytes.NewReader(body),
	)
	if err != nil {
		return nil, fmt.Errorf("mchain: build sign request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	if c.Token != "" {
		req.Header.Set("Authorization", "Bearer "+c.Token)
	}

	resp, err := c.httpClient().Do(req)
	if err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return nil, err
		}
		return nil, &MPCError{Op: "sign", Message: err.Error()}
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, &MPCError{
			Op:         "sign",
			HTTPStatus: resp.StatusCode,
			Message:    fmt.Sprintf("HTTP %d: %s", resp.StatusCode, truncate(respBody, 256)),
		}
	}

	var result signResultWire
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, &MPCError{
			Op:         "sign",
			HTTPStatus: resp.StatusCode,
			Message:    fmt.Sprintf("decode response: %v (body=%s)", err, truncate(respBody, 200)),
		}
	}
	if result.ResultType != "" && result.ResultType != "success" {
		msg := result.Error
		if msg == "" {
			msg = "unknown"
		}
		return nil, &MPCError{
			Op:      "sign",
			Message: fmt.Sprintf("result_type=%s: %s", result.ResultType, msg),
		}
	}
	if result.Signature == "" {
		return nil, &MPCError{
			Op:      "sign",
			Message: "no signature returned from MPC cluster",
		}
	}

	return &SignResult{
		Signature: result.Signature,
		SessionID: result.SessionID,
	}, nil
}

// pickAddress mirrors the TS switch on AddressType. Returns an
// *MPCError when the chosen slot is empty.
func pickAddress(r *keygenResult, t AddressType) (string, error) {
	var addr string
	switch t {
	case AddressTypeBTC:
		addr = r.BTCAddress
	case AddressTypeSOL, AddressTypeTON, AddressTypeXRP:
		// TON + XRP share the SOL keygen slot in the current cluster
		// output (raw ed25519 pubkey base58-encoded). The actual
		// chain-specific address derivation runs in the
		// post-pickAddress patch in KeygenForDeposit/KeygenForRelease
		// — TON computes hash(StateInit), XRP computes the ed25519
		// r-address. Surfacing the pubkey here lets the empty-slot
		// guard fire on real cluster failures and not on legitimate
		// ed25519 output.
		addr = r.SOLAddress
	case AddressTypeDOT:
		// Should never be reached — caller guards via ErrSubstrateNotImplemented.
		return "", ErrSubstrateNotImplemented
	default: // AddressTypeETH or unknown → eth
		addr = r.ETHAddress
	}
	if addr == "" {
		return "", &MPCError{
			Op:      "keygen",
			Message: fmt.Sprintf("no %s address returned from MPC keygen", t),
		}
	}
	return addr, nil
}

func truncate(b []byte, n int) string {
	if len(b) <= n {
		return string(b)
	}
	return string(b[:n]) + "…"
}
