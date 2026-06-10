# LUX Bridge — Go-Live Handoff

The single ordered entry point for taking the LUX bridge to mainnet. Detailed
steps live in the two deploy docs; this is the sequence, the decisions, and the
gates. Read it top to bottom before touching the cluster.

## Scope & decisions (locked)

- **Corridors:** LUX ↔ {ETH + EVM majors, BTC, Solana, TON, XRP}. All validated
  on-chain. **Zoo is parked** — no Zoo chain exists yet; it's an additive
  follow-up, not a blocker (bridge side already wired).
- **Image:** deploy **`ghcr.io/luxfi/{bridge,mpc-router,mpcd-single}:de3a912a`**
  (built + pushed). The bridge image carries the **G8 source baseline gate** and
  the SOL/TON/XRP refund caps — verified. Built from local `whispers/bridgev2`;
  any rebuild MUST come from that branch, **never `origin/#393`** (G8-less).
- **Custody:** ed25519 (SOL/TON/XRP) runs on **mpcd-single — single-signer,
  capped release balances** (fast path). EVM/BTC use the real threshold cluster.
  Upgrade to FROST/Fireblocks later is a `--eddsa-url` flag-flip (no redeploy).

## Prerequisites (gather before you start)

- [ ] `kubectl` access to the `lux-bridge` namespace + a `ghcr.io` image pull secret.
- [ ] `bridge-secrets` values: `mpc-api-token`, `database-url`, `postgres-password`,
      `mpc-db-password`, `mpc-wallet-id`, `fee-collector-address` (see phase-1-4 Step 1).
- [ ] A **32-byte master seed** for mpcd-single (KMS-rooted preferred) + a backup plan.
- [ ] **Treasury funds** to seed each destination release wallet after first swap:
      native gas + liquidity on LUX, ETH, BTC, SOL, TON, XRP. Keep ed25519
      balances **capped** to the accepted single-signer loss ceiling.
- [ ] DNS control for `bridge.lux.network` + `bridge-api.lux.network`.
- [ ] Written sign-off accepting the single-signer custody risk (ed25519).

## Sequence

### Phase 0 — Rehearse on testnet (strongly recommended)
The corridors are validated, but the **productionized deploy stack** (k8s
manifests + staged ConfigMap + the `de3a912a` image + mpcd-single/mpc-router
wiring) has never run as a unit. Deploy it to testnet first (same manifests,
`networks.testnet.yaml`, a throwaway master seed), run the Phase 2 verification
gate + one swap each direction, then tear down. Cheap insurance.

### Phase 1 — EVM + BTC live → `docs/operator-deploy-phase-1-4.md`
Populate `bridge-secrets` → `kubectl apply -f k8s/bridge-deployment.yaml`
(pinned to `de3a912a`) → ingress/TLS → DNS cutover → fund the EVM/BTC release
wallets. After this, **LUX ↔ EVM and LUX ↔ BTC are live** (real threshold
custody, zero new custody risk).

### Phase 2 — Solana / TON / XRP live → `docs/operator-deploy-ed25519.md`
Master-seed Secret → `kubectl apply -f k8s/mpcd-single-deployment.yaml` +
`k8s/mpc-router-deployment.yaml` → repoint `BRIDGE_MPC_URL` at
`http://mpc-router.lux-bridge.svc:9700` → the ed25519 corridors are already
enabled in the staged ConfigMap → **run the G8 no-deposit test before funding**
→ fund + **cap** the SOL/TON/XRP release wallets.

## Hard gates — do not skip

1. **G8 in the image:** `strings /usr/local/bin/bridge | grep -c sol_source_baseline_lamports` ≥ 1.
2. **Custody risk accepted in writing; ed25519 release balances capped.**
3. **Master seed generated, backed up, and provided via Secret/KMS** (not auto-created).
4. **G8 no-deposit test passes** — create a SOL swap, don't fund it, confirm it
   stays `user_deposit_pending` (never auto-confirms). Do this BEFORE real funds.
5. **Route `bridge.lux.network` to the unified Go bridge (`bridge-go`/`de3a912a`)** —
   NOT the legacy `bridge-server`/`bridge-ui` Express stack (retire those post-soak).

## Verify (post-deploy)
`/healthz` green on mpc-router + mpcd-single; one real low-value swap **each
direction** per corridor (watch the router log show `family=eddsa → mpcd-single`
for Sol/TON/XRP and `family=ecdsa → mpc-api-svc` for EVM/BTC).

## Open items (post-launch, not blockers)

- **Branch reconciliation:** all go-live work is local on `whispers/bridgev2`;
  only the images are pushed. Decide how the git work reaches the team (push
  local→origin over #393, or keep deploying images out-of-band).
- **Custody upgrade trigger:** decide when ed25519 moves off single-signer
  (e.g. volume threshold) → FROST or Fireblocks via `--eddsa-url`.
- **Monitoring:** alert on ed25519 release-wallet balances (drain + over-cap) and
  on `/metrics` (`bridge_bchain_reachable`, swap-stall counts).
- **Zoo:** enable when the Zoo chain is actually deployed — confirm real chain
  IDs (bridge assumes 200200/200201; zoo-k8s only has `beluga` 420420), flip
  `ZOO_*` on, point `--zoo-rpc-*-url` at the live endpoint. No bridge code change.

## References
`operator-deploy-phase-1-4.md` · `operator-deploy-ed25519.md` ·
`operator-runbook.md` · REQUIREMENTS §13.6–13.7 (cutover plan, G7/G8).
