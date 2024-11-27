import { ethers } from "hardhat";

async function main() {

  const mpc = '0xd7D97dA10840fa19b14809434B0F47aBcab12204'
  const signer = '0x086F4aA1a49B193D49e5bBb462E1554Cfb419040'

  //Bridge
  const deployerBridge = await ethers.getContractFactory("Bridge");
  const bridge = await deployerBridge.deploy();
  const bridgeAddress = await bridge.getAddress()
  console.log("Bridge address:", bridgeAddress);
  //LuxVault
  const deployerVault = await ethers.getContractFactory("LuxVault");
  const vault = await deployerVault.deploy();
  const vaultAddress = await vault.getAddress()
  console.log("LuxVault address:", vaultAddress);


  // set vault's owner as bridge
  const txVaultTransferOwnership = await vault.transferOwnership(bridgeAddress)
  await txVaultTransferOwnership.wait()
  console.log(">>vault's ownership transferred", txVaultTransferOwnership.hash)

  // set bridge's vault
  const txBridgeSetVault = await bridge.setVault(vaultAddress)
  await txBridgeSetVault.wait()
  console.log(">>set bridge's vault::", txBridgeSetVault.hash)

  // set bridge's mpc oracle
  const txSetMpcOracle = await bridge.setMPCOracle(mpc)
  await txSetMpcOracle.wait()
  console.log(">>set mpc oracle::", txSetMpcOracle.hash)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

  