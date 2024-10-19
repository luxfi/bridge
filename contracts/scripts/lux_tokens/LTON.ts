import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const _signer = await ethers.getContractFactory("LuxTON");
  const token = await _signer.deploy();
  console.log("LuxTON address:", await token.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });