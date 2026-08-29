# Deploying `bridge.lux.network` (`@luxbridge/lux-tenant`)

Operator runbook for shipping `app/bridge/` to production. Covers building the
docker image, pushing to ghcr.io, rolling out via k8s, verifying the deploy,
and rolling back if needed.

This document assumes you have:

- write access to `ghcr.io/luxfi/*`
- kubectl context targeting the production cluster (k8s manifests live in
  `github.com/luxfi/universe`)
- docker installed locally if pushing manually (CI handles this otherwise)

## 1. What gets deployed

| Artifact | Source | Image |
|---|---|---|
| Vite SPA + nginx | `app/bridge/Dockerfile` | `ghcr.io/luxfi/bridge-ui:<tag>` |

The image is a multi-stage build:

1. `node:22-alpine` builds the SPA via `pnpm -C app/bridge build` from a
   full workspace checkout (so `@luxfi/bridge` resolves to the sibling
   `pkg/bridge/` package).
2. `nginx:alpine` serves the `dist/` static bundle on port 80, with a
   container-boot hook (`docker-entrypoint.sh`) that templates
   `/__ENV.js` from `BRIDGE_*` environment variables.

The image is **environment-agnostic**: one tag deployed to N envs. All
tenant-specific values (API host, env slug, brand overrides) come from env
vars read at container boot, not from build-time constants.

## 2. Prerequisites

### Build dependencies (only if building locally)

- Docker 24+ with BuildKit enabled (default in modern Docker)
- ~6 GB free disk for the build context + node_modules layer

### Runtime config the deployed image expects

These are the `BRIDGE_*` environment variables `docker-entrypoint.sh`
templates into `/__ENV.js` at container boot. The browser reads them from
`window.__ENV` before falling back to build-time `import.meta.env.VITE_*`.

| Env var | Required? | Example | Notes |
|---|---|---|---|
| `BRIDGE_API_HOST` | ✅ | `https://bridge-api.lux.network` | REST backend. Production whitelists `bridge.lux.network` as a CORS origin — no dev-proxy needed in the deployed image. |
| `BRIDGE_ENV` | ✅ | `mainnet` | Drives chain registry filter (`is_testnet === (env === 'testnet')`). |
| `BRIDGE_IAM_ORG` | ☐ | `lux` | Lux ID tenant slug. Defaults to `lux`. |
| `BRIDGE_CLIENT_ID` | ☐ | _(set per tenant)_ | OIDC client id. |
| `BRIDGE_LOGO_URL` | ☐ | _(data url)_ | Override the brand logo at runtime. Empty falls back to the bundled `@luxfi/logo` data URL. |
| `WC_PROJECT_ID` | ☐ | _(WalletConnect project)_ | Without this, WalletConnect connector is omitted (no 403 spam on the Reown API). |
| `BRIDGE_WALLET_DEFAULT_CHAIN` | ☐ | `1` | Numeric EVM chainId the wallet defaults to on connect. |
| `BRIDGE_WALLET_SUPPORTED_CHAINS` | ☐ | `1,42161,8453,137,10` | Comma-separated EVM allow-list. |
| `BRIDGE_MPC_PUBLIC_URL` | ☐ | `https://mpc.lux.network` | M-Chain / ThresholdVM endpoint. Drives `useTransfers`' MPC session display. |
| `BRIDGE_MPC_PRIVATE_URL` | ☐ | _(treasury cluster)_ | Internal-only. Usually unset in tenant deployments. |
| `BRIDGE_MPC_PROTOCOL` | ☐ | `cggmp21` | Threshold signature protocol. One of `cggmp21`, `frost`, `bls`, `doerner`, `pulsar`, `corona`, `magnetar`. |

`BRIDGE_API_HOST` and `BRIDGE_ENV` are the only ones the bridge can't run
without. Everything else has a sane default.

### Image needs

- nginx listens on port 80 (containerPort 80)
- no persistent storage (SPA only)
- no inbound API surface other than the SPA + `/__ENV.js`
- Liveness/readiness: `GET /` returns 200 with the index.html

## 3. Build the image

### Option A — let CI build it (preferred)

`.github/workflows/docker.yml` builds + pushes `ghcr.io/luxfi/bridge-ui` on:

- push to `main`, `dev`, `test` branches
- tag push matching `v*`
- manual `workflow_dispatch`

Trigger paths:

- **Merge to main:** open a PR from your feature branch → merge. CI fires on
  the push.
- **Tag release:** `git tag v1.0.4 && git push origin v1.0.4`. CI also
  fires the `notify-universe` job which pings `luxfi/universe` via repo
  dispatch (`image-published` event) so its rollout pipeline knows there's
  a new image.
- **Manual:** GitHub → Actions → "Docker" → "Run workflow" → pick branch.

On tag push the workflow tags the image with the tag name and `latest`.
Other triggers produce branch-name and `latest` tags.

### Option B — build locally

```bash
# from repo root
docker build -f app/bridge/Dockerfile -t bridge-ui:local .
```

Build context is the repo root (the pnpm workspace needs it for the
`@luxfi/bridge` workspace dep to resolve). Build takes ~80–90 s on a
warm-cache CI runner, ~2–3 min cold.

**Image stats (verified 2026-05-22):**

| | |
|---|---|
| Compressed size | 28 MB |
| Uncompressed disk usage | 109 MB |
| Main JS bundle | 390 KB (128 KB gzipped) |
| Total dist | 5.5 MB across 18 chunks |
| nginx + node-modules layers | shared via Docker layer cache |

**Heads-up on `.dockerignore`:** the root `package.json` postinstall hook
runs `node scripts/patch-hanzogui-exports.cjs` — a workaround for the
broken upstream `@hanzo/gui@7.0.0` publish. The dockerignore deliberately
excludes `scripts/` but allow-lists this one file via
`!scripts/patch-hanzogui-exports.cjs`. If you ever see the build die at
`pnpm install` with `Cannot find module '/app/scripts/patch-hanzogui-exports.cjs'`,
that exception is the fix.

### Smoke-test the image locally

```bash
docker run -d --rm -p 18080:80 \
  -e BRIDGE_API_HOST=https://bridge-api.lux.network \
  -e BRIDGE_ENV=mainnet \
  -e BRIDGE_IAM_ORG=lux \
  --name bridge-ui-smoke \
  bridge-ui:local

# Verify __ENV.js renders the env values
curl -s http://localhost:18080/__ENV.js

# Verify the SPA loads
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:18080/

# Stop
docker stop bridge-ui-smoke
```

`/__ENV.js` should contain a `window.__ENV = { ... }` object with every
`BRIDGE_*` and `WC_PROJECT_ID` key, populated from what you passed via
`-e`. Empty strings are expected for keys you didn't pass.

A browser session against `http://localhost:18080` will throw CORS errors
when the SPA tries to call `bridge-api.lux.network` directly — that's
expected. The production backend's CORS allow-list pins
`https://bridge.lux.network` only. The smoke test verifies build
correctness, not end-to-end browser flow.

## 4. Push to ghcr.io (manual path)

Only if you're bypassing CI.

```bash
# Authenticate. Use a fine-scoped PAT with packages:write only.
echo "$GH_TOKEN" | docker login ghcr.io --username "$GH_USER" --password-stdin

# Choose a tag. Conventions in use:
#   - branch-style: "whispers-bridgev2-<short-sha>"
#   - version-style: "v1.0.4"
#   - rolling: "latest"
SHA=$(git rev-parse --short HEAD)
TAG="whispers-bridgev2-${SHA}"

# Tag + push
docker tag bridge-ui:local "ghcr.io/luxfi/bridge-ui:${TAG}"
docker push "ghcr.io/luxfi/bridge-ui:${TAG}"

# (Optional) also push :latest if you're confident
docker tag bridge-ui:local ghcr.io/luxfi/bridge-ui:latest
docker push ghcr.io/luxfi/bridge-ui:latest

# Drop the credential from local docker config
docker logout ghcr.io
```

Verify the tag landed:

```bash
# From any host (requires ghcr read auth for private orgs)
docker manifest inspect "ghcr.io/luxfi/bridge-ui:${TAG}"

# Or via the GH API
gh api "orgs/luxfi/packages/container/bridge-ui/versions" | jq '.[0:5]'
```

## 5. Roll out to Kubernetes

The k8s manifests for `bridge-ui` live in `github.com/luxfi/universe`, not
this repo. The deploy is one of:

### CI-driven (after CI push)

The `notify-universe` job in `.github/workflows/docker.yml` fires a
`repository_dispatch` event of type `image-published` to `luxfi/universe`
on tag push. Its receiving workflow updates the image tag in the
`bridge-ui` Deployment manifest and applies it.

```bash
# In luxfi/universe, the relevant manifest is roughly:
#   apps/bridge-ui/deployment.yaml
#
# Updated automatically by the dispatch handler. Confirm with:
kubectl --context prod get deployment bridge-ui -o jsonpath='{.spec.template.spec.containers[0].image}'
# Should print: ghcr.io/luxfi/bridge-ui:<tag>
```

### Manual `kubectl set image` (when bypassing the dispatch)

```bash
# Switch to the production cluster context first
kubectl config use-context prod

# Apply the new image
kubectl set image deployment/bridge-ui \
  bridge-ui="ghcr.io/luxfi/bridge-ui:${TAG}" \
  -n bridge

# Watch the rollout
kubectl rollout status deployment/bridge-ui -n bridge --timeout=2m
```

### Env-var changes

If you need to change one of the runtime env vars (e.g. swap
`BRIDGE_API_HOST` to a new backend), patch the ConfigMap rather than the
image:

```bash
kubectl edit configmap bridge-ui-env -n bridge
# Bounce the pods so they re-read /__ENV.js
kubectl rollout restart deployment/bridge-ui -n bridge
```

The image itself doesn't change — `__ENV.js` is generated at container
boot, so a pod restart picks up the new ConfigMap values.

## 6. Verify the deploy

### Smoke checks immediately after rollout

```bash
# DNS + TLS
curl -sI https://bridge.lux.network/ | head -3

# index.html serves
curl -s -o /dev/null -w "GET / → HTTP %{http_code}\n" https://bridge.lux.network/

# __ENV.js shows the right values
curl -s https://bridge.lux.network/__ENV.js

# Main JS bundle reachable
curl -s https://bridge.lux.network/ | grep -oE 'src="/assets/index-[^"]+\.js"' | head -1
```

`/__ENV.js` should match the values from your ConfigMap. If `BRIDGE_API_HOST`
is missing or wrong, the SPA will surface a "Failed to fetch" on the first
quote attempt — that's the most common signal of a misconfigured deploy.

### Browser sanity (manual)

1. Open `https://bridge.lux.network/` in a fresh incognito window.
2. Header should show the env chip (`MAINNET`, green) and nothing else
   beside the wordmark. The signing protocol is not named on the page —
   `BRIDGE_MPC_PROTOCOL` selects what the cluster runs, not what a visitor
   is told.
3. Open the chain selector — you should see 22 active chains pulled from
   `bridge-api.lux.network/api/networks` (Bitcoin, Solana, Ton, XRP,
   Polkadot, Ethereum, Base, Lux, Zoo, Polygon, Optimism, Arbitrum, Celo,
   BSC, Gnosis, Avalanche, Fantom, Aurora, Zora, Blast, Linea, Cardano).
4. Type any amount → a quote should arrive in <1 s.
5. Connect a wallet → balance + MAX button render on the "You send" row.

If any of these regress vs the pre-deploy version, **roll back** (next
section) before debugging in prod.

## 7. Rollback

The Vite SPA holds no client-side state that would be invalidated by a
rollback (transfer history is in localStorage and survives image swaps),
so rollback is safe at any time.

### Kubernetes rollback (instant)

```bash
# Roll back to the previous Deployment revision
kubectl rollout undo deployment/bridge-ui -n bridge

# Confirm
kubectl rollout status deployment/bridge-ui -n bridge --timeout=1m
kubectl describe deployment/bridge-ui -n bridge | grep Image
```

### Pin a specific known-good image

If `rollout undo` lands on something stale:

```bash
kubectl set image deployment/bridge-ui \
  bridge-ui="ghcr.io/luxfi/bridge-ui:<known-good-tag>" \
  -n bridge
```

The previous-stable tag is whatever was running before this deploy —
`kubectl rollout history deployment/bridge-ui -n bridge` shows the chain.

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Browser shows "Failed to fetch" on quote | `BRIDGE_API_HOST` wrong, or backend rejecting CORS | Verify `/__ENV.js` and that the prod backend's allow-list includes `bridge.lux.network` |
| Logos show letter avatars instead of brand marks | `cdn.lux.network` returning HTTP 522 (Cloudflare timeout) for the asset URL | This is the documented fallback behavior. The SDK ships bundled SVGs for ~14 chains; the remaining 8 fall back to letter avatars. No action needed. |
| WalletConnect doesn't appear in the wallet picker | `WC_PROJECT_ID` not set | Either set it in the ConfigMap or accept the injected + Coinbase-only connector set |
| Header shows `TESTNET` (blue chip) in prod | `BRIDGE_ENV` not set to `mainnet` | Patch ConfigMap, restart pods |
| `pnpm install` fails inside container with "Cannot find module .../scripts/patch-hanzogui-exports.cjs" | `.dockerignore` is excluding the file the postinstall hook needs | The repo's `.dockerignore` has a `!scripts/patch-hanzogui-exports.cjs` exception — make sure the build is using the current `.dockerignore` |

## 9. References

- Tenant manifest: [`manifests/tenants/lux.yaml`](../../manifests/tenants/lux.yaml)
- Schema: [`manifests/tenants/schema.yaml`](../../manifests/tenants/schema.yaml)
- CI workflow: [`.github/workflows/docker.yml`](../../.github/workflows/docker.yml)
- SDK source: [`pkg/bridge/`](../../pkg/bridge/)
- Tenant entry: [`src/main.tsx`](src/main.tsx), [`src/bridge.config.ts`](src/bridge.config.ts)
- Container entry: [`Dockerfile`](Dockerfile), [`docker-entrypoint.sh`](docker-entrypoint.sh)
