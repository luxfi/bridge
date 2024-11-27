import { ethers } from "hardhat";

async function main() {
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

  