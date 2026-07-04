# LUX ↔ ZOO bridge corridor — state + go-plan

Operator runbook for standing up the native two-way LUX↔ZOO corridor.
Peer to `operator-deploy-ed25519.md`. Verified ground truth 2026-07-04.

## Is it up? No — layered, each independently gated

| # | Layer | State | Fix owner |
|---|-------|-------|-----------|
| L0 | Zoo bridge **UI** (`ghcr.io/zooai/bridge`) | ImagePullBackOff — image never built (deps unresolvable + `ubuntu-latest` runner) | CI/CD (in progress) |
| L1 | Zoo in bridge **config** | `lux-bridge-config` CM has no `ZOO_MAINNET`/`ZOO_TESTNET` | this branch (prepared) |
| L2 | Zoo **RPC reachable** | `https://api.zoo.network/*` → **404**; bridge can't reach Zoo C-Chain | infra (route + path) |
| L3 | **Contracts** deployed | Bridge/Vault/ERC20B exist in-repo, not deployed on 200200 or paired on 96369 | `scripts/deploy-zoo.ts` |
| L4 | **MPC vault** for Zoo | EVM ⇒ existing 3-of-5 ECDSA cluster signs it (no new keygen); vault addr not yet keygen'd/funded/granted ORACLE_ROLE | MPC ops |
| L5 | **Testnet proof** infra | `zood-testnet-0` (200201) live; but no testnet bridge+MPC stack anywhere | see below |

Lux side is healthy for comparison: `https://api.lux.network/ext/bc/C/rpc` → 200 (chainId 96369); prod bridge+MPC (`mpc-node` 3/3, `ghcr.io/luxfi/mpc:v1.5.3`) live in `lux-bridge`.

## Corridor model (Bridge.sol carries `bool vault` per claim)

```
LUX (native, Lux)  --lock LuxVault(Lux)-->  mint  wLUX (ERC20B) on Zoo
wLUX (Zoo)         --burn-->                unlock LUX from LuxVault(Lux)
ZOO (native, Zoo)  --lock Vault(Zoo)-->     mint  wZOO (ERC20B) on Lux
wZOO (Lux)         --burn-->                unlock ZOO from Vault(Zoo)
```
MPC (3-of-5 CGGMP21, secp256k1) holds `ORACLE_ROLE` on **both** Bridges; it
watches deposits on each side and signs the EIP-712 `Claim` that
`bridgeMint`/`bridgeWithdraw` verify (ClaimId replay-protected).

## Prepared on this branch (`feat/zoo-corridor`, not applied to mainnet)

- `cmd/bridge/networks.mainnet.yaml` — `ZOO_MAINNET` (200200) + native ZOO; wrapped legs staged commented.
- `cmd/bridge/networks.testnet.yaml` — `ZOO_TESTNET` (200201) + native ZOO.
- `contracts/scripts/deploy-zoo.ts` — deploys one side (Bridge + LuxVault + ERC20B) and wires setVault/grantBridge/setTokenAllowed/setOracle.

## L2 — Zoo RPC (must fix before any deposit routes)

k8s routing is already correct: `api.zoo.network` → IngressRoute `zoo-rpc` →
svc `zood-rpc:9630` → live endpoint (zood-0). The 404 is at the node HTTP
layer: the bridge's compiled `rpcURLs` expect `/ext/bc/Z/rpc` but the
v1.34.x node serves `/v1/bc/C/rpc` (alias `C`, `/v1` prefix). This repo is
mid-migration on branch `fix/ext-to-v1-routes` — align there.
Fix = one of: (a) Traefik path-rewrite `/ext/bc/Z/rpc → /v1/bc/C/rpc` on the
`zoo-rpc` route, or (b) update the `ZOO_*` entries in
`internal/broadcast/client.go` + `internal/depositcheck/client.go` to the
served path AND confirm luxd `--http-allowed-hosts` includes `api.zoo.network`.
Verify: `curl -s -m8 -X POST -d '{"jsonrpc":"2.0","method":"eth_chainId","id":1}' https://api.zoo.network/<served-path>` → `0x30e08`.

## Mainnet go-plan (GATED — owner go required at every ▶)

Keys/addresses (all from KMS — never inline):
- `DEPLOYER` — funded EOA on each chain (gas only). Prefer a fresh key; hand admin to the DAO Safe after.
- `MPC_ORACLE_ADDR` — the 3-of-5 cluster's ECDSA signing address (keygen below).
- `FEE_RECIPIENT` — the DAO Safe (or the existing live collector `0xa5cd9b2b514c42a1e124d4087d1c654dad2052ad`).
- `ADMIN` — the org DAO Safe (final admin of both Bridges/tokens/vaults).

1. ▶ **Fix L2 Zoo RPC** (above). Blocks everything.
2. ▶ **MPC keygen the Zoo vault** — `AddressTypeETH`/secp256k1 on the existing cluster (no new curve). Record `MPC_ORACLE_ADDR`; fund it with gas on 200200 and 96369.
3. ▶ **Deploy Zoo side** (chain 200200):
   `ZOO_MAINNET_RPC=<served> MPC_ORACLE_ADDR=… FEE_RECIPIENT=… ADMIN_ADDR=<DAO Safe> npx hardhat run scripts/deploy-zoo.ts --network zoo`
   → records `Bridge_zoo`, `Vault_zoo`, `wLUX`.
4. ▶ **Deploy Lux side** (chain 96369): same with `--network lux` → `Bridge_lux`, `Vault_lux`, `wZOO`. (If a Lux Bridge already exists, reuse it: only deploy `wZOO`, `grantBridge`, `setTokenAllowed`, `setOracle`.)
5. ▶ **Confirm** the SAME `MPC_ORACLE_ADDR` holds `ORACLE_ROLE` on `Bridge_zoo` AND `Bridge_lux`; both unpaused; token whitelists set.
6. ▶ **Fill wrapped legs** in `networks.mainnet.yaml` (uncomment wLUX/wZOO with real addresses), regenerate the CM, and roll:
   `kubectl -n lux-bridge create configmap lux-bridge-config --from-file=networks.yaml=cmd/bridge/networks.mainnet.yaml --dry-run=client -o yaml | kubectl apply -f -`
   then `kubectl -n lux-bridge rollout restart deploy/lux-bridge deploy/bridge-server`.
7. ▶ **Smallest real e2e**: bridge a dust amount LUX→Zoo, capture the lock tx (Lux) + mint tx (Zoo); reverse for ZOO→Lux. Only then raise `limits`.

## Testnet-proof path (the honest blocker)

There is **no testnet bridge+MPC stack** (`lux-testnet` ns has none; the prod
`lux-bridge` serves testnet via `?version=testnet` off the **gated** prod CM +
prod MPC). `zood-testnet-0` (200201) is live, but Lux-testnet chain-heartbeat
is erroring. So a real testnet e2e needs ONE of:
- **A)** stand up a dedicated testnet bridge+MPC in `lux-testnet` + deploy testnet contracts (`--network zooTestnet`/`luxTestnet`) — keeps mainnet untouched; ~1 day of infra; or
- **B)** owner-approved **gated** dry-run: temporarily add `ZOO_TESTNET` to the prod CM + reuse prod MPC for one dust transfer (touches the gated prod CM — explicit go only).

Recommendation: **A** for a clean, un-gated proof; **B** only if the owner accepts a scoped, reversible prod-CM touch to prove the path faster.
