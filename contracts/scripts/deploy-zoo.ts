// LUX <-> ZOO bridge corridor deploy — atomic deploy + wire + custody handoff.
//
// Deploys ONE SIDE of the native two-way corridor per invocation and exits
// with the deployer EOA holding ZERO privileges: admin is handed to a Safe
// and the vault is owned by the Bridge. The script ASSERTS this end-state
// on-chain before returning — it will not leave a hot key as god (RED C1)
// nor a Bridge that cannot reach its vault (RED H1).
//
// Corridor model (Bridge.sol carries a `bool vault` flag per claim):
//   LUX (native on Lux)  --lock LuxVault(Lux)--> mint  wLUX (ERC20B) on Zoo   [vault=false claim]
//   wLUX (on Zoo)        --burn-->               unlock LUX from LuxVault(Lux) [vault=true  claim]
//   ZOO (native on Zoo)  --lock Vault(Zoo)-->    mint  wZOO (ERC20B) on Lux   [vault=false claim]
//   wZOO (on Lux)        --burn-->               unlock ZOO from Vault(Zoo)    [vault=true  claim]
//
// Networks (hardhat.config.ts): lux (96369) | zoo (200200) |
//                               luxTestnet (96368) | zooTestnet (200201)
//
// Secrets: PRIVATE_KEY (deployer) MUST come from KMS at runtime — never
// commit or echo it. The deployer is admin only during deploy+wire, then
// is fully de-privileged; final admin is ADMIN_SAFE (the org DAO Safe).
//
// Required env:
//   PRIVATE_KEY       deployer key (KMS-sourced; funded with gas on the target chain)
//   ADMIN_SAFE        the org DAO Safe — receives DEFAULT_ADMIN/ADMIN/PAUSER on Bridge + ERC20B (REQUIRED; no hot-EOA-admin fallback)
//   MPC_ORACLE_ADDR   the 3-of-5 MPC cluster's ECDSA signing address (ORACLE_ROLE)
//   FEE_RECIPIENT     bridge fee collector (the DAO Safe, or the live 0xa5cd...)
// Optional env:
//   FEE_RATE          fee in 1e-4 units (default 100 = 1%); MAX 1000 (10%)
//
// Usage:
//   ZOO_MAINNET_RPC=.. ADMIN_SAFE=0x.. MPC_ORACLE_ADDR=0x.. FEE_RECIPIENT=0x.. \
//     npx hardhat run scripts/deploy-zoo.ts --network zoo
//   LUX_MAINNET_RPC=.. ADMIN_SAFE=0x.. MPC_ORACLE_ADDR=0x.. FEE_RECIPIENT=0x.. \
//     npx hardhat run scripts/deploy-zoo.ts --network lux

import { ethers, network } from "hardhat";

const CORRIDOR: Record<string, { home: string; expectChainId: bigint; wrapped: { name: string; symbol: string; asset: string; yamlNetwork: string } }> = {
  zoo:        { home: "ZOO", expectChainId: 200200n, wrapped: { name: "Lux (Wrapped)", symbol: "wLUX", asset: "LUX", yamlNetwork: "ZOO_MAINNET" } },
  zooTestnet: { home: "ZOO", expectChainId: 200201n, wrapped: { name: "Lux (Wrapped)", symbol: "wLUX", asset: "LUX", yamlNetwork: "ZOO_TESTNET" } },
  lux:        { home: "LUX", expectChainId: 96369n,  wrapped: { name: "Zoo (Wrapped)", symbol: "wZOO", asset: "ZOO", yamlNetwork: "LUX_MAINNET" } },
  luxTestnet: { home: "LUX", expectChainId: 96368n,  wrapped: { name: "Zoo (Wrapped)", symbol: "wZOO", asset: "ZOO", yamlNetwork: "LUX_TESTNET" } },
};

function reqAddr(k: string): string {
  const v = (process.env[k] || "").trim();
  if (!v) throw new Error(`missing required env ${k}`);
  if (!ethers.isAddress(v)) throw new Error(`${k} is not an address: ${v}`);
  return ethers.getAddress(v);
}

async function main() {
  const spec = CORRIDOR[network.name];
  if (!spec) throw new Error(`network '${network.name}' is not a corridor side (use: ${Object.keys(CORRIDOR).join(", ")})`);

  const [deployer] = await ethers.getSigners();
  const safe = reqAddr("ADMIN_SAFE");
  const oracle = reqAddr("MPC_ORACLE_ADDR");
  const feeRecipient = reqAddr("FEE_RECIPIENT");
  const feeRate = BigInt(process.env.FEE_RATE?.trim() || "100"); // 1% default
  if (feeRate > 1000n) throw new Error(`FEE_RATE ${feeRate} > 1000 (10% max)`);
  if (safe.toLowerCase() === deployer.address.toLowerCase()) throw new Error("ADMIN_SAFE must NOT be the deployer EOA — hand admin to a Safe/DAO, never a hot key");

  // Fail closed on a wrong-chain RPC: the chainId feeds the EIP-712 domain
  // AND Bridge's toChainId check — a mismatch would bind sigs to the wrong
  // domain / silently DoS every mint. Verify against a LIVE chain (RED M1).
  const net = await ethers.provider.getNetwork();
  if (net.chainId !== spec.expectChainId) {
    throw new Error(`live chainId ${net.chainId} != expected ${spec.expectChainId} for '${network.name}' — the RPC is pointed at the wrong chain (or the endpoint is dead; see the L2 Zoo-RPC 404). Refusing to deploy.`);
  }
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log(`\n== LUX<->ZOO corridor deploy — side: ${network.name} (home ${spec.home}, chainId ${net.chainId}) ==`);
  console.log(`deployer   : ${deployer.address}  balance ${ethers.formatEther(bal)}`);
  console.log(`admin(Safe): ${safe}`);
  console.log(`mpc oracle : ${oracle}`);
  console.log(`fee        : ${feeRate} (1e-4) -> ${feeRecipient}\n`);
  if (bal === 0n) throw new Error("deployer has zero balance — fund it (gas) before deploying");

  // 1. Deploy with admin=DEPLOYER so the wiring calls (all onlyRole(ADMIN))
  //    succeed; we de-privilege the deployer at the end (steps 5-6).
  const Bridge = await ethers.getContractFactory("Bridge");
  const bridge = await Bridge.deploy("LuxZooBridge", "1", deployer.address, feeRecipient, feeRate);
  await bridge.waitForDeployment();
  const bridgeAddr = await bridge.getAddress();
  console.log(`Bridge      : ${bridgeAddr}`);

  const Vault = await ethers.getContractFactory("LuxVault");
  const vault = await Vault.deploy();
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log(`Vault       : ${vaultAddr}`);

  const ERC20B = await ethers.getContractFactory("ERC20B");
  const wrapped = await ERC20B.deploy(spec.wrapped.name, spec.wrapped.symbol, deployer.address);
  await wrapped.waitForDeployment();
  const wrappedAddr = await wrapped.getAddress();
  console.log(`${spec.wrapped.symbol.padEnd(11)} : ${wrappedAddr}`);

  // 2. Wire (deployer is admin here).
  console.log("\n-- wiring --");
  await (await bridge.setVault(vaultAddr)).wait();
  await (await wrapped.grantBridge(bridgeAddr)).wait();
  // Whitelist BOTH legs: the wrapped token (bridgeMint target) and the
  // native asset address(0) (bridgeWithdraw vault-unlock target — the
  // Bridge now enforces allowedTokens on withdraw too, RED M2).
  await (await bridge.setTokenAllowed(wrappedAddr, true)).wait();
  await (await bridge.setTokenAllowed(ethers.ZeroAddress, true)).wait();
  await (await bridge.setOracle(oracle, true)).wait();
  console.log("setVault / grantBridge / setTokenAllowed(wrapped,native) / setOracle ok");

  // 3. Vault ownership -> Bridge (RED H1). Without this every native
  //    lock/unlock reverts (vault.deposit/withdraw are onlyOwner and the
  //    Bridge calls them as msg.sender), and the deployer would keep a
  //    direct vault-drain path. Done pre-funding so no shares are stranded.
  await (await vault.transferOwnership(bridgeAddr)).wait();
  console.log("vault.transferOwnership(bridge) ok");

  // 4. Grant the Safe every admin role on Bridge + ERC20B.
  const DEFAULT_ADMIN = await bridge.DEFAULT_ADMIN_ROLE();
  const B_ADMIN = await bridge.ADMIN_ROLE();
  const B_PAUSER = await bridge.PAUSER_ROLE();
  const T_ADMIN = await wrapped.ADMIN_ROLE();
  const T_PAUSER = await wrapped.PAUSER_ROLE();
  console.log("\n-- handoff to Safe --");
  for (const [c, r] of [[bridge, DEFAULT_ADMIN], [bridge, B_ADMIN], [bridge, B_PAUSER], [wrapped, DEFAULT_ADMIN], [wrapped, T_ADMIN], [wrapped, T_PAUSER]] as const) {
    await (await c.grantRole(r, safe)).wait();
  }
  console.log("granted DEFAULT_ADMIN/ADMIN/PAUSER to Safe on Bridge + ERC20B");

  // 5. Renounce every deployer role (DEFAULT_ADMIN last so earlier
  //    renounces stay authorized). After this the deployer is powerless.
  for (const [c, r] of [[bridge, B_ADMIN], [bridge, B_PAUSER], [wrapped, T_ADMIN], [wrapped, T_PAUSER], [bridge, DEFAULT_ADMIN], [wrapped, DEFAULT_ADMIN]] as const) {
    await (await c.renounceRole(r, deployer.address)).wait();
  }
  console.log("renounced all deployer roles on Bridge + ERC20B");

  // 6. ASSERT the safe end-state on-chain — refuse to succeed otherwise.
  const checks: [string, boolean][] = [
    ["deployer !Bridge.DEFAULT_ADMIN", await bridge.hasRole(DEFAULT_ADMIN, deployer.address)],
    ["deployer !Bridge.ADMIN",         await bridge.hasRole(B_ADMIN, deployer.address)],
    ["deployer !Bridge.PAUSER",        await bridge.hasRole(B_PAUSER, deployer.address)],
    ["deployer !ERC20B.DEFAULT_ADMIN", await wrapped.hasRole(DEFAULT_ADMIN, deployer.address)],
    ["deployer !ERC20B.ADMIN",         await wrapped.hasRole(T_ADMIN, deployer.address)],
  ];
  const stillHeld = checks.filter(([, held]) => held).map(([n]) => n);
  const safeIsAdmin = await bridge.hasRole(DEFAULT_ADMIN, safe);
  const vaultOwner = await vault.owner();
  if (stillHeld.length) throw new Error(`ABORT: deployer still holds roles: ${stillHeld.join(", ")}`);
  if (!safeIsAdmin) throw new Error("ABORT: Safe is not Bridge DEFAULT_ADMIN after handoff");
  if (vaultOwner.toLowerCase() !== bridgeAddr.toLowerCase()) throw new Error(`ABORT: vault owner ${vaultOwner} != bridge ${bridgeAddr}`);

  console.log(`\n== DONE (${network.name}) — deployer fully de-privileged ==`);
  console.log(`  Bridge=${bridgeAddr}`);
  console.log(`  Vault =${vaultAddr}  (owner: Bridge)`);
  console.log(`  ${spec.wrapped.symbol}  =${wrappedAddr}`);
  console.log(`  admin=Safe(${safe})  oracle=MPC(${oracle})`);
  console.log(`\nPaste into cmd/bridge/networks.*.yaml (uncomment BOTH corridor legs together):\n`);
  console.log(`  - asset: ${spec.wrapped.asset}`);
  console.log(`    name: ${spec.wrapped.asset === "LUX" ? "Lux" : "Zoo"}`);
  console.log(`    decimals: 18`);
  console.log(`    contract: "${wrappedAddr}"`);
  console.log(`    network: ${spec.wrapped.yamlNetwork}`);
  console.log(`\nNEXT: verify the SAME MPC oracle (${oracle}) holds ORACLE_ROLE on the OTHER side's Bridge,`);
  console.log(`and (recommended) route emergencyWithdraw + setOracle through a timelock on the Safe.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
