import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  /////LuxVault
  const assets = [
    // "0xdAC17F958D2ee523a2206206994597C13D831ec7", //usdt
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", //usdc
    "0x6b175474e89094c44da98b954eedeac495271d0f", //dai
  ];

  const _signer = await ethers.getContractFactory("LuxVault");
  const token = await _signer.deploy(assets);
  await token.waitForDeployment();
  console.log("LuxVault mainnet address:", await token.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
