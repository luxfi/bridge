package mchain

// pool.go — layered MPC routing.
//
// REQUIREMENTS.md §6 + the SDK's BridgeMPCConfig declare two MPC URL
// slots:
//
//   publicUrl  — m-chain, public/permissionless validator MPC. Per-swap
//                deposit-wallet keygen + refund signing run here. Blast
//                radius on compromise is a single in-flight swap because
//                a fresh wallet is minted every time.
//
//   privateUrl — Lux treasury cluster, smaller internal quorum. Long-
//                lived release-wallet keygen + settlement signing run
//                here. These wallets hold operator-funded liquidity, so
//                they need both a smaller-quorum threshold (faster +
//                tighter access) and persistence so funds don't strand
//                across restarts.
//
// The role-based split lets a tenant point the layered cosigner stack
// at the right cluster for the right operation without the bridge
// embedding any "is this a treasury op?" decision in the call path.
//
// Back-compat: when only publicUrl is configured, NewPool sets Private
// to the same *Client. Every existing single-cluster deploy keeps
// working without flag changes; the split is purely additive.

// Pool routes MPC calls between the public (m-chain) and private
// (treasury) clusters. Both fields are non-nil after construction via
// NewPool / NewSplitPool — single-cluster deploys get Private == Public.
//
// Pool is concurrency-safe iff both Client values are (which they are —
// *Client docstring guarantees this).
type Pool struct {
	// Public handles per-swap deposit-wallet keygen + signing FROM the
	// deposit wallet (i.e. refund-leg signing). User-funded; ephemeral.
	Public *Client

	// Private handles release-wallet keygen + signing FROM the release
	// wallet (i.e. settlement-leg signing). Treasury-funded; long-lived.
	// In single-cluster deploys, Private == Public.
	Private *Client
}

// NewPool constructs a single-cluster pool. Both Public and Private
// point at the same *Client. Use this when only the legacy --mpc-url
// flag is set; the operator has not opted into a treasury cluster yet.
//
// Passing a nil Client returns nil — callers should treat the pool as
// "MPC disabled" the same way they treat a nil *Client today.
func NewPool(c *Client) *Pool {
	if c == nil {
		return nil
	}
	return &Pool{Public: c, Private: c}
}

// NewSplitPool constructs a two-cluster pool. When private is nil it
// falls back to single-cluster (Private == Public), matching NewPool.
// Passing a nil public returns nil — the public cluster is mandatory
// for any swap to proceed (deposit wallet keygen lives there).
func NewSplitPool(public, private *Client) *Pool {
	if public == nil {
		return nil
	}
	if private == nil {
		return &Pool{Public: public, Private: public}
	}
	return &Pool{Public: public, Private: private}
}

// IsSplit reports whether the pool has distinct public + private
// clients. False when single-cluster (Private == Public). Surfaced
// for startup logging + /health so operators can confirm their
// --mpc-private-url flag actually took effect.
func (p *Pool) IsSplit() bool {
	if p == nil {
		return false
	}
	return p.Public != p.Private
}
