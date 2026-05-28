# Integrations — Go-side operator guide

This document describes the Go-side daemon architecture of the Lux
bridge for **operators** running validator / watcher / signer nodes.
It is not an SDK reference. The only npm package consumers ever import
is **`@luxfi/bridge`** — see that package's README for client usage.

The Go side is what an operator deploys to physically observe source
chains, run the threshold-signature protocol, and submit relays to the
destination chain. The two binaries built by goreleaser are:

| Binary | Path | Role |
|:-------|:-----|:-----|
| `bridge` | `cmd/bridge` | API + frontend host; coordinates the watcher fleet and serves the relay queue. |
| `opnet-watcher` | `opnet-watcher/` | Per-chain indexer + threshold cosigner. One instance per source chain, federated across operators. |

---

## 1. Cross-chain MPC bridge model

The bridge connects **15+ heterogeneous chain families** —
EVM L1s, EVM L2 rollups, non-EVM L1s, Cosmos zones, UTXO chains, and
a small number of niche substrates — into a uniform deposit / relay /
mint pipeline.

Each source chain is observed by a per-chain plugin that emits a
single canonical event type:

```go
type DepositEvent struct {
    SrcChainID  uint64
    Nonce       uint64
    Recipient   [20]byte    // destination address on the relay chain
    Amount      *big.Int
    TxID        string      // source-chain tx identifier
    BlockHeight uint64
}
```

Operators never write chain-specific glue at the relay or signer
layer. A new chain only has to satisfy `ChainPlugin` (see
`opnet-watcher/plugins/plugin.go`):

```go
type ChainPlugin interface {
    Name() string
    ChainID() uint64
    PollDeposits(ctx context.Context, fromSlot uint64) ([]DepositEvent, uint64, error)
    QueryBacking(ctx context.Context) (*big.Int, error)
}
```

Everything downstream — proof-hash construction, signer participation,
relay submission, backing attestation — is chain-agnostic.

---

## 2. Threshold-signature scheme

The signer in `opnet-watcher/signer.go` is built on
`github.com/luxfi/crypto/threshold` and supports three production
schemes selected per destination context:

| Scheme | Curve | Use |
|:-------|:------|:----|
| **CGGMP21** (`SchemeCMP`) | secp256k1 | Threshold ECDSA for EVM-compatible destinations — the default relay path. |
| **FROST**  (`SchemeFROST`) | secp256k1 / ed25519 | Threshold Schnorr for Taproot and ed25519-native destinations. |
| **BLS**    (`SchemeBLS`)   | BLS12-381 | Threshold BLS for aggregated internal attestations. |

CGGMP21 is the canonical choice because it is **non-interactive at
signing time** after a one-time interactive keygen, and it produces
signatures that are bit-for-bit identical to any standard secp256k1
ECDSA signature — destination contracts verify with `ecrecover` and
do not need to know that a threshold scheme produced the signature.

Key shares are generated once via the keygen ceremony in
`pkg/threshold/` (TS-side ceremony coordinator) and distributed to
operator HSMs out of band. The Go-side daemon never sees a full
private key — only its share — and `t-of-n` participation is required
for every relay signature.

---

## 3. The `WebhookHandler` pattern

A small but load-bearing convention in the Lux ecosystem: any
provider / plugin that can receive **asynchronous callbacks** from an
external system (chain RPC push, custodian webhook, oracle feed)
implements the optional `WebhookHandler` capability rather than
embedding the callback path inside its primary interface.

The canonical shape (mirrored from `forex/pkg/provider/provider.go`):

```go
type WebhookHandler interface {
    ParseWebhook(eventType string, body []byte, headers http.Header) (*NormalizedEvent, error)
}
```

Rules:

- It is **optional** — providers/plugins that poll only do not
  implement it. Consumers do an interface assertion and skip.
- The handler returns a **normalised event** in the same shape the
  poll path emits. The downstream pipeline cannot tell whether an
  event arrived by polling or by webhook.
- All authentication / signature verification of the inbound webhook
  happens **inside** `ParseWebhook`, using `headers`. The caller does
  not pre-validate.

Adopt this pattern for any new chain plugin that gains a push API.
Do not invent a parallel callback interface.

---

## 4. Adding a new chain

1. Drop a new file in `opnet-watcher/plugins/<chain>.go` implementing
   `ChainPlugin`. Use one of the existing plugins as the closest
   structural reference for your chain family (EVM, Cosmos, UTXO,
   account-model non-EVM, rollup).
2. Add the chain ID to `cmd/bridge/networks.example.yaml`.
3. Register the plugin in `opnet-watcher/main.go` so it is wired into
   the watcher fleet at boot.
4. If the chain provides a push API, additionally implement
   `WebhookHandler` (§3) and register the route in `cmd/bridge/api.go`.
5. Write a `<chain>_test.go` that exercises `PollDeposits` against a
   recorded fixture — every existing plugin ships one; the test
   matrix in CI requires it.

No changes are required to the signer, relay, or destination
contract. The plugin contract is the only seam.

---

## 5. Public SDK boundary

`@luxfi/bridge` (the npm package in `pkg/bridge/`) is the **only**
surface a downstream application is ever expected to import. The Go
binaries here are operational infrastructure: an integrating
application does not run `bridge` or `opnet-watcher` in-process — it
talks to a federated relay network of operators who do.

If an integration question is about *what an app developer calls*, the
answer is in `pkg/bridge/README.md`. If it is about *what an operator
runs*, the answer is in this document.
