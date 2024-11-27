import { ethers } from "hardhat";

async function main() {
  const deployerBridge = await ethers.getContractFactory("Bridge");
  const bridge = await deployerBridge.deploy();
  console.log("Bridge address:", await bridge.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

  