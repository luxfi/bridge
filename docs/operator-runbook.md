# cmd/bridge — Operator Runbook

Operating the unified Lux Bridge binary (`cmd/bridge`). One image,
one port, embedded SPA + native `/v1/bridge/*` API + background drivers
(deposit watcher, MPC signing, broadcast).

This binary replaces the legacy `bridge-server` (Express + Prisma) and
`bridge-ui` (separate Vite SPA) deployment split.

---

## 1. Overview

| Aspect          | Value                                              |
|-----------------|----------------------------------------------------|
| Binary          | `cmd/bridge`                                       |
| Image           | `ghcr.io/luxfi/bridge:<tag>`                       |
| Listen port     | `:8080` (HTTP)                                     |
| Health endpoint | `GET /health` (200 JSON)                           |
| Config file     | `/etc/bridge/networks.yaml`                        |
| Data directory  | `/var/lib/lux-bridge` (zapdb / Lux Badger v4)      |
| Logger          | `luxfi/log` (JSON, one line per event)             |
| HTTP framework  | `hanzoai/zip` on Fiber v3 / fasthttp                |
| Swap store      | `luxfi/zapdb` (embedded KV, exclusive dir lock)    |

Routes:

```
/                          embedded SPA + SPA-routing fallback
/envs.js                   runtime config (window.ENV)
/icon.svg, /logo.svg       per-host brand assets (disk override possible)
/health                    service health + driver stats
/v1/bridge/networks        supported chains (from networks.yaml)
/v1/bridge/tokens          tokens per chain
/v1/bridge/quote           price quote
/v1/bridge/limits          per-token min/max swap caps
/v1/bridge/swaps           create / list swaps
/v1/bridge/swaps/:id       fetch / update swap
/v1/bridge/check-deposit   ops diagnostic (poll source-chain RPC)
/metrics                   Prometheus exposition
```

Background drivers (all on by default, all toggleable):

| Driver             | Reads from              | Writes to                  | Default cadence |
|--------------------|-------------------------|----------------------------|-----------------|
| DepositWatcher     | source-chain RPC        | `swap.State` advancement   | 15s             |
| SigningDriver      | MPC daemon              | `swap.DestRawTx`           | 5s              |
| BroadcastDriver    | dest-chain RPC          | `swap.State = completed`   | 5s              |

---

## 2. Build & ship

### Local build (smoke test)

```bash
go build -o /tmp/lux-bridge ./cmd/bridge
/tmp/lux-bridge --config cmd/bridge/networks.example.yaml --addr :8080
curl -sS localhost:8080/health | jq .
```

### Docker image

The canonical Dockerfile is `cmd/bridge/Dockerfile`. Three stages:

1. **ui-build** — `node:20-alpine`, `pnpm install` + `pnpm -C app/bridge build`
2. **go-build** — `golang:1.26.4-alpine`, compiles `cmd/bridge` with embedded SPA
3. **runtime** — `gcr.io/distroless/static-debian12:nonroot`, ~25 MB

Build from the repo root (build context must include the pnpm workspace):

```bash
docker build \
  -f cmd/bridge/Dockerfile \
  --build-arg VERSION=$(git rev-parse --short HEAD) \
  -t ghcr.io/luxfi/bridge:$(git rev-parse --short HEAD) \
  -t ghcr.io/luxfi/bridge:latest \
  .
```

Push:

```bash
docker push ghcr.io/luxfi/bridge:$(git rev-parse --short HEAD)
docker push ghcr.io/luxfi/bridge:latest
```

---

## 3. Deploy to k8s

Manifest: `k8s/bridge-deployment.yaml`. Apply after the MPC StatefulSet
from `k8s/mpc-deployment.yaml` is healthy (the bridge talks to
`mpc-api-svc.lux-bridge.svc:8081`).

```bash
kubectl apply -f k8s/bridge-deployment.yaml
kubectl -n lux-bridge rollout status deployment/lux-bridge
```

The manifest creates: `ConfigMap/lux-bridge-config`, `Deployment/lux-bridge`,
`Service/lux-bridge`, `Ingress/lux-bridge`, `HorizontalPodAutoscaler/lux-bridge`,
`PodDisruptionBudget/lux-bridge`.

### Required pre-existing resources

| Resource                       | Created by                            |
|--------------------------------|---------------------------------------|
| `Namespace/lux-bridge`         | `k8s/mpc-deployment.yaml`             |
| `Secret/bridge-secrets`        | KMS sync (see mpc-deployment header)  |
| `Service/mpc-api-svc`          | `k8s/mpc-deployment.yaml`             |
| TLS cluster issuer             | cert-manager install                  |

### Rollout

```bash
# Pin a specific tag (do not run on :latest in prod)
kubectl -n lux-bridge set image deployment/lux-bridge \
  bridge=ghcr.io/luxfi/bridge:<git-sha>

# Watch the rollout
kubectl -n lux-bridge rollout status deployment/lux-bridge --watch
```

### Rollback

```bash
kubectl -n lux-bridge rollout undo deployment/lux-bridge
kubectl -n lux-bridge rollout history deployment/lux-bridge
```

The deployment uses `RollingUpdate` with `maxUnavailable: 0` — a bad image
will not take down traffic; old pods stay up until new pods become Ready.

---

## 4. Configuration

All flags accept either a CLI argument **or** the matching env var.
Env vars are the standard way to configure inside the container.

### Required-ish

| Env / Flag                     | Default                          | Notes |
|--------------------------------|----------------------------------|-------|
| `BRIDGE_CONFIG` / `--config`   | `/etc/bridge/networks.yaml`      | Loaded from ConfigMap |
| `BRIDGE_ADDR` / `--addr`       | `:8080`                          | |
| `BRIDGE_DATA_DIR` / `--data-dir` | `""`                          | Empty = in-memory swap store (lossy on restart). Set to a writable path on a PV for durability — e.g. `/var/lib/lux-bridge`. |
| `BRIDGE_PROFILE` / `--profile` | `classical-compat`               | `strict-pq` for internal Lux↔Lux only |

### Backend wiring

| Env / Flag                            | Default | Behavior when empty |
|---------------------------------------|---------|---------------------|
| `BRIDGE_BACKEND_URL` / `--backend`    | `""`    | Reverse proxy to legacy Node backend disabled — all `/v1/bridge/*` use native handlers |
| `BRIDGE_BCHAIN_URL` / `--bchain-url`  | `""`    | BridgeVM native handlers disabled — swap/quote stays on the legacy proxy if `--backend` is also set |
| `BRIDGE_MPC_URL` / `--mpc-url`        | `""`    | MPC keygen disabled — swaps with `use_deposit_address=true` return 503 |
| `BRIDGE_MPC_TOKEN` / `--mpc-token`    | `""`    | Required for the live `mpcd` daemon — every endpoint except `/health` is bearer-protected |
| `BRIDGE_MPC_IDENTITY_FILE` / `--mpc-identity-file` | `""` | Convenience: derives the bearer token via SHA-256(seed‖"mpc-internal-api"). Use in dev; prod sets `BRIDGE_MPC_TOKEN` explicitly |
| `BRIDGE_MPC_ORG_ID` / `--mpc-org-id`  | `bridge`| Multi-tenant key the MPC daemon multiplexes by |

### Source RPC overrides

`BRIDGE_SOURCE_RPC_OVERRIDES` / `--source-rpc-overrides` overrides
specific source-chain RPCs at runtime when the package defaults
(`rpc.sepolia.org` etc.) are stale or rate-limited. Format:

```
NETWORK1=URL1,NETWORK2=URL2
```

Used by *both* the deposit watcher (source) and the broadcast driver
(destination) — many networks are both a source and a destination.

Example:

```
BRIDGE_SOURCE_RPC_OVERRIDES="ETHEREUM_SEPOLIA=https://ethereum-sepolia-rpc.publicnode.com,BITCOIN_TESTNET=https://mempool.space/testnet/api"
```

### Driver toggles + cadence

| Env / Flag                          | Default | Effect when set |
|-------------------------------------|---------|-----------------|
| `--disable-deposit-check`           | off     | `/v1/bridge/check-deposit` returns 404 |
| `--disable-deposit-watcher`         | off     | Swaps never advance from `user_deposit_pending` |
| `--disable-signing-driver`          | off     | Swaps stall in `bridge_transfer_pending` |
| `--disable-broadcast-driver`        | off     | Signed txs never broadcast |
| `--deposit-watcher-interval`        | 15s     | Polling cadence (source-chain RPC load) |
| `--signing-interval`                | 5s      | MPC signing polling cadence |
| `--broadcast-interval`              | 5s      | Broadcast polling cadence |
| `--broadcast-timeout`               | 15s     | Per-RPC broadcast call timeout |
| `--deposit-check-timeout`           | 10s     | Per-RPC source-poll timeout |
| `--bchain-timeout`                  | 10s     | Per-RPC b-chain call timeout |
| `--mpc-timeout`                     | 120s    | Per-MPC call timeout (matches mpc-wallet.ts) |

### Static assets

| Env / Flag                          | Default | Effect |
|-------------------------------------|---------|--------|
| `BRIDGE_STATIC_DIR` / `--static`    | `""`    | Override the embedded SPA from disk (dev only) |

---

## 5. Updating networks.yaml

The supported chains, tokens, limits, and brand are all driven from
`networks.yaml` — mounted from the `lux-bridge-config` ConfigMap.

```bash
# Edit the ConfigMap in place
kubectl -n lux-bridge edit configmap lux-bridge-config

# Restart pods to pick up the change (the binary reads the file once at boot)
kubectl -n lux-bridge rollout restart deployment/lux-bridge
```

Adding a network requires no code change and no DB migration. The
in-binary token registry (`internal/tokens`) covers detection +
calldata for known assets; `networks.yaml` controls what the SPA
and `/v1/bridge/networks` advertise.

---

## 6. Health, logs, metrics

### Health

```bash
kubectl -n lux-bridge port-forward svc/lux-bridge 8080:80 &
curl -sS localhost:8080/health | jq .
```

Sample response:

```json
{
  "status": "ok",
  "version": "<git-sha>",
  "backend_proxy": false,
  "bchain_rpc": true,
  "mpc_keygen": true,
  "deposit_check": true,
  "deposit_watcher": true,
  "signing_driver": true,
  "broadcast_driver": true,
  "profile": "BRIDGE_CLASSICAL_COMPAT_UNSAFE",
  "post_quantum_end_to_end": false,
  "watcher_stats": { "ticks": 12, "checks": 0, "advances": 0, "errors": 0 },
  "signing_stats": { "ticks": 12, "signs": 0, "errors": 0 },
  "broadcast_stats": { "ticks": 12, "attempts": 0, "successes": 0,
                       "failures": 0, "skipped_no_raw_tx": 0, "list_errors": 0 }
}
```

Use the driver stats blocks to spot misbehavior:

- `watcher.errors` rising → upstream source-chain RPC issues
- `broadcast.failures` rising → destination chain rejecting our txs
- `signing.errors` rising → MPC daemon misconfigured or down

### Logs

JSON one-line-per-event via `luxfi/log`. Stream:

```bash
kubectl -n lux-bridge logs -f deployment/lux-bridge | jq -c
```

Filter for errors:

```bash
kubectl -n lux-bridge logs deployment/lux-bridge --tail=1000 \
  | jq -c 'select(.level=="error")'
```

### Metrics

Prometheus exposition at `/metrics`. Add to your scrape config:

```yaml
- job_name: lux-bridge
  kubernetes_sd_configs:
    - role: pod
      namespaces: {names: [lux-bridge]}
  relabel_configs:
    - source_labels: [__meta_kubernetes_pod_label_app]
      regex: lux-bridge
      action: keep
```

---

## 7. Common operations

### Pause the pipeline (incident response)

Disable all background drivers without taking the API down:

```bash
kubectl -n lux-bridge set env deployment/lux-bridge \
  BRIDGE_DISABLE_DEPOSIT_WATCHER=true \
  BRIDGE_DISABLE_SIGNING_DRIVER=true \
  BRIDGE_DISABLE_BROADCAST_DRIVER=true
```

> Note: env-var names mirror the CLI flags. To reverse, drop the vars
> with `kubectl set env … BRIDGE_DISABLE_…-`.

### Drain before maintenance

```bash
kubectl -n lux-bridge scale deployment/lux-bridge --replicas=0
# do work
kubectl -n lux-bridge scale deployment/lux-bridge --replicas=2
```

The PodDisruptionBudget keeps at least 1 pod up during cluster drains.

### Force a config reload

```bash
kubectl -n lux-bridge rollout restart deployment/lux-bridge
```

### Override an upstream RPC at runtime

```bash
kubectl -n lux-bridge set env deployment/lux-bridge \
  BRIDGE_SOURCE_RPC_OVERRIDES="ETHEREUM_SEPOLIA=https://ethereum-sepolia-rpc.publicnode.com"
```

### Add a new token mapping

The binary's in-memory `tokens.DefaultRegistry()` covers the common
bridged assets. To add a new ERC-20 mapping that the deposit watcher +
tx assembler should recognize, edit `internal/tokens/tokens.go` and
ship a new image — there is no runtime token-registration endpoint yet.

`networks.yaml` Token entries control SPA listings and per-token caps
only; they do **not** wire detection or calldata. Detection +
calldata live in `internal/tokens`.

---

## 8. Troubleshooting

### Pod won't start: `bridge profile invalid`

`BRIDGE_PROFILE` must be `strict-pq` or `classical-compat`. Anything
else exits 1 (this is intentional — typo = wrong security posture).

### `mpc_keygen: false` in `/health`

`BRIDGE_MPC_URL` is unset or unreachable. Check:

```bash
kubectl -n lux-bridge get svc mpc-api-svc
kubectl -n lux-bridge get statefulset mpc-node
```

Without MPC keygen, swap creates with `use_deposit_address=true`
return 503.

### `signing_driver: false` despite MPC enabled

`mchainClient` is nil → `BRIDGE_MPC_URL` was empty at boot. Set it,
roll the deployment. If MPC is reachable but signing still errors,
check the bearer token (`BRIDGE_MPC_TOKEN`) and the org id
(`BRIDGE_MPC_ORG_ID`).

### Source-chain checks failing

Default RPCs (`rpc.sepolia.org`, etc.) get rate-limited. Override with
`BRIDGE_SOURCE_RPC_OVERRIDES`. Track `watcher_stats.errors` in
`/health` to confirm the fix.

### Watcher / signing / broadcast all running but no progress

Check the swap is actually in the right state. Use the swap CRUD:

```bash
curl -sS localhost:8080/v1/bridge/swaps/<id> | jq .state
```

State machine:

```
user_deposit_pending
   → bridge_transfer_pending           (watcher: deposit confirmed)
   → bridge_transfer_pending_signing   (signing: MPC asked)
   → bridge_transfer_pending_broadcast (signing: tx signed)
   → completed                          (broadcast: pushed onchain)
```

---

## 9. Persistence + backups

The swap store (`internal SwapStore` interface) has two implementations:

- **`InMemoryStore`** — used when `BRIDGE_DATA_DIR` is empty. Concurrency-safe,
  zero ops cost, but every restart drops in-flight swap state. Dev only.
- **`ZapStore`** — used when `BRIDGE_DATA_DIR` is set. Backed by `luxfi/zapdb`
  (Lux-flavored Badger v4). LSM-tree KV with WAL durability, atomic
  `db.Update` transactions, MVCC concurrency control. Takes an exclusive
  directory lock — only one bridge pod can hold the data dir at a time.

### Single-writer constraint

Because zapdb takes an exclusive dir lock, the k8s Deployment is pinned to:

```yaml
replicas: 1
strategy: {type: Recreate}
```

Two pods can't share `/var/lib/lux-bridge`. The Recreate strategy ensures
the old pod fully terminates (and releases the lock) before the new one
mounts the PVC. This costs zero-downtime rollouts — expect ~10s of API
gap during a deploy. The deposit watcher's 15s poll cadence absorbs this
without losing real progress.

Scaling beyond one pod requires migrating swap state to a shared external
store (Postgres, hanzoai/base SQLite served behind an API, etc.). Not on
the roadmap yet — single-replica covers the bridge's expected load.

### Disk layout

Inside `/var/lib/lux-bridge`:

```
000000.vlog        value log (immutable)
000001.vlog        ...
000002.vlog        currently being written
000003.sst         level-0 sorted string table
MANIFEST           the LSM tree's index
KEYREGISTRY        encryption-at-rest key registry (we don't use)
LOCK               the exclusive directory lock
```

Typical size: hundreds of bytes per swap. 1 GB holds millions of swaps.
The 20Gi PVC in the manifest is generous head-room.

### Backups

zapdb supports a streaming backup primitive. For first-deploy ops, a
filesystem snapshot of the PV (cloud snapshot, Velero, etc.) while the
pod is paused is sufficient.

Pause-snapshot-resume:

```bash
kubectl -n lux-bridge scale deployment/lux-bridge --replicas=0
# wait for pod termination, then snapshot the PV however your cloud does it
kubectl -n lux-bridge scale deployment/lux-bridge --replicas=1
```

In-flight signing/broadcast that was mid-RPC will rerun on restart —
the state machine is idempotent (the watcher re-detects the same
deposit; signing checks for an existing signature before re-asking
MPC; broadcast checks for the dest tx hash before re-sending).

### Drift recovery

If the LOCK file is stale (e.g. a node crash left the file behind),
the new pod's `NewZapStore()` will fail with `Cannot acquire dir
lock`. Inspect the data dir, confirm no other process holds it, then:

```bash
# inside the pod — preserves all data, just drops the lock file
rm /var/lib/lux-bridge/LOCK
```

Restart the pod after.

---

## 10. Known gaps

These are tracked separately and **not** operationally fixable:

- Non-EVM broadcasters (BTC, SOL, TON, XRP, DOT) return
  `ErrFamilyNotImplemented`. Add per-chain RPC clients to
  `internal/broadcast` to extend coverage.
- EIP-1559 gas pricing not implemented in `internal/txassembler`. EVM
  txs assemble with legacy (gasPrice) pricing. Most destination
  chains still accept legacy txs.
- Substrate SS58 address encoding not implemented.
- LP-333 BridgeVM client methods are stubbed — `--bchain-url` controls
  whether `bchain.Client` is constructed, but the handlers it backs
  are read-only.
- Single-writer swap store. Horizontal scale-out requires migrating to
  a shared external store.
