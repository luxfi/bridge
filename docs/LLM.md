# Lux Bridge - AI Assistant Knowledge Base

**Project**: Lux Bridge
**Organization**: Lux Network

## Project Overview

The Lux Bridge is a decentralized cross-chain bridge infrastructure that enables secure, trustless asset transfers between multiple blockchain networks using Multi-Party Computation (MPC) technology. It serves as the primary interoperability layer for the Lux ecosystem, connecting 15+ blockchain networks.

## Package layout — public vs internal

Two scopes, one canonical SDK entrypoint. Downstream consumers (Lux, Hanzo,
Zoo, Liquidity, any white-label) import `@luxfi/bridge` and nothing else.

| Path | npm name | Scope | Published |
|---|---|---|---|
| `pkg/bridge/` | `@luxfi/bridge` | public SDK | pending — see §Publishing |
| `pkg/core/` | `@luxfi/core` | public shared types | yes (last 10.0.5, 2025-05-09) |
| `pkg/threshold/` | `@luxfi/threshold` | public MPC SDK | pending — see §Publishing |
| `pkg/utila/` | `@luxfi/utila` | public utila client | yes (last 3.0.0, 2024-11-21) |
| `pkg/settings/` | `@luxbridge/settings` | private workspace | no |
| `pkg/ui/` | `@luxbridge/ui-automation` | private workspace | no |
| `app/bridge/` | `@luxbridge/lux-tenant` | private workspace | no |
| `app/explorer/` | `@luxbridge/explorer` | private workspace; **migration to `ghcr.io/luxfi/explorer` planned** — see §Explorer migration | no |
| `app/server/` | `@luxbridge/server` | private workspace | no |

Rules:
- `@luxfi/bridge` is the ONLY package consumers import. It re-exports
  `mountBridge`, `Bridge`, and the config/brand types. Internals are hidden.
- `@luxbridge/*` packages are workspace-only. They are not published and must
  not be imported by anything outside this repo.
- `@luxfi/{core,threshold,utila}` are generic Lux building-block libraries —
  bridge-agnostic, may be reused elsewhere in the Lux ecosystem.

### History — what got folded together

- **`app/bridge3/`** (formerly `@luxbridge/app-v3`) was **folded into
  `pkg/bridge/src/app/`** at commit `abed909` ("feat(pkg/bridge): inline
  bridge UI under src/app/", phase 1.5). The old lazy-loaded workspace
  cycle that produced the blank-page bug is gone. `Bridge.tsx` no longer
  references any sibling workspace package.
- **`app/bridge/`** was collapsed to a single canonical tenant build at
  `6bc55b2` ("phase2-r2: collapse to canonical app/bridge tenant"). It is
  now `@luxbridge/lux-tenant` (~120 LOC: `bridge.config.ts`, `main.tsx`,
  `index.html` + Vite config), not the multi-variant Next.js app shown in
  stale diagrams.

## SDK mount pattern

```ts
import { mountBridge } from '@luxfi/bridge'

mountBridge({
  config: {
    apiHost: 'https://api.bridge.lux.network',
    env: 'mainnet',
    brand: { name: 'Lux Bridge', primaryColor: '#0066ff' },
  },
})
```

Mirrors `mountExchange` from `@/exchange`. One declarative entry,
build-time brand config, no hostname detection inside the SDK.

## Publishing

`.github/workflows/publish.yml` fires on `v*` tag push, runs on the
self-hosted `lux-build` runner. Runs `pnpm publish -r --access public
--no-git-checks` — pnpm walks the workspace, skips `private: true`
packages, and publishes any `@luxfi/*` package whose version is not yet
on npmjs.org. Bump versions in PRs; tag once merged.

**Status as of 2026-05-22**: the workflow is wired and hardened (fail-fast
on missing `NPM_TOKEN`/`NODE_AUTH_TOKEN`; token baked into the
`NPM_CONFIG_USERCONFIG` path because pnpm doesn't expand `${VAR}` in
.npmrc) but `@luxfi/bridge` and `@luxfi/threshold` are still 404 on
npmjs.org. Confirmed by `@luxfi/core` 10.0.5 and `@luxfi/utila` 3.0.0
both pre-dating every `v1.1.x` tag — no v1.1.x release has ever shipped
to npm. Most likely missing `NPM_TOKEN` secret on the `luxfi/bridge` repo
(Settings → Secrets and variables → Actions) OR an unavailable
`lux-build` runner pool. The v1.1.10 fail-fast guard will surface either
clearly on the next run.

## Explorer migration

`app/explorer/` (`@luxbridge/explorer`, Next.js standalone) is on a
deprecation path. The canonical replacement is **`ghcr.io/luxfi/explorer`**
— a single Go binary at `~/work/lux/explorer` that:

- Indexes EVM chains via [`luxfi/indexer`](https://github.com/luxfi/indexer)
- Exposes per-chain GraphQL via [`luxfi/graph`](https://github.com/luxfi/graph)
- Serves the embedded SPA from [`luxfi/explore`](https://github.com/luxfi/explore) via `go:embed`

Routes (served from one binary, port-flexible):

| Path | Purpose |
|---|---|
| `/` | SPA (embedded; SPA-routing fallback) |
| `/envs.js` | Runtime `window.ENV = {…}` |
| `/v1/indexer/{slug}/*` | Per-chain explorer REST API |
| `/v1/graph/{slug}/{subgraph}/graphql` | Per-chain, per-subgraph GraphQL |
| `/v1/explorer/realtime` | WebSocket realtime hub |

Migration plan: deploy `luxfi/explorer` alongside `app/explorer/`,
hostname-cutover (`bridge-explorer.lux.network`) on K8s, delete the
Next.js app after one-week soak. Same pattern as the
`graphprotocol/graph-node` → `LiquidGraph` cutover in
`liquidity/universe` (in-flight 2026-04-22; see
`~/work/liquidity/universe/CLAUDE.md` § Explorer / indexer).

The bridge backend (`app/server/`) does not depend on `app/explorer/`;
the migration is UI-only.

## Architecture Summary

### Core Technology Stack
- **SDK**: `@luxfi/bridge` — TypeScript source-published; React 18 + Tamagui
  (`@hanzo/gui` v7 + `@hanzogui/*` peer-optional primitives); wagmi 2 + viem 2
  + `@tanstack/react-query` 5 for wallet; `@luxfi/threshold` for native MPC
  threshold sign sessions
- **Tenant apps**: Vite + React 18.3.1 (`app/bridge/` = `@luxbridge/lux-tenant`,
  `app/explorer/` = `@luxbridge/explorer`)
- **Backend**: Node.js + Express + Prisma (`app/server/` = bridge API at
  `api.bridge.lux.network`)
- **MPC Framework**: 2-of-3 threshold signature scheme using `github.com/luxfi/mpc`
  (Go); client-side session helper via `@luxfi/threshold` (TS)
- **Smart Contracts**: Solidity (OpenZeppelin), deployed on multiple chains
- **Infrastructure**: Docker, Kubernetes, PostgreSQL, NATS, Consul, Vault (KMS)
- **Authentication**: Lux ID (Casdoor) for unified auth
- **Runtime config**: `window.__ENV` (templated from `BRIDGE_*` env at container
  boot by nginx docker-entrypoint) with build-time `import.meta.env.VITE_*`
  fallback. One image, N envs.

### System Architecture
```
                   ┌──────────────────────────────────┐
Tenant app         │ @luxfi/bridge  (pkg/bridge/)     │
(app/bridge/,      │ exports: Bridge, mountBridge,    │
 app/explorer/,    │   BridgeConfig, types            │
 zoo/bridge/, …)   │                                  │
imports SDK +      │ Bridge UI is INLINED at          │
brand:             │   pkg/bridge/src/app/            │
  @luxfi/bridge ─▶ │ (no @luxbridge/app-v3, no        │
  @luxfi/brand     │  workspace cycle, no lazy load)  │
  (or @zooai/brand,│                                  │
   @hanzoai/brand) │ Direct deps:                     │
                   │   @hanzo/gui, @luxfi/threshold,  │
                   │   wagmi, viem, react-query       │
                   └─────────────┬────────────────────┘
                                 │
                ┌────────────────┴─────────────────┐
                ▼                                  ▼
    ┌───────────────────────┐         ┌──────────────────────┐
    │ app/server            │         │ @luxfi/threshold     │
    │ Bridge API            │         │ MPC threshold SDK    │
    │ Express + Prisma      │         │ (consumed by BOTH    │
    │ api.bridge.lux.network│         │  SDK + server)       │
    └──────────┬────────────┘         └──────────┬───────────┘
               │                                 │
               ▼                                 ▼
    ┌─────────────────────┐            ┌──────────────────┐
    │ b-chain             │            │ m-chain (public  │
    │ Lux primary network │            │ MPC, m-chain)    │
    │ consensus + state   │            │                  │
    └─────────────────────┘            │ + optional       │
                                       │ private cluster  │
                                       │ (treasury fees)  │
                                       │                  │
                                       │ + optional       │
                                       │ layered cosign:  │
                                       │   Utila          │
                                       │   Fireblocks     │
                                       └──────────────────┘
```

### MPC Network Configuration
- **Node Count**: 3 nodes (2-of-3 threshold) on m-chain (public MPC)
- **Ports**:
  - HTTP API: 6000-6002
  - gRPC: 9090-9092
  - NATS: 4223
  - Consul: 8501
- **Security**: TLS 1.3, mutual authentication, HSM integration
- **Protocols**: `cggmp21` (default), `frost`, `bls`, `doerner` (classical);
  `pulsar` (MLWE), `corona` (RLWE), `magnetar` (lattice research variant) —
  PQ-safe, leaderless, permissionless-safe by design.

### Optional layered cosigners (since SDK v1.0.3)

External MPC custodians can be layered ON TOP of the native threshold network
as additional cosigners. The bridge backend enforces 2-of-2 (native + layered)
before releasing settlement. Use when tenants are already on Utila or
Fireblocks for institutional custody and need regulated-cosigner gating
without giving up the native threshold property.

Browser SDK declares config only; the secret half (Utila JWT / Fireblocks
secret key) lives on `app/server/` (sourced from KMS at boot). No secret
material is ever shipped in the page bundle.

```ts
mountBridge({
  config: {
    apiHost: 'https://api.bridge.lux.network',
    env: 'mainnet',
    mpc: {
      publicUrl: 'https://mpc.lux.network',
      protocol: 'cggmp21',
      // optional — layered cosigner #1
      utila: { orgId: 'tenant-x', clientId: 'lux-bridge' },
      // optional — layered cosigner #2 (both may be enabled together)
      fireblocks: { apiKey: 'pub-key-id', vaultAccountId: '0' },
    },
  },
})
```

Per-swap, the SDK forwards a `cosigners[]` array of public identifiers
(`orgId`, `clientId`, `apiKey`, vault ids) to `POST /api/swaps`. The
backend pairs each entry with a KMS-held secret and completes the cosign
on behalf of the tenant.

## Supported Networks & Assets

### Blockchain Networks (15+)
**Layer 1**: Lux, Ethereum, BSC, Polygon, Fantom
**Layer 2**: Arbitrum, Optimism, zkSync Era, Polygon zkEVM, Base, Blast
**Other**: TON, Solana (coming soon), Cosmos (via IBC)

### Supported Assets
**Stablecoins**: USDT, USDC, DAI, ZUSD
**Native Tokens**: LUX, ETH, BNB, MATIC
**Wrapped Assets**: ZETH, ZBNB, ZPOL, ZTON (ERC20B standard)

## Key Smart Contracts

### Core Contracts
- `Bridge.sol` - Main bridge contract with deposit/withdraw logic
- `LuxVault.sol` - Asset vault for Lux Network
- `ETHVault.sol` - Ethereum vault contract
- `ZooVault.sol` - Multi-asset aggregated vault
- `LERC4626.sol` - Tokenized vault shares

### Wrapped Token Contracts (ERC20B)
All wrapped tokens follow the ERC20B standard with mint/burn capabilities:
- Location: `/contracts/contracts/zoo/`
- Examples: Z.sol, ZETH.sol, ZUSD.sol, ZBNB.sol

## API Endpoints

### REST API (Port 5000)
- `GET /api/v1/status` - Bridge operational status
- `GET /api/v1/chains` - Supported blockchains
- `GET /api/v1/assets` - Supported tokens
- `POST /api/v1/quote` - Get transfer quote
- `POST /api/v1/transfer` - Initiate transfer
- `GET /api/v1/transfer/{id}` - Transfer status

### WebSocket API
- Subscribe to transfer updates
- Real-time status notifications
- Event streaming for bridge operations

## Essential Commands

### Development
```bash
# Clone and install
git clone https://github.com/luxfi/bridge
cd bridge
pnpm install

# Install MPC tools
make install-mpc

# Start infrastructure
make up

# Start MPC nodes
make start-mpc-nodes

# Start services
cd app/bridge && pnpm dev  # UI on :3001
cd app/server && pnpm dev  # API on :5000
```

### Infrastructure Management
```bash
# Infrastructure
make up                     # Start all infra services
make down                   # Stop all services
make logs                   # View aggregated logs

# MPC Operations
make start-mpc-nodes        # Start 3-node MPC network
make stop-mpc-nodes         # Stop MPC nodes
make generate-mpc-keys      # Generate new MPC keys
lux-mpc-cli status          # Check MPC status

# Development
pnpm dev                    # Start development servers
pnpm build                  # Build for production
pnpm test                   # Run test suite
pnpm lint                   # Run linters

# Deployment
make deploy-testnet         # Deploy to testnet
make deploy-mainnet         # Deploy to mainnet
```

## Architecture

The bridge uses a multi-layered architecture:

1. **Presentation Layer**: React/Next.js UI for user interaction
2. **API Layer**: Node.js server handling business logic
3. **MPC Layer**: Distributed nodes for threshold signatures
4. **Blockchain Layer**: Smart contracts on multiple chains
5. **Infrastructure Layer**: Supporting services (DB, messaging, KMS)

### Data Flow
1. User initiates transfer on source chain
2. Bridge contract locks assets in vault
3. Event emitted and detected by MPC nodes
4. MPC nodes reach consensus and generate signature
5. Signed message relayed to destination chain
6. Destination contract mints wrapped tokens
7. User receives tokens on destination chain

## Key Technologies

- **Multi-Party Computation (MPC)**: Distributed key management
- **Threshold Signatures**: 2-of-3 security model
- **Smart Contracts**: Solidity with OpenZeppelin
- **Message Queue**: NATS for inter-node communication
- **Service Discovery**: Consul for dynamic configuration
- **Key Management**: HashiCorp Vault
- **Authentication**: Casdoor (Lux ID)
- **Database**: PostgreSQL for state management
- **Container Orchestration**: Docker/Kubernetes

## Development Workflow

### Local Development
1. Start infrastructure: `make up`
2. Initialize MPC network: `make start-mpc-nodes`
3. Deploy contracts: `cd contracts && npx hardhat deploy`
4. Start API server: `cd app/server && pnpm dev`
5. Start tenant UI: `cd app/bridge && pnpm dev` (Vite on :3001)
6. SDK dev: edit `pkg/bridge/src/` — tenant Vite picks up changes live
   through the workspace symlink. No publish needed for local iteration.

### Testing
- Unit tests: `pnpm test:unit`
- Integration tests: `pnpm test:integration`
- Contract tests: `cd contracts && npx hardhat test`
- E2E tests: `pnpm test:e2e`

### Deployment
1. Build artifacts: `pnpm build`
2. Deploy contracts: `make deploy-{network}`
3. Update configuration
4. Deploy services via CI/CD
5. Verify deployment: `make verify-deployment`

## Configuration

### Environment Variables
```env
# Network
NETWORK=mainnet|testnet|local
CHAIN_ID=31337

# Database
DATABASE_URL=postgresql://user:pass@localhost:5433/bridge

# MPC
MPC_NODE_COUNT=3
MPC_THRESHOLD=2

# KMS (Vault)
VAULT_ADDR=http://localhost:8200
VAULT_TOKEN=<token>

# Authentication (Lux ID)
CASDOOR_ENDPOINT=http://localhost:8000
```

### Service Ports
- Bridge UI (tenant `app/bridge/`): **3001** (Vite dev/preview server)
- Bridge API (`app/server/`): 5000 (Express)
- Bridge explorer (`app/explorer/`, legacy): 3002 (Next.js)
- Bridge explorer (`ghcr.io/luxfi/explorer`, replacement): port-flexible
- MPC Nodes: 6000-6002 (HTTP), 9090-9092 (gRPC)
- PostgreSQL: 5433 (bridge), 5434 (auth)
- Vault (KMS): 8200
- Lux ID: 8000
- NATS: 4223
- Consul: 8501

## Security Best Practices

1. **Never commit secrets** - Use environment variables
2. **Validate all inputs** - Prevent injection attacks
3. **Use secure communication** - TLS 1.3 everywhere
4. **Implement rate limiting** - Prevent DDoS
5. **Regular security audits** - Contract and code reviews
6. **Monitor everything** - Logs, metrics, alerts
7. **Incident response plan** - Be prepared for emergencies

## Monitoring & Debugging

### Health Checks
- Bridge API: `curl http://localhost:5000/health`
- MPC Nodes: `curl http://localhost:6000/health`
- Infrastructure: `http://localhost:8501/ui` (Consul)

### Debugging Commands
```bash
# Check MPC status
lux-mpc-cli status --url http://localhost:6000

# View logs
tail -f logs/mpc-node-*.log

# Database queries
psql $DATABASE_URL -c "SELECT * FROM transfers WHERE status='pending';"

# NATS monitoring
nats-top -s localhost:4223
```

## Documentation

### Comprehensive Documentation Site (Nextra)
- **Location**: `~/work/lux/bridge/docs/` (Next.js + Nextra)
- **Pages**: `docs/pages/*.mdx`
- **Build**: `cd docs && pnpm install && pnpm build`
- **Dev**: `cd docs && pnpm dev` → http://localhost:3000

### Key Documentation Files
- `docs/LLM.md` — this file, canonical AI/onboarding doc (single source of truth)
- `docs/LUX-ID-INTEGRATION.md` — Casdoor-based unified auth integration
- `pkg/bridge/README.md` — consumer-facing SDK docs (`mountBridge`, `BridgeConfig`)
- Top-level `README.md` — quick-start + architecture pointer (kept consistent with this file)

The legacy migration .md files (BRIDGE-STATUS, LOCAL-SETUP, the four MPC
migration notes, DEPLOYMENT, CI-CD-DOCKER-IMAGES) were deleted in v1.1.12
(commit `b04e805`, issue #391) — they described an architecture from
before the SDK rationalization and confused new readers. Migration
history lives in `git log` and the GH release notes.

## Context for All AI Assistants

This file (`LLM.md`) is symlinked as:
- `AGENTS.md`
- `CLAUDE.md`
- `QWEN.md`
- `GEMINI.md`

All files reference the same knowledge base. Updates here propagate to all AI systems.

## Rules for AI Assistants

1. **ALWAYS** update LLM.md with significant discoveries
2. **NEVER** commit symlinked files (AGENTS.md, CLAUDE.md, etc.) - they're in .gitignore
3. **NEVER** create random summary files - update THIS file

---

**Note**: This file serves as the single source of truth for all AI assistants working on this project.
