# Phase 1.3 sign-off — end-to-end testnet bridge

Goal: flip `REQUIREMENTS.md` §7, row 1.3 from 🟡 to ✅. The acceptance bar
is one signed bridge transaction from Sepolia → Lux Testnet that the m-chain
MPC quorum completes.

This is a one-shot human-in-the-loop verification. It's not part of CI —
running this requires a real wallet + faucet funds, so it lives outside the
automated test suite.

## Code state (verified before this doc was written)

These are pre-conditions the SDK + tenant satisfy as of the current branch:

- `useNetworks.ts` sends `?version=${cfg.env}` to `/api/networks`, so the
  server returns the testnet registry instead of mainnet defaults.
- `wagmi-config.ts` ships testnet viem chains
  (`sepolia`, `arbitrumSepolia`, `baseSepolia`, `optimismSepolia`,
  `polygonAmoy`, `holesky`, `bscTestnet`) when `cfg.env === 'testnet' || 'devnet'`,
  so the wagmi connector can `switchChain(11155111)` without rejecting.
- `app/bridge/src/bridge.config.ts` picks `[11155111, 84532, 17000]` as the
  fallback wallet allow-list and `defaultChainId = 11155111` when
  `BRIDGE_ENV=testnet`.
- Visual smoke: `app/server/result-img/testnet-{landing,chains}.png` show the
  TESTNET header chip and 10 testnet chains in the picker.
- Backend deps verified live: `bridge-api.lux.network/api/networks?version=testnet`
  returns 10 active testnet networks; `/api/quote` accepts
  `ETHEREUM_SEPOLIA → LUX_TESTNET`; `mpc.lux.network` returns 200; Lux
  testnet C-Chain RPC at `api.lux-test.network/v1/bc/C/rpc` returns
  chainId `0x17870` (96368); Sepolia public RPC returns chainId `0xaa36a7`
  (11155111).

## Prerequisites

| Need | How to get it |
|---|---|
| EIP-6963 wallet (MetaMask, Rabby, Brave) | Browser extension |
| Sepolia ETH (≥ 0.05 recommended) | https://www.alchemy.com/faucets/ethereum-sepolia or https://sepoliafaucet.com (any modern faucet — usually requires GitHub or Alchemy login) |
| Recipient address on Lux Testnet | Lux Testnet is EVM chain 96368; reuse your MetaMask address — same hex string works as the destination |
| (Optional) Lux Testnet RPC added to MetaMask | RPC `https://api.lux-test.network/v1/chain/C/rpc`, chainId `96368`, symbol `LUX`, explorer `https://explore.lux-test.network/` — lets you confirm the destination balance after settlement |

## Run the app

From the repo root:

```bash
VITE_BRIDGE_ENV=testnet pnpm -C app/bridge dev
```

Vite listens on `http://localhost:3001` (falls back to `:3002` if busy).
The dev proxy forwards `/api/*` to `bridge-api.lux.network` with the
production `Origin` header injected — CORS allow-list passes without
deploying anything.

If you want a `BRIDGE_*` runtime path instead of the build-time
`VITE_BRIDGE_*` path, build the docker image and run it locally with the
operator runbook in `DEPLOY.md` §3 "Smoke-test the image locally", but pass
`-e BRIDGE_ENV=testnet`.

## Walkthrough

Each step has a checkbox that must be true to proceed. Stop at the first
failure and capture the symptom — silent fall-through to mainnet defaults
is the failure mode this doc is designed to catch.

### 1. Render check

Open `http://localhost:3001/` in a fresh incognito window.

- [ ] Header reads `LUX Bridge` + a `TESTNET` chip, and nothing else.
      If the chip says `MAINNET`, the env var didn't reach `import.meta.env`
      — restart Vite with the prefix.
- [ ] Devtools → Network → first request to `/api/networks` carries
      `?version=testnet`. If the query string is absent the SDK regressed —
      see `pkg/bridge/src/app/hooks/useNetworks.ts`.
- [ ] Footer says `Network: testnet`.

### 2. Chain registry

Click the **FROM** chain selector.

- [ ] Dropdown shows at least: `Ethereum Sepolia`, `Base Sepolia`,
      `Holesky Testnet`, `Lux Testnet`, `Zoo Testnet`, `BSC Testnet`,
      `Bitcoin Testnet`, `Solana Devnet`, `Ton Testnet`, `XRP Testnet`.
- [ ] Dropdown does **not** show `Ethereum`, `Base`, `Polygon`, `Arbitrum
      One`, `Optimism`, or any other mainnet entry. If any mainnet row
      appears, the `is_testnet` boundary in `network-mapper.ts` regressed.

Pick **FROM = Ethereum Sepolia, ETH**. Pick **TO = Lux Testnet, LUX**.

### 3. Quote

Enter `0.01` in the **You send** amount field.

- [ ] A receive amount renders within ~1 s in the **You receive** row.
- [ ] Network tab shows `GET /api/quote?source_network=ETHEREUM_SEPOLIA&source_token=ETH&destination_network=LUX_TESTNET&destination_token=LUX&amount=0.01&refuel=0`.
- [ ] No `Failed to fetch` errors in the console. (If you see one, check
      that the dev proxy is still up and the upstream backend is healthy
      at https://bridge-api.lux.network/api/networks?version=testnet.)

### 4. Wallet

Click **Connect Wallet**. The picker (`WalletConnect.tsx` portal modal)
should open.

- [ ] An "Installed" group is shown if you have a browser-extension wallet —
      MetaMask (or whichever) is listed with a "Detected" badge.
- [ ] A "Popular" group lists Coinbase Wallet (and WalletConnect if
      `VITE_WC_PROJECT_ID` is set).

Click MetaMask (or your extension).

- [ ] Wallet popup asks to connect.
- [ ] After approval, the picker closes; the header **Connect Wallet** button
      is replaced by your truncated address.
- [ ] If MetaMask is on a different chain it should prompt to switch to
      **Sepolia (chainId 11155111)**. Approve.

### 5. Submit + sign + settle

Type your own Sepolia address into the **Destination address** field (or
toggle whichever "use connected wallet" affordance the UI exposes).

Click **Bridge** (or whatever the active CTA reads — it should not say
"Source and destination must differ" any longer).

- [ ] MetaMask opens a transaction popup for the Sepolia deposit. The
      `to:` is the bridge deposit address surfaced by the server; the
      value is `0.01 ETH`.
- [ ] Sign the transaction. A tx hash appears in the **Transfers** card
      and is clickable to https://sepolia.etherscan.io/tx/&lt;hash&gt;.
- [ ] The transfer status advances through:
      `user_transfer_pending → bridge_transfer_pending_signing → bridge_transfer_pending_broadcasting → completed`.
      (Approximate phase names — the UI may render them as
      `Depositing → Signing → Broadcasting → Settled` or similar.)
- [ ] The transfer card shows MPC session info:
      `sessionId`, a non-empty `status`, and eventually a `signature` hex.
      This is wired through `pkg/bridge/src/app/lib/mpc-session.ts`
      against `https://mpc.lux.network` (`BRIDGE_MPC_PUBLIC_URL`).
- [ ] When the phase reaches `completed`, the destination address holds
      the corresponding LUX on Lux Testnet — confirm with
      `curl -s -X POST -H "Content-Type: application/json" \
       -d '{"jsonrpc":"2.0","id":1,"method":"eth_getBalance","params":["0xYOUR_ADDR","latest"]}' \
       https://api.lux-test.network/v1/chain/C/rpc`.

### 6. Treasury / fee path (optional)

If `BRIDGE_MPC_PRIVATE_URL` is configured in your env, also verify the
private-cluster fee-collection signature fires on the same transfer.
For most external sign-offs leave this off — Phase 1.3 cares about the
public m-chain quorum only.

## Sign-off

If every box in §1–§5 is ticked:

1. Update `REQUIREMENTS.md` §7 row 1.3 status from `🟡` to `✅`. Add a
   short evidence line under the row: testnet date, Sepolia tx hash,
   Lux Testnet recipient address, MPC session id.
2. Commit with the screenshots from `app/server/result-img/testnet-*.png`
   attached if you captured fresh ones during the run.
3. Phase 1.3 is now closed; Phase 1.4 (`bridge.lux.network` deploy) can
   proceed without this gate.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Header chip says `MAINNET` | `VITE_BRIDGE_ENV` not present at Vite startup, or `window.__ENV.BRIDGE_ENV` got templated wrong | Restart `pnpm dev` with the prefix; check `/__ENV.js` in container mode |
| 22 mainnet chains in the picker | `?version` query param missing from `/api/networks` request | `useNetworks.ts` regressed — check the URL in devtools |
| `chain not configured` from wagmi on connect | `wagmi-config.ts` regressed to mainnet-only viem chain set | Re-add testnet imports + branch on `cfg.env` |
| Quote returns but submit fails with `unknown destination network` | Server expects `LUX_TESTNET`, not `LUX_MAINNET` — possibly a chain-id-to-internal-name mapping issue | Inspect the POST body; the `internalName` comes from the API row, not the bridge-api.ts dead-code map (see `chainIdToInternalName` — currently unused but mis-encoded) |
| MPC session stays at `pending` forever | `mpc.lux.network` unreachable, or `BRIDGE_MPC_PUBLIC_URL` set to something else | `curl -I https://mpc.lux.network/` — should be HTTP 200 |
| Sepolia deposit tx never confirms | Sepolia is congested / your gas was too low | Speed up via MetaMask; bridge picks up on confirmation, not on broadcast |
| Final balance never arrives on Lux Testnet | Bridge backend stuck mid-pipeline | `curl https://bridge-api.lux.network/api/swaps/<id>` for the server's view of the swap state |
