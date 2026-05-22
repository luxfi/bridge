# Lux Bridge — Project Requirements

| Field | Value |
|---|---|
| Repository | `github.com/luxfi/bridge` |
| Owner | Lux Industries, Inc. |
| Author of doc | (to be filled) |
| Date | 2026-05-21 |
| Status | Draft for review |
| Supersedes | `requirements.txt` (working notes) |

---

## 1. Background & Context

`bridge.lux.network` is Lux's cross-chain bridge UI. Historically it was a monolithic frontend bound to an older JavaScript API + standalone MPC service. Both have been replaced:

- The **API backend** is now `app/server/` (Express + Prisma) and is already live at `api.bridge.lux.network`.
- The **MPC layer** is now provided by `pkg/threshold/` (`@luxfi/threshold` SDK), deployed in two modes:
  - **Private MPC** — Lux treasury cluster, collects fees. Config under `config/mpc/config.yaml`.
  - **Public MPC** — `m-chain`, validator-powered, permissionless, deployed via `k8s/mpc-deployment.yaml`.
- The **frontend** is being repackaged as a publishable white-label SDK `@luxfi/bridge` (`pkg/bridge/`). Each tenant (Lux, Zoo, Hanzo, Liquidity.io) consumes the SDK from a minimal `main.tsx` plus its own `@<org>/brand` package.

This document is the authoritative project requirements set. It supersedes the rough-draft `requirements.txt` in the repo root, which captured the original Slack transcript from the project sponsor.

## 2. Goals

1. Restore a working bridge at `bridge.lux.network`, backed by `app/server/` (talking to b-chain) and `@luxfi/threshold` MPC (m-chain + private cluster).
2. Ship `@luxfi/bridge` v1.x as a publicly-installable npm package that any host can embed, with brand + config injected at mount time.
3. Provide two reference tenant repos consuming the SDK:
   - `github.com/luxfi/bridge` tenant app (Lux brand) — currently `app/bridge3/`.
   - `github.com/zooai/bridge` tenant app (Zoo brand) — currently in flux (see §10 Uncommitted State).
4. Embed the bridge inside `luxfi/exchange` and `zooai/exchange` using the same SDK.
5. Support Liquidity.io as a third tenant operating its own backend (centralized MPC) — proves the SDK is genuinely backend-agnostic.

## 3. Non-Goals

The following are **explicitly out of scope** for this initiative and must not creep in:

- Rewriting `app/server/` routes, schema, or Prisma layer beyond what's needed for chain rewiring.
- Building new branding configs *before* data flow from b-chain to UI is proven end-to-end.
- Optimizing for Liquidity.io's standalone-backend use case before Lux's hosted case works.
- Changes to `@luxfi/threshold` MPC SDK internals — that package is owned upstream and is consumed as-is.
- Replacing wallet adapters or chain libraries inside `@luxbridge/app-v3` beyond what wiring requires.
- Deprecating the legacy `app/bridge/` (`@luxbridge/app` v2.0.0) in this initiative — leave it untouched. It is not on the SDK consumption path.

## 4. Glossary — Lux Chains

These names appear throughout the source transcript; for record:

| Chain | Role | Used by bridge? |
|---|---|---|
| **b-chain** | Lux primary network validators. Hosts bridge API backend (consensus + state). | Yes — primary backend chain. |
| **m-chain** | Public/permissionless MPC chain, powered by validators. | Yes — public threshold signing. |
| **t-chain** | Threshold layer (referenced in `@luxfi/threshold`). | Yes — MPC SDK target. |
| **f-chain** | FHE chain (`github.com/luxfhe`, "first OSS torus threshold FHE"). | Not in scope for v1. |
| **o-chain** | Oracle chain, watches external networks. | Optional (helper). |
| **r-chain** | Relay chain, submits tx on other networks. | Optional (helper). |

## 5. Current State (verified 2026-05-21)

### 5.1 Repo layout (relevant subset)

```
bridge/
├── app/
│   ├── bridge/            @luxbridge/app v2.0.0 — LEGACY. Vite, ~80 deps. Not on SDK path.
│   ├── bridge3/           @luxbridge/app-v3 v1.0.0 — REFERENCE FRONTEND. Remix/Vite v3.
│   └── server/            Bridge API (Express + Prisma). Live at api.bridge.lux.network.
├── pkg/
│   ├── bridge/            @luxfi/bridge — PUBLIC SDK (this is what consumers import).
│   │   ├── src/
│   │   │   ├── index.ts           Public entry (exports Bridge, mountBridge, types, config helpers).
│   │   │   ├── Bridge.tsx         React component; lazy-imports @luxbridge/app-v3.
│   │   │   ├── mount.ts           Imperative DOM-mount helper.
│   │   │   ├── config.ts          getConfig/setConfig/applyBrandMetadata.
│   │   │   ├── types.ts           BridgeConfig, BrandConfig, MountBridgeOptions.
│   │   │   └── luxbridge-app.d.ts Workspace dep type shim.
│   │   ├── package.json   v1.0.0, scope public, registry npmjs.org.
│   │   └── README.md      Consumer-facing docs (currently inaccurate — see §10).
│   └── threshold/         @luxfi/threshold — MPC SDK. Consumed by app/server.
├── docs/
│   ├── BRIDGE-STATUS.md   STALE — points devs at app/bridge (legacy).
│   ├── LOCAL-SETUP.md     STALE — same issue.
│   ├── MPC-GO-INTEGRATION.md
│   ├── MIGRATION-TO-GO-MPC.md
│   ├── MPC-INTEGRATION-COMPLETE.md
│   ├── MPC-MODERNIZATION-SUMMARY.md
│   ├── CI-CD-DOCKER-IMAGES.md
│   ├── DEPLOYMENT.md
│   ├── LUX-ID-INTEGRATION.md
│   └── LLM.md
├── config/mpc/config.yaml     Private MPC cluster config.
├── k8s/mpc-deployment.yaml    Public MPC (m-chain) deployment manifests.
├── REQUIREMENTS.md            This document.
└── requirements.txt           Original sponsor transcript (working notes).
```

### 5.2 Component status (per sponsor's confirmation)

| Component | Status | Location |
|---|---|---|
| Lux primary network (validators) | Live | `github.com/luxfi/node`, `luxfi/chains` |
| Bridge API server (b-chain backend) | Live | `app/server/` |
| Public MPC (m-chain) | Live | `pkg/threshold/` SDK + `k8s/mpc-deployment.yaml` |
| Private MPC (treasury fees) | Live | same code, separate cluster, `config/mpc/config.yaml` |
| r-chain relay (optional helper) | Live (in repo) | `app/server/cmd/`, hooks |
| o-chain oracle (optional helper) | Live (in repo) | upstream `github.com/luxfi/bridge` |
| Liquidity backend wire-up | Later | After Lux/Zoo tenants ship |
| `@luxfi/bridge` SDK (`pkg/bridge/`) | Partial — uncommitted local edits | This repo |
| Lux tenant app (`app/bridge3/`) | Reference / dogfood | Will become `github.com/luxfi/bridge` tenant repo |
| Zoo tenant app | Uncommitted deletion in tree | Needs reconciliation (see §10) |

### 5.3 SDK API surface (current, exact)

From `pkg/bridge/src/index.ts`:

```ts
export { Bridge } from './Bridge'
export type { BridgeProps } from './Bridge'
export { mountBridge } from './mount'
export { applyBrandMetadata, getConfig, setConfig } from './config'
export type { BrandConfig, BridgeConfig, MountBridgeOptions } from './types'
```

`BridgeConfig`:

```ts
interface BridgeConfig {
  apiHost: string                     // e.g. "https://api.bridge.lux.network"
  env: string                          // "mainnet" | "testnet" | custom slug
  brand?: BrandConfig                  // White-label overrides
  clientId?: string                    // Lux ID OIDC
  iamOrg?: string                      // Lux ID org slug
}
```

`BrandConfig`:

```ts
interface BrandConfig {
  name: string                         // Display name → document.title
  logoUrl?: string                     // SVG preferred
  faviconUrl?: string                  // Applied to <link rel="icon">
  primaryColor?: string                // → --brand-primary
  secondaryColor?: string              // → --brand-secondary
  supportEmail?: string                // Footer
  docsUrl?: string                     // Footer
}
```

### 5.4 Internal workspace deps

`pkg/bridge/package.json` declares:

```json
"dependencies": {
  "@luxbridge/app-v3": "workspace:*",
  "@luxbridge/settings": "workspace:*",
  "@luxfi/brand": "^1.0.0"
}
```

`@luxbridge/app-v3` resolves to `app/bridge3/`. `@luxbridge/settings` is the network + asset registry (private, unpublished). `@luxfi/brand` is the Lux brand defaults package (separate npm package, already published `^1.0.0`).

## 6. Target Architecture

```
                           +---------------------------+
                           |  @luxfi/bridge  (pkg/)    |
Tenant app (~20 LOC)  -->  |  exports:                 |
  imports SDK + brand      |    Bridge, mountBridge    |
  e.g.:                    |    BridgeConfig, …        |
    @luxfi/bridge          |  internally lazy-loads:   |
    @luxfi/brand    -->    |    @luxbridge/app-v3      |
    @zooai/brand           |    @luxbridge/settings    |
    @hanzoai/brand         +---------------------------+
                                       |
                                       v
                           +---------------------------+
                           |  app/server (Express +    |
                           |  Prisma) — Bridge API     |
                           |  api.bridge.lux.network   |
                           +---------------------------+
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
                              +------------------+              +------------------+
```

**One canonical SDK name. One mount function. One config shape.** All chain-awareness lives behind `apiHost` + `env` — tenants do not pass chain configs.

## 7. Phase 1 — Wire & Restore (URGENT)

**Outcome:** `bridge.lux.network` is back up, serving `@luxfi/bridge` SDK pointed at the live `app/server/` API, talking to b-chain and m-chain. Lux testnet → mainnet flow works end-to-end.

**Deliverables**

| # | Task | Files |
|---|---|---|
| 1.1 | Verify `@luxbridge/app-v3` (`app/bridge3/`) compiles and runs against `apiHost: api.bridge.lux.network` in `env: mainnet`. | `app/bridge3/.env.example`, `app/bridge3/vite.config.ts` |
| 1.2 | Commit the in-flight SDK edits (`Bridge.tsx`, `package.json`, `luxbridge-app.d.ts`, `tsconfig.json`) once 1.1 is green. | `pkg/bridge/src/Bridge.tsx`, `pkg/bridge/package.json`, `pkg/bridge/src/luxbridge-app.d.ts`, `pkg/bridge/tsconfig.json` |
| 1.3 | Run the SDK end-to-end against Lux testnet. Confirm: deposit quote, swap, withdrawal, MPC signature path. | manual + e2e |
| 1.4 | Deploy the Lux tenant app to `bridge.lux.network`. | tenant deploy pipeline |
| 1.5 | Refresh `docs/BRIDGE-STATUS.md` and `docs/LOCAL-SETUP.md` to point at `app/bridge3/` (not legacy `app/bridge/`). | `docs/BRIDGE-STATUS.md`, `docs/LOCAL-SETUP.md` |
| 1.6 | Fix `pkg/bridge/README.md` mismatches: (a) architecture diagram still says `@luxbridge/app` but code imports `@luxbridge/app-v3`; (b) document the exported `applyBrandMetadata`, `getConfig`, `setConfig`. | `pkg/bridge/README.md` |

**Acceptance criteria**

- A user can reach `bridge.lux.network`, connect a wallet, get a quote on Lux testnet, and complete a bridge transaction signed by an m-chain MPC quorum.
- Internal devs can run `pnpm dev` from `app/bridge3/` against local `app/server/` and complete the same flow.
- Treasury fee collection through the private MPC cluster fires on a real transfer.
- `pkg/bridge/README.md` matches reality and is enough for an external dev to install + mount.

## 8. Phase 2 — Multi-Tenant Embed

**Outcome:** the SDK is consumed unchanged from at least two host apps (`luxfi/exchange` web, `zooai/exchange` web) and one standalone Zoo tenant.

**Deliverables**

| # | Task | Notes |
|---|---|---|
| 2.1 | Reconcile the uncommitted deletion of `zoo/bridge` proxy code with the SDK-consumer pattern. | See §10. Target shape: `src/main.tsx`, `package.json`, `vite.config.ts`, `Dockerfile`, `k8s/`, `LLM.md`. |
| 2.2 | Publish `@zooai/brand` and `@zooai/logo` if not yet published; confirm `@hanzoai/brand` if needed. | Out-of-tree, coordinate with brand owners. |
| 2.3 | Add an `@luxfi/bridge` mount inside `luxfi/exchange/apps/web/src/main.tsx` (mirroring the existing `@luxfi/exchange` SDK pattern). | Cross-repo. |
| 2.4 | Same for `zooai/exchange/apps/web/src/main.tsx`. | Cross-repo. |
| 2.5 | Confirm `BrandConfig` covers everything the Zoo + Hanzo tenants need without code changes inside `pkg/bridge/`. If anything must be hardcoded, surface it as a new optional `BrandConfig` field with semver-minor bump. | Drives any v1.1.x of the SDK. |

**Acceptance criteria**

- Two tenant repos exist (`github.com/luxfi/bridge` and `github.com/zooai/bridge`) and each is a thin shell (≤30 LOC of bridge wiring, excluding build/CI files).
- The same `@luxfi/bridge` version installed in each renders the brand-correct UI from `BrandConfig` alone.
- No tenant repo contains bridge UI logic, route logic, or wallet logic. All such changes land upstream in `pkg/bridge/`.

## 9. Phase 3 — White-Label SDK Publication

**Outcome:** `@luxfi/bridge` is published to the public npm registry and Liquidity.io (or any third party) can adopt it with their own backend.

**Deliverables**

| # | Task | Notes |
|---|---|---|
| 3.1 | Switch `pkg/bridge/package.json` `main`/`types` from `src/*.ts` to compiled `dist/*.js` + `.d.ts` outputs. Add a real `build` step that emits both. | Currently `build` is `tsc --noEmit`. |
| 3.2 | Externalize React, react-dom, `@luxfi/brand` from the published bundle. | Already peer-deps. |
| 3.3 | Verify `@luxbridge/app-v3` and `@luxbridge/settings` are either (a) inlined into the published SDK bundle, or (b) published as `@luxfi/*` packages. They cannot be left as `workspace:*` in a published artifact. | Decision needed (see §11 Open Questions). |
| 3.4 | Publish `@luxfi/bridge` v1.0.0 → npm under the `@luxfi` scope (public access). | `pnpm pub` from `pkg/bridge/`. |
| 3.5 | Document standalone-backend mode for Liquidity.io: how to point `apiHost` at a non-Lux endpoint, what server API contract `app/server/` exposes, what's pluggable. | New doc: `docs/STANDALONE-BACKEND.md`. |
| 3.6 | Confirm Liquidity.io can render their own securities (AAPL, etc.) via the existing tokens/assets registry (`@luxbridge/settings`) without forking. If not, add an injection point. | May surface a `tokens?` field on `BridgeConfig`. |

**Acceptance criteria**

- `npm install @luxfi/bridge` from a fresh project succeeds; the Quick Start in `pkg/bridge/README.md` produces a running bridge in <5 minutes.
- A third party can stand up a bridge with their own `apiHost` and `BrandConfig` without modifying SDK source.
- A new `docs/STANDALONE-BACKEND.md` clearly describes the Liquidity.io path.

## 10. Uncommitted Working-Tree State

Two distinct sets of uncommitted changes exist at the time of writing (`git status`):

### 10.1 Sponsor's deletion of `zoo/bridge` overlay dirs

Quoted from `client-prompt.jpg`:

> I deleted the `bridge-proxy` Go code from `zoo/bridge` and the `lux-shim`/`zoo/bridge/app` overlay dirs in the working tree but **haven't committed**. That cleanup needs to be reconciled with the actual SDK-consumer pattern.

Resolution: this deletion is correct in direction (those overlays are obsolete) but must land alongside a real Zoo tenant repo of the shape described in Phase 2.1. **Do not commit the deletion in isolation** — pair it with the new tenant shell.

### 10.2 In-flight SDK edits in `pkg/bridge/`

Per `git status`, four files modified:

- `pkg/bridge/package.json`
- `pkg/bridge/src/Bridge.tsx`
- `pkg/bridge/src/luxbridge-app.d.ts`
- `pkg/bridge/tsconfig.json`

These are local edits to the SDK that have not been committed. **Action:** review diff, run typecheck (`pnpm tc` in `pkg/bridge/`), confirm wiring against `app/bridge3/`, then commit as part of Phase 1.2.

## 11. Risks & Open Questions

| # | Item | Risk / impact | Owner |
|---|---|---|---|
| R1 | `@luxbridge/app-v3` is consumed via `workspace:*`. Publishing `@luxfi/bridge` to npm will fail or break consumers unless this is resolved. | Blocks Phase 3. | SDK |
| R2 | Stale dev docs (`BRIDGE-STATUS.md`, `LOCAL-SETUP.md`) still tell new devs to use `app/bridge/` (legacy). New contributors will wire the wrong app. | Wasted onboarding cycles. | Docs / Phase 1.5 |
| R3 | `pkg/bridge/README.md` advertises `applyBrandMetadata`/`getConfig`/`setConfig` only implicitly. External adopters may not know these helpers exist. | Adoption friction. | Phase 1.6 |
| R4 | Legacy `app/bridge/` (`@luxbridge/app` v2.0.0) is still in the tree with 80+ deps and a large `pnpm.overrides` block. Drift risk: someone may "fix" it instead of using the SDK path. | Maintenance burden. | Decide post-Phase 2: archive or delete. |
| R5 | Liquidity.io's securities (AAPL, etc.) may require asset-registry injection points the current `@luxbridge/settings` does not expose. | Could force a SDK breaking change. | Investigate during Phase 3.6. |
| R6 | OIDC fields `clientId` / `iamOrg` on `BridgeConfig` are not exercised in `app/bridge3/` examples; behavior under non-Lux tenants is unverified. | Auth break for Zoo/Hanzo. | Phase 2 e2e. |

**Open questions for sponsor:**

1. For R1 — should `@luxbridge/app-v3` and `@luxbridge/settings` be published as public `@luxfi/*` packages, or inlined into the `@luxfi/bridge` build artifact?
2. Is Hanzo a tenant in this round, or only Lux + Zoo + (later) Liquidity.io? Sponsor transcript mentions Hanzo tooling but no tenant repo plan.
3. Target date for `bridge.lux.network` restoration? (Phase 1 acceptance.)
4. Should the legacy `app/bridge/` directory be deleted in this initiative or left in place?

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

*End of document. Edit history should be tracked via git.*
