# Lux Bridge — Project Requirements

| Field | Value |
|---|---|
| Repository | `github.com/luxfi/bridge` |
| Owner | Lux Industries, Inc. |
| Author of doc | Jackson Mori |
| Date | 2026-05-29 |
| Status | Draft for review (R6 — adds §13 documenting the in-progress `cmd/bridge` Go binary that is porting swap / quote / MPC orchestration off `app/server`. Phases 1–3 above are unchanged. 2026-05-29 updates: §13.1 MPC dispatch row reflects the layered public/private pool — closes the SDK-declared `BridgeMPCConfig.publicUrl`/`privateUrl` gap. §13.1 new Observability row — every hardening counter (signing/refund ceilings, orphan recoveries, queue depth, pool split) is now first-class on `/metrics`. §13.1 new B-chain LP-333 row — `bridge_getSignerSetInfo` + `bridge_getCurrentEpoch` wired with background poller + REST/RPC passthrough, closes the boss's original "wire to the real LP-333 surface" directive. §13.6 step 2 marked done — persistence is wired in every real deploy. §13.7 G4 reclassified as dev-only ergonomic, not a prod risk.) |
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
| `cmd/bridge` Go binary (migration in progress) | **In progress** (R6, see §13). Native: networks/tokens/limits, quote engine (CoinGecko + static fallback), swap store, deposit watcher, signing driver, refund driver, MPC dispatch via `mpcd`. Proxied: explorer + settings. Working end-to-end on testnet for Sepolia → LUX as of 2026-05-28; **not yet in any `compose.*.yml`**. | `cmd/bridge/` |
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

### 13.1 Status (verified 2026-05-28 against working tree on `whispers/bridgev2`)

| Component | State | Notes |
|---|---|---|
| Networks / tokens / limits / exchanges | ✅ native | Served from YAML (`cmd/bridge/networks.testnet.yaml`, `networks.example.yaml`). No DB. |
| Quote engine | ✅ native | `quote_engine.go` + `coingecko_price_feed.go`. CoinGecko primary + static fallback (LUX/ZOO live in static permanently — neither is listed on CoinGecko). Receive amount is snapshot-stamped on the `Swap` row at create time. |
| Swap store | ✅ native | `swap_store.go` (in-memory map; `zap_store.go` is the Hanzo Base / SQLite-embedded backing, not yet the default). Status set: `user_deposit_pending → bridge_transfer_pending → broadcasting → completed`, plus `refund_pending` (stale-quote handoff) and `refunding` (legacy insufficient-funds path). |
| Deposit watcher | ✅ native | `deposit_watcher.go`, 15s poll loop. Advances `user_deposit_pending → bridge_transfer_pending_signing` once the source-chain deposit confirms. |
| Signing driver | ✅ native — hardened 2026-05-29 | `signing_driver.go`. Drives `bridge_transfer_pending_signing` → MPC sign → `broadcasting`. Quote-staleness guard via `--quote-max-age` (default 30 m) — stale swaps are kicked to the refund driver so the user gets their deposit back rather than executing at a drifted rate. Persistent-failure ceiling (mirror of refund driver): new `SigningAttempts` field on Swap + `maxSigningAttempts` ceiling. Each PreSign / MPC sign failure bumps the counter via the shared `rollbackOrFail` helper; at `--signing-max-attempts` (default 10) the swap moves to `SwapStatusRefundPending` so the refund driver returns the deposit. Catches both transient destination-RPC outages and terminal cases like non-EVM destination chains with no tx assembler (BTC / SOL / TON today — `txassembler: no config for network BITCOIN_TESTNET`). 4 unit tests cover the new paths. Empirically validated on `swap_1721f4…6252` (LUX → BTC) — looped "Destination RPC unreachable" for hours pre-fix; transitioned `bridge_transfer_pending → refund_pending → refunded` in ~55 s post-fix. |
| Refund driver | ✅ native — hardened 2026-05-28 (two passes) | `refund_driver.go`. Handles legacy insufficient-funds refunds + stale-quote handoffs + (new) stuck-unrefundable swaps + (new) persistent-failure ceiling. Hardening (pass 1): (a) Grace-window check now treats zero `LastErrorAt` as past-window (legacy persisted state with `LastError` set but timestamp unpopulated was looping the broadcast driver forever — this unblocks the refund path); (b) New `isStuckUnrefundable` + `failTerminal` route swaps stuck broadcasting past the refund window with `Sender` or `DepositAddress` missing to terminal `SwapStatusFailed` with operator-actionable `LastError`, instead of looping; (c) `terminal_failures` counter in `RefundDriverStats` for ops visibility. Hardening (pass 2): (d) New `RefundAttempts` field on Swap + `maxRefundAttempts` ceiling on RefundDriver. Each refund-rollback (MPC sign timeout, balance fetch error, broadcast failure on the source side) increments the counter; at `--refund-max-attempts` (default 5) the swap moves to `SwapStatusFailed` with "likely upstream mpcd / RPC issue" reason — catches the empirical wallet-rotation case where mpcd returns 504 on every sign because the rotated wallet's MPC session state was lost. Counter resets on successful refund. Zero disables (legacy retry-forever). 10 unit tests total cover the new paths. **Orphan recovery** (added 2026-05-29 in pass 3): new `--orphan-refunding-after` flag (default 5 m) + new third path in `tick()` that scans `SwapStatusRefunding` for swaps with stale `UpdatedAt` and rolls them back to `SwapStatusRefundPending` (bumping `RefundAttempts` so the persistent-failure ceiling composes). Stats counter `orphans_recovered` in `refund_stats`. Empirically validated against the previously-stuck `swap_5010a82142ef1391` — recovered immediately on first tick of a restart, re-entered the refund flow normally. Combined effect: a swap killed mid-refund no longer needs operator intervention to resume. |
| MPC dispatch | ✅ native — layered 2026-05-29 | Calls `mpcd` directly over HTTP (`/keygen`, `/sign`). Layered pool (`internal/mchain.Pool`) routes by role: per-swap deposit-wallet keygen + refund signing → `--mpc-url` (PUBLIC, m-chain public quorum, single-swap blast radius); release-wallet keygen + settlement signing → `--mpc-private-url` (PRIVATE treasury cluster, smaller quorum holding operator liquidity). Single-cluster back-compat preserved: leave `--mpc-private-url` empty and both roles target `--mpc-url` exactly as before. Private-cluster auth (`--mpc-private-token`, `--mpc-private-identity-file`, `--mpc-private-org-id`) inherits the public-cluster values when unset — minimizes flag duplication when both clusters share an auth boundary. Health surfaces `mpc_pool_split` so operators can confirm a split took effect. 6 unit tests cover routing (split + back-compat + auth/org-id fallback + override + nil pool). Closes the gap in §5.3 `BridgeMPCConfig.publicUrl`/`privateUrl` — SDK declared the split, bridge previously ignored it. |
| Explorer / settings / auth | 🟡 proxied | Falls back to `app/server` via `--backend`. |
| B-chain LP-333 wiring | ✅ native — wired 2026-05-29 | `internal/bchain.Client` gains `GetSignerSetInfo` + `GetCurrentEpoch` methods (typed wire shapes: `SignerSetInfo{Members, Threshold, Total, Epoch, SignerSetHash, LastRotationAt}`, `CurrentEpoch{Epoch, SignerSetHash, StartedAt}`). REST passthroughs at `/v1/bridge/signer-set` and `/v1/bridge/epoch` (registered only when `--bchain-url` is set). JSON-RPC dispatch at `/v1/bridge/rpc` for `bridge_getSignerSetInfo` + `bridge_getCurrentEpoch`. Back-compat: upstream BridgeVM without LP-333 returns -32601 → bridge returns HTTP 501 (distinguishable from 502 transport failures via the new `rpcErrToHTTP` mapper). Background `BChainPoller` (default 30s cadence, `--bchain-poll-interval` flag) caches the snapshot so `/metrics` scrapes never block on RPC; stale-tolerance preserves last-good Epoch/Threshold/Total when upstream blips. New gauges: `bridge_bchain_reachable`, `bridge_bchain_current_epoch`, `bridge_bchain_signer_set_threshold`, `bridge_bchain_signer_set_size`. 9 unit/integration tests cover REST happy/not-implemented, JSON-RPC dispatch + nil-bchain fallback, poller fetch/stale/run-stop, metrics gauge nil-safe path. Empirically validated against `https://api.lux-test.network` — BridgeVM not deployed there yet → reachable=0 + log emits `stale_for` warning every 15s as designed. Closes the boss's deferred "Hold + refocus: wire to the real LP-333 surface" directive from the original recon. The bridge is now a CONSUMER of b-chain signer-set state; it does NOT vote on rotations (governance is on b-chain). |
| Storage durability | 🟡 in-memory | Default store is `swap_store.go` (process-local map). `zap_store.go` SQLite backing exists but is not the default — a binary restart drops in-flight swaps. |
| Observability | ✅ native — promoted 2026-05-29 | `/metrics` (Prometheus text exposition) surfaces every hardening counter as a first-class alertable signal: signing/broadcast/refund/deposit-watcher `_total` counters (ticks, attempts, successes, failures, list_errors); refund-specific `terminal_failures_total` + `orphans_recovered_total` (close the visibility loop on the three 2026-05-28/29 hardening passes); signing `stale_total` (quote-age refunds); per-driver `_running` gauges (1/0); `bridge_mpc_keygen_enabled` + `bridge_mpc_pool_split` gauges (operators scrape to confirm `--mpc-private-url` actually applied); `bridge_swaps_by_status` gauge with a stable label set for every SwapStatus (queue-depth alerting on `refund_pending` spikes etc.). Nil-safe — `--disable-*` driver flags emit zeros, not panics. `/health` JSON unchanged for the legacy blob consumers; `/metrics` is the new alerting path. 5 unit tests cover format + per-status counts + nil-safe + pool-split gauge flip. |
| Deployment | 🟡 manifest ready, not yet applied | `k8s/bridge-deployment.yaml` is the production-grade manifest for `ghcr.io/luxfi/bridge:latest` — Deployment + Service + Ingress (`bridge.lux.network` + `bridge-api.lux.network`, cert-manager TLS) + PVC (20Gi for zapdb) + ConfigMap. ConfigMap expanded 2026-05-28 to mainnet chain parity with testnet: **11 networks** (LUX, Ethereum, Arbitrum, Optimism, Base, Polygon, BSC, Avalanche + BTC source-only + SOL/TON gated) and **22 tokens** (ETH + 3 stablecoins on Ethereum; ETH + USDC on each L2; native + USDC + USDT on Polygon/BSC; native + USDC on Avalanche; BTC on Bitcoin). Also fixed a pre-existing bug: ConfigMap network names were in lowercase-dashed format (`lux-mainnet`) but the bridge's internal lookups require uppercase-underscore (`LUX_MAINNET`) — the old ConfigMap wouldn't have routed at all. `.github/workflows/docker.yml` already builds + pushes the image. `compose.testnet.yml` ships a `bridge-go` service alongside `bridge-server`. `compose.mainnet.yml` still legacy-only. **Outstanding gating items are operator-side**: Secret creation, cluster apply, DNS cutover, mainnet release wallet funding — not blocking from the engineering side. |

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
| `--mpc-token` / `--mpc-identity-file` / `--mpc-org-id` | Bearer auth + tenant ID for the public cluster. Identity file derives the token deterministically — convenience for local dev; prod sets the token explicitly. These also serve the private cluster unless overridden. |
| `--mpc-private-url` | `mpcd` endpoint for the **private** treasury cluster. When set, release-wallet keygen + settlement signing route here instead of `--mpc-url`. Smaller-quorum cluster holding operator-funded liquidity. Empty (default) = single-cluster mode. |
| `--mpc-private-token` / `--mpc-private-identity-file` / `--mpc-private-org-id` | Per-cluster overrides for the private cluster's auth + tenant ID. Each falls back to the public-cluster value when empty. |
| `--bchain-url` | BridgeVM (b-chain) JSON-RPC base URL. When set, enables native `/v1/bridge/info`, `/v1/bridge/signer-set`, `/v1/bridge/epoch` handlers + the LP-333 background poller for `/metrics`. Empty leaves the legacy reverse proxy on those routes. |
| `--bchain-poll-interval` | Cadence at which the LP-333 background poller refreshes the cached signer-set + epoch snapshot. Default 30s. Never blocks `/metrics` scrapes — the cache surfaces stale-but-believable last-good values when b-chain blips, and `bridge_bchain_reachable` flips to 0. |
| `--source-rpc-overrides` | Per-network RPC overrides for the deposit watcher and `/v1/bridge/check-deposit` (e.g. `ETHEREUM_SEPOLIA=https://ethereum-sepolia-rpc.publicnode.com`). |
| `--coingecko` (+ `--coingecko-api-key`, `--coingecko-cache-ttl`, `--coingecko-timeout`) | Layer CoinGecko in front of the static feed. Default off. |
| `--quote-max-age` | Max age (default 30 m) of a create-time quote before the signing driver refuses to sign and hands off to the refund driver. Zero disables — only safe for stablecoin-only deployments. |
| `--disable-deposit-watcher` / `--disable-signing-driver` | Disable background loops (testing / manual operation). |

### 13.5 Current testnet scope (updated 2026-05-28)

`cmd/bridge/networks.testnet.yaml` ships **12 networks** — 9 EVM + 3 non-EVM registry-visible-but-disabled:

| Network | Type | Native | ERC-20s | Status |
|---|---|---|---|---|
| `ETHEREUM_SEPOLIA` | evm | ETH | USDC | ✅ full |
| `LUX_TESTNET` | evm | LUX | — | ✅ full |
| `BASE_SEPOLIA` | evm | ETH | USDC | ✅ full |
| `HOLESKY_TESTNET` | evm | ETH | — | ✅ full |
| `ARBITRUM_SEPOLIA` | evm | ETH | USDC | ✅ full (added 2026-05-28) |
| `OPTIMISM_SEPOLIA` | evm | ETH | USDC | ✅ full (added 2026-05-28) |
| `POLYGON_AMOY` | evm | POL | USDC | ✅ full (added 2026-05-28) |
| `BSC_TESTNET` | evm | BNB | — | ✅ full (added 2026-05-28) |
| `AVALANCHE_FUJI` | evm | AVAX | USDC | ✅ full (added 2026-05-28) |
| `BITCOIN_TESTNET` | bitcoin | BTC | — | 🟡 source-only (deposit enabled 2026-05-28). mpcd still returns mainnet-format P2PKH; `internal/mchain/btc_address.go` re-encodes to testnet (`m…` / `n…`) on the bridge side via base58check version-byte swap (0x00 → 0x6f). Blockstream testnet API recognizes the re-encoded address. Withdrawal still blocked — broadcast needs Schnorr signing in mpcd + a BTC tx assembler. |
| `SOLANA_DEVNET` | solana | SOL | — | ⬜ deposit + withdrawal disabled (mpcd: `no sol address returned from MPC keygen` — ed25519 / FROST not wired) |
| `TON_TESTNET` | ton | TON | — | ⬜ deposit + withdrawal disabled (same as SOL; shares the SOL keygen slot per `mchain/client.go:590-594`) |

End-to-end signed swaps verified for Sepolia ↔ LUX directions (both senses). The 5 newly-added EVM chains all return correct CoinGecko-backed quotes and create swaps with valid MPC deposit addresses. The 3 non-EVM chains appear in the registry so the SPA can surface them as "coming soon", but `is_deposit_enabled: false` and `is_withdrawal_enabled: false` block users from selecting them — preventing the dangerous scenario where mpcd would hand out a mainnet-format BTC address that looks valid but can't actually receive testnet funds.

Reconciliation with `app/bridge/TESTNET-E2E.md` §2 (which targets the Express backend) is now closer — most expected chains are wired; the non-EVM rows show but are gated until the mpcd-side fixes land.

### 13.6 Cutover plan

| # | Step | Acceptance |
|---|---|---|
| 1 | EVM↔EVM hardening | 🟡 partial — Sepolia → LUX completes end-to-end (2026-05-28). Remaining matrix: Sepolia↔Base Sepolia, Sepolia↔Holesky, Base Sepolia↔LUX, Holesky↔LUX, and reverse-direction LUX → {Sepolia, Base Sepolia, Holesky}. |
| 2 | Persistence default | ✅ done — every real deploy sets `BRIDGE_DATA_DIR` (compose.testnet.yml, compose.mainnet.yml mount `bridge-go-data`; `k8s/bridge-deployment.yaml` mounts a 20Gi RWO PVC pinned to `replicas: 1` with `Recreate` strategy because zapdb takes an exclusive dir lock). The binary still ships in-memory as the no-flag default for dev ergonomics + logs a `Warn` when that path is taken; production never hits it. |
| 3 | ERC-20 path | 🟡 partial — `internal/tokens/tokens.go` registry, `internal/depositcheck` ERC-20 `balanceOf` probe, and `internal/txassembler` ERC-20 `transfer(addr,uint256)` calldata mode were already implemented and unit-tested before this revision; on 2026-05-28 USDC entries were exposed in `networks.testnet.yaml` for ETHEREUM_SEPOLIA (Circle contract `0x1c7D…7238`) and BASE_SEPOLIA (`0x036C…CF7e`) so the SPA picker offers them. Quote pricing verified for both source (`10 USDC → 3.998 LUX`) and destination (`10 LUX → 24.76 USDC`) roles. Live end-to-end deposit + signed release with USDC on either chain is still pending — needs a real on-chain USDC deposit to close. |
| 4 | Compose wiring | ✅ done — both `compose.testnet.yml` and `compose.mainnet.yml` ship a `bridge-go` service alongside the legacy `bridge-server` / `bridge-ui` stack (2026-05-28). Testnet mounts `cmd/bridge/networks.testnet.yaml`; mainnet mounts `cmd/bridge/networks.mainnet.yaml` (extracted from the k8s ConfigMap, kept in sync). Mainnet uses bind-mounted `/mnt/ssd/bridge/bridge-go` for zapdb persistence (same pattern as mpc-data + postgres-data) and production deploy resources (4 CPU / 8GB limits, 2 CPU / 4GB reservations). K8s side (`k8s/bridge-deployment.yaml`) was already complete and now matches the chain set in both compose files. |
| 5 | DNS cutover | ⬜ pending — operator handoff. Required steps: (1) populate `bridge-secrets` Secret in `lux-bridge` namespace with `mpc-api-token` etc., (2) `kubectl apply -f k8s/bridge-deployment.yaml`, (3) repoint `bridge.lux.network` + `bridge-api.lux.network` DNS A-records to cluster LB after ingress cert is issued, (4) fund per-destination-network release wallets after first swap auto-mints each. See `docs/operator-deploy-phase-1-4.md` (pending). After 1-week soak, retire `bridge-server` + `bridge-ui` images. |
| 6 | Non-EVM (Solana, BTC, TON) | ⬜ pending — bridge-side `txassembler` + `broadcast` family dispatch implemented **only after** `mpcd` ships FROST Ed25519 (and Schnorr for BTC). See `manifests/chains/solana.yaml` for the planned promotion path (`locale_only → inbound_only → bidirectional`). |

### 13.7 Known gaps

| # | Gap | Impact |
|---|---|---|
| G1 | Non-EVM remains broken at multiple layers (verified empirically 2026-05-28): (a) `broadcast/client.go` returns `ErrFamilyNotImplemented` for every non-EVM chain family — blocks **withdrawal** to BTC/SOL/TON regardless of mpcd state; (b) signature parsing assumes ECDSA `R∥S∥V`; (c) mpcd keygen returns `"no sol address returned from MPC keygen"` / same for TON — ed25519 + FROST not wired in the cluster, blocks both deposit and withdrawal for SOL/TON; (d) ~~BTC mainnet-format address returned for testnet~~ **fixed in-bridge 2026-05-28** via `internal/mchain/btc_address.go` (base58check re-encoder with version-byte swap; 11 unit tests; empirically verified against Blockstream testnet API). BTC now enabled source-only. | Withdrawal to non-EVM still gated by (a) + (b). SOL/TON deposit still gated by (c). BTC deposit unblocked. |
| G2 | ERC-20 coverage on testnet (closed 2026-05-28). | USDC wired for 5 chains (Sepolia, Base Sepolia, Arbitrum Sepolia, Optimism Sepolia, Polygon Amoy, Avalanche Fuji) — Circle's canonical testnet contracts in both the YAML registry and `internal/tokens/tokens.go`. Quote + swap-create + deposit-watch + tx-assembly all wired. USDT / DAI on testnet still missing (no Circle-equivalent for those on most testnets). |
| G3 | `cmd/bridge` not referenced from any `compose.*.yml` or `k8s/` manifest. | Production deploy targets are still the Express + bridge-ui pair. |
| G4 | Default store is in-memory (`swap_store.go`) when `--data-dir` is unset. | Dev-only — every production deploy sets `BRIDGE_DATA_DIR` via env (verified in compose.testnet.yml, compose.mainnet.yml, k8s/bridge-deployment.yaml). Binary logs `Warn` when in-memory mode is taken so accidental prod misconfig is visible. |
| G5 | `app/bridge/TESTNET-E2E.md` Phase 1.3 sign-off runs against `bridge-api.lux.network` (Express). | Closing Phase 1.3 does not automatically validate the Go binary; the Go binary needs its own sign-off doc. |

### 13.8 Open questions for sponsor

1. Is the Go binary expected to replace `app/server/` *entirely*, or only the heavy paths (swap / quote / MPC) while Express continues to host explorer + settings + auth long-term?
2. Acceptance bar for the testnet soak in §13.6 step 4 — number of completed swaps, span in days, failure-rate ceiling.
3. Mainnet cutover timing: tied to a specific Phase 3 milestone (e.g. SDK publication), or independent?
4. Does §3 Non-Goals ("Rewriting `app/server/` routes, schema, or Prisma layer beyond what's needed for chain rewiring") need to be relaxed for R6, given the Go binary's swap-store / quote-engine / driver-loop ports overlap with `app/server/` routes by design?

---

*End of document. Edit history is tracked via git.*
