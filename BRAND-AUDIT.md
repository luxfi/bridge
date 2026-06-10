# Bridge Brand Audit (luxfi/bridge)

## Rule

`luxfi/bridge` is the Lux-branded cross-chain bridge. ONLY the Lux brand
ships from this repo. Source/destination chain identity for bridge
endpoints (chain names, chain logos, network metadata) is legitimate
network data and is kept. Foreign-org bridge brands (Hanzo, Zoo, Pars,
SPC) live in their own repos as thin shims that consume `@luxfi/bridge`.

## Findings

### Kept (chain identity / Lux's own wrapped-asset brand)

- `app/server/src/domain/settings/{mainnet,testnet,devnet}/networks.ts`:
  ~60 token entries with finance-domain wrapped-asset names (BTC, ETH,
  Dollar wrappers). These are **Lux's own wrapped-asset brand** (the
  Lux-issued wrapped version of asset X bridged to Lux C-Chain).
  Confirmed via `manifests/schema.yaml:171` and per-token logos served
  from `cdn.lux.network/bridge/currencies/lux/*.svg`. Kept.
- `manifests/tenants/lux.yaml`: the Lux tenant manifest. Kept.
- `manifests/chains/*` and chain references to ethereum, base, solana,
  ton, opnet: source/destination network identity for bridge endpoints.
  Kept.

### Removed (foreign-brand tenant data in a Lux repo)

- `manifests/tenants/hanzo.yaml` — Hanzo tenant manifest with Hanzo
  logo path, Hanzo color (`#6366F1`), Hanzo name. Belongs in
  `hanzoai/bridge-shim` (if Hanzo ever ships a bridge tenant), not
  here.
- `manifests/tenants/zoo.yaml` — Zoo tenant manifest with Zoo logo
  path, Zoo color (`#10B981`), Zoo Labs Foundation copy. Belongs in
  `zooai/bridge-shim`.
- `manifests/tenants/pars.yaml` — Pars tenant manifest.
- `manifests/tenants/spc.yaml` — SPC tenant manifest.

### Rewritten (cross-brand strategy copy)

- `REQUIREMENTS.md` §1, §2, §3, §8 (Phase 2), §9 (Phase 3), §10, §11:
  removed every foreign-brand tenant mention, removed Phase 2
  Zoo-tenant stand-up tasks, removed Hanzo-as-tenant deliverables,
  removed `@zooai/brand` / `@hanzoai/brand` publication tasks. The
  doc now scopes tenant work to Lux only and the embed target to
  `luxfi/exchange` only. Foreign-brand tenant repos are out-of-scope
  for this codebase.
- `docs/LLM.md` (symlinked as CLAUDE.md, AGENTS.md, QWEN.md,
  GEMINI.md per repo convention): removed the architecture diagram
  legend pointing at `@zooai/brand` / `@hanzoai/brand` and the
  "Hanzo-side bridge" section that advocated adding Hanzo tenants
  under `app/`. Replaced with an explicit "foreign-brand tenants live
  in their own repos" rule.

### Untouched (correct as-is)

- `docs/LLM.md` ZAP-naming rule: explicitly forbids `@hanzoai/zap-*`
  variants of the brand-neutral wire codec. That's the right
  anti-cross-brand stance — kept.
- All chain RPC config, teleporter contracts, and primary-network
  metadata: bridge endpoint identity, not org brand.

## Actions

1. `git rm` the four foreign tenant manifests.
2. Edit REQUIREMENTS.md and docs/LLM.md to scope tenant work to Lux.
3. Add `app/bridge/public/.well-known/bridge.json` declaring Lux brand
   identity, peers `[]` (federation discovery at runtime via
   ConfigMap), capabilities `["bridge", "mpc"]`, apiVersion `"1"`.

## Verification

```
rg '@hanzoai|@zooai/brand|Hanzo AI Inc|Zoo Labs Foundation|Pars Network Foundation' \
  --type-add 'web:*.{json,ts,tsx,js,jsx,md,yaml,yml,html}' -tweb .
```

Only remaining hits (post-cleanup): the brand-neutral ZAP rule in
docs/LLM.md (`@hanzoai/zap-*` is explicitly forbidden), which is the
correct anti-cross-brand guard.

## Follow-ups

- Add a CI lint that fails the build if `manifests/tenants/*.yaml`
  contains anything other than `lux.yaml`.
- Federation peer discovery to live in a runtime ConfigMap consumed by
  bridge-server at boot; UI reads peer list from `/v1/bridge/peers`.
