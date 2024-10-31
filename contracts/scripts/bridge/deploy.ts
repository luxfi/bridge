import { ethers } from "hardhat";

async function main() {
  /////Bridge
  const _signer = await ethers.getContractFactory("Bridge");
  const _bridge = await _signer.deploy();
  console.log("Bridge address:", await _bridge.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
