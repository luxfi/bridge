# Operator Deploy — Enable the ed25519 corridors (Solana / TON / XRP)

Companion to [`operator-deploy-phase-1-4.md`](./operator-deploy-phase-1-4.md).
That doc gets the unified Go bridge live for **EVM + BTC** (the bridge talks
straight to the real `lux-mpc` ECDSA cluster). This doc adds the **ed25519**
corridors — Solana, TON, XRP — which need two extra services in front of the
signer:

```
                         ┌────────────────────────────────┐
   bridge  ──BRIDGE_MPC_URL──▶  mpc-router  :9700          │
                         │        │                        │
                         │  family=eddsa │ family=ecdsa    │
                         │        ▼               ▼        │
                         │  mpcd-single :9900   mpc-api-svc :8081
                         │  (Sol/TON/XRP        (real lux-mpc
                         │   ed25519)            ECDSA cluster — EVM/BTC)
                         └────────────────────────────────┘
```

`mpc-router` dispatches each keygen/sign by `wallet_id` family; `mpcd-single`
is the single-signer ed25519 backend. Both were productionized under
REQUIREMENTS §13.7 G7 (`cmd/mpc-router`, `cmd/mpcd-single`).

---

## ⚠️ Two hard gates before you start

These are not optional. Skipping either ships a live-exploitable bridge.

1. **The deployed bridge image MUST contain the G8 source baseline gate.**
   `mpcd-single` derives the per-swap deposit wallet and the long-lived
   release wallet to the **same** ed25519 address per family. Without the G8
   gate, `depositcheck` confirms SOL/TON swaps the user never funded and the
   bridge pays out the destination leg from standing release liquidity
   (observed live: 96 XRP over-refund, 0.268 LUX free-mint). The pushed
   go-live image `ghcr.io/luxfi/bridge:de3a912a` was built from local
   `whispers/bridgev2`, which **already contains the gate** (verified). Any
   rebuild MUST come from that branch — NOT from `origin/whispers/bridgev2`
   (#393), which was force-pushed to a G8-less baseline; the
   `whispers/g8-baseline-port` branch (`826fdcaf`) is the separate port that
   adds the gate onto the #393 shapes. **Verify before enabling any network:**

   ```bash
   # In the running bridge image, the Swap struct must carry the baseline fields.
   kubectl -n lux-bridge exec deploy/lux-bridge -- \
     sh -c 'strings /usr/local/bin/bridge | grep -c sol_source_baseline_lamports'
   # Expect: >= 1.  If 0, the image predates G8 — DO NOT enable ed25519.
   ```

2. **Custody is single-signer — accept it explicitly or stop.**
   `mpcd-single` holds **one** 32-byte master seed; every Sol/TON/XRP deposit
   and release key derives from it. Compromise of that seed compromises every
   ed25519 wallet. This is an HSM-backed-hot-wallet posture, **not** threshold
   custody. For a real launch, either (a) cap the ed25519 release-wallet
   balances to an acceptable loss and accept the risk in writing, or (b) wait
   for the cluster-FROST ed25519 epic (then point `--eddsa-url` at the
   threshold mpcd and retire `mpcd-single` — no bridge change). Do not enable
   high-value ed25519 corridors on single-signer custody by default.

**Also assumed:** Phase 1.4 is done (the EVM+BTC bridge is live in `lux-bridge`,
the `bridge-secrets` Secret and `mpc-api-svc` exist), and you can push images to
`ghcr.io/luxfi`.

---

## Step 1 — Build & push the images

**Already done for this release** — all three are built from the local G8
branch and pushed to `ghcr.io/luxfi` at tag **`de3a912a`** (bridge ships the
G8 baseline gate; verified). The manifests below pin that tag, so you can skip
straight to Step 2. Re-run the block only to cut a new build.

```bash
export TAG=de3a912a   # the pushed release; the manifests below pin this

# Bridge — MUST be built from a branch that includes the G8 gate (whispers/bridgev2).
docker build -f cmd/bridge/Dockerfile      -t ghcr.io/luxfi/bridge:$TAG .
# ed25519 backend + router (REQUIREMENTS §13.7 G7).
docker build -f cmd/mpcd-single/Dockerfile -t ghcr.io/luxfi/mpcd-single:$TAG .
docker build -f cmd/mpc-router/Dockerfile  -t ghcr.io/luxfi/mpc-router:$TAG .

docker push ghcr.io/luxfi/bridge:$TAG
docker push ghcr.io/luxfi/mpcd-single:$TAG
docker push ghcr.io/luxfi/mpc-router:$TAG
```

---

## Step 2 — Provision the master seed Secret

The seed is the root of all ed25519 custody. **Back it up before you deploy** —
losing it makes every derived deposit/release address unrecoverable, and every
already-funded release wallet is stranded.

Prefer a KMS-rooted seed for production (`--master-seed=kms:...`). The Secret
path below is the minimum; treat the Secret as you would a private key.

```bash
# Generate 32 random bytes, hex-encoded (64 chars).
SEED_HEX=$(openssl rand -hex 32)
echo "$SEED_HEX"   # <-- copy to your password manager / break-glass store NOW

kubectl -n lux-bridge create secret generic mpcd-single-secret \
  --from-literal=master.seed="$SEED_HEX"
```

> Rotating the seed re-derives **all** addresses. Only rotate with zero
> in-flight ed25519 swaps and after sweeping every funded release wallet.

---

## Step 3 — Deploy `mpcd-single`

Stateless given the seed (derivation is deterministic), so no PVC. `replicas: 1`
is fine; it can scale for HA since every replica with the same seed derives the
same keys.

```yaml
# Committed at k8s/mpcd-single-deployment.yaml — apply it directly (below). Shown for reference:
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mpcd-single
  namespace: lux-bridge
spec:
  replicas: 1
  selector:
    matchLabels: { app: mpcd-single }
  template:
    metadata:
      labels: { app: mpcd-single }
    spec:
      containers:
        - name: mpcd-single
          image: ghcr.io/luxfi/mpcd-single:de3a912a
          args:
            - --addr=:9900
            - --master-seed=file:/var/lib/mpcd-single/master.seed
            - --auto-create-seed=false   # prod: fail loudly if the seed is missing
          ports:
            - { containerPort: 9900, name: http }
          volumeMounts:
            - { name: seed, mountPath: /var/lib/mpcd-single, readOnly: true }
          livenessProbe:
            httpGet: { path: /healthz, port: http }
            initialDelaySeconds: 3
          readinessProbe:
            httpGet: { path: /healthz, port: http }
      volumes:
        - name: seed
          secret:
            secretName: mpcd-single-secret
            items:
              - { key: master.seed, path: master.seed }
---
apiVersion: v1
kind: Service
metadata:
  name: mpcd-single
  namespace: lux-bridge
spec:
  selector: { app: mpcd-single }
  ports:
    - { port: 9900, targetPort: 9900, name: http }
```

```bash
kubectl apply -f k8s/mpcd-single-deployment.yaml
kubectl -n lux-bridge rollout status deploy/mpcd-single
```

---

## Step 4 — Deploy `mpc-router`

Stateless proxy; `replicas: 2` for HA. It forwards to `mpcd-single` (ed25519,
no auth) and to the existing `mpc-api-svc` (ECDSA, authed with the same
`mpc-api-token` the bridge uses today). The router injects each backend's token
itself — the bridge's inbound token is ignored.

```yaml
# Committed at k8s/mpc-router-deployment.yaml — apply it directly (below). Shown for reference:
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mpc-router
  namespace: lux-bridge
spec:
  replicas: 2
  selector:
    matchLabels: { app: mpc-router }
  template:
    metadata:
      labels: { app: mpc-router }
    spec:
      containers:
        - name: mpc-router
          image: ghcr.io/luxfi/mpc-router:de3a912a
          args:
            - --addr=:9700
            - --eddsa-url=http://mpcd-single.lux-bridge.svc:9900
            - --ecdsa-url=http://mpc-api-svc.lux-bridge.svc:8081
            - --ecdsa-token=env:ECDSA_TOKEN     # secrets resolver reads $ECDSA_TOKEN
          env:
            - name: ECDSA_TOKEN
              valueFrom:
                secretKeyRef:
                  name: bridge-secrets
                  key: mpc-api-token
          ports:
            - { containerPort: 9700, name: http }
          livenessProbe:
            httpGet: { path: /healthz, port: http }
          readinessProbe:
            httpGet: { path: /healthz, port: http }
---
apiVersion: v1
kind: Service
metadata:
  name: mpc-router
  namespace: lux-bridge
spec:
  selector: { app: mpc-router }
  ports:
    - { port: 9700, targetPort: 9700, name: http }
```

```bash
kubectl apply -f k8s/mpc-router-deployment.yaml
kubectl -n lux-bridge rollout status deploy/mpc-router
```

---

## Step 5 — Repoint the bridge through the router

Two changes to the bridge Deployment: (a) send MPC traffic to the router
instead of straight to the cluster, and (b) give the signing driver the
ed25519 destination RPC endpoints (it needs a recent blockhash / seqno / ledger
to assemble Sol/TON/XRP release txs).

```bash
kubectl -n lux-bridge set env deploy/lux-bridge \
  BRIDGE_MPC_URL=http://mpc-router.lux-bridge.svc:9700 \
  BRIDGE_SOLANA_RPC_URL=https://solana-rpc.publicnode.com \
  BRIDGE_TON_RPC_MAINNET_URL=https://toncenter.com/api/v2 \
  BRIDGE_XRP_RPC_MAINNET_URL=https://xrplcluster.com
# If you run a split MPC pool, also set BRIDGE_MPC_PRIVATE_URL to the same
# router URL — the router dispatches both roles by family.
kubectl -n lux-bridge rollout status deploy/lux-bridge
```

> Use authenticated / paid RPC endpoints for production throughput (toncenter
> and the public Solana/XRPL endpoints are rate-limited). `BRIDGE_MPC_TOKEN`
> can stay as-is; the router ignores the inbound token and injects its own.

---

## Step 6 — Enable the networks in the ConfigMap

`SOLANA_MAINNET`, `TON_MAINNET`, and `XRP_MAINNET` are already present in
`lux-bridge-config` but were gated off (see the "disabled pending mpcd FROST"
comment). With the signer now able to produce ed25519 signatures, make sure
each network you intend to enable is present with its native asset, then roll:

```bash
kubectl -n lux-bridge edit configmap lux-bridge-config   # confirm SOL/TON/XRP networks + tokens
kubectl -n lux-bridge rollout restart deploy/lux-bridge  # the binary reads the file once at boot
```

Add only the corridors you are funding and watching. Each enabled network is a
new release wallet you are on the hook to keep funded (Step 8).

---

## Step 7 — Verify

**7a. Plumbing is up.**

```bash
kubectl -n lux-bridge exec deploy/mpc-router -- wget -qO- http://localhost:9700/healthz
# {"status":"ok","service":"mpc-router"}
kubectl -n lux-bridge logs deploy/mpc-router | grep -E 'eddsa|ecdsa'   # routing banner
```

**7b. The G8 gate actually fires (do this BEFORE any real funds).** Create a
SOL-source swap and DO NOT fund it. A correct deployment leaves it in
`user_deposit_pending`; a broken one (missing G8, or baseline not snapshotted)
auto-confirms and pays out.

```bash
# Create a SOL→LUX swap via the API, note its id, wait ~2 min, then:
kubectl -n lux-bridge exec deploy/lux-bridge -- \
  wget -qO- http://localhost:8080/v1/bridge/swaps/<id> | jq .status
# Expect: "user_deposit_pending"  (NOT "bridge_transfer_pending" / completed)
```

If that swap ever advances without a deposit, **disable the network
immediately** (Step rollback) — the baseline gate is not working and every
ed25519 corridor is exposed.

**7c. One real low-value swap each direction** (e.g. EVM→Sol and Sol→EVM) to
confirm keygen routing, signing, and broadcast end-to-end. Watch the router log
show `family=eddsa → mpcd-single` for the Sol legs and `family=ecdsa →
mpc-api-svc` for the EVM legs.

---

## Step 8 — Fund the ed25519 release wallets

Same as Phase 1.4 Step 6, but per ed25519 destination. After the first swap to
each network the bridge auto-mints a long-lived release wallet (persisted to
`BRIDGE_RELEASE_WALLETS_FILE`) and **does not auto-fund it**. Until funded with
native gas + liquidity, swaps to that destination stall in
`bridge_transfer_pending_broadcasting` with `last_error: "Insufficient funds in
release address"`.

```bash
# Find the release address per network from the persisted file:
kubectl -n lux-bridge exec deploy/lux-bridge -- \
  sh -c 'cat $BRIDGE_DATA_DIR/release-wallets.json' | jq .
# Fund each (SOL / TON / XRP) from the operator treasury. Keep balances capped
# to the loss you accepted in Gate 2.
```

---

## Rollback

The EVM+BTC path is independent — rolling back ed25519 does not touch it.

```bash
# 1. Stop offering the ed25519 corridors (remove SOL/TON/XRP from the ConfigMap, roll).
# 2. Point the bridge back at the real cluster directly:
kubectl -n lux-bridge set env deploy/lux-bridge \
  BRIDGE_MPC_URL=http://mpc-api-svc.lux-bridge.svc:8081
kubectl -n lux-bridge rollout status deploy/lux-bridge
# 3. (optional) scale the ed25519 services down:
kubectl -n lux-bridge scale deploy/mpc-router deploy/mpcd-single --replicas=0
```

In-flight ed25519 swaps should be drained or accepted-as-loss before rollback
(see `operator-runbook.md` §7 "Pause the pipeline" and the ed25519 signer
cutover notes).

---

## Sign-off checklist

- [ ] Gate 1: deployed bridge image contains the G8 baseline fields (Step 1 check).
- [ ] Gate 2: single-signer custody risk accepted in writing, release balances capped.
- [ ] Master seed generated, **backed up**, and provided via Secret/KMS (not auto-created).
- [ ] `mpcd-single` + `mpc-router` rolled out, `/healthz` green on both.
- [ ] Bridge repointed at `mpc-router:9700`; ed25519 destination RPCs set.
- [ ] **G8 no-deposit test passed** (unfunded SOL swap did NOT auto-confirm) — Step 7b.
- [ ] One real swap each direction settled on-chain — Step 7c.
- [ ] Each enabled network's release wallet funded.
- [ ] Rollback path tested (repoint to `mpc-api-svc`, EVM+BTC unaffected).

---

## References

- REQUIREMENTS §13.7 — G7 (router/mpcd-single productionization), G8 (baseline gate).
- `operator-deploy-phase-1-4.md` — the EVM+BTC deploy this builds on.
- `operator-runbook.md` §7 — ed25519 signer cutover + incident-response pause.
- `cmd/mpc-router/`, `cmd/mpcd-single/` — the binaries + their Dockerfiles.
- Custody epic (cluster-FROST ed25519) — the path off single-signer custody.
