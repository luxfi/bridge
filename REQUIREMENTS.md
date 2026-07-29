# Lux Bridge — Project Requirements

| Field | Value |
|---|---|
| Repository | `github.com/luxfi/bridge` |
| Owner | Lux Industries, Inc. |
| Author of doc | Jackson Mori |
| Date | 2026-06-04 |
| Status | Draft for review (R14 (2026-06-23 — **LUX bridge Phase 1 (EVM + BTC) CUT OVER TO PRODUCTION; `bridge.lux.network` is LIVE on the unified Go stack**) — the operator cutover that R11–R13 gated on is **done for the EVM + BTC corridors**. `bridge.lux.network` now serves the unified `cmd/bridge` container (`ghcr.io/luxfi/bridge:42e7b198`) on cluster `do-sfo3-lux-k8s` ns `lux-bridge` (deploy + svc `lux-bridge`, svc port 80 → container 8080; ONE container serves SPA + `/api/*` + `/v1/bridge/*` + `/health` + `/__ENV.js`). **Cutover = a single ingress patch:** the SHARED `bridge-ingress` rule[0] (`bridge.lux.network`) backend `bridge-ui:80` → `lux-bridge:80`; the other 5 hosts on that ingress were left byte-identical — `bridge-api.lux.network`→`bridge-server:3000` (legacy Node API still consumed by the 4 other brands' 117-day-old SPAs) and pars/hanzo/zoo.ngo/zoo.network→`bridge-ui:80`. **Blast radius = zero**, verified post-cutover: only `bridge.lux.network` serves version `42e7b198`; all 5 other hosts still legacy. **What made the single-host flip safe (new code this revision):** `cmd/bridge` now serves `/__ENV.js` templated from container env (`frontend.go::serveRuntimeENV` + `spaEnvKeys`, commit `42e7b198`; regression test `frontend_runtimeenv_test.go`), and the deployment sets `BRIDGE_API_HOST=https://bridge.lux.network` so the embedded SPA calls `/api/*` **same-origin** instead of the hardcoded shared `bridge-api.lux.network` fallback in `bridge.config.ts` — without this, flipping one UI host would have repointed ALL 5 brands' API traffic at the new Go backend. **Public verification (HTTPS, TLS valid):** `/health` = `42e7b198`, status ok, all drivers up (signing/broadcast/refund/deposit-watcher/mpc-keygen), 12 networks; `/__ENV.js` emits the pinned host; `/` serves the real SPA build (`/assets/index-CcAJQRUd.js`, loads `/__ENV.js` first); same-origin `/api/quote` ETH→LUX returned ~69 LUX off the live CoinGecko feed. Image re-verified to carry the **G8 source-baseline anti-theft gate** (`strings` → `sol/ton/xrp_source_baseline_*`). Custody for EVM/BTC = real 3-of-5 threshold MPC (`mpc-api-svc`) — **no new custody risk**. **Rollback** = patch `bridge-ingress` rule[0] back to `bridge-ui:80` (one command; full ingress YAML was backed up at cutover). Repo side committed + pushed to `whispers/bridgev2-golive`: `9546a523` (manifest image bump + `BRIDGE_API_HOST` + rebuilt binary) on top of `42e7b198` (the `/__ENV.js` source); commit SHA left un-amended so it keeps matching the image tag. **Still gated, NOT done:** Phase 2 ed25519 corridors (SOL/TON/XRP via `mpcd-single` + `mpc-router`, images `de3a912a`) remain undeployed pending owner **custody sign-off** (`docs/custody-signoff-ed25519.md`, hot/warm cap = worst-case loss ceiling), a KMS-rooted master seed, and treasury funding — they ship DISABLED by default. **Observation (pre-existing, NOT caused by the flip):** `bridge.hanzo.ai` + `bridge.zoo.network` root-404 on the legacy stack (their ingress rules were untouched) — a separate post-launch follow-up. New memory `project_lux_bridge_phase1_live.md`.) R13 (2026-06-11 Phase 0 go-live rehearsal DONE — `docs/rehearsal-phase0-findings.md`) — the **productionized deploy stack ran end-to-end as a unit** for the first time, in an isolated `lux-bridge-rehearsal` namespace (testnet config, throwaway master seed, in-namespace single-node ECDSA `mpcd` standing in for the real cluster; live `lux-bridge` untouched), then **torn down**. **Passed:** G8 image gate (`strings … sol_source_baseline_lamports`=1 on `de3a912a`); ECDSA + ed25519 **keygen and sign through `mpc-router`** with the family banner observed live (`keygen … family=eddsa → mpcd-single`, `sign … family=ecdsa → mpc-api-svc`); bridge boot + `/health` + 14 networks + quote; EVM swap-create minting a real MPC wallet (`swap_349f5418aed50b94`); ed25519 swap-create deriving a valid XRP r-address (`rUJ4zzeu1a5KykNvDuFuHW2dXvG3FqnQQq`) through bridge→router→mpcd-single; the **G8 no-deposit gate held** (unfunded XRP→LUX `swap_7e764e4875cf66ce` stayed `user_deposit_pending` 144s — the shared-pool deposit==release wallet did NOT auto-confirm); zapdb swap-state survived a bridge pod recreate; and **share/seed persistence across restart** (a pre-restart ECDSA wallet still signed post-restart; mpcd-single re-derived a byte-identical key from the seed Secret) — a partial close on the R12 share-persistence item (disk-persistence half only; the multi-node *threshold-share desync* needs the real ≥3-node cluster, since the rehearsal mpcd was `--threshold 1`). **One go-live BLOCKER found + FIXED:** the k8s manifest ran the **static price feed only** and it lacked **XRP/AVAX/MATIC** (all mainnet-corridor native assets), so those swaps failed quote with `price_unknown`; fixed by setting `BRIDGE_COINGECKO=true` in `k8s/bridge-deployment.yaml` **and** adding XRP/AVAX/MATIC/POL to the static fallback in `cmd/bridge/main.go` (live prices + outage backstop; prod should also set `BRIDGE_COINGECKO_API_KEY`). Every prior corridor smoke ran a hand-launched bridge **with** `--coingecko`, which is why this stayed hidden until the real manifest ran. **Two operator notes** (not code defects): the `bridge-sign`/v1.5.3 `mpcd` (0.4.0) needs `MPC_PASSWORD` env or it crashloops (`ZAPDB_PASSWORD` alone insufficient — verify before any live `mpcd` image bump); and the bundled ConfigMap (mainnet `networks.yaml`) + Ingress (`bridge.lux.network`) are namespace-/host-bound, so a testnet rehearsal must swap the ConfigMap to `networks.testnet.yaml`, drop the Ingress, and add a `ghcr.io` pull secret. **Non-finding:** an ECDSA re-sign of an *identical* (wallet, message) pair times out via mpcd's `ERROR_SESSION_DUPLICATE` (txID=hash(message)); harmless in prod (unique sighash per swap), only bit the rehearsal's reused `deadbeef…` test vector. **Net: Phase 0 complete; cutover is gated only on operator prerequisites** (secrets, KMS-rooted seed, treasury funding + caps, DNS, custody sign-off). R12 (2026-06-11 Zoo corridor validated on-chain + artifacts committed) — the Zoo RPC-path fix (`37e58814`, `/ext/bc/Z/rpc` → `/ext/bc/zoo/rpc`) is now **smoke-validated end-to-end on-chain in BOTH directions** against the live testnet chains through the **real 3-node ECDSA `mpcd` cluster** (Zoo is `family='evm'`): **LUX_TESTNET→ZOO_TESTNET** `swap_63400d97d5884693` → 49.5 ZOO delivered (dest tx `0xb3b44eed…`, validates the Zoo *destination*/release path) and **ZOO_TESTNET→LUX_TESTNET** `swap_af31765d692907e9` → 0.99 LUX delivered (dest tx `0x5cbd0eb8…`, validates the Zoo *source*/depositcheck path). This **supersedes R11's "Zoo parked — no Zoo chain deployed anywhere" framing**: the chains are live (the "no Zoo RPC" conclusion was a wrong-PATH bug, now fixed + proven on-chain, not merely compiled). Artifacts **committed 2026-06-11**: the on-chain record `docs/smoke-zoo-lux-testnet.md` (`974827d5`) + a real-SPA UI screen-recording `app/server/result-img/lux-zoo-test.gif` (`09442736`, a third swap `swap_684f3b0d4681e520` → 49.5 ZOO, dest tx `0x9aca578e…`) matching the `result-img/lux-*-test.gif` corridor convention. **New operator-deploy verification item (NOT a Zoo/bridge bug):** while recording, a ZOO release wallet minted ~9h earlier on the real ECDSA cluster went **unsignable** (`mchain: sign HTTP 504: timed out after 60s`) with **no node restart**, while a fresh keygen+sign through the same `mpc-router` succeeded — a test-env threshold-share desync. The real deploy must **verify the cluster's share persistence** so long-lived release wallets stay signable across hours/restarts; re-mint (keygen not idempotent), don't retry. Captured in memory `project_mpc_threshold_stale_shares.md` (recipe for the headless corridor GIF in `reference_headless_corridor_gif_recipe.md`). **Zoo DEPLOY GAP unchanged** (still a post-launch follow-up, see §13.5): the `de3a912a` go-live image predates the path fix → needs a rebuilt image past `37e58814` + ZOO added to the k8s `lux-bridge-config` ConfigMap + owner sign-off (mainnet Zoo young, ~799 blocks). **LUX EVM + non-EVM go-live (R11) is unaffected** — Zoo was always a separate post-launch track. R11 (2026-06-10 go-live staging) — **LUX EVM + non-EVM go-live fully staged from the repo side; the only remaining work is the operator cutover.** Custody decided: ed25519 (SOL/TON/XRP) on **mpcd-single single-signer, capped** release balances (FROST/Fireblocks deferred to a later `--eddsa-url` flip). **G7 done** — `mpc-router` productionized into `cmd/mpc-router/` + `cmd/mpcd-single/Dockerfile`. **G8 remediated AND pushed** — surgical 1-commit gate on `whispers/g8-baseline-port` (`826fdcaf`); full go-live stack on `whispers/bridgev2-golive`; `origin/whispers/bridgev2` (#393) left untouched. Deployable images **built + pushed**: `ghcr.io/luxfi/{bridge,mpc-router,mpcd-single}:de3a912a` (bridge carries the G8 gate — verified by `strings`). `networks.mainnet.yaml` + the k8s ConfigMap + `compose.mainnet.yml` **staged** with LUX/ETH/BTC/SOL/TON/XRP enabled; every deploy artifact pinned to `de3a912a`; `k8s/{mpcd-single,mpc-router}-deployment.yaml` added. Deploy runbooks written — **`docs/GO-LIVE.md`** (entry point) + `docs/operator-deploy-ed25519.md` — which CLOSE the "(pending)" deploy-doc markers in Phase 1.4 / §13.6 step 5 below. Remaining: operator cutover (secrets → `kubectl apply` → DNS → fund + cap release wallets → the G8 no-deposit test) + soft validation gaps (broader EVM↔EVM matrix, USDC↔LUX live swap). **Zoo parked** — wired but no Zoo chain deployed anywhere (see §13.5). R10 — completes the LUX cross-family corridor matrix (4/4) + records the upstream #393 force-push. 2026-06-10 after R9: **LUX↔XRP Testnet** (`313ba1d4`) and **LUX↔TON Testnet** (`f0f0ad25`, commit **local-only**) bidirectional live-validated, completing the LUX cross-family matrix (Sepolia ETH / Sol Devnet / XRP / TON) post-C-Chain-restore — **no new code**; the three ed25519 baseline fixes held through all four (TON→LUX held `user_deposit_pending` 60s with 0.693 TON standing in the shared-pool deposit==release wallet, then confirmed only on the +0.509948 TON delta). **⚠️ `origin/whispers/bridgev2` was force-pushed to a PR-#393 baseline that LACKS the ed25519 source baseline gate — see new gap G8**; the session's local branch was kept divergent (not pushed) per owner decision. R9 content below still holds — closes the wallet-pool collision pattern across ALL three ed25519 families + ERC-20 destination + closes BTC corridor. 2026-06-08 evening updates after R8: **ERC-20 destination fix** (`c9a62113`) — `signing_driver.go::AddressTypeETH` case was the ONLY family branch not passing `DestinationAsset` to `txassembler.PreSign`. Without it, `tokens.Registry.Lookup` returned nil, the assembler fell through to native-ETH mode, sent `value=amount*10^18 wei` directly to the user instead of `USDC.transfer(user, amount*10^6)`. Latent for the entire history of ERC-20 destination support; USDC source had been tested (works because `balanceOf` is registry-independent) but USDC destination had never been smoked end-to-end until 2026-06-08's BTC↔USDC validation. One-line fix; native-ETH unchanged. **SOL source baseline fix** (`432a817a`) — the third instance of the wallet-pool collision pattern. Drove a SOL→LUX swap without sending ANY SOL during the LUX↔Sol Devnet smoke and the bridge auto-paid 0.268 LUX from the release wallet (returned immediately). Root cause: mpcd-single's HKDF ed25519 keygen returns the same pubkey for both the per-swap SOL deposit wallet AND the long-lived X→SOL release wallet, so `checkSOL` false-positives on the standing release-wallet liquidity. Same fix shape as XRP (`c4b21b38`) + TON (`a489f5df`): baseline snapshot at create + delta-gated check + refund-amount cap; regression-guarded by `TestCheck_XRP_FixUnaffectedBySOLBaselineField`. **All three ed25519 families now baseline-gated** (XRP / TON / SOL). **LUX corridor re-validations** post-C-Chain-restore: LUX↔Sepolia ETH (`a5a20160`) and LUX↔Sol Devnet (`a8550c0a`) both bidirectional confirmed on-chain. Earlier R8 work still holds (BTC destination + source refund + XRP/TON baselines + 6 BTC corridor live-validations). §13.1 / §13.5 / §13.7 updated; new memory `architecture_mpcd_single_shared_pool.md` documents the cross-family pattern so future ed25519 family additions (Sui, Aptos, etc.) don't re-introduce the hole.) |
| Supersedes | R4 (pre-merge dep layout + pre-doc-cleanup; treated R3 client-side MPC as pending). R5 re-pinned against `pkg/bridge` v1.0.3 + the merged client-side MPC / cosigner stack, and reflected the deletion of the legacy `docs/*.md` set. R6 adds §13 (Go bridge migration) without modifying the existing SDK / Express story — both tracks ship. |

---

## 1. Background & Context

`bridge.lux.network` is Lux's cross-chain bridge UI. Historically it was a monolithic frontend bound to an older JavaScript API + standalone MPC service. Both have been replaced:

- The **API backend** is `app/server/` (Express + Prisma) and is live at `api.bridge.lux.network`. It also holds the cosigner glue (`src/domain/cosigners.ts`) that talks to external custodians (Utila, Fireblocks) on behalf of tenants — secret material never leaves the server.
- The **MPC layer** is provided by `pkg/threshold/` (`@luxfi/threshold` SDK), deployed in two modes:
  - **Private MPC** — Lux treasury cluster, collects fees. Config under `config/mpc/config.yaml`.
  - **Public MPC** — `m-chain`, validator-powered, permissionless, deployed via `k8s/mpc-deployment.yaml`.
- The **frontend** is packaged as a publishable white-label SDK `@luxfi/bridge` (`pkg/bridge/`). The bridge UI is **inlined** under `pkg/bridge/src/app/` — there is no longer a workspace `@luxbridge/app-v3` dependency. Each tenant (Lux, Zoo, Hanzo, Liquidity.io) consumes the SDK from a thin host shell plus its own `@<org>/brand` package.

This document is the authoritative project requirements set. There is no `requirements.txt` working-notes file in the repo (none has existed in git history); REQUIREMENTS.md is the canonical record.

## 2. Goals

1. Keep `bridge.lux.network` up, backed by `app/server/` (talking to b-chain) and `@luxfi/threshold` MPC (m-chain + private cluster).
2. Ship `@luxfi/bridge` v1.x as a publicly-installable npm package that any host can embed, with brand + config injected at mount time.
3. Provide reference tenant repos consuming the SDK:
   - `github.com/luxfi/bridge` Lux tenant — currently `app/bridge/` (`@luxbridge/lux-tenant`).
   - `github.com/zooai/bridge` Zoo tenant — pending (see §10).
4. Embed the bridge inside `luxfi/exchange` and `zooai/exchange` using the same SDK.
5. Support Liquidity.io as a third tenant operating its own backend (centralized MPC) — proves the SDK is genuinely backend-agnostic.

## 3. Non-Goals

The following are **explicitly out of scope** for this initiative and must not creep in:

- Rewriting `app/server/` routes, schema, or Prisma layer beyond what's needed for chain rewiring.
- Building new branding configs *before* data flow from b-chain to UI is proven end-to-end.
- Optimizing for Liquidity.io's standalone-backend use case before Lux's hosted case works.
- Changes to `@luxfi/threshold` MPC SDK internals — that package is consumed as-is.
- Replacing wallet adapters or chain libraries inside the inlined bridge UI beyond what wiring requires.

## 4. Glossary — Lux Chains

| Chain | Role | Used by bridge? |
|---|---|---|
| **b-chain** | Lux primary network validators. Hosts bridge API backend (consensus + state). | Yes — primary backend chain. |
| **m-chain** | Public/permissionless MPC chain, powered by validators. | Yes — public threshold signing. |
| **t-chain** | Threshold layer (referenced in `@luxfi/threshold`). | Yes — MPC SDK target. |
| **f-chain** | FHE chain (`github.com/luxfhe`, "first OSS torus threshold FHE"). | Not in scope for v1. |
| **o-chain** | Oracle chain, watches external networks. | Optional (helper). |
| **r-chain** | Relay chain, submits tx on other networks. | Optional (helper). |

## 5. Current State (verified 2026-05-22 against working tree on `whispers/bridgev2`)

### 5.1 Repo layout (relevant subset)

```
bridge/
├── app/
│   ├── bridge/             @luxbridge/lux-tenant v1.0.0 — canonical Lux tenant.
│   │                       Vite + React, thin shell (bridge.config.ts ~88 lines
│   │                       + main.tsx + index.html). Consumes @luxfi/bridge +
│   │                       @luxfi/brand + @luxfi/logo. See §5.5 for the
│   │                       transitive deps it currently re-declares.
│   ├── explorer/           Bridge explorer app.
│   └── server/             Bridge API (Express + Prisma). Live at api.bridge.lux.network.
│                           Holds cosigner glue (src/domain/cosigners.ts +
│                           __tests__/cosigners.test.ts + cosigners-fireblocks.test.ts).
├── pkg/
│   ├── bridge/             @luxfi/bridge — PUBLIC SDK (the canonical consumer entry point).
│   │   ├── src/
│   │   │   ├── index.ts           Public entry. Exports Bridge, mountBridge,
│   │   │   │                      applyBrandMetadata/getConfig/setConfig,
│   │   │   │                      and all Config types.
│   │   │   ├── Bridge.tsx         React component. UI is inlined under ./app/ —
│   │   │   │                      no lazy-load of any sibling workspace package.
│   │   │   ├── mount.ts           Imperative DOM-mount helper.
│   │   │   ├── config.ts          getConfig/setConfig/applyBrandMetadata.
│   │   │   ├── types.ts           BridgeConfig + BrandConfig/AuthConfig/
│   │   │   │                      KMSConfig/WalletConfig/MPCConfig blocks,
│   │   │   │                      plus BridgeUtilaConfig / BridgeFireblocksConfig
│   │   │   │                      cosigner blocks (nested under MPCConfig).
│   │   │   ├── app/               Inlined bridge UI.
│   │   │   │   ├── BridgeApp.tsx
│   │   │   │   ├── components/    AssetInput, Card, ChainSelector, Header,
│   │   │   │   │                  SwapForm, TransferStatus, WalletConnect.
│   │   │   │   ├── hooks/         useSwap, useTransfers, useWallet.
│   │   │   │   ├── lib/           assets, bridge-api, chains, format,
│   │   │   │   │                  mpc-session (R3 client-side MPC),
│   │   │   │   │                  wagmi-config.
│   │   │   │   └── styles/
│   │   │   └── __tests__/         Vitest specs: bridge-api, config,
│   │   │                          mpc-session, useSwap, useTransfers,
│   │   │                          useTransfers-cosigners, useWallet,
│   │   │                          wagmi-config.
│   │   ├── package.json   v1.0.3, scope public, registry npmjs.org.
│   │   └── README.md      Consumer-facing docs (kept in sync through R2/R3/R5).
│   ├── core/              Shared core utilities.
│   ├── settings/          Network + asset registry (private, unpublished).
│   ├── threshold/         @luxfi/threshold — MPC SDK. Consumed by app/server AND
│   │                      now by pkg/bridge (R3 client-side MPC session helper).
│   ├── ui/                Shared UI primitives.
│   └── utila/             Utila cosigner helpers (declarative, layered).
├── docs/                  Nextra site (pages/, theme.config.tsx, next.config.js,
│                          package.json + content/docs/*.mdx). The legacy loose
│                          top-level *.md set (BRIDGE-STATUS, LOCAL-SETUP,
│                          DEPLOYMENT, CI-CD-DOCKER-IMAGES, the MPC-* set) was
│                          deleted in the merge from main (R5). Only LLM.md
│                          and LUX-ID-INTEGRATION.md remain at docs/ root.
├── config/mpc/config.yaml     Private MPC cluster config.
├── k8s/mpc-deployment.yaml    Public MPC (m-chain) deployment manifests.
└── REQUIREMENTS.md            This document.
```

Notable removals from prior drafts:

- `app/bridge3/` does **not** exist. The two non-tenant apps are `app/explorer/` and `app/server/`.
- `pkg/bridge/src/luxbridge-app.d.ts` does **not** exist (the workspace-dep shim was removed when the UI was inlined).
- Root `requirements.txt` is **not** present (and never has been in git history).
- The legacy `@luxbridge/app` v2.0.0 directory was retired; `app/bridge/` is now the new, thin `@luxbridge/lux-tenant`.
- The legacy `docs/{BRIDGE-STATUS,LOCAL-SETUP,DEPLOYMENT,CI-CD-DOCKER-IMAGES,MIGRATION-TO-GO-MPC,MPC-GO-INTEGRATION,MPC-INTEGRATION-COMPLETE,MPC-MODERNIZATION-SUMMARY}.md` were deleted in the merge from main; their content has either been folded into the Nextra site or retired outright.

### 5.2 Component status

| Component | Status | Location |
|---|---|---|
| Lux primary network (validators) | Live | `github.com/luxfi/node`, `luxfi/chains` |
| Bridge API server (b-chain backend) | Live (Express + Prisma) | `app/server/` |
| `cmd/bridge` Go binary (migration in progress) | **In progress** (R7, see §13). Native: networks/tokens/limits, quote engine (CoinGecko + static fallback), swap store, deposit watcher, signing driver, refund driver, MPC dispatch via `mpcd` (family-routed). Proxied: explorer + settings. Working end-to-end on testnet across **EVM ↔ EVM**, **EVM ↔ Solana**, **EVM ↔ TON Testnet** as of 2026-06-04. BTC source-only enabled. Three env tiers: mainnet, testnet, **local** (Lux Local 31337 + Zoo Local 200203, 2026-06-01). Now wired into `compose.*.yml`. | `cmd/bridge/` |
| Public MPC (m-chain) | Live | `pkg/threshold/` SDK + `k8s/mpc-deployment.yaml` |
| Private MPC (treasury fees) | Live | same code, separate cluster, `config/mpc/config.yaml` |
| r-chain relay (optional helper) | Live (in repo) | `app/server/cmd/`, hooks |
| o-chain oracle (optional helper) | Live (in repo) | upstream `github.com/luxfi/bridge` |
| `@luxfi/bridge` SDK (`pkg/bridge/`) | **v1.0.3** on `whispers/bridgev2`. UI inlined; **client-side MPC session merged**; declarative cosigner blocks (`utila`, `fireblocks`) exposed via `BridgeMPCConfig`. | This repo |
| Server-side cosigner glue | **Merged** — `app/server/src/domain/cosigners.ts` + Fireblocks/native tests. End-to-end soak against a real Utila/Fireblocks tenant still pending. | `app/server/` |
| Cosigner port to Go bridge | **Wired + real Fireblocks** (2026-05-28) — `internal/cosigners` package mirrors the TS wire contract: `ValidateIntents` (secret-field deny-list + per-family required fields), `EnvSecretStore` (env-var fallback before KMS lands), `DefaultDispatcher` (parallel per-intent execution + `AllApproved`/`FirstNonApproved` helpers). Family runners: `FireblocksRESTFamily` is the **real REST client** — RAW-sign POST /v1/transactions, polls GET /v1/transactions/{id}, partitions terminal statuses (COMPLETED/BROADCASTING/CONFIRMING → approved, REJECTED/CANCELLED/BLOCKED → rejected, FAILED/TIMEOUT → failed), pulls the signature from `signedMessages[0].signature.fullSig`. Authentication via pure-stdlib RS256 JWT signed with the tenant's RSA private key (PKCS#1 or PKCS#8 PEM). 60s default timeout overridable via `FIREBLOCKS_COSIGNER_TIMEOUT_MS`. Wired into `swap_store.go` (Cosigners + CosignerResults on Swap), `swaps_handler.go` (validate-or-400 at POST), and `signing_driver.go` (gate broadcast on `AllApproved`; non-approved → `refund_pending`). Default-on gate via `--disable-cosigners`; opt-in real Fireblocks via `--enable-fireblocks-cosigner`. **18 unit tests** cover happy path + 8 terminal-status variants + HTTP errors + timeout + context cancellation + body shape + JWT signature verification + Utila delegation. Utila intents still route to `StubFamilyDispatcher.RunUtila` (Connect-RPC port pending; matches TS impl which is also stubbed). | `internal/cosigners/`, `cmd/bridge/` |
| Lux tenant app (`app/bridge/`) | `@luxbridge/lux-tenant` v1.0.0 — thin shell | This repo |
| Zoo tenant app | Pending — needs new tenant repo (see §10) | TBD |
| Liquidity backend wire-up | Later | After Lux/Zoo tenants ship |

### 5.3 SDK public API surface (verified against `pkg/bridge/src/index.ts`)

```ts
export { Bridge } from './Bridge'
export type { BridgeProps } from './Bridge'

export { mountBridge } from './mount'

export {
  applyBrandMetadata,
  getConfig,
  setConfig,
} from './config'

export type {
  BrandConfig,
  BridgeAuthConfig,
  BridgeConfig,
  BridgeKMSConfig,
  BridgeMPCConfig,
  BridgeWalletConfig,
  MountBridgeOptions,
} from './types'
```

`BridgeConfig` (`pkg/bridge/src/types.ts`):

```ts
interface BridgeConfig {
  apiHost: string                     // e.g. "https://api.bridge.lux.network"
  env: string                         // "mainnet" | "testnet" | custom slug
  brand?: BrandConfig                 // White-label overrides
  auth?: BridgeAuthConfig             // Hanzo IAM (OIDC) block, mirrors <Exchange auth={…}/>
  kms?: BridgeKMSConfig               // Tenant KMS endpoint
  wallet?: BridgeWalletConfig         // WalletConnect project id + chain set
  mpc?: BridgeMPCConfig               // optional publicUrl + privateUrl + protocol
                                      //   + optional utila / fireblocks cosigner blocks
  clientId?: string                   // @deprecated — use auth.clientId
  iamOrg?: string                     // @deprecated — use auth.orgSlug
}
```

`BridgeMPCConfig.protocol` accepts classical (`cggmp21`, `frost`, `bls`, `doerner`) and post-quantum lattice-based (`pulsar`, `corona`, `magnetar`) threshold-signature identifiers. All protocols are leaderless / permissionless-safe by design.

`BridgeMPCConfig` also accepts optional `utila?: BridgeUtilaConfig` and `fireblocks?: BridgeFireblocksConfig` cosigner blocks (the types live in `pkg/bridge/src/types.ts` and are reachable through `BridgeMPCConfig`). These are **declarative only**: the SDK carries the tenant-visible identifiers (Utila org id / vault id, Fireblocks API key id / vault account id), and the bridge backend (`app/server/src/domain/cosigners.ts`) holds the matching secrets and completes the cosign. The cosigner layer sits *on top of* native Lux MPC — the backend enforces 2-of-2 (native threshold + external cosigner) before releasing settlement.

`BridgeMPCConfig.publicUrl` is **optional**: tenants running pure-external custody (utila or fireblocks set, no native threshold) may omit it. The recommended layered mode keeps it set so native MPC remains the primary signer.

`BrandConfig` keeps the original shape: `name`, optional `logoUrl`, `faviconUrl`, `primaryColor`, `secondaryColor`, `supportEmail`, `docsUrl`.

### 5.4 SDK dependency layout (verified against `pkg/bridge/package.json` v1.0.3)

Direct prod `dependencies` (15 total):

- **UI primitives (`@hanzo` / `@hanzogui`)**: `@hanzo/gui`, `@hanzogui/core`, `@hanzogui/helpers`, `@hanzogui/constants`, `@hanzogui/themes`, `@hanzogui/config-default`, `@hanzogui/animate`, `@hanzogui/animate-presence`, `@hanzogui/button`, `@hanzogui/input`.
- **Brand**: `@luxfi/brand` (`^1.0.0`, published on npm).
- **Client-side MPC**: `@luxfi/threshold` (`workspace:*`) — drives `pkg/bridge/src/app/lib/mpc-session.ts`. This was added in the R3 merge; it's the only `workspace:*` runtime dep in the SDK.
- **Web3 / data**: `@tanstack/react-query` `5.90.20`, `viem` `2.30.5`, `wagmi` `2.15.5`. All pinned exactly.

`peerDependencies` (host-supplied): `react` (`>=18`), `react-dom` (`>=18`), plus 21 leaf `@hanzogui/*` components (popover, select, dialog, card, text, stacks, spinner, toast, tabs, label, form, list-item, separator, tooltip, avatar, image, group, progress, visually-hidden, portal, sheet) — all marked `optional` via `peerDependenciesMeta`. This lets host apps tree-shake the parts of the bridge UI they don't render.

`devDependencies`: `typescript`, `vitest`, `@testing-library/react`, `happy-dom`, `jsdom`, `@types/react`, `@types/react-dom`.

The SDK **does not** workspace-depend on any `@luxbridge/app-*` package (those were retired with the inline UI). The single `workspace:*` runtime dep is `@luxfi/threshold`, which is the in-repo T-Chain SDK; it has no transitive workspace deps of its own.

### 5.5 Tenant shape (verified against `app/bridge/package.json`)

`@luxbridge/lux-tenant` v1.0.0, `private: true`.

Dependencies fall into two layers:

- **Tenant-owned**: `@luxfi/brand ^1.0.0`, `@luxfi/bridge workspace:*`, `@luxfi/logo ^1.0.0`, plus `react` / `react-dom` (catalog) and `react-native-web ^0.19.0` for RN-web parity.
- **Pinned transitively** (workaround until §9.3.1 ships a compiled `dist/`): `@hanzogui/config-default ^7.0.0`, `@luxfi/threshold workspace:*`, `@tanstack/react-query 5.90.20`, `viem 2.30.5`, `wagmi 2.15.5`. The SDK is consumed at the source level (its `main`/`types` still point at `src/*`), so Vite's dep-scanner walks these from the tenant's `node_modules/` rather than from the SDK package's nested `node_modules/`. Once the SDK builds to `dist/` (Phase 3.1) and externalizes web3 + UI primitives, tenants will no longer need to re-declare these.

Scripts: `dev` / `build` / `preview` / `typecheck` against Vite + tsc. The Vite config aliases `react-native` → `react-native-web` and dedupes `react` / `react-dom` / `react-native-web`; downstream tenants must replicate this aliasing — see `pkg/bridge/README.md` ("Consuming this SDK from a Vite app").

Runtime config is supplied via `window.__ENV` (templated from `BRIDGE_*` env at container boot, served from `/__ENV.js`) with an `import.meta.env.VITE_*` build-time fallback for local dev. Tenants do not pass chain configs — they pass `apiHost` + `env` + `brand` + optional auth/kms/wallet/mpc blocks. Brand defaults are read from `@luxfi/brand/brand.json` so a brand bump propagates without string copies.

### 5.6 R3 client-side MPC integration (merged)

The R3 work that R4 listed as "in flight" is now in the working tree. Summary of what landed:

| Artifact | Location | Purpose |
|---|---|---|
| `mpc-session.ts` | `pkg/bridge/src/app/lib/mpc-session.ts` | Wraps `@luxfi/threshold`'s `ThresholdClient` so the UI can surface real session progress (sessionId / status / signature) instead of a setTimeout placeholder. Initiates sessions only — no key material on the client. |
| `bridge-api.ts` | `pkg/bridge/src/app/lib/bridge-api.ts` | Typed bridge-server REST client. |
| `wagmi-config.ts` | `pkg/bridge/src/app/lib/wagmi-config.ts` | Per-tenant wagmi + WalletConnect config derived from `BridgeWalletConfig`. |
| `BridgeUtilaConfig` / `BridgeFireblocksConfig` | `pkg/bridge/src/types.ts` | Declarative tenant-visible identifiers for external cosigners. Reachable via `BridgeMPCConfig.utila` / `.fireblocks`. |
| `app/server/src/domain/cosigners.ts` (+ tests) | server side | Holds the actual Utila / Fireblocks secret material and performs the cosign. Browser never sees the secret. |
| Vitest specs | `pkg/bridge/src/__tests__/` | `mpc-session.test.ts`, `useTransfers-cosigners.test.tsx`, `bridge-api.test.ts`, `wagmi-config.test.ts`, `useSwap.test.tsx`, `useTransfers.test.tsx`, `useWallet.test.tsx` |

**Invariant (must not regress):** secret material for external cosigners lives on `app/server/` only. The SDK declares the tenant-public identifiers; it must never grow a code path that holds a Utila / Fireblocks secret on the client.

## 6. Target Architecture

```
                           +-----------------------------+
                           |  @luxfi/bridge  (pkg/)      |
Tenant app (~120 LOC)  --> |  exports:                   |
  imports SDK + brand      |    Bridge, mountBridge      |
  e.g.:                    |    BridgeConfig + sub-blocks|
    @luxfi/bridge          |  UI inlined at src/app/     |
    @luxfi/brand     -->   |  client-side MPC via        |
    @luxfi/logo            |    @luxfi/threshold         |
                           +-----------------------------+
                                       |
                                       v
                           +-----------------------------+
                           |  app/server (Express +      |
                           |  Prisma) — Bridge API       |
                           |  api.bridge.lux.network     |
                           |  + cosigners.ts (utila /    |
                           |    fireblocks secrets)      |
                           +-----------------------------+
                                       |
                  +--------------------+--------------------+
                  v                                         v
        +--------------------+                  +--------------------+
        |  b-chain  (Lux     |                  |  @luxfi/threshold  |
        |  primary network)  |                  |  MPC SDK           |
        |  consensus + state |                  +--------------------+
        +--------------------+                          |
                                       +----------------+----------------+
                                       v                                 v
                              +------------------+              +------------------+
                              |  m-chain         |              |  Private cluster |
                              |  (public MPC)    |              |  (treasury fees) |
                              |  mpc.publicUrl   |              |  mpc.privateUrl  |
                              +------------------+              +------------------+
```

**One canonical SDK name. One mount function. One config shape.** All chain-awareness lives behind `apiHost` + `env` + the optional `mpc` block — tenants do not pass chain configs.

## 7. Phase 1 — Wire & Restore (LARGELY COMPLETE)

**Outcome:** `bridge.lux.network` serves `@luxfi/bridge` pointed at the live `app/server/` API, talking to b-chain and m-chain.

Status of original Phase 1 line items:

| # | Task | Status |
|---|---|---|
| 1.1 | Bridge UI compiles and runs against `apiHost: api.bridge.lux.network` in `env: mainnet`. | ✅ — UI is inlined under `pkg/bridge/src/app/` and consumed by `app/bridge/`. |
| 1.2 | Commit the in-flight SDK edits that resolved the `@luxbridge/app` workspace cycle. | ✅ — see Phase 1.5 history note in `pkg/bridge/src/Bridge.tsx`. |
| 1.3 | Run the SDK end-to-end against Lux testnet. | 🟡 — **Sepolia → LUX signed bridge tx working end-to-end on the `cmd/bridge` Go path (2026-05-28)**; quote-at-create + receive-amount + CoinGecko pricing + MPC deposit wallet + signing + broadcast all verified live. The Express-path Phase 1.3 sign-off per `app/bridge/TESTNET-E2E.md` is still 🟡 (separate gate). |
| 1.4 | Deploy the Lux tenant app to `bridge.lux.network`. | 🟡 — As of 2026-05-28, the chosen production deploy is the unified **Go binary** (`cmd/bridge` → `ghcr.io/luxfi/bridge:latest`) per §13, **not** the legacy Express + Vite SPA split. `k8s/bridge-deployment.yaml` is complete (Deployment + Service + Ingress + PVC + ConfigMap, ingress at `bridge.lux.network` + `bridge-api.lux.network` with cert-manager TLS); `.github/workflows/docker.yml` builds + pushes the image. Operator-side gating items: (1) populate `bridge-secrets` Secret with `mpc-api-token` (+ DB / wallet keys) in the `lux-bridge` namespace, (2) `kubectl apply -f k8s/bridge-deployment.yaml`, (3) DNS A-records for both hostnames → cluster LB, (4) hand-fund the release wallets auto-minted on first swap per destination network. See deploy runbook (`docs/operator-deploy-phase-1-4.md` — pending). |
| 1.5 | Refresh / fold the legacy `docs/*.md` (`BRIDGE-STATUS`, `LOCAL-SETUP`, etc.). | ✅ — the loose top-level set was deleted in the merge from main; only `docs/LLM.md` and `docs/LUX-ID-INTEGRATION.md` remain at docs root, and active docs now live under `docs/content/docs/`. |
| 1.6 | Keep `pkg/bridge/README.md` accurate (it was updated through R2/R3). | ✅ — consumer-facing README documents `Bridge`, `mountBridge`, `applyBrandMetadata`, `getConfig`, `setConfig`. |

**Acceptance criteria** (recheck before sign-off):

- A user can reach `bridge.lux.network`, connect a wallet, get a quote on Lux testnet, and complete a bridge transaction signed by an m-chain MPC quorum.
- Internal devs can run `pnpm dev` from `app/bridge/` against local `app/server/` and complete the same flow.
- Treasury fee collection through the private MPC cluster fires on a real transfer.
- `pkg/bridge/README.md` matches the current API surface in §5.3 (including the cosigner block additions from R3).

## 8. Phase 2 — Multi-Tenant Embed

**Outcome:** the SDK is consumed unchanged from at least two host apps (`luxfi/exchange` web, `zooai/exchange` web) and one standalone Zoo tenant.

**Deliverables**

| # | Task | Notes |
|---|---|---|
| 2.1 | Stand up `github.com/zooai/bridge` as a thin Zoo tenant shell mirroring `app/bridge/`: `src/main.tsx`, `package.json`, `vite.config.ts`, `Dockerfile`, `k8s/`, `bridge.config.ts`. | The earlier `zoo/bridge` proxy-Go + `lux-shim`/overlay dirs were already removed; do not revive them. |
| 2.2 | Publish `@zooai/brand` and `@zooai/logo` if not yet published; confirm `@hanzoai/brand` if needed. | Out-of-tree, coordinate with brand owners. |
| 2.3 | Add an `@luxfi/bridge` mount inside `luxfi/exchange/apps/web/src/main.tsx` (mirroring the existing `@luxfi/exchange` SDK pattern). | Cross-repo. |
| 2.4 | Same for `zooai/exchange/apps/web/src/main.tsx`. | Cross-repo. |
| 2.5 | Confirm `BrandConfig` + the auth/kms/wallet/mpc blocks (including the cosigner sub-blocks) cover everything Zoo + Hanzo need without code changes in `pkg/bridge/`. If anything must be hardcoded, surface it as a new optional config field with semver-minor bump. | Drives any v1.1.x of the SDK. |

**Acceptance criteria**

- Two tenant repos exist (`github.com/luxfi/bridge` and `github.com/zooai/bridge`) and each is a thin shell (≤150 LOC of bridge wiring, excluding build/CI files).
- The same `@luxfi/bridge` version installed in each renders the brand-correct UI from `BrandConfig` alone.
- No tenant repo contains bridge UI logic, route logic, or wallet logic. All such changes land upstream in `pkg/bridge/`.

## 9. Phase 3 — White-Label SDK Publication

**Outcome:** `@luxfi/bridge` is published to the public npm registry and Liquidity.io (or any third party) can adopt it with their own backend.

**Deliverables**

| # | Task | Notes |
|---|---|---|
| 3.1 | Switch `pkg/bridge/package.json` `main`/`types` from `src/*.ts` to compiled `dist/*.js` + `.d.ts` outputs. Add a real `build` step that emits both. | Today `main`/`types` point at `src/*` and `build` is `tsc --noEmit`. This is what forces tenants to re-declare web3 / `@hanzogui/config-default` / `@luxfi/threshold` in their own `package.json` (§5.5). |
| 3.2 | Externalize React + react-dom + `@luxfi/brand` (and ideally `wagmi` / `viem` / `@tanstack/react-query`) from the published bundle. | React / react-dom are already peer-deps; verify the new web3 trio after the build step lands. |
| 3.3 | Confirm there are no `workspace:*` deps left in the publishable surface. | `@luxfi/threshold` is currently a `workspace:*` runtime dep — it must be published to npm (or vendored / re-exported through `dist/`) before SDK publication. |
| 3.4 | Publish `@luxfi/bridge` v1.x → npm under the `@luxfi` scope (public access). | `pnpm pub` from `pkg/bridge/`. |
| 3.5 | ~~Land the R3 client-side MPC integration~~ — **done** (R5). `mpc-session.ts`, `bridge-api.ts`, `wagmi-config.ts`, `BridgeUtilaConfig` / `BridgeFireblocksConfig`, server-side `cosigners.ts` + tests are all merged; SDK bumped to v1.0.3. Remaining sub-task: end-to-end soak against a real Utila and a real Fireblocks tenant on testnet. | Secret material stays on `app/server/` — invariant must not regress. |
| 3.6 | Document standalone-backend mode for Liquidity.io: how to point `apiHost` at a non-Lux endpoint, what server API contract `app/server/` exposes, what's pluggable. | New doc under `docs/content/docs/`. |
| 3.7 | Confirm Liquidity.io can render their own securities (AAPL, etc.) via the existing tokens/assets registry (`@luxbridge/settings`) without forking. If not, add an injection point. | May surface a `tokens?` field on `BridgeConfig`. |

**Acceptance criteria**

- `npm install @luxfi/bridge` from a fresh project succeeds; the Quick Start in `pkg/bridge/README.md` produces a running bridge in <5 minutes.
- A third party can stand up a bridge with their own `apiHost` and `BrandConfig` without modifying SDK source.
- A new standalone-backend doc clearly describes the Liquidity.io path.
- The cosigner layer has been exercised end-to-end against at least one real external custodian on testnet.

## 10. Outstanding Tenant Work

### 10.1 Zoo tenant

The earlier `zoo/bridge` proxy-Go code and `lux-shim`/`zoo/bridge/app` overlay dirs have been removed. The replacement is a thin Zoo tenant repo mirroring `app/bridge/` — see Phase 2.1. Until that repo exists, there is no Zoo deployment target.

### 10.2 SDK working state

`pkg/bridge/` is at **v1.0.3** on `whispers/bridgev2`. Recent merges (see `git log`):

- `phase3-r2 stack (inline UI + cleanup + Tamagui swap)` — inlined the bridge UI.
- `phase1 SDK config blocks (auth/kms/wallet/mpc + PQ protocol union)` — added the optional config blocks.
- `wire @luxfi/logo as canonical Lux logo source` — brand wiring.
- `merge: swarm/integration → main` (phase1-3 + `@luxfi/logo`) — bundled the R3 work into main.
- `merge: main → whispers/bridgev2` (R5) — pulled the **R3 client-side MPC + cosigner stack** into this working tree: `mpc-session.ts`, `bridge-api.ts`, `wagmi-config.ts`, `BridgeUtilaConfig` / `BridgeFireblocksConfig`, `app/server/src/domain/cosigners.ts` + tests, plus tenant deploy artefacts (`Dockerfile`, `docker-entrypoint.sh`, `__ENV.js` template).
- `chore: env has been set up successfully` — environment bring-up after the R3 merge: added the transitively-required deps to `app/bridge/package.json` (see §5.5) and a `prepare` script to `pkg/threshold/` so `dist/` builds on `pnpm install`.

The next outstanding SDK work is **Phase 3.1** (compile to `dist/`) so external consumers can install the package without source-level workarounds, and **Phase 3.5 remainder** (e2e soak of the cosigner layer against a real external custodian).

## 11. Risks & Open Questions

| # | Item | Risk / impact | Owner |
|---|---|---|---|
| R1 | Build step still emits no `dist/`. Publishing today would ship `src/*.ts` directly — works for workspace consumers (since pnpm hoists transitive deps locally), breaks downstream type resolution for non-pnpm users and forces tenants to re-declare web3 deps. | Blocks Phase 3.1 / 3.4. | SDK |
| R2 | `@luxfi/threshold` is a `workspace:*` runtime dep of `@luxfi/bridge`. Publishing `@luxfi/bridge` without first publishing (or vendoring) threshold will produce an unresolvable install for external consumers. | Blocks Phase 3.3 / 3.4. | SDK |
| R3 | The cosigner layer (`mpc.utila` / `mpc.fireblocks`) is declarative on the SDK side and secret-holding on the server side. A future implementer must not move secret material client-side. The SDK type surface deliberately omits any field that would carry a secret. | Security regression. | SDK + server, Phase 3.5 e2e. |
| R4 | Liquidity.io's securities (AAPL, etc.) may require asset-registry injection points the current `@luxbridge/settings` does not expose. | Could force a SDK breaking change. | Investigate during Phase 3.7. |
| R5 | New `auth` / `kms` / `wallet` / cosigner blocks are not yet exercised end-to-end by a non-Lux tenant; behavior under Zoo/Hanzo branding is unverified. | Auth + cosigner break for Zoo/Hanzo. | Phase 2 e2e. |
| R6 | `app/bridge/package.json` currently re-declares deps that morally belong to `@luxfi/bridge` (web3 trio + `@hanzogui/config-default` + `@luxfi/threshold`). If a tenant lags an SDK upgrade, version drift between the tenant's declared pins and what the SDK actually uses can cause subtle runtime breaks. Phase 3.1 retires this risk. | Drift between tenant and SDK pins. | SDK, Phase 3.1. |

**Open questions for sponsor:**

1. Is Hanzo a tenant in this round, or only Lux + Zoo + (later) Liquidity.io?
2. Target date / acceptance bar for the Phase 3.5 cosigner e2e soak (Utila + Fireblocks on testnet).
3. Should `pkg/utila/` (and any equivalent `pkg/fireblocks/` if added) ship as published `@luxfi/*` packages, or stay private workspace helpers consumed only by `app/server/`?
4. Publication timing for `@luxfi/threshold` (gates SDK publication — see R2).

## 12. Out-of-Tree References

| Resource | URL / location |
|---|---|
| Lux node + primary network | `github.com/luxfi/node`, `github.com/luxfi/chains` |
| Bridge API + UI repo (canonical home) | `github.com/luxfi/bridge` |
| `@luxfi/threshold` (T-Chain SDK) | `pkg/threshold/` |
| Public MPC k8s deployment | `k8s/mpc-deployment.yaml` |
| Private MPC config | `config/mpc/config.yaml` |
| Bridge API docker image | `ghcr.io/luxbridge/bridge-server` |
| Exchange SDK pattern (precedent) | `github.com/luxfi/exchange`, `github.com/zooai/exchange` |
| FHE chain (not in scope v1) | `github.com/luxfhe` |

## 13. Go bridge migration (`cmd/bridge`)

The Node backend's heavy paths (swap orchestration, quote engine, MPC dispatch, deposit watching) are being ported into a single Go binary at `cmd/bridge/` that also embeds the SPA via `go:embed`. Goal: eliminate Express + Prisma + Postgres from the bridge core path and collapse the runtime to one image + one config file. The migration is in progress on `whispers/bridgev2` — the binary builds, the orchestrator drives real swaps against testnet, but it is not yet wired into the production compose files.

This section documents the Go binary as a parallel track. Phases 1–3 above continue to describe the TypeScript SDK + Express backend deliverable, and remain canonical until cutover (§13.6 step 5).

### 13.1 Status (verified 2026-06-04 against working tree on `whispers/bridgev2`)

| Component | State | Notes |
|---|---|---|
| Networks / tokens / limits / exchanges | ✅ native | Served from YAML (`cmd/bridge/networks.testnet.yaml`, `networks.example.yaml`). No DB. |
| Quote engine | ✅ native | `quote_engine.go` + `coingecko_price_feed.go`. CoinGecko primary + static fallback (LUX/ZOO live in static permanently — neither is listed on CoinGecko). Receive amount is snapshot-stamped on the `Swap` row at create time. |
| Swap store | ✅ native | `swap_store.go` (in-memory map; `zap_store.go` is the Hanzo Base / SQLite-embedded backing, not yet the default). Status set: `user_deposit_pending → bridge_transfer_pending → broadcasting → completed`, plus `refund_pending` (stale-quote handoff) and `refunding` (legacy insufficient-funds path). |
| Deposit watcher | ✅ native — hardened 2026-05-29 | `deposit_watcher.go`, 15s poll loop. Advances `user_deposit_pending → bridge_transfer_pending_signing` once the source-chain deposit confirms. **Auto-expiry (2026-05-29):** new `--deposit-expire-after` flag (default 24h) auto-cancels stale `user_deposit_pending` swaps whose CreatedAt is older than the threshold (user created a quote then walked away without sending the deposit). Each tick checks deposit first (confirmed deposit wins over expiry) then `maybeExpire`; the Patch's status-guard keeps both passes idempotent. Zero disables (back-compat). New `bridge_deposit_watcher_expired_total` counter on `/metrics`. **Empirically validated against the running testnet bridge** — 29 stuck `user_deposit_pending` swaps (some 4h+ old, accumulated since the binary started) swept in one 15s tick after a restart with `--deposit-expire-after 1m`; per-swap log lines emit `age` + `threshold`. Closes the last hardening-matrix gap: every pipeline stage now has a terminal escape. 7 unit tests cover past-threshold/below-threshold/zero-disabled/deposit-wins/status-guard-idempotent/zero-CreatedAt-defensive/negative-clamp. |
| Signing driver | ✅ native — hardened 2026-05-29 | `signing_driver.go`. Drives `bridge_transfer_pending_signing` → MPC sign → `broadcasting`. Quote-staleness guard via `--quote-max-age` (default 30 m) — stale swaps are kicked to the refund driver so the user gets their deposit back rather than executing at a drifted rate. Persistent-failure ceiling (mirror of refund driver): new `SigningAttempts` field on Swap + `maxSigningAttempts` ceiling. Each PreSign / MPC sign failure bumps the counter via the shared `rollbackOrFail` helper; at `--signing-max-attempts` (default 10) the swap moves to `SwapStatusRefundPending` so the refund driver returns the deposit. Catches both transient destination-RPC outages and terminal cases like non-EVM destination chains with no tx assembler (BTC / SOL / TON today — `txassembler: no config for network BITCOIN_TESTNET`). 4 unit tests cover the new paths. Empirically validated on `swap_1721f4…6252` (LUX → BTC) — looped "Destination RPC unreachable" for hours pre-fix; transitioned `bridge_transfer_pending → refund_pending → refunded` in ~55 s post-fix. |
| Refund driver | ✅ native — hardened 2026-05-28 (two passes) | `refund_driver.go`. Handles legacy insufficient-funds refunds + stale-quote handoffs + (new) stuck-unrefundable swaps + (new) persistent-failure ceiling. Hardening (pass 1): (a) Grace-window check now treats zero `LastErrorAt` as past-window (legacy persisted state with `LastError` set but timestamp unpopulated was looping the broadcast driver forever — this unblocks the refund path); (b) New `isStuckUnrefundable` + `failTerminal` route swaps stuck broadcasting past the refund window with `Sender` or `DepositAddress` missing to terminal `SwapStatusFailed` with operator-actionable `LastError`, instead of looping; (c) `terminal_failures` counter in `RefundDriverStats` for ops visibility. Hardening (pass 2): (d) New `RefundAttempts` field on Swap + `maxRefundAttempts` ceiling on RefundDriver. Each refund-rollback (MPC sign timeout, balance fetch error, broadcast failure on the source side) increments the counter; at `--refund-max-attempts` (default 5) the swap moves to `SwapStatusFailed` with "likely upstream mpcd / RPC issue" reason — catches the empirical wallet-rotation case where mpcd returns 504 on every sign because the rotated wallet's MPC session state was lost. Counter resets on successful refund. Zero disables (legacy retry-forever). 10 unit tests total cover the new paths. **Orphan recovery** (added 2026-05-29 in pass 3): new `--orphan-refunding-after` flag (default 5 m) + new third path in `tick()` that scans `SwapStatusRefunding` for swaps with stale `UpdatedAt` and rolls them back to `SwapStatusRefundPending` (bumping `RefundAttempts` so the persistent-failure ceiling composes). Stats counter `orphans_recovered` in `refund_stats`. Empirically validated against the previously-stuck `swap_5010a82142ef1391` — recovered immediately on first tick of a restart, re-entered the refund flow normally. Combined effect: a swap killed mid-refund no longer needs operator intervention to resume. |
| MPC dispatch | ✅ native — layered 2026-05-29 + family-routed 2026-06-04 | Calls `mpcd` directly over HTTP (`/keygen`, `/sign`). Layered pool (`internal/mchain.Pool`) routes by role: per-swap deposit-wallet keygen + refund signing → `--mpc-url` (PUBLIC, m-chain public quorum, single-swap blast radius); release-wallet keygen + settlement signing → `--mpc-private-url` (PRIVATE treasury cluster, smaller quorum holding operator liquidity). Single-cluster back-compat preserved: leave `--mpc-private-url` empty and both roles target `--mpc-url` exactly as before. Private-cluster auth (`--mpc-private-token`, `--mpc-private-identity-file`, `--mpc-private-org-id`) inherits the public-cluster values when unset. Health surfaces `mpc_pool_split` so operators can confirm a split took effect. **Family routing (2026-06-04, hardened 2026-06-05):** a small `mpc-router` process (`/tmp/mpc-router.go`) sits in front of both endpoints and dispatches by `wallet_id` family — `solana_*`/`sol_*`/`ton_*`/`-ton-*`/`xrp_*`/`-xrp-*` → ed25519 cluster (`cmd/mpcd-single` today; cluster-FROST mpcd when that separate epic ships); everything else → ECDSA cluster (real mpcd). Required for any deploy that supports SOL/TON/XRP, because mainline mpcd's keygen returns `"no sol address returned"` for ed25519 walletIDs. `mpcd-single` (renamed + hardened from `fake-mpcd` on 2026-06-05) derives every per-wallet ed25519 key via HKDF-SHA-512 from a single master seed loaded through the secrets Resolver (file/env/kms/literal) — same wallet_id is stable across restarts, distinct wallet_ids produce uncorrelated keys (fixed the previous "one key for every wallet" bug). signHandler mirrors the router's family check so 32-byte TON cell hashes / XRPL SHA-512Half digests don't get rejected as "looks like an EVM sighash". 6 unit tests cover pool routing + 8 cover mpcd-single derivation/family routing; smoke environment exercises router. |
| Explorer / settings / auth | 🟡 proxied | Falls back to `app/server` via `--backend`. |
| Non-EVM wallet adapters | ✅ shipped 2026-05-29 | `pkg/bridge/src/app/lib/wallet-adapters.tsx` adds a unified `useWalletForFamily(family)` / `useWalletForBridgeId(id)` hook that dispatches to the right adapter per ChainFamily: wagmi (evm/lux), `@solana/wallet-adapter-react` (svm, Phantom by default), `@tonconnect/ui-react` (ton), `sats-connect` (btc, Xverse-compatible). Native balance read for each: SOL via `Connection.getBalance`, TON via `toncenter.com/api/v2/getAddressBalance`, BTC via `mempool.space/api/address/<addr>`. `NonEVMProviders` provider tree mounts inside `BridgeApp` between `QueryClientProvider` and the app inner tree. `AssetInput` consumes the family-aware hook so the Balance line shows real values for SOL/BTC/TON when the matching wallet is connected; unimplemented families (XRP, Cardano, Substrate) show "MPC-signed — no wallet balance". ERC-20 contract addresses pass through to wagmi's `useBalance({token})` so token balances continue to work. **Connect-wallet dialog (`WalletConnect.tsx`)** now shows a third "Other Chains" section under the EVM "Installed" / "Popular" groups with one row per non-EVM family (Solana / TON / Bitcoin). Each row triggers the family's `connect()` from the wallet-adapters hook — Solana opens Phantom directly, TON opens the TonConnect modal, BTC prompts the active Wallet-Standard BTC wallet via sats-connect. **Connect-flow fixes**: (a) Solana `connect()` calls `adapter.connect()` SYNCHRONOUSLY from the click handler. Phantom (and most modern wallets) require the popup-triggering call to be in the SAME synchronous chain as the user click — deferring via `setState + useEffect` breaks the gesture context and the popup is silently suppressed (the "Connecting… but no popup" bug). To make the SDK still observe the resulting connection, `flushSync(() => sol.select(name))` forces React to commit the select state update AND run the connect-listener registration effect BEFORE `adapter.connect()` is called. Without flushSync, the SDK's listener for the new adapter wouldn't be wired up until the next render tick — by which time `adapter.connect()` has fired and the connect event has been lost. (b) `WalletProvider autoConnect` is explicitly **disabled**. With it on, returning users get silently re-connected on page load — Phantom recognizes the site as previously authorized and connects without showing a popup, then clicking "Solana" sees `sol.connected=true` and resolves immediately, closing the dialog with no visible feedback. With autoConnect off, every fresh page load requires an explicit click → popup → approve → connected. The selected wallet name still persists via localStorage so the SDK remembers which adapter to use. (c) Row's `Connecting…` indicator is gated on user click (`pendingFamily === family`) not on `wallet.connecting`. (d) Per-row pending state so a hung popup doesn't gray out the TON / BTC rows. 13 vitest tests cover the dispatcher routing + family-specific initial state + provider smoke test. vitest.setup.ts polyfills `localStorage`/`sessionStorage` (clearing per-test) so happy-dom can host the TonConnect SDK whose eager-init touches storage at module-import time. Total test count: 95 vitest + Go regression all green. |
| End-to-end pipeline regression net | ✅ native — shipped 2026-05-29 | `cmd/bridge/e2e_test.go` composes all four drivers (DepositWatcher / SigningDriver / BroadcastDriver / RefundDriver) + the API + the swap store against fakes for external systems (source-chain RPC, mpcd, destination-chain RPC). Each driver is constructed real but `Run()` is NOT called — `Tick()` calls are deterministic, no goroutines, no time.Sleep races. **4 tests** cover: (1) `HappyPath` — create → deposit → sign → broadcast → completed with `/metrics` assertions on per-stage counters; (2) `SigningCeilingTriggersRefund` — proves the signing-attempts ceiling rolls the swap to refund_pending instead of looping; (3) `StalePendingExpiresToCancelled` — proves auto-expiry cancels abandoned quotes; (4) `MetricsReflectCompositeRun` — runs multiple swaps through different paths concurrently and asserts the per-status gauge + counters compose correctly. Locks in the composition of the 7 shipped changes (hardening trilogy + MPC pool + observability + LP-333 + auto-expiry + LUX proxy + KMS-ready secrets) so future feature work has a regression net for cross-driver bugs. |
| Secret resolution (KMS-ready) | ✅ native — shipped 2026-05-29 | `internal/secrets` package: URI-scheme `Resolver` with built-in `literal:` / `env:NAME` / `file:/path` schemes, plus pluggable `kms:<family>:<opaque>` via `RegisterKMS(family, KMSProvider)` — concrete AWS/Vault/GCP providers land later via import side-effect, the abstraction lands now. Unprefixed values (`--mpc-token=abc123`) keep working as literal for back-compat with every pre-secrets deploy. Wired into `resolveMPCToken` (mpc-token + private mpc-token via `--mpc-token=file:/var/run/secrets/mpc-token` etc.) AND `EnvSecretStore.FetchUtila`/`FetchFireblocks` (env var holds a URI → resolver fetches the actual PEM). 18 resolver unit tests + 5 mpc-token integration tests + 3 cosigner integration tests cover literal/env/file/kms paths + scheme rejection edges (Windows paths, bare IPs) + back-compat. **Empirically validated**: bridge boots cleanly with both `--mpc-token "file:/tmp/mpc-token-file"` and `--mpc-token "env:BRIDGE_SECRET_MPC_TOKEN"`; `/health` reports `mpc_keygen:True`, log line `with_token:true`. Closes the README "Key Management: Secure key storage in KMS" feature — file: covers the K8s secret-mount production pattern today (most common deployment), KMS providers slot in without binary changes. |
| Lux RPC same-origin proxy | ✅ native — shipped 2026-05-29 | `cmd/bridge/rpc_proxy.go` mounts `POST /api/rpc/lux-mainnet` + `POST /api/rpc/lux-testnet` (stateless, forwards POST body verbatim to the configured upstream, returns response 1:1). Workaround for the public Lux gateway's CORS allow-list not including `bridge.lux.network` — wagmi `useBalance()` was stuck on `…` because every cross-origin response from `api.lux.network/ext/bc/C/rpc` was blocked by the browser. Proxying through the bridge backend makes the call same-origin so the SPA sees a normal response. Wagmi-config now points the LUX chain transports at the proxy routes instead of the upstream URLs (`http('/api/rpc/lux-mainnet')` etc.). Configurable via `--lux-rpc-mainnet-url` / `--lux-rpc-testnet-url` (defaults to the public gateway); empty disables the corresponding route so operators who've fixed the upstream allow-list can hit the gateway directly. 5 Go unit tests (body forward + 404 when disabled + 502 on upstream error + status preserved + both routes concurrently mounted). Empirically validated: `curl POST /api/rpc/lux-testnet` returns `{"result":"0x17870"}` (96368 = LUX_TESTNET chainId), mainnet `0x17871` (96369), `eth_getBalance` round-trips cleanly. |
| B-chain LP-333 wiring | ✅ native — wired 2026-05-29 | `internal/bchain.Client` gains `GetSignerSetInfo` + `GetCurrentEpoch` methods (typed wire shapes: `SignerSetInfo{Members, Threshold, Total, Epoch, SignerSetHash, LastRotationAt}`, `CurrentEpoch{Epoch, SignerSetHash, StartedAt}`). REST passthroughs at `/v1/bridge/signer-set` and `/v1/bridge/epoch` (registered only when `--bchain-url` is set). JSON-RPC dispatch at `/v1/bridge/rpc` for `bridge_getSignerSetInfo` + `bridge_getCurrentEpoch`. Back-compat: upstream BridgeVM without LP-333 returns -32601 → bridge returns HTTP 501 (distinguishable from 502 transport failures via the new `rpcErrToHTTP` mapper). Background `BChainPoller` (default 30s cadence, `--bchain-poll-interval` flag) caches the snapshot so `/metrics` scrapes never block on RPC; stale-tolerance preserves last-good Epoch/Threshold/Total when upstream blips. New gauges: `bridge_bchain_reachable`, `bridge_bchain_current_epoch`, `bridge_bchain_signer_set_threshold`, `bridge_bchain_signer_set_size`. 9 unit/integration tests cover REST happy/not-implemented, JSON-RPC dispatch + nil-bchain fallback, poller fetch/stale/run-stop, metrics gauge nil-safe path. Empirically validated against `https://api.lux-test.network` — BridgeVM not deployed there yet → reachable=0 + log emits `stale_for` warning every 15s as designed. Closes the boss's deferred "Hold + refocus: wire to the real LP-333 surface" directive from the original recon. The bridge is now a CONSUMER of b-chain signer-set state; it does NOT vote on rotations (governance is on b-chain). |
| Solana corridor (Sol ↔ EVM bidirectional) | ✅ native — shipped 2026-06-04, baseline-fix 2026-06-08 | **EVM → Sol destination** uses a pure MPC SystemProgram.transfer signed by the ed25519 cluster — no Anchor program required (the `lux-bridge` Anchor program in `standard/programs/` is the alternate Teleporter pattern, off the happy path). Family dispatch lives in `signing_driver.go::PreSignSolana`. **Sol → EVM source** was 90% pre-wired (`internal/depositcheck.checkSOL` + EVM `PreSign` already worked); new code is `useSolanaSend` SPA hook (Phantom path-1 SDK + path-2 direct adapter + path-3 SDK wrapper, with `flushSync` to avoid React losing the connect-listener registration), `tryAutoDeposit` SVM branch, `PreSignSolanaRefund` (mirrors EVM refund). **Sol → Lux testnet refund leg** verified live (`cf0ff38f`). Family-aware sender wiring: `Swap.Sender` is base58 for SVM sources (was breaking the refund driver with `invalid base58 character` when SPA sent EVM hex unconditionally). Sender-family branch lives in `useTransfers::sourceSender`. **2026-06-08 SOL source baseline fix** (`432a817a`): the wallet-pool collision pattern that affected XRP+TON also affected SOL — surfaced live during LUX↔Sol Devnet smoke when a deliberate no-deposit SOL→LUX swap auto-completed and paid 0.268 LUX to user without any SOL arriving. Same fix shape: `CheckParams.SOLBaselineLamports` + `FetchSOLLamports` helper + `Swap.SOLSourceBaselineLamports` snapshot at create + delta-gated `checkSOL` + `executeRefundSolana` cap. 3 SOL tests + regression-guard `TestCheck_XRP_FixUnaffectedBySOLBaselineField`. Live-validated end-to-end: gating proof (`swap_1ef449da8fa47eab` stayed pending 90s with no deposit; pre-fix this auto-completed in ~15s) + happy path (sent 0.005 SOL → delta crossed required → bridge advanced exactly at threshold → 0.13424 LUX delivered as quoted). LUX↔Sol Devnet bidirectional now safely live. |
| TON Testnet corridor (Sepolia ↔ TON bidirectional) | ✅ native — shipped 2026-06-04 | **EVM → TON destination** deploys + transfers in one atomic V4R2 ExternalMessage. Five layers must agree: (1) `internal/mchain/ton_address.go` derives the V4R2 contract address from the ed25519 pubkey base58 (the MPC cluster returns the raw pubkey in the `sol_address` slot — TON shares it); (2) `mchain.Wallet.PubKeyHex` captures the pubkey alongside the address; (3) `Swap.ReleasePubKey` propagates it; (4) `internal/ton/messaging.go::BuildUnsignedTransfer` constructs the payload cell + returns `Cell.Hash()` as the SigningHash (the cluster ed25519-signs the 32-byte cell hash directly, NOT the raw cell bytes — ed25519 wraps its own internal hashing); (5) `internal/ton/provider.go::TonCenterProvider` routes per call by address prefix (`0Q`/`kQ` → testnet.toncenter.com, otherwise mainnet). Broadcast via `broadcast/client.go::broadcastTON` (POST `/sendBoc`). Toncenter's `runGetMethod` against an uninit contract returns `exit_code: -13` + garbage stack — `GetSeqno` checks `exit_code != 0 → return 0` and the wallet ships with StateInit on first deploy. Stale-seqno detection in `broadcast_driver.go` matches `"external message was not accepted"` (chain-stable phrasing, parallels Solana blockhash-not-found). **TON → EVM source** wired symmetrically: `Swap.DepositPubKey` carries the per-swap deposit wallet's ed25519 pubkey; `executeRefundTON` sweeps `balance - 0.05 TON gas reserve` back to the user. SPA: TonConnect manifest served same-origin (mobile must reach the manifest URL on its own network, PNG/JPG icon over HTTPS — see `architecture-ton-connect-manifest`). `useTonSend` pops Tonkeeper for the deposit transfer. First end-to-end successful release: `swap_9644f58db8883efd` 2026-06-04 02:17. Bidirectional confirmed 2026-06-04. |
| BTC corridor (bidirectional) | ✅ source 2026-05-28, destination + source-refund 2026-06-08 | Deposit address derived in-bridge via `internal/mchain/btc_address.go` base58check re-encoder (mpcd still returns mainnet-format `1…`/`3…` P2PKH; bridge swaps version byte 0x00 → 0x6f to produce testnet `m…`/`n…`). SPA balance display via `mempool.space/api/address/<addr>` through `useWalletForBTC`. Backend addressMatchesType validates bech32 + base58. **Destination shipped 2026-06-08** (`f7fb55ff`): `internal/btc/` package implements minimal P2PKH-input spend with BIP-143-style legacy sighash + ECDSA secp256k1 + DER + low-s canon + P2WPKH/P2PKH outputs via bech32 v0 / base58check; `internal/txassembler/btc.go` provides `PreSignBTC` + `FinalizeBTC` + `BTCProvider` interface; `internal/broadcast/btc.go` POSTs raw hex to mempool.space. mpcd Schnorr **NOT needed** for this path — P2WPKH spend uses regular ECDSA; only Taproot (P2TR) outputs would need Schnorr (deferred behind cluster-FROST). signing_driver.go grew an AddressTypeBTC case with `releasePubKeyResolver` fallback for legacy swaps. mchain.go captures `ECDSAPubKey` on AddressTypeBTC keygens. **Source refund shipped 2026-06-08** (`403632a4`): `PreSignBTCRefund` sweeps the largest confirmed UTXO at the deposit wallet back to the user's source-chain BTC address (single-input single-output for now; multi-input consolidation deferred); `executeRefundBTC` in refund_driver mirrors executeRefundXRP. Operator runbook gotcha: mpcd's BTC keygen is **NOT idempotent** — deleting a `release-wallets.json` BTC entry loses the key since mpcd returns fresh entropy on re-keygen. Five live-validated bidirectional corridors against BTC: ETH↔BTC, Lux↔BTC (source only — Lux destination depends on Lux C-Chain being up), Sol↔BTC, XRP↔BTC, TON↔BTC. |
| Storage durability | 🟡 in-memory | Default store is `swap_store.go` (process-local map). `zap_store.go` SQLite backing exists but is not the default — a binary restart drops in-flight swaps. |
| Observability | ✅ native — promoted 2026-05-29 | `/metrics` (Prometheus text exposition) surfaces every hardening counter as a first-class alertable signal: signing/broadcast/refund/deposit-watcher `_total` counters (ticks, attempts, successes, failures, list_errors); refund-specific `terminal_failures_total` + `orphans_recovered_total` (close the visibility loop on the three 2026-05-28/29 hardening passes); signing `stale_total` (quote-age refunds); per-driver `_running` gauges (1/0); `bridge_mpc_keygen_enabled` + `bridge_mpc_pool_split` gauges (operators scrape to confirm `--mpc-private-url` actually applied); `bridge_swaps_by_status` gauge with a stable label set for every SwapStatus (queue-depth alerting on `refund_pending` spikes etc.). Nil-safe — `--disable-*` driver flags emit zeros, not panics. `/health` JSON unchanged for the legacy blob consumers; `/metrics` is the new alerting path. 5 unit tests cover format + per-status counts + nil-safe + pool-split gauge flip. |
| Deployment | 🟡 manifest ready, not yet applied | `k8s/bridge-deployment.yaml` is the production-grade manifest for `ghcr.io/luxfi/bridge:latest` — Deployment + Service + Ingress (`bridge.lux.network` + `bridge-api.lux.network`, cert-manager TLS) + PVC (20Gi for zapdb) + ConfigMap. ConfigMap expanded 2026-05-28 to mainnet chain parity with testnet: **11 networks** (LUX, Ethereum, Arbitrum, Optimism, Base, Polygon, BSC, Avalanche + BTC source-only + SOL/TON gated) and **22 tokens** (ETH + 3 stablecoins on Ethereum; ETH + USDC on each L2; native + USDC + USDT on Polygon/BSC; native + USDC on Avalanche; BTC on Bitcoin). `.github/workflows/docker.yml` already builds + pushes the image. Both `compose.testnet.yml` and `compose.mainnet.yml` ship a `bridge-go` service. **2026-06-01 added `BRIDGE_ENV=local` sandbox tier** with Lux Local (chainId 31337) + Zoo Local (chainId 200203); five layers agree (mchain AddressType, tokens registry, wagmi chains, SPA env split, networks.local.yaml). **2026-06-03 local HTTPS access** via nip.io reverse proxy (e.g. `spa.37-60-239-229.nip.io`) — works around Phantom/Tonkeeper's silent connect() hang on `http://<public-ip-or-domain>` (most wallets only allow popups for HTTPS or `localhost`). **Outstanding gating items are operator-side**: Secret creation, cluster apply, DNS cutover, mainnet release wallet funding. |

### 13.2 Tech stack

- **HTTP framework**: `github.com/hanzoai/zip` (Sinatra-style on Fiber v3 / fasthttp). New handlers must use `zip.Ctx`; do not introduce stdlib `net/http` handlers on the request path.
- **Logging**: `github.com/luxfi/log` (`luxlog`). No `slog`, no direct `zap`.
- **Storage**: Hanzo Base (SQLite-embedded via `zap_store.go`) is the target backing; today the default is the in-memory map in `swap_store.go`.
- **MPC**: HTTP calls to `mpcd`. The cluster enforces 2-of-3 threshold and is authenticated via bearer token (`--mpc-token`) — for local dev the token can be derived from a node identity file via `SHA-256(seed ‖ "mpc-internal-api")`.
- **Pricing**: CoinGecko `simple/price` API with 30 s TTL cache + single-flight batched fetches. `FallbackFeed` composite falls through to a static feed for assets CoinGecko does not list (LUX, ZOO).

### 13.3 Architectural conventions

- **Deposit wallet vs release wallet split.** Per-swap MPC wallets receive deposits; one long-lived release wallet per destination network pays out settlements from operator-funded liquidity. Refunds flow back from the deposit wallet, not the release wallet.
- **MPC-only, no teleporter.** Every swap goes through `createMPCWalletForDeposit`; the legacy teleporter contracts in `teleport.ts` are off the happy path on this branch.
- **Quote locked at create time.** `Swap.ReceiveAmount` is stamped on the row when the user creates the swap, then enforced at signing time via `--quote-max-age`. Stale quotes never execute at the new price; they refund.

### 13.4 Configuration surface (selected flags)

| Flag | Purpose |
|---|---|
| `--config` | Networks/tokens/limits YAML path. |
| `--backend` | Legacy Node backend URL for the still-proxied paths (`/explorer/*`, `/settings`). |
| `--mpc-url` | `mpcd` keygen + sign endpoint for the **public** cluster (m-chain). Required when SDK requests carry `use_deposit_address=true`. Used for per-swap deposit-wallet keygen and refund signing. Single-cluster deploys leave `--mpc-private-url` empty and this URL serves both roles. |
| `--mpc-token` / `--mpc-identity-file` / `--mpc-org-id` | Bearer auth + tenant ID for the public cluster. The token value passes through `internal/secrets.Resolver` so any registered URI scheme works: `literal:abc` (or bare value — back-compat), `env:NAME`, `file:/var/run/secrets/mpc-token`, `kms:aws:cipher:<base64>` (when AWS KMS provider imported). Identity file derives the token deterministically — convenience for local dev; prod sets the token explicitly. These also serve the private cluster unless overridden. |
| `--mpc-private-url` | `mpcd` endpoint for the **private** treasury cluster. When set, release-wallet keygen + settlement signing route here instead of `--mpc-url`. Smaller-quorum cluster holding operator-funded liquidity. Empty (default) = single-cluster mode. |
| `--mpc-private-token` / `--mpc-private-identity-file` / `--mpc-private-org-id` | Per-cluster overrides for the private cluster's auth + tenant ID. Each falls back to the public-cluster value when empty. |
| `--bchain-url` | BridgeVM (b-chain) JSON-RPC base URL. When set, enables native `/v1/bridge/info`, `/v1/bridge/signer-set`, `/v1/bridge/epoch` handlers + the LP-333 background poller for `/metrics`. Empty leaves the legacy reverse proxy on those routes. |
| `--bchain-poll-interval` | Cadence at which the LP-333 background poller refreshes the cached signer-set + epoch snapshot. Default 30s. Never blocks `/metrics` scrapes — the cache surfaces stale-but-believable last-good values when b-chain blips, and `bridge_bchain_reachable` flips to 0. |
| `--deposit-expire-after` | Max age of a `user_deposit_pending` swap before the deposit watcher auto-cancels it (the create-time deposit address was never funded). Default 24h. Zero disables (legacy "keep pending forever"). Closes the final hardening-matrix gap so the store can't fill up with abandoned swap intents. |
| `--lux-rpc-mainnet-url` / `--lux-rpc-testnet-url` / `--lux-rpc-timeout` | Upstream URLs + per-request timeout for the `/api/rpc/lux-{mainnet,testnet}` same-origin proxy. Defaults to the public Lux gateway URLs; the SPA's wagmi posts to the same-origin routes to dodge the gateway's CORS allow-list. Empty disables the corresponding route. |
| `--source-rpc-overrides` | Per-network RPC overrides for the deposit watcher and `/v1/bridge/check-deposit` (e.g. `ETHEREUM_SEPOLIA=https://ethereum-sepolia-rpc.publicnode.com`). |
| `--coingecko` (+ `--coingecko-api-key`, `--coingecko-cache-ttl`, `--coingecko-timeout`) | Layer CoinGecko in front of the static feed. Default off. |
| `--quote-max-age` | Max age (default 30 m) of a create-time quote before the signing driver refuses to sign and hands off to the refund driver. Zero disables — only safe for stablecoin-only deployments. |
| `--disable-deposit-watcher` / `--disable-signing-driver` | Disable background loops (testing / manual operation). |

### 13.5 Current testnet scope (updated 2026-06-11)

`cmd/bridge/networks.testnet.yaml` ships **13 networks** — 10 EVM + 3 non-EVM (BTC source-only, SOL + TON now fully enabled):

| Network | Type | Native | ERC-20s | Status |
|---|---|---|---|---|
| `ETHEREUM_SEPOLIA` | evm | ETH | USDC | ✅ full |
| `LUX_TESTNET` | evm | LUX | — | ✅ full |
| `ZOO_TESTNET` | evm | ZOO | — | 🟡 wired + **chain LIVE, RPC path fixed 2026-06-10**. The earlier "blocked on chain liveness" was a **wrong-path bug**: the bridge used `/ext/bc/Z/rpc` (the z-chain on the primary network, 404) instead of the real Zoo EVM chain at **`/ext/bc/zoo/rpc`** — both chains are live + producing blocks (mainnet `eth_chainId` 0x30e08=200200, testnet 0x30e09=200201, matching the wiring). Fixed the path in 6 files (`internal/{txassembler,broadcast,depositcheck}`, `cmd/bridge/main.go` flag defaults, wagmi-config.ts, legacy mpc-wallet.ts); bridge now reaches Zoo (proxy → 0x30e08; LUX→ZOO quote works). **Deploy gap:** the `de3a912a` go-live image predates the fix (old path baked in) → needs a rebuilt image (or `--zoo-rpc-*-url` + `--source-rpc-overrides` stopgap), and the k8s `lux-bridge-config` ConfigMap is still missing ZOO (must mirror `networks.mainnet.yaml`). Zoo MAINNET is brand-new (~799 blocks) — confirm before routing real value. **Smoke-validated on-chain both directions 2026-06-11** (LUX→ZOO `swap_63400d97…` → 49.5 ZOO, dest tx `0xb3b44eed…`; ZOO→LUX `swap_af31765d…` → 0.99 LUX, dest tx `0x5cbd0eb8…`) through the real ECDSA cluster — artifacts committed: `docs/smoke-zoo-lux-testnet.md` (`974827d5`) + UI GIF `app/server/result-img/lux-zoo-test.gif` (`09442736`). During the GIF recording a ~9h-old ZOO release wallet went unsignable (`sign HTTP 504`) on the live cluster with no node restart while a fresh wallet signed fine — a test-env threshold-share desync, not a Zoo bug; the real deploy must verify cluster share persistence (memory `project_mpc_threshold_stale_shares.md`). |
| `BASE_SEPOLIA` | evm | ETH | USDC | ✅ full |
| `HOLESKY_TESTNET` | evm | ETH | — | ✅ full |
| `ARBITRUM_SEPOLIA` | evm | ETH | USDC | ✅ full (added 2026-05-28) |
| `OPTIMISM_SEPOLIA` | evm | ETH | USDC | ✅ full (added 2026-05-28) |
| `POLYGON_AMOY` | evm | POL | USDC | ✅ full (added 2026-05-28) |
| `BSC_TESTNET` | evm | BNB | — | ✅ full (added 2026-05-28) |
| `AVALANCHE_FUJI` | evm | AVAX | USDC | ✅ full (added 2026-05-28) |
| `BITCOIN_TESTNET` | bitcoin | BTC | — | ✅ **bidirectional** (source 2026-05-28, destination + source-refund 2026-06-08). Bridge re-encodes mpcd's mainnet-format P2PKH to testnet via base58check version-byte swap. SPA balance via mempool.space. **Destination uses regular secp256k1 ECDSA + BIP-143-style legacy sighash for P2PKH inputs + P2WPKH/P2PKH outputs** — no Schnorr needed (P2TR deferred). Broadcast via mempool.space `/tx`. Source refund sweeps deposit UTXOs back via `executeRefundBTC`. Live-validated against ETH/Sol/XRP/TON sources; first ETH→BTC settlement `swap_a4273c7c07760daa` → btc tx `bf270f76…506f6578`. |
| `SOLANA_DEVNET` | solana | SOL | — | ✅ bidirectional (shipped 2026-06-04, baseline-fix 2026-06-08). Sol → EVM source via Phantom auto-deposit. EVM → Sol destination via pure MPC SystemProgram.transfer (ed25519 cluster, no Anchor program). Sol → Lux testnet refund leg verified. Family routing in `mpc-router` is required (`solana_*`/`sol_*` → eddsa cluster). **2026-06-08 evening:** Sol↔BTC + Sol↔LUX bidirectional live-validated, **SOL source baseline fix shipped** (`432a817a`) — the third instance of the wallet-pool collision pattern (after XRP and TON). mpcd-single's HKDF ed25519 keygen returns the same pubkey for per-swap deposit + long-lived release wallets, so `checkSOL` was auto-confirming swaps the user never funded and `executeRefundSolana` would have over-swept release-wallet liquidity. Now snapshots lamports at create + caps refund at delta. Validated by deliberate no-deposit smoke that previously paid 0.268 LUX to the user without any SOL arriving. |
| `TON_TESTNET` | ton | TON | — | ✅ bidirectional (shipped 2026-06-04). Sepolia ↔ TON Testnet end-to-end. V4R2 contract deploy + transfer, ed25519 cell-hash sign, BoC broadcast via toncenter. TonConnect/Tonkeeper wallet adapter. Family routing in `mpc-router` is required (`ton_*`/`-ton-*` → eddsa cluster). First successful release tx: `swap_9644f58db8883efd`. **2026-06-08:** TON↔BTC bidirectional live-validated; source baseline fix shipped (`a489f5df`) to gate deposit detection + cap refund (mpcd's TON keygen reuses the long-lived release wallet's V4R2 contract address for per-swap deposits — fixed via per-swap balance snapshot, mirror of the XRP fix). |
| `XRP_TESTNET` | xrp | XRP | — | ✅ bidirectional (shipped pre-2026-06-08, mainnet rollout 2026-06-05). XRPL Payment + ed25519 sign + altnet broadcast. Source path uses pytoniq-style ed25519 in tests; bridge signs via mpcd-single. **2026-06-08:** XRP↔BTC bidirectional live-validated; source baseline fix shipped (`c4b21b38`) — mpcd's XRPL keygen reuses the long-lived release wallet's r-address, depositcheck was auto-confirming swaps + refund driver swept ~96 XRP of bridge liquidity to a user before the fix landed. Now snapshots drops at create and gates on `(current − baseline) ≥ required`; refund capped to the same delta. |

End-to-end signed swaps verified for: Sepolia ↔ LUX, Sepolia ↔ Solana Devnet, Sepolia ↔ TON Testnet, and (2026-06-08) **BTC testnet3 ↔ {ETH Sepolia, Lux Testnet, Sol Devnet, XRP Testnet, TON Testnet} bidirectional** (Lux destination depends on Lux C-Chain being up). Plus (2026-06-08..06-10) the **LUX cross-family matrix is now 4/4 bidirectional** post-C-Chain-restore — **LUX Testnet ↔ {Sepolia ETH, Sol Devnet, XRP Testnet, TON Testnet}** (artifacts `a5a20160`, `a8550c0a`, `313ba1d4`, `f0f0ad25`; the TON one is commit **local-only**, see §13.7 G8). No new code in the LUX validations — LUX-as-EVM source/dest is a known-good fixed point, so any cross-family LUX failure is in the other family. The one untested LUX combination is **USDC↔LUX** (exercises the ERC-20 destination fix `c9a62113` on the LUX corridor). The 5 EVM chains added 2026-05-28 all return correct CoinGecko-backed quotes and create swaps with valid MPC deposit addresses. The R7-era "BTC source-only pending mpcd Schnorr" gap is closed — turns out P2WPKH/P2PKH outputs need only regular ECDSA (no Schnorr); see §13.1 BTC corridor row + G1 update.

**New `BRIDGE_ENV=local` sandbox tier (2026-06-01)** ships `cmd/bridge/networks.local.yaml` with **Lux Local (chainId 31337)** + **Zoo Local (chainId 200203)** for hermetic dev against locally-running L1 nodes (no testnet faucet dependency). Five layers must agree: `mchain.AddressType`, `internal/tokens` registry, wagmi-config chains, SPA env split (`BRIDGE_ENV=local` flag), `networks.local.yaml`.

Reconciliation with `app/bridge/TESTNET-E2E.md` §2 is now complete for the EVM + Solana + TON + XRP + BTC corridors (2026-06-08). No remaining non-EVM corridor gap.

### 13.6 Cutover plan

| # | Step | Acceptance |
|---|---|---|
| 1 | EVM↔EVM hardening | 🟡 partial — Sepolia ↔ LUX both senses verified (2026-05-28 + later). Remaining matrix: Sepolia↔Base Sepolia, Sepolia↔Holesky, Base Sepolia↔LUX, Holesky↔LUX, plus the 5 chains added 2026-05-28 (Arbitrum Sepolia, Optimism Sepolia, Polygon Amoy, BSC Testnet, Avalanche Fuji) need their first end-to-end signed swap. |
| 2 | Persistence default | ✅ done — every real deploy sets `BRIDGE_DATA_DIR` (compose.testnet.yml, compose.mainnet.yml mount `bridge-go-data`; `k8s/bridge-deployment.yaml` mounts a 20Gi RWO PVC pinned to `replicas: 1` with `Recreate` strategy because zapdb takes an exclusive dir lock). The binary still ships in-memory as the no-flag default for dev ergonomics + logs a `Warn` when that path is taken; production never hits it. |
| 3 | ERC-20 path | 🟡 partial — `internal/tokens/tokens.go` registry, `internal/depositcheck` ERC-20 `balanceOf` probe, and `internal/txassembler` ERC-20 `transfer(addr,uint256)` calldata mode were already implemented and unit-tested before this revision; on 2026-05-28 USDC entries were exposed in `networks.testnet.yaml` for ETHEREUM_SEPOLIA (Circle contract `0x1c7D…7238`) and BASE_SEPOLIA (`0x036C…CF7e`) so the SPA picker offers them. Quote pricing verified for both source (`10 USDC → 3.998 LUX`) and destination (`10 LUX → 24.76 USDC`) roles. Live end-to-end deposit + signed release with USDC on either chain is still pending — needs a real on-chain USDC deposit to close. |
| 4 | Compose wiring | ✅ done — both `compose.testnet.yml` and `compose.mainnet.yml` ship a `bridge-go` service alongside the legacy `bridge-server` / `bridge-ui` stack (2026-05-28). Testnet mounts `cmd/bridge/networks.testnet.yaml`; mainnet mounts `cmd/bridge/networks.mainnet.yaml` (extracted from the k8s ConfigMap, kept in sync). Mainnet uses bind-mounted `/mnt/ssd/bridge/bridge-go` for zapdb persistence (same pattern as mpc-data + postgres-data) and production deploy resources (4 CPU / 8GB limits, 2 CPU / 4GB reservations). K8s side (`k8s/bridge-deployment.yaml`) was already complete and now matches the chain set in both compose files. |
| 5 | DNS cutover | ⬜ pending — operator handoff. Required steps: (1) populate `bridge-secrets` Secret in `lux-bridge` namespace with `mpc-api-token` etc., (2) `kubectl apply -f k8s/bridge-deployment.yaml`, (3) repoint `bridge.lux.network` + `bridge-api.lux.network` DNS A-records to cluster LB after ingress cert is issued, (4) fund per-destination-network release wallets after first swap auto-mints each. See `docs/operator-deploy-phase-1-4.md` (pending). After 1-week soak, retire `bridge-server` + `bridge-ui` images. |
| 6 | Non-EVM (Solana, BTC, TON, XRP) | ✅ **bidirectional across all four** as of 2026-06-08. **Solana** + **TON Testnet** + **XRP Testnet** bidirectional 2026-06-04..2026-06-05 via `mpcd-single` (HKDF per-wallet ed25519) behind family-routed `mpc-router`; production threshold ed25519 deferred to the cluster-FROST epic. **BTC bidirectional** shipped 2026-06-08 — destination via `internal/btc/` + `txassembler.PreSignBTC`/`FinalizeBTC` + ECDSA secp256k1 (no Schnorr needed for P2WPKH/P2PKH; Taproot deferred), source-refund via `executeRefundBTC` (UTXO sweep with single-input single-output). XRP + TON source-baseline fixes shipped 2026-06-08 close the shared-address-pool exploit window in those depositcheck paths + cap the refund driver. Cross-family validated: BTC↔{ETH, Lux, Sol, XRP, TON} all end-to-end live this session. `internal/txassembler/{btc,ton,xrp}.go`, `internal/{btc,ton,xrp}/{…}`, `cmd/bridge/refund_driver.go::executeRefund{BTC,TON,XRP}`, and the SOL counterparts all shipped — cluster-FROST mpcd cutover when it lands is just a router-route flip for SOL/TON/XRP; BTC stays on ECDSA. |

### 13.7 Known gaps

| # | Gap | Impact |
|---|---|---|
| G1 | Non-EVM status (updated 2026-06-08 evening): (a) ~~`broadcast/client.go` returns `ErrFamilyNotImplemented` for every non-EVM chain family~~ **fixed** — Solana + TON + XRP + **BTC** broadcast paths shipped; only DOT still pending; (b) ~~signature parsing assumes ECDSA `R∥S∥V`~~ **fixed** — signing driver dispatches by destination family, ed25519 path produces raw 64-byte sigs; (c) ~~mpcd keygen returns `"no sol address"`~~ **worked around** — `mpc-router` dispatches ed25519 walletIDs to `mpcd-single` (HKDF per-wallet derivation); cluster-FROST mpcd parked as a separate epic; (d) ~~BTC mainnet-format address~~ **fixed 2026-05-28**; (e) ~~BTC withdrawal blocked on mpcd Schnorr + BTC tx assembler~~ **fixed 2026-06-08** — turns out P2WPKH/P2PKH outputs need only regular ECDSA (no Schnorr); shipped `internal/btc/` package + assembler + ECDSA sign path + mempool.space broadcast (commit `f7fb55ff`). P2TR (Taproot) outputs still need Schnorr, deferred behind cluster-FROST. (f) ~~BTC source refund missing~~ **fixed 2026-06-08** — `executeRefundBTC` shipped (commit `403632a4`). (g) **Closed 2026-06-08: XRP + TON + SOL deposit wallet shares its address with the long-lived release wallet** — mpcd-single's HKDF ed25519 keygen returns the same pubkey for the per-swap deposit wallet and the long-lived release wallet within each family (the family-level address is effectively shared). Same shape across all three ed25519 families: `depositcheck.check{XRP,TON,SOL}` was auto-confirming swaps the user never funded; `executeRefund{XRP,TON,Solana}` was sweeping the operator's standing release-wallet liquidity back to the user. **96 XRP over-refund and 0.268 LUX free-mint both observed live** during smoke testing (LUX returned, XRP not recoverable on the testnet that ran in a prior session). Fixed strictly additively with per-family baseline snapshot at create + delta-gated check + refund-amount cap. Three regression-guard tests confirm each family's fix doesn't interfere with the other two. Commits `c4b21b38` (XRP), `a489f5df` (TON), `432a817a` (SOL). When a NEW ed25519 family is added (e.g. Sui, Aptos), ship the same baseline-snapshot + refund-cap pair in the same PR — assume the wallet-pool collision is the default until proven otherwise. (h) **Closed 2026-06-08: ERC-20 destination silently sent native ETH** — `signing_driver.go::AddressTypeETH` case was the only family branch not passing `DestinationAsset` to `txassembler.PreSign`. Without it, the assembler's `tokens.Registry.Lookup` returned nil, fell through to native-ETH mode, sent `value=amount*10^18 wei` directly to the user instead of calling `transfer(addr,uint256)` on the token contract. Latent for the entire history of ERC-20 destination support. Single-line fix `c9a62113`; native-ETH path unchanged. | All non-EVM bidirectional corridors live as of 2026-06-08, with all three ed25519 families now baseline-gated against the shared-pool collision. SOL/TON/XRP using mpcd-single single-signer custody behind mpc-router; BTC using real mpcd (ECDSA); threshold custody for the ed25519 chains is the cluster-FROST epic, tracked separately. |
| G2 | ERC-20 coverage on testnet (closed 2026-05-28). | USDC wired for 5 chains (Sepolia, Base Sepolia, Arbitrum Sepolia, Optimism Sepolia, Polygon Amoy, Avalanche Fuji) — Circle's canonical testnet contracts in both the YAML registry and `internal/tokens/tokens.go`. Quote + swap-create + deposit-watch + tx-assembly all wired. USDT / DAI on testnet still missing (no Circle-equivalent for those on most testnets). |
| G3 | `cmd/bridge` is referenced from both `compose.testnet.yml` and `compose.mainnet.yml` (2026-05-28). K8s manifest `k8s/bridge-deployment.yaml` is complete but not yet applied. | DNS cutover and Secret population are the remaining operator-side steps. |
| G4 | Default store is in-memory (`swap_store.go`) when `--data-dir` is unset. | Dev-only — every production deploy sets `BRIDGE_DATA_DIR` via env (verified in compose.testnet.yml, compose.mainnet.yml, k8s/bridge-deployment.yaml). Binary logs `Warn` when in-memory mode is taken so accidental prod misconfig is visible. |
| G5 | `app/bridge/TESTNET-E2E.md` Phase 1.3 sign-off runs against `bridge-api.lux.network` (Express). | Closing Phase 1.3 does not automatically validate the Go binary; the Go binary needs its own sign-off doc. |
| G6 | Wallet popups require HTTPS or `localhost` — Phantom, Tonkeeper, MetaMask all silently hang `connect()` on `http://<public-ip-or-domain>`. | Mitigated 2026-06-03 by serving local dev over HTTPS via nip.io reverse proxy (e.g. `spa.37-60-239-229.nip.io`); production already HTTPS via cert-manager. Any new dev environment that demos to a real wallet must use HTTPS or localhost — not a raw IP. |
| G7 | **Binary productionized 2026-06-10** — `mpc-router` moved from the smoke-test `/tmp/mpc-router.go` into `cmd/mpc-router/` (`main.go` + `main_test.go`, 6 tests) with a `/healthz` liveness endpoint, backend bearer tokens resolved through `internal/secrets` (`literal:`/`env:`/`file:`/`kms:`; unprefixed = literal for back-compat), a startup banner, and a multi-stage `cmd/mpc-router/Dockerfile` (golang-alpine → distroless, `EXPOSE 9700`, builds `ghcr.io/luxfi/mpc-router`). `familyFor` kept byte-for-byte in sync with `cmd/mpcd-single`. Verified: build + vet + tests green, plus a live run proving `/healthz` and correct family dispatch (Solana/TON → eddsa no-auth, EVM/BTC → ecdsa with resolved bearer). **Remaining = deployment wiring (operator step, intentionally not applied to the working prod manifests blind).** Today the deployed bridge points `BRIDGE_MPC_URL` straight at the real cluster (`http://mpc-node-0:6000`, ECDSA/EVM+BTC only); enabling the ed25519 corridors on a real deploy requires: (1) deploy `mpcd-single` (container + master seed via a `kms:`/`file:` secrets URI), (2) deploy `mpc-router` with `--eddsa-url=http://mpcd-single:9900 --ecdsa-url=http://mpc-node-0:6000 --ecdsa-token=<secrets-uri>`, (3) repoint the bridge `BRIDGE_MPC_URL` (and `BRIDGE_MPC_PRIVATE_URL` if split-pool) at `http://mpc-router:9700`, (4) add a `/healthz` probe. This wiring is gated on the custody decision (mpcd-single single-signer vs cluster-FROST) and on `mpcd-single` itself being deployed — both tracked separately — so it is documented rather than committed into `compose.{testnet,mainnet}.yml` / `k8s/` until an operator enables SOL/TON on a real environment. **Full runnable go-live checklist (build/push, master-seed Secret, both Deployments+Services inline, bridge repoint, G8 no-deposit verification, release-wallet funding, rollback, sign-off): `docs/operator-deploy-ed25519.md`.** `cmd/mpcd-single/Dockerfile` added alongside `cmd/mpc-router/Dockerfile` so both ed25519 images are buildable (both validated: `docker build` + container `/healthz`). |
| G8 | **Upstream `whispers/bridgev2` was force-pushed to a PR-#393 baseline that dropped the ed25519 source baseline gate (2026-06-10).** The new canonical branch integrated the multi-family release pool + BTC/SOL/XRP/TON/DOT broadcasters, but `internal/depositcheck/client.go::check{SOL,TON}` do plain `balance ≥ required` with **no `*Baseline*` field** — the delta-gated check from `c4b21b38`/`a489f5df`/`432a817a` (G1(g)) is absent. Deposit + release wallets derive via the same `KeygenForDeposit → bridge-<net>-<UnixMilli>` (`swaps_handler.go` + `release_pool.go:375`), so under **mpcd-single** (one ed25519 address per family → deposit==release) it is **live-exploitable** exactly as G1(g) was; under a real per-wallet_id cluster the structural collision is gone and it degrades to a latent defense-in-depth gap. The Explore agent's "same-millisecond keygen race" is a narrow secondary window, not the primary risk. | The session's baseline fixes live only on the **divergent local branch** (845 vs 309 commits since merge-base `17739e9c`); per owner decision the local work was **not** pushed and the remote was left untouched. Remediation = port the additive 6-step fix (CheckParams baseline fields → delta-gated check → Swap snapshot field → watcher threading → refund cap → per-family tests) onto the #393 file shapes. Full write-up `/tmp/security-393-baseline-finding.md`; memory `project_bridgev2_393_forcepush_baseline_gap.md`. |

### 13.7.1 BTC corridor — deferred follow-ups (2026-06-08)

Captured at the close of the BTC bidirectional smoke. None of these block the corridor; all of them are operator-workable or low-information for now. Listed in roughly the order they would likely become production-relevant:

| Item | Why it can wait | When it bites |
|---|---|---|
| **Multi-input UTXO consolidation** in `txassembler.PreSignBTC` / `PreSignBTCRefund` (current code picks the LARGEST single UTXO; doesn't combine across multiple smaller ones in a single tx) | Operator-workable with funding discipline — topping up release wallets with single large UTXOs that dominate any subsequent change UTXOs avoids the issue entirely. | High swap volume, unattended operation, or missed top-up windows. Surfaced live twice during the 2026-06-08 smoke (LUX→BTC retry and the first BTC→USDC attempt) before manual top-ups cleared it. |
| ~~RBF / stale-tx rebuild for BTC release in `broadcast_driver`~~ **Closed 2026-07-21 (commit `61d53055`)** — `handleStaleBTCFee` resets + re-signs on a node fee-reject (min relay / mempool-min fee, or a losing RBF bump); `handleBTCConfirmTimeout` rebuilds at a bumped feerate (`bumpBTCFeeRate`, +25%+1) if a release sits unconfirmed past 30min. Both are valid BIP-125 replacements (`nSequence=0xfffffffd`). | N/A — closed proactively, not in response to an incident. | N/A — a new `SwapStatusAwaitingConfirmation` state also means mempool-acceptance is no longer treated as final completion, closing the adjacent premature-`Completed` gap in the same change. |
| **Other EVM chains × BTC** (Base Sepolia, Arbitrum Sepolia, Optimism Sepolia, Holesky, BSC Testnet, Avalanche Fuji × BTC testnet3) | Same EVM code path as Sepolia. The 2026-05-28 chain expansion verified each chain's quote engine + deposit address minting; the only thing left to validate per-chain is the on-chain settlement, which exercises the same `txassembler.PreSign` + `broadcastEVM` codepaths as Sepolia. Low information per smoke. | Could surface a chain-specific gas-pricing quirk (BSC, Avalanche), nonstandard RPC field (Polygon), or finality-window edge case (Optimism). Worth a sweep before mainnet but not for code-validity. |
| **P2TR (Taproot) outputs + inputs** in `internal/btc/` | Deferred behind the cluster-FROST epic (task #112). P2WPKH/P2PKH already covers ~95% of real BTC user wallets today. | When a user's destination address is a `bc1p…` Taproot address. `addressMatchesType` would reject it at swap-create today (acceptable — no silent failure). |
| **BTC mainnet smoke** | Operator-side dependency: needs real BTC funding for the release wallet + DNS cutover + K8s manifest apply + Secret population. Same gating chain as G3. | When mainnet cutover is scheduled. The code path is identical to testnet3 (mempool.space `/api/...` route family); the only mainnet-specific concern is fee-market volatility (which is the RBF item above) and address-prefix validation (`1`/`3`/`bc1`, which is already wired). |
| **BTC operator runbook + `bridge_btc_*` Prometheus metrics** | Production polish. XRP got a dedicated runbook section in #150 and mainnet metrics in #151. BTC didn't get the same treatment yet. **Partially closed 2026-07-22:** the "release-wallet health" slice is now covered generically (not BTC-only) by `WalletHealthPoller` (`cmd/bridge/wallet_health_poller.go`) — `bridge_release_wallet_signable{network="..."}` + `_sign_latency_ms` + `_last_check_age_seconds` on `/metrics`, documented in `docs/operator-runbook.md` §6 Metrics. Motivated by the 2026-06-11 ZOO share-desync incident (a release wallet went unsignable hours after keygen with no restart) — the poller runs a harmless canary sign against every minted release wallet on a timer and would have caught that proactively. **Alerting wired 2026-07-23:** `k8s/bridge-alerts.yaml` (`PrometheusRule`, `kubectl apply -f k8s/bridge-alerts.yaml`) — `BridgeReleaseWalletUnsignable` (critical), `BridgeReleaseWalletHealthCheckStale`, `BridgeWalletHealthPollerDown` (both warning). Defines when to alert, not where it routes — Alertmanager notification config is cluster-level and outside this repo. **BTC confirmation-gate metrics wired 2026-07-25:** `bridge_btc_confirm_checks_total` + `bridge_btc_confirm_timeouts_total` promoted from `BroadcastDriverStats` (tracked internally since commit `61d53055`, never reached `/metrics` until now) — surfaces `SwapStatusAwaitingConfirmation` polling + RBF-rebuild-on-timeout activity per the confirmation gate. Still open: mempool.space request latency specifically. | When ops is actively monitoring mempool.space latency specifically. Useful for catching upstream API degradation before it delays confirmation checks. |

These items are **not blockers for closing BTC testnet3 as a validated corridor** — they're hardening, observability, and ergonomics work for mainnet readiness. Track here so a future operator (or future me) doesn't rediscover them.

### 13.8 Open questions for sponsor

1. Is the Go binary expected to replace `app/server/` *entirely*, or only the heavy paths (swap / quote / MPC) while Express continues to host explorer + settings + auth long-term?
2. Acceptance bar for the testnet soak in §13.6 step 4 — number of completed swaps, span in days, failure-rate ceiling.
3. Mainnet cutover timing: tied to a specific Phase 3 milestone (e.g. SDK publication), or independent?
4. Does §3 Non-Goals ("Rewriting `app/server/` routes, schema, or Prisma layer beyond what's needed for chain rewiring") need to be relaxed for R6, given the Go binary's swap-store / quote-engine / driver-loop ports overlap with `app/server/` routes by design?

---

*End of document. Edit history is tracked via git.*
