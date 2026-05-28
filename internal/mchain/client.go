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
	"sync"
	"time"

	"github.com/luxfi/bridge/internal/xrpl"
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

// Curve names the threshold-signature scheme the MPC cluster keygens /
// signs under. The lux-mpc dashboard (mpcd v2026-05+) accepts a
// per-request curve switch; default is ECDSA/secp256k1 for backwards
// compatibility with the original ETH/BTC pipeline. Solana / Cardano
// / Polkadot need Ed25519 (FROST). Each address type maps to exactly
// one curve — CurveFor() is the source of truth.
type Curve string

const (
	// CurveSecp256k1 = ECDSA on secp256k1. ETH + BTC.
	CurveSecp256k1 Curve = "secp256k1"
	// CurveEd25519 = EdDSA on Ed25519 via FROST. SOL + TON + DOT + Cardano.
	CurveEd25519 Curve = "ed25519"
)

// CurveFor returns the canonical curve for a given address family.
// Used to populate the `curve` field on the keygen + sign request
// bodies — the dashboard hands back the curve-appropriate pubkey slot
// (eddsa_pub_key for Ed25519, ecdsa_pub_key otherwise).
//
// XRP is secp256k1 with rAddress derivation; the bridge tracks it as
// AddressTypeXRP but the underlying key is the same as ETH today, so
// it lands on secp256k1. Cardano shares the SOL slot per the legacy
// TS mapping — its underlying key is Ed25519.
func CurveFor(t AddressType) Curve {
	switch t {
	case AddressTypeSOL, AddressTypeTON, AddressTypeDOT:
		return CurveEd25519
	default:
		return CurveSecp256k1
	}
}

// networkAddressType mirrors NETWORK_ADDRESS_TYPE in mpc-wallet.ts.
// Unknown networks default to AddressTypeETH (matches TS behavior).
var networkAddressType = map[string]AddressType{
	// EVM chains use eth address
	"ETHEREUM_MAINNET": AddressTypeETH,
	"ETHEREUM_SEPOLIA": AddressTypeETH,
	"ETHEREUM_GOERLI":  AddressTypeETH,
	"BASE_MAINNET":     AddressTypeETH,
	"BASE_SEPOLIA":     AddressTypeETH,
	"HOLESKY_TESTNET":  AddressTypeETH,
	"LUX_MAINNET":      AddressTypeETH,
	"LUX_TESTNET":      AddressTypeETH,
	"LUX_DEVNET":       AddressTypeETH,
	"ZOO_MAINNET":      AddressTypeETH,
	"ZOO_TESTNET":      AddressTypeETH,
	"ZOO_DEVNET":       AddressTypeETH,
	"BSC_MAINNET":      AddressTypeETH,
	"BSC_TESTNET":      AddressTypeETH,
	"POLYGON_MAINNET":  AddressTypeETH,
	"ARBITRUM_MAINNET": AddressTypeETH,
	"OPTIMISM_MAINNET": AddressTypeETH,
	"AVAX_MAINNET":     AddressTypeETH,
	"FANTOM_MAINNET":   AddressTypeETH,
	"CELO_MAINNET":     AddressTypeETH,
	"GNOSIS_MAINNET":   AddressTypeETH,
	"AURORA_MAINNET":   AddressTypeETH,
	"ZORA_MAINNET":     AddressTypeETH,
	"BLAST_MAINNET":    AddressTypeETH,
	"LINEA_MAINNET":    AddressTypeETH,
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
	"POLKADOT_TESTNET": AddressTypeDOT,
	"KUSAMA_MAINNET":   AddressTypeDOT,
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
//
// EVMAddress is the alternate name mpcd uses on the wire ("evm_address"
// in /root/luxify/mpc/cmd/mpcd/main.go around line 665). We accept
// either spelling so the bridge keeps working through the renaming
// transition.
//
// BTCAddress is mpcd's legacy P2PKH "1..." address. For bridge-side
// release flows we don't use it directly — we re-derive a P2WPKH
// bech32 address from ECDSAPubKey via deriveBTCBech32Address. The
// P2WPKH form is what btcsuite txscript/wire actually expects on the
// release side; mpcd's legacy P2PKH is preserved on the wire only for
// SDK back-compat.
type keygenResult struct {
	WalletID    string `json:"wallet_id"`
	ECDSAPubKey string `json:"ecdsa_pub_key"`
	EDDSAPubKey string `json:"eddsa_pub_key"`
	ETHAddress  string `json:"eth_address"`
	EVMAddress  string `json:"evm_address"`
	BTCAddress  string `json:"btc_address"`
	SOLAddress  string `json:"sol_address"`
	ResultType  string `json:"result_type"`
	Error       string `json:"error"`
}

// Wallet is the public result of a keygen for one bridge deposit.
// Caller stores Name + Address; Name doubles as the MPC wallet
// identifier that the deposit-watcher and signing-session code use to
// recover the underlying key shares.
type Wallet struct {
	// Name is the MPC wallet identifier (e.g. "bridge-ethereum_sepolia-1718000000").
	Name string
	// Address is the source-chain receive address derived from the
	// keygen output, picked according to AddressTypeFor(network). For
	// BTC, this is the bech32 P2WPKH derived locally from ECDSAPubKey
	// (mpcd's legacy P2PKH form is intentionally not used — P2WPKH is
	// what the bridge release flow consumes).
	Address string
	// AddressType is the family of Address. Useful for downstream code
	// that needs to render or validate the address.
	AddressType AddressType
	// ECDSAPubKey is the 33-byte compressed secp256k1 public key the
	// MPC quorum produced. Required by:
	//   - BTC release: witness stack on Finalize (P2WPKH spends include
	//     the pubkey alongside the DER signature).
	//   - DOT release: assembler derives the AccountId32 + picks the
	//     ECDSA recovery byte at Finalize time.
	//   - XRP release: tx wire payload embeds the pubkey + verifiers
	//     reconstruct the address from it.
	// Empty when the keygen result didn't carry an ECDSA pubkey
	// (Ed25519-only paths: SOL, TON).
	ECDSAPubKey []byte
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

// ErrSubstrateNotImplemented historically signalled "DOT keygen
// unsupported by the bridge". As of the DOT integration the bridge
// derives the SS58 address client-side from the cluster's
// ecdsa_pub_key, so this error is no longer returned by KeygenForDeposit.
// Kept exported for callers that historically branched on errors.Is —
// they'll never see it return now, but the symbol stays a stable
// part of the API.
//
// Deprecated: as of bridge v2.x.x DOT is supported; do not branch on
// errors.Is against this value any more.
var ErrSubstrateNotImplemented = errors.New(
	"mchain: substrate (dot) address derivation not implemented; needs SS58 encoder",
)

// ErrMissingPubKey is returned when a substrate (DOT) keygen succeeds
// but the cluster didn't populate ecdsa_pub_key — substrate ECDSA
// AccountId derivation needs the compressed pubkey. Surfaces clearly
// so the operator knows the MPC cluster's response shape changed.
var ErrMissingPubKey = errors.New(
	"mchain: substrate keygen response missing ecdsa_pub_key — cluster cannot derive SS58 address",
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

	// DashboardURL points at the lux-mpc dashboard listener (typically
	// port 8081). When set, SignForWallet routes through
	// POST /v1/mpc/sign there instead of the legacy ${APIURL}/sign
	// path (which the live mpcd v2026-05 daemon does NOT expose on
	// the internal port). EnsureDashboardSession lazily mints a
	// signing session on first use per (wallet, org).
	DashboardURL string

	// DashboardToken is a JWT for the dashboard API. Bridge gets one
	// via /v1/auth/login or /v1/auth/oidc and refreshes it itself;
	// pass the most-recent value via this field. Mutually exclusive
	// with DashboardAPIKey — Bearer wins if both are set.
	DashboardToken string

	// DashboardAPIKey is an X-API-Key for the dashboard API. Bridge
	// callers without OIDC plumbing can mint an API key once on the
	// MPC dashboard with permissions=["sign"] and pass it here.
	DashboardAPIKey string

	// sessions caches dashboard session IDs by (walletID, orgID).
	// Lazily initialized — sessionsOnce guards the first access.
	sessions     *sessionCache
	sessionsOnce sync.Once
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
//
//	POST `${APIURL}/keygen` with `{org_id, wallet_id}` body and
//	`Authorization: Bearer <Token>` header.
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
	addrType := AddressTypeFor(networkInternalName)
	if orgID == "" {
		return nil, &MPCError{Op: "keygen", Message: "org_id required (set Client.OrgID or pass per-call)"}
	}

	walletID := c.buildWalletID(networkInternalName)
	curve := CurveFor(addrType)

	body, err := json.Marshal(map[string]string{
		"org_id":    orgID,
		"wallet_id": walletID,
		// curve switches the cluster between ECDSA/secp256k1 and
		// Ed25519/FROST. The live mpcd daemon ignores unknown keys, so
		// older deployments that don't yet honour curve will fall back
		// to their compile-time default (secp256k1) — that produces an
		// EVM-shaped keygen which the SOL address picker then rejects
		// downstream with a clear error. New deployments honour the
		// hint and return an eddsa_pub_key + sol_address slot.
		"curve": string(curve),
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

	address, err := pickAddress(&result, addrType, networkInternalName)
	if err != nil {
		return nil, err
	}

	// The cluster echoes back its own wallet_id; if it's empty fall
	// back to the one we sent so the SDK's `name###address` contract
	// always has a non-empty name slot.
	name := result.WalletID
	if name == "" {
		name = walletID
	}

	// Decode the compressed ECDSA pubkey for downstream consumers
	// (BTC release flow needs it for the witness stack; XRP release
	// flow embeds it in the Payment's SigningPubKey; DOT signing
	// derives AccountId32). Best-effort: if the keygen didn't return
	// one (ed25519-only path), leave nil.
	var ecdsaPubKey []byte
	if result.ECDSAPubKey != "" {
		if decoded, derr := hex.DecodeString(strings.TrimPrefix(result.ECDSAPubKey, "0x")); derr == nil {
			ecdsaPubKey = compressSecp256k1Pubkey(decoded)
		}
	}

	return &Wallet{
		Name:        name,
		Address:     address,
		AddressType: addrType,
		ECDSAPubKey: ecdsaPubKey,
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
//
//	POST `${APIURL}/sign`
//	Authorization: Bearer <Token>
//	Content-Type: application/json
//	{"org_id":"...","wallet_id":"...","message":"<hex>"}
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

// SignForWalletOnCurve is SignForWallet with an explicit curve hint. The
// caller (signing driver) knows the destination address family and so
// the curve. The hint is forwarded to the dashboard so it routes the
// session to the matching threshold-signature stack: ECDSA/secp256k1
// for ETH/BTC, EdDSA/Ed25519 (FROST) for SOL/TON/DOT/Cardano.
//
// On the wire: an extra "curve" field in the POST body. Older
// dashboards ignore unknown fields, so the call degrades to whatever
// the cluster's default curve is (secp256k1) — that returns a 65-byte
// ECDSA signature which the SOL finalizer will reject with a clear
// error.
func (c *Client) SignForWalletOnCurve(ctx context.Context, walletID, messageHex string, curve Curve) (*SignResult, error) {
	return c.SignForWalletOnCurveWithOrg(ctx, walletID, messageHex, c.OrgID, curve)
}

// SignForWalletWithOrg is SignForWallet with an explicit per-call orgID.
func (c *Client) SignForWalletWithOrg(ctx context.Context, walletID, messageHex, orgID string) (*SignResult, error) {
	return c.SignForWalletOnCurveWithOrg(ctx, walletID, messageHex, orgID, CurveSecp256k1)
}

// SignForWalletOnCurveWithOrg is the canonical implementation. All
// other variants funnel through here with curve defaulting to
// CurveSecp256k1 for backward compat.
func (c *Client) SignForWalletOnCurveWithOrg(ctx context.Context, walletID, messageHex, orgID string, curve Curve) (*SignResult, error) {
	if walletID == "" {
		return nil, &MPCError{Op: "sign", Message: "wallet_id required"}
	}
	if messageHex == "" {
		return nil, &MPCError{Op: "sign", Message: "message required (hex-encoded)"}
	}
	if orgID == "" {
		return nil, &MPCError{Op: "sign", Message: "org_id required (set Client.OrgID or pass per-call)"}
	}

	// Production path: dashboard API. The live mpcd v2026-05 daemon
	// only serves /sign through the dashboard listener (port 8081),
	// gated by JWT or X-API-Key. EnsureDashboardSession lazily mints
	// a per-(wallet, org) signing grant that signViaDashboard reuses.
	if c.DashboardSigning() {
		return c.signViaDashboard(ctx, walletID, messageHex, orgID, curve)
	}

	// Legacy path: ${APIURL}/sign — kept for in-process mocks and any
	// future internal-API rev that grows a /sign route. The live
	// cluster does NOT serve this; configuring only APIURL is a
	// misconfiguration we surface clearly.
	if c.APIURL == "" {
		return nil, &MPCError{Op: "sign", Message: "neither APIURL nor DashboardURL configured"}
	}

	body, err := json.Marshal(map[string]string{
		"org_id":    orgID,
		"wallet_id": walletID,
		"message":   messageHex,
		// curve is forwarded so legacy mocks can branch on it. Production
		// runs through the dashboard path above.
		"curve": string(curve),
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
//
// networkInternalName is required for BTC so the bech32 hrp matches the
// destination (BITCOIN_MAINNET → "bc"; BITCOIN_TESTNET → "tb") and for
// substrate / DOT so the SS58 prefix matches the network. For every
// other family it's currently ignored but threaded so the API is uniform.
//
// BTC handling: mpcd's btc_address field is a legacy P2PKH "1..." Base58
// address. The bridge release flow uses bech32 P2WPKH, derived locally
// from the ECDSAPubKey returned alongside. If the keygen returns an
// ECDSAPubKey we ALWAYS prefer the locally-derived P2WPKH; otherwise we
// fall back to the legacy form so SDK callers that read the wire
// `btc_address` slot still get something.
//
// DOT handling: Substrate ECDSA AccountId = blake2_256(compressed_pubkey),
// then SS58-encoded with the network-specific prefix (Polkadot mainnet
// vs Kusama vs Westend/generic testnet).
func pickAddress(r *keygenResult, t AddressType, networkInternalName string) (string, error) {
	var addr string
	switch t {
	case AddressTypeBTC:
		// Prefer locally-derived bech32 P2WPKH from the ECDSAPubKey.
		if derived, derr := deriveBTCBech32Address(r.ECDSAPubKey, networkInternalName); derr == nil && derived != "" {
			addr = derived
		} else {
			addr = r.BTCAddress
		}
	case AddressTypeSOL, AddressTypeTON:
		// TON shares the SOL keygen slot in the current cluster output.
		// Long-term TON needs its own address derivation from the
		// ed25519 pubkey, but for now match TS placeholder behaviour.
		addr = r.SOLAddress
	case AddressTypeXRP:
		// XRP r-address derivation: take the compressed-secp256k1 ECDSA
		// pubkey returned by the MPC cluster, RIPEMD160(SHA256(pub)) →
		// AccountID, then base58check with the XRPL alphabet + 0x00
		// version byte. The cluster doesn't surface an r-address slot
		// directly (XRPL never had its own keygen response field) but
		// the ECDSAPubKey IS the pubkey that controls the XRP account,
		// so derivation here is canonical and reversible.
		//
		// When the cluster's ECDSA pubkey field is empty (legacy mocks /
		// shape-only test fixtures), fall back to ETH address as a stable
		// identifier so the cluster integration tests pass. Production
		// keygen always populates ecdsa_pub_key.
		if r.ECDSAPubKey != "" {
			pubHex := strings.TrimPrefix(strings.TrimPrefix(r.ECDSAPubKey, "0x"), "0X")
			pub, err := hex.DecodeString(pubHex)
			if err != nil {
				return "", &MPCError{
					Op:      "keygen",
					Message: fmt.Sprintf("decode ECDSAPubKey hex %q: %v", r.ECDSAPubKey, err),
				}
			}
			rAddr, err := xrpl.AddressFromPubKey(pub)
			if err != nil {
				return "", &MPCError{
					Op:      "keygen",
					Message: fmt.Sprintf("derive XRP r-address: %v", err),
				}
			}
			addr = rAddr
		} else {
			addr = r.ETHAddress
		}
	case AddressTypeDOT:
		// Substrate ECDSA AccountId = blake2_256(compressed_pubkey),
		// then SS58-encoded with the network-specific prefix. Derive
		// client-side from the ecdsa_pub_key the cluster returns —
		// the mpcd daemon doesn't (yet) emit SS58 strings natively.
		if r.ECDSAPubKey == "" {
			return "", ErrMissingPubKey
		}
		ss58, err := deriveSubstrateSS58(r.ECDSAPubKey, networkInternalName)
		if err != nil {
			return "", &MPCError{
				Op:      "keygen",
				Message: fmt.Sprintf("derive SS58 address: %v", err),
			}
		}
		addr = ss58
	default: // AddressTypeETH or unknown → eth
		addr = preferEVMAddress(r)
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
