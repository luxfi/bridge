import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  //LBTC
  const deployerLBTC = await ethers.getContractFactory("LuxBTC");
  const tokenLBTC = await deployerLBTC.deploy();
  console.log("1. LBTC address:", await tokenLBTC.getAddress());
  //LETH
  const deployerLETH = await ethers.getContractFactory("LuxETH");
  const tokenLETH = await deployerLETH.deploy();
  console.log("2. LETH address:", await tokenLETH.getAddress());
  //LUSD
  const deployerLUSD = await ethers.getContractFactory("LuxUSD");
  const tokenLUSD = await deployerLUSD.deploy();
  console.log("3. LUSD address:", await tokenLUSD.getAddress());
  //LBNB
  const deployerLBNB = await ethers.getContractFactory("LuxBNB");
  const tokenLBNB = await deployerLBNB.deploy();
  console.log("4. LBNB address:", await tokenLBNB.getAddress());
  //LPOL
  const deployerLPOL = await ethers.getContractFactory("LuxPOL");
  const tokenLPOL = await deployerLPOL.deploy();
  console.log("5. LPOL address:", await tokenLPOL.getAddress());
  //LCELO
  const deployerLCELO = await ethers.getContractFactory("LuxCELO");
  const tokenLCELO = await deployerLCELO.deploy();
  console.log("6. LCELO address:", await tokenLCELO.getAddress());
  //LFTM
  const deployerLFTM = await ethers.getContractFactory("LuxFTM");
  const tokenLFTM = await deployerLFTM.deploy();
  console.log("7. LFTM address:", await tokenLFTM.getAddress());
  //LXDAI
  const deployerLXDAI = await ethers.getContractFactory("LuxXDAI");
  const tokenLXDAI = await deployerLXDAI.deploy();
  console.log("8. LXDAI address:", await tokenLXDAI.getAddress());
  //LSOL
  const deployerLSOL = await ethers.getContractFactory("LuxSOL");
  const tokenLSOL = await deployerLSOL.deploy();
  console.log("9. LSOL address:", await tokenLSOL.getAddress());
  //LTON
  const deployerLTON = await ethers.getContractFactory("LuxTON");
  const tokenLTON = await deployerLTON.deploy();
  console.log("10. LTON address:", await tokenLTON.getAddress());
  //Bridge
  const deployerBridge = await ethers.getContractFactory("Bridge");
  const bridge = await deployerBridge.deploy();
  console.log("Bridge address:", await bridge.getAddress());
  //LuxVault
  const deployerVault = await ethers.getContractFactory("LuxVault");
  const vault = await deployerVault.deploy();
  console.log("LuxVault address:", await vault.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
