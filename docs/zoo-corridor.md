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

The **chain is live** — in-cluster `zood-0:9630/v1/bc/C/rpc` returns
`eth_chainId` = `0x30e08` (200200), and `zood-testnet-0` = `0x30e09` (200201).
The break is the **public endpoint**: `https://api.zoo.network/*` returns bare
`404` on **every** path tried (`/`, `/ext/info`, `/ext/bc/Z/rpc`,
`/v1/bc/C/rpc`) — so this is NOT a simple path-rewrite (RED M1 corrected my
first read). The IngressRoute `zoo-rpc` targets the right service
(`zood-rpc:9630`, live endpoint `10.160.7.85:9630`), so the failure is
between Traefik and the node's HTTP response: candidates are luxd
`--http-allowed-hosts` (must include `api.zoo.network`; a host-mismatch can
present as 404), a Traefik middleware, or the node genuinely not serving that
path for a non-localhost Host. Compare the working Lux side:
`https://api.lux.network/ext/bc/C/rpc` → 200 / `0x17871` (96369).

Fix procedure (do NOT guess — reproduce, then fix):
1. `kubectl -n zoo-mainnet exec zood-0 -c zood -- curl -s -m5 -H 'Host: api.zoo.network' -X POST -d '{"jsonrpc":"2.0","method":"eth_chainId","id":1}' localhost:9630/v1/bc/C/rpc` — does adding the public Host reproduce the 404 in-cluster? If yes → luxd host-allowlist. If no → Traefik/route.
2. Set the exposed node's `--http-allowed-hosts` to include `api.zoo.network` (or mirror exactly what makes `api.lux.network` work), keep admin/debug/personal namespaces disabled (RED L1).
3. Point the bridge's compiled `ZOO_*` `rpcURLs`
   (`internal/broadcast/client.go`, `internal/depositcheck/client.go`,
   `internal/txassembler/rpc_provider.go`) at the **served** public path
   (align with the in-flight `fix/ext-to-v1-routes` branch — `/ext/bc/Z/rpc`
   vs `/v1/bc/C/rpc`), or override per-network via `BRIDGE_SOURCE_RPC_OVERRIDES`.
4. **Gate:** `curl … https://api.zoo.network/<served-path>` → `0x30e08` before any oracle keygen or deploy. The deploy script (`deploy-zoo.ts`) hard-refuses if the live chainId ≠ 200200/200201.

## Mainnet go-plan (GATED — owner go required at every ▶)

Keys/addresses (all from KMS — never inline):
- `PRIVATE_KEY` — funded deployer EOA (gas only). The deploy script de-privileges it fully before it exits — it is admin of nothing at the end.
- `ADMIN_SAFE` — the org DAO Safe. Final `DEFAULT_ADMIN/ADMIN/PAUSER` on both Bridges + wrapped tokens. **Required** — the script refuses a deployer-EOA admin (RED C1).
- `MPC_ORACLE_ADDR` — the 3-of-5 cluster's ECDSA signing address (keygen below).
- `FEE_RECIPIENT` — the DAO Safe (or the existing live collector `0xa5cd9b2b514c42a1e124d4087d1c654dad2052ad`).

0. ▶ **Prove the invariants** — run `contracts/` tests (deposit→bridgeWithdraw round-trip proving vault ownership; cross-chain + claimId replay reverts; forged-signer revert; `WrongClaimKind` discriminants; deploy-handoff de-privilege). No mainnet deploy on unproven contracts (RED H2).
1. ▶ **Fix L2 Zoo RPC** (above). Blocks everything; the deploy script hard-refuses a wrong/dead chainId.
2. ▶ **MPC keygen the Zoo vault** — `AddressTypeETH`/secp256k1 on the existing cluster (no new curve). Record `MPC_ORACLE_ADDR`; fund it + the deployer with gas on 200200 and 96369.
3. ▶ **Deploy Zoo side** (chain 200200):
   `ZOO_MAINNET_RPC=<served> ADMIN_SAFE=<DAO Safe> MPC_ORACLE_ADDR=… FEE_RECIPIENT=… npx hardhat run scripts/deploy-zoo.ts --network zoo`
   The script deploys `Bridge_zoo`+`Vault_zoo`+`wLUX`, wires them, `transferOwnership(vault→bridge)` (RED H1), hands admin to the Safe, renounces the deployer, and asserts the deployer holds zero roles before exiting. Record the printed addresses.
4. ▶ **Deploy Lux side** (chain 96369): same with `--network lux` → `Bridge_lux`+`Vault_lux`+`wZOO`. (If a Lux Bridge already exists, reuse it: deploy only `wZOO`, then from the Safe `grantBridge`/`setTokenAllowed`/`setOracle`.)
5. ▶ **Confirm** the SAME `MPC_ORACLE_ADDR` holds `ORACLE_ROLE` on `Bridge_zoo` AND `Bridge_lux`; both unpaused; whitelists set (wrapped + `address(0)` native). Recommended: route `emergencyWithdraw` + `setOracle` through a Safe timelock (RED C1 residual — admin is still trusted).
6. ▶ **Fill wrapped legs** in `networks.mainnet.yaml` — uncomment ALL THREE corridor token legs together (native ZOO + wLUX + wZOO) with real addresses (RED M3), regenerate the CM, and roll:
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
