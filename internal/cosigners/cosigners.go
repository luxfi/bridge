// Package cosigners is the Go port of app/server/src/domain/cosigners.ts.
//
// Layered cosigners (since SDK v1.0.3) let institutional flows attach an
// external custodian (Utila / Fireblocks) on top of the native MPC threshold
// signature. Per-swap, the SDK POSTs a `cosigners[]` array of PUBLIC
// identifiers (org_id, client_id, api_key, vault ids). The bridge:
//
//  1. Validates the wire shape — rejects malformed or secret-leaking input.
//  2. Fetches the secret half (Utila service-account PEM, Fireblocks
//     secret PEM) from KMS / env, keyed by the public identifier.
//  3. After the native MPC sign completes, dispatches a cosign request to
//     each external custodian. They attest to the same tx hash separately.
//  4. Surfaces approval/rejection to the swap state machine. "All listed
//     must approve" — any rejection → swap fails.
//
// Wire-shape invariant: the TS types in app/server/src/domain/cosigners.ts
// and pkg/bridge/src/types.ts are the source of truth. Snake-case fields,
// `kind` discriminator. Match exactly; the SDK posts what these say.
//
// Security invariant: SECRET MATERIAL NEVER CROSSES THE WIRE. The SDK only
// sends public identifiers. ValidateIntents rejects any field name in
// SECRET_FIELD_NAMES (e.g. `api_secret`, `private_key`, `jwt`, `token`) as
// a defensive layer in case a buggy consumer ever forwards them. Bridge
// fetches the secret half from KMS at dispatch time via SecretStore.
package cosigners

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
)

// =============================================================================
// Wire types — match the TS SDK exactly. Do not drift.
// =============================================================================

// Kind discriminates the cosigner family. Marshalled as the `kind` field on
// the wire. Adding a new family means adding a new Kind constant, a new
// Intent variant, and a new dispatcher branch.
type Kind string

const (
	KindUtila      Kind = "utila"
	KindFireblocks Kind = "fireblocks"
)

// Intent is the per-swap, per-cosigner declaration the SDK sends. Only one
// of Utila / Fireblocks is populated (corresponding to Kind). The "intent"
// terminology mirrors the TS module — what the swap creator INTENDS to
// require, before any actual cosign dispatch.
type Intent struct {
	Kind       Kind              `json:"kind"`
	Utila      *UtilaIntent      `json:"-"`
	Fireblocks *FireblocksIntent `json:"-"`
}

// UtilaIntent carries the public identifiers needed to reach a tenant's
// Utila vault. The matching service-account PEM lives in KMS keyed by
// OrgID — Bridge fetches it at dispatch time.
type UtilaIntent struct {
	OrgID    string `json:"org_id"`
	ClientID string `json:"client_id"`
	APIHost  string `json:"api_host,omitempty"`
	VaultID  string `json:"vault_id,omitempty"`
}

// FireblocksIntent carries the Fireblocks API key (public id) + optional
// vault account scoping. The secret PEM lives in KMS keyed by APIKey —
// Bridge fetches it at dispatch time.
type FireblocksIntent struct {
	APIKey         string `json:"api_key"`
	APIHost        string `json:"api_host,omitempty"`
	VaultAccountID string `json:"vault_account_id,omitempty"`
}

// Status is the terminal disposition of a cosign step.
type Status string

const (
	// StatusApproved — cosigner signed; provides Signature.
	StatusApproved Status = "approved"
	// StatusRejected — external denial (Fireblocks RAW-sign rejected, Utila
	// approval workflow denied, etc.). Bridge fails the swap and surfaces
	// Reason to the user.
	StatusRejected Status = "rejected"
	// StatusFailed — transport error, config gap, timeout, or
	// not-yet-implemented. Distinct from "rejected" so the operator can
	// retry / fix config rather than treating it as a user-facing denial.
	StatusFailed Status = "failed"
)

// Result is the outcome of a single cosign step.
type Result struct {
	Intent     Intent `json:"intent"`
	Status     Status `json:"status"`
	Signature  string `json:"signature,omitempty"`   // present iff approved
	Reason     string `json:"reason,omitempty"`      // present unless approved
	ExternalID string `json:"external_id,omitempty"` // external txId for traceability
}

// =============================================================================
// Wire-shape validation
// =============================================================================

// ErrBadIntent is the validation error type. Includes the index of the
// offending entry so the caller can surface a precise message.
type ErrBadIntent struct {
	Index   int // 0-based; -1 means the top-level value wasn't an array
	Message string
}

func (e *ErrBadIntent) Error() string {
	if e.Index < 0 {
		return fmt.Sprintf("cosigners: %s", e.Message)
	}
	return fmt.Sprintf("cosigners[%d]: %s", e.Index, e.Message)
}

// secretFieldNames is the defensive deny-list — any cosigner entry that
// carries one of these field names is rejected at validation time. The SDK
// is not supposed to forward these; this catches forwarder bugs before
// secret material lands on the wire. Mirrors the TS SECRET_FIELD_NAMES.
var secretFieldNames = map[string]struct{}{
	"secret":                      {},
	"api_secret":                  {},
	"private_key":                 {},
	"secret_key":                  {},
	"service_account_private_key": {},
	"jwt":                         {},
	"token":                       {},
	"auth_token":                  {},
}

// rawIntent is the JSON parse target — every field optional so we can do
// precise validation per Kind. The handler receives the cosigners array
// as []map[string]any from the swap-create payload, then calls
// ValidateIntents to convert to typed Intents.
type rawIntent = map[string]any

// ValidateIntents parses the raw cosigners array off the swap-create body
// into typed Intents. Returns ErrBadIntent on the first malformed entry —
// the dispatch path requires either ALL intents valid or ZERO; we don't
// silently drop bad entries.
//
// nil / empty input → empty slice, nil error. A swap with no cosigners is
// the common case; we don't force the SDK to send `cosigners: []`.
func ValidateIntents(raw []any) ([]Intent, error) {
	if len(raw) == 0 {
		return nil, nil
	}
	out := make([]Intent, 0, len(raw))
	for i, item := range raw {
		m, ok := item.(rawIntent)
		if !ok {
			return nil, &ErrBadIntent{Index: i, Message: "must be an object"}
		}
		// Defensive: reject if any field name in the entry matches a known
		// secret name. Field-name comparison is case-insensitive.
		for k := range m {
			if _, secret := secretFieldNames[strings.ToLower(k)]; secret {
				return nil, &ErrBadIntent{
					Index:   i,
					Message: fmt.Sprintf("unexpected secret-like field %q — secrets must NEVER cross the wire; backend reads them from KMS", k),
				}
			}
		}
		kindRaw, _ := m["kind"].(string)
		switch Kind(kindRaw) {
		case KindUtila:
			intent, err := parseUtila(m, i)
			if err != nil {
				return nil, err
			}
			out = append(out, intent)
		case KindFireblocks:
			intent, err := parseFireblocks(m, i)
			if err != nil {
				return nil, err
			}
			out = append(out, intent)
		case "":
			return nil, &ErrBadIntent{Index: i, Message: "kind required"}
		default:
			return nil, &ErrBadIntent{Index: i, Message: fmt.Sprintf("unknown kind %q", kindRaw)}
		}
	}
	return out, nil
}

func parseUtila(m rawIntent, i int) (Intent, error) {
	orgID, _ := m["org_id"].(string)
	if orgID == "" {
		return Intent{}, &ErrBadIntent{Index: i, Message: "utila: org_id required"}
	}
	clientID, _ := m["client_id"].(string)
	if clientID == "" {
		return Intent{}, &ErrBadIntent{Index: i, Message: "utila: client_id required"}
	}
	u := &UtilaIntent{OrgID: orgID, ClientID: clientID}
	if host, _ := m["api_host"].(string); host != "" {
		u.APIHost = host
	}
	if vault, _ := m["vault_id"].(string); vault != "" {
		u.VaultID = vault
	}
	return Intent{Kind: KindUtila, Utila: u}, nil
}

func parseFireblocks(m rawIntent, i int) (Intent, error) {
	apiKey, _ := m["api_key"].(string)
	if apiKey == "" {
		return Intent{}, &ErrBadIntent{Index: i, Message: "fireblocks: api_key required"}
	}
	f := &FireblocksIntent{APIKey: apiKey}
	if host, _ := m["api_host"].(string); host != "" {
		f.APIHost = host
	}
	if vault, _ := m["vault_account_id"].(string); vault != "" {
		f.VaultAccountID = vault
	}
	return Intent{Kind: KindFireblocks, Fireblocks: f}, nil
}

// =============================================================================
// Dispatch
// =============================================================================

// DispatchOptions is the per-swap context the dispatcher needs. Mirrors
// the TS DispatchCosignersOptions.
type DispatchOptions struct {
	// SwapID for tracing + idempotency.
	SwapID string
	// NativeSignature already produced by the MPC threshold network (hex).
	// Cosigners attest to this signature.
	NativeSignature string
	// TxHash that cosigners are attesting to (hex, destination chain).
	TxHash string
	// Cosigners is the list of intents from the swap record.
	Cosigners []Intent
}

// Dispatcher runs all cosign steps for a swap. Implementations MUST run
// intents in parallel (cosigners are independent) and MUST NOT mutate
// swap state — the caller's state machine decides what to do with each
// Result.
type Dispatcher interface {
	Dispatch(ctx context.Context, opts DispatchOptions) ([]Result, error)
}

// SecretStore fetches the secret half of a cosigner credential by the
// public identifier in the intent. Production implementations read from
// KMS; dev implementations can read from env (see EnvSecretStore).
type SecretStore interface {
	// FetchUtila returns the service-account PEM for a Utila org. The PEM
	// is used to authenticate against Utila's gRPC surface.
	FetchUtila(ctx context.Context, intent *UtilaIntent) (string, error)
	// FetchFireblocks returns the secret PEM for a Fireblocks tenant.
	// Fireblocks uses the PEM for RS256 JWT signing.
	FetchFireblocks(ctx context.Context, intent *FireblocksIntent) (string, error)
}

// ErrSecretNotConfigured is returned by SecretStore implementations when
// the public identifier doesn't have a corresponding secret available.
// Dispatchers translate this to a StatusFailed result with a clear reason.
var ErrSecretNotConfigured = errors.New("cosigners: secret not configured for this tenant identifier")

// FamilyDispatcher runs a single cosigner family. The default dispatcher
// (NewDefault) composes one of these per Kind. Useful for swapping in a
// mock per family during tests, or shipping Fireblocks without Utila.
type FamilyDispatcher interface {
	// RunUtila is called per Utila intent. Implementations should respect
	// ctx cancellation and return StatusFailed on transport / config error.
	RunUtila(ctx context.Context, intent *UtilaIntent, secret string, opts DispatchOptions) Result
	// RunFireblocks is called per Fireblocks intent.
	RunFireblocks(ctx context.Context, intent *FireblocksIntent, secret string, opts DispatchOptions) Result
}

// DefaultDispatcher composes a SecretStore + FamilyDispatcher into a full
// Dispatcher. Construct with NewDefault. Concurrency-safe.
type DefaultDispatcher struct {
	Secrets  SecretStore
	Families FamilyDispatcher
}

// NewDefault returns a DefaultDispatcher wired to the supplied stores.
// Either argument may be nil — a nil SecretStore means every cosigner
// fails with "secret not configured"; a nil FamilyDispatcher means every
// cosigner fails with "family not implemented". This is the deliberate
// default: silent acceptance is dangerous (the regression we're closing),
// so a partially-configured bridge surfaces loud failures instead.
func NewDefault(secrets SecretStore, families FamilyDispatcher) *DefaultDispatcher {
	return &DefaultDispatcher{Secrets: secrets, Families: families}
}

// Dispatch runs every intent in parallel and returns the results. The
// result slice is in the same order as opts.Cosigners. Errors from
// individual cosigners are surfaced as Result{Status:Failed,Reason:...}
// rather than as a returned error; the only returned error case is a
// dispatcher-level misconfiguration (caller passed an empty SwapID etc).
func (d *DefaultDispatcher) Dispatch(ctx context.Context, opts DispatchOptions) ([]Result, error) {
	if opts.SwapID == "" {
		return nil, errors.New("cosigners: DispatchOptions.SwapID required")
	}
	if len(opts.Cosigners) == 0 {
		return nil, nil
	}
	results := make([]Result, len(opts.Cosigners))
	var wg sync.WaitGroup
	for i, intent := range opts.Cosigners {
		i, intent := i, intent
		wg.Add(1)
		go func() {
			defer wg.Done()
			results[i] = d.runOne(ctx, intent, opts)
		}()
	}
	wg.Wait()
	return results, nil
}

func (d *DefaultDispatcher) runOne(ctx context.Context, intent Intent, opts DispatchOptions) Result {
	switch intent.Kind {
	case KindUtila:
		if intent.Utila == nil {
			return Result{Intent: intent, Status: StatusFailed, Reason: "utila intent missing payload"}
		}
		if d.Secrets == nil {
			return Result{Intent: intent, Status: StatusFailed, Reason: "secret store not configured"}
		}
		if d.Families == nil {
			return Result{Intent: intent, Status: StatusFailed, Reason: "utila family dispatcher not configured"}
		}
		secret, err := d.Secrets.FetchUtila(ctx, intent.Utila)
		if err != nil {
			return Result{Intent: intent, Status: StatusFailed, Reason: fmt.Sprintf("fetch secret: %v", err)}
		}
		return d.Families.RunUtila(ctx, intent.Utila, secret, opts)
	case KindFireblocks:
		if intent.Fireblocks == nil {
			return Result{Intent: intent, Status: StatusFailed, Reason: "fireblocks intent missing payload"}
		}
		if d.Secrets == nil {
			return Result{Intent: intent, Status: StatusFailed, Reason: "secret store not configured"}
		}
		if d.Families == nil {
			return Result{Intent: intent, Status: StatusFailed, Reason: "fireblocks family dispatcher not configured"}
		}
		secret, err := d.Secrets.FetchFireblocks(ctx, intent.Fireblocks)
		if err != nil {
			return Result{Intent: intent, Status: StatusFailed, Reason: fmt.Sprintf("fetch secret: %v", err)}
		}
		return d.Families.RunFireblocks(ctx, intent.Fireblocks, secret, opts)
	default:
		return Result{Intent: intent, Status: StatusFailed, Reason: fmt.Sprintf("unknown cosigner kind %q", intent.Kind)}
	}
}

// AllApproved reports whether every result is StatusApproved. The swap
// state machine uses this to gate the broadcasting transition: any
// non-approved result blocks the swap. Empty input → true (no cosigners
// means no gate).
func AllApproved(results []Result) bool {
	for _, r := range results {
		if r.Status != StatusApproved {
			return false
		}
	}
	return true
}

// FirstNonApproved returns the first result that isn't approved, or nil
// if all are. Useful for surfacing the failure reason on the swap row.
func FirstNonApproved(results []Result) *Result {
	for i := range results {
		if results[i].Status != StatusApproved {
			return &results[i]
		}
	}
	return nil
}
