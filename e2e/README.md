# bridge e2e

Playwright smoke + multi-tenant specs for the `@luxfi/bridge` tenant SPA.

One spec, four environments (`local` / `dev` / `test` / `main`). Mirrors the
env-parametric pattern from the wider Lux e2e infra.

## Layout

```
e2e/
├── package.json                minimal Playwright deps
├── playwright.config.ts        env-aware base URL + auto-boot vite preview on local
├── tsconfig.json
├── tests/
│   ├── smoke.spec.ts           render, brand, selectors, wallet button, quote, prod gate
│   └── multi-tenant.spec.ts    cross-tenant brand-routing assertions (E2E_ENV=main only)
└── README.md                   this file
```

## Quick start (local)

```bash
# 1. From repo root, install workspace deps once.
pnpm install

# 2. Build the tenant SPA — `vite preview` requires a built dist/.
cd app/bridge && pnpm build

# 3. Install browsers + run.
cd ../../e2e
pnpm install
pnpm install:browsers      # one-time chromium download
pnpm test:smoke            # boots `vite preview` on :3001 automatically
```

The `webServer` block in `playwright.config.ts` boots `pnpm preview` on `:3001`
from `app/bridge/dist/`. If you want to point at `vite dev` instead, set
`E2E_BASE_URL=http://localhost:3001` and run `pnpm --filter @luxbridge/lux-tenant dev`
in a separate shell first.

## Run against deployed envs

```bash
E2E_ENV=dev  pnpm test:smoke    # https://bridge.lux-dev.network
E2E_ENV=test pnpm test:smoke    # https://bridge.lux-test.network
E2E_ENV=main pnpm test:smoke    # https://bridge.lux.network
```

Tenant override:

```bash
BRIDGE_TENANT=zoo E2E_ENV=main pnpm test:smoke
# → https://bridge.zoo.network
```

Add custom base URL (e.g. PR preview deploy):

```bash
E2E_BASE_URL=https://pr-123--lux-bridge.preview.network pnpm test:smoke
```

## Multi-tenant spec

```bash
E2E_ENV=main pnpm test:multi-tenant
```

Runs only against `E2E_ENV=main`. Each tenant (Lux, Zoo, future) probes the
production DNS first and skips if the deployment isn't live. Asserts:

- `<title>` contains the tenant brand name (`Lux Bridge`, `Zoo Bridge`)
- `<html>` has `--brand-primary` set to the tenant's pinned hex color

Add a new tenant by appending one entry to `TENANTS` in
`tests/multi-tenant.spec.ts` — no other changes needed.

## What this does NOT cover

- **Real wallet connect** — the stub `useWallet` resolves to a dev-only display
  address (`0xLUXBRIDGE…DEADBEEF`) gated behind `import.meta.env.DEV`. Real
  threshold-MPC wallet integration (Phase 3 R3) needs Playwright wallet
  mocking, which is heavy enough to warrant its own PR.
- **Real backend swap submit** — the prod bridge API isn't always reachable
  from CI (rate-limited / behind WAF). Add a separate `tests/backend.spec.ts`
  with a fixture wallet + signed quote when the test harness is ready.
- **Visual regression / screenshots** — see follow-up PR.

## CI

```yaml
- name: bridge smoke
  run: |
    pnpm install --frozen-lockfile
    cd app/bridge && pnpm build
    cd ../../e2e && pnpm install && pnpm install:browsers
    E2E_ENV=${{ matrix.env }} pnpm test:smoke
```

Recommended matrix: `[dev, test]`. Mainnet smoke is opt-in via
`workflow_dispatch` to avoid hammering production on every push.

## Conventions

- One file per concern: `smoke.spec.ts` is the standard tenant render check,
  `multi-tenant.spec.ts` is the cross-tenant brand contract.
- No hostnames in spec bodies — `playwright.config.ts` owns env routing.
- No shared auth state — bridge mainnet is unauthenticated (wallet connect
  is purely client-side); no need for `storageState`.
- Selectors prefer `aria-label` over visible text, matching the actual
  `ChainSelector` / `AssetInput` / `WalletConnect` component contracts in
  `pkg/bridge/src/app/components/`.
