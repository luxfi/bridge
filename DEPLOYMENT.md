# Bridge Mesh Deployment

White-label deployment guide for the multi-chain bridge surface. Every brand
that runs an L1 (or L2) on top of the canonical platform inherits this
architecture verbatim — there is one mesh topology, one canonical contract
set, one off-chain orchestrator pattern.

## Architecture

### On-chain surface (per chain)

Each EVM chain in the mesh deploys two contracts and one synthetic token
family:

| Contract / Family | Source | Role |
|---|---|---|
| `BasketRegistry` | `@luxfi/contracts/bridge/v4/BasketRegistry.sol` | Per-basket membership table (USD/BTC/ETH/SOL/TON/XRP/DOT/native). |
| `BridgeV4` | `@luxfi/contracts/bridge/v4/BridgeV4.sol` | Canonical post-quantum-default bridge entrypoint. Holds `MINTER_ROLE` on every sToken on this chain. |
| `sLUX`, `sBTC`, `sETH`, `sUSDC` | `@luxfi/contracts/bridge/v4/BridgedSyntheticToken.sol` | Mint-by-bridge ERC20 wrappers — the unit-of-account inside the DeFi stack on this chain. |

The sToken contracts implement `IBridgedToken` (mint/burn) so `BridgeV4` can
use them as destination assets. Each sToken optionally points at an
underlying source-asset contract (e.g. `BridgedBTC` for `sBTC`) — when the
underlying is set, holders can `wrap(amount)` and `unwrap(amount)` 1:1
without involving the bridge.

### Off-chain surface

The mesh has **no on-chain peer-chain registry** — `BridgeV4` itself does
not store the topology. Cross-chain coupling lives in the **off-chain MPC
broadcaster daemon** (`@luxbridge/server` in this repo). The daemon:

1. Observes `RedeemRequested` events on every chain.
2. Computes the destination chain by reading `dstChain` from the event.
3. Composes a Warp 2.0 envelope and signs it via the threshold-MPC cluster
   (P3Q strict profile by default — Pulsar threshold sig × Prism commitment
   cut, verified by the P3Q precompile at `0x012205` on the dst chain).
4. Calls `BridgeV4.claim(envelope, proof)` on the destination chain.

Adding a new chain to the mesh is a pair of operations:

1. Run the canonical deploy on the new chain (see Step-by-step below).
2. Update the off-chain topology config so the daemon starts observing it.

### Why no on-chain peer registry?

Three reasons:

- **Envelope-carried topology** — every Warp 2.0 envelope already carries
  its own `srcChain` field. The verifier (P3Q precompile) doesn't need a
  peer-registry to check authenticity.
- **No registry-bloat tax** — a registry would mean n*(n-1) on-chain
  writes per mesh expansion, with the daemon having to coordinate them.
  Off-chain topology is a single JSON drop.
- **No dual-source-of-truth** — the daemon is the authority on which
  chains it brokers between. Putting that on-chain would just duplicate
  daemon config and create drift.

## Step-by-step: deploy one chain

Pre-requisites: the chain has `WLUX` + `BridgedBTC` + `BridgedETH` +
`BridgedUSDC` deployed (canonical token addresses captured in the brand
deployment manifest under `~/work/lux/standard/deployments/`). Without these
underlyings, sToken wrap/unwrap is disabled (but bridge mint/burn still
works — see "Pure-bridge mode" below).

```bash
cd ~/work/lux/standard

# 1) Read the brand manifest for this (brand, env) to source token addrs.
BRAND_MANIFEST=deployments/brand-l1-<env>/<brand>.json
WLUX=$(jq -r .contracts.WLUX        $BRAND_MANIFEST)
BBTC=$(jq -r .contracts.BridgedBTC  $BRAND_MANIFEST)
BETH=$(jq -r .contracts.BridgedETH  $BRAND_MANIFEST)
BUSDC=$(jq -r .contracts.BridgedUSDC $BRAND_MANIFEST)
RPC=$(jq -r .rpc $BRAND_MANIFEST)

# 2) Deploy BridgeV4 + BasketRegistry on the chain.
LUX_PRIVATE_KEY=$(cat ~/.lux/keys/main-deployer.pk) \
BRAND=<brand> BRIDGE_ENV=<env> \
  forge script contracts/script/DeployBridgeV4.s.sol \
  --rpc-url $RPC --broadcast -vvv

# Capture BridgeV4 + BasketRegistry addresses from the logs and write them
# into the brand manifest:
#   .contracts.BridgeV4         = "0x…"
#   .contracts.BasketRegistry   = "0x…"

# 3) Deploy sLUX / sBTC / sETH / sUSDC and register with BridgeV4 + Basket.
LUX_PRIVATE_KEY=$(cat ~/.lux/keys/main-deployer.pk) \
BRIDGE_V4=$BRIDGE_V4 BASKET_REGISTRY=$BASKET_REGISTRY \
WLUX=$WLUX BRIDGED_BTC=$BBTC BRIDGED_ETH=$BETH BRIDGED_USDC=$BUSDC \
  forge script contracts/script/DeploySTokens.s.sol \
  --rpc-url $RPC --broadcast -vvv

# Append .contracts.sTokens = { sLUX, sBTC, sETH, sUSDC } to manifest.
```

The two scripts are idempotent w.r.t. on-chain side effects — re-running
will deploy fresh instances at fresh addresses. Always run once and capture
the addresses into the manifest.

### Pure-bridge mode (no wrap/unwrap)

If a chain has no `Bridged{ETH,BTC,USDC}` deployed yet, pass empty
`address(0)` for the missing underlyings to `DeploySTokens`:

```bash
BRIDGED_BTC=0x0000000000000000000000000000000000000000 \
BRIDGED_ETH=0x0000000000000000000000000000000000000000 \
BRIDGED_USDC=0x0000000000000000000000000000000000000000 \
  forge script ... DeploySTokens.s.sol
```

The sToken is still bridge-mintable and bridge-burnable. Only the user-facing
`wrap` / `unwrap` paths revert until the underlying is set later (which
requires re-deploying the sToken, since `underlying` is `immutable`).

## Add a chain to the off-chain mesh

After both contracts are deployed, register the chain with the daemon's
topology config. The daemon reads a JSON manifest at startup:

```json
{
  "chains": [
    {
      "id": <evm-chain-id>,
      "rpc": "<rpc-url>",
      "bridgeV4": "0x…",
      "basketRegistry": "0x…",
      "sTokens": {
        "sLUX": "0x…",
        "sBTC": "0x…",
        "sETH": "0x…",
        "sUSDC": "0x…"
      },
      "active": true
    }
  ]
}
```

Drop the new chain entry into the daemon config and restart. The daemon
starts observing `RedeemRequested` events on the new chain immediately;
all other chains start accepting `claim()` calls signed with the new
chain's `srcChain` id.

## Cross-chain redeem flow (proof-of-life)

The canonical round-trip test is:

```
Chain A:                              Chain B:
  user holds sETH on A                  (no balance yet)
       │
       │ user calls BridgeV4(A).redeem(sETH_A, 1e18, B, recipient)
       ▼
  sETH(A).burn(user, 1e18)
  emit RedeemRequested(hash=…)
       │
       │ daemon observes event
       │ daemon composes envelope:
       │   srcChain=A, dstAsset=sETH_B, amount=1e18, recipient=recipient
       │ daemon signs via threshold MPC (Pulsar × Prism)
       ▼
                                      daemon calls BridgeV4(B).claim(envelope, proof)
                                      sETH(B).mint(recipient, 1e18 - fee)
                                      sETH(B).mint(feeReceiver, fee)
                                      emit Claimed(claimId=…)
```

The reverse direction is the same flow with A and B swapped. No on-chain
state on A needs to change other than the burn and the event.

## Operational invariants

Three invariants the daemon (and external auditors) MUST check
continuously:

1. **Per-asset conservation**: for every basket asset `X`, the sum of
   `sX.totalSupply()` across all chains EQUALS the sum of locked underlying
   in canonical custody on every source chain (e.g. real BTC in the BTC
   custody multisig). Violation = bridge insolvency.

2. **Per-chain conservation**: for every chain `c`, the sum of mints on
   `sX(c)` minus the sum of burns on `sX(c)` EQUALS the net inflow recorded
   by the daemon for `(c, X)`. Violation = unauthorized mint or burn.

3. **Claim-id monotonicity**: `BridgeV4.usedClaims[claimId]` is set on
   every successful claim and never cleared. Replay attempts revert with
   `V4_ClaimAlreadyUsed`. Auditors should grep events for any
   `Claimed(claimId)` that already appears in a previous block — should
   be zero.

## Role rotation post-deploy

The deployer key holds `DEFAULT_ADMIN_ROLE`, `GOVERNANCE_ROLE`, and
`OPERATOR_ROLE` on `BridgeV4` immediately after deploy. Rotate to:

| Role | Holder |
|---|---|
| `DEFAULT_ADMIN_ROLE` | Brand governance Safe (3-of-N multisig). |
| `GOVERNANCE_ROLE` | Brand governance Safe (3-of-N multisig). |
| `OPERATOR_ROLE` | Brand operations Safe (2-of-N multisig). |
| `MPC_ROLE` | The MPC cluster's threshold address (also used in classical-compat tail). |

Same pattern for `BasketRegistry.DEFAULT_ADMIN_ROLE` → governance Safe.
Same pattern for each sToken's `DEFAULT_ADMIN_ROLE` → governance Safe and
`MINTER_ROLE` → `BridgeV4` (the deploy script already grants this when
admin == deployer).

After rotation, the deployer key has NO authority over the bridge. All
parameter changes (fee bps, fee receiver, classical-compat window,
Z-Chain bridge address) go through the governance Safe.

## Per-chain registry

The canonical address registry per (brand, env) is the deployment manifest
file under `~/work/lux/standard/deployments/brand-l1-<env>/<brand>.json`.
Each manifest has the shape:

```json
{
  "brand": "<brand>",
  "env": "<env>",
  "chainId": <evm-chain-id>,
  "rpc": "<rpc-url>",
  "deployer": "0x…",
  "contracts": {
    "WLUX": "0x…",
    "BridgedETH": "0x…",
    "BridgedBTC": "0x…",
    "BridgedUSDC": "0x…",
    "sLUX": "0x…",
    "BasketRegistry": "0x…",
    "BridgeV4": "0x…",
    "sTokens": {
      "sLUX": "0x…",
      "sBTC": "0x…",
      "sETH": "0x…",
      "sUSDC": "0x…"
    }
  }
}
```

The off-chain daemon's topology config is generated from these manifests
via:

```bash
jq -s '{chains: map({id: .chainId, rpc: .rpc, bridgeV4: .contracts.BridgeV4,
        basketRegistry: .contracts.BasketRegistry,
        sTokens: .contracts.sTokens, active: true})}' \
  ~/work/lux/standard/deployments/brand-l1-*/*.json \
  > config/topology.json
```

## Adding a new sToken (asset family)

The current set is sLUX / sBTC / sETH / sUSDC. To add (e.g.) sSOL:

1. Extend `BasketRegistry.BasketClass` enum (`SOL` already exists).
2. Add `BridgedSOL` to the standard token set (mint pattern matching
   `BridgedBTC` — admin-mintable LRC20B descendant).
3. Add `sSOL` deploy step to `DeploySTokens.s.sol` (one
   `new BridgedSyntheticToken(...)` line + one
   `registry.addAssetToBasket(BasketClass.SOL, ...)` line).
4. Re-deploy `DeploySTokens` on every chain in the mesh — each chain
   gets its own sSOL instance with its own deterministic address.
5. Update daemon topology JSON to include `sSOL` in every chain's
   `sTokens` block.

That's it — no protocol-level change required. The bridge mesh is built
to absorb new asset families with a single per-chain deploy.
