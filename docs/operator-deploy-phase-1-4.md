# Phase 1.4 — Deploy the unified Go bridge to `bridge.lux.network`

This runbook is the operator-side handoff for closing REQUIREMENTS.md §7 row 1.4 + §13.6 step 5. The engineering work is done; everything below is cluster + DNS + secret material that has to live outside the repo.

## What gets deployed

A single Go binary image (`ghcr.io/luxfi/bridge:<tag>`) that embeds the SPA via `go:embed` and serves both:
- `/` — Lux Bridge SPA (canonical Vite build, baked into the image)
- `/v1/bridge/*` — native API (networks / tokens / quote / swaps / MPC dispatch)

Replaces the legacy split of `ghcr.io/luxfi/bridge-server` (Express) + `ghcr.io/luxfi/bridge-ui` (Vite). Same hostnames, same wire contract for the SPA picker — drop-in for downstream consumers.

K8s artifact: `k8s/bridge-deployment.yaml` (already in this repo).

## Prerequisites

| Requirement | How to verify |
|---|---|
| K8s cluster with `kubectl` access | `kubectl cluster-info` |
| Namespace `lux-bridge` exists | `kubectl get ns lux-bridge` (create with `kubectl apply -f k8s/mpc-deployment.yaml` first — it creates the namespace + the StatefulSet the bridge talks to) |
| `cert-manager` installed with `letsencrypt-prod` ClusterIssuer | `kubectl get clusterissuer letsencrypt-prod` |
| Ingress controller with `ingressClassName: ingress` | `kubectl get ingressclass ingress` |
| Image `ghcr.io/luxfi/bridge:latest` exists | `docker manifest inspect ghcr.io/luxfi/bridge:latest` (CI `docker.yml` builds + pushes on tag) |
| DNS control for `bridge.lux.network` + `bridge-api.lux.network` | Confirm with the team that owns the Lux zone |

## Step 1 — Populate `bridge-secrets`

The Deployment references a `bridge-secrets` Secret in the `lux-bridge` namespace. Keys required for the bridge container:

| Key | Purpose | Source |
|---|---|---|
| `mpc-api-token` | Bearer token for `mpcd` `/keygen` + `/sign` endpoints (required) | Output of the mpcd token-derivation step in `mpc-deployment.yaml` |

Keys referenced by other manifests in `mpc-deployment.yaml` (create alongside even if not consumed by the bridge container itself, since the same Secret is shared with the MPC StatefulSet):

| Key | Purpose |
|---|---|
| `mpc-db-password` | Postgres password for mpcd's DB |
| `mpc-wallet-id` | MPC wallet tenant id |
| `database-url` | Full Postgres URL for mpcd |
| `fee-collector-address` | Where bridge fees flow |
| `postgres-password` | Root pw for the in-cluster postgres |

Create from a secrets file (never commit secrets to git):

```bash
kubectl create secret generic bridge-secrets \
  --namespace lux-bridge \
  --from-literal=mpc-api-token="$(cat /path/to/mpc-token)" \
  --from-literal=mpc-db-password="$(cat /path/to/mpc-db-pw)" \
  --from-literal=mpc-wallet-id="bridge-mainnet" \
  --from-literal=database-url="postgresql://...mpcd-db..." \
  --from-literal=fee-collector-address="0xYourFeeCollectorAddr" \
  --from-literal=postgres-password="$(cat /path/to/pg-pw)"
```

Verify:

```bash
kubectl -n lux-bridge get secret bridge-secrets -o jsonpath='{.data}' | jq 'keys'
# Expect: ["database-url","fee-collector-address","mpc-api-token","mpc-db-password","mpc-wallet-id","postgres-password"]
```

## Step 2 — Apply the manifest

```bash
kubectl apply -f k8s/bridge-deployment.yaml
```

This creates / updates:
- `ConfigMap/lux-bridge-config` — the `networks.yaml` baked into `/etc/bridge/networks.yaml`
- `PersistentVolumeClaim/lux-bridge-data` — 20Gi for zapdb (single-writer)
- `Deployment/lux-bridge` — `replicas: 1` with `strategy: Recreate` (zapdb takes an exclusive directory lock; multi-replica deploys require migrating the swap store to a shared external store first)
- `Service/lux-bridge` — ClusterIP, port 80 → 8080
- `Ingress/lux-bridge` — terminates TLS at `bridge.lux.network` + `bridge-api.lux.network`, routes both to the Service

Watch the rollout:

```bash
kubectl -n lux-bridge rollout status deployment/lux-bridge
kubectl -n lux-bridge logs -f deployment/lux-bridge
```

Expected log lines on a healthy startup:
- `swap store opened` (with `data_dir=/var/lib/lux-bridge`)
- `deposit watcher started`
- `signing driver started`
- `MPC keygen client ready`
- `listening on :8080`

Failure modes:
- `mpc keygen unreachable` → `bridge-secrets.mpc-api-token` wrong, or the `mpc-api-svc.lux-bridge.svc:8081` service isn't routable from the bridge pod. Check `kubectl -n lux-bridge get svc mpc-api-svc`.
- `swap store open: zapdb: cannot lock` → PVC stuck on an old pod's lock. `kubectl -n lux-bridge delete pod -l app=lux-bridge` and let `Recreate` strategy spin a fresh pod once the PV releases.
- Image pull error → CI hasn't pushed `:latest` yet, or the cluster's `ghcr.io` pull secret is missing. Switch to a known-good tag explicitly: `kubectl -n lux-bridge set image deployment/lux-bridge bridge=ghcr.io/luxfi/bridge:v1.2.3`.

## Step 3 — Verify ingress + TLS

```bash
kubectl -n lux-bridge get ingress lux-bridge
kubectl -n lux-bridge describe certificate lux-bridge-tls
```

Wait for `cert-manager.io/cluster-issuer: letsencrypt-prod` to issue the cert. Status should reach `Ready: True`. If issuance is slow:

```bash
kubectl -n lux-bridge describe order
kubectl -n lux-bridge describe challenge
```

Common cause: DNS A-record not pointing at the LB yet (Step 4) and Let's Encrypt's HTTP-01 challenge fails the reachability check.

## Step 4 — DNS cutover

Repoint both hostnames at the cluster's ingress LB IP:

```
bridge.lux.network        A <LB_IP>
bridge-api.lux.network    A <LB_IP>
```

If the existing `bridge.lux.network` already points at the legacy `bridge-server` + `bridge-ui` stack, this is the cutover moment — clients will start hitting the Go binary as soon as DNS propagates (TTL-dependent). Pre-stage by lowering the TTL on the old record 24h in advance.

For a cautious cutover, leave the legacy `bridge-server` and `bridge-ui` deployments running alongside for ~1 week of soak. After confirming the Go binary handles real traffic without regressions, delete the legacy Deployments + Services + Ingress and the legacy `ghcr.io/luxfi/bridge-ui` + `ghcr.io/luxfi/bridge/server` images.

## Step 5 — Post-deploy verification

| Check | Command |
|---|---|
| Health | `curl -s https://bridge-api.lux.network/health \| jq .status` → `"ok"` |
| Networks served | `curl -s https://bridge-api.lux.network/v1/bridge/networks \| jq '.data \| length'` → should match the ConfigMap |
| Tokens served | `curl -s 'https://bridge-api.lux.network/v1/bridge/tokens?network=ETHEREUM_MAINNET' \| jq` → ETH + USDC + USDT entries |
| Quote works | `curl -s 'https://bridge-api.lux.network/v1/bridge/quote?source_network=ETHEREUM_MAINNET&source_token=USDC&destination_network=LUX_MAINNET&destination_token=LUX&amount=10&refuel=0' \| jq .data.quote.receive_amount` → a positive number |
| SPA renders | Open `https://bridge.lux.network/` in a browser — `LUX Bridge` chip, chain picker populated |
| Swap creation reaches MPC | `curl -X POST -H 'Content-Type: application/json' -d '{...}' https://bridge-api.lux.network/v1/bridge/swaps` → returns a `deposit_address` derived from a freshly-minted MPC wallet |

## Step 6 — Release wallet funding (ongoing, per destination network)

After the first swap targeting each destination network, the bridge auto-mints a long-lived MPC release wallet and persists it to `/var/lib/lux-bridge/release-wallets.json`. **The bridge does not auto-fund these.** Until each is hand-funded with native gas of its destination chain, swaps to that destination will stall in `bridge_transfer_pending_broadcasting` with `last_error: "Insufficient funds in release address"`.

Discover the wallets after first activity:

```bash
kubectl -n lux-bridge exec deployment/lux-bridge -- cat /var/lib/lux-bridge/release-wallets.json | jq
```

Fund each address with ~0.5 native units per chain (enough for many swaps' gas + a few payouts). Top up via the operator treasury when balances fall below an alerting threshold. There is no auto-refill today.

## Rollback

If the Go binary deploy regresses production:

1. Revert DNS to point `bridge.lux.network` + `bridge-api.lux.network` at the legacy LB (if `bridge-server` + `bridge-ui` are still running, this restores them immediately).
2. If the legacy stack was already retired, scale the Go bridge to zero and bring it back manually: `kubectl -n lux-bridge scale deployment/lux-bridge --replicas=0`.
3. The PVC retains all in-flight swap state — re-scaling to 1 picks up where the binary left off.

## Sign-off checklist (for closing REQUIREMENTS.md §7 row 1.4)

- [ ] Secret `bridge-secrets` populated with `mpc-api-token`
- [ ] `kubectl apply -f k8s/bridge-deployment.yaml` succeeded
- [ ] Pod `lux-bridge-*` is `Ready`
- [ ] `Certificate/lux-bridge-tls` is `Ready: True`
- [ ] DNS A-records cut over (`dig bridge.lux.network`)
- [ ] `/health` returns 200 over public HTTPS
- [ ] A real testnet bridge transaction (source-chain deposit → MPC sign → destination payout) completes against the deployed pod
- [ ] Release wallets discovered + funded for all initially-supported destination networks
- [ ] Update REQUIREMENTS.md §7 row 1.4: 🟡 → ✅ with the testnet tx hash + MPC session id as evidence; §13.6 step 5: ⬜ → ✅

That last commit also closes Phase 1.3 if the same tx satisfies the §7 acceptance criteria.
