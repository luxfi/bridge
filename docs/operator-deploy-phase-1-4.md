# Phase 1 — Deploy the unified Go bridge to `bridge.lux.network` (EVM + BTC)

This runbook is the operator-side handoff for closing REQUIREMENTS.md §7 row 1.4 +
§13.6 step 5. The engineering work is done. **It is tailored to the live cluster
topology** (verified 2026-06-17), which is *not* greenfield — the hosts already
serve through a shared ingress, and the MPC token already exists. The result:
**Phase 1 needs no new Secret and no DNS change** — just the pushed image and an
in-place ingress backend swap.

> **Automated path:** `scripts/deploy-phase1.sh` runs Steps 2–5 (apply → smoke →
> cutover → verify) with a confirmation prompt before touching live traffic, and
> carries the one-command rollback. The manual steps below mirror it exactly.

> **Scope:** EVM + BTC only, on the real ECDSA threshold cluster
> (`mpc-api-svc:8081`). SOL/TON/XRP are **Phase 2** (`docs/operator-deploy-ed25519.md`)
> and ship **disabled** in the ConfigMap until then — see `docs/GO-LIVE.md`.

## What gets deployed

A single Go binary image (`ghcr.io/luxfi/bridge:a335a9f6`) that embeds the SPA via
`go:embed` and serves both:
- `/` — Lux Bridge SPA (canonical Vite build, baked into the image)
- `/v1/bridge/*` — native API (networks / tokens / quote / swaps / MPC dispatch)

It replaces the legacy split of `ghcr.io/luxfi/bridge-server` (Express) +
`ghcr.io/luxfi/bridge-ui` (Vite) on the same hostnames — drop-in for downstream
consumers. The new compute is a `Deployment/lux-bridge` + `Service/lux-bridge`;
cutover repoints the existing shared **`bridge-ingress`** at it.

K8s artifact: `k8s/bridge-deployment.yaml`. **Note:** that file also contains a
standalone `Ingress/lux-bridge` for a greenfield cluster — we do **not** apply it
here (it would collide with `bridge-ingress` on the same hosts). The deploy script
strips it; if applying by hand, see Step 2.

## Cluster topology (verified 2026-06-17 — what's already in place)

| Thing | State | Consequence for Phase 1 |
|---|---|---|
| Namespace `lux-bridge` | exists (112d) | no create |
| Hosts `bridge.lux.network` + `bridge-api.lux.network` | served by shared `bridge-ingress` (LB `24.199.69.68`), currently → `bridge-ui:80` and `bridge-server:3000` | cutover = backend swap, **no DNS change** |
| TLS `bridge-lux-tls` | covers both hosts in the `bridge-ingress` `tls:` block | a backend swap doesn't touch it → **HTTPS stays valid, no cert reissue** |
| MPC token | Secret `bridge-mpc-token` key `MPC_API_TOKEN` (present; legacy server uses it) | **no new Secret** — the manifest's `BRIDGE_MPC_TOKEN` reads it |
| ECDSA backend | `mpc-api-svc:8081` (5 mpc-node keys) live | EVM/BTC signing ready |
| `cert-manager` `letsencrypt-prod` | Ready | n/a (no new cert) |
| Legacy `bridge-ui` + `bridge-server` | running | leave for soak; rollback target |

## Prerequisites

| Requirement | How to verify |
|---|---|
| `kubectl` access to context `do-sfo3-lux-k8s` | `kubectl config current-context` |
| Go-live image pushed | `docker manifest inspect ghcr.io/luxfi/bridge:a335a9f6` (G8-gated build pinned in `k8s/bridge-deployment.yaml`; do NOT deploy `:latest`) |
| MPC token present | `kubectl -n lux-bridge get secret bridge-mpc-token` |
| Shared ingress + backend present | `kubectl -n lux-bridge get ingress bridge-ingress svc mpc-api-svc` |

No DNS work and no new Secret are required for Phase 1.

## Step 1 — Confirm the MPC token (no new Secret)

The bridge container's only secret dependency is the MPC API token, which already
exists on-cluster as `bridge-mpc-token/MPC_API_TOKEN` (shared with the legacy
`bridge-server`). The manifest's `BRIDGE_MPC_TOKEN` `secretKeyRef` is pinned to it.

```bash
kubectl -n lux-bridge get secret bridge-mpc-token -o jsonpath='{.data}' | jq 'keys'
# Expect: ["MPC_API_TOKEN"]
```

(If you prefer the generic `bridge-secrets/mpc-api-token` layout instead, add that
key and repoint the two `secretKeyRef` lines in `k8s/bridge-deployment.yaml`.)

## Step 2 — Deploy compute (ConfigMap + PVC + Deployment + Service; NOT the Ingress)

Automated:

```bash
./scripts/deploy-phase1.sh        # Steps 2–5, prompts before cutover
```

Manual equivalent — apply every doc in the manifest **except** the colliding
`Ingress`:

```bash
python3 - k8s/bridge-deployment.yaml <<'PY' | kubectl apply -f -
import sys, yaml
docs = [d for d in yaml.safe_load_all(open(sys.argv[1])) if d and d.get("kind") != "Ingress"]
yaml.safe_dump_all(docs, sys.stdout, sort_keys=False)
PY
kubectl -n lux-bridge rollout status deployment/lux-bridge
kubectl -n lux-bridge logs -f deployment/lux-bridge
```

This creates:
- `ConfigMap/lux-bridge-config` → `/etc/bridge/networks.yaml`
- `PersistentVolumeClaim/lux-bridge-data` — 20Gi for zapdb (single-writer)
- `Deployment/lux-bridge` — `replicas: 1`, `strategy: Recreate` (zapdb takes an exclusive dir lock; multi-replica needs an external swap store first)
- `Service/lux-bridge` — ClusterIP, port 80 → 8080

Expected healthy-startup log lines: `swap store opened` (`data_dir=/var/lib/lux-bridge`),
`deposit watcher started`, `signing driver started`, `MPC keygen client ready`,
`listening on :8080`.

Failure modes:
- `mpc keygen unreachable` → `bridge-mpc-token/MPC_API_TOKEN` wrong, or `mpc-api-svc.lux-bridge.svc:8081` not routable from the pod. `kubectl -n lux-bridge get svc mpc-api-svc`.
- `swap store open: zapdb: cannot lock` → PVC stuck on an old pod's lock. `kubectl -n lux-bridge delete pod -l app=lux-bridge` and let `Recreate` spin a fresh pod once the PV releases.
- `ImagePullBackOff` → image not pushed, or no ghcr pull creds. Legacy `luxfi/*` images pull with no explicit `imagePullSecrets`, so `a335a9f6` should too; if not, create + attach one:
  ```bash
  kubectl -n lux-bridge create secret docker-registry ghcr-pull \
    --docker-server=ghcr.io --docker-username=<gh-user> --docker-password=<gh-PAT>
  kubectl -n lux-bridge patch deploy lux-bridge \
    -p '{"spec":{"template":{"spec":{"imagePullSecrets":[{"name":"ghcr-pull"}]}}}}'
  ```

## Step 3 — Internal smoke test (before any live traffic)

Hit the new pod directly via port-forward — confirms it serves + reaches the ECDSA
backend before you touch the live ingress:

```bash
kubectl -n lux-bridge port-forward svc/lux-bridge 18080:80 &
curl -fsS http://127.0.0.1:18080/health                       # 200
curl -fsS http://127.0.0.1:18080/v1/bridge/networks | jq '.data | length'
curl -fsS 'http://127.0.0.1:18080/v1/bridge/quote?source_network=ETHEREUM_MAINNET&source_token=ETH&destination_network=LUX_MAINNET&destination_token=LUX&amount=1&refuel=0' \
  | jq .data.quote.receive_amount                             # positive number
```

## Step 4 — Cutover (ingress backend swap — no DNS change)

Repoint the two Lux hosts on the **existing** `bridge-ingress` from the legacy
backends to `lux-bridge`. TLS is untouched, so HTTPS stays valid through the swap.

```bash
# inspect current backends + confirm rule order first
kubectl -n lux-bridge get ingress bridge-ingress -o jsonpath='{range .spec.rules[*]}{.host}{" -> "}{.http.paths[0].backend.service.name}{":"}{.http.paths[0].backend.service.port.number}{"\n"}{end}'
# expect rule0 bridge.lux.network -> bridge-ui:80 ; rule1 bridge-api.lux.network -> bridge-server:3000

kubectl -n lux-bridge patch ingress bridge-ingress --type=json -p '[
 {"op":"replace","path":"/spec/rules/0/http/paths/0/backend/service/name","value":"lux-bridge"},
 {"op":"replace","path":"/spec/rules/0/http/paths/0/backend/service/port/number","value":80},
 {"op":"replace","path":"/spec/rules/1/http/paths/0/backend/service/name","value":"lux-bridge"},
 {"op":"replace","path":"/spec/rules/1/http/paths/0/backend/service/port/number","value":80}
]'
```

Leave the legacy `bridge-server` + `bridge-ui` running for ~1 week of soak. After
the Go binary handles real traffic without regressions, delete the legacy
Deployments + Services and their `ghcr.io/luxfi/bridge-ui` + `bridge-server` images.

## Step 5 — Post-deploy verification (over public HTTPS)

| Check | Command |
|---|---|
| Health | `curl -fsS https://bridge-api.lux.network/health` → 200 |
| Networks served | `curl -s https://bridge-api.lux.network/v1/bridge/networks \| jq '.data \| length'` → matches the ConfigMap |
| Tokens served | `curl -s 'https://bridge-api.lux.network/v1/bridge/tokens?network=ETHEREUM_MAINNET' \| jq` → ETH + USDC + USDT |
| Quote works | `curl -s 'https://bridge-api.lux.network/v1/bridge/quote?source_network=ETHEREUM_MAINNET&source_token=USDC&destination_network=LUX_MAINNET&destination_token=LUX&amount=10&refuel=0' \| jq .data.quote.receive_amount` → positive |
| SPA renders | open `https://bridge.lux.network/` — `LUX Bridge` chip, chain picker populated |
| Swap creation reaches MPC | `POST https://bridge-api.lux.network/v1/bridge/swaps` → returns a `deposit_address` from a freshly-minted MPC wallet |

## Step 6 — Release wallet funding (ongoing, per EVM/BTC destination)

After the first swap targeting each destination, the bridge auto-mints a long-lived
MPC release wallet and persists it to `/var/lib/lux-bridge/release-wallets.json`.
**The bridge does not auto-fund these.** Until each is hand-funded with native gas,
swaps to that destination stall in `bridge_transfer_pending_broadcasting` with
`last_error: "Insufficient funds in release address"`.

```bash
kubectl -n lux-bridge exec deployment/lux-bridge -- cat /var/lib/lux-bridge/release-wallets.json | jq
```

Fund each with ~0.5 native units per chain (gas + a few payouts) and top up from
the operator treasury below an alerting threshold. No auto-refill today.

## Rollback (instant — TLS unaffected)

Re-point the ingress backends at the legacy stack (which is still running):

```bash
kubectl -n lux-bridge patch ingress bridge-ingress --type=json -p '[
 {"op":"replace","path":"/spec/rules/0/http/paths/0/backend/service/name","value":"bridge-ui"},
 {"op":"replace","path":"/spec/rules/0/http/paths/0/backend/service/port/number","value":80},
 {"op":"replace","path":"/spec/rules/1/http/paths/0/backend/service/name","value":"bridge-server"},
 {"op":"replace","path":"/spec/rules/1/http/paths/0/backend/service/port/number","value":3000}
]'
```

The `lux-bridge` PVC retains all in-flight swap state, so a later re-cutover picks up
where it left off.

## Sign-off checklist (for closing REQUIREMENTS.md §7 row 1.4)

- [ ] Image `ghcr.io/luxfi/bridge:a335a9f6` pushed; `bridge-mpc-token` present
- [ ] Compute applied (ConfigMap + PVC + Deployment + Service); Ingress **not** applied
- [ ] Pod `lux-bridge-*` is `Ready`; startup log lines present
- [ ] Internal smoke (Step 3) passes via port-forward
- [ ] `bridge-ingress` backends swapped to `lux-bridge`
- [ ] `/health` returns 200 over public HTTPS; SPA renders
- [ ] A real bridge transaction (source deposit → MPC sign → destination payout) completes against the deployed pod
- [ ] EVM/BTC release wallets discovered + funded
- [ ] Update REQUIREMENTS.md §7 row 1.4: 🟡 → ✅ with the tx hash + MPC session id; §13.6 step 5: ⬜ → ✅

That last commit also closes Phase 1.3 if the same tx satisfies the §7 acceptance criteria.
