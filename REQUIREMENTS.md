# Lux Bridge — Project Requirements

| Field | Value |
|---|---|
| Repository | `github.com/luxfi/bridge` |
| Owner | Lux Industries, Inc. |
| Author of doc | (to be filled) |
| Date | 2026-05-22 |
| Status | Draft for review (R4 — corrected against working tree) |
| Supersedes | Prior R3 draft (contained stale tree + diagram claims) |

---

## 1. Background & Context

`bridge.lux.network` is Lux's cross-chain bridge UI. Historically it was a monolithic frontend bound to an older JavaScript API + standalone MPC service. Both have been replaced:

- The **API backend** is `app/server/` (Express + Prisma) and is live at `api.bridge.lux.network`.
- The **MPC layer** is provided by `pkg/threshold/` (`@luxfi/threshold` SDK), deployed in two modes:
  - **Private MPC** — Lux treasury cluster, collects fees. Config under `config/mpc/config.yaml`.
  - **Public MPC** — `m-chain`, validator-powered, permissionless, deployed via `k8s/mpc-deployment.yaml`.
- The **frontend** is packaged as a publishable white-label SDK `@luxfi/bridge` (`pkg/bridge/`). The bridge UI is **inlined** under `pkg/bridge/src/app/` — there is no longer a workspace `@luxbridge/app-v3` dependency. Each tenant (Lux, Zoo, Hanzo, ) consumes the SDK from a thin host shell plus its own `@<org>/brand` package.

This document is the authoritative project requirements set. The prior `requirements.txt` working-notes file is no longer at the repo root.

## 2. Goals

1. Keep `bridge.lux.network` up, backed by `app/server/` (talking to b-chain) and `@luxfi/threshold` MPC (m-chain + private cluster).
2. Ship `@luxfi/bridge` v1.x as a publicly-installable npm package that any host can embed, with brand + config injected at mount time.
3. Provide reference tenant repos consuming the SDK:
   - `github.com/luxfi/bridge` Lux tenant — currently `app/bridge/` (`@luxbridge/lux-tenant`).
   - `github.com/zooai/bridge` Zoo tenant — pending (see §10).
4. Embed the bridge inside `luxfi/exchange` and `zooai/exchange` using the same SDK.
5. Support  as a third tenant operating its own backend (centralized MPC) — proves the SDK is genuinely backend-agnostic.

## 3. Non-Goals

The following are **explicitly out of scope** for this initiative and must not creep in:

- Rewriting `app/server/` routes, schema, or Prisma layer beyond what's needed for chain rewiring.
- Building new branding configs *before* data flow from b-chain to UI is proven end-to-end.
- Optimizing for 's standalone-backend use case before Lux's hosted case works.
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
│   │                       Vite + React, ~120 LOC effective (bridge.config.ts ~88
│   │                       lines + main.tsx + index.html). Consumes
│   │                       @luxfi/bridge + @luxfi/brand + @luxfi/logo.
│   ├── explorer/           Bridge explorer app.
│   └── server/             Bridge API (Express + Prisma). Live at api.bridge.lux.network.
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
│   │   │   │                      KMSConfig/WalletConfig/MPCConfig blocks.
│   │   │   ├── app/               Inlined bridge UI (BridgeApp.tsx + components/
│   │   │   │                      hooks/ lib/ styles/).
│   │   │   └── __tests__/         Vitest specs.
│   │   ├── package.json   v1.0.1, scope public, registry npmjs.org.
│   │   └── README.md      Consumer-facing docs (kept in sync through R2/R3).
│   ├── core/              Shared core utilities.
│   ├── settings/          Network + asset registry (private, unpublished).
│   ├── threshold/         @luxfi/threshold — MPC SDK. Consumed by app/server.
│   ├── ui/                Shared UI primitives.
│   └── utila/             Utila cosigner helpers (declarative, layered).
├── docs/                  Nextra site (pages/, theme.config.tsx, next.config.js,
│                          package.json) — not a flat bag of md files.
│                          Loose top-level *.md (BRIDGE-STATUS, LOCAL-SETUP, etc.)
│                          predate the Nextra migration and are being folded in.
├── config/mpc/config.yaml     Private MPC cluster config.
├── k8s/mpc-deployment.yaml    Public MPC (m-chain) deployment manifests.
└── REQUIREMENTS.md            This document.
```

Notable removals from prior drafts:

- `app/bridge3/` does **not** exist. The two non-tenant apps are `app/explorer/` and `app/server/`.
- `pkg/bridge/src/luxbridge-app.d.ts` does **not** exist (the workspace-dep shim was removed when the UI was inlined).
- Root `requirements.txt` is **not** present.
- The legacy `@luxbridge/app` v2.0.0 directory was retired; `app/bridge/` is now the new, thin `@luxbridge/lux-tenant`.

### 5.2 Component status

| Component | Status | Location |
|---|---|---|
| Lux primary network (validators) | Live | `github.com/luxfi/node`, `luxfi/chains` |
| Bridge API server (b-chain backend) | Live | `app/server/` |
| Public MPC (m-chain) | Live | `pkg/threshold/` SDK + `k8s/mpc-deployment.yaml` |
| Private MPC (treasury fees) | Live | same code, separate cluster, `config/mpc/config.yaml` |
| r-chain relay (optional helper) | Live (in repo) | `app/server/cmd/`, hooks |
| o-chain oracle (optional helper) | Live (in repo) | upstream `github.com/luxfi/bridge` |
| `@luxfi/bridge` SDK (`pkg/bridge/`) | v1.0.1 on `whispers/bridgev2`, UI inlined | This repo |
| Lux tenant app (`app/bridge/`) | `@luxbridge/lux-tenant` v1.0.0 — ~120 LOC | This repo |
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
  mpc?: BridgeMPCConfig               // publicUrl (m-chain) + optional privateUrl + protocol
  clientId?: string                   // @deprecated — use auth.clientId
  iamOrg?: string                     // @deprecated — use auth.orgSlug
}
```

`BridgeMPCConfig.protocol` accepts classical (`cggmp21`, `frost`, `bls`, `doerner`) and post-quantum lattice-based (`pulsar`, `corona`, `magnetar`) threshold-signature identifiers. All protocols are leaderless / permissionless-safe by design.

`BrandConfig` keeps the original shape: `name`, optional `logoUrl`, `faviconUrl`, `primaryColor`, `secondaryColor`, `supportEmail`, `docsUrl`.

### 5.4 SDK dependency layout (verified against `pkg/bridge/package.json` v1.0.1)

Direct prod `dependencies`: `@luxfi/brand`, `@hanzo/gui`, `@hanzogui/core`, `@hanzogui/helpers`, `@hanzogui/constants`, `@hanzogui/themes`, `@hanzogui/animate`, `@hanzogui/animate-presence`, `@hanzogui/button`, `@hanzogui/input`.

`peerDependencies` (host-supplied): `react`, `react-dom`, plus the ~20 leaf `@hanzogui/*` components (popover, select, dialog, card, text, stacks, spinner, toast, tabs, label, form, list-item, separator, tooltip, avatar, image, group, progress, visually-hidden, portal, sheet) — all marked `optional` via `peerDependenciesMeta`. This lets host apps tree-shake the parts of the bridge UI they don't render.

`devDependencies`: `typescript`, `vitest`, `@types/react`, `@types/react-dom`.

The SDK **does not** workspace-depend on `@luxbridge/app-v3` (it does not exist) or on `@luxfi/threshold` directly. Today, threshold MPC is exercised from `app/server/` only; the SDK ships an `mpc?: BridgeMPCConfig` block so it can carry cluster URLs + protocol id forward, but does not import the threshold client itself.

> R3 design note: a follow-on change is in flight to add a client-side `mpc-session.ts` under `pkg/bridge/src/app/lib/` that imports `ThresholdClient` directly, plus a declarative `mpc.utila` / `mpc.fireblocks` cosigner layer. That work is **not yet merged into the working tree being documented here** — when it lands, §5.4 must be re-pinned and the SDK version bumped accordingly.

### 5.5 Tenant shape (verified against `app/bridge/package.json`)

`@luxbridge/lux-tenant` v1.0.0, `private: true`. Dependencies: `@luxfi/brand ^1.0.0`, `@luxfi/bridge workspace:*`, `@luxfi/logo ^1.0.0`, plus `react` / `react-dom` (catalog) and `react-native-web` for RN-web parity. Scripts: `dev` / `build` / `preview` / `typecheck` against Vite + tsc.

Runtime config is supplied via `window.__ENV` (templated from `BRIDGE_*` env at container boot) with an `import.meta.env.VITE_*` build-time fallback for local dev. Tenants do not pass chain configs — they pass `apiHost` + `env` + `brand` + optional auth/kms/wallet/mpc blocks.

## 6. Target Architecture

```
                           +-----------------------------+
                           |  @luxfi/bridge  (pkg/)      |
Tenant app (~120 LOC)  --> |  exports:                   |
  imports SDK + brand      |    Bridge, mountBridge      |
  e.g.:                    |    BridgeConfig + sub-blocks|
    @luxfi/bridge          |  UI inlined at src/app/     |
    @luxfi/brand     -->   |  no workspace lazy-load     |
    @luxfi/logo            +-----------------------------+
                                       |
                                       v
                           +-----------------------------+
                           |  app/server (Express +      |
                           |  Prisma) — Bridge API       |
                           |  api.bridge.lux.network     |
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
| 1.4 | Deploy the Lux tenant app to `bridge.lux.network`. | 🟡 — `app/bridge/` shape is final; deploy pipeline TBC. |
| 1.5 | Refresh `docs/BRIDGE-STATUS.md` and `docs/LOCAL-SETUP.md` to point at `app/bridge/`. | 🟡 — these files predate Nextra migration; fold them into `docs/pages/` and remove stale legacy mentions. |
| 1.6 | Keep `pkg/bridge/README.md` accurate (it was updated through R2/R3). | ✅ — consumer-facing README documents `Bridge`, `mountBridge`, `applyBrandMetadata`, `getConfig`, `setConfig`. |

**Acceptance criteria** (recheck before sign-off):

- A user can reach `bridge.lux.network`, connect a wallet, get a quote on Lux testnet, and complete a bridge transaction signed by an m-chain MPC quorum.
- Internal devs can run `pnpm dev` from `app/bridge/` against local `app/server/` and complete the same flow.
- Treasury fee collection through the private MPC cluster fires on a real transfer.
- `pkg/bridge/README.md` matches the current API surface in §5.3.

## 8. Phase 2 — Multi-Tenant Embed

**Outcome:** the SDK is consumed unchanged from at least two host apps (`luxfi/exchange` web, `zooai/exchange` web) and one standalone Zoo tenant.

**Deliverables**

| # | Task | Notes |
|---|---|---|
| 2.1 | Stand up `github.com/zooai/bridge` as a thin Zoo tenant shell mirroring `app/bridge/`: `src/main.tsx`, `package.json`, `vite.config.ts`, `Dockerfile`, `k8s/`, `bridge.config.ts`. | The earlier `zoo/bridge` proxy-Go + `lux-shim`/overlay dirs were already removed; do not revive them. |
| 2.2 | Publish `@zooai/brand` and `@zooai/logo` if not yet published; confirm `@hanzoai/brand` if needed. | Out-of-tree, coordinate with brand owners. |
| 2.3 | Add an `@luxfi/bridge` mount inside `luxfi/exchange/apps/web/src/main.tsx` (mirroring the existing `@luxfi/exchange` SDK pattern). | Cross-repo. |
| 2.4 | Same for `zooai/exchange/apps/web/src/main.tsx`. | Cross-repo. |
| 2.5 | Confirm `BrandConfig` + the auth/kms/wallet/mpc blocks cover everything Zoo + Hanzo need without code changes in `pkg/bridge/`. If anything must be hardcoded, surface it as a new optional config field with semver-minor bump. | Drives any v1.1.x of the SDK. |

**Acceptance criteria**

- Two tenant repos exist (`github.com/luxfi/bridge` and `github.com/zooai/bridge`) and each is a thin shell (≤150 LOC of bridge wiring, excluding build/CI files).
- The same `@luxfi/bridge` version installed in each renders the brand-correct UI from `BrandConfig` alone.
- No tenant repo contains bridge UI logic, route logic, or wallet logic. All such changes land upstream in `pkg/bridge/`.

## 9. Phase 3 — White-Label SDK Publication

**Outcome:** `@luxfi/bridge` is published to the public npm registry and  (or any third party) can adopt it with their own backend.

**Deliverables**

| # | Task | Notes |
|---|---|---|
| 3.1 | Switch `pkg/bridge/package.json` `main`/`types` from `src/*.ts` to compiled `dist/*.js` + `.d.ts` outputs. Add a real `build` step that emits both. | Today `main`/`types` point at `src/*` and `build` is `tsc --noEmit`. |
| 3.2 | Externalize React + react-dom + `@luxfi/brand` from the published bundle. | Already peer-deps; verify after build step lands. |
| 3.3 | Confirm there are no `workspace:*` deps left in the publishable surface. | UI is inlined; `@hanzogui/*` are already on npm; `@luxfi/brand` is already published `^1.0.0`. |
| 3.4 | Publish `@luxfi/bridge` v1.x → npm under the `@luxfi` scope (public access). | `pnpm pub` from `pkg/bridge/`. |
| 3.5 | Land the R3 client-side MPC integration (`mpc-session.ts` + `mpc.utila` / `mpc.fireblocks` declarative cosigner layer) and bump SDK accordingly. | This is the work referenced in §5.4 R3 design note. Secret material stays on `app/server/`. |
| 3.6 | Document standalone-backend mode for : how to point `apiHost` at a non-Lux endpoint, what server API contract `app/server/` exposes, what's pluggable. | New doc under `docs/pages/`. |
| 3.7 | Confirm  can render their own securities (AAPL, etc.) via the existing tokens/assets registry (`@luxbridge/settings`) without forking. If not, add an injection point. | May surface a `tokens?` field on `BridgeConfig`. |

**Acceptance criteria**

- `npm install @luxfi/bridge` from a fresh project succeeds; the Quick Start in `pkg/bridge/README.md` produces a running bridge in <5 minutes.
- A third party can stand up a bridge with their own `apiHost` and `BrandConfig` without modifying SDK source.
- A new standalone-backend doc clearly describes the  path.

## 10. Outstanding Tenant Work

### 10.1 Zoo tenant

The earlier `zoo/bridge` proxy-Go code and `lux-shim`/`zoo/bridge/app` overlay dirs have been removed. The replacement is a thin Zoo tenant repo mirroring `app/bridge/` — see Phase 2.1. Until that repo exists, there is no Zoo deployment target.

### 10.2 SDK working state

`pkg/bridge/` is checked in at v1.0.1 on `whispers/bridgev2`. Recent merges (see `git log`): `phase3-r2 stack (inline UI + cleanup + Tamagui swap)`, `phase1 SDK config blocks (auth/kms/wallet/mpc + PQ protocol union)`, `wire @luxfi/logo as canonical Lux logo source`. The R3 client-side MPC + cosigner work referenced in §5.4 / §9.3.5 is the next merge in flight.

## 11. Risks & Open Questions

| # | Item | Risk / impact | Owner |
|---|---|---|---|
| R1 | Build step still emits no `dist/`. Publishing today would ship `src/*.ts` directly — works for workspace consumers, breaks downstream type resolution for non-pnpm users. | Blocks Phase 3.1/3.4. | SDK |
| R2 | Top-level `docs/*.md` files (`BRIDGE-STATUS.md`, `LOCAL-SETUP.md`, the MPC-* set) predate the Nextra migration and still mention legacy paths. New contributors will follow stale instructions. | Wasted onboarding cycles. | Docs / Phase 1.5 |
| R3 | The R3 cosigner layer (`mpc.utila` / `mpc.fireblocks`) is purely declarative in the SDK type. Secrets must stay on `app/server/`; a future implementer must not move them client-side by accident. | Security regression. | SDK + server, Phase 3.5 |
| R4 | 's securities (AAPL, etc.) may require asset-registry injection points the current `@luxbridge/settings` does not expose. | Could force a SDK breaking change. | Investigate during Phase 3.7. |
| R5 | New `auth` / `kms` / `wallet` blocks are not yet exercised end-to-end by a non-Lux tenant; behavior under Zoo/Hanzo branding is unverified. | Auth break for Zoo/Hanzo. | Phase 2 e2e. |

**Open questions for sponsor:**

1. Is Hanzo a tenant in this round, or only Lux + Zoo + (later) ?
2. Target date for the R3 client-side MPC + cosigner merge (drives Phase 3 schedule).
3. Should the loose top-level `docs/*.md` files be folded into the Nextra site under `docs/pages/`, or deleted outright?
4. Should `pkg/utila/` (and any equivalent `pkg/fireblocks/` if added) ship as published `@luxfi/*` packages, or stay private workspace helpers consumed only by `app/server/`?

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
