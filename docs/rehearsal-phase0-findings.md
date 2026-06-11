# Phase 0 Go-Live Rehearsal — Findings (2026-06-11)

The `docs/GO-LIVE.md` Phase 0 dress rehearsal: deploy the **productionized
stack as a unit** to an isolated namespace, run the verification gates, then
tear down. The corridors were already validated on-chain (R10–R12); what had
never run together was the *deploy* surface — the k8s manifests, the staged
ConfigMap, the `de3a912a` images, and the mpcd-single/mpc-router wiring.

It ran. Three integration gaps surfaced that the per-corridor smokes never hit
(because those bridges were hand-launched with flags the manifests omit). Two
are fixed in this commit; the rest are operator notes folded into the runbooks.

## Setup

- **Namespace:** `lux-bridge-rehearsal` (isolated; live `lux-bridge` untouched).
- **Config:** `cmd/bridge/networks.testnet.yaml` via a from-file ConfigMap.
- **Images (all pulled + booted):** `ghcr.io/luxfi/bridge:de3a912a`,
  `mpcd-single:de3a912a`, `mpc-router:de3a912a`, plus an in-namespace ECDSA
  `mpcd` (`ghcr.io/luxfi/mpc:bridge-sign-20260527`, single-node `--threshold 1`,
  PVC-backed, Service named `mpc-api-svc:8081` to mirror prod). The production
  cluster was deliberately **not** touched — its `mpc-identity-keys` Secret is
  absent (the live `bridge-server` has been crash-looping on that mount for
  18 days, unrelated to this work) and an unauthenticated keygen against shared
  infra isn't in scope for a rehearsal.
- **Custody:** throwaway 32-byte master seed for mpcd-single; rehearsal-only
  ECDSA token. Both discarded at teardown.

## What passed (the stack runs as a unit)

| Gate | Result |
|---|---|
| All manifests apply | ✅ after the fixes below |
| Images pull + boot | ✅ bridge, mpcd-single, mpc-router, mpcd |
| **G8 gate in image** | ✅ `strings … grep -c sol_source_baseline_lamports` = 1 on `de3a912a` |
| ECDSA keygen + sign (in-cluster) | ✅ 200 / 200; unauthenticated keygen → 401 |
| Bridge boots + serves | ✅ `/health`, `/v1/bridge/networks` (14), quote, swap-create |
| EVM swap-create → ECDSA keygen | ✅ `swap_349f5418aed50b94`, eth deposit wallet minted via the cluster |
| Router family dispatch | ✅ `family=eddsa → mpcd-single`, `family=ecdsa → mpc-api-svc` (logged, both directions) |
| ed25519 keygen via stack | ✅ XRP swap → valid r-address `rUJ4zzeu1a5KykNvDuFuHW2dXvG3FqnQQq` derived through bridge→router→mpcd-single |
| ed25519 sign via router | ✅ `result_type:success` for the XRP wallet |
| **G8 no-deposit gate** | ✅ XRP→LUX held `user_deposit_pending` 144s unfunded — shared-pool deposit==release wallet did **not** auto-confirm |
| PVC swap-state persistence | ✅ swap survived a bridge pod recreate (`Recreate` + zapdb lock) |
| Share persistence across mpcd restart | ✅ wallet keygen'd pre-restart still signed post-restart (unique msg) |
| mpcd-single determinism across restart | ✅ same `wallet_id` re-derived byte-identical key (`sol_address 5kK8gTDJ…`) from the seed Secret |

## Gaps found

### 1. Static price feed missing XRP/AVAX/MATIC + CoinGecko not enabled in k8s — **FIXED**
`cmd/bridge/main.go`'s static feed carried ETH/LUX/ZOO/BTC/SOL/TON/USDC/USDT/
DAI/BNB but **not** XRP, AVAX, or MATIC — all native assets of enabled
**mainnet** corridors. `k8s/bridge-deployment.yaml` never set
`BRIDGE_COINGECKO`, so the bridge ran static-only and **XRP/AVAX/Polygon-native
swaps failed at quote with `price_unknown`** (an XRP swap-create returned
`price_unknown` until CoinGecko was enabled). Every prior corridor smoke ran a
hand-launched bridge with `--coingecko`, so this stayed hidden until the real
manifest ran.
**Fix (this commit):** added XRP/AVAX/MATIC/POL to the static fallback **and**
set `BRIDGE_COINGECKO=true` in the deployment (live prices, static as outage
backstop). Production should also set `BRIDGE_COINGECKO_API_KEY` (free tier is
rate-limited) via `bridge-secrets`.

### 2. `mpcd` needs `MPC_PASSWORD`, not just `ZAPDB_PASSWORD` — **operator note**
The `bridge-sign`/v1.5.3 `mpcd` (0.4.0) fatally exits on boot with
`ZapDB password is required: … MPC_PASSWORD is not set` unless `MPC_PASSWORD`
is set; `ZAPDB_PASSWORD` alone (what `k8s/mpc-deployment.yaml` wires) is not
read by this build. Verify the live cluster image's expectation before any
`mpcd` roll — if it's the same 0.4.0 line, add `MPC_PASSWORD` to the StatefulSet
env (sourced from the same Secret key). Not changed here because the live
StatefulSet is healthy on its current image and this is the rehearsal image's
contract; flagged so a future `mpc` image bump doesn't surprise-crashloop.

### 3. ConfigMap + Ingress are namespace-/host-bound — **runbook note**
`k8s/bridge-deployment.yaml` bundles a `lux-bridge`-namespaced ConfigMap with a
**mainnet** `networks.yaml`, and an Ingress on `bridge.lux.network` /
`bridge-api.lux.network`. For an isolated testnet rehearsal you must (a) replace
the ConfigMap with `networks.testnet.yaml` and (b) **drop the Ingress** (its
hosts collide with the live `bridge-ingress`). The deploy runbooks now call this
out so a testnet rehearsal doesn't fight production DNS. A pull secret for
`ghcr.io` (`imagePullSecrets` on the namespace's `default` SA) is also required
in any namespace that isn't already set up for it.

## Non-findings (behaviors that look like bugs but aren't)

- **Re-signing an identical (wallet, message) pair → HTTP timeout.** mpcd dedups
  sign sessions by `txID = hash(message)`; a replay of the exact same message
  hits `ERROR_SESSION_DUPLICATE` and the duplicate path doesn't answer the HTTP
  inbox, so the caller sees a 60s timeout (the signature *was* reproduced in the
  node log). Irrelevant in production — every real swap signs a unique sighash
  (unique nonce/sequence). It only bit the rehearsal because the wire probe and
  the share-persistence probe reused the `deadbeef…` test vector. **Use a unique
  message per sign when probing.**

## R12 share-desync — partial coverage
R12 flagged a real 3-node ECDSA release wallet going unsignable (`sign HTTP 504`)
~9h after keygen. This rehearsal confirms the **persistence mechanism** is sound
(PVC-backed `/data` keeps wallets signable across a restart; the seed-rooted
mpcd-single is deterministic across restart). It does **not** reproduce the
multi-node *threshold-share desync* — the rehearsal mpcd was single-node
(`--threshold 1`), which has no peer shares to drift. The production verification
in `GO-LIVE.md` ("verify the cluster's share persistence so long-lived release
wallets stay signable across hours") still needs the real ≥3-node cluster; this
rehearsal closes only the disk-persistence half.

## Verdict
The productionized deploy stack runs end-to-end. The price-feed gap (#1) was a
genuine go-live blocker for the XRP/AVAX/Polygon corridors and is fixed. The
remaining items are operator runbook notes, not code defects. Phase 0 is
**complete**; the real cutover can proceed once the operator prerequisites
(secrets, KMS-rooted master seed, treasury funding, DNS, custody sign-off) are
in hand.

Artifacts: `docs/rehearsal-artifacts/` (resource inventory, router dispatch log,
bridge boot log, the two swap JSONs).
