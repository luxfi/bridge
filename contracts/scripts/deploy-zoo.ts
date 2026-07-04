// LUX <-> ZOO bridge corridor deploy.
//
// Deploys ONE SIDE of the native two-way corridor per invocation. Run it
// once against each chain, record the printed addresses, then:
//   1. paste the wrapped-token address into the matching (commented)
//      token entry in cmd/bridge/networks.{mainnet,testnet}.yaml, and
//   2. register the MPC oracle address on BOTH Bridges (already done here
//      via setOracle, but re-verify the SAME oracle address on each side).
//
// Corridor model (Bridge.sol carries a `bool vault` flag per claim):
//   LUX (native on Lux)  --lock in LuxVault(Lux)--> mint  wLUX (ERC20B) on Zoo
//   wLUX (on Zoo)        --burn-->                  unlock LUX from LuxVault(Lux)
//   ZOO (native on Zoo)  --lock in Vault(Zoo)-->    mint  wZOO (ERC20B) on Lux
//   wZOO (on Lux)        --burn-->                  unlock ZOO from Vault(Zoo)
//
// Networks (hardhat.config.ts): lux (96369) | zoo (200200) |
//                               luxTestnet (96368) | zooTestnet (200201)
//
// Secrets: PRIVATE_KEY (deployer) MUST come from KMS at runtime — never
// commit or echo it. The deployer becomes ADMIN on the contracts it
// deploys; hand admin to the org DAO Safe after wiring (transferOwnership
// / grantRole ADMIN + renounce) — see the go-plan.
//
// Required env:
//   PRIVATE_KEY       deployer key (KMS-sourced; funded with gas on the target chain)
//   MPC_ORACLE_ADDR   the 3-of-5 MPC cluster's ECDSA signing address (ORACLE_ROLE)
//   FEE_RECIPIENT     bridge fee collector (e.g. the live 0xa5cd... or the DAO Safe)
// Optional env:
//   FEE_RATE          fee in 1e-4 units (default 100 = 1%); MAX 1000 (10%)
//   ADMIN_ADDR        admin override (default: deployer). Prefer the DAO Safe.
//
// Usage:
//   ZOO_MAINNET_RPC=... MPC_ORACLE_ADDR=0x.. FEE_RECIPIENT=0x.. \
//     npx hardhat run scripts/deploy-zoo.ts --network zoo
//   LUX_MAINNET_RPC=... MPC_ORACLE_ADDR=0x.. FEE_RECIPIENT=0x.. \
//     npx hardhat run scripts/deploy-zoo.ts --network lux

import { ethers, network } from "hardhat";

const CORRIDOR: Record<string, { home: string; wrapped: { name: string; symbol: string; asset: string; yamlNetwork: string } }> = {
  // Deploying ON Zoo → we mint LUX arriving from Lux, so we deploy wLUX.
  zoo:        { home: "ZOO", wrapped: { name: "Lux (Wrapped)", symbol: "wLUX", asset: "LUX", yamlNetwork: "ZOO_MAINNET" } },
  zooTestnet: { home: "ZOO", wrapped: { name: "Lux (Wrapped)", symbol: "wLUX", asset: "LUX", yamlNetwork: "ZOO_TESTNET" } },
  // Deploying ON Lux → we mint ZOO arriving from Zoo, so we deploy wZOO.
  lux:        { home: "LUX", wrapped: { name: "Zoo (Wrapped)", symbol: "wZOO", asset: "ZOO", yamlNetwork: "LUX_MAINNET" } },
  luxTestnet: { home: "LUX", wrapped: { name: "Zoo (Wrapped)", symbol: "wZOO", asset: "ZOO", yamlNetwork: "LUX_TESTNET" } },
};

function reqEnv(k: string): string {
  const v = process.env[k];
  if (!v || v.trim() === "") throw new Error(`missing required env ${k}`);
  return v.trim();
}

async function main() {
  const spec = CORRIDOR[network.name];
  if (!spec) throw new Error(`network '${network.name}' is not a corridor side (use: ${Object.keys(CORRIDOR).join(", ")})`);

  const [deployer] = await ethers.getSigners();
  const admin = process.env.ADMIN_ADDR?.trim() || deployer.address;
  const oracle = reqEnv("MPC_ORACLE_ADDR");
  const feeRecipient = reqEnv("FEE_RECIPIENT");
  const feeRate = BigInt(process.env.FEE_RATE?.trim() || "100"); // 1% default
  if (!ethers.isAddress(oracle)) throw new Error(`MPC_ORACLE_ADDR is not an address: ${oracle}`);
  if (!ethers.isAddress(feeRecipient)) throw new Error(`FEE_RECIPIENT is not an address: ${feeRecipient}`);

  const net = await ethers.provider.getNetwork();
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log(`\n== LUX<->ZOO corridor deploy — side: ${network.name} (home ${spec.home}) ==`);
  console.log(`chainId    : ${net.chainId}`);
  console.log(`deployer   : ${deployer.address}  balance ${ethers.formatEther(bal)}`);
  console.log(`admin      : ${admin}`);
  console.log(`mpc oracle : ${oracle}`);
  console.log(`fee        : ${feeRate} (1e-4) -> ${feeRecipient}\n`);
  if (bal === 0n) throw new Error("deployer has zero balance — fund it (gas) before deploying");

  // 1. Bridge (Teleport v1.1.0): EIP-712 domain name+version pin the
  //    signature domain — keep them stable across a chain's redeploys.
  const Bridge = await ethers.getContractFactory("Bridge");
  const bridge = await Bridge.deploy("LuxZooBridge", "1", admin, feeRecipient, feeRate);
  await bridge.waitForDeployment();
  const bridgeAddr = await bridge.getAddress();
  console.log(`Bridge      : ${bridgeAddr}`);

  // 2. Vault (locks the home-chain native asset). Bridge.setVault casts to
  //    LuxVault; ZooVault is structurally identical — using LuxVault keeps
  //    the concrete type the Bridge integrates with (branding nit noted in
  //    the go-plan: fold to an IVault interface for a Zoo-branded vault).
  const Vault = await ethers.getContractFactory("LuxVault");
  const vault = await Vault.deploy();
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log(`Vault       : ${vaultAddr}`);

  // 3. Wrapped token for the OTHER chain's native asset (ERC20B).
  const ERC20B = await ethers.getContractFactory("ERC20B");
  const wrapped = await ERC20B.deploy(spec.wrapped.name, spec.wrapped.symbol, admin);
  await wrapped.waitForDeployment();
  const wrappedAddr = await wrapped.getAddress();
  console.log(`${spec.wrapped.symbol.padEnd(11)} : ${wrappedAddr}`);

  // 4. Wire roles. If admin != deployer, these ADMIN-gated calls will
  //    revert — run wiring from the admin account, or keep admin=deployer
  //    for the deploy and transfer admin to the DAO Safe afterward.
  console.log("\n-- wiring --");
  await (await bridge.setVault(vaultAddr)).wait();
  console.log("bridge.setVault ok");
  await (await wrapped.grantBridge(bridgeAddr)).wait();
  console.log(`${spec.wrapped.symbol}.grantBridge(bridge) ok`);
  await (await bridge.setTokenAllowed(wrappedAddr, true)).wait();
  console.log("bridge.setTokenAllowed(wrapped) ok");
  await (await bridge.setOracle(oracle, true)).wait();
  console.log("bridge.setOracle(mpc) ok");

  console.log(`\n== DONE (${network.name}) ==`);
  console.log("Record these + paste the wrapped entry into cmd/bridge/networks.*.yaml:\n");
  console.log(`  - asset: ${spec.wrapped.asset}`);
  console.log(`    name: ${spec.wrapped.asset === "LUX" ? "Lux" : "Zoo"}`);
  console.log(`    decimals: 18`);
  console.log(`    contract: "${wrappedAddr}"`);
  console.log(`    network: ${spec.wrapped.yamlNetwork}`);
  console.log(`\n  Bridge=${bridgeAddr}  Vault=${vaultAddr}  ${spec.wrapped.symbol}=${wrappedAddr}`);
  console.log(`  Verify the SAME MPC oracle (${oracle}) holds ORACLE_ROLE on BOTH sides' Bridge.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
