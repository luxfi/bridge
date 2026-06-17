# LUX Bridge — Go-Live Handoff

The single ordered entry point for taking the LUX bridge to mainnet. Detailed
steps live in the two deploy docs; this is the sequence, the decisions, and the
gates. Read it top to bottom before touching the cluster.

## Scope & decisions (locked)

- **Corridors:** LUX ↔ {ETH + EVM majors, BTC, Solana, TON, XRP}. All validated
  on-chain. **Zoo is a post-launch follow-up** — the chain IS live (200200/200201).
  The bridge image now carries the RPC-path fix (the `a335a9f6` bridge image
  includes `37e58814`), so the *image* no longer blocks Zoo; it stays out of this
  cutover only because the k8s ConfigMap omits ZOO_MAINNET and mainnet Zoo needs
  owner sign-off (young chain). See the post-launch item below.
- **Image:** deploy **bridge `ghcr.io/luxfi/bridge:a335a9f6`** + **`ghcr.io/luxfi/{mpc-router,mpcd-single}:de3a912a`**.
  The bridge image carries the **G8 source baseline gate** + SOL/TON/XRP refund
  caps (re-verified by `strings`), plus the static-price fix (XRP/AVAX/MATIC) and
  the Zoo path over `de3a912a`. mpc-router/mpcd-single are unchanged since
  `de3a912a` (no rebuild). Built from local `whispers/bridgev2-golive`; any
  rebuild MUST come from that branch, **never `origin/#393`** (G8-less).
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

### Phase 0 — Rehearse on testnet (DONE 2026-06-11 — `docs/rehearsal-phase0-findings.md`)
The corridors are validated, but the **productionized deploy stack** (k8s
manifests + staged ConfigMap + the `de3a912a` image + mpcd-single/mpc-router
wiring) had never run as a unit. It was rehearsed in an isolated
`lux-bridge-rehearsal` namespace (testnet config, throwaway seed, in-namespace
single-node ECDSA mpcd; live `lux-bridge` untouched) and **torn down**.
**Result:** the stack runs end-to-end — G8 image gate, ECDSA + ed25519 keygen
and sign through the router (`family=eddsa → mpcd-single`, `family=ecdsa →
mpc-api-svc`), the **G8 no-deposit gate held** (unfunded XRP→LUX stayed
`user_deposit_pending`), and swap state + key shares survived pod restarts.
**One go-live blocker found + fixed:** the k8s manifest ran the static price
feed only and it lacked XRP/AVAX/MATIC, so those corridors failed quote with
`price_unknown` — now `BRIDGE_COINGECKO=true` is set in the deployment and the
missing symbols were added to the static fallback. Two operator notes (mpcd
`MPC_PASSWORD` env; ConfigMap/Ingress are ns-/host-bound for a testnet rehearsal)
are in the findings doc. If you re-run before cutover, repeat the Phase 2 gate.

### Phase 1 — EVM + BTC live → `docs/operator-deploy-phase-1-4.md`
Push the `a335a9f6` image → `scripts/deploy-phase1.sh` (applies compute, skips
the bundled Ingress, smoke-tests, then swaps the shared `bridge-ingress`
backends to `lux-bridge` — **no new Secret, no DNS change**; the MPC token
`bridge-mpc-token` + `bridge-lux-tls` already exist on-cluster) → fund the
EVM/BTC release wallets. After this, **LUX ↔ EVM and LUX ↔ BTC are live** (real
threshold custody, zero new custody risk).

### Phase 2 — Solana / TON / XRP live → `docs/operator-deploy-ed25519.md`
Master-seed Secret → `kubectl apply -f k8s/mpcd-single-deployment.yaml` +
`k8s/mpc-router-deployment.yaml` → repoint `BRIDGE_MPC_URL` at
`http://mpc-router.lux-bridge.svc:9700` → **enable the ed25519 corridors in the
ConfigMap** (they ship DISABLED so a Phase-1/EVM-only deploy can't advertise
un-signable corridors; Step 6 flips SOL/TON/XRP `is{Deposit,Withdrawal}Enabled`
→ true) → **run the G8 no-deposit test before funding**
→ fund + **cap** the SOL/TON/XRP release wallets.

## Hard gates — do not skip

1. **G8 in the image:** `strings /usr/local/bin/bridge | grep -c sol_source_baseline_lamports` ≥ 1.
2. **Custody risk accepted in writing; ed25519 release balances capped.**
3. **Master seed generated, backed up, and provided via Secret/KMS** (not auto-created).
4. **G8 no-deposit test passes** — create a SOL swap, don't fund it, confirm it
   stays `user_deposit_pending` (never auto-confirms). Do this BEFORE real funds.
5. **Route `bridge.lux.network` to the unified Go bridge (`bridge-go`/`a335a9f6`)** —
   NOT the legacy `bridge-server`/`bridge-ui` Express stack (retire those post-soak).

## Verify (post-deploy)
`/healthz` green on mpc-router + mpcd-single; one real low-value swap **each
direction** per corridor (watch the router log show `family=eddsa → mpcd-single`
for Sol/TON/XRP and `family=ecdsa → mpc-api-svc` for EVM/BTC).

## Open items (post-launch, not blockers)

- **Branch reconciliation:** go-live work is on `whispers/bridgev2-golive`
  (pushed to origin; PR pending). Decide how it merges to `main` (it's orthogonal
  to launch — deploys run from the pushed images, not the branch).
- **Custody upgrade trigger:** decide when ed25519 moves off single-signer
  (e.g. volume threshold) → FROST or Fireblocks via `--eddsa-url`.
- **Monitoring:** alert on ed25519 release-wallet balances (drain + over-cap) and
  on `/metrics` (`bridge_bchain_reachable`, swap-stall counts).
- **Zoo (follow-up):** chain is live (mainnet 200200 / testnet 200201, matching
  the wiring) and the RPC-path fix (`37e58814`) **is now in the `a335a9f6` bridge
  image** — the image no longer blocks Zoo. To ship Zoo: (1) add ZOO_MAINNET
  network + ZOO token to the k8s ConfigMap (mirror `networks.mainnet.yaml`),
  (2) smoke ZOO_TESTNET↔LUX_TESTNET first. Mainnet Zoo is brand-new (~799 blocks)
  — owner sign-off before routing real value.

## References
`operator-deploy-phase-1-4.md` · `operator-deploy-ed25519.md` ·
`operator-runbook.md` · REQUIREMENTS §13.6–13.7 (cutover plan, G7/G8).
