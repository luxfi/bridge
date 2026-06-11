# Smoke artifact — ZOO Testnet ↔ LUX Testnet (bidirectional)

Records the on-chain smoke that validates the Zoo RPC-path fix (`37e58814`,
`/ext/bc/Z/rpc` → `/ext/bc/zoo/rpc`) end-to-end. Unlike the SPA screen-recording
artifacts under `app/server/result-img/*.gif`, these swaps were driven
programmatically, so the record is the **on-chain transactions** — every claim
below is independently verifiable against the destination tx hash.

- **Date:** 2026-06-10 ~20:00–20:03 UTC
- **Bridge:** the Zoo-fixed binary (`go build` past `37e58814`), `networks.testnet.yaml`
- **Custody:** the **real 3-node ECDSA `mpcd` threshold cluster** (Zoo/LUX are
  `family='evm'`) behind `mpc-router` — NOT mpcd-single/ed25519. So this exercises
  the production threshold-signing path, not the single-signer one.
- **Funding:** testnet treasury `0x9011E888251AB053B7bD1cdB598Db4f9DEd94714`
  (`LUX_MNEMONIC` index 0), which holds the ZOO/LUX testnet liquidity.

## LUX_TESTNET → ZOO_TESTNET — validates the Zoo **destination** path

MPC-signed release broadcast onto the Zoo chain via the fixed RPC.

| Field | Value |
|---|---|
| Swap ID | `swap_63400d97d5884693` |
| Status | `completed` |
| Delivered | **49.5 ZOO** (`49500000000000000000` wei, native transfer, no calldata) |
| Recipient | `0xEAbCC110fAcBfebabC66Ad6f9E7B67288e720B59` |
| Dest tx | `0xb3b44eed4336b95fbd6c9da90a2ef3879e7733f5d8ab5f47f44b99e58e4f39e2` |
| Dest chainId | `200201` (ZOO_TESTNET) |
| Release wallet | `0xab0a9bf6bdeadb416d1c5d20d150eab9d5fae4a5` |

## ZOO_TESTNET → LUX_TESTNET — validates the Zoo **source** path

depositcheck read the live Zoo chain via the fixed RPC, confirmed the deposit,
then released LUX.

| Field | Value |
|---|---|
| Swap ID | `swap_af31765d692907e9` |
| Status | `completed` |
| Delivered | **0.99 LUX** (`990000000000000000` wei, native transfer, no calldata) |
| Recipient | `0x8d5081153aE1cfb41f5c932fe0b6Beb7E159cF84` |
| Dest tx | `0x5cbd0eb81dd12dc5f9f212182108e4b48e932e916392ce8cf5c6219a0517a162` |
| Dest chainId | `96368` (LUX_TESTNET) |
| Release wallet | `0x887b9496f1854d93003a4d36cadb405651f48033` |

## UI recording — `app/server/result-img/lux-zoo-test.gif`

A screen recording of the **actual bridge SPA** driving a third LUX→ZOO swap end
to end (connect → pick Lux Testnet → Zoo Testnet → 1 LUX → 49.5 ZOO → "Bridge
LUX → ZOO" → ● Completed), against the same live Zoo-fixed bridge + threshold
cluster. Same corridor, same RPC-path fix, shown through the real UI:

| Field | Value |
|---|---|
| Swap ID | `swap_684f3b0d4681e520` |
| Delivered | **49.5 ZOO** |
| Deposit tx (LUX) | `0xbeac9607017b7d65d5a196392f3966a5fdac5690cbceb5f189d9c911392dca2e` |
| Dest tx (ZOO) | `0x9aca578ee3e314c57782f834489e8223dae05d28e2fd5eef9b39d1ed8cb9c152` |

## What this proves / does not prove

- **Proves:** both halves of the Zoo corridor work against the live chains via the
  corrected `/ext/bc/zoo/rpc` path — source (depositcheck) and destination
  (release/broadcast) — through real threshold MPC custody. The fix is validated,
  not merely compiled.
- **Does not change the launch:** the pushed go-live image `de3a912a` predates
  the fix and still carries the old path, so Zoo stays a **post-launch follow-up**
  (`docs/GO-LIVE.md`). Shipping it needs a new image past `37e58814` + adding
  ZOO_MAINNET to the k8s ConfigMap. Mainnet Zoo is a young chain (~799 blocks on
  2026-06-10) — owner sign-off before routing real value.
