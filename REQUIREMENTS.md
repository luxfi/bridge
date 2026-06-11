# Lux Bridge — Project Requirements

| Field | Value |
|---|---|
| Repository | `github.com/luxfi/bridge` |
| Owner | Lux Industries, Inc. |
| Author of doc | Jackson Mori |
| Date | 2026-05-22 |
| Status | Draft for review (R5 — refresh after R3 merge into `whispers/bridgev2`) |
| Supersedes | R4 (pre-merge dep layout + pre-doc-cleanup; treated R3 client-side MPC as pending). R5 re-pins against `pkg/bridge` v1.0.3 + the now-merged client-side MPC / cosigner stack, and reflects the deletion of the legacy `docs/*.md` set. |

---

## 1. Background & Context

`bridge.lux.network` is Lux's cross-chain bridge UI. Historically it was a monolithic frontend bound to an older JavaScript API + standalone MPC service. Both have been replaced:

- The **API backend** is `app/server/` (Express + Prisma) and is live at `api.bridge.lux.network`. It also holds the cosigner glue (`src/domain/cosigners.ts`) that talks to external custodians (Utila, Fireblocks) on behalf of tenants — secret material never leaves the server.
- The **MPC layer** is provided by `pkg/threshold/` (`@luxfi/threshold` SDK), deployed in two modes:
  - **Private MPC** — Lux treasury cluster, collects fees. Config under `config/mpc/config.yaml`.
  - **Public MPC** — `m-chain`, validator-powered, permissionless, deployed via `k8s/mpc-deployment.yaml`.
- The **frontend** is packaged as a publishable white-label SDK `@luxfi/bridge` (`pkg/bridge/`). The bridge UI is **inlined** under `pkg/bridge/src/app/` — there is no longer a workspace `@luxbridge/app-v3` dependency. Tenants consume the SDK from a thin host shell plus their own brand package; the Lux tenant is the only one shipped from this repo. Foreign-brand tenants live in their own repos (e.g., a Zoo shim in `zooai/bridge-shim`).

This document is the authoritative project requirements set. There is no `requirements.txt` working-notes file in the repo (none has existed in git history); REQUIREMENTS.md is the canonical record.

## 2. Goals

1. Keep `bridge.lux.network` up, backed by `app/server/` (talking to b-chain) and `@luxfi/threshold` MPC (m-chain + private cluster).
2. Ship `@luxfi/bridge` v1.x as a publicly-installable npm package that any host can embed, with brand + config injected at mount time.
3. Provide the canonical Lux reference tenant consuming the SDK: `github.com/luxfi/bridge` (`app/bridge/` → `@luxbridge/lux-tenant`). Foreign-brand tenant repos are out of scope for this codebase.
4. Embed the bridge inside `luxfi/exchange` using the same SDK.

## 3. Non-Goals

The following are **explicitly out of scope** for this initiative and must not creep in:

- Rewriting `app/server/` routes, schema, or Prisma layer beyond what's needed for chain rewiring.
- Building new branding configs *before* data flow from b-chain to UI is proven end-to-end.
- Foreign-brand tenant builds — those live in their own repos, never in this codebase.
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
| Bridge API server (b-chain backend) | Live | `app/server/` |
| Public MPC (m-chain) | Live | `pkg/threshold/` SDK + `k8s/mpc-deployment.yaml` |
| Private MPC (treasury fees) | Live | same code, separate cluster, `config/mpc/config.yaml` |
| r-chain relay (optional helper) | Live (in repo) | `app/server/cmd/`, hooks |
| o-chain oracle (optional helper) | Live (in repo) | upstream `github.com/luxfi/bridge` |
| `@luxfi/bridge` SDK (`pkg/bridge/`) | **v1.0.3** on `whispers/bridgev2`. UI inlined; **client-side MPC session merged**; declarative cosigner blocks (`utila`, `fireblocks`) exposed via `BridgeMPCConfig`. | This repo |
| Server-side cosigner glue | **Merged** — `app/server/src/domain/cosigners.ts` + Fireblocks/native tests. End-to-end soak against a real Utila/Fireblocks tenant still pending. | `app/server/` |
| Lux tenant app (`app/bridge/`) | `@luxbridge/lux-tenant` v1.0.0 — thin shell | This repo |
| Zoo tenant app | Pending — needs new tenant repo (see §10) | TBD |
| White-label tenant backend wire-up | Later | After Lux/Zoo tenants ship |

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
| 1.3 | Run the SDK end-to-end against Lux testnet. | 🟡 — verify on current branch before mainnet cutover. |
| 1.4 | Deploy the Lux tenant app to `bridge.lux.network`. | 🟡 — `app/bridge/` shape is final (`Dockerfile`, `docker-entrypoint.sh`, `__ENV.js` template all merged); deploy pipeline TBC. |
| 1.5 | Refresh / fold the legacy `docs/*.md` (`BRIDGE-STATUS`, `LOCAL-SETUP`, etc.). | ✅ — the loose top-level set was deleted in the merge from main; only `docs/LLM.md` and `docs/LUX-ID-INTEGRATION.md` remain at docs root, and active docs now live under `docs/content/docs/`. |
| 1.6 | Keep `pkg/bridge/README.md` accurate (it was updated through R2/R3). | ✅ — consumer-facing README documents `Bridge`, `mountBridge`, `applyBrandMetadata`, `getConfig`, `setConfig`. |

**Acceptance criteria** (recheck before sign-off):

- A user can reach `bridge.lux.network`, connect a wallet, get a quote on Lux testnet, and complete a bridge transaction signed by an m-chain MPC quorum.
- Internal devs can run `pnpm dev` from `app/bridge/` against local `app/server/` and complete the same flow.
- Treasury fee collection through the private MPC cluster fires on a real transfer.
- `pkg/bridge/README.md` matches the current API surface in §5.3 (including the cosigner block additions from R3).

## 8. Phase 2 — Exchange Embed

**Outcome:** the SDK is consumed unchanged from the Lux exchange host app (`luxfi/exchange` web) and the canonical `app/bridge/` Lux tenant.

**Deliverables**

| # | Task | Notes |
|---|---|---|
| 2.1 | Add an `@luxfi/bridge` mount inside `luxfi/exchange/apps/web/src/main.tsx` (mirroring the existing `@luxfi/exchange` SDK pattern). | Cross-repo. |
| 2.2 | Confirm `BrandConfig` + the auth/kms/wallet/mpc blocks (including the cosigner sub-blocks) cover the Lux tenant's needs without code changes in `pkg/bridge/`. If anything must be hardcoded, surface it as a new optional config field with semver-minor bump. | Drives any v1.1.x of the SDK. |

**Acceptance criteria**

- The Lux tenant (`app/bridge/`) is a thin shell (≤150 LOC of bridge wiring, excluding build/CI files).
- `@luxfi/bridge` renders the brand-correct UI from `BrandConfig` alone.
- The tenant repo contains no bridge UI logic, route logic, or wallet logic. All such changes land upstream in `pkg/bridge/`.

## 9. Phase 3 — White-Label SDK Publication

**Outcome:** `@luxfi/bridge` is published to the public npm registry and any third party can adopt it with their own backend.

**Deliverables**

| # | Task | Notes |
|---|---|---|
| 3.1 | Switch `pkg/bridge/package.json` `main`/`types` from `src/*.ts` to compiled `dist/*.js` + `.d.ts` outputs. Add a real `build` step that emits both. | Today `main`/`types` point at `src/*` and `build` is `tsc --noEmit`. This is what forces tenants to re-declare web3 / `@hanzogui/config-default` / `@luxfi/threshold` in their own `package.json` (§5.5). |
| 3.2 | Externalize React + react-dom + `@luxfi/brand` (and ideally `wagmi` / `viem` / `@tanstack/react-query`) from the published bundle. | React / react-dom are already peer-deps; verify the new web3 trio after the build step lands. |
| 3.3 | Confirm there are no `workspace:*` deps left in the publishable surface. | `@luxfi/threshold` is currently a `workspace:*` runtime dep — it must be published to npm (or vendored / re-exported through `dist/`) before SDK publication. |
| 3.4 | Publish `@luxfi/bridge` v1.x → npm under the `@luxfi` scope (public access). | `pnpm pub` from `pkg/bridge/`. |
| 3.5 | ~~Land the R3 client-side MPC integration~~ — **done** (R5). `mpc-session.ts`, `bridge-api.ts`, `wagmi-config.ts`, `BridgeUtilaConfig` / `BridgeFireblocksConfig`, server-side `cosigners.ts` + tests are all merged; SDK bumped to v1.0.3. Remaining sub-task: end-to-end soak against a real Utila and a real Fireblocks tenant on testnet. | Secret material stays on `app/server/` — invariant must not regress. |
| 3.6 | Document standalone-backend mode: how a downstream consumer points `apiHost` at a non-Lux endpoint, what server API contract `app/server/` exposes, what's pluggable. | New doc under `docs/content/docs/`. |

**Acceptance criteria**

- `npm install @luxfi/bridge` from a fresh project succeeds; the Quick Start in `pkg/bridge/README.md` produces a running bridge in <5 minutes.
- A third party can stand up a bridge with their own `apiHost` and `BrandConfig` without modifying SDK source.
- A standalone-backend doc clearly describes the integration contract.
- The cosigner layer has been exercised end-to-end against at least one real external custodian on testnet.

## 10. Outstanding Work

### 10.1 SDK working state

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
| R4 | Downstream consumers with custom asset registries (e.g., securities) may require injection points the current `@luxbridge/settings` does not expose. | Could force a SDK breaking change. | Investigate during Phase 3.6. |
| R5 | `app/bridge/package.json` currently re-declares deps that morally belong to `@luxfi/bridge` (web3 trio + `@hanzogui/config-default` + `@luxfi/threshold`). If a tenant lags an SDK upgrade, version drift between the tenant's declared pins and what the SDK actually uses can cause subtle runtime breaks. Phase 3.1 retires this risk. | Drift between tenant and SDK pins. | SDK, Phase 3.1. |

**Open questions for sponsor:**

1. Target date / acceptance bar for the Phase 3.5 cosigner e2e soak (Utila + Fireblocks on testnet).
2. Should `pkg/utila/` (and any equivalent `pkg/fireblocks/` if added) ship as published `@luxfi/*` packages, or stay private workspace helpers consumed only by `app/server/`?
3. Publication timing for `@luxfi/threshold` (gates SDK publication — see R2).

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

---

*End of document. Edit history is tracked via git.*
